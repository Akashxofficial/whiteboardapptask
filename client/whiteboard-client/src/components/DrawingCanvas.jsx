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
  const throttleRef = useRef(null); // For throttling drawing events
  const drawingQueueRef = useRef([]); // Queue for pending drawing events
  const rectRef = useRef(null); // Cache canvas bounding rect
  const rectCacheTimeRef = useRef(0); // When rect was last cached

  const [size, setSize] = useState({ w: 0, h: 0 });
  const localStrokesRef = useRef([]); // for local undo/redo
  const redoStackRef = useRef([]);

  // ---------- helpers ----------
  const getShapes = () => shapesProp || window.__WB_SHAPES || [];

  const throttledEmit = (data) => {
    // Add to queue to ensure no events are lost
    drawingQueueRef.current.push(data);

    // Use a shorter throttle interval to prevent losing drawing segments
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
    }
    throttleRef.current = setTimeout(() => {
      throttleRef.current = null;
      // Send all queued events
      const queue = [...drawingQueueRef.current];
      drawingQueueRef.current = [];
      queue.forEach(eventData => {
        socket?.emit("draw-move", eventData);
      });
    }, 8); // ~120fps - faster updates for smoother drawing
  };

  const flushDrawingQueue = () => {
    // Send any remaining queued events
    if (drawingQueueRef.current.length > 0) {
      const queue = [...drawingQueueRef.current];
      drawingQueueRef.current = [];
      queue.forEach(eventData => {
        socket?.emit("draw-move", eventData);
      });
    }
  };

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
    if (!shapes || shapes.length === 0) return null;

    // Quick bounds check - if point is outside all shapes' combined bounds, return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of shapes) {
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + s.w);
      maxY = Math.max(maxY, s.y + s.h);
    }

    if (x < minX || x > maxX || y < minY || y > maxY) {
      return null;
    }

    // Test shapes from front to back (reverse order since shapes are drawn in order)
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      // Quick bounding box check first
      if (x < s.x || x > s.x + s.w || y < s.y || y > s.y + s.h) {
        continue;
      }
      if (s.type === "rect" && pointInRect(x, y, s)) return s;
      if (s.type === "ellipse" && pointInEllipse(x, y, s)) return s;
    }
    return null;
  };

  const toCanvas = (clientX, clientY) => {
    const now = Date.now();
    // Cache rect for 100ms to avoid expensive DOM queries
    if (!rectRef.current || now - rectCacheTimeRef.current > 100) {
      const canvas = canvasRef.current;
      if (canvas) {
        rectRef.current = canvas.getBoundingClientRect();
        rectCacheTimeRef.current = now;
      }
    }
    const rect = rectRef.current;
    if (!rect) return { x: 0, y: 0 };
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

    let resizeTimeout;
    const resize = () => {
      // Debounce resize events to avoid excessive canvas operations
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
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

        // Clear rect cache when canvas resizes
        rectRef.current = null;
        rectCacheTimeRef.current = 0;
      }, 100);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cvs);
    return () => {
      clearTimeout(resizeTimeout);
      ro.disconnect();
    };
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

    // Cache stroke properties to avoid repeated context changes
    const strokeColor = color || "#111";
    const strokeWidth = Math.max(0.5, Number(width) || 2);

    if (ctx.strokeStyle !== strokeColor) ctx.strokeStyle = strokeColor;
    if (ctx.lineWidth !== strokeWidth) ctx.lineWidth = strokeWidth;

    if (maskRef.current) applyMask(ctx, maskRef.current);

    ctx.beginPath();
    ctx.moveTo(x, y);

    strokeRef.current = {
      _id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: "path", // ✅ ensure it's a path shape
      color: strokeColor,
      width: strokeWidth,
      points: [{ x, y }],
      mask: mask ? { ...mask } : null,
    };
  };

  const drawSegment = (ctx, x0, y0, x1, y1, color, width) => {
    // Only update context properties if they changed
    const newColor = color || "#111";
    const newWidth = Math.max(0.5, Number(width) || 2);

    if (ctx.strokeStyle !== newColor) ctx.strokeStyle = newColor;
    if (ctx.lineWidth !== newWidth) ctx.lineWidth = newWidth;

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
      redoStackRef.current = [];
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
// ----- add this directly after socket.on("clear-canvas", onClear); -----
const replayDrawing = ({ strokes }) => {
  const ctx = ctxRef.current;
  if (!ctx || !Array.isArray(strokes)) return;

  for (const s of strokes) {
    try {
      if (!s) continue;

      // format A: full stroke with points array
      if (Array.isArray(s.points) && s.points.length > 0) {
        const pts = s.points;
        beginStroke(ctx, pts[0].x, pts[0].y, s.color || "#111", s.width || 2, s.mask || null);
        for (let i = 1; i < pts.length; i++) {
          drawSegment(ctx, pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y, s.color || "#111", s.width || 2);
        }
        finishStroke();
        continue;
      }

      // format B: small segments (x0,y0,x1,y1)
      if (s.x0 != null && s.x1 != null) {
        beginStroke(ctx, s.x0, s.y0, s.color || "#111", s.width || 2, s.mask || null);
        drawSegment(ctx, s.x0, s.y0, s.x1, s.y1, s.color || "#111", s.width || 2);
        finishStroke();
        continue;
      }
    } catch (err) {
      console.warn("replayDrawing error for stroke", err);
    }
  }
};

    socket.on("drawing:replay", replayDrawing);
    // replay strokes (server already emits this on join, but add safe handler)
const handleDrawingReplay = ({ roomId: rid, strokes }) => {
  if (!Array.isArray(strokes) || strokes.length === 0) return;
  // convert strokes -> shapes (same convention server uses)
  const shapesFromStrokes = strokes.map(stroke => ({
    _id: stroke._id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: "path",
    points: stroke.points || stroke.pointsArray || [], // adapt to your stroke format
    color: stroke.color || "#111",
    width: stroke.width || 2,
    author: stroke.author || null,
    // optional: bounding box - compute or leave undefined
  })).filter(s => Array.isArray(s.points) && s.points.length > 0);

  // merge into current shapes (avoid dupes)
  setShapes(prev => {
    const map = new Map();
    (prev || []).forEach(p => { if (p && p._id) map.set(p._id, p); });
    shapesFromStrokes.forEach(s => { if (s && s._id) map.set(s._id, s); });
    return Array.from(map.values());
  });
};

socket.on("drawing:replay", handleDrawingReplay);


    return () => {
      socket.off("draw-start", remoteStart);
      socket.off("draw-move", remoteMove);
      socket.off("draw-end", remoteEnd);
      socket.off("clear-canvas", onClear);
    };
  }, [socket, size.w, size.h]);

  // ---------- Mouse / Touch ----------
  // ---------- Pointer events (replace mouse/touch handlers) ----------
