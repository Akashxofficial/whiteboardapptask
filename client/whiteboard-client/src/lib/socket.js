// client/src/lib/socket.js
import { io } from "socket.io-client";

// Correct fallback: only 1 string return kare
const SERVER_URL =
  import.meta.env.VITE_SOCKET_URL?.trim() ||
  "http://localhost:5000";

let socket = null;

export function getSocket() {
  if (socket) return socket;

  socket = io(SERVER_URL, {
    withCredentials: true,
    transports: ["websocket", "polling"],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    forceNew: true,
    // path: "/socket.io", // server pe custom path ho to uncomment
  });

  console.log("🔌 Socket initialized ->", SERVER_URL);

  // helpful debug logs
  socket.on("connect_error", (err) =>
    console.warn("connect_error:", err.message)
  );
  socket.on("disconnect", (reason) =>
    console.warn("client disconnect:", reason)
  );

  return socket;
}
