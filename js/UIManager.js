import { 
    GAME_CONFIG, 
    UI_CLASSES, 
    ERROR_MESSAGES, 
    VALIDATION 
} from './constants.js';
import { EventManager } from './EventManager.js';

export class UIManager extends EventManager {
    constructor() {
        super();
        this.currentScreen = 'setup';
        this.activityLogVisible = false;
        this.elements = {};
        this.boundHandlers = new Map();
        this.initializeElements();
        this.setupEventListeners();
    }

    // Initialize DOM element references
    initializeElements() {
        this.elements = {
            // Screens
            setupScreen: document.getElementById('setupScreen'),
            lobbyScreen: document.getElementById('lobbyScreen'),
            gameScreen: document.getElementById('gameScreen'),
            
            // Setup elements
            playerName: document.getElementById('playerName'),
            numPlayers: document.getElementById('numPlayers'),
            
            // Lobby elements
            lobbyCode: document.getElementById('lobbyCode'),
            lobbyPlayerName: document.getElementById('lobbyPlayerName'),
            lobbyPlayers: document.getElementById('lobbyPlayers'),
            playersList: document.getElementById('playersList'),
            currentLobbyCode: document.getElementById('currentLobbyCode'),
            addBotBtn: document.getElementById('addBotBtn'),
            startGameBtn: document.getElementById('startGameBtn'),
            waitingMessage: document.getElementById('waitingMessage'),
            
            // Game elements
            roundNumber: document.getElementById('roundNumber'),
            roundValue: document.getElementById('roundValue'),
            tricksPlayed: document.getElementById('tricksPlayed'),
            playersSection: document.getElementById('playersSection'),
            yourCards: document.getElementById('yourCards'),
            
            // Controls
            toepBtn: document.getElementById('toepBtn'),
            foldBtn: document.getElementById('foldBtn'),
            vuileWasBtn: document.getElementById('vuileWasBtn'),
            witteWasBtn: document.getElementById('witteWasBtn'),
            blindToepBtn: document.getElementById('blindToepBtn'),
            
            // Overlays
            toepDecisionOverlay: document.getElementById('toepDecisionOverlay'),
            toepMessage: document.getElementById('toepMessage'),
            newStakes: document.getElementById('newStakes'),
            yourEntryStakes: document.getElementById('yourEntryStakes'),
            foldPenalty: document.getElementById('foldPenalty'),
            continuePenalty: document.getElementById('continuePenalty'),
            
            // Activity log
            activityLog: document.getElementById('activityLog'),
            activityMessages: document.getElementById('activityMessages'),
            gameMenu: document.getElementById('gameMenu')
        };
    }

    // Setup event listeners using proper addEventListener
    setupEventListeners() {
        // Setup screen buttons
        this.addButtonListener('startGame', () => this.emit('startGame'));
        this.addButtonListener('showLobby', () => this.emit('showLobby'));
        
        // Lobby screen buttons
        this.addButtonListener('createLobby', () => this.emit('createLobby'));
        this.addButtonListener('joinLobby', () => this.emit('joinLobby'));
        this.addButtonListener('backToSetup', () => this.emit('backToSetup'));
        this.addButtonListener('addBot', () => this.emit('addBot'));
        this.addButtonListener('startLobbyGame', () => this.emit('startLobbyGame'));
        this.addButtonListener('leaveLobby', () => this.emit('leaveLobby'));
        this.addButtonListener('copyLobbyCode', () => this.copyLobbyCode());
        
        // Game controls
        this.addButtonListener('toepBtn', () => this.emit('toep'));
        this.addButtonListener('foldBtn', () => this.emit('fold'));
        this.addButtonListener('vuileWasBtn', () => this.emit('submitVuileWas'));
        this.addButtonListener('witteWasBtn', () => this.emit('submitWitteWas'));
        this.addButtonListener('blindToepBtn', () => this.emit('callBlindToep'));
        
        // Toep decision buttons
        this.addButtonListener('acceptToep', () => this.emit('acceptToep'));
        this.addButtonListener('foldToToep', () => this.emit('foldToToep'));
        
        // Menu and activity log
        this.addButtonListener('returnToMainMenu', () => this.emit('returnToMainMenu'));
        this.addButtonListener('toggleActivityLog', () => this.toggleActivityLog());
        
        // Input validation
        this.addInputValidator('playerName', VALIDATION.PLAYER_NAME_PATTERN, VALIDATION.PLAYER_NAME_MAX_LENGTH);
        this.addInputValidator('lobbyPlayerName', VALIDATION.PLAYER_NAME_PATTERN, VALIDATION.PLAYER_NAME_MAX_LENGTH);
        this.addInputValidator('lobbyCode', VALIDATION.ROOM_CODE_PATTERN, VALIDATION.ROOM_CODE_LENGTH);
        this.addInputValidator('numPlayers', /^[2-4]$/, 1);
    }

