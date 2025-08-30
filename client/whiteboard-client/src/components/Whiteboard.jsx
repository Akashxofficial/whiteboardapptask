// client/src/components/Whiteboard.jsx
import React, { useEffect, useRef, useState, useCallback, useMemo, memo } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import DrawingCanvas from "./DrawingCanvas";
import Toolbar from "./Toolbar";
import UserCursors from "./UserCursors";
import toast, { Toaster } from "react-hot-toast";

// Optimized Shape Renderer Component
const ShapeRenderer = memo(({
  shapes,
  selectedIds,
  tool,
  roomId,
  socket,
  onShapeMouseDown,
  onShapeTouchStart,
  setSelectedIds,
  setShapes,
  onResize
}) => {
  // Memoize expensive computations
  const visibleShapes = useMemo(() => {
    if (!shapes || shapes.length === 0) return [];

    // For performance, limit rendering to reasonable number of shapes
    // In a real app, you'd implement proper virtualization
    const MAX_SHAPES = 500;
    return shapes.length > MAX_SHAPES ? shapes.slice(-MAX_SHAPES) : shapes;
  }, [shapes]);

  const handleDelete = useCallback((e, shapeId) => {
    e.stopPropagation();
    socket?.emit("shape:delete", { roomId, id: shapeId });
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.delete(shapeId);
      return n;
    });
  }, [socket, roomId, setSelectedIds]);

  const handleTextChange = useCallback((shapeId, text) => {
    setShapes(prev =>
      prev.map(x => x._id === shapeId ? { ...x, text } : x)
    );
    socket?.emit("shape:update", {
      roomId,
      id: shapeId,
      patch: { text },
    });
  }, [setShapes, socket, roomId]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        pointerEvents: tool.mode === "select" ? "auto" : "none",
        touchAction: "none",
      }}
    >
      {visibleShapes.map((s) => {
        const selected = selectedIds.has(s._id);
        return (
          <ShapeItem
            key={s._id}
            shape={s}
            selected={selected}
            tool={tool}
            onMouseDown={onShapeMouseDown}
            onTouchStart={onShapeTouchStart}
            onDelete={handleDelete}
            onTextChange={handleTextChange}
            onResize={onResize}
          />
        );
      })}
    </div>
  );
});

// Individual Shape Component - Memoized for performance
const ShapeItem = memo(({
  shape: s,
  selected,
  tool,
  onMouseDown,
  onTouchStart,
  onDelete,
  onTextChange,
  onResize
}) => {
  const handleTextChange = useCallback((e) => {
    onTextChange(s._id, e.target.value);
  }, [s._id, onTextChange]);

  const handleDelete = useCallback((e) => {
    onDelete(e, s._id);
  }, [s._id, onDelete]);

  const handleResize = useCallback((e, corner) => {
    e.stopPropagation();
    onResize(e, s, corner);
  }, [s, onResize]);

  return (
    <div
      style={{
        position: "absolute",
        left: s.x,
        top: s.y,
        width: s.w,
        height: s.h,
        transform: `rotate(${s.rot || 0}deg)`,
        border:
          s.type === "rect" || s.type === "ellipse"
            ? `1px solid ${s.color || "#111"}`
            : "none",
        background:
          s.type === "note"
            ? s.color || "#ffef8a"
            : "transparent",
        borderRadius:
          s.type === "ellipse" ? "50%" : s.type === "note" ? 6 : 2,
        boxShadow: selected
          ? "0 0 0 2px #4c9ffe, 0 2px 6px rgba(0,0,0,.08)"
          : s.type === "note"
          ? "0 2px 6px rgba(0,0,0,.08)"
          : "none",
        padding: s.type === "note" ? 8 : 0,
        pointerEvents: tool.mode === "select" ? "auto" : "none",
        userSelect: "none",
        cursor: tool.mode === "select" ? "move" : "crosshair",
        touchAction: "none",
      }}
      onMouseDown={(e) => onMouseDown(e, s._id)}
      onTouchStart={(e) => onTouchStart(e, s._id)}
    >
      {/* Delete Button */}
      {tool.mode === "select" && (
        <button
          onClick={handleDelete}
          title="Delete"
          style={{
            position: "absolute",
            right: 4,
            top: 4,
            border: "none",
            background: "rgba(0,0,0,.06)",
            borderRadius: 4,
            padding: "2px 6px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          ×
        </button>
      )}

      {/* Sticky note text */}
      {s.type === "note" && tool.mode === "select" && (
        <textarea
          value={s.text || ""}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onChange={handleTextChange}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            resize: "none",
            fontSize: 14,
          }}
        />
      )}

      {/* Resize handles */}
      {selected &&
        (s.type === "rect" || s.type === "ellipse") &&
        tool.mode === "select" && (
          <>
            <Handle
              left={-4}
              top={-4}
              cursor="nwse-resize"
              onMouseDown={(e) => handleResize(e, "nw")}
            />
            <Handle
              left={s.w - 4}
              top={-4}
              cursor="nesw-resize"
              onMouseDown={(e) => handleResize(e, "ne")}
            />
            <Handle
              left={-4}
              top={s.h - 4}
              cursor="nesw-resize"
              onMouseDown={(e) => handleResize(e, "sw")}
            />
            <Handle
              left={s.w - 4}
              top={s.h - 4}
              cursor="nwse-resize"
              onMouseDown={(e) => handleResize(e, "se")}
            />
          </>
        )}
    </div>
  );
});

