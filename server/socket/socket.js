// server/socket/socket.js
import Room from "../models/Room.js";
import { v4 as uuid } from "uuid";

/**
 * In-memory realtime state (DB persistence sirf shapes/drawingData ke liye).
 * We keep presence/activity/camera/cursors in RAM for speed.
 */
const rooms = new Map();
// rooms: roomId -> {
//   presence: Map<socketId, { name, color, isIdle, lastActive }>
//   activity: Map<socketId, { drawing?:boolean, typing?:boolean, ts:number }>
//   camera:   Map<socketId, { x?:number, y?:number, scale?:number }>
//   cursors:  Map<socketId, { x:number, y:number, ts:number }>
// }

function ensureRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      presence: new Map(),
      activity: new Map(),
      camera: new Map(),
      cursors: new Map(),
    });
  }
  return rooms.get(roomId);
}

function toPlainPresence(map) {
  const obj = {};
  for (const [sid, val] of map.entries()) obj[sid] = val;
  return obj;
}

function userCount(io, roomId) {
  const r = io.sockets.adapter.rooms.get(roomId);
  return r ? r.size : 0;
}

export function setupSocket(io) {
  io.on("connection", (socket) => {
    let currentRoom = null;

    /* ==================== JOIN ROOM ==================== */
    // supports: join-room("room123", ack?) OR join-room({roomId}, ack?)
    socket.on("join-room", async (payload, ack) => {
      try {
        const roomId = typeof payload === "string" ? payload : payload?.roomId;
        if (!roomId) {
          if (typeof ack === "function") ack(false, "roomId missing");
          return;
        }

        // leave previous
        if (currentRoom) socket.leave(currentRoom);
        currentRoom = String(roomId);
        socket.join(currentRoom);

        // make sure in-memory room exists
        const R = ensureRoom(currentRoom);

        // ensure DB room
        let roomDoc = await Room.findOne({ roomId: currentRoom }).lean();
        if (!roomDoc) {
          await Room.create({ roomId: currentRoom, shapes: [], drawingData: [] });
          roomDoc = { roomId: currentRoom, shapes: [], drawingData: [] };
        }

        // initial snapshots to the new socket
        socket.emit("shapes:init", roomDoc.shapes || []);
        socket.emit("presence:state", toPlainPresence(R.presence));

        // replay full strokes to the new joiner
        if (Array.isArray(roomDoc.drawingData) && roomDoc.drawingData.length) {
          const strokes = roomDoc.drawingData
            .filter((d) => d.type === "stroke")
            .map((d) => d.data);
          socket.emit("drawing:replay", { roomId: currentRoom, strokes });
        }

        // let just-joined client know explicitly
        socket.emit("room:joined", {
          roomId: currentRoom,
          users: userCount(io, currentRoom),
        });

        // broadcast user count to room
        io.to(currentRoom).emit("user-count", userCount(io, currentRoom));

        if (typeof ack === "function") ack(true);
      } catch (e) {
        console.error("join-room error:", e);
        if (typeof ack === "function") ack(false, "Failed to join room");
        socket.emit("error", { msg: "Failed to join room" });
      }
    });

    /* ==================== PRESENCE ==================== */
    socket.on("presence:join", ({ roomId, name, color }) => {
      if (!roomId) return;
      const rid = String(roomId);
      const R = ensureRoom(rid);
      R.presence.set(socket.id, {
        name: name || "Guest",
        color: color || "#4c9ffe",
        isIdle: false,
        lastActive: Date.now(),
      });
      // broadcast full presence snapshot (simple & robust)
      io.to(rid).emit("presence:state", toPlainPresence(R.presence));
      // also update user-count (useful when presence joins after join-room)
      io.to(rid).emit("user-count", userCount(io, rid));
    });

    socket.on("presence:update", ({ roomId, patch }) => {
      if (!roomId) return;
      const rid = String(roomId);
      const R = ensureRoom(rid);
      const cur = R.presence.get(socket.id) || {};
      const merged = {
        ...cur,
        ...(patch || {}),
        lastActive: patch?.lastActive ?? cur.lastActive ?? Date.now(),
      };
      R.presence.set(socket.id, merged);
      // broadcast differential update to all peers
      io.to(rid).emit("presence:update", { id: socket.id, patch: merged });
    });

    /* ==================== ACTIVITY (typing/drawing) ==================== */
    // client emits: activity:update { roomId, patch: { drawing?:bool, typing?:bool } }
    socket.on("activity:update", ({ roomId, patch }) => {
      if (!roomId) return;
      const rid = String(roomId);
      const R = ensureRoom(rid);
      const cur = R.activity.get(socket.id) || {};
      const merged = { ...cur, ...(patch || {}), ts: Date.now() };
      R.activity.set(socket.id, merged);
      io.to(rid).emit("activity:update", { id: socket.id, patch: merged });
    });

    /* ==================== CAMERA (pan/zoom) ==================== */
    // client emits: camera:update { roomId, patch: {x?, y?, scale?} }
    socket.on("camera:update", ({ roomId, patch }) => {
      if (!roomId || !patch) return;
      const rid = String(roomId);
      const R = ensureRoom(rid);
      const cur = R.camera.get(socket.id) || {};
      const merged = { ...cur, ...(patch || {}) };
      R.camera.set(socket.id, merged);
      io.to(rid).emit("camera:update", { id: socket.id, patch: merged });
    });

    /* ==================== CURSORS ==================== */
    // client emits: cursor-move { roomId, cursor: {x,y} }
    socket.on("cursor-move", ({ roomId, cursor }) => {
      if (!roomId || !cursor) return;
      const rid = String(roomId);
      const R = ensureRoom(rid);
      R.cursors.set(socket.id, { ...cursor, ts: Date.now() });
      socket.to(rid).emit("cursor-update", { socketId: socket.id, cursor });
    });

    /* ==================== FREE DRAW ==================== */
    socket.on("draw-start", (data) => {
      const rid = data?.roomId;
      if (!rid) return;
      socket.to(rid).emit("draw-start", data);
    });

    socket.on("draw-move", (data) => {
      const rid = data?.roomId;
      if (!rid) return;
      socket.to(rid).emit("draw-move", data);
    });

    socket.on("draw-end", async (data) => {
      try {
        const rid = data?.roomId;
        if (!rid) return;
        socket.to(rid).emit("draw-end", data);
        // persist stroke in DB (complete stroke payload)
        if (data?.stroke) {
          await Room.updateOne(
            { roomId: rid },
            {
              $push: {
                drawingData: {
                  type: "stroke",
                  data: data.stroke,
                  timestamp: new Date(),
                },
              },
              $set: { lastActivity: new Date() },
            }
          );
        }
      } catch (e) {
        console.error("draw-end error:", e);
        socket.emit("error", { msg: "Failed to save stroke" });
      }
    });

    // ---- UNDO/REDO for drawing ----
    // Single handler: if id provided -> remove that id; else remove last (prefer same author)
    socket.on("drawing:undo", async ({ roomId, id }) => {
      try {
        if (!roomId) return;
        const rid = String(roomId);
        const doc = await Room.findOne({ roomId: rid }, { drawingData: 1 }).lean();
        if (!doc || !Array.isArray(doc.drawingData)) return;

        let arr = [...doc.drawingData];
        let changed = false;

        if (id) {
          const beforeLen = arr.length;
          arr = arr.filter(
            (d) => !((d.id && d.id === id) || (d.data && d.data._id === id))
          );
          changed = arr.length !== beforeLen;
        } else {
          // remove last stroke; prefer authored by this socket if available
          let idx = -1;
          for (let i = arr.length - 1; i >= 0; i--) {
            const it = arr[i];
            if (it?.type !== "stroke") continue;
            const authored =
              it?.data?.author ? it.data.author === socket.id : true;
            if (authored) {
              idx = i;
              break;
            }
          }
          if (idx === -1) {
            // fallback: remove last stroke of any author
            for (let i = arr.length - 1; i >= 0; i--) {
              if (arr[i]?.type === "stroke") {
                idx = i;
                break;
              }
            }
          }
          if (idx !== -1) {
            arr.splice(idx, 1);
            changed = true;
          }
        }

        if (!changed) return;

        await Room.updateOne(
          { roomId: rid },
          { $set: { drawingData: arr }, $currentDate: { lastActivity: true } }
        );
        const strokes = arr.filter((d) => d.type === "stroke").map((d) => d.data);
        io.to(rid).emit("drawing:replay", { roomId: rid, strokes });
      } catch (e) {
        console.error("drawing:undo error:", e);
      }
    });

    socket.on("drawing:redo", async ({ roomId, id, stroke }) => {
      // convention: client re-commits the stroke it wants to redo
      try {
        if (!roomId || !stroke) return;
        const rid = String(roomId);
        await Room.updateOne(
          { roomId: rid },
          {
            $push: {
              drawingData: {
                type: "stroke",
                data: stroke,
                id: stroke._id || id || undefined,
                timestamp: new Date(),
              },
            },
            $currentDate: { lastActivity: true },
          }
        );
        const doc = await Room.findOne({ roomId: rid }, { drawingData: 1 }).lean();
        const strokes = (doc?.drawingData || [])
          .filter((d) => d.type === "stroke")
          .map((d) => d.data);
        io.to(rid).emit("drawing:replay", { roomId: rid, strokes });
      } catch (e) {
        console.error("drawing:redo error:", e);
      }
    });

    // on replay request, fetch all strokes and broadcast for canvas rebuild
    socket.on("drawing:replay:request", async ({ roomId }) => {
      try {
        const rid = roomId || currentRoom;
        if (!rid) return;
        const doc = await Room.findOne({ roomId: rid }).lean();
        const strokes = (doc?.drawingData || [])
          .filter((d) => d.type === "stroke")
          .map((d) => d.data);
        io.to(rid).emit("drawing:replay", { roomId: rid, strokes });
      } catch (e) {
        console.error("drawing:replay error:", e);
      }
    });

    socket.on("clear-canvas", async ({ roomId }) => {
      try {
        if (!roomId) return;
        const rid = String(roomId);
        io.to(rid).emit("clear-canvas");
        await Room.updateOne(
          { roomId: rid },
          {
            $push: { drawingData: { type: "clear", timestamp: new Date() } },
            $set: { lastActivity: new Date() },
          }
        );
      } catch (e) {
        console.error("clear-canvas error:", e);
        socket.emit("error", { msg: "Failed to clear canvas" });
      }
    });

    /* ==================== SHAPES CRUD ==================== */
    socket.on("shape:add", async ({ roomId, shape }) => {
      try {
        if (!roomId || !shape) return;
        const rid = String(roomId);
        if (!shape._id) shape._id = uuid();

        await Room.updateOne(
          { roomId: rid },
          { $push: { shapes: shape }, $currentDate: { lastActivity: true } }
        );

        io.to(rid).emit("shape:added", shape);
      } catch (e) {
        console.error("shape:add error:", e);
        socket.emit("error", { msg: "Failed to add shape" });
      }
    });

    socket.on("shape:update", async ({ roomId, id, patch }) => {
      try {
        if (!roomId || !id || !patch) return;
        const rid = String(roomId);

        const setObj = {};
        for (const [k, v] of Object.entries(patch)) {
          setObj[`shapes.$.${k}`] = v;
        }

        await Room.updateOne(
          { roomId: rid, "shapes._id": id },
          { $set: setObj, $currentDate: { lastActivity: true } }
        );

        io.to(rid).emit("shape:updated", { id, patch });
      } catch (e) {
        console.error("shape:update error:", e);
        socket.emit("error", { msg: "Failed to update shape" });
      }
    });

    socket.on("shape:delete", async ({ roomId, id }) => {
      try {
        if (!roomId || !id) return;
        const rid = String(roomId);

        await Room.updateOne(
          { roomId: rid },
          { $pull: { shapes: { _id: id } }, $currentDate: { lastActivity: true } }
        );

        io.to(rid).emit("shape:deleted", { id });
      } catch (e) {
        console.error("shape:delete error:", e);
        socket.emit("error", { msg: "Failed to delete shape" });
      }
    });

    /* ==================== DISCONNECT ==================== */
    socket.on("disconnect", () => {
      if (!currentRoom) return;
      const rid = currentRoom;
      const R = ensureRoom(rid);

      // presence leave
      if (R.presence.has(socket.id)) {
        R.presence.delete(socket.id);
        io.to(rid).emit("presence:leave", socket.id);
      }
      // cleanup ephemeral maps
      R.activity.delete(socket.id);
      R.camera.delete(socket.id);
      R.cursors.delete(socket.id);

      io.to(rid).emit("user-count", userCount(io, rid));
    });
  });
}