    // Add button event listener with error handling
    addButtonListener(elementId, handler) {
        const element = document.getElementById(elementId) || this.elements[elementId];
        if (element) {
            const boundHandler = (event) => {
                try {
                    event.preventDefault();
                    handler(event);
                } catch (error) {
                    this.showError('Button handler error: ' + error.message);
                }
            };
            
            element.addEventListener('click', boundHandler);
            this.boundHandlers.set(elementId, { element, handler: boundHandler });
        }
    }

    // Add input validation
    addInputValidator(elementId, pattern, maxLength) {
        const element = document.getElementById(elementId) || this.elements[elementId];
        if (element) {
            const validator = (event) => {
                const value = event.target.value;
                const isValid = pattern.test(value) && value.length <= maxLength;
                
                element.classList.toggle('invalid', !isValid);
                
                if (!isValid && value.length > 0) {
                    this.showFieldError(element, `Invalid ${elementId}`);
                } else {
                    this.clearFieldError(element);
                }
            };
            
            element.addEventListener('input', validator);
            element.addEventListener('blur', validator);
        }
    }

    // Show field-specific error
    showFieldError(element, message) {
        this.clearFieldError(element);
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error';
        errorDiv.textContent = message;
        errorDiv.style.color = '#ff6b6b';
        errorDiv.style.fontSize = '0.8rem';
        errorDiv.style.marginTop = '5px';
        
        element.parentNode.insertBefore(errorDiv, element.nextSibling);
    }

    // Clear field-specific error
    clearFieldError(element) {
        const existing = element.parentNode.querySelector('.field-error');
        if (existing) {
            existing.remove();
        }
    }

    // Show error message
    showError(message) {
        console.error(message);
        this.addActivityMessage(`❌ Error: ${message}`, 'error');
        
        // Also show as toast notification
        this.showToast(message, 'error');
    }

    // Show success message
    showSuccess(message) {
        this.addActivityMessage(`✅ ${message}`, 'success');
        this.showToast(message, 'success');
    }

    // Show toast notification
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#ff6b6b' : type === 'success' ? '#4caf50' : '#2196f3'};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Switch between screens
    showScreen(screenName) {
        // Hide all screens
        Object.entries(this.elements).forEach(([key, element]) => {
            if (key.endsWith('Screen') && element) {
                element.style.display = 'none';
            }
        });
        
        // Show target screen
        const targetScreen = this.elements[screenName + 'Screen'];
        if (targetScreen) {
            targetScreen.style.display = 'block';
            this.currentScreen = screenName;
            this.emit('screenChanged', { screen: screenName });
        }
    }

    // Update game display
    updateGameDisplay(gameState) {
        try {
            this.updateGameInfo(gameState);
            this.updatePlayerAreas(gameState);
            this.updatePlayerCards(gameState);
            this.updateGameControls(gameState);
            this.updateCurrentPlayerIndicator(gameState);
        } catch (error) {
            this.showError('Display update error: ' + error.message);
        }
    }

    // Update game info panel
    updateGameInfo(gameState) {
        if (this.elements.roundNumber) {
            this.elements.roundNumber.textContent = gameState.round;
        }
        if (this.elements.roundValue) {
            this.elements.roundValue.textContent = gameState.stakes;
        }
        if (this.elements.tricksPlayed) {
            this.elements.tricksPlayed.textContent = gameState.tricksPlayed;
        }
    }

