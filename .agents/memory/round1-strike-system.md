---
name: Round 1 Strike System V3.0
description: Round 1 rewritten as PingPong multi-answer mechanic; key data and state machine decisions
---

# Round 1 Strike System

## Data type
`PingPongQuestion { id, difficulty, question, validAnswers: string[] }` in `data/questions.ts`.
GameState uses `pingPongQuestions: PingPongQuestion[]` (3 picked per game) — the old `questionSet: Round1Set` field is GONE.

**Why:** V3.0 spec changed Round 1 from per-player single-answer to shared ping-pong multi-answer.

## State machine (round1.tsx)
- Phases: `intro | playing | question_result`
- Per-question state: `strikes [0,0]`, `passUsed [false,false]`, `currentTurn 0|1`, `givenAnswers string[]`
- All state resets via `resetQuestionState()` between questions
- Turn always toggles after every action (correct/wrong/pass)
- 3 strikes → opponent wins point → `question_result` phase
- All answers exhausted → draw (no point)

**How to apply:** Any future change to Round 1 must keep strikes/pass isolated per question via resetQuestionState().

## Round 5 RTL fix
Transfer array is reversed before display: `[...puzzle.transfers].reverse()`. Club names store country tags inline: `'ريال مدريد (الإسباني)'`. ClubBadge component uses Wikimedia SVG URLs with `onError` fallback to neon letter circle.
