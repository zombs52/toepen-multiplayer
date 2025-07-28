import { 
    GAME_CONFIG, 
    TIMING, 
    CARD_SUITS, 
    CARD_RANKS, 
    GAME_PHASES, 
    AI_CONFIG,
    ERROR_MESSAGES 
} from './constants.js';
import { EventManager } from './EventManager.js';

export class GameEngine extends EventManager {
    constructor() {
        super();
        this.players = [];
        this.currentPlayer = 0;
        this.round = 1;
        this.stakes = GAME_CONFIG.INITIAL_STAKES;
        this.deck = [];
        this.currentTrick = [];
        this.tricksPlayed = 0;
        this.gamePhase = GAME_PHASES.SETUP;
        this.playersInRound = [];
        this.tricksTaken = [];
        this.leadSuit = null;
        this.roundTrickWins = [];
        this.isHost = false;
        this.lobbyCode = '';
        this.lobbyPlayers = [];
        this.playerStakesOnEntry = [];
        this.laundryPhaseComplete = false;
        this.firstCardPlayed = false;
        this.lastToeper = -1;
        this.isProcessing = false;
        this.pendingBlindToepResponse = false;
        this.isBlindToepDecision = false;
        this.toepResponses = null;
        this.blindToepResponses = null;
        this.activityLog = [];
        this.eliminatedPlayers = [];
        this.awaitingInspection = false;
        this.pendingLaundry = null;
    }

    // Initialize game with players
    initializeGame(playerNames, isMultiplayer = false) {
        try {
            this.validatePlayerCount(playerNames.length);
            this.players = this.createPlayers(playerNames);
            this.playersInRound = Array.from({ length: this.players.length }, (_, i) => i);
            this.roundTrickWins = new Array(this.players.length).fill(0);
            this.playerStakesOnEntry = new Array(this.players.length).fill(GAME_CONFIG.INITIAL_STAKES);
            this.gamePhase = GAME_PHASES.SETUP;
            
            this.emit('gameInitialized', { players: this.players });
            return true;
        } catch (error) {
            this.emit('error', { message: error.message });
            return false;
        }
    }

    // Validate player count
    validatePlayerCount(count) {
        if (count < GAME_CONFIG.MIN_PLAYERS || count > GAME_CONFIG.MAX_PLAYERS) {
            throw new Error(`Game requires ${GAME_CONFIG.MIN_PLAYERS}-${GAME_CONFIG.MAX_PLAYERS} players`);
        }
    }

    // Create player objects
    createPlayers(playerNames) {
        return playerNames.map((name, index) => ({
            name: name || `Player ${index + 1}`,
            points: 0,
            hand: [],
            isBot: index > 0,
            isEliminated: false,
            tricksWon: 0
        }));
    }

    // Start a new round
    startRound() {
        try {
            this.validateGameState();
            this.initializeRound();
            this.createAndDealCards();
            this.setupLaundryPhase();
            
            this.emit('roundStarted', {
                round: this.round,
                players: this.players,
                gamePhase: this.gamePhase
            });
        } catch (error) {
            this.emit('error', { message: error.message });
        }
    }

    // Validate game state before starting round
    validateGameState() {
        if (this.players.length < GAME_CONFIG.MIN_PLAYERS) {
            throw new Error('Not enough players to start round');
        }
    }

    // Initialize round state
    initializeRound() {
        this.currentTrick = [];
        this.tricksPlayed = 0;
        this.leadSuit = null;
        this.roundTrickWins = new Array(this.players.length).fill(0);
        this.playersInRound = this.players
            .map((_, index) => index)
            .filter(index => !this.players[index].isEliminated);
        this.playerStakesOnEntry = new Array(this.players.length).fill(this.stakes);
        this.lastToeper = -1;
        this.isProcessing = false;
        this.firstCardPlayed = false;
        this.laundryPhaseComplete = false;
        this.pendingBlindToepResponse = false;
    }

    // Create and shuffle deck, deal cards
    createAndDealCards() {
        this.deck = this.createDeck();
        this.shuffleDeck();
        this.dealCards();
    }

