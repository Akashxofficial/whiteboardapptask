import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function RoomJoin() {
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState(localStorage.getItem('wb:name') || '');
  const navigate = useNavigate();

  const handleJoin = async () => {
    const code = roomCode.trim().toUpperCase();
    const displayName = name.trim() || 'Guest';

    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      return alert("Room code must be 4–8 uppercase alphanumeric characters.");
    }

    try {
      // persist name (and random color if absent) for presence on connect
      localStorage.setItem('wb:name', displayName);
      if (!localStorage.getItem('wb:color')) {
        const color = `hsl(${Math.floor(Math.random() * 360)} 90% 55%)`;
        localStorage.setItem('wb:color', color);
      }

      await axios.post('https://whiteboardapptask.onrender.com/api/rooms/join', {
        roomId: code,
      });

      navigate(`/room/${code}`);
    } catch (err) {
      console.error('Error joining/creating room:', err);
      alert("Something went wrong while joining the room.");
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <h2 style={styles.heading}>Enter Room Code</h2>
        <input
          type="text"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          placeholder="e.g. ABC123"
          style={styles.input}
        />
        <div style={{ height: 12 }} />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          style={styles.nameInput}
        />
        <br /><br />
        <button onClick={handleJoin} style={styles.button}>
          Join Room
        </button>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#0a0e13',
    padding: '20px',
  },
  container: {
    width: '100%',
    maxWidth: '400px',
    backgroundColor: '#0b0f14',
    color: '#00ffd0',
    fontFamily: `'Orbitron', sans-serif`,
    padding: '30px 20px',
    borderRadius: '10px',
    boxShadow: '0 0 25px rgba(0, 255, 208, 0.3)',
    border: '1px solid rgba(0,255,208,0.2)',
    textAlign: 'center',
  },
  heading: {
    fontSize: '22px',
    marginBottom: '20px',
    textShadow: '0 0 8px #00ffd0',
  },
  input: {
    padding: '12px',
    fontSize: '16px',
    width: '100%',
    maxWidth: '280px',
    border: '1px solid #00ffd0',
    backgroundColor: '#111',
    color: '#00ffd0',
    borderRadius: '6px',
    textTransform: 'uppercase',
    outline: 'none',
    boxShadow: 'inset 0 0 8px rgba(0,255,208,0.3)',
  },
  nameInput: {
    padding: '12px',
    fontSize: '16px',
    width: '100%',
    maxWidth: '280px',
    border: '1px solid #00ffd0',
    backgroundColor: '#111',
    color: '#00ffd0',
    borderRadius: '6px',
    outline: 'none',
    boxShadow: 'inset 0 0 8px rgba(0,255,208,0.3)',
  },
  button: {
    padding: '10px 24px',
    fontSize: '15px',
    color: '#000',
    backgroundColor: '#00ffd0',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600',
    boxShadow: '0 0 12px rgba(0, 255, 208, 0.5)',
    transition: 'all 0.3s ease',
  },
};

export default RoomJoin;
