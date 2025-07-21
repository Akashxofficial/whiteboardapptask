##  Architecture Overview

### 🔧 Tech Stack

- **Frontend**: React.js + Socket.IO-client
- **Backend**: Node.js, Express.js + Socket.IO
- **Database**: MongoDB (Mongoose)

### 🧠 Component Overview

- `Whiteboard.jsx`: Entry point for canvas and users
- `DrawingCanvas.jsx`: Handles all drawing & emitting strokes
- `UserCursors.jsx`: Tracks and renders live cursors
- `socket/socket.js`: Handles real-time drawing, cursor, room, and cleanup logic

### 🗃️ Data Model

Room Document:
```js
{
  roomId: String,
  createdAt: Date,
  lastActivity: Date,
  drawingData: [
    {
      type: 'stroke' | 'clear',
      data: Object,
      timestamp: Date
    }
  ]
}
```
