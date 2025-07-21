import React from 'react';

function Toolbar({ tool, setTool, socket, roomId }) {
  const handleColorChange = (color) => {
    setTool({ ...tool, color });
  };

  const handleWidthChange = (e) => {
    setTool({ ...tool, width: parseInt(e.target.value) });
  };

  const clearCanvas = () => {
    socket.emit('clear-canvas', { roomId });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px',
        gap: '12px',
        backgroundColor: '#ececec',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label><strong>Color:</strong></label>
        {['black', 'red', 'blue', 'green'].map((color) => (
          <button
            key={color}
            onClick={() => handleColorChange(color)}
            style={{
              backgroundColor: color,
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: tool.color === color ? '2px solid #000' : '1px solid #aaa',
              cursor: 'pointer',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label><strong>Width:</strong></label>
        <input
          type="range"
          min="1"
          max="10"
          value={tool.width}
          onChange={handleWidthChange}
          style={{ width: 100 }}
        />
      </div>

      {}
      <button
        onClick={clearCanvas}
        style={{
          padding: '6px 12px',
          backgroundColor: '#fff',
          border: '1px solid #999',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        Clear Canvas
      </button>
    </div>
  );
}

export default Toolbar;