const onPointerDown = (e) => {
  if (!ctxRef.current || tool?.mode !== "draw") return;
  e.preventDefault();
  e.stopPropagation();

  // ensure pointer capture so touch/pen stays with canvas
  try {
    canvasRef.current?.setPointerCapture?.(e.pointerId);
  } catch (err) {}

  const { x, y } = toCanvas(e.clientX, e.clientY);
  const shape = hitTest(x, y);
  const mask =
    shape && (shape.type === "rect" || shape.type === "ellipse")
      ? { id: shape._id, type: shape.type, x: shape.x, y: shape.y, w: shape.w, h: shape.h }
      : null;

  beginStroke(ctxRef.current, x, y, tool.color, tool.width, mask);

  // include stroke id so server can store/replay properly
  socket?.emit("draw-start", {
    roomId,
    stroke: {
      _id: strokeRef.current?._id,
      x0: x,
      y0: y,
      color: tool.color,
      width: tool.width,
      mask,
    },
  });
};

const onPointerMove = (e) => {
  if (!drawingRef.current || tool?.mode !== "draw" || !ctxRef.current) return;
  e.preventDefault();

  const { x, y } = toCanvas(e.clientX, e.clientY);
  const { x: x0, y: y0 } = lastRef.current;

  const dx = x - x0;
  const dy = y - y0;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

  drawSegment(ctxRef.current, x0, y0, x, y, tool.color, tool.width);

  if (camera) {
    const w0 = toWorld(x0, y0);
    const w1 = toWorld(x, y);
    window.dispatchEvent(
      new CustomEvent("wb:minimap-seg", { detail: { x0: w0.x, y0: w0.y, x1: w1.x, y1: w1.y, color: tool.color, width: tool.width } })
    );
  }

  lastRef.current = { x, y };

  // include stroke id on move events so server can associate segments
  const strokeId = strokeRef.current?._id;
  throttledEmit({
    roomId,
    stroke: { _id: strokeId, x0, y0, x1: x, y1: y, color: tool.color, width: tool.width },
  });
};

