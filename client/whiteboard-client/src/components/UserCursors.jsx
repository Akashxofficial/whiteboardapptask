import React, { useEffect, useState } from 'react';


const COLORS = ['red', 'blue', 'green', 'orange', 'purple', 'teal'];
const getRandomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

function UserCursors({ socket, roomId }) {
  const [cursors, setCursors] = useState({});
  const [userColors, setUserColors] = useState({});

  useEffect(() => {
    if (!socket) return;

 
    socket.on('cursor-update', ({ socketId, cursor }) => {
      setUserColors(prev => ({
        ...prev,
        [socketId]: prev[socketId] || getRandomColor(),
      }));

      setCursors((prev) => ({
        ...prev,
        [socketId]: { ...cursor, lastUpdate: Date.now() },
      }));
    });


    const interval = setInterval(() => {
      setCursors((prev) => {
        const now = Date.now();
        const active = {};
        for (const id in prev) {
          if (now - prev[id].lastUpdate < 3000) {
            active[id] = prev[id];
          }
        }
        return active;
      });
    }, 1000);


    let lastSent = 0;
    const throttledMouseMove = (e) => {
      const now = Date.now();
      if (now - lastSent > 16) {
        lastSent = now;
        const pos = { x: e.clientX, y: e.clientY };
        socket.emit('cursor-move', { roomId, cursor: pos });
      }
    };

    window.addEventListener('mousemove', throttledMouseMove);

    return () => {
      socket.off('cursor-update');
      window.removeEventListener('mousemove', throttledMouseMove);
      clearInterval(interval);
    };
  }, [socket, roomId]);

  return (
    <>
      {Object.entries(cursors).map(([id, pos]) => (
        <div
          key={id}
          style={{
            position: 'absolute',
            left: pos.x,
            top: pos.y,
            width: 10,
            height: 10,
            backgroundColor: userColors[id] || 'gray',
            borderRadius: '50%',
            pointerEvents: 'none',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
          }}
        />
      ))}
    </>
  );
}

export default UserCursors;
