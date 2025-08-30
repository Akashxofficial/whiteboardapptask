import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import dotenv from "dotenv";

import roomRoutes from "./routes/roomRoutes.js";
import { setupSocket } from "./socket/socket.js";
import { startCleanupJob } from "./cleanupJob.js";

dotenv.config();

const app = express();

/* ---------------- CORS (Express v5 compatible) ---------------- */
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://whiteboardapptask.vercel.app",
];

// CORS middleware
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
  })
);

// Preflight for all routes (Express v5: '*' ❌, use regex ✅)
app.options(/.*/, cors({ origin: ALLOWED_ORIGINS, credentials: true }));

app.use(express.json());

/* ---------------- Basic health route ---------------- */
app.get("/", (_req, res) => {
  res.send("🎨 Collaborative Whiteboard API is running.");
});

/* ---------------- MongoDB ---------------- */
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
  console.error("❌ MONGO_URI missing in .env");
} else {
  try {
    // Optimize MongoDB connection with connection pooling
    await mongoose.connect(mongoURI, {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      bufferCommands: false, // Disable mongoose buffering
    });
    console.log("✅ MongoDB Connected with optimized settings");
  } catch (err) {
    console.error("❌ MongoDB connect error:", err?.message || err);
  }
}

/* ---------------- API Routes ---------------- */
app.use("/api/rooms", roomRoutes);

/* ---------------- HTTP + Socket.IO ---------------- */
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true, methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
  pingTimeout: 20000, // Reduced from 30000
  pingInterval: 15000, // Reduced from 25000
  connectTimeout: 10000, // Add connection timeout
  maxHttpBufferSize: 1e6, // Limit buffer size
  allowEIO3: true, // Allow Engine.IO v3 for better compatibility
});

io.engine.on("connection_error", (err) => {
  console.error("⚠️ engine connection_error:", {
    code: err.code,
    message: err.message,
    context: err.context,
  });
});

setupSocket(io);
startCleanupJob();

/* ---------------- Global error logging ---------------- */
process.on("unhandledRejection", (e) =>
  console.error("UNHANDLED REJECTION:", e)
);
process.on("uncaughtException", (e) =>
  console.error("UNCAUGHT EXCEPTION:", e)
);

/* ---------------- Start server ---------------- */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
