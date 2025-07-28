import { GameEngine } from './GameEngine.js';
import { UIManager } from './UIManager.js';
import { NetworkManager } from './NetworkManager.js';
import { 
    GAME_CONFIG, 
    GAME_PHASES, 
    TIMING,
    ERROR_MESSAGES 
} from './constants.js';

export class ToepenApp {
    constructor() {
        this.gameEngine = null;
        this.uiManager = null;
        this.networkManager = null;
        this.isMultiplayer = false;
        this.gameMode = 'offline'; // offline, multiplayer
        
        this.init();
    }

    // Initialize the application
    init() {
        try {
            this.uiManager = new UIManager();
            this.setupUIEventListeners();
            
            // Show setup screen initially
            this.uiManager.showScreen('setup');
            
            this.uiManager.addActivityMessage('🃏 Welcome to Toepen! Choose your game mode.');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError('Failed to initialize game: ' + error.message);
        }
    }

    // Setup UI event listeners
    setupUIEventListeners() {
        // Setup screen events
        this.uiManager.on('startGame', () => this.startOfflineGame());
        this.uiManager.on('showLobby', () => this.showMultiplayerLobby());
        
        // Lobby events
        this.uiManager.on('createLobby', () => this.createLobby());
        this.uiManager.on('joinLobby', () => this.joinLobby());
        this.uiManager.on('backToSetup', () => this.backToSetup());
        this.uiManager.on('addBot', () => this.addBot());
        this.uiManager.on('startLobbyGame', () => this.startLobbyGame());
        this.uiManager.on('leaveLobby', () => this.leaveLobby());
        
        // Game events
        this.uiManager.on('playCard', (data) => this.playCard(data.cardIndex));
        this.uiManager.on('toep', () => this.toep());
        this.uiManager.on('fold', () => this.fold());
        this.uiManager.on('acceptToep', () => this.acceptToep());
        this.uiManager.on('foldToToep', () => this.foldToToep());
        this.uiManager.on('submitVuileWas', () => this.submitLaundry('vuileWas'));
        this.uiManager.on('submitWitteWas', () => this.submitLaundry('witteWas'));
        this.uiManager.on('callBlindToep', () => this.callBlindToep());
        
        // Menu events
        this.uiManager.on('returnToMainMenu', () => this.returnToMainMenu());
    }

    // Start offline game with bots
    startOfflineGame() {
        try {
            const formValues = this.uiManager.getFormValues();
            const playerNames = [formValues.playerName];
            
            // Add bot names
            for (let i = 1; i < formValues.numPlayers; i++) {
                playerNames.push(`Bot ${i}`);
            }

            this.gameMode = 'offline';
            this.isMultiplayer = false;
            
            this.gameEngine = new GameEngine();
            this.setupGameEngineEvents();
            
            if (this.gameEngine.initializeGame(playerNames, false)) {
                this.uiManager.showScreen('game');
                this.gameEngine.startRound();
                this.uiManager.addActivityMessage(`🎮 Started offline game with ${formValues.numPlayers} players`);
            }
        } catch (error) {
            this.uiManager.showError('Failed to start game: ' + error.message);
        }
    }

    // Show multiplayer lobby
    showMultiplayerLobby() {
        this.uiManager.showScreen('lobby');
        
        // Initialize network manager if not already done
        if (!this.networkManager) {
            this.networkManager = new NetworkManager();
            this.setupNetworkEvents();
            
            if (!this.networkManager.connect()) {
                this.uiManager.showError('Failed to connect to server');
                return;
            }
        }
    }

    // Setup network event listeners
    setupNetworkEvents() {
        if (!this.networkManager) return;

        this.networkManager.on('connected', () => {
            this.uiManager.addActivityMessage('🌐 Connected to server');
        });

        this.networkManager.on('disconnected', (data) => {
            this.uiManager.addActivityMessage(`❌ Disconnected: ${data.reason}`);
        });

        this.networkManager.on('connectionError', (data) => {
            this.uiManager.showError(data.message);
        });

        this.networkManager.on('roomCreated', (data) => {
            this.handleRoomCreated(data);
        });

        this.networkManager.on('roomJoined', (data) => {
            this.handleRoomJoined(data);
        });

        this.networkManager.on('lobbyUpdate', (data) => {
            this.handleLobbyUpdate(data);
        });

        this.networkManager.on('gameStarted', (data) => {
            this.handleGameStarted(data);
        });

        this.networkManager.on('gameStateUpdate', (data) => {
            this.handleGameStateUpdate(data);
        });

        this.networkManager.on('serverError', (data) => {
            this.uiManager.showError(data.message || 'Server error');
        });

        this.networkManager.on('error', (data) => {
            this.uiManager.showError(data.message);
        });
    }

