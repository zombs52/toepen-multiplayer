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
function isVuileWas(hand) {
  const faceCards = hand.filter(card => ['J', 'Q', 'K', 'A'].includes(card.rank));
  const sevens = hand.filter(card => card.rank === '7');
  return faceCards.length === 3 && sevens.length === 1;
}

function isWitteWas(hand) {
  const faceCards = hand.filter(card => ['J', 'Q', 'K', 'A'].includes(card.rank));
  return faceCards.length === 4;
}

function hasLaundry(hand) {
  return isVuileWas(hand) || isWitteWas(hand);
}

function getLaundryType(hand) {
  if (isWitteWas(hand)) return 'witte';
  if (isVuileWas(hand)) return 'vuile';
  return null;
}

function processLaundryInspection(gameState, inspectorIndex, room) {
  if (!gameState.pendingLaundry) return;

  const { playerIndex, type, cards } = gameState.pendingLaundry;
  const player = gameState.players[playerIndex];

  const isValidLaundry = type === 'witte' ? isWitteWas(cards) : isVuileWas(cards);

  // Always give player new hand when inspected
  player.hand = [];
  for (let i = 0; i < 4; i++) {
    if (gameState.deck.length > 0) {
      player.hand.push(gameState.deck.pop());
    }
  }
  
  if (isValidLaundry) {
    // Valid laundry - inspector gets penalty
    gameState.players[inspectorIndex].points += 1;
    gameState.laundryResult = {
      type: 'validClaim',
      inspector: inspectorIndex,
      claimer: playerIndex,
      claimType: type,
      actualCards: cards  // Include the actual cards for visual display
    };
  } else {
    // Invalid laundry - bluff caught, claimer gets penalty and visible cards
    player.points += 1;
    player.cardsVisible = true;
    gameState.laundryResult = {
      type: 'invalidClaim', 
      inspector: inspectorIndex,
      claimer: playerIndex,
      claimType: type,
      actualCards: cards  // Include the actual cards they were bluffing with
    };
  }

  gameState.pendingLaundry = null;
  gameState.awaitingInspection = false;
  
  // Continue with laundry phase or move to playing
  if (gameState.deck.length >= 4) {
    // More laundry possible - reset timer
    gameState.gamePhase = 'laundry';
    setTimeout(() => {
      if (gameState.gamePhase === 'laundry' && !gameState.awaitingInspection) {
        gameState.gamePhase = 'playing';
        broadcastSecureGameState(room, { type: 'laundryPhaseEnd' });
      }
    }, 10000);
  } else {
    gameState.gamePhase = 'playing';
  }
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
    
    // Send lobby state to the joining player
    socket.emit('roomJoined', {
      roomCode: roomCode,
      players: room.players,
      isHost: false
    });
    
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
        index: index,
        cardsVisible: false
      })),
      currentPlayer: 0,
      round: 1,
      stakes: 1,
      gamePhase: 'laundry',
      deck: [],
      currentTrick: [],
      tricksPlayed: 0,
      playersInRound: [...Array(room.players.length).keys()],
      roundTrickWins: new Array(room.players.length).fill(0),
      playerStakesOnEntry: new Array(room.players.length).fill(1),
      lastToeper: -1,
      awaitingInspection: false,
      pendingLaundry: null,
      leadSuit: null,
      lastRoundWinner: undefined
    };
    
    // Create deck and deal cards
    const dealResult = createDeckAndDeal(room.gameState);
    
    if (dealResult === 'armoede') {
      // Someone has Armoede - enter Armoede phase
      room.gameState.gamePhase = 'armoede';
      room.gameState.armoedePlayers = getArmoedePlayers(room.gameState);
      room.gameState.armoedePenalty = 2; // Armoede penalty is 2 points (like toep doubles stakes)
      
      // Initialize Armoede responses
      room.gameState.armoedeResponses = new Array(room.gameState.players.length).fill(null);
      
      // Set timeout for auto-responses
      setTimeout(() => {
        if (room.gameState.gamePhase === 'armoede' && room.gameState.armoedeResponses) {
          handleArmoedeTimeout(room.gameState, room);
        }
      }, 30000);
    }
    
    // Notify all players that game is starting
    broadcastSecureGameState(room, { type: 'gameStarted' });
    
    // Start laundry timer (10 seconds)
    setTimeout(() => {
      if (room.gameState && room.gameState.gamePhase === 'laundry' && !room.gameState.awaitingInspection) {
        room.gameState.gamePhase = 'playing';
        broadcastSecureGameState(room, { type: 'laundryPhaseEnd' });
      }
    }, 10000);
    
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
    
    console.log(`Player ${playerIndex} (${room.gameState.players[playerIndex].name}) action: ${action.type}`, action);
    console.log(`Game phase: ${room.gameState.gamePhase}, Current player: ${room.gameState.currentPlayer}`);
    
    // Process the action and update game state
    const shouldBroadcast = processGameAction(room, playerIndex, action);
    
    // Broadcast updated game state to all players (if not already done in processGameAction)
    if (shouldBroadcast) {
      const actionWithPlayer = { ...action, playerIndex: playerIndex };
      broadcastSecureGameState(room, actionWithPlayer);
    }
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    if (socket.roomCode) {
      const room = gameRooms.get(socket.roomCode);
      if (room) {
        // Find the disconnected player's name BEFORE removing them
        const disconnectedPlayer = room.players.find(p => p.id === socket.id);
        const playerName = disconnectedPlayer ? disconnectedPlayer.name : 'Unknown Player';
        
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
            disconnectedId: socket.id,
            playerName: playerName,
            newHost: room.host // Include new host info
          });
        }
      }
    }
  });
});

