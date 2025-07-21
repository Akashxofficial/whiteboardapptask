import Room from '../models/Room.js';

const roomUserMap = {}; 

export function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log(`🟢 Socket connected: ${socket.id}`);

    let currentRoom = null;


    socket.on('join-room', async (roomId) => {
      currentRoom = roomId;
      socket.join(roomId);


      if (!roomUserMap[roomId]) roomUserMap[roomId] = new Set();
      roomUserMap[roomId].add(socket.id);

      const userCount = roomUserMap[roomId].size;
      io.to(roomId).emit('user-count', userCount);

      console.log(`🔗 ${socket.id} joined ${roomId} | Users: ${userCount}`);


      const room = await Room.findOne({ roomId });
      if (room && room.drawingData.length > 0) {
        room.drawingData.forEach((item) => {
          if (item.type === 'stroke') {
            socket.emit('draw-move', { roomId, stroke: item.data });
          } else if (item.type === 'clear') {
            socket.emit('clear-canvas');
          }
        });
      }
    });


    socket.on('cursor-move', ({ roomId, cursor }) => {
      socket.to(roomId).emit('cursor-update', {
        socketId: socket.id,
        cursor,
      });
    });


    socket.on('draw-start', (data) => {
      socket.to(data.roomId).emit('draw-start', data);
    });

    socket.on('draw-move', (data) => {
      socket.to(data.roomId).emit('draw-move', data);
    });

    socket.on('draw-end', async (data) => {
      socket.to(data.roomId).emit('draw-end', data);

      const room = await Room.findOne({ roomId: data.roomId });
      if (room) {
        room.drawingData.push({
          type: 'stroke',
          data: data.stroke,
          timestamp: new Date(),
        });
        room.lastActivity = new Date();
        await room.save();
      }
    });


    socket.on('clear-canvas', async (roomId) => {
      io.to(roomId).emit('clear-canvas');

      const room = await Room.findOne({ roomId });
      if (room) {
        room.drawingData.push({
          type: 'clear',
          timestamp: new Date(),
        });
        room.lastActivity = new Date();
        await room.save();
      }
    });


    socket.on('disconnect', () => {
      if (currentRoom && roomUserMap[currentRoom]) {
        roomUserMap[currentRoom].delete(socket.id);

        const userCount = roomUserMap[currentRoom].size;
        if (userCount === 0) {
          delete roomUserMap[currentRoom]; 
        } else {
          io.to(currentRoom).emit('user-count', userCount);
        }

        console.log(`❌ ${socket.id} left ${currentRoom} | Users: ${userCount}`);
      }
    });
  });
}