    // Update player areas
    updatePlayerAreas(gameState) {
        const playersSection = this.elements.playersSection;
        if (!playersSection) return;
        
        // Set grid layout based on player count
        const playerCount = gameState.players.length;
        playersSection.className = `players-section players-${playerCount}`;
        
        // Clear existing player areas (except player 0)
        const existingAreas = playersSection.querySelectorAll('.player:not(#player0)');
        existingAreas.forEach(area => area.remove());
        
        // Create player areas for opponents
        gameState.players.forEach((player, index) => {
            if (index === 0) return; // Skip human player
            
            this.createPlayerArea(player, index, gameState);
        });
    }

    // Create player area for opponent
    createPlayerArea(player, index, gameState) {
        const playerArea = document.createElement('div');
        playerArea.id = `player${index}`;
        playerArea.className = `player ${gameState.currentPlayer === index ? 'current-player' : ''}`;
        
        const cardCount = player.hand ? player.hand.length : 0;
        const tricksWon = gameState.roundTrickWins ? gameState.roundTrickWins[index] : 0;
        
        playerArea.innerHTML = `
            <div class="player-name">${this.escapeHtml(player.name)}</div>
            <div class="player-points">Points: ${player.points}</div>
            <div class="player-tricks">This round: ${tricksWon} tricks</div>
            <div class="player-cards">
                ${Array(cardCount).fill('<div class="card opponent-card">🂠</div>').join('')}
            </div>
        `;
        
        this.elements.playersSection.appendChild(playerArea);
    }

    // Update player's cards
    updatePlayerCards(gameState) {
        const yourCards = this.elements.yourCards;
        if (!yourCards || !gameState.players[0]) return;
        
        const humanPlayer = gameState.players[0];
        yourCards.innerHTML = '';
        
        humanPlayer.hand.forEach((card, index) => {
            const cardElement = this.createCardElement(card, index, gameState);
            yourCards.appendChild(cardElement);
        });
    }

    // Create card element
    createCardElement(card, index, gameState) {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card player-card';
        cardDiv.innerHTML = `
            <div class="card-rank">${card.rank}</div>
            <div class="card-suit" style="color: ${card.color}">${card.suit}</div>
        `;
        
        // Add click handler if it's player's turn and card is playable
        if (gameState.currentPlayer === 0 && !gameState.isProcessing) {
            cardDiv.classList.add('playable');
            const clickHandler = () => this.emit('playCard', { cardIndex: index });
            cardDiv.addEventListener('click', clickHandler);
        }
        
        return cardDiv;
    }

    // Update game controls
    updateGameControls(gameState) {
        const isPlayerTurn = gameState.currentPlayer === 0;
        const canToep = isPlayerTurn && gameState.gamePhase === 'playing' && 
                       gameState.lastToeper !== 0 && gameState.stakes < 8;
        const canFold = isPlayerTurn && gameState.gamePhase === 'playing';
        
        this.toggleElement('toepBtn', canToep);
        this.toggleElement('foldBtn', canFold);
        
        // Laundry buttons
        const canLaundry = gameState.gamePhase === 'laundry' && !gameState.firstCardPlayed;
        this.toggleElement('vuileWasBtn', canLaundry);
        this.toggleElement('witteWasBtn', canLaundry);
        
        // Blind toep button (shown at round start)
        this.toggleElement('blindToepBtn', gameState.round > 1 && gameState.tricksPlayed === 0);
    }

    // Update current player indicator
    updateCurrentPlayerIndicator(gameState) {
        // Remove current player class from all players
        document.querySelectorAll('.player').forEach(player => {
            player.classList.remove(UI_CLASSES.CURRENT_PLAYER);
        });
        
        // Add current player class to active player
        const currentPlayerElement = document.getElementById(`player${gameState.currentPlayer}`);
        if (currentPlayerElement) {
            currentPlayerElement.classList.add(UI_CLASSES.CURRENT_PLAYER);
        }
    }

    // Toggle element visibility/enabled state
    toggleElement(elementId, enabled) {
        const element = document.getElementById(elementId) || this.elements[elementId];
        if (element) {
            element.disabled = !enabled;
            element.style.display = enabled ? 'inline-block' : 'none';
        }
    }

