import { 
    SOCKET_EVENTS, 
    ACTION_TYPES, 
    ERROR_MESSAGES, 
    VALIDATION 
} from './constants.js';
import { EventManager } from './EventManager.js';

export class NetworkManager extends EventManager {
    constructor() {
        super();
        this.socket = null;
        this.isConnected = false;
        this.roomCode = null;
        this.playerIndex = -1;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
    }

    // Initialize socket connection
    connect() {
        try {
            if (typeof io === 'undefined') {
                throw new Error('Socket.io not loaded');
            }

            this.socket = io({
                transports: ['websocket', 'polling'],
                upgrade: true,
                rememberUpgrade: true
            });

            this.setupSocketListeners();
            return true;
        } catch (error) {
            this.emit('error', { message: 'Failed to connect: ' + error.message });
            return false;
        }
    }

    // Setup socket event listeners
    setupSocketListeners() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connected');
        });

        this.socket.on('disconnect', (reason) => {
            this.isConnected = false;
            this.emit('disconnected', { reason });
            
            // Auto-reconnect for certain disconnect reasons
            if (reason === 'io server disconnect') {
                this.handleReconnection();
            }
        });

        this.socket.on('connect_error', (error) => {
            this.emit('connectionError', { 
                message: ERROR_MESSAGES.CONNECTION_ERROR,
                details: error.message 
            });
            this.handleReconnection();
        });

        // Game-specific events
        this.socket.on(SOCKET_EVENTS.ROOM_CREATED, (data) => {
            this.roomCode = data.roomCode;
            this.playerIndex = data.playerIndex;
            this.emit('roomCreated', data);
        });

        this.socket.on(SOCKET_EVENTS.ROOM_JOINED, (data) => {
            this.roomCode = data.roomCode;
            this.playerIndex = data.playerIndex;
            this.emit('roomJoined', data);
        });

        this.socket.on(SOCKET_EVENTS.GAME_STATE_UPDATE, (data) => {
            this.emit('gameStateUpdate', data);
        });

        this.socket.on(SOCKET_EVENTS.PLAYER_DISCONNECTED, (data) => {
            this.emit('playerDisconnected', data);
        });

        this.socket.on(SOCKET_EVENTS.ERROR, (data) => {
            this.emit('serverError', data);
        });

        // Handle custom events
        this.socket.on('lobbyUpdate', (data) => {
            this.emit('lobbyUpdate', data);
        });

        this.socket.on('gameStarted', (data) => {
            this.emit('gameStarted', data);
        });
    }

    // Handle reconnection attempts
    handleReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.reconnectAttempts++;
        
        setTimeout(() => {
            if (!this.isConnected && this.socket) {
                this.emit('reconnectAttempt', { attempt: this.reconnectAttempts });
                this.socket.connect();
            }
        }, this.reconnectDelay * this.reconnectAttempts);
    }

    // Create a game room
    createRoom(playerName) {
        try {
            this.validatePlayerName(playerName);
            
            if (!this.ensureConnection()) {
                return false;
            }

            this.socket.emit(SOCKET_EVENTS.CREATE_ROOM, {
                playerName: playerName.trim()
            });

            return true;
        } catch (error) {
            this.emit('error', { message: error.message });
            return false;
        }
    }

    // Join a game room
    joinRoom(roomCode, playerName) {
        try {
            this.validateRoomCode(roomCode);
            this.validatePlayerName(playerName);
            
            if (!this.ensureConnection()) {
                return false;
            }

            this.socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
                roomCode: roomCode.toUpperCase().trim(),
                playerName: playerName.trim()
            });

            return true;
        } catch (error) {
            this.emit('error', { message: error.message });
            return false;
        }
    }

    // Send game action
    sendGameAction(actionType, actionData = {}) {
        try {
            if (!this.ensureConnection()) {
                return false;
            }

            if (!this.roomCode) {
                throw new Error('Not in a room');
            }

            const action = {
                type: actionType,
                playerIndex: this.playerIndex,
                ...actionData
            };

            this.socket.emit(SOCKET_EVENTS.GAME_ACTION, action);
            return true;
        } catch (error) {
            this.emit('error', { message: error.message });
            return false;
        }
    }

    // Play a card
    playCard(cardIndex) {
        return this.sendGameAction(ACTION_TYPES.PLAY_CARD, { cardIndex });
    }

    // Call toep
    toep() {
        return this.sendGameAction(ACTION_TYPES.TOEP);
    }

    // Accept toep
    acceptToep() {
        return this.sendGameAction(ACTION_TYPES.ACCEPT_TOEP);
    }

    // Fold to toep
    foldToToep() {
        return this.sendGameAction(ACTION_TYPES.FOLD_TO_TOEP);
    }

    // Fold round
    fold() {
        return this.sendGameAction(ACTION_TYPES.FOLD);
    }

    // Submit laundry claim
    submitLaundry(laundryType) {
        return this.sendGameAction(ACTION_TYPES.SUBMIT_LAUNDRY, { laundryType });
    }

    // Inspect laundry claim
    inspectLaundry() {
        return this.sendGameAction(ACTION_TYPES.INSPECT_LAUNDRY);
    }

    // Call blind toep
    blindToep() {
        return this.sendGameAction(ACTION_TYPES.BLIND_TOEP);
    }

    // Add bot to lobby
    addBot() {
        try {
            if (!this.ensureConnection() || !this.roomCode) {
                return false;
            }

            this.socket.emit('addBot');
            return true;
        } catch (error) {
            this.emit('error', { message: error.message });
            return false;
        }
    }

    // Start lobby game
    startLobbyGame() {
        try {
            if (!this.ensureConnection() || !this.roomCode) {
                return false;
            }

            this.socket.emit('startGame');
            return true;
        } catch (error) {
            this.emit('error', { message: error.message });
            return false;
        }
    }

    // Leave room
    leaveRoom() {
        try {
            if (this.socket && this.roomCode) {
                this.socket.emit('leaveRoom');
                this.roomCode = null;
                this.playerIndex = -1;
            }
            return true;
        } catch (error) {
            this.emit('error', { message: error.message });
            return false;
        }
    }

    // Disconnect from server
    disconnect() {
        try {
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
            this.isConnected = false;
            this.roomCode = null;
            this.playerIndex = -1;
            return true;
        } catch (error) {
            this.emit('error', { message: error.message });
            return false;
        }
    }

    // Validate room code
    validateRoomCode(roomCode) {
        if (!roomCode || typeof roomCode !== 'string') {
            throw new Error(ERROR_MESSAGES.INVALID_ROOM_CODE);
        }
        
        const trimmed = roomCode.trim().toUpperCase();
        if (trimmed.length !== VALIDATION.ROOM_CODE_LENGTH || 
            !VALIDATION.ROOM_CODE_PATTERN.test(trimmed)) {
            throw new Error(ERROR_MESSAGES.INVALID_ROOM_CODE);
        }
        
        return true;
    }

    // Validate player name
    validatePlayerName(playerName) {
        if (!playerName || typeof playerName !== 'string') {
            throw new Error(ERROR_MESSAGES.INVALID_PLAYER_NAME);
        }
        
        const trimmed = playerName.trim();
        if (trimmed.length < VALIDATION.PLAYER_NAME_MIN_LENGTH || 
            trimmed.length > VALIDATION.PLAYER_NAME_MAX_LENGTH ||
            !VALIDATION.PLAYER_NAME_PATTERN.test(trimmed)) {
            throw new Error(ERROR_MESSAGES.INVALID_PLAYER_NAME);
        }
        
        return true;
    }

    // Ensure connection is available
    ensureConnection() {
        if (!this.socket) {
            this.emit('error', { message: 'Not connected to server' });
            return false;
        }
        
        if (!this.isConnected) {
            this.emit('error', { message: 'Connection lost. Attempting to reconnect...' });
            this.handleReconnection();
            return false;
        }
        
        return true;
    }

    // Get connection status
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            roomCode: this.roomCode,
            playerIndex: this.playerIndex,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    // Check if in multiplayer mode
    isMultiplayer() {
        return this.socket !== null && this.roomCode !== null;
    }

    // Get room code
    getRoomCode() {
        return this.roomCode;
    }

    // Get player index
    getPlayerIndex() {
        return this.playerIndex;
    }

    // Send heartbeat to maintain connection
    sendHeartbeat() {
        if (this.ensureConnection()) {
            this.socket.emit('heartbeat', { timestamp: Date.now() });
        }
    }

    // Setup periodic heartbeat
    setupHeartbeat(interval = 30000) {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, interval);
    }

    // Cleanup heartbeat
    cleanupHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    // Cleanup all resources
    cleanup() {
        this.cleanupHeartbeat();
        this.disconnect();
        this.removeAllListeners();
    }
}