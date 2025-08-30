// client/src/components/Toolbar.jsx
import React from "react";

function Toolbar({
  tool,
  setTool,
  socket,
  roomId,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  // optional optimistic handlers from Whiteboard (if passed)
  onAddStickyNote,
  onAddRectangle,
  onAddCircle,
  onClear,           // <-- optional clear handler
}) {
  const handleColorChange = (color) => setTool({ ...tool, color });
  const handleWidthChange = (e) =>
    setTool({ ...tool, width: parseInt(e.target.value || "1", 10) });

  // Clear canvas
  const clearCanvas = () => {
    if (onClear) return onClear();
    socket?.emit("clear-canvas", { roomId });
  };

  // Sticky note
  const addStickyNote = () => {
    if (onAddStickyNote) return onAddStickyNote();
    socket?.emit("shape:add", {
      roomId,
      shape: {
        _id: (typeof crypto !== "undefined" && crypto.randomUUID?.()) || String(Date.now()),
        type: "note",
        x: 100,
        y: 100,
        w: 180,
        h: 120,
        color: "#ffef8a",
        strokeWidth: 1,
        text: "New note",
      },
    });
  };

  // Rectangle
  const addRectangle = () => {
    if (onAddRectangle) return onAddRectangle();
    socket?.emit("shape:add", {
      roomId,
      shape: {
        _id: (typeof crypto !== "undefined" && crypto.randomUUID?.()) || String(Date.now()),
        type: "rect",
        x: 320,
        y: 120,
        w: 200,
        h: 120,
        color: "#111",
        strokeWidth: 2,
      },
    });
  };

  // Circle (ellipse with equal w/h)
  const addCircle = () => {
    if (onAddCircle) return onAddCircle();
    const size = 160;
    socket?.emit("shape:add", {
      roomId,
      shape: {
        _id: (typeof crypto !== "undefined" && crypto.randomUUID?.()) || String(Date.now()),
        type: "ellipse",
        x: 520,
        y: 160,
        w: size,
        h: size,
        color: "#111",
        strokeWidth: 2,
      },
    });
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        padding: "10px",
        gap: "12px",
        backgroundColor: "#ececec",
      }}
    >
      {/* Mode */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => setTool({ ...tool, mode: "draw" })}
          title="Draw mode"
          style={{
            padding: "6px 12px",
            border: "1px solid #999",
            borderRadius: 4,
            background: tool.mode === "draw" ? "#dfffe7" : "#fff",
            cursor: "pointer",
          }}
        >
          ✏️ Draw
        </button>
        <button
          onClick={() => setTool({ ...tool, mode: "select" })}
          title="Select/Move mode"
          style={{
            padding: "6px 12px",
            border: "1px solid #999",
            borderRadius: 4,
            background: tool.mode === "select" ? "#e6f0ff" : "#fff",
            cursor: "pointer",
          }}
        >
          🖱️ Select/Move
        </button>
      </div>

      {/* Color */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <label><strong>Color:</strong></label>
        {["black", "red", "blue", "green"].map((color) => (
          <button
            key={color}
            onClick={() => handleColorChange(color)}
            style={{
              backgroundColor: color,
              width: 20,
              height: 20,
              borderRadius: "50%",
              border: tool.color === color ? "2px solid #000" : "1px solid #aaa",
              cursor: "pointer",
            }}
            aria-label={`Set color ${color}`}
          />
        ))}
      </div>

      {/* Width */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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

      {/* Actions */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Ctrl+Z"
        style={{
          padding: "6px 12px",
          backgroundColor: canUndo ? "#fff" : "#f1f1f1",
          color: canUndo ? "inherit" : "#999",
          border: "1px solid #999",
          borderRadius: 4,
          cursor: canUndo ? "pointer" : "not-allowed",
        }}
      >
        ⎌ Undo
      </button>

      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Ctrl+Y"
        style={{
          padding: "6px 12px",
          backgroundColor: canRedo ? "#fff" : "#f1f1f1",
          color: canRedo ? "inherit" : "#999",
          border: "1px solid #999",
          borderRadius: 4,
          cursor: canRedo ? "pointer" : "not-allowed",
        }}
      >
        ↻ Redo
      </button>

      <button
        onClick={clearCanvas}
        style={{
          padding: "6px 12px",
          backgroundColor: "#fff",
          border: "1px solid #999",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        Clear Canvas
      </button>

      <button
        onClick={addStickyNote}
        style={{
          padding: "6px 12px",
          backgroundColor: "#ffef8a",
          border: "1px solid #999",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        + Sticky Note
      </button>

      <button
        onClick={addRectangle}
        style={{
          padding: "6px 12px",
          backgroundColor: "#e0e0e0",
          border: "1px solid #999",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        + Rectangle
      </button>

      <button
        onClick={addCircle}
        style={{
          padding: "6px 12px",
          backgroundColor: "#e0f2ff",
          border: "1px solid #999",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        + Circle
      </button>
    </div>
  );
}

export default Toolbar;