// Check if a player would be eliminated if they lose this round (playing for death)
function isPlayingForDeath(gameState, playerIndex) {
  const player = gameState.players[playerIndex];
  const playerEntryStakes = gameState.playerStakesOnEntry[playerIndex];
  return (player.points + playerEntryStakes) >= 10;
}

// Check if any player has exactly 9 points (Armoede condition)
function hasArmoede(gameState) {
  return gameState.players.some((player, index) => 
    player.points === 9 && gameState.playersInRound.includes(index)
  );
}

// Get players who have Armoede (9 points)
function getArmoedePlayers(gameState) {
  return gameState.players
    .map((player, index) => ({ player, index }))
    .filter(({ player, index }) => 
      player.points === 9 && gameState.playersInRound.includes(index)
    )
    .map(({ index }) => index);
}

// Handle Armoede timeout - auto-accept for remaining players
function handleArmoedeTimeout(gameState, room) {
  gameState.playersInRound.forEach(playerIndex => {
    if (gameState.armoedeResponses[playerIndex] === null) {
      gameState.armoedeResponses[playerIndex] = 'accept'; // Auto-accept
      gameState.playerStakesOnEntry[playerIndex] = gameState.armoedePenalty;
    }
  });
  
  processArmoedeResponses(gameState, room);
}

// Process all Armoede responses and continue to game
function processArmoedeResponses(gameState, room) {
  // Check if all players have responded
  const activePlayerResponses = gameState.playersInRound
    .map(playerIndex => gameState.armoedeResponses[playerIndex])
    .filter(response => response !== null);

  if (activePlayerResponses.length === gameState.playersInRound.length) {
    // Process folded players
    const foldedPlayers = [];
    gameState.playersInRound.forEach(playerIndex => {
      if (gameState.armoedeResponses[playerIndex] === 'fold') {
        foldedPlayers.push(playerIndex);
        gameState.players[playerIndex].points += 1; // Folding to Armoede gives 1 penalty point
      }
    });
    
    // Remove folded players from round
    gameState.playersInRound = gameState.playersInRound.filter(
      playerIndex => !foldedPlayers.includes(playerIndex)
    );
    
    // Check if only one player left
    if (gameState.playersInRound.length === 1) {
      endRound(gameState, room);
      return;
    }
    
    // Move to playing phase
    gameState.gamePhase = 'playing';
    gameState.armoedeResponses = null;
    
    // Broadcast the completed responses
    broadcastSecureGameState(room, { type: 'armoedeResponsesComplete', foldedPlayers });
  }
}

// Security: Create a filtered game state for a specific player (only shows their own cards)
function getFilteredGameStateForPlayer(gameState, targetPlayerIndex) {
  const filteredState = JSON.parse(JSON.stringify(gameState)); // Deep clone
  
  // Filter each player's hand - only show cards to the owning player
  filteredState.players.forEach((player, index) => {
    if (index !== targetPlayerIndex) {
      // Check if cards should be visible due to game mechanics
      if (player.cardsVisible || 
          gameState.gamePhase === 'laundry' || 
          gameState.awaitingInspection ||
          (gameState.pendingLaundry && gameState.pendingLaundry.playerIndex === index)) {
        // Cards should be visible - don't filter them
        return;
      }
      
      // Hide other players' cards - replace with placeholder cards that maintain structure
      player.hand = player.hand.map(() => ({ 
        suit: 'hidden', 
        rank: '?', 
        value: 0 
      }));
    }
    // Own cards remain visible
  });
  
  return filteredState;
}

