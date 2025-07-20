import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import roomRoutes from './routes/roomRoutes.js';
import { setupSocket } from './socket/socket.js';
import { startCleanupJob } from './cleanupJob.js'; // ✅ Auto-cleanup job

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ✅ Root route for Render check
app.get('/', (req, res) => {
  res.send("✅ Collaborative Whiteboard API is running.");
});

// Middlewares
app.use(cors());
app.use(express.json());

// MongoDB connection
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI not found in .env file");
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB Error:", err));

// Routes
app.use('/api/rooms', roomRoutes);

// Socket.io setup
setupSocket(io);

// ✅ Start background cleanup
startCleanupJob();

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
