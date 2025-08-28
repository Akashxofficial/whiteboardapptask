import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";

const DrawingCanvas = forwardRef(function DrawingCanvas(
  { socket, tool, roomId, shapes: shapesProp, camera },
  ref
) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });
  const maskRef = useRef(null);
  const dprRef = useRef(1);
  const strokeRef = useRef(null); // current stroke being collected

  const [size, setSize] = useState({ w: 0, h: 0 });
  const localStrokesRef = useRef([]); // for local undo/redo
  const redoStackRef = useRef([]);

  // ---------- helpers ----------
  const getShapes = () => shapesProp || window.__WB_SHAPES || [];

  const pointInRect = (px, py, s) =>
    px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h;

  const pointInEllipse = (px, py, s) => {
    const rx = s.w / 2,
      ry = s.h / 2;
    const cx = s.x + rx,
      cy = s.y + ry;
    if (rx <= 0 || ry <= 0) return false;
    const nx = (px - cx) / rx,
      ny = (py - cy) / ry;
    return nx * nx + ny * ny <= 1;
  };

  const hitTest = (x, y) => {
    const shapes = getShapes();
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.type === "rect" && pointInRect(x, y, s)) return s;
      if (s.type === "ellipse" && pointInEllipse(x, y, s)) return s;
    }
    return null;
  };

  const toCanvas = (clientX, clientY) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const toWorld = (sx, sy) => {
    const sc = camera?.scale ?? 1;
    const cx = camera?.x ?? 0;
    const cy = camera?.y ?? 0;
    return { x: (sx - cx) / sc, y: (sy - cy) / sc };
  };

  // ---------- DPI & resize ----------
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const resize = () => {
      const dpr = Math.max(window.devicePixelRatio || 1, 1);
      dprRef.current = dpr;
      const rect = cvs.getBoundingClientRect();
      const cssW = Math.max(1, rect.width);
      const cssH = Math.max(1, rect.height);
      setSize({ w: cssW, h: cssH });

      cvs.width = Math.floor(cssW * dpr);
      cvs.height = Math.floor(cssH * dpr);

      const ctx = cvs.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // Draw in CSS px
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctxRef.current = ctx;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cvs);
    return () => ro.disconnect();
  }, []);

  // ---------- clipping ----------
  const applyMask = (ctx, mask) => {
    if (!mask) return;
    ctx.save();
    ctx.beginPath();
    if (mask.type === "rect") {
      ctx.rect(mask.x, mask.y, mask.w, mask.h);
    } else if (mask.type === "ellipse") {
      const cx = mask.x + mask.w / 2;
      const cy = mask.y + mask.h / 2;
      ctx.ellipse(cx, cy, mask.w / 2, mask.h / 2, 0, 0, Math.PI * 2);
    }
    ctx.clip();
  };

  // ---------- stroke ops ----------
  const beginStroke = (ctx, x, y, color, width, mask) => {
    drawingRef.current = true;
    lastRef.current = { x, y };
    maskRef.current = mask || null;

    ctx.strokeStyle = color || "#111";
    ctx.lineWidth = Math.max(0.5, Number(width) || 2);

    if (maskRef.current) applyMask(ctx, maskRef.current);

    ctx.beginPath();
    ctx.moveTo(x, y);

    // collect stroke points for local undo/redo & server persist
    strokeRef.current = {
      _id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      color: color || "#111",
      width: Math.max(0.5, Number(width) || 2),
      points: [{ x, y }],
      mask: mask ? { ...mask } : null,
    };
  };

  const drawSegment = (ctx, x0, y0, x1, y1, color, width) => {
    ctx.strokeStyle = color || "#111";
    ctx.lineWidth = Math.max(0.5, Number(width) || 2);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    if (strokeRef.current) strokeRef.current.points.push({ x: x1, y: y1 });
  };

  const finishStroke = () => {
    const ctx = ctxRef.current;
    if (ctx && maskRef.current) ctx.restore();

    drawingRef.current = false;

    // If it was just a tap (single point), draw a tiny dot so it appears
    const cur = strokeRef.current;
    if (cur && cur.points.length === 1) {
      const p = cur.points[0];
      ctx.fillStyle = cur.color;
      const r = Math.max(0.5, cur.width / 2);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    maskRef.current = null;

    const completed = strokeRef.current;
    strokeRef.current = null;
    if (completed) {
      localStrokesRef.current.push(completed);
      redoStackRef.current = []; // reset redo on new stroke
    }
    return completed;
  };

  // ---------- Socket: remote draw relay ----------
  useEffect(() => {
    if (!socket) return;

    const remoteStart = ({ stroke }) => {
      const ctx = ctxRef.current;
      if (!ctx || !stroke) return;
      const { x0, y0, color, width, mask } = stroke;
      if (x0 == null || y0 == null) return;
      beginStroke(ctx, x0, y0, color, width, mask || null);
    };

    const remoteMove = ({ stroke }) => {
      const ctx = ctxRef.current;
      if (!ctx || !stroke) return;
      const { x0, y0, x1, y1, color, width } = stroke;
      if ([x0, y0, x1, y1].some((v) => v == null)) return;
      drawSegment(ctx, x0, y0, x1, y1, color, width);
      lastRef.current = { x: x1, y: y1 };
    };

    const remoteEnd = () => finishStroke();

    const onClear = () => {
      const ctx = ctxRef.current;
      if (ctx) ctx.clearRect(0, 0, size.w, size.h);
    };

    socket.on("draw-start", remoteStart);
    socket.on("draw-move", remoteMove);
    socket.on("draw-end", remoteEnd);
    socket.on("clear-canvas", onClear);

    return () => {
      socket.off("draw-start", remoteStart);
      socket.off("draw-move", remoteMove);
      socket.off("draw-end", remoteEnd);
      socket.off("clear-canvas", onClear);
    };
  }, [socket, size.w, size.h]);

  // ---------- Mouse / Touch ----------
  const onMouseDown = (e) => {
    if (!ctxRef.current || tool?.mode !== "draw") return;
    e.preventDefault();
    e.stopPropagation();

    const { x, y } = toCanvas(e.clientX, e.clientY);
    const shape = hitTest(x, y);
    const mask =
      shape && (shape.type === "rect" || shape.type === "ellipse")
        ? {
            id: shape._id,
            type: shape.type,
            x: shape.x,
            y: shape.y,
            w: shape.w,
            h: shape.h,
          }
        : null;

    beginStroke(ctxRef.current, x, y, tool.color, tool.width, mask);
    socket?.emit("draw-start", {
      roomId,
      stroke: { x0: x, y0: y, color: tool.color, width: tool.width, mask },
    });
  };

  const onMouseMove = (e) => {
    if (!drawingRef.current || tool?.mode !== "draw" || !ctxRef.current) return;
    const { x, y } = toCanvas(e.clientX, e.clientY);
    const { x: x0, y: y0 } = lastRef.current;

    drawSegment(ctxRef.current, x0, y0, x, y, tool.color, tool.width);

    // fire a minimap segment in *world* coordinates (optional)
    if (camera) {
      const w0 = toWorld(x0, y0);
      const w1 = toWorld(x, y);
      window.dispatchEvent(
        new CustomEvent("wb:minimap-seg", {
          detail: {
            x0: w0.x,
            y0: w0.y,
            x1: w1.x,
            y1: w1.y,
            color: tool.color,
            width: tool.width,
          },
        })
      );
    }

    lastRef.current = { x, y };
    socket?.emit("draw-move", {
      roomId,
      stroke: { x0, y0, x1: x, y1: y, color: tool.color, width: tool.width },
    });
  };

  const onMouseUp = () => {
    if (!drawingRef.current) return;
    const completed = finishStroke();
    socket?.emit("draw-end", { roomId, stroke: completed });
  };

  const onTouchStart = (e) => {
    if (!ctxRef.current || tool?.mode !== "draw") return;
    const t = e.touches?.[0];
    if (!t) return;
    e.preventDefault();

    const { x, y } = toCanvas(t.clientX, t.clientY);
    const shape = hitTest(x, y);
    const mask =
      shape && (shape.type === "rect" || shape.type === "ellipse")
        ? {
            id: shape._id,
            type: shape.type,
            x: shape.x,
            y: shape.y,
            w: shape.w,
            h: shape.h,
          }
        : null;

    beginStroke(ctxRef.current, x, y, tool.color, tool.width, mask);
    socket?.emit("draw-start", {
      roomId,
      stroke: { x0: x, y0: y, color: tool.color, width: tool.width, mask },
    });
  };

  const onTouchMove = (e) => {
    if (!drawingRef.current || tool?.mode !== "draw" || !ctxRef.current) return;
    const t = e.touches?.[0];
    if (!t) return;
    e.preventDefault();

    const { x, y } = toCanvas(t.clientX, t.clientY);
    const { x: x0, y: y0 } = lastRef.current;

    drawSegment(ctxRef.current, x0, y0, x, y, tool.color, tool.width);

    if (camera) {
      const w0 = toWorld(x0, y0);
      const w1 = toWorld(x, y);
      window.dispatchEvent(
        new CustomEvent("wb:minimap-seg", {
          detail: {
            x0: w0.x,
            y0: w0.y,
            x1: w1.x,
            y1: w1.y,
            color: tool.color,
            width: tool.width,
          },
        })
      );
    }

    lastRef.current = { x, y };
    socket?.emit("draw-move", {
      roomId,
      stroke: { x0, y0, x1: x, y1: y, color: tool.color, width: tool.width },
    });
  };

  const onTouchEnd = () => onMouseUp();

  const onContextMenu = (e) => {
    if (tool?.mode === "draw") e.preventDefault();
  };

  // ---------- local redraw (for undo/redo) ----------
  const redrawAll = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, size.w, size.h);

    for (const s of localStrokesRef.current) {
      if (s.mask) applyMask(ctx, s.mask);
      const pts = s.points || [];
      if (pts.length === 1) {
        // draw dot
        ctx.fillStyle = s.color || "#111";
        const r = Math.max(0.5, (s.width || 2) / 2);
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        for (let i = 1; i < pts.length; i++) {
          const p0 = pts[i - 1];
          const p1 = pts[i];
          drawSegment(ctx, p0.x, p0.y, p1.x, p1.y, s.color, s.width);
        }
      }
      if (s.mask) ctx.restore();
    }
  };

  // ---------- expose simple undo/redo ----------
  useImperativeHandle(ref, () => ({
    undoLastStroke: () => {
      if (localStrokesRef.current.length === 0) return;
      const s = localStrokesRef.current.pop();
      redoStackRef.current.push(s);
      redrawAll();
    },
    redoLastStroke: () => {
      if (redoStackRef.current.length === 0) return;
      const s = redoStackRef.current.pop();
      localStrokesRef.current.push(s);
      redrawAll();
    },
    clearLocal: () => {
      localStrokesRef.current = [];
      redoStackRef.current = [];
      const ctx = ctxRef.current;
      if (ctx) ctx.clearRect(0, 0, size.w, size.h);
    },
    hasUndo: () => localStrokesRef.current.length > 0,
    hasRedo: () => redoStackRef.current.length > 0,
  }));

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute", // overlay inside the board container
        inset: 0,
        width: "100%",
        height: "100%",
        background: "transparent",
        cursor: tool?.mode === "draw" ? "crosshair" : "default",
        zIndex: 2, // under cursors, above world
        pointerEvents: tool?.mode === "draw" ? "auto" : "none",
        touchAction: "none",
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onContextMenu={onContextMenu}
    />
  );
});

export default DrawingCanvas;