// Security: Broadcast game state with each player receiving only their own cards
function broadcastSecureGameState(room, lastAction) {
  room.players.forEach((player, index) => {
    if (player.id && io.sockets.sockets.get(player.id)) {
      const filteredState = getFilteredGameStateForPlayer(room.gameState, index);
      io.to(player.id).emit('gameStateUpdate', {
        gameState: filteredState,
        lastAction: lastAction
      });
    }
  });
}

// Game action processor - returns true if main handler should broadcast, false if already handled
function processGameAction(room, playerIndex, action) {
  const gameState = room.gameState;
  const roomCode = room.code;
  
  switch (action.type) {
    case 'playCard':
      if (gameState.currentPlayer === playerIndex && 
          gameState.gamePhase === 'playing' && 
          gameState.playersInRound.includes(playerIndex) &&
          action.cardIndex >= 0 && 
          action.cardIndex < gameState.players[playerIndex].hand.length) {
        
        const card = gameState.players[playerIndex].hand[action.cardIndex];
        
        // Validate the play (basic suit following)
        if (isValidPlay(gameState, card)) {
          // Remove card from player's hand
          gameState.players[playerIndex].hand.splice(action.cardIndex, 1);
          gameState.currentTrick.push({ card: card, player: playerIndex });
          
          // Set lead suit if this is the first card
          if (gameState.currentTrick.length === 1) {
            gameState.leadSuit = card.suit;
          }
          
          // Move to next player or evaluate trick
          if (gameState.currentTrick.length === gameState.playersInRound.length) {
            // Trick complete - show all cards for 3 seconds before evaluating
            setTimeout(() => {
              evaluateTrick(gameState, room);
              // Broadcast updated state after trick evaluation
              broadcastSecureGameState(room, { type: 'trickComplete' });
            }, 3000);
          } else {
            // Next player's turn
            gameState.currentPlayer = getNextPlayer(gameState);
          }
        }
      }
      return true;
      
    case 'toep':
      if (gameState.currentPlayer === playerIndex && gameState.gamePhase === 'playing' && gameState.lastToeper !== playerIndex) {
        // Check if player is playing for death (would be eliminated if they lose)
        if (isPlayingForDeath(gameState, playerIndex)) {
          // Send subtle notification to the player who tried to toep
          const playerSocket = room.players.find(p => p.index === playerIndex)?.id;
          if (playerSocket) {
            const filteredState = getFilteredGameStateForPlayer(gameState, playerIndex);
            io.to(playerSocket).emit('gameStateUpdate', {
              gameState: filteredState,
              lastAction: { 
                type: 'playingForDeathToepAttempt', 
                playerIndex: playerIndex,
                message: "You're already playing for your death, you can't toep"
              }
            });
          }
          return false;
        }
        
        gameState.stakes += 1;
        gameState.lastToeper = playerIndex;
        gameState.gamePhase = 'toepResponse';
        
        // Update stakes tracking for toeper
        gameState.playerStakesOnEntry[playerIndex] = gameState.stakes;
        
        // Initialize toep responses
        gameState.toepResponses = new Array(gameState.players.length).fill(null);
        gameState.toepResponses[playerIndex] = 'accept'; // Toeper automatically accepts
        
        // IMPORTANT: Immediately broadcast the toep to all players so they can respond
        broadcastSecureGameState(room, { type: 'toep', playerIndex: playerIndex });
        
        // In multiplayer, we don't auto-handle responses - let real players respond
        // Just set a timeout to auto-accept any remaining null responses after 30 seconds
        setTimeout(() => {
          if (gameState.gamePhase === 'toepResponse' && gameState.toepResponses) {
            handleAIToepResponses(gameState, room);
            // Broadcast the updated state after timeout
            broadcastSecureGameState(room, { type: 'autoToepResponse' });
          }
        }, 30000);
      }
      return false; // Already broadcasted
      
    case 'acceptToep':
      if (gameState.gamePhase === 'toepResponse' && gameState.toepResponses && gameState.toepResponses[playerIndex] === null) {
        gameState.toepResponses[playerIndex] = 'accept';
        // Update stakes tracking for accepting player
        gameState.playerStakesOnEntry[playerIndex] = gameState.stakes;
        
        // Broadcast the acceptance immediately
        broadcastSecureGameState(room, { type: 'acceptToep', playerIndex: playerIndex });
        
        checkToepResponses(gameState, room);
      } else if (gameState.gamePhase === 'blindToepResponse' && gameState.blindToepResponses && gameState.blindToepResponses[playerIndex] === null) {
        gameState.blindToepResponses[playerIndex] = 'accept';
        // Stakes tracking already set to 3 for all players
        
        // Broadcast the acceptance immediately
        broadcastSecureGameState(room, { type: 'acceptBlindToep', playerIndex: playerIndex });
        
        checkBlindToepResponses(gameState, room);
      }
      return false; // Already broadcasted
      
    case 'foldToToep':
      if (gameState.gamePhase === 'toepResponse' && gameState.toepResponses && gameState.toepResponses[playerIndex] === null) {
        // Check if player is playing for death - they cannot fold, must accept
        if (isPlayingForDeath(gameState, playerIndex)) {
          // Force accept instead of fold
          gameState.toepResponses[playerIndex] = 'accept';
          gameState.playerStakesOnEntry[playerIndex] = gameState.stakes;
          
          // Send message explaining automatic acceptance
          const filteredState = getFilteredGameStateForPlayer(gameState, playerIndex);
          io.to(room.players.find(p => p.index === playerIndex)?.id).emit('gameStateUpdate', {
            gameState: filteredState,
            lastAction: { type: 'forcedAcceptToep', playerIndex: playerIndex, message: 'You are playing for death - automatically accept toep!' }
          });
          
          checkToepResponses(gameState, room);
          return false; // Already broadcasted
        }
        
        gameState.toepResponses[playerIndex] = 'fold';
        
        // Broadcast the fold immediately
        broadcastSecureGameState(room, { type: 'foldToToep', playerIndex: playerIndex });
        
        checkToepResponses(gameState, room);
      } else if (gameState.gamePhase === 'blindToepResponse' && gameState.blindToepResponses && gameState.blindToepResponses[playerIndex] === null) {
        gameState.blindToepResponses[playerIndex] = 'fold';
        
        // Player gets penalty based on their entry stakes (1 point, not 3)
        const penaltyPoints = gameState.playerStakesOnEntry[playerIndex];
        gameState.players[playerIndex].points += penaltyPoints;
        gameState.playersInRound = gameState.playersInRound.filter(p => p !== playerIndex);
        
        // Broadcast the fold immediately
        broadcastSecureGameState(room, { type: 'foldToBlindToep', playerIndex: playerIndex });
        
        checkBlindToepResponses(gameState, room);
      }
      return false; // Already broadcasted
      
    case 'fold':
      if (gameState.playersInRound.includes(playerIndex)) {
        // Player folds - remove from round
        gameState.playersInRound = gameState.playersInRound.filter(p => p !== playerIndex);
        // Add penalty points based on stakes when they entered
        gameState.players[playerIndex].points += gameState.playerStakesOnEntry[playerIndex];
        
        // Check if only one player remains
        if (gameState.playersInRound.length === 1) {
          // End the round - last player wins
          endRound(gameState, room);
          return true;
        }
        
        // If the folding player was the current player, advance to next player
        if (gameState.currentPlayer === playerIndex) {
          gameState.currentPlayer = getNextPlayer(gameState);
        }
      }
      return true;
      
    case 'acceptArmoede':
      if (gameState.gamePhase === 'armoede' && gameState.armoedeResponses && gameState.armoedeResponses[playerIndex] === null) {
        gameState.armoedeResponses[playerIndex] = 'accept';
        // Update stakes tracking for accepting player
        gameState.playerStakesOnEntry[playerIndex] = gameState.armoedePenalty;
        
        // Broadcast the acceptance immediately
        broadcastSecureGameState(room, { type: 'acceptArmoede', playerIndex: playerIndex });
        
        processArmoedeResponses(gameState, room);
      }
      return false; // Already broadcasted
      
    case 'foldToArmoede':
      if (gameState.gamePhase === 'armoede' && gameState.armoedeResponses && gameState.armoedeResponses[playerIndex] === null) {
        gameState.armoedeResponses[playerIndex] = 'fold';
        
        // Broadcast the fold immediately
        broadcastSecureGameState(room, { type: 'foldToArmoede', playerIndex: playerIndex });
        
        processArmoedeResponses(gameState, room);
      }
      return false; // Already broadcasted
      
    case 'submitLaundry':
      if (gameState.gamePhase === 'laundry' && !gameState.awaitingInspection && gameState.deck.length >= 4) {
        gameState.pendingLaundry = {
          playerIndex: playerIndex,
          type: action.laundryType,
          cards: [...gameState.players[playerIndex].hand]
        };
        gameState.awaitingInspection = true;
        
        // Set timeout for auto-processing if no inspection
        setTimeout(() => {
          if (gameState.awaitingInspection && gameState.pendingLaundry && 
              gameState.pendingLaundry.playerIndex === playerIndex) {
            // No one inspected - player gets new cards regardless
            const player = gameState.players[playerIndex];
            player.hand = [];
            for (let i = 0; i < 4; i++) {
              if (gameState.deck.length > 0) {
                player.hand.push(gameState.deck.pop());
              }
            }
            
            gameState.pendingLaundry = null;
            gameState.awaitingInspection = false;
            
            // Continue laundry phase or end it
            if (gameState.deck.length >= 4) {
              gameState.gamePhase = 'laundry';
              // Set timer to end laundry phase
              setTimeout(() => {
                if (gameState.gamePhase === 'laundry' && !gameState.awaitingInspection) {
                  gameState.gamePhase = 'playing';
                  broadcastSecureGameState(room, { type: 'laundryPhaseEnd' });
                }
              }, 10000);
            } else {
              gameState.gamePhase = 'playing';
            }
            
            // Broadcast the result
            broadcastSecureGameState(room, { type: 'laundryTimeout', playerIndex: playerIndex });
          }
        }, 10000);
      }
      return true;
      
    case 'inspectLaundry':
      if (gameState.awaitingInspection && gameState.pendingLaundry && 
          gameState.pendingLaundry.playerIndex !== playerIndex) {
        const claimerIndex = gameState.pendingLaundry.playerIndex;
        processLaundryInspection(gameState, playerIndex, room);
        
        // Broadcast the inspection result
        broadcastSecureGameState(room, { type: 'laundryInspected', playerIndex: playerIndex, claimerIndex: claimerIndex });
      }
      return false; // Already broadcasted or invalid
      
    case 'blindToep':
      // Only allow during roundEnd phase
      if (gameState.gamePhase === 'roundEnd' && !gameState.blindToepCaller) {
        gameState.blindToepCaller = playerIndex;
        // Blind toep will be processed when the next round starts
        return true;
      }
      return false;
      
    default:
      return true;
  }
  
  return true; // Default case
}

