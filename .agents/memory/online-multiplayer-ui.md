---
name: Online Multiplayer UI Architecture
description: Complete screen list, navigation flow, and key wiring decisions for the real-time online multiplayer feature.
---

# Online Multiplayer UI — Architecture Notes

## Navigation flow
```
index.tsx (🌐 أونلاين button)
  → /online-lobby       connect socket + create/join/quick-match
  → /online-waiting     room code display, player list, host start button
  → /online-game        single screen drives all 5 rounds via phase-based rendering
```

## Provider tree (app/_layout.tsx)
```
AuthProvider
  GameProvider
    MultiplayerProvider
      OnlineGameProvider        ← added here, inside auth so token is accessible
        SoundProvider
          RootLayoutNav
```

## OnlineGameContext exports
- `state: OnlineGameState` — full reactive state (room, phase, scores, question, etc.)
- `myUserId: string | null` — NOT inside state object; comes as separate context value
- Lifecycle: `connect(token, userId)`, `disconnect()`
- Room: `createRoom(difficulty)`, `joinRoom(code)`, `leaveRoom()`, `startGame()`
- Matchmaking: `joinMatchmaking(difficulty)`, `cancelMatchmaking()`
- Game actions: `submitAnswer(text)`, `buzz()`, `skip()`, `placeBid(amount)`
- Voice: `sendVoiceClip(data, mimeType)`, `clearVoiceClip()`
- UI helpers: `clearResult()`, `clearRevealedAnswer()`

## online-game.tsx phase rendering map
| state.currentRound | state.phase | Component |
|---|---|---|
| round1 | round1_turn / round1_waiting | Round1UI |
| round2 | round2_bidding / round2_answer | Round2UI |
| round3 | round3_buzz / round3_answer | BuzzerUI (accentColor=#FF6B00) |
| round4 | round4_question / round4_reveal | Round4UI |
| round5 | round5_buzz / round5_answer | BuzzerUI (accentColor=#00E5FF) |
| tiebreaker | tiebreaker_buzz / tiebreaker_answer | BuzzerUI (accentColor=#FFD700) |
| any | transitionRound ≠ null | RoundTransition (full-screen) |
| — | — | game_over → GameOverUI |

## Key wiring decisions
- **gestureEnabled: false** on online-game screen (prevent swipe-back mid-game)
- `myUserId` accessed from context directly, NOT via `state.myUserId` (causes TS errors)
- `state.scores` is a `Record<string, number>` indexed by userId — not per-player
- Countdowns are client-driven from `deadlineTs` timestamps (server-authoritative)
- Auto-navigate: waiting → game on `room.status === 'playing'`; game exits to lobby if `!state.room && !state.gameOver`
- Voice PTT shows visual speaker indicator; actual audio encoding is a future enhancement

**Why:** These decisions prevent the most common real-time game UI bugs (stale state, wrong navigation, TypeScript confusion between myUserId scoping).