// Optimized Handle Component
const Handle = memo(({ left, top, cursor, onMouseDown }) => (
  <div
    onMouseDown={onMouseDown}
    style={{
      position: "absolute",
      left,
      top,
      width: 8,
      height: 8,
      background: "#fff",
      border: "1px solid #4c9ffe",
      borderRadius: 2,
      cursor,
      pointerEvents: "auto",
    }}
  />
));

function Whiteboard() {
  const { roomId } = useParams();

  // --- connection / board state ---
  const [users, setUsers] = useState(1);
  const [tool, setTool] = useState({ mode: "draw", color: "black", width: 2 });
  const [status, setStatus] = useState("🔴 Disconnected");
  const [isReady, setIsReady] = useState(false);
  const [shapes, setShapes] = useState([]);
  const [isLoadingShapes, setIsLoadingShapes] = useState(false);
  const [connectionStep, setConnectionStep] = useState("Connecting...");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const socketRef = useRef(null); // socket connection
  const myIdRef = useRef(null);
  const dragRef = useRef(null);
  const boardRef = useRef(null);

  // mirror shapes in ref so wrappers read fresh value
  const shapesRef = useRef(shapes);
  useEffect(() => { shapesRef.current = shapes; }, [shapes]);

  // --- presence / cursors / activity ---
  const [presence, setPresence] = useState({});
  const [activity, setActivity] = useState({});
  const nameRef = useRef(localStorage.getItem("wb:name") || "Guest");
  const colorRef = useRef(
    localStorage.getItem("wb:color") ||
      `hsl(${Math.floor(Math.random() * 360)} 90% 55%)`
  );

  // --- camera / pan / zoom ---
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const spaceDownRef = useRef(false);
  const panningRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    ox: 0,
    oy: 0,
  });

  // --- undo/redo stacks (per user) ---
  const undoRef = useRef([]); // push {do:fn, undo:fn}
  const redoRef = useRef([]);
  // 🔧 history re-render ticker
  const [historyVer, setHistoryVer] = useState(0);
  const bumpHistory = () => setHistoryVer(v => v + 1);

  const pushCmd = (cmd) => {
    undoRef.current.push(cmd);
    redoRef.current = [];
    bumpHistory();
  };
  const undo = () => {
    const cmd = undoRef.current.pop();
    if (!cmd) return;
    try {
      cmd.undo();
      redoRef.current.push(cmd);
    } catch (e) {
      console.error("Undo failed", e);
    } finally {
      bumpHistory();
    }
  };
  const redo = () => {
    const cmd = redoRef.current.pop();
    if (!cmd) return;
    try {
      cmd.do();
      undoRef.current.push(cmd);
    } catch (e) {
      console.error("Redo failed", e);
    } finally {
      bumpHistory();
    }
  };

  // ---- local shape helpers (optimistic) ----
  const applyLocalUpdate = (id, patch) => {
    setShapes((prev) => prev.map((s) => (s._id === id ? { ...s, ...patch } : s)));
  };
  const applyLocalDelete = (id) => {
    setShapes((prev) => prev.filter((s) => s._id !== id));
  };
  const applyLocalAdd = (shape) => {
    setShapes((prev) => (prev.some(x => x._id === shape._id) ? prev : [...prev, shape]));
  };

  /* ---------------- Socket setup ---------------- */
  useEffect(() => {
    const SOCKET_URL =
      import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: 5, // Limit reconnection attempts
      reconnectionDelay: 1000,
      reconnectionDelayMax: 3000, // Reduced from 5000
      timeout: 15000, // Reduced from 20000
      forceNew: true,
      autoConnect: true,
    });
    socketRef.current = socket;

    // ======= emit wrapper: add/delete/clear -> optimistic + history =======
    const performAdd = (shape) => {
      applyLocalAdd(shape);
      socket._emit("shape:add", { roomId, shape });
    };
    const performDelete = (id) => {
      applyLocalDelete(id);
      socket._emit("shape:delete", { roomId, id });
    };
    const performClear = () => {
      setShapes([]);
      socket._emit("clear-canvas", { roomId });
    };

    socket._emit = socket.emit.bind(socket);
    socket.emit = (event, payload) => {
      if (event === "shape:add" && payload?.shape) {
        const shape = payload.shape;
        pushCmd({
          do: () => performAdd(shape),
          undo: () => performDelete(shape._id),
        });
        performAdd(shape);
        return;
      }
      if (event === "shape:delete" && payload?.id) {
        const snap = shapesRef.current.find((x) => x._id === payload.id);
        if (snap) {
          pushCmd({
            do: () => performDelete(snap._id),
            undo: () => performAdd(snap),
          });
          performDelete(snap._id);
          return;
        }
      }
      if (event === "clear-canvas") {
        const before = [...shapesRef.current];
        pushCmd({
          do: () => performClear(),
          undo: () => {
            setShapes(before);
            // resync others
            for (const sh of before) socket._emit("shape:add", { roomId, shape: sh });
          },
        });
        performClear();
        return;
      }
      // default passthrough
      socket._emit(event, payload);
    };
    // ===============================================================

    const onConnect = () => {
      myIdRef.current = socket.id;
      setStatus("🟢 Connected");
      setConnectionStep("Joining room...");
      socket.emit("join-room", roomId);
      socket.emit("presence:join", {
        roomId,
        name: nameRef.current,
        color: colorRef.current,
      });
    };
    const onDisconnect = () => setStatus("🔴 Disconnected");
    const onUserCount = (count) => {
      setUsers(count);
      setIsReady(true);
      setConnectionStep("Loading content...");
      setIsLoadingShapes(true);
      // Request shapes lazily after room is joined
      socket.emit("shapes:request", { roomId });
      toast.success(`👥 ${count} user${count > 1 ? "s" : ""} in room`);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("user-count", onUserCount);

    // shapes sync
    const initShapes = (list) => {
      setShapes(list || []);
      if (list && list.length > 0) {
        setConnectionStep("Room ready!");
        setTimeout(() => setConnectionStep(""), 2000);
      }
    };
    const added = (s) =>
      setShapes((p) => (p.some((x) => x._id === s._id) ? p : [...p, s]));
    const updated = ({ id, patch }) =>
      setShapes((p) => p.map((x) => (x._id === id ? { ...x, ...patch } : x)));
    const deleted = ({ id }) =>
      setShapes((p) => p.filter((x) => x._id !== id));

    // lazy loading response
    const onShapesLoaded = (loadedShapes) => {
      setShapes(loadedShapes || []);
      setIsLoadingShapes(false);
      setConnectionStep("Room ready!");
      setTimeout(() => setConnectionStep(""), 2000);
    };

    socket.on("shapes:init", initShapes);
    socket.on("shape:added", added);
    socket.on("shape:updated", updated);
    socket.on("shape:deleted", deleted);
    socket.on("shapes:loaded", onShapesLoaded);

    // clear-canvas broadcast from others
    socket.on("clear-canvas", () => setShapes([]));

    // presence
    const onPresenceState = (map) => setPresence(map || {});
    const onPresenceUpdate = ({ id, patch }) =>
      setPresence((p) => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));
    const onPresenceLeave = (id) =>
      setPresence((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });

    socket.on("presence:state", onPresenceState);
    socket.on("presence:update", onPresenceUpdate);
    socket.on("presence:leave", onPresenceLeave);

    // activity (drawing/typing) — server broadcast
    const onAct = ({ id, patch }) =>
      setActivity((prev) => ({
        ...prev,
        [id]: { ...(prev[id] || {}), ...patch, ts: Date.now() },
      }));
    socket.on("activity:update", onAct);

    // camera (merge if not panning)
    const onCam = ({ patch }) => {
      if (!panningRef.current.active) {
        setCamera((c) => ({ ...c, ...patch }));
      }
    };
    socket.on("camera:update", onCam);

    const handleBeforeUnload = () => {
      try {
        socket.disconnect();
      } catch {}
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("user-count", onUserCount);
      socket.off("shapes:init", initShapes);
      socket.off("shape:added", added);
      socket.off("shape:updated", updated);
      socket.off("shape:deleted", deleted);
      socket.off("presence:state", onPresenceState);
      socket.off("presence:update", onPresenceUpdate);
      socket.off("presence:leave", onPresenceLeave);
      socket.off("activity:update", onAct);
      socket.off("camera:update", onCam);
      socket.off("clear-canvas");
    };
  }, [roomId]);

  // expose shapes globally so DrawingCanvas can clip inside rect/ellipse
  useEffect(() => {
    window.__WB_SHAPES = shapes;
  }, [shapes]);

  // idle detection + heartbeat (presence) - optimized
  const bumpPresence = useCallback(() => {
    const s = socketRef.current;
    if (!s) return;
    s.emit("presence:update", {
      roomId,
      patch: { lastActive: Date.now() },
    });
  }, [roomId]);

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;
    let idleTimer;
    let isIdle = false;
    let heartbeatInterval;

    const bump = () => {
      if (!s) return;
      if (isIdle) {
        isIdle = false;
        s.emit("presence:update", { roomId, patch: { isIdle: false } });
      }
      bumpPresence();
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        isIdle = true;
        s.emit("presence:update", { roomId, patch: { isIdle: true } });
      }, 30000);
    };

    const events = ["mousemove", "keydown", "mousedown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    heartbeatInterval = setInterval(bump, 10000);
    bump();

    return () => {
      clearInterval(heartbeatInterval);
      events.forEach((e) => window.removeEventListener(e, bump));
      clearTimeout(idleTimer);
    };
  }, [roomId, bumpPresence]);

  /* ---------------- Selection helpers - OPTIMIZED ---------------- */
  const isSelected = useCallback((id) => selectedIds.has(id), [selectedIds]);
  const setOnlySelected = useCallback((id) => setSelectedIds(new Set([id])), []);
  const toggleSelected = useCallback((id) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    }), []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  /* ---------------- End move/resize (emit + history) - OPTIMIZED ---------------- */
  const endMoveOrResize = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;

    if (d.mode === "move") {
      const { dx, dy } = d.last;
      if (dx !== 0 || dy !== 0) {
        d.ids.forEach((id) => {
          const o = d.originals.get(id);
          const before = { x: o.x, y: o.y };
          const after = { x: o.x + dx, y: o.y + dy };

          // optimistic local + emit
          applyLocalUpdate(id, after);
          socketRef.current?.emit("shape:update", { roomId, id, patch: after });

          pushCmd({
            do: () => {
              applyLocalUpdate(id, after);
              socketRef.current?.emit("shape:update", { roomId, id, patch: after });
            },
            undo: () => {
              applyLocalUpdate(id, before);
              socketRef.current?.emit("shape:update", { roomId, id, patch: before });
            },
          });
        });
      }
    } else if (d.mode === "resize") {
      const s = shapes.find((x) => x._id === d.id);
      if (s) {
        const before = d.orig;
        const after = { x: s.x, y: s.y, w: s.w, h: s.h };

        applyLocalUpdate(s._id, after);
        socketRef.current?.emit("shape:update", {
          roomId,
          id: s._id,
          patch: after,
        });

        pushCmd({
          do: () => {
            applyLocalUpdate(s._id, after);
            socketRef.current?.emit("shape:update", {
              roomId,
              id: s._id,
              patch: after,
            });
          },
          undo: () => {
            applyLocalUpdate(s._id, before);
            socketRef.current?.emit("shape:update", {
              roomId,
              id: s._id,
              patch: before,
            });
          },
        });
      }
    }

    dragRef.current = null;

    // Clean up all event listeners to prevent memory leaks
    window.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("mouseup", endMoveOrResize);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", endMoveOrResize);
    window.removeEventListener("mousemove", onResizeMove);
  }, [shapes, roomId, applyLocalUpdate, pushCmd]);

  /* ---------------- Drag / Touch drag (group) - OPTIMIZED ---------------- */
  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d || d.mode !== "move") return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    d.last = { dx, dy };

    setShapes((prev) =>
      prev.map((s) => {
        if (!d.ids.has(s._id)) return s;
        const o = d.originals.get(s._id);
        return { ...s, x: o.x + dx, y: o.y + dy };
      })
    );
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const t = e.touches[0];
    if (!t) return;
    onPointerMove({ clientX: t.clientX, clientY: t.clientY });
  }, [onPointerMove]);

  const startMovePointer = useCallback((clientX, clientY, id, withShift) => {
    if (withShift) toggleSelected(id);
    else if (!isSelected(id)) setOnlySelected(id);

    const idsToMove = new Set(isSelected(id) ? selectedIds : [id]);
    if (idsToMove.size === 0) idsToMove.add(id);

    const originals = new Map();
    shapes.forEach((s) => {
      if (idsToMove.has(s._id)) originals.set(s._id, { x: s.x, y: s.y });
    });

    dragRef.current = {
      mode: "move",
      ids: idsToMove,
      startX: clientX,
      startY: clientY,
      originals,
      last: { dx: 0, dy: 0 },
    };

    // Use passive listeners for better performance
    window.addEventListener("mousemove", onPointerMove, { passive: true });
    window.addEventListener("mouseup", endMoveOrResize, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", endMoveOrResize, { passive: true });
  }, [shapes, selectedIds, isSelected, toggleSelected, setOnlySelected]);

  /* ---------------- Resize - OPTIMIZED ---------------- */
  const onResizeMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d || d.mode !== "resize") return;
    const dx = e.clientX - d.startX,
      dy = e.clientY - d.startY;

    setShapes((prev) =>
      prev.map((s) => {
        if (s._id !== d.id) return s;
        let { x, y, w, h } = d.orig;

        if (d.corner === "nw") {
          x += dx;
          y += dy;
          w -= dx;
          h -= dy;
        }
        if (d.corner === "ne") {
          y += dy;
          w += dx;
          h -= dy;
        }
        if (d.corner === "sw") {
          x += dx;
          w -= dx;
          h += dy;
        }
        if (d.corner === "se") {
          w += dx;
          h += dy;
        }

        w = Math.max(10, w);
        h = Math.max(10, h);

        if (e.shiftKey) {
          const size = Math.max(w, h);
          w = size;
          h = size;
        }
        return { ...s, x, y, w, h };
      })
    );
  }, []);

  const startResize = useCallback((e, s, corner) => {
    if (tool.mode !== "select") return;
    e.stopPropagation();
    dragRef.current = {
      mode: "resize",
      id: s._id,
      corner,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: s.x, y: s.y, w: s.w, h: s.h },
    };
    window.addEventListener("mousemove", onResizeMove, { passive: true });
    window.addEventListener("mouseup", endMoveOrResize, { passive: true });
  }, [tool.mode]);

  const onShapeMouseDown = useCallback((e, id) => {
    if (tool.mode !== "select") return;
    e.preventDefault();
    boardRef.current?.focus();
    startMovePointer(e.clientX, e.clientY, id, e.shiftKey);
  }, [tool.mode, startMovePointer]);

  const onShapeTouchStart = useCallback((e, id) => {
    if (tool.mode !== "select") return;
    const t = e.touches[0];
    if (!t) return;
    boardRef.current?.focus();
    startMovePointer(t.clientX, t.clientY, id, e.shiftKey || false);
  }, [tool.mode, startMovePointer]);

  /* ---------------- Keyboard controls ---------------- */
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const onKeyDown = (e) => {
      // Space to pan
      if (e.code === "Space") {
        spaceDownRef.current = true;
      }

      // Undo/Redo
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      // Nudge / delete / escape selection
      if (selectedIds.size === 0) return;
      let dx = 0, dy = 0;
      const step = e.shiftKey ? 10 : 1;

      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else if (e.key === "Escape") {
        clearSelection();
        return;
      } else if (e.key === "Delete" || e.key === "Backspace") {
        // just emit; wrapper will handle optimistic + history
        selectedIds.forEach((id) => {
          socketRef.current?.emit("shape:delete", { roomId, id });
        });
        return;
      } else return;

      e.preventDefault();

      // local preview
      setShapes((prev) =>
        prev.map((s) =>
          selectedIds.has(s._id) ? { ...s, x: s.x + dx, y: s.y + dy } : s
        )
      );

      // emit + history per-shape (optimistic)
      selectedIds.forEach((id) => {
        const sh = shapes.find((x) => x._id === id);
        if (!sh) return;
        const before = { x: sh.x ?? 0, y: sh.y ?? 0 };
        const after = { x: before.x + dx, y: before.y + dy };

        applyLocalUpdate(id, after);
        socketRef.current?.emit("shape:update", { roomId, id, patch: after });

        pushCmd({
          do: () => {
            applyLocalUpdate(id, after);
            socketRef.current?.emit("shape:update", { roomId, id, patch: after });
          },
          undo: () => {
            applyLocalUpdate(id, before);
            socketRef.current?.emit("shape:update", { roomId, id, patch: before });
          },
        });
      });
    };

    const onKeyUp = (e) => {
      if (e.code === "Space") spaceDownRef.current = false;
    };

    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("keyup", onKeyUp);
    return () => {
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("keyup", onKeyUp);
    };
  }, [selectedIds, shapes, roomId]);

  /* ---------------- Pan / Zoom + camera sync ---------------- */
  useEffect(() => {
    const el = boardRef.current;
    const s = socketRef.current;
    if (!el) return;

    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setCamera((c) => {
        const next = Math.min(4, Math.max(0.2, c.scale * (e.deltaY > 0 ? 0.9 : 1.1)));
        const nc = { ...c, scale: next };
        s?.emit("camera:update", { roomId, patch: { scale: nc.scale } });
        return nc;
      });
    };

    // start pan: middle mouse OR Space + left click
    const onMouseDown = (e) => {
      const leftWithSpace = e.button === 0 && spaceDownRef.current;
      const isMiddle = e.button === 1;
      if (!leftWithSpace && !isMiddle) return;

      e.preventDefault();
      panningRef.current.active = true;
      panningRef.current.startX = e.clientX;
      panningRef.current.startY = e.clientY;
      panningRef.current.ox = camera.x;
      panningRef.current.oy = camera.y;
      el.style.cursor = "grab";
    };

    const onMouseMove = (e) => {
      if (!panningRef.current.active) return;
      const x = panningRef.current.ox + (e.clientX - panningRef.current.startX);
      const y = panningRef.current.oy + (e.clientY - panningRef.current.startY);
      setCamera((c) => ({ ...c, x, y }));
      s?.emit("camera:update", { roomId, patch: { x, y } });
    };

    const onMouseUp = () => {
      if (!panningRef.current.active) return;
      panningRef.current.active = false;
      el.style.cursor = "default";
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [camera.x, camera.y, camera.scale, roomId]);

  // drawing activity banner (local fallback + server) - optimized
  const setDrawingActivity = useCallback((val) => {
    const id = myIdRef.current || "me";
    setActivity((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), drawing: val, ts: Date.now() },
    }));
  }, []);

  // who is drawing now (3s timeout) - memoized for performance - MUST be before early return
  const whoDrawing = useMemo(() => {
    const now = Date.now();
    return Object.entries(activity)
      .filter(([, v]) => v?.drawing && now - (v.ts || 0) < 3000)
      .map(([id]) =>
        presence[id]?.name || (id === myIdRef.current ? "You" : "Someone")
      );
  }, [activity, presence, myIdRef.current]);

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;

    let drawing = false;

    const down = () => {
      if (tool.mode !== "draw") return;
      drawing = true;
      s.emit("activity:update", { roomId, patch: { drawing: true } });
      setDrawingActivity(true);
    };

    const up = () => {
      if (!drawing) return;
      drawing = false;
      s.emit("activity:update", { roomId, patch: { drawing: false } });
      setDrawingActivity(false);
    };

    const el = boardRef.current;
    if (!el) return;
    el.addEventListener("mousedown", down, { passive: true });
    window.addEventListener("mouseup", up, { passive: true });
    el.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchend", up, { passive: true });

    return () => {
      el.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
      el.removeEventListener("touchstart", down);
      window.removeEventListener("touchend", up);
    };
  }, [tool.mode, roomId, setDrawingActivity]);

  if (!isReady) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#111",
          color: "#00ffe1",
          fontSize: "18px",
          fontFamily: "Orbitron, sans-serif",
          textShadow: "0 0 8px #00ffe1",
          gap: "20px",
        }}
      >
        <div>🔄 {connectionStep}</div>
        {isLoadingShapes && (
          <div style={{ fontSize: "14px", opacity: 0.8 }}>
            Loading whiteboard content...
          </div>
        )}
      </div>
    );
  }


  /* ---------- MiniMap (renders shapes + viewport) ---------- */
  const MiniMap = ({ shapes, camera }) => {
    const W = 180, H = 120, WORLD = 100000;
    const canvasRef = useRef(null);

    const sx = W / WORLD;
    const sy = H / WORLD;

    const draw = useCallback(() => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      const ctx = cvs.getContext("2d");
      ctx.clearRect(0, 0, W, H);

      // bg
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);

      // --- draw shapes (mini) ---
      const drawRect = (s) => {
        ctx.strokeStyle = s.color || "#111";
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x * sx, s.y * sy, s.w * sx, s.h * sy);
      };
      const drawEllipse = (s) => {
        ctx.strokeStyle = s.color || "#111";
        ctx.lineWidth = 1;
        const cx = (s.x + s.w / 2) * sx;
        const cy = (s.y + s.h / 2) * sy;
        ctx.beginPath();
        ctx.ellipse(cx, cy, (s.w / 2) * sx, (s.h / 2) * sy, 0, 0, Math.PI * 2);
        ctx.stroke();
      };
      const drawNote = (s) => {
        ctx.fillStyle = s.color || "#ffef8a";
        ctx.strokeStyle = "#d4d4d4";
        const x = s.x * sx, y = s.y * sy, w = s.w * sx, h = s.h * sy;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      };
      const drawPath = (s) => {
        const pts = s.points || [];
        if (pts.length < 2) return;
        ctx.strokeStyle = s.color || "#111";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pts[0].x * sx, pts[0].y * sy);
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i];
          ctx.lineTo(p.x * sx, p.y * sy);
        }
        ctx.stroke();
      };

      for (const s of shapes || []) {
        if (s.type === "rect") drawRect(s);
        else if (s.type === "ellipse") drawEllipse(s);
        else if (s.type === "note") drawNote(s);
        else if (s.type === "path") drawPath(s);
      }

      // --- viewport indicator ---
      const viewW = window.innerWidth / (camera.scale || 1);
      const viewH = window.innerHeight / (camera.scale || 1);
      const vx = (-camera.x / WORLD) * W;
      const vy = (-camera.y / WORLD) * H;
      const vw = (viewW / WORLD) * W;
      const vh = (viewH / WORLD) * H;

      ctx.strokeStyle = "#4c9ffe";
      ctx.lineWidth = 2;
      ctx.strokeRect(vx, vy, vw, vh);
    }, [shapes, camera]);

    useEffect(() => { draw(); }, [draw]);

    return (
      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 6,
          width: W,
          height: H,
          zIndex: 50,
          boxShadow: "0 2px 8px rgba(0,0,0,.12)",
        }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ width: W, height: H, display: "block" }}
        />
      </div>
    );
  };

  return (
    <>
      <Toaster position="top-right" reverseOrder={false} />

      {/* Top Info Bar */}
      <div
        style={{
          padding: "10px",
          background: "#f2f2f2",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          alignItems: "center",
          textAlign: "center",
          fontSize: "14px",
        }}
      >
        <div>
          <strong>Room:</strong> {roomId} &nbsp; | &nbsp;
          <strong>Users:</strong> {users}
        </div>
        <div style={{ color: status.includes("🟢") ? "green" : "red" }}>
          <strong>Status:</strong> {status}
        </div>
      </div>

      {/* ✅ Toolbar pinned above the board */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: "6px 8px",
        }}
      >
        <Toolbar
          tool={tool}
          setTool={setTool}
          socket={socketRef.current}
          roomId={roomId}
          onUndo={undo}
          onRedo={redo}
          canUndo={undoRef.current.length > 0}   // historyVer triggers re-render
          canRedo={redoRef.current.length > 0}   // via state ticker above
        />
      </div>

      {/* Whiteboard Area */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 120px)",
          width: "100vw",
          overflow: "hidden",
        }}
      >
        <div
          ref={boardRef}
          tabIndex={0}
          style={{
            flexGrow: 1,
            position: "relative",
            outline: "none",
            zIndex: 0,
            background: "#fff",
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !spaceDownRef.current) {
              clearSelection();
            }
          }}
          onTouchStart={(e) => {
            if (e.target === e.currentTarget) clearSelection();
          }}
        >
          {/* ✅ DrawingCanvas as viewport overlay (NOT inside world) */}
          <DrawingCanvas
            socket={socketRef.current}
            tool={tool}
            roomId={roomId}
            shapes={shapes}
          />

          {/* World (infinite canvas) with camera transform */}
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 1 }}>
            <div
              style={{
                position: "absolute",
                left: camera.x,
                top: camera.y,
                transform: `scale(${camera.scale})`,
                transformOrigin: "0 0",
                width: "100000px",
                height: "100000px",
              }}
            >
              {/* Shapes overlay (world space) - OPTIMIZED */}
              <ShapeRenderer
                shapes={shapes}
                selectedIds={selectedIds}
                tool={tool}
                roomId={roomId}
                socket={socketRef.current}
                onShapeMouseDown={onShapeMouseDown}
                onShapeTouchStart={onShapeTouchStart}
                setSelectedIds={setSelectedIds}
                setShapes={setShapes}
                onResize={startResize}
              />
            </div>
          </div>

          {/* Drawing indicator */}
          {whoDrawing.length > 0 && (
            <div
              style={{
                position: "absolute",
                left: 12,
                top: 60,
                background: "#0008",
                color: "#fff",
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 12,
                zIndex: 60,
              }}
            >
              {whoDrawing.join(", ")} {whoDrawing.length === 1 ? "is" : "are"}{" "}
              drawing…
            </div>
          )}

          {/* Cursors */}
          <UserCursors
            socket={socketRef.current}
            roomId={roomId}
            presence={presence}
            camera={camera}
          />

          {/* MiniMap */}
          <MiniMap shapes={shapes} camera={camera} />
        </div>
      </div>
    </>
  );
}

export default Whiteboard;