function getNextPlayer(gameState) {
  const currentIndex = gameState.playersInRound.indexOf(gameState.currentPlayer);
  const nextIndex = (currentIndex + 1) % gameState.playersInRound.length;
  return gameState.playersInRound[nextIndex];
}

function evaluateTrick(gameState, room) {
  if (gameState.currentTrick.length === 0) return;
  
  // Find winner - highest card of lead suit wins
  let winner = gameState.currentTrick[0];
  
  gameState.currentTrick.forEach(play => {
    // Only cards of lead suit can win
    if (play.card.suit === gameState.leadSuit && 
        winner.card.suit === gameState.leadSuit) {
      if (play.card.value > winner.card.value) {
        winner = play;
      }
    } else if (play.card.suit === gameState.leadSuit && 
               winner.card.suit !== gameState.leadSuit) {
      // This card follows suit, current winner doesn't
      winner = play;
    }
  });
  
  gameState.roundTrickWins[winner.player]++;
  const winnerName = gameState.players[winner.player].name;
  gameState.currentTrick = [];
  gameState.tricksPlayed++;
  gameState.currentPlayer = winner.player;
  gameState.leadSuit = null;
  
  // Set trick winner message for display
  gameState.lastTrickWinner = winnerName;
  
  // Check if round is complete
  if (gameState.tricksPlayed === 4) {
    endRound(gameState, room);
  }
}

