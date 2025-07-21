## Setup Instructions

### 🔧 Prerequisites

- Node.js (v16 or later)
- MongoDB (local or cloud like MongoDB Atlas)
- npm or yarn

###  Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Akashxofficial/whiteboardapptask

   cd whiteboard-app
   ```

2. **Install dependencies for both frontend and backend:**

   ```bash
   cd backend
   npm install
   cd ../frontend
   npm install
   ```

3. **Environment Variables:**

   - Create `.env` in `backend/`:

     ```
     MONGO_URI=your_mongodb_connection_string
     PORT=5000
     ```

   - Create `.env` in `frontend/`:

     ```
     REACT_APP_API_URL=https://your-backend-url.onrender.com
     ```

4. **Run the app locally:**

   - Backend:

     ```bash
     cd backend
     npm run dev
     ```

   - Frontend:

     ```bash
     cd frontend
     npm start
     ```
