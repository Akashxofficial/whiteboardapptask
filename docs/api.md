## 🌐 REST API

### `POST /api/rooms/join`
Join or create a whiteboard room.
```json
Request Body:
{
  "roomId": "ABC12345678"
}
```

### `GET /api/rooms/:roomId`
Fetch room data (if needed for playback or audit)

---

## 📡 Socket Events

### Client → Server

- `join-room`: `{ roomId }`
- `cursor-move`: `{ roomId, cursor: { x, y } }`
- `draw-start`, `draw-move`, `draw-end`: `{ roomId, stroke }`
- `clear-canvas`: `{ roomId }`

### Server → Client

- `user-count`: `Number`
- `cursor-update`: `{ socketId, cursor }`
- `draw-start`, `draw-move`, `draw-end`: `{ stroke }`
- `clear-canvas`: `void`