function endRound(gameState, room) {
  console.log('=== END ROUND DEBUG ===');
  console.log('Players in round:', gameState.playersInRound.map(i => `${i}:${gameState.players[i].name}`));
  console.log('Trick wins:', gameState.roundTrickWins.map((wins, i) => `${i}:${wins}`));
  console.log('Stakes on entry:', gameState.playerStakesOnEntry.map((stakes, i) => `${i}:${stakes}`));
  
  // Find winner (most tricks)
  let maxTricks = Math.max(...gameState.roundTrickWins);
  let winners = [];
  gameState.roundTrickWins.forEach((tricks, index) => {
    if (tricks === maxTricks && gameState.playersInRound.includes(index)) {
      winners.push(index);
    }
  });
  
  console.log('Max tricks:', maxTricks);
  console.log('Winners:', winners.map(i => `${i}:${gameState.players[i].name}`));
  
  // Award penalty points to non-winners (based on their entry stakes)
  gameState.playersInRound.forEach(playerIndex => {
    if (!winners.includes(playerIndex)) {
      const penaltyPoints = gameState.playerStakesOnEntry[playerIndex];
      console.log(`Giving ${penaltyPoints} penalty points to ${playerIndex}:${gameState.players[playerIndex].name}`);
      gameState.players[playerIndex].points += penaltyPoints;
    } else {
      console.log(`${playerIndex}:${gameState.players[playerIndex].name} is winner, no penalty`);
    }
  });
  
  // Store round winner for next round's starting player
  gameState.lastRoundWinner = winners.length === 1 ? winners[0] : winners[0]; // If tie, pick first winner
  
  // Reset for next round
  gameState.round++;
  gameState.stakes = 1;
  gameState.lastToeper = -1;
  gameState.roundTrickWins = new Array(gameState.players.length).fill(0);
  gameState.playerStakesOnEntry = new Array(gameState.players.length).fill(1);
  gameState.tricksPlayed = 0;
  gameState.currentTrick = []; // Clear any cards left on the table
  gameState.leadSuit = null; // Clear lead suit
  gameState.gamePhase = 'roundEnd';
  
  // Check for eliminated players
  gameState.playersInRound = gameState.players
    .map((_, index) => index)
    .filter(i => gameState.players[i].points < 10);
  
  // Check if game is over
  if (gameState.playersInRound.length <= 1) {
    gameState.gamePhase = 'gameEnd';
  } else {
    // Continue with new round after a delay
    setTimeout(() => {
      gameState.gamePhase = 'laundry';
      // Set starting player to last round's winner (if they're still in the game)
      if (gameState.lastRoundWinner !== undefined && 
          gameState.playersInRound.includes(gameState.lastRoundWinner)) {
        gameState.currentPlayer = gameState.lastRoundWinner;
      } else {
        // Fallback to first active player if winner was eliminated
        gameState.currentPlayer = gameState.playersInRound[0];
      }
      
      // Reset card visibility for new round
      gameState.players.forEach(player => {
        player.cardsVisible = false;
      });
      
      // Create new deck and deal cards
      const dealResult = createDeckAndDeal(gameState);
      
      if (dealResult === 'armoede') {
        // Someone has Armoede - enter Armoede phase
        gameState.gamePhase = 'armoede';
        gameState.armoedePlayers = getArmoedePlayers(gameState);
        gameState.armoedePenalty = 2; // Armoede penalty is 2 points
        
        // Initialize Armoede responses
        gameState.armoedeResponses = new Array(gameState.players.length).fill(null);
        
        // Set timeout for auto-responses
        setTimeout(() => {
          if (gameState.gamePhase === 'armoede' && gameState.armoedeResponses) {
            handleArmoedeTimeout(gameState, room);
          }
        }, 30000);
        
        // Broadcast the Armoede phase
        broadcastSecureGameState(room, { type: 'armoede', armoedePlayers: gameState.armoedePlayers });
        return;
      }
      
      // Process blind toep if someone called it
      if (gameState.blindToepCaller !== undefined && gameState.blindToepCaller >= 0) {
        gameState.stakes = 3;
        gameState.playerStakesOnEntry = new Array(gameState.players.length).fill(3);
        gameState.lastToeper = gameState.blindToepCaller;
        gameState.pendingBlindToepResponse = true;
        gameState.blindToepCaller = -1; // Reset after using
      }
      
      // Start new laundry timer
      setTimeout(() => {
        if (gameState.gamePhase === 'laundry' && !gameState.awaitingInspection) {
          // Check if there's a pending blind toep response
          if (gameState.pendingBlindToepResponse) {
            processServerBlindToepResponse(gameState, room);
          } else {
            gameState.gamePhase = 'playing';
            broadcastSecureGameState(room, { type: 'laundryPhaseEnd' });
          }
        }
      }, 10000);
      
      // Broadcast new round state
      broadcastSecureGameState(room, { type: 'newRound' });
    }, 3000);
  }
}