    // Create deck with proper card hierarchy
    createDeck() {
        const deck = [];
        CARD_SUITS.forEach(suit => {
            CARD_RANKS.forEach(rank => {
                deck.push({
                    suit: suit,
                    rank: rank.symbol,
                    value: rank.value,
                    color: (suit === '♥' || suit === '♦') ? 'red' : 'black'
                });
            });
        });
        return deck;
    }

    // Shuffle deck using Fisher-Yates algorithm
    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    // Deal cards to all players
    dealCards() {
        this.players.forEach(player => {
            player.hand = [];
            for (let i = 0; i < GAME_CONFIG.CARDS_PER_PLAYER; i++) {
                if (this.deck.length > 0) {
                    player.hand.push(this.deck.pop());
                }
            }
        });
    }

    // Setup laundry phase
    setupLaundryPhase() {
        if (this.deck.length >= GAME_CONFIG.CARDS_PER_PLAYER) {
            this.gamePhase = GAME_PHASES.LAUNDRY;
            setTimeout(() => {
                if (this.gamePhase === GAME_PHASES.LAUNDRY && !this.awaitingInspection) {
                    this.endLaundryPhase();
                }
            }, TIMING.LAUNDRY_TIMEOUT);
        } else {
            this.gamePhase = GAME_PHASES.PLAYING;
        }
    }

    // End laundry phase and start playing
    endLaundryPhase() {
        this.gamePhase = GAME_PHASES.PLAYING;
        this.laundryPhaseComplete = true;
        this.emit('laundryPhaseEnded');
    }

    // Handle card play
    playCard(playerIndex, cardIndex) {
        try {
            this.validateCardPlay(playerIndex, cardIndex);
            
            const card = this.players[playerIndex].hand[cardIndex];
            this.validateCardLegality(card);
            
            // Execute the play
            this.executeCardPlay(playerIndex, cardIndex, card);
            
            return true;
        } catch (error) {
            this.emit('error', { message: error.message, playerIndex });
            return false;
        }
    }

    // Validate card play preconditions
    validateCardPlay(playerIndex, cardIndex) {
        if (this.gamePhase !== GAME_PHASES.PLAYING) {
            throw new Error(ERROR_MESSAGES.GAME_PHASE_ERROR);
        }
        if (this.currentPlayer !== playerIndex) {
            throw new Error(ERROR_MESSAGES.NOT_YOUR_TURN);
        }
        if (!this.playersInRound.includes(playerIndex)) {
            throw new Error('Player is not in the current round');
        }
        if (this.isProcessing) {
            throw new Error('Game is processing, please wait');
        }
        if (cardIndex < 0 || cardIndex >= this.players[playerIndex].hand.length) {
            throw new Error('Invalid card index');
        }
    }

    // Validate card follows game rules
    validateCardLegality(card) {
        if (!this.isValidPlay(card)) {
            throw new Error(ERROR_MESSAGES.INVALID_CARD_PLAY);
        }
    }

    // Execute the card play
    executeCardPlay(playerIndex, cardIndex, card) {
        // Mark first card played
        if (!this.firstCardPlayed) {
            this.firstCardPlayed = true;
        }

        // Remove card from hand and add to trick
        this.players[playerIndex].hand.splice(cardIndex, 1);
        this.currentTrick.push({ card: card, player: playerIndex });

        // Set lead suit if first card
        if (this.currentTrick.length === 1) {
            this.leadSuit = card.suit;
        }

        this.emit('cardPlayed', {
            playerIndex,
            card,
            currentTrick: this.currentTrick,
            leadSuit: this.leadSuit
        });

        // Check if trick is complete
        if (this.currentTrick.length === this.playersInRound.length) {
            this.isProcessing = true;
            setTimeout(() => this.evaluateTrick(), TIMING.TRICK_EVALUATION_DELAY);
        } else {
            this.nextPlayer();
        }
    }

    // Check if card play is valid (suit following)
    isValidPlay(card) {
        if (this.currentTrick.length === 0) return true;
        
        const player = this.players[this.currentPlayer];
        const hasSuit = player.hand.some(c => c.suit === this.leadSuit);
        
        return !hasSuit || card.suit === this.leadSuit;
    }

    // Move to next player in round
    nextPlayer() {
        do {
            this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
        } while (!this.playersInRound.includes(this.currentPlayer));
        
        this.emit('playerChanged', { currentPlayer: this.currentPlayer });
    }

