// client/src/components/UserCursors.jsx
import React, { useEffect, useRef, useState } from "react";

/**
 * Props:
 *  - socket (required)
 *  - roomId (required)
 *  - presence?: { [socketId]: { name, color, isIdle } }
 *  - camera?: { x:number, y:number, scale:number }
 *
 * Works with BOTH event names for compatibility:
 *   emit:  "cursor:update"  (new)  + "cursor-move" (legacy)
 *   listen:"cursor:update"  (new)  + "cursor-update" (legacy)
 */
export default function UserCursors({
  socket,
  roomId,
  presence = {},
  camera = { x: 0, y: 0, scale: 1 },
}) {
  const [cursors, setCursors] = useState({}); // { socketId: { x, y, ts } }

  const rafRef = useRef(null);
  const pendingRef = useRef(null);

  // ---- listen to incoming cursor updates (new + legacy) ----
  useEffect(() => {
    if (!socket) return;

    const onCursor = ({ id, cursor }) => {
      if (!id || !cursor) return;
      setCursors((p) => ({ ...p, [id]: { ...cursor, ts: Date.now() } }));
    };

    const onCursorLegacy = ({ socketId, cursor }) => {
      if (!socketId || !cursor) return;
      setCursors((p) => ({ ...p, [socketId]: { ...cursor, ts: Date.now() } }));
    };

    socket.on("cursor:update", onCursor);
    socket.on("cursor-update", onCursorLegacy);

    return () => {
      socket.off("cursor:update", onCursor);
      socket.off("cursor-update", onCursorLegacy);
    };
  }, [socket]);

  // ---- prune stale cursors (5s) ----
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setCursors((p) => {
        const n = { ...p };
        for (const k in n) if (now - (n[k].ts || 0) > 5000) delete n[k];
        return n;
      });
    }, 3000);
    return () => clearInterval(t);
  }, []);

  // ---- emit my cursor (throttled via rAF) ----
  useEffect(() => {
    if (!socket) return;

    const toWorld = (clientX, clientY) => {
      const s = camera.scale || 1;
      return { x: (clientX - (camera.x || 0)) / s, y: (clientY - (camera.y || 0)) / s };
    };

    const send = () => {
      const cursor = pendingRef.current;
      rafRef.current = null;
      pendingRef.current = null;
      if (!cursor) return;
      // new event
      socket.emit("cursor:update", { roomId, cursor });
      // legacy event (no harm if server ignores)
      socket.emit("cursor-move", { roomId, cursor: { x: cursor.x, y: cursor.y } });
    };

    const onMove = (e) => {
      const t = e.touches?.[0];
      const cx = t?.clientX ?? e.clientX;
      const cy = t?.clientY ?? e.clientY;
      if (typeof cx !== "number" || typeof cy !== "number") return;

      pendingRef.current = toWorld(cx, cy);
      if (!rafRef.current) rafRef.current = requestAnimationFrame(send);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: true });

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      pendingRef.current = null;
    };
  }, [socket, roomId, camera.x, camera.y, camera.scale]);

  // ---- render ----
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, pointerEvents: "none" }}>
      {Object.entries(cursors).map(([id, pos]) => {
        const meta = presence[id] || {};
        const name = meta.name || "Guest";
        const color = meta.color || "#4c9ffe";
        const isIdle = !!meta.isIdle;

        // world -> screen
        const s = camera.scale || 1;
        const left = (pos.x * s) + (camera.x || 0);
        const top = (pos.y * s) + (camera.y || 0);

        return (
          <div key={id} style={{ position: "absolute", left, top, transform: "translate(-2px, -2px)" }}>
            {/* Cursor dot */}
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: color,
                boxShadow: "0 0 0 2px rgba(0,0,0,.15)",
                opacity: isIdle ? 0.4 : 1,
              }}
            />
            {/* Label */}
            <div
              style={{
                marginTop: 6,
                padding: "2px 6px",
                background: "rgba(0,0,0,.72)",
                color: "#fff",
                fontSize: 11,
                borderRadius: 6,
                whiteSpace: "nowrap",
                transform: "translate(-6px, 0)",
                opacity: isIdle ? 0.65 : 1,
              }}
            >
              {name} {isIdle ? "(idle)" : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}
