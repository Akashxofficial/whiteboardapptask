// server/models/Room.js
import mongoose from "mongoose";

/* ----------------- Drawing (stroke/clear) schema ----------------- */
const drawingCommandSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["stroke", "clear"],
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
  },
  { _id: false } // subdoc needs no own ObjectId
);

/* ----------------- Shape (rect/note/text/ellipse/line/arrow) ----------------- */
const shapeSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // uuid from client/server
    type: {
      type: String,
      enum: ["rect", "ellipse", "line", "arrow", "text", "note"],
      required: true,
    },

    // common box
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },

    rot: { type: Number, default: 0 },
    color: { type: String, default: "#111" },
    strokeWidth: { type: Number, default: 2 },

    // text / sticky note
    text: { type: String, default: "" },

    // line/arrow endpoints (optional for other types)
    x1: { type: Number },
    y1: { type: Number },
    x2: { type: Number },
    y2: { type: Number },
  },
  { _id: false } // use provided string _id, don't create a second one
);

/* ----------------- Room schema ----------------- */
const roomSchema = new mongoose.Schema(
  {
    roomId: { type: String, unique: true, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: Date.now },

    // freehand history (so late joiners can replay)
    drawingData: { type: [drawingCommandSchema], default: [] },

    // structured shapes
    shapes: { type: [shapeSchema], default: [] },
  },
  {
    versionKey: false, // no __v
  }
);

// helpful compound index if you later shard/partition by activity
roomSchema.index({ lastActivity: -1 });

const Room = mongoose.models.Room || mongoose.model("Room", roomSchema);
export default Room;