    // Evaluate completed trick
    evaluateTrick() {
        try {
            const winner = this.findTrickWinner();
            this.roundTrickWins[winner.player]++;
            
            this.emit('trickWon', {
                winner: winner.player,
                winningCard: winner.card,
                trick: this.currentTrick
            });

            this.tricksPlayed++;
            this.currentTrick = [];
            this.leadSuit = null;

            if (this.tricksPlayed === GAME_CONFIG.TRICKS_PER_ROUND) {
                setTimeout(() => this.endRound(), TIMING.ROUND_END_DELAY);
            } else {
                this.currentPlayer = winner.player;
                this.isProcessing = false;
                this.emit('nextTrick', { leader: this.currentPlayer });
            }
        } catch (error) {
            this.emit('error', { message: error.message });
        }
    }

    // Find winner of current trick
    findTrickWinner() {
        let winner = this.currentTrick[0];
        
        this.currentTrick.forEach(play => {
            if (play.card.suit === this.leadSuit && play.card.value > winner.card.value) {
                winner = play;
            }
        });
        
        return winner;
    }

    // Handle toep (raise stakes)
    toep(playerIndex) {
        try {
            this.validateToepAction(playerIndex);
            
            this.stakes += 1;
            this.lastToeper = playerIndex;
            this.gamePhase = GAME_PHASES.TOEP_RESPONSE;
            this.playerStakesOnEntry[playerIndex] = this.stakes;
            
            this.initializeToepResponses(playerIndex);
            
            this.emit('toepCalled', {
                playerIndex,
                newStakes: this.stakes,
                playersToRespond: this.getPlayersToRespond()
            });

            // Set timeout for auto-responses
            setTimeout(() => {
                if (this.gamePhase === GAME_PHASES.TOEP_RESPONSE) {
                    this.handleAutoToepResponses();
                }
            }, TIMING.TOEP_RESPONSE_TIMEOUT);

            return true;
        } catch (error) {
            this.emit('error', { message: error.message, playerIndex });
            return false;
        }
    }

    // Validate toep action
    validateToepAction(playerIndex) {
        if (this.gamePhase !== GAME_PHASES.PLAYING) {
            throw new Error('Cannot toep in current game phase');
        }
        if (this.currentPlayer !== playerIndex) {
            throw new Error('Not your turn to toep');
        }
        if (this.lastToeper === playerIndex) {
            throw new Error('You already toeped this round');
        }
        if (this.stakes >= GAME_CONFIG.MAX_STAKES) {
            throw new Error('Stakes are already at maximum');
        }
    }

    // Initialize toep response tracking
    initializeToepResponses(toepPlayerIndex) {
        this.toepResponses = new Array(this.players.length).fill(null);
        this.toepResponses[toepPlayerIndex] = 'accept';
    }

    // Get players who need to respond to toep
    getPlayersToRespond() {
        return this.playersInRound.filter(p => p !== this.lastToeper);
    }

    // Handle toep response
    respondToToep(playerIndex, response) {
        try {
            this.validateToepResponse(playerIndex);
            
            this.toepResponses[playerIndex] = response;
            
            if (response === 'accept') {
                this.playerStakesOnEntry[playerIndex] = this.stakes;
            } else if (response === 'fold') {
                this.handlePlayerFold(playerIndex);
            }

            this.emit('toepResponse', { playerIndex, response });
            
            this.checkAllToepResponses();
            return true;
        } catch (error) {
            this.emit('error', { message: error.message, playerIndex });
            return false;
        }
    }

    // Validate toep response
    validateToepResponse(playerIndex) {
        if (this.gamePhase !== GAME_PHASES.TOEP_RESPONSE) {
            throw new Error('Not in toep response phase');
        }
        if (!this.toepResponses || this.toepResponses[playerIndex] !== null) {
            throw new Error('Invalid toep response state');
        }
    }

    // Handle player folding
    handlePlayerFold(playerIndex) {
        const penaltyPoints = this.playerStakesOnEntry[playerIndex];
        this.players[playerIndex].points += penaltyPoints;
        this.playersInRound = this.playersInRound.filter(p => p !== playerIndex);
        
        this.emit('playerFolded', { playerIndex, penaltyPoints });
    }

