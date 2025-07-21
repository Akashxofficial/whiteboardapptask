import express from 'express';
import Room from '../models/Room.js';
const router = express.Router();

router.post('/join', async (req, res) => {
  const { roomId } = req.body;

  let room = await Room.findOne({ roomId });

 
  if (!room) {
    room = await Room.create({ roomId });
    console.log("🆕 Room created:", roomId);
  }

  res.json(room);
});

export default router;
