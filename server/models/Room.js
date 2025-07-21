
import mongoose from 'mongoose';


const drawingCommandSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['stroke', 'clear'],
    required: true,
  },
  data: {
    type: Object, 
    default: {},
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});


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


const Room = mongoose.model('Room', roomSchema);

export default Room;
