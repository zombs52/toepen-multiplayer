# Vercel Deployment Instructions

## Quick Deployment Options

### Option 1: GitHub Integration (Recommended)
1. Push this repository to GitHub
2. Go to [vercel.com](https://vercel.com) and sign in
3. Click "New Project"
4. Import your GitHub repository
5. Deploy automatically

### Option 2: Vercel CLI
1. Install Vercel CLI: `npm install -g vercel`
2. Login: `vercel login`
3. Deploy: `vercel --prod`

## Project Structure
- `toepen.html` - Main game file
- `api/socket.js` - Serverless Socket.io handler
- `vercel.json` - Vercel configuration
- `index.html` - Redirect to main game

## Features
- ✅ Free permanent hosting
- ✅ Automatic deployments on Git push
- ✅ Custom domains supported
- ✅ Socket.io multiplayer support
- ✅ No subscription required

## Local Testing
Run locally: `npm start` (uses original server.js)
Run on Vercel: Automatic deployment

## Environment Variables
None required for basic functionality.

## Troubleshooting
- Socket.io connects via `/api/socket` path
- Frontend automatically detects Vercel environment
- All multiplayer functionality preserved