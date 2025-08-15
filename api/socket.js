const { Server } = require('socket.io');

// Game rooms storage - in production you'd want Redis or a database
const gameRooms = new Map();

// Generate unique room codes
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Game logic functions
function createDeckAndDeal(gameState) {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = [
    {symbol: 'J', value: 1},
    {symbol: 'Q', value: 2},
    {symbol: 'K', value: 3},
    {symbol: 'A', value: 4},
    {symbol: '7', value: 5},
    {symbol: '8', value: 6},
    {symbol: '9', value: 7},
    {symbol: '10', value: 8}
  ];
  
  // Create deck
  gameState.deck = [];
  suits.forEach(suit => {
    ranks.forEach(rank => {
      gameState.deck.push({
        suit: suit,
        rank: rank.symbol,
        value: rank.value,
        color: (suit === '♥' || suit === '♦') ? 'red' : 'black'
      });
    });
  });
  
  // Shuffle deck
  for (let i = gameState.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [gameState.deck[i], gameState.deck[j]] = [gameState.deck[j], gameState.deck[i]];
  }
  
  // Deal 4 cards to each player
  gameState.players.forEach(player => {
    player.hand = [];
    for (let i = 0; i < 4; i++) {
      if (gameState.deck.length > 0) {
        player.hand.push(gameState.deck.pop());
      }
    }
  });
  
  // Check for Armoede after dealing cards
  if (hasArmoede(gameState)) {
    return 'armoede';
  }
  
  return 'normal';
}

function isValidPlay(gameState, card) {
  // If no lead suit set, any card is valid
  if (!gameState.leadSuit || gameState.currentTrick.length === 0) {
    return true;
  }
  
  // Find current player
  const currentPlayer = gameState.players[gameState.currentPlayer];
  
  // Must follow suit if possible
  const hasSuit = currentPlayer.hand.some(c => c.suit === gameState.leadSuit);
  if (hasSuit && card.suit !== gameState.leadSuit) {
    return false;
  }
  
  return true;
}

// Laundry detection functions
function hasArmoede(gameState) {
  return gameState.players.some(player => {
    const hasWitteWas = checkWitteWas(player.hand);
    const hasVuileWas = checkVuileWas(player.hand);
    return hasWitteWas || hasVuileWas;
  });
}

function checkWitteWas(hand) {
  const faceCards = hand.filter(card => ['J', 'Q', 'K'].includes(card.rank));
  return faceCards.length === 4;
}

function checkVuileWas(hand) {
  const faceCards = hand.filter(card => ['J', 'Q', 'K'].includes(card.rank));
  const sevens = hand.filter(card => card.rank === '7');
  return faceCards.length === 3 && sevens.length === 1;
}

