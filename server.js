const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files (your HTML game)
app.use(express.static(path.join(__dirname)));

// Serve the game at the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'toepen.html'));
});

// Game rooms storage
const gameRooms = new Map();

// Generate unique room codes
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Socket connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Create or join a room
  socket.on('createRoom', (playerName) => {
    const roomCode = generateRoomCode();
    const room = {
      code: roomCode,
      host: socket.id,
      players: [{
        id: socket.id,
        name: playerName,
        isHost: true
      }],
      gameState: null,
      maxPlayers: 4,
      isGameStarted: false
    };
    
    gameRooms.set(roomCode, room);
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    socket.emit('roomCreated', {
      roomCode: roomCode,
      players: room.players
    });
    
    console.log(`Room ${roomCode} created by ${playerName}`);
  });

  socket.on('joinRoom', (data) => {
    const { roomCode, playerName } = data;
    const room = gameRooms.get(roomCode);
    
    if (!room) {
      socket.emit('joinError', 'Room not found');
      return;
    }
    
    if (room.players.length >= room.maxPlayers) {
      socket.emit('joinError', 'Room is full');
      return;
    }
    
    if (room.isGameStarted) {
      socket.emit('joinError', 'Game already started');
      return;
    }
    
    // Check if player is already in the room
    if (room.players.some(p => p.id === socket.id)) {
      socket.emit('joinError', 'You are already in this room');
      return;
    }
    
    // Add player to room
    room.players.push({
      id: socket.id,
      name: playerName,
      isHost: false
    });
    
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    // Notify all players in room
    io.to(roomCode).emit('playerJoined', {
      players: room.players,
      joinedPlayer: playerName
    });
    
    console.log(`${playerName} joined room ${roomCode}`);
  });

  // Start game
  socket.on('startGame', () => {
    const roomCode = socket.roomCode;
    const room = gameRooms.get(roomCode);
    
    if (!room || room.host !== socket.id) {
      socket.emit('error', 'Not authorized to start game');
      return;
    }
    
    if (room.players.length < 2) {
      socket.emit('error', 'Need at least 2 players to start');
      return;
    }
    
    room.isGameStarted = true;
    
    // Initialize game state
    room.gameState = {
      players: room.players.map((p, index) => ({
        id: p.id,
        name: p.name,
        points: 0,
        hand: [],
        index: index
      })),
      currentPlayer: 0,
      round: 1,
      stakes: 1,
      gamePhase: 'starting',
      deck: [],
      currentTrick: [],
      tricksPlayed: 0,
      playersInRound: [],
      roundTrickWins: [],
      lastToeper: -1,
      awaitingInspection: false,
      pendingLaundry: null
    };
    
    // Notify all players that game is starting
    io.to(roomCode).emit('gameStarted', {
      gameState: room.gameState
    });
    
    console.log(`Game started in room ${roomCode}`);
  });

  // Game action handlers
  socket.on('gameAction', (action) => {
    const roomCode = socket.roomCode;
    const room = gameRooms.get(roomCode);
    
    if (!room || !room.isGameStarted) {
      socket.emit('error', 'Game not found or not started');
      return;
    }
    
    // Find player index
    const playerIndex = room.gameState.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) {
      socket.emit('error', 'Player not in game');
      return;
    }
    
    // Process the action and update game state
    processGameAction(room, playerIndex, action);
    
    // Broadcast updated game state to all players
    io.to(roomCode).emit('gameStateUpdate', {
      gameState: room.gameState,
      lastAction: action
    });
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    if (socket.roomCode) {
      const room = gameRooms.get(socket.roomCode);
      if (room) {
        // Remove player from room
        room.players = room.players.filter(p => p.id !== socket.id);
        
        // If room is empty, delete it
        if (room.players.length === 0) {
          gameRooms.delete(socket.roomCode);
          console.log(`Room ${socket.roomCode} deleted (empty)`);
        } else {
          // If host disconnected, make someone else host
          if (room.host === socket.id && room.players.length > 0) {
            room.host = room.players[0].id;
            room.players[0].isHost = true;
          }
          
          // Notify remaining players
          io.to(socket.roomCode).emit('playerLeft', {
            players: room.players,
            disconnectedId: socket.id
          });
        }
      }
    }
  });
});

