import React from 'react';

function Toolbar({ tool, setTool, socket, roomId }) {
  const handleColorChange = (color) => setTool({ ...tool, color });
  const handleWidthChange = (e) => setTool({ ...tool, width: parseInt(e.target.value) });

  const handleClear = () => {
    socket.emit('clear-canvas', roomId);
  };

  return (
    <div style={{
      display: 'flex',
      gap: '10px',
      padding: '10px',
      backgroundColor: '#eee',
      alignItems: 'center',
    }}>
      <span>Color:</span>
      {['black', 'red', 'blue', 'green'].map(color => (
        <button key={color} onClick={() => handleColorChange(color)} style={{ backgroundColor: color, width: 25, height: 25, borderRadius: '50%' }} />
      ))}

      <span>Width:</span>
      <input type="range" min="1" max="10" value={tool.width} onChange={handleWidthChange} />

      <button onClick={handleClear} style={{ marginLeft: 'auto', padding: '5px 10px' }}>
        Clear Canvas
      </button>
    </div>
  );
}

export default Toolbar;