const onPointerUp = (e) => {
  if (!drawingRef.current) return;
  e.preventDefault();

  // release pointer capture
  try {
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
  } catch (err) {}

  if (throttleRef.current) {
    clearTimeout(throttleRef.current);
    throttleRef.current = null;
  }
  flushDrawingQueue();

  const completed = finishStroke();

  // send final last segment if possible (keeps other peers smooth)
  if (completed && completed.points && completed.points.length > 1) {
    const lastPoints = completed.points.slice(-2);
    if (lastPoints.length === 2) {
      const [prevPoint, lastPoint] = lastPoints;
      socket?.emit("draw-move", {
        roomId,
        stroke: {
          _id: completed._id,
          x0: prevPoint.x,
          y0: prevPoint.y,
          x1: lastPoint.x,
          y1: lastPoint.y,
          color: completed.color,
          width: completed.width,
        },
      });
    }
  }

  // final commit
  socket?.emit("draw-end", { roomId, stroke: completed });

  // also persist as a shape for immediate availability (undo/history)
 // ✅ FIX: emit shape:add for undo/redo history
if (completed) {
  socket?.emit("shape:add", { roomId, shape: { ...completed, type: "path" } });
}

};


  const onContextMenu = (e) => {
    if (tool?.mode === "draw") e.preventDefault();
  };

  // ---------- local redraw (for undo/redo) ----------
  const redrawAll = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    // Use requestAnimationFrame for smoother rendering
    requestAnimationFrame(() => {
      ctx.clearRect(0, 0, size.w, size.h);

      // Batch canvas operations for better performance
      ctx.save();

      // Cache current context properties to avoid unnecessary changes
      let currentStrokeStyle = ctx.strokeStyle;
      let currentLineWidth = ctx.lineWidth;
      let currentFillStyle = ctx.fillStyle;

      for (const s of localStrokesRef.current) {
        if (s.mask) applyMask(ctx, s.mask);
        const pts = s.points || [];

        if (pts.length === 1) {
          // Single point - draw as circle
          const newFillStyle = s.color || "#111";
          if (currentFillStyle !== newFillStyle) {
            ctx.fillStyle = newFillStyle;
            currentFillStyle = newFillStyle;
          }
          const r = Math.max(0.5, (s.width || 2) / 2);
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
          ctx.fill();
        } else if (pts.length > 1) {
          // Multiple points - draw as connected line
          const newStrokeStyle = s.color || "#111";
          const newLineWidth = Math.max(0.5, s.width || 2);

          if (currentStrokeStyle !== newStrokeStyle) {
            ctx.strokeStyle = newStrokeStyle;
            currentStrokeStyle = newStrokeStyle;
          }
          if (currentLineWidth !== newLineWidth) {
            ctx.lineWidth = newLineWidth;
            currentLineWidth = newLineWidth;
          }

          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.stroke();
        }
        if (s.mask) ctx.restore();
      }
      ctx.restore();
    });
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
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        background: "transparent",
        cursor: tool?.mode === "draw" ? "crosshair" : "default",
        zIndex: 2,
        pointerEvents: tool?.mode === "draw" ? "auto" : "none",
        touchAction: "none",
      }}
     onPointerDown={onPointerDown}
onPointerMove={onPointerMove}
onPointerUp={onPointerUp}
onPointerCancel={onPointerUp}
onPointerLeave={onPointerUp}

      onContextMenu={onContextMenu}
    />
  );
});

export default DrawingCanvas;
