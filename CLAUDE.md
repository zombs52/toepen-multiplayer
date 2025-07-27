# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web-based implementation of Toepen, a classic Dutch card game. The project consists of:
- **Frontend**: Monolithic single-page application in `toepen.html` (~1,327 lines) using vanilla HTML, CSS, and JavaScript
- **Backend**: Node.js/Express server (`server.js`) with Socket.io for real-time multiplayer functionality

### Deployment Information
- **Live Site**: https://toepen-multiplayer-production.up.railway.app/
- **Hosting**: Railway (connected to GitHub for auto-deployment)
- **Repository**: Connected to GitHub - changes pushed to main branch auto-deploy
- **Current Version**: V-0.9 (increment version number for major updates)

## Architecture

### Single-File Design
- **Monolithic Structure**: Entire application in one HTML file for maximum portability
- **No Build Process**: Static HTML file that runs directly in any modern browser
- **No Dependencies**: Uses only vanilla web technologies (HTML5, CSS3, ES6+ JavaScript)
- **Three-Section Organization**: HTML structure, CSS styling, JavaScript logic

### Core Components

#### ToepenGame Class (lines 467-1024)
The central game engine managing all game logic:

**Key State Properties:**
- `players[]`: Array of player objects with name, points, hand, isBot
- `currentPlayer`: Index of active player  
- `stakes`: Current round stakes
- `playerStakesOnEntry[]`: Critical for penalty calculation - tracks stakes when each player entered
- `playersInRound[]`: Players still active in current round
- `gamePhase`: State machine ('setup', 'playing', 'roundEnd', 'gameEnd')

**Core Methods:**
- `startRound()`: Initializes rounds, deals 4 cards, resets state
- `toep()`: Handles stake doubling mechanism
- `playCard()`: Validates and processes card plays
- `evaluateTrick()`: Determines winner using Toepen card hierarchy
- `endRound()`: Calculates penalties based on entry stakes

#### UI System Architecture
**Multi-Screen Interface:**
- Setup Screen: Player configuration and game mode selection
- Lobby Screen: Multiplayer lobby with bot management (frontend simulation only)
- Game Screen: Three-panel responsive layout (player areas + central playing area)
- Toep Decision Screen: Modal for stake-raising decisions

**Event-Driven Pattern:**
Uses `setTimeout()` extensively for natural game flow timing and AI delays

## Commands

### Development Setup
```bash
# Install dependencies
npm install

# Start multiplayer server in development mode (with auto-restart)
npm run dev

# Start multiplayer server in production mode
npm start
```

### Running the Game
**Single Player (offline):**
```bash
# Windows
start toepen.html

# macOS  
open toepen.html

# Linux
xdg-open toepen.html
```

**Multiplayer (online):**
1. Start server: `npm start`
2. Open browser to `http://localhost:3000`
3. Create or join room using 6-character room codes

### Testing
No automated testing framework - manual testing only:
- Test different player counts (2-4 players)
- Test toeping mechanics and folding scenarios
- Test elimination conditions and win states

### Debugging and Development
**Server Logs**: Server outputs detailed action logs to console:
```bash
Player 2 (PlayerName) action: playCard {cardIndex: 1}
Game phase: playing, Current player: 2
```

**Network Debugging**: Use browser dev tools Network tab to monitor Socket.io events

**Local Multiplayer Testing**:
1. Start server: `npm start`
2. Open multiple browser tabs to `http://localhost:3000`
3. Create room in first tab, join with room code in others

## Key Game Mechanics

### Card System
- **Custom Hierarchy**: J(1) < Q(2) < K(3) < A(4) < 7(5) < 8(6) < 9(7) < 10(8)
- **Suit Following**: Must follow lead suit if possible
- **Trick Winner**: Highest card of lead suit wins

### Stakes and Scoring
- **Entry Stakes Tracking**: `playerStakesOnEntry[]` prevents exploitation by tracking when players entered
- **Penalty System**: Players get penalty points equal to their entry stakes if they don't win most tricks
- **Toeping**: Doubles current stakes, forces all players to accept or fold
- **Elimination**: Players eliminated at 10+ points

### AI System
- Simple probabilistic decision making for toeping and folding
- Strategic card play (attempts to avoid winning tricks)
- Configurable difficulty through fold rates and toep probabilities

## Important Implementation Details

### State Management Pattern
Game uses phase-based state machine to control available actions and UI states

### Stakes Tracking System  
Critical implementation detail: `playerStakesOnEntry` array tracks the stakes level when each player entered the current round. This prevents players from folding after stakes increase to avoid higher penalties.

### Multiplayer Architecture
Real-time multiplayer implemented using Socket.io:
- **Server State**: Game rooms stored in Map with room codes
- **Event-Based Sync**: All game actions broadcast to room members
- **Dual-Mode Support**: Same frontend works for both offline and online play
- **Room Management**: 6-character room codes for easy joining

#### Socket.io Communication Pattern
- **Client Actions**: `gameAction` events with action types (`playCard`, `toep`, `fold`, etc.)
- **Server Responses**: `gameStateUpdate` broadcasts to all room members
- **Room Management**: 6-character codes stored in `Map<string, Room>` structure

#### Server State Management (server.js)
- **Game Rooms**: Persistent in-memory storage using Map
- **Player Tracking**: Socket ID mapping to player objects
- **Disconnection Handling**: Automatic cleanup and host reassignment
- **Action Processing**: Centralized `processGameAction()` function validates and applies game logic

#### Key Server Functions
- `createDeckAndDeal()`: Server-side card shuffling and dealing (lines 32-73)
- `isValidPlay()`: Suit-following validation (lines 75-91)
- `evaluateTrick()`: Winner determination using Toepen hierarchy (lines 495-529)
- `endRound()`: Penalty calculation and elimination logic (lines 531-597)

#### Laundry System Implementation
Special "Laundry" mechanics for specific hand combinations:
- **Witte Was**: 4 face cards (J, Q, K)
- **Vuile Was**: 3 face cards + 1 seven
- **Inspection Phase**: 10-second window for laundry claims
- **Penalty System**: Wrong claims result in visible cards or penalty points

### Browser Requirements
- Modern ES6+ support required
- CSS Grid and backdrop-filter support
- No IE11 compatibility

## Code Organization Patterns

### JavaScript Architecture
- ES6 classes for structure
- Arrow functions throughout
- Array methods (filter, map, forEach, reduce) for data manipulation
- Template literals for dynamic content

### CSS Architecture  
- CSS Grid for responsive layout
- Mobile-first responsive design
- Component-based styling approach

## Development Workflow

### Version Management
- Always increment version number (V-0.X) in `toepen.html` for major updates
- Commit with descriptive messages including version bump
- Push to main branch triggers automatic Railway deployment

### Testing Workflow
1. Make changes locally
2. Test locally with `npm start` and `http://localhost:3000`
3. Commit and push to deploy to Railway
4. Test live site at https://toepen-multiplayer-production.up.railway.app/

### Current Focus Areas
- **Multiplayer Parity**: Ensuring multiplayer works as smoothly as singleplayer
- **Synchronization**: Real-time game state sync between clients
- **User Experience**: Seamless gameplay flow and feedback