function checkToepResponses(gameState, room) {
  // Auto-accept for players playing for death who haven't responded yet
  gameState.playersInRound.forEach(playerIndex => {
    if (gameState.toepResponses[playerIndex] === null && isPlayingForDeath(gameState, playerIndex)) {
      gameState.toepResponses[playerIndex] = 'accept';
      gameState.playerStakesOnEntry[playerIndex] = gameState.stakes;
      
      // Send message to all players about the auto-acceptance
      broadcastSecureGameState(room, { 
        type: 'autoAcceptToep', 
        playerIndex: playerIndex, 
        message: `${gameState.players[playerIndex].name} is playing for death - automatically accepts toep!` 
      });
    }
  });

  // Check if all active players have responded
  const activePlayerResponses = gameState.playersInRound
    .map(playerIndex => gameState.toepResponses[playerIndex])
    .filter(response => response !== null);
  
  if (activePlayerResponses.length === gameState.playersInRound.length) {
    // All players have responded
    const foldedPlayers = [];
    gameState.playersInRound.forEach(playerIndex => {
      if (gameState.toepResponses[playerIndex] === 'fold') {
        foldedPlayers.push(playerIndex);
        // Add penalty points based on stakes when they entered
        gameState.players[playerIndex].points += gameState.playerStakesOnEntry[playerIndex];
      }
    });
    
    // Remove folded players from round
    gameState.playersInRound = gameState.playersInRound.filter(
      playerIndex => !foldedPlayers.includes(playerIndex)
    );
    
    // Check if only one player left (everyone else folded)
    if (gameState.playersInRound.length === 1) {
      // Single winner - end round
      endRound(gameState, room);
    } else {
      // Continue playing with remaining players
      gameState.gamePhase = 'playing';
      gameState.toepResponses = null;
    }
    
    // Broadcast the updated state after all responses processed
    broadcastSecureGameState(room, { type: 'toepResponsesComplete' });
  }
}

