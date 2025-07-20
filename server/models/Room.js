// models/Room.js

import mongoose from 'mongoose';

// Schema for each drawing command (stroke or clear)
const drawingCommandSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['stroke', 'clear'], // Better validation
    required: true,
  },
  data: {
    type: Object, // For stroke: path, color, width; for clear: can be {}
    default: {},
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Main Room schema
const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    unique: true,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastActivity: {
    type: Date,
    default: Date.now,
  },
  drawingData: {
    type: [drawingCommandSchema],
    default: [],
  },
});

// Create and export the model
const Room = mongoose.model('Room', roomSchema);

export default Room;
