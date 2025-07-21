import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import DrawingCanvas from './DrawingCanvas';
import Toolbar from './Toolbar';
import UserCursors from './UserCursors';
import toast, { Toaster } from 'react-hot-toast';

function Whiteboard() {
  const { roomId } = useParams();
  const [users, setUsers] = useState(1);
  const [tool, setTool] = useState({ color: 'black', width: 2 });
  const [status, setStatus] = useState('🔴 Disconnected');
  const [isReady, setIsReady] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io('https://whiteboardapptask.onrender.com', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('🟢 Connected');
      console.log('✅ Socket connected');
    });

    socket.on('disconnect', () => {
      setStatus('🔴 Disconnected');
      console.warn('⚠️ Socket disconnected');
    });

    socket.emit('join-room', roomId);

    socket.on('user-count', (count) => {
      toast.success(`👥 ${count} user${count > 1 ? 's' : ''} in room`);
      setUsers(count);
      setIsReady(true);
    });

    socket.on('user-joined', (id) => {
      toast(`✅ A new user joined: ${id.slice(0, 5)}...`);
    });

    socket.on('user-left', (id) => {
      toast(`❌ User left: ${id.slice(0, 5)}...`);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  if (!isReady)
    return <p style={{ padding: 20 }}>🔄 Connecting to room...</p>;

  return (
    <>
      <Toaster position="top-right" reverseOrder={false} />

      {}
      <div
        style={{
          padding: '10px',
          background: '#f2f2f2',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          alignItems: 'center',
          textAlign: 'center',
          fontSize: '14px',
        }}
      >
        <div>
          <strong>Room:</strong> {roomId} &nbsp; | &nbsp;
          <strong>Users:</strong> {users}
        </div>
        <div style={{ color: status.includes('🟢') ? 'green' : 'red' }}>
          <strong>Status:</strong> {status}
        </div>
      </div>

      {}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 80px)',
          width: '100vw',
          overflow: 'hidden',
        }}
      >
        <Toolbar
          tool={tool}
          setTool={setTool}
          socket={socketRef.current}
          roomId={roomId}
        />

        <div style={{ flexGrow: 1, position: 'relative' }}>
          <DrawingCanvas
            socket={socketRef.current}
            tool={tool}
            roomId={roomId}
          />
          <UserCursors
            socket={socketRef.current}
            roomId={roomId}
          />
        </div>
      </div>
    </>
  );
}

export default Whiteboard;