const SocketHandler = (req, res) => {
  if (!res.socket.server.io) {
    console.log('Initializing Socket.io for Vercel...');
    
    const io = new Server(res.socket.server, {
      path: '/api/socket',
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    res.socket.server.io = io;

    io.on('connection', (socket) => {
      console.log('New client connected:', socket.id);

      socket.on('createRoom', (playerName) => {
        try {
          const roomCode = generateRoomCode();
          const gameState = {
            players: [{
              id: socket.id,
              name: playerName,
              hand: [],
              points: 0,
              isBot: false,
              isHost: true
            }],
            currentPlayer: 0,
            gamePhase: 'setup',
            stakes: 1,
            playerStakesOnEntry: [1],
            playersInRound: [0],
            currentTrick: [],
            trickNumber: 1,
            roundNumber: 1,
            leadSuit: null,
            tricksWon: [0],
            blindToepCaller: null,
            blindToepActive: false,
            pendingBlindToepDecisions: false
          };
          
          gameRooms.set(roomCode, gameState);
          socket.join(roomCode);
          socket.roomCode = roomCode;
          
          socket.emit('roomCreated', { roomCode, gameState });
          console.log(`Room ${roomCode} created by ${playerName}`);
        } catch (error) {
          console.error('Error creating room:', error);
          socket.emit('error', 'Failed to create room');
        }
      });

      socket.on('joinRoom', (data) => {
        try {
          const { roomCode, playerName } = data;
          const gameState = gameRooms.get(roomCode);
          
          if (!gameState) {
            socket.emit('error', 'Room not found');
            return;
          }
          
          if (gameState.players.length >= 4) {
            socket.emit('error', 'Room is full');
            return;
          }
          
          if (gameState.gamePhase !== 'setup') {
            socket.emit('error', 'Game already in progress');
            return;
          }
          
          const existingPlayer = gameState.players.find(p => p.name === playerName);
          if (existingPlayer) {
            socket.emit('error', 'Player name already taken');
            return;
          }
          
          const playerIndex = gameState.players.length;
          gameState.players.push({
            id: socket.id,
            name: playerName,
            hand: [],
            points: 0,
            isBot: false,
            isHost: false
          });
          
          socket.join(roomCode);
          socket.roomCode = roomCode;
          
          io.to(roomCode).emit('gameStateUpdate', gameState);
          console.log(`${playerName} joined room ${roomCode}`);
        } catch (error) {
          console.error('Error joining room:', error);
          socket.emit('error', 'Failed to join room');
        }
      });

      socket.on('startGame', () => {
        try {
          const roomCode = socket.roomCode;
          const gameState = gameRooms.get(roomCode);
          
          if (!gameState) {
            socket.emit('error', 'Room not found');
            return;
          }
          
          const player = gameState.players.find(p => p.id === socket.id);
          if (!player || !player.isHost) {
            socket.emit('error', 'Only host can start game');
            return;
          }
          
          if (gameState.players.length < 2) {
            socket.emit('error', 'Need at least 2 players');
            return;
          }
          
          // Initialize game state
          gameState.gamePhase = 'playing';
          gameState.playerStakesOnEntry = new Array(gameState.players.length).fill(1);
          gameState.playersInRound = gameState.players.map((_, i) => i);
          gameState.tricksWon = new Array(gameState.players.length).fill(0);
          
          const dealResult = createDeckAndDeal(gameState);
          
          if (dealResult === 'armoede') {
            gameState.gamePhase = 'laundryInspection';
            gameState.laundryTimeLeft = 10;
          }
          
          io.to(roomCode).emit('gameStateUpdate', gameState);
          console.log(`Game started in room ${roomCode}`);
        } catch (error) {
          console.error('Error starting game:', error);
          socket.emit('error', 'Failed to start game');
        }
      });

      socket.on('gameAction', (action) => {
        try {
          const roomCode = socket.roomCode;
          const gameState = gameRooms.get(roomCode);
          
          if (!gameState) {
            socket.emit('error', 'Room not found');
            return;
          }
          
          console.log(`Player ${socket.id} action:`, action.type, action);
          
          // Process the game action (simplified for this example)
          // You would implement the full game logic here
          
          io.to(roomCode).emit('gameStateUpdate', gameState);
        } catch (error) {
          console.error('Error processing game action:', error);
          socket.emit('error', 'Failed to process action');
        }
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        if (socket.roomCode) {
          const gameState = gameRooms.get(socket.roomCode);
          if (gameState) {
            const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
              const wasHost = gameState.players[playerIndex].isHost;
              gameState.players.splice(playerIndex, 1);
              
              // Reassign host if needed
              if (wasHost && gameState.players.length > 0) {
                gameState.players[0].isHost = true;
              }
              
              // Remove room if empty
              if (gameState.players.length === 0) {
                gameRooms.delete(socket.roomCode);
                console.log(`Room ${socket.roomCode} deleted (empty)`);
              } else {
                io.to(socket.roomCode).emit('gameStateUpdate', gameState);
              }
            }
          }
        }
      });
    });
  } else {
    console.log('Socket.io already initialized');
  }

  res.end();
};

export default SocketHandler;