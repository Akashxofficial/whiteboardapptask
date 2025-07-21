#Deployed : https://whiteboardapptask.vercel.app/

##  Deployment Guide

### 🔁 Backend on Render

1. Push `backend/` to GitHub
2. Create new service on [Render](https://render.com)
3. Set build command: `npm install`
4. Start command: `npm start`
5. Add environment variables:
   - `MONGO_URI`
   - `PORT` = 5000

### ⚛️ Frontend on Vercel

1. Push `frontend/` to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Set environment variable:
   - `REACT_APP_API_URL=https://your-backend.onrender.com`

Done! Once deployed, your collaborative whiteboard is live with:

- Live drawing sync
- Real-time cursor sharing
- User presence tracking
- Room cleanup after 24 hours
