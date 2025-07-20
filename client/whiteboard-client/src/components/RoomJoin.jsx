import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function RoomJoin() {
  const [roomCode, setRoomCode] = useState('');
  const navigate = useNavigate();

  const handleJoin = async () => {
    const code = roomCode.trim().toUpperCase();

    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      return alert("Room code must be 4–8 uppercase alphanumeric characters.");
    }

    try {
      // 🔧 Backend will create the room if it doesn't exist
      await axios.post('http://localhost:5000/api/rooms/join', { roomId: code });

      // ✅ Navigate to the whiteboard room
      navigate(`/room/${code}`);
    } catch (err) {
      console.error('Error joining/creating room:', err);
      alert("Something went wrong while joining the room.");
    }
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '10%' }}>
      <h2>Enter Room Code</h2>
      <input
        type="text"
        value={roomCode}
        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
        placeholder="e.g. ABC123"
        style={{
          padding: '10px',
          fontSize: '16px',
          width: '200px',
          textTransform: 'uppercase',
        }}
      />
      <br /><br />
      <button
        onClick={handleJoin}
        style={{ padding: '10px 20px', fontSize: '16px' }}
      >
        Join Room
      </button>
    </div>
  );
}

export default RoomJoin;
