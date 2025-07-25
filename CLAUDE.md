# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web-based implementation of Toepen, a classic Dutch card game. The project is a monolithic single-page application built with vanilla HTML, CSS, and JavaScript contained entirely within `toepen.html` (~1,327 lines).

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

### Running the Game
```bash
# Windows
start toepen.html

# macOS  
open toepen.html

# Linux
xdg-open toepen.html
```

### Testing
No automated testing framework - manual testing only:
- Test different player counts (2-4 players)
- Test toeping mechanics and folding scenarios
- Test elimination conditions and win states

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

### Multiplayer Simulation
Current lobby system is frontend-only simulation. Real multiplayer would require:
- Backend WebSocket server
- Player session management  
- Network state synchronization

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