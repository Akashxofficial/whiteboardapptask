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

    /* ==================== PRESENCE ==================== */// client may explicitly request the latest shapes (fallback if join missed it)
socket.on("shapes:request", async (payload) => {
  try {
    // payload may be { roomId } or just roomId string
    const rid = payload && typeof payload === "string"
      ? payload
      : payload?.roomId || currentRoom;

    if (!rid) {
      // nothing to do
      socket.emit("shapes:init", []);
      return;
    }

    const roomDoc = await Room.findOne({ roomId: String(rid) }).lean();
    const shapes = Array.isArray(roomDoc?.shapes) ? roomDoc.shapes : [];
    // send only to requester
    socket.emit("shapes:init", shapes);

    console.log(`shapes:request -> ${socket.id} (${rid}) : ${shapes.length} shapes`);
  } catch (e) {
    console.error("shapes:request error:", e);
    socket.emit("shapes:init", []); // fail-safe: send empty list
  }
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

// FREE DRAW: store stroke and also convert to a "path" shape so ShapeRenderer shows it
socket.on("draw-end", async (data) => {
  try {
    const rid = data?.roomId;
    if (!rid) return;

    // broadcast stroke to other connected clients immediately
    socket.to(rid).emit("draw-end", data);

    if (!data?.stroke) return;

    // ensure stroke has id
    if (!data.stroke._id) data.stroke._id = uuid();

    // persist stroke into drawingData array
   await Room.updateOne(
  { roomId: rid },
  {
    $push: {
      drawingData: {
        type: "stroke",
        data: data.stroke,
        timestamp: new Date(),
      }
    },
    $set: { lastActivity: new Date() },
  },
  { upsert: true }
);


    // also convert stroke -> lightweight shape so new joiners get it with shapes:init
    const strokeShape = {
      _id: data.stroke._id,
      type: "path",
      points: data.stroke.points || [],
      color: data.stroke.color || "#111",
      width: data.stroke.width || 2,
      author: data.stroke.author || socket.id,
      // optional bbox; front-end can fallback if missing
      x: data.stroke.points?.[0]?.x ?? 0,
      y: data.stroke.points?.[0]?.y ?? 0,
      w: data.stroke.w || 200,
      h: data.stroke.h || 200,
    };

    await Room.updateOne(
      { roomId: rid },
      { $push: { shapes: strokeShape }, $set: { lastActivity: new Date() } },
      { upsert: true }
    );

    // broadcast shape to everyone (including just-joined)
    io.to(rid).emit("shape:added", strokeShape);
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

    /* ==================== TEST EVENT ==================== */
    socket.on("test-ping", ({ roomId, timestamp }) => {
      console.log("Received test-ping:", { roomId, timestamp, socketId: socket.id });
      socket.emit("test-pong", { roomId, timestamp, serverTime: Date.now() });
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
        if (!roomId || !id || !patch) {
          console.log("Missing required parameters:", { roomId, id, patch });
          return;
        }
        const rid = String(roomId);

        console.log("Server received shape update:", { roomId: rid, id, patch });

        // First, let's find the room and shape to verify it exists
        const roomDoc = await Room.findOne({ roomId: rid }).lean();
        if (!roomDoc) {
          console.log("Room not found:", rid);
          return;
        }

        const shapeIndex = roomDoc.shapes?.findIndex(s => s._id === id);
        if (shapeIndex === -1) {
          console.log("Shape not found in room:", { roomId: rid, shapeId: id });
          return;
        }

        console.log("Found shape at index:", shapeIndex);

        const setObj = {};
        for (const [k, v] of Object.entries(patch)) {
          setObj[`shapes.${shapeIndex}.${k}`] = v;
        }

        console.log("Update object:", setObj);

        const updateResult = await Room.updateOne(
          { roomId: rid },
          { $set: setObj, $currentDate: { lastActivity: true } }
        );

        console.log("Database update result:", updateResult);

        if (updateResult.modifiedCount > 0) {
          // Broadcast to all users in the room (including sender for consistency)
          io.to(rid).emit("shape:updated", { id, patch });
          console.log("Broadcasted shape update to room:", rid);
        } else {
          console.log("No documents were modified");
        }
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