function handleAIToepResponses(gameState, room) {
  // This function is called from processGameAction but not implemented
  // Since we're handling multiplayer with real players, this can be a no-op
  // or handle any remaining null responses as auto-accept
  if (gameState.toepResponses) {
    gameState.playersInRound.forEach(playerIndex => {
      if (gameState.toepResponses[playerIndex] === null) {
        // Auto-accept for any unresponsive players
        gameState.toepResponses[playerIndex] = 'accept';
      }
    });
    checkToepResponses(gameState, room);
  }
}

function processServerBlindToepResponse(gameState, room) {
  // Get all players except the blind toeper
  let playersToRespond = gameState.playersInRound.filter(p => p !== gameState.lastToeper);
  
  // Set up blind toep response system (similar to regular toep)
  gameState.gamePhase = 'blindToepResponse';
  gameState.blindToepResponses = new Array(gameState.players.length).fill(null);
  
  // Auto-accept for the blind toeper
  gameState.blindToepResponses[gameState.lastToeper] = 'accept';
  
  // Mark all players not in round as already folded
  for (let i = 0; i < gameState.players.length; i++) {
    if (!gameState.playersInRound.includes(i)) {
      gameState.blindToepResponses[i] = 'fold';
    }
  }
  
  // Broadcast the blind toep response phase
  broadcastSecureGameState(room, { type: 'blindToepResponse', blindToeper: gameState.lastToeper });
}

function checkBlindToepResponses(gameState, room) {
  // Check if all players have responded
  const allResponded = gameState.blindToepResponses.every(response => response !== null);
  
  if (allResponded) {
    gameState.pendingBlindToepResponse = false;
    gameState.gamePhase = 'playing';
    
    // Check if only one player left
    if (gameState.playersInRound.length === 1) {
      // End round immediately
      setTimeout(() => endRound(gameState, room), 2000);
    } else {
      // Continue to playing phase
      broadcastSecureGameState(room, { type: 'blindToepResponsesComplete' });
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🃏 Toepen server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});