// Game action processor
function processGameAction(room, playerIndex, action) {
  const gameState = room.gameState;
  
  switch (action.type) {
    case 'playCard':
      if (gameState.currentPlayer === playerIndex && gameState.gamePhase === 'playing') {
        // Process card play
        const card = gameState.players[playerIndex].hand[action.cardIndex];
        gameState.players[playerIndex].hand.splice(action.cardIndex, 1);
        gameState.currentTrick.push({ card: card, player: playerIndex });
        
        // Move to next player or evaluate trick
        if (gameState.currentTrick.length === gameState.playersInRound.length) {
          // Trick complete - evaluate winner
          evaluateTrick(gameState);
        } else {
          // Next player's turn
          gameState.currentPlayer = getNextPlayer(gameState);
        }
      }
      break;
      
    case 'toep':
      if (gameState.currentPlayer === playerIndex && gameState.gamePhase === 'playing' && gameState.lastToeper !== playerIndex) {
        gameState.stakes += 1;
        gameState.lastToeper = playerIndex;
        gameState.gamePhase = 'toepResponse';
      }
      break;
      
    case 'fold':
      if (gameState.playersInRound.includes(playerIndex)) {
        // Player folds - remove from round
        gameState.playersInRound = gameState.playersInRound.filter(p => p !== playerIndex);
        // Add penalty points based on stakes when they entered
        gameState.players[playerIndex].points += gameState.stakes;
      }
      break;
      
    case 'submitLaundry':
      if (gameState.gamePhase === 'laundry' && !gameState.awaitingInspection) {
        gameState.pendingLaundry = {
          playerIndex: playerIndex,
          type: action.laundryType,
          cards: [...gameState.players[playerIndex].hand]
        };
        gameState.awaitingInspection = true;
      }
      break;
      
    case 'inspectLaundry':
      if (gameState.awaitingInspection && gameState.pendingLaundry) {
        processLaundryInspection(gameState, playerIndex);
      }
      break;
  }
}

function evaluateTrick(gameState) {
  // Evaluate trick winner (simplified - you can copy the full logic from your frontend)
  let winner = gameState.currentTrick[0];
  gameState.currentTrick.forEach(play => {
    if (play.card.value > winner.card.value) {
      winner = play;
    }
  });
  
  gameState.roundTrickWins[winner.player]++;
  gameState.currentTrick = [];
  gameState.tricksPlayed++;
  gameState.currentPlayer = winner.player;
  
  // Check if round is complete
  if (gameState.tricksPlayed === 4) {
    endRound(gameState);
  }
}

function getNextPlayer(gameState) {
  const currentIndex = gameState.playersInRound.indexOf(gameState.currentPlayer);
  const nextIndex = (currentIndex + 1) % gameState.playersInRound.length;
  return gameState.playersInRound[nextIndex];
}

function endRound(gameState) {
  // Find winner (most tricks)
  let maxTricks = Math.max(...gameState.roundTrickWins);
  let winners = [];
  gameState.roundTrickWins.forEach((tricks, index) => {
    if (tricks === maxTricks) {
      winners.push(index);
    }
  });
  
  // Award penalty points to non-winners
  gameState.players.forEach((player, index) => {
    if (!winners.includes(index)) {
      player.points += gameState.stakes;
    }
  });
  
  // Reset for next round
  gameState.round++;
  gameState.stakes = 1;
  gameState.lastToeper = -1;
  gameState.roundTrickWins = new Array(gameState.players.length).fill(0);
  gameState.tricksPlayed = 0;
  gameState.gamePhase = 'laundry';
  gameState.playersInRound = gameState.players.map((_, index) => index).filter(i => gameState.players[i].points < 10);
}

function processLaundryInspection(gameState, inspectorIndex) {
  // Process laundry inspection (copy logic from frontend)
  // This is simplified - you can implement the full laundry logic
  gameState.awaitingInspection = false;
  gameState.pendingLaundry = null;
  gameState.gamePhase = 'playing';
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🃏 Toepen server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});