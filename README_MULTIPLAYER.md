# Toepen Multiplayer Setup

## How to play with friends over the internet

### Prerequisites
- Node.js installed on your computer
- Internet connection
- Modern web browser

### Setup Instructions

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start the server**
   ```bash
   npm start
   ```

3. **Share your server**
   - The server will start on port 3000
   - For friends to connect, you need to share your public IP address
   - Your friends can connect to: `http://YOUR_PUBLIC_IP:3000`

### Quick Local Testing

1. **Start server**: `npm start`
2. **Open browser**: Go to `http://localhost:3000`
3. **Create room**: Click "Play with Friends" → Create Lobby
4. **Test with second browser window**: Open another browser window/tab to `http://localhost:3000` and join the room with the code

### For Internet Play

**Option 1: Port Forwarding (Recommended)**
1. Configure your router to forward port 3000 to your computer
2. Find your public IP address (google "what is my ip")
3. Share `http://YOUR_PUBLIC_IP:3000` with friends

**Option 2: Use ngrok (Easy but temporary)**
1. Install ngrok: `npm install -g ngrok`
2. Start server: `npm start`
3. In another terminal: `ngrok http 3000`
4. Share the ngrok URL (like `https://abc123.ngrok.io`) with friends

**Option 3: Deploy to Cloud (Permanent)**
- Deploy to Heroku, Railway, or similar service
- Update the Socket.io connection URL in the HTML file

### Game Flow
1. **Host creates room**: Gets a 6-character room code
2. **Friends join**: Enter the room code to join
3. **Host starts game**: When everyone is ready
4. **Play**: All players see synchronized game state

### Troubleshooting
- **Can't connect**: Check firewall/antivirus settings
- **Game not syncing**: Refresh browser and rejoin room
- **Port 3000 in use**: Change port in server.js (line: `const PORT = process.env.PORT || 3000;`)

Have fun playing Toepen with your friends! 🃏