    // Show toep decision overlay
    showToepDecision(data) {
        if (this.elements.toepMessage) {
            this.elements.toepMessage.textContent = data.message;
        }
        if (this.elements.newStakes) {
            this.elements.newStakes.textContent = data.newStakes;
        }
        if (this.elements.yourEntryStakes) {
            this.elements.yourEntryStakes.textContent = data.entryStakes;
        }
        if (this.elements.foldPenalty) {
            this.elements.foldPenalty.textContent = data.foldPenalty;
        }
        if (this.elements.continuePenalty) {
            this.elements.continuePenalty.textContent = data.continuePenalty;
        }
        
        this.elements.toepDecisionOverlay.style.display = 'block';
    }

    // Hide toep decision overlay
    hideToepDecision() {
        if (this.elements.toepDecisionOverlay) {
            this.elements.toepDecisionOverlay.style.display = 'none';
        }
    }

    // Add activity log message
    addActivityMessage(message, type = 'info') {
        const messagesContainer = this.elements.activityMessages;
        if (!messagesContainer) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = `activity-message activity-${type}`;
        messageElement.innerHTML = `
            <span class="activity-time">${new Date().toLocaleTimeString()}</span>
            <span class="activity-text">${this.escapeHtml(message)}</span>
        `;
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Keep only last 50 messages
        while (messagesContainer.children.length > 50) {
            messagesContainer.removeChild(messagesContainer.firstChild);
        }
    }

    // Toggle activity log visibility
    toggleActivityLog() {
        const activityLog = this.elements.activityLog;
        if (activityLog) {
            this.activityLogVisible = !this.activityLogVisible;
            activityLog.style.display = this.activityLogVisible ? 'block' : 'none';
        }
    }

    // Copy lobby code to clipboard
    copyLobbyCode() {
        const lobbyCode = this.elements.currentLobbyCode?.textContent;
        if (lobbyCode) {
            navigator.clipboard.writeText(lobbyCode).then(() => {
                this.showSuccess('Lobby code copied to clipboard!');
            }).catch(() => {
                this.showError('Failed to copy lobby code');
            });
        }
    }

    // Get form values
    getFormValues() {
        return {
            playerName: this.getElementValue('playerName') || 'Player',
            numPlayers: parseInt(this.getElementValue('numPlayers')) || 3,
            lobbyPlayerName: this.getElementValue('lobbyPlayerName') || 'Player',
            lobbyCode: this.getElementValue('lobbyCode') || ''
        };
    }

    // Get element value safely
    getElementValue(elementId) {
        const element = document.getElementById(elementId) || this.elements[elementId];
        return element ? element.value.trim() : '';
    }

    // Validate form values
    validateInput(value, pattern, fieldName) {
        if (!pattern.test(value)) {
            throw new Error(`Invalid ${fieldName}: ${ERROR_MESSAGES['INVALID_' + fieldName.toUpperCase()]}`);
        }
        return true;
    }

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Show lobby players
    updateLobbyDisplay(lobbyData) {
        if (this.elements.playersList) {
            this.elements.playersList.innerHTML = '';
            lobbyData.players.forEach((player, index) => {
                const playerElement = document.createElement('div');
                playerElement.className = 'lobby-player';
                playerElement.innerHTML = `
                    <span>${this.escapeHtml(player.name)}</span>
                    ${player.isHost ? '<span class="host-badge">HOST</span>' : ''}
                    ${player.isBot ? '<span class="bot-badge">BOT</span>' : ''}
                `;
                this.elements.playersList.appendChild(playerElement);
            });
        }
        
        if (this.elements.currentLobbyCode) {
            this.elements.currentLobbyCode.textContent = lobbyData.code;
        }
        
        // Show/hide controls based on host status
        const isHost = lobbyData.isHost;
        this.toggleElement('addBotBtn', isHost && lobbyData.players.length < 4);
        this.toggleElement('startGameBtn', isHost && lobbyData.players.length >= 2);
        this.toggleElement('waitingMessage', !isHost);
    }

    // Clean up event listeners
    cleanup() {
        this.boundHandlers.forEach(({ element, handler }) => {
            element.removeEventListener('click', handler);
        });
        this.boundHandlers.clear();
        this.removeAllListeners();
    }
}