    // Check if all players have responded to toep
    checkAllToepResponses() {
        const playersToRespond = this.getPlayersToRespond();
        const allResponded = playersToRespond.every(p => this.toepResponses[p] !== null);
        
        if (allResponded || this.playersInRound.length <= 1) {
            this.resolveToepPhase();
        }
    }

    // Resolve toep phase and continue game
    resolveToepPhase() {
        this.gamePhase = GAME_PHASES.PLAYING;
        this.toepResponses = null;
        
        if (this.playersInRound.length <= 1) {
            setTimeout(() => this.endRound(), TIMING.ROUND_END_DELAY);
        } else {
            this.emit('toepResolved', { 
                stakes: this.stakes,
                playersInRound: this.playersInRound 
            });
        }
    }

    // Handle auto toep responses for AI players
    handleAutoToepResponses() {
        const playersToRespond = this.getPlayersToRespond();
        playersToRespond.forEach(playerIndex => {
            if (this.toepResponses[playerIndex] === null && this.players[playerIndex].isBot) {
                const foldChance = this.stakes >= AI_CONFIG.HIGH_STAKES_THRESHOLD ? 
                    AI_CONFIG.FOLD_PROBABILITY_HIGH_STAKES : AI_CONFIG.FOLD_PROBABILITY_BASE;
                
                const response = Math.random() < foldChance ? 'fold' : 'accept';
                this.respondToToep(playerIndex, response);
            }
        });
    }

    // End current round
    endRound() {
        try {
            const winners = this.determineRoundWinners();
            this.applyRoundPenalties(winners);
            this.checkForEliminatedPlayers();
            
            this.emit('roundEnded', {
                winners,
                round: this.round,
                playerStates: this.players.map(p => ({ 
                    name: p.name, 
                    points: p.points, 
                    isEliminated: p.isEliminated 
                }))
            });

            if (this.checkGameEnd()) {
                this.endGame();
            } else {
                this.prepareNextRound();
            }
        } catch (error) {
            this.emit('error', { message: error.message });
        }
    }

    // Determine round winners (most tricks)
    determineRoundWinners() {
        const maxTricks = Math.max(...this.playersInRound.map(p => this.roundTrickWins[p]));
        return this.playersInRound.filter(p => this.roundTrickWins[p] === maxTricks);
    }

    // Apply penalty points to non-winners
    applyRoundPenalties(winners) {
        this.playersInRound.forEach(playerIndex => {
            if (!winners.includes(playerIndex)) {
                const penaltyPoints = this.playerStakesOnEntry[playerIndex];
                this.players[playerIndex].points += penaltyPoints;
            }
        });
    }

    // Check for players who should be eliminated
    checkForEliminatedPlayers() {
        this.players.forEach((player, index) => {
            if (player.points >= GAME_CONFIG.ELIMINATION_POINTS && !player.isEliminated) {
                player.isEliminated = true;
                this.eliminatedPlayers.push(index);
                this.emit('playerEliminated', { playerIndex: index, player });
            }
        });
    }

    // Check if game should end
    checkGameEnd() {
        const activePlayers = this.players.filter(p => !p.isEliminated);
        return activePlayers.length <= 1;
    }

    // End the game
    endGame() {
        this.gamePhase = GAME_PHASES.GAME_END;
        const winner = this.players.find(p => !p.isEliminated);
        
        this.emit('gameEnded', { 
            winner,
            finalScores: this.players.map(p => ({
                name: p.name,
                points: p.points,
                isEliminated: p.isEliminated
            }))
        });
    }

    // Prepare for next round
    prepareNextRound() {
        this.round++;
        this.stakes = GAME_CONFIG.INITIAL_STAKES;
        setTimeout(() => this.startRound(), TIMING.ROUND_END_DELAY);
    }

    // Get current game state
    getGameState() {
        return {
            players: this.players,
            currentPlayer: this.currentPlayer,
            round: this.round,
            stakes: this.stakes,
            currentTrick: this.currentTrick,
            tricksPlayed: this.tricksPlayed,
            gamePhase: this.gamePhase,
            playersInRound: this.playersInRound,
            leadSuit: this.leadSuit,
            playerStakesOnEntry: this.playerStakesOnEntry,
            isProcessing: this.isProcessing
        };
    }
}