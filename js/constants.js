// Game Configuration Constants
export const GAME_CONFIG = {
    VERSION: 'V-1.6',
    MIN_PLAYERS: 2,
    MAX_PLAYERS: 4,
    CARDS_PER_PLAYER: 4,
    TRICKS_PER_ROUND: 4,
    ELIMINATION_POINTS: 10,
    INITIAL_STAKES: 1,
    MAX_STAKES: 8,
    BLIND_TOEP_STAKES: 3
};

// Timing Constants (in milliseconds)
export const TIMING = {
    AI_DECISION_DELAY: 1500,
    TRICK_EVALUATION_DELAY: 2000,
    ROUND_END_DELAY: 2000,
    TOEP_RESPONSE_DELAY: 1000,
    CARD_PLAY_DELAY: 500,
    LAUNDRY_TIMEOUT: 10000,
    TOEP_RESPONSE_TIMEOUT: 30000
};

// Card System Constants
export const CARD_SUITS = ['♠', '♥', '♦', '♣'];

export const CARD_RANKS = [
    { symbol: 'J', value: 1 },
    { symbol: 'Q', value: 2 },
    { symbol: 'K', value: 3 },
    { symbol: 'A', value: 4 },
    { symbol: '7', value: 5 },
    { symbol: '8', value: 6 },
    { symbol: '9', value: 7 },
    { symbol: '10', value: 8 }
];

// Game Phases
export const GAME_PHASES = {
    SETUP: 'setup',
    LAUNDRY: 'laundry',
    PLAYING: 'playing',
    TOEP_RESPONSE: 'toepResponse',
    BLIND_TOEP_RESPONSE: 'blindToepResponse',
    ROUND_END: 'roundEnd',
    GAME_END: 'gameEnd'
};

// UI Constants
export const UI_CLASSES = {
    CURRENT_PLAYER: 'current-player',
    FLASH_ANIMATION: 'flash',
    DISABLED: 'disabled',
    HIDDEN: 'hidden'
};

// Network Constants
export const SOCKET_EVENTS = {
    CREATE_ROOM: 'createRoom',
    JOIN_ROOM: 'joinRoom',
    GAME_ACTION: 'gameAction',
    GAME_STATE_UPDATE: 'gameStateUpdate',
    PLAYER_DISCONNECTED: 'playerDisconnected',
    ROOM_CREATED: 'roomCreated',
    ROOM_JOINED: 'roomJoined',
    ERROR: 'error'
};

// Action Types
export const ACTION_TYPES = {
    PLAY_CARD: 'playCard',
    TOEP: 'toep',
    ACCEPT_TOEP: 'acceptToep',
    FOLD_TO_TOEP: 'foldToToep',
    FOLD: 'fold',
    SUBMIT_LAUNDRY: 'submitLaundry',
    INSPECT_LAUNDRY: 'inspectLaundry',
    BLIND_TOEP: 'blindToep'
};

// AI Configuration
export const AI_CONFIG = {
    TOEP_PROBABILITY: 0.12,
    FOLD_PROBABILITY_BASE: 0.25,
    FOLD_PROBABILITY_HIGH_STAKES: 0.4,
    BLIND_TOEP_FOLD_PROBABILITY: 0.3,
    HIGH_STAKES_THRESHOLD: 4
};

// Validation Patterns
export const VALIDATION = {
    ROOM_CODE_LENGTH: 6,
    ROOM_CODE_PATTERN: /^[A-Z0-9]{6}$/,
    PLAYER_NAME_MIN_LENGTH: 1,
    PLAYER_NAME_MAX_LENGTH: 20,
    PLAYER_NAME_PATTERN: /^[a-zA-Z0-9\s]+$/
};

// Error Messages
export const ERROR_MESSAGES = {
    INVALID_ROOM_CODE: 'Room code must be 6 characters long and contain only letters and numbers',
    INVALID_PLAYER_NAME: 'Player name must be 1-20 characters and contain only letters, numbers, and spaces',
    ROOM_NOT_FOUND: 'Room not found. Please check the room code.',
    ROOM_FULL: 'Room is full. Maximum 4 players allowed.',
    GAME_ALREADY_STARTED: 'Cannot join - game has already started',
    CONNECTION_ERROR: 'Connection error. Please try again.',
    INVALID_CARD_PLAY: 'Invalid card play. You must follow suit if possible.',
    NOT_YOUR_TURN: 'It is not your turn to play.',
    GAME_PHASE_ERROR: 'Cannot perform this action in the current game phase.'
};