    // Create multiplayer lobby
    createLobby() {
        const formValues = this.uiManager.getFormValues();
        if (this.networkManager) {
            this.networkManager.createRoom(formValues.lobbyPlayerName);
        }
    }

    // Join multiplayer lobby
    joinLobby() {
        const formValues = this.uiManager.getFormValues();
        if (this.networkManager && formValues.lobbyCode) {
            this.networkManager.joinRoom(formValues.lobbyCode, formValues.lobbyPlayerName);
        } else {
            this.uiManager.showError('Please enter a lobby code');
        }
    }

    // Handle room created
    handleRoomCreated(data) {
        this.isMultiplayer = true;
        this.gameMode = 'multiplayer';
        this.uiManager.addActivityMessage(`🏠 Created lobby: ${data.roomCode}`);
        this.uiManager.updateLobbyDisplay({
            code: data.roomCode,
            players: data.players,
            isHost: true
        });
        
        // Show lobby players section
        document.getElementById('lobbyPlayers').style.display = 'block';
    }

    // Handle room joined
    handleRoomJoined(data) {
        this.isMultiplayer = true;
        this.gameMode = 'multiplayer';
        this.uiManager.addActivityMessage(`🚪 Joined lobby: ${data.roomCode}`);
        this.uiManager.updateLobbyDisplay({
            code: data.roomCode,
            players: data.players,
            isHost: false
        });
        
        // Show lobby players section
        document.getElementById('lobbyPlayers').style.display = 'block';
    }

    // Handle lobby update
    handleLobbyUpdate(data) {
        this.uiManager.updateLobbyDisplay(data);
        this.uiManager.addActivityMessage(`👥 Lobby updated: ${data.players.length} players`);
    }

    // Handle game started
    handleGameStarted(data) {
        this.uiManager.showScreen('game');
        this.uiManager.addActivityMessage('🎮 Multiplayer game started!');
        
        // Create game engine for multiplayer
        this.gameEngine = new GameEngine();
        this.setupGameEngineEvents();
        
        // Initialize with multiplayer data
        if (data.gameState) {
            this.syncGameState(data.gameState);
        }
    }

    // Handle game state update from server
    handleGameStateUpdate(data) {
        if (this.gameEngine && data.gameState) {
            this.syncGameState(data.gameState);
        }
        
        // Handle specific actions
        if (data.lastAction) {
            this.handleServerAction(data.lastAction);
        }
    }

    // Sync game state from server
    syncGameState(serverState) {
        if (!this.gameEngine) return;
        
        // Update game engine state
        Object.assign(this.gameEngine, serverState);
        
        // Update UI
        this.uiManager.updateGameDisplay(serverState);
        
        // Handle phase-specific updates
        this.handlePhaseSpecificUpdates(serverState);
    }

    // Handle phase-specific UI updates
    handlePhaseSpecificUpdates(gameState) {
        switch (gameState.gamePhase) {
            case GAME_PHASES.TOEP_RESPONSE:
                if (gameState.toepResponses && 
                    gameState.toepResponses[this.networkManager.getPlayerIndex()] === null) {
                    this.showToepDecision(gameState);
                }
                break;
                
            case GAME_PHASES.BLIND_TOEP_RESPONSE:
                if (gameState.blindToepResponses && 
                    gameState.blindToepResponses[this.networkManager.getPlayerIndex()] === null) {
                    this.showBlindToepDecision(gameState);
                }
                break;
                
            case GAME_PHASES.GAME_END:
                this.handleGameEnd(gameState);
                break;
        }
    }

    // Handle server actions
    handleServerAction(action) {
        switch (action.type) {
            case 'cardPlayed':
                this.uiManager.addActivityMessage(`🃏 ${action.playerName} played a card`);
                break;
                
            case 'toepCalled':
                this.uiManager.addActivityMessage(`📈 ${action.playerName} called Toep! Stakes: ${action.newStakes}`);
                break;
                
            case 'playerFolded':
                this.uiManager.addActivityMessage(`🏳️ ${action.playerName} folded (+${action.penaltyPoints} pts)`);
                break;
                
            case 'trickWon':
                this.uiManager.addActivityMessage(`🏆 ${action.playerName} won the trick`);
                break;
                
            case 'roundEnded':
                this.uiManager.addActivityMessage(`🔄 Round ${action.round} ended`);
                break;
        }
    }

    // Setup game engine event listeners
    setupGameEngineEvents() {
        if (!this.gameEngine) return;

        this.gameEngine.on('gameInitialized', (data) => {
            this.uiManager.addActivityMessage('🎯 Game initialized');
        });

        this.gameEngine.on('roundStarted', (data) => {
            this.uiManager.addActivityMessage(`🔄 Round ${data.round} started`);
            this.uiManager.updateGameDisplay(this.gameEngine.getGameState());
        });

        this.gameEngine.on('cardPlayed', (data) => {
            const playerName = this.gameEngine.players[data.playerIndex].name;
            this.uiManager.addActivityMessage(`🃏 ${playerName} played ${data.card.rank}${data.card.suit}`);
            this.uiManager.updateGameDisplay(this.gameEngine.getGameState());
        });

        this.gameEngine.on('trickWon', (data) => {
            const winnerName = this.gameEngine.players[data.winner].name;
            this.uiManager.addActivityMessage(`🏆 ${winnerName} won the trick`);
            
            setTimeout(() => {
                this.uiManager.updateGameDisplay(this.gameEngine.getGameState());
            }, TIMING.TRICK_EVALUATION_DELAY);
        });

        this.gameEngine.on('toepCalled', (data) => {
            const toepPlayerName = this.gameEngine.players[data.playerIndex].name;
            this.uiManager.addActivityMessage(`📈 ${toepPlayerName} called Toep! Stakes: ${data.newStakes}`);
            
            // Show toep decision if human player needs to respond
            if (!this.isMultiplayer && data.playersToRespond.includes(0)) {
                this.showToepDecision(this.gameEngine.getGameState());
            }
        });

        this.gameEngine.on('playerFolded', (data) => {
            const playerName = this.gameEngine.players[data.playerIndex].name;
            this.uiManager.addActivityMessage(`🏳️ ${playerName} folded (+${data.penaltyPoints} pts)`);
            this.uiManager.updateGameDisplay(this.gameEngine.getGameState());
        });

        this.gameEngine.on('roundEnded', (data) => {
            const winnerNames = data.winners.map(w => this.gameEngine.players[w].name).join(', ');
            this.uiManager.addActivityMessage(`🎉 Round ${data.round} won by: ${winnerNames}`);
            this.uiManager.updateGameDisplay(this.gameEngine.getGameState());
        });

        this.gameEngine.on('playerEliminated', (data) => {
            this.uiManager.addActivityMessage(`❌ ${data.player.name} eliminated (${data.player.points} points)`);
        });

        this.gameEngine.on('gameEnded', (data) => {
            const winnerName = data.winner ? data.winner.name : 'No winner';
            this.uiManager.addActivityMessage(`🏅 Game over! Winner: ${winnerName}`);
            this.handleGameEnd(data);
        });

        this.gameEngine.on('error', (data) => {
            this.uiManager.showError(data.message);
        });
    }

    // Play a card
    playCard(cardIndex) {
        if (this.isMultiplayer) {
            this.networkManager.playCard(cardIndex);
        } else if (this.gameEngine) {
            this.gameEngine.playCard(0, cardIndex);
        }
    }

    // Call toep
    toep() {
        if (this.isMultiplayer) {
            this.networkManager.toep();
        } else if (this.gameEngine) {
            this.gameEngine.toep(0);
        }
    }

    // Fold
    fold() {
        if (this.isMultiplayer) {
            this.networkManager.fold();
        } else if (this.gameEngine) {
            this.gameEngine.handlePlayerFold(0);
            this.uiManager.updateGameDisplay(this.gameEngine.getGameState());
        }
    }

    // Accept toep
    acceptToep() {
        if (this.isMultiplayer) {
            this.networkManager.acceptToep();
        } else if (this.gameEngine) {
            this.gameEngine.respondToToep(0, 'accept');
        }
        this.uiManager.hideToepDecision();
    }

    // Fold to toep
    foldToToep() {
        if (this.isMultiplayer) {
            this.networkManager.foldToToep();
        } else if (this.gameEngine) {
            this.gameEngine.respondToToep(0, 'fold');
        }
        this.uiManager.hideToepDecision();
    }

    // Submit laundry claim
    submitLaundry(laundryType) {
        if (this.isMultiplayer) {
            this.networkManager.submitLaundry(laundryType);
        } else {
            // Handle offline laundry logic
            this.uiManager.addActivityMessage(`🧺 You claimed ${laundryType}`);
        }
    }

    // Call blind toep
    callBlindToep() {
        if (this.isMultiplayer) {
            this.networkManager.blindToep();
        } else {
            // Handle offline blind toep logic
            this.uiManager.addActivityMessage('⚡ You called Blind Toep!');
        }
    }

    // Show toep decision
    showToepDecision(gameState) {
        const playerIndex = this.isMultiplayer ? this.networkManager.getPlayerIndex() : 0;
        const toepPlayerName = gameState.players[gameState.lastToeper].name;
        
        this.uiManager.showToepDecision({
            message: `${toepPlayerName} called Toep!`,
            newStakes: gameState.stakes,
            entryStakes: gameState.playerStakesOnEntry[playerIndex],
            foldPenalty: gameState.playerStakesOnEntry[playerIndex],
            continuePenalty: gameState.stakes
        });
    }

    // Show blind toep decision
    showBlindToepDecision(gameState) {
        const toepPlayerName = gameState.players[gameState.lastToeper].name;
        
        this.uiManager.showToepDecision({
            message: `${toepPlayerName} called Blind Toep!`,
            newStakes: 3,
            entryStakes: 3,
            foldPenalty: 3,
            continuePenalty: 3
        });
    }

    // Add bot to lobby
    addBot() {
        if (this.networkManager) {
            this.networkManager.addBot();
        }
    }

    // Start lobby game
    startLobbyGame() {
        if (this.networkManager) {
            this.networkManager.startLobbyGame();
        }
    }

    // Leave lobby
    leaveLobby() {
        if (this.networkManager) {
            this.networkManager.leaveRoom();
        }
        this.backToSetup();
    }

    // Back to setup screen
    backToSetup() {
        this.uiManager.showScreen('setup');
        document.getElementById('lobbyPlayers').style.display = 'none';
    }

    // Return to main menu
    returnToMainMenu() {
        if (this.networkManager) {
            this.networkManager.cleanup();
            this.networkManager = null;
        }
        
        if (this.gameEngine) {
            this.gameEngine.removeAllListeners();
            this.gameEngine = null;
        }
        
        this.isMultiplayer = false;
        this.gameMode = 'offline';
        
        this.uiManager.showScreen('setup');
        this.uiManager.addActivityMessage('🏠 Returned to main menu');
    }

    // Handle game end
    handleGameEnd(data) {
        setTimeout(() => {
            const message = data.winner ? 
                `🏅 ${data.winner.name} wins the game!` : 
                '🎮 Game ended';
            
            if (confirm(message + '\n\nWould you like to play again?')) {
                this.returnToMainMenu();
            }
        }, 2000);
    }

    // Show error message
    showError(message) {
        this.uiManager.showError(message);
    }

    // Cleanup on page unload
    cleanup() {
        if (this.networkManager) {
            this.networkManager.cleanup();
        }
        
        if (this.gameEngine) {
            this.gameEngine.removeAllListeners();
        }
        
        if (this.uiManager) {
            this.uiManager.cleanup();
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.toepenApp = new ToepenApp();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (window.toepenApp) {
            window.toepenApp.cleanup();
        }
    });
});