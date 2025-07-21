import React, { useEffect, useRef, useState } from 'react';

function DrawingCanvas({ socket, tool, roomId }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight - 150; // Leave room for toolbar
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const drawLine = ({ x0, y0, x1, y1, color, width }) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };

    socket.on('draw-start', ({ stroke }) => setLastPos({ x: stroke.x0, y: stroke.y0 }));
    socket.on('draw-move', ({ stroke }) => drawLine(stroke));
    socket.on('draw-end', () => setLastPos(null));
    socket.on('clear-canvas', () => ctx.clearRect(0, 0, canvas.width, canvas.height));

    return () => {
      socket.off('draw-start');
      socket.off('draw-move');
      socket.off('draw-end');
      socket.off('clear-canvas');
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [socket]);

  const getRelativePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const pos = getRelativePos(e);
    setIsDrawing(true);
    setLastPos(pos);

    socket.emit('draw-start', {
      roomId,
      stroke: { x0: pos.x, y0: pos.y, color: tool.color, width: tool.width },
    });
  };

  const moveDraw = (e) => {
    e.preventDefault();
    if (!isDrawing || !lastPos) return;
    const pos = getRelativePos(e);

    const stroke = {
      x0: lastPos.x,
      y0: lastPos.y,
      x1: pos.x,
      y1: pos.y,
      color: tool.color,
      width: tool.width,
    };

    socket.emit('draw-move', { roomId, stroke });

    const ctx = canvasRef.current.getContext('2d');
    drawLine(stroke, ctx);
    setLastPos(pos);
  };

  const endDraw = (e) => {
    e?.preventDefault();
    if (!isDrawing) return;
    setIsDrawing(false);
    socket.emit('draw-end', { roomId });
    setLastPos(null);
  };

  const drawLine = (stroke, ctx) => {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.x0, stroke.y0);
    ctx.lineTo(stroke.x1, stroke.y1);
    ctx.stroke();
  };

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        cursor: 'crosshair',
        backgroundColor: '#ffffff',
        width: '100vw',
        height: '100%',
        flexGrow: 1,
        touchAction: 'none', // Prevent zoom/pan on mobile
      }}
      onMouseDown={startDraw}
      onMouseMove={moveDraw}
      onMouseUp={endDraw}
      onMouseLeave={endDraw}
      onTouchStart={startDraw}
      onTouchMove={moveDraw}
      onTouchEnd={endDraw}
    />
  );
}

export default DrawingCanvas;
