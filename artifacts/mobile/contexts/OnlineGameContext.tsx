/**
 * OnlineGameContext — Socket.io-backed state machine for online multiplayer.
 *
 * Rounds: round1 → round2 → round3 → round5 → (tiebreaker if tied). Round 4
 * ("30-second challenge") only exists offline; it's skipped entirely online.
 *
 * Server events handled:
 *   room:update, room:matched, room:readyUpdate, room:readyCountdown,
 *   game:started, game:roundStart, game:roundEnd, game:question,
 *   game:answerResult, game:round1Answer, game:answerAck,
 *   game:bidUpdate, game:auctionWon, game:auctionResult, game:withdraw,
 *   game:round2Start, game:round2Answer, game:round2Result,
 *   game:buzzResult, game:questionReveal, game:puzzleSkipped,
 *   game:playerLeft, game:over, game:xpAwarded, game:state
 *
 * Client events emitted:
 *   room:create, room:join, room:leave, room:start,
 *   matchmaking:join, matchmaking:cancel,
 *   player:ready,
 *   game:submitAnswer, game:buzz, game:skip, game:skipPuzzle, game:bid, game:withdraw
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Socket } from 'socket.io-client';
import { createSocket } from '@/lib/socket';
import { API_BASE } from '@/lib/apiClient';

// ── Public types ───────────────────────────────────────────────────────────────

export interface OnlinePlayer {
  userId: string;
  username: string;
  avatar: string;
  isHost: boolean;
  score: number;
  strikes: number;
  connected: boolean;
  outOfRound1: boolean;
  skipUsed: boolean;
  level: number;
  totalWins: number;
}

export interface OnlineRoom {
  code: string;
  mode: 'group' | 'quick';
  status: 'lobby' | 'playing' | 'finished';
  hostUserId: string;
  players: OnlinePlayer[];
  difficulty: 'easy' | 'medium' | 'hard';
  readyUserIds: string[];
}

export interface QuestionData {
  id: string;
  question?: string;
  choices?: string[];
  category?: string;
  description?: string;
  transfers?: string[];
  questionIndex?: number;
  questionStrikes?: Record<string, number>;
}

export interface AnswerResult {
  round: string;
  userId: string | null;
  correct: boolean;
  correctAnswer: string;
  submittedText: string | null;
  skipped?: boolean;
  strikeOut?: boolean;
  strikes?: number;
  outOfRound1?: boolean;
  scores?: Record<string, number>;
  questionStrikes?: Record<string, number>;
}

export interface Round1Answer {
  userId: string;
  text: string;
  correct: boolean;
  skipped?: boolean;
  questionIndex: number;
  questionStrikes: Record<string, number>;
}

// Round 2 — one entry per submitted guess during the answer phase (live feed)
export interface Round2Answer {
  userId: string;
  text: string;
  correct: boolean;
  correctCount: number;
  wrongCount: number;
  neededCount: number;
}

export interface Round2Result {
  winnerUserId: string | null;
  outcome: 'won' | 'timeout';
  pointsAwarded: number;
  correctCount: number;
  bidAmount: number;
  possibleAnswers: string[];
  scores: Record<string, number>;
}

export interface OnlineGameState {
  connected: boolean;
  error: string | null;

  // Room
  room: OnlineRoom | null;
  matchmaking: boolean;

  // Ready system (quick match)
  readyPlayers: string[];
  readyCountdown: number | null; // null = not counting, 3/2/1 = counting

  // Game progression
  currentRound: string | null;
  phase: string | null;
  turnUserId: string | null;
  question: QuestionData | null;
  deadlineTs: number | null;
  scores: Record<string, number>;

  // Round 1 — live answer feed (all answers broadcast to both players)
  round1Answers: Round1Answer[];

  // Round 2 – auction
  currentBid: { userId: string; amount: number } | null;
  biddingDeadline: number | null;
  // set once bidding closes; deadlineTs (generic field below) carries the
  // countdown-end / answer-deadline timestamp depending on `phase`
  auctionWonBy: { winnerUserId: string; amount: number } | null;
  round2Answers: Round2Answer[];
  round2Result: Round2Result | null;
  withdrawInfo: { withdrawnBy: string; winnerUserId: string; amount: number } | null;

  // Buzzer round (Round 3, Round 5, Tiebreaker — same buzz-lock mechanic)
  buzzWinner: { userId: string; deadlineTs: number } | null;

  // Tiebreaker: someone skipped the current puzzle before anyone buzzed
  puzzleSkippedBy: string | null;

  // Result display (auto-clears after 2.8 s)
  lastResult: AnswerResult | null;

  // Between-round animation
  transitionRound: string | null;

  // Synchronized round-summary popup — shown to all players right after a
  // round ends, before the next round's transition banner arrives.
  roundEnd: { round: string; scores: Record<string, number> } | null;

  // Correct answer reveal (buzzer / auction no-winner)
  revealedAnswer: string | null;

  // Game over
  gameOver: {
    winnerUserId: string | null;
    scores: Record<string, number>;
    tied: string[];
    decidedByTiebreaker?: boolean;
  } | null;

  // XP earned this match — only ever populated on the winner's client
  // (server emits game:xpAwarded solely to the winning player's socket).
  xpAwarded: { level: number; xp: number; totalWins: number; xpGain: number; leveledUp: boolean } | null;
}

const INITIAL_STATE: OnlineGameState = {
  connected: false,
  error: null,
  room: null,
  matchmaking: false,
  readyPlayers: [],
  readyCountdown: null,
  currentRound: null,
  phase: null,
  turnUserId: null,
  question: null,
  deadlineTs: null,
  scores: {},
  round1Answers: [],
  currentBid: null,
  biddingDeadline: null,
  auctionWonBy: null,
  round2Answers: [],
  round2Result: null,
  withdrawInfo: null,
  buzzWinner: null,
  puzzleSkippedBy: null,
  lastResult: null,
  transitionRound: null,
  roundEnd: null,
  revealedAnswer: null,
  gameOver: null,
  xpAwarded: null,
};

// ── Context interface ──────────────────────────────────────────────────────────

interface OnlineGameContextValue {
  state: OnlineGameState;
  myUserId: string | null;
  myToken: string | null;

  connect: (token: string, userId: string) => void;
  disconnect: () => void;

  createRoom: (difficulty: string) => Promise<{ ok: boolean; error?: string }>;
  joinRoom: (code: string) => Promise<{ ok: boolean; error?: string }>;
  leaveRoom: () => void;
  startGame: () => Promise<{ ok: boolean; error?: string }>;

  joinMatchmaking: (difficulty: string) => Promise<{ ok: boolean; error?: string }>;
  cancelMatchmaking: () => void;

  sendReady: () => void;

  submitAnswer: (text: string) => void;
  buzz: () => void;
  skip: () => void;
  skipPuzzle: () => void;
  placeBid: (amount: number) => void;
  withdraw: () => void;

  clearResult: () => void;
  clearRevealedAnswer: () => void;
}

const OnlineGameContext = createContext<OnlineGameContextValue | null>(null);

export function OnlineGameProvider({ children }: { children: ReactNode }) {
  const [state, setState]   = useState<OnlineGameState>(INITIAL_STATE);
  const socketRef           = useRef<Socket | null>(null);
  const myUserIdRef         = useRef<string | null>(null);
  const myTokenRef          = useRef<string | null>(null);
  const [myUserId, setMyUserId]   = useState<string | null>(null);
  const [myToken,  setMyToken]    = useState<string | null>(null);
  const resultTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const withdrawTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const puzzleSkipTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Countdown helper (client-side 3-2-1) ───────────────────────────────────
  const startReadyCountdown = useCallback((from: number) => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setState((s) => ({ ...s, readyCountdown: from }));
    let remaining = from;
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setState((s) => ({ ...s, readyCountdown: null }));
      } else {
        setState((s) => ({ ...s, readyCountdown: remaining }));
      }
    }, 1000);
  }, []);

  // ── Socket event handlers ─────────────────────────────────────────────────

  const attachHandlers = useCallback((socket: Socket) => {
    socket.on('connect', () => {
      setState((s) => ({ ...s, connected: true, error: null }));
    });
    socket.on('disconnect', () => {
      setState((s) => ({ ...s, connected: false }));
    });
    socket.on('connect_error', (err: Error) => {
      setState((s) => ({ ...s, connected: false, error: err.message }));
    });

    // ── Room events ──────────────────────────────────────────────────────────

    socket.on('room:update', (payload: { room: OnlineRoom }) => {
      setState((s) => ({ ...s, room: payload.room }));
    });

    socket.on('room:matched', (payload: { room: OnlineRoom }) => {
      setState((s) => ({
        ...s,
        room: payload.room,
        matchmaking: false,
        readyPlayers: [],
        readyCountdown: null,
        error: null,
      }));
    });

    socket.on('room:readyUpdate', (payload: { readyUserIds: string[] }) => {
      setState((s) => ({ ...s, readyPlayers: payload.readyUserIds }));
    });

    socket.on('room:readyCountdown', (payload: { seconds: number }) => {
      startReadyCountdown(payload.seconds);
    });

    // ── Game lifecycle ───────────────────────────────────────────────────────

    socket.on('game:started', (payload: { room: OnlineRoom }) => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      setState((s) => ({
        ...s,
        room: payload.room,
        scores: {},
        currentRound: null,
        phase: null,
        question: null,
        deadlineTs: null,
        lastResult: null,
        gameOver: null,
        transitionRound: null,
        roundEnd: null,
        xpAwarded: null,
        puzzleSkippedBy: null,
        round1Answers: [],
        readyPlayers: [],
        readyCountdown: null,
      }));
    });

    socket.on('game:roundStart', (payload: { round: string; scores: Record<string, number> }) => {
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      setState((s) => ({
        ...s,
        currentRound: payload.round,
        transitionRound: payload.round,
        roundEnd: null,
        scores: payload.scores,
        question: null,
        deadlineTs: null,
        lastResult: null,
        currentBid: null,
        biddingDeadline: null,
        auctionWonBy: null,
        round2Answers: [],
        round2Result: null,
        withdrawInfo: null,
        buzzWinner: null,
        puzzleSkippedBy: null,
        revealedAnswer: null,
        turnUserId: null,
        round1Answers: [],
      }));
    });

    // Synced "round complete" summary — server holds every client here for a
    // fixed delay (via the roundEnd popup) before the next round begins.
    socket.on('game:roundEnd', (payload: { round: string; scores: Record<string, number> }) => {
      setState((s) => ({ ...s, roundEnd: payload, scores: payload.scores, question: null, buzzWinner: null }));
    });

    socket.on('game:question', (payload: {
      round: string;
      phase: string;
      turnUserId?: string;
      question: QuestionData;
      deadlineTs: number;
      scores: Record<string, number>;
      questionIndex?: number;
      questionStrikes?: Record<string, number>;
    }) => {
      setState((s) => {
        // If same question (same id), keep answer feed; otherwise reset
        const sameQuestion = s.question?.id === payload.question.id;
        return {
          ...s,
          currentRound: payload.round,
          transitionRound: null,
          roundEnd: null,
          phase: payload.phase,
          turnUserId: payload.turnUserId ?? null,
          question: {
            ...payload.question,
            questionIndex: payload.questionIndex,
            questionStrikes: payload.questionStrikes,
          },
          deadlineTs: payload.deadlineTs,
          scores: payload.scores,
          lastResult: null,
          buzzWinner: null,
          auctionWonBy: null,
          currentBid: null,
          biddingDeadline: null,
          revealedAnswer: null,
          round2Result: null,
          // Reset answer feeds only on a truly new question
          round1Answers: sameQuestion ? s.round1Answers : [],
          round2Answers: sameQuestion ? s.round2Answers : [],
        };
      });
    });

    // ── Round 1: answer feed (broadcast every attempt to both players) ────────
    socket.on('game:round1Answer', (payload: Round1Answer) => {
      setState((s) => ({
        ...s,
        round1Answers: [...s.round1Answers, payload],
        // Update question's questionStrikes if server sent updated map
        question: s.question
          ? { ...s.question, questionStrikes: payload.questionStrikes }
          : s.question,
      }));
    });

    socket.on('game:answerResult', (payload: AnswerResult) => {
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      setState((s) => ({
        ...s,
        lastResult: payload,
        scores: payload.scores ?? s.scores,
        // Update room players' strikes from payload
        room: s.room
          ? {
              ...s.room,
              players: s.room.players.map((p) => {
                if (payload.questionStrikes && p.userId in payload.questionStrikes) {
                  return { ...p };
                }
                return p;
              }),
            }
          : s.room,
      }));
      resultTimerRef.current = setTimeout(() => {
        setState((s) => ({ ...s, lastResult: null }));
      }, 2800);
    });

    socket.on('game:answerAck', () => {
      // Server acknowledged our Round 4 answer
    });

    // ── Round 2 – Auction ────────────────────────────────────────────────────

    socket.on('game:bidUpdate', (payload: { userId: string; amount: number; deadlineTs: number }) => {
      setState((s) => ({
        ...s,
        currentBid: { userId: payload.userId, amount: payload.amount },
        biddingDeadline: payload.deadlineTs,
      }));
    });

    // Bidding closed — 3s "المزاد سيبدأ..." countdown before the answer phase.
    // `startAt` is when the answer phase begins; reuse the generic
    // deadlineTs field to drive the countdown ring.
    socket.on('game:auctionWon', (payload: { winnerUserId: string; amount: number; countdownMs: number; startAt: number }) => {
      setState((s) => ({
        ...s,
        phase: 'round2_countdown',
        auctionWonBy: { winnerUserId: payload.winnerUserId, amount: payload.amount },
        deadlineTs: payload.startAt,
        round2Answers: [],
        round2Result: null,
      }));
    });

    socket.on('game:round2Start', (payload: { winnerUserId: string; amount: number; deadlineTs: number }) => {
      setState((s) => ({
        ...s,
        phase: 'round2_answer',
        auctionWonBy: { winnerUserId: payload.winnerUserId, amount: payload.amount },
        deadlineTs: payload.deadlineTs,
      }));
    });

    // Live feed: every guess from the auction winner, validated instantly.
    socket.on('game:round2Answer', (payload: Round2Answer) => {
      setState((s) => ({ ...s, round2Answers: [...s.round2Answers, payload] }));
    });

    socket.on('game:round2Result', (payload: Round2Result) => {
      setState((s) => ({
        ...s,
        phase: 'round_end',
        round2Result: payload,
        scores: payload.scores,
        auctionWonBy: null,
      }));
    });

    socket.on('game:auctionResult', (_payload: { winnerUserId: null; amount: number }) => {
      setState((s) => ({ ...s, auctionWonBy: null }));
    });

    // Opponent surrendered during bidding — instant win, skip straight to countdown.
    socket.on('game:withdraw', (payload: { withdrawnBy: string; winnerUserId: string; amount: number }) => {
      if (withdrawTimerRef.current) clearTimeout(withdrawTimerRef.current);
      setState((s) => ({ ...s, withdrawInfo: payload }));
      withdrawTimerRef.current = setTimeout(() => {
        setState((s) => ({ ...s, withdrawInfo: null }));
      }, 3000);
    });

    // ── Buzzer round (Round 3, Round 5, Tiebreaker — shared buzz-lock) ────────

    socket.on('game:buzzResult', (payload: { winnerUserId: string; deadlineTs: number }) => {
      setState((s) => ({
        ...s,
        phase: s.currentRound ? `${s.currentRound}_answer` : s.phase,
        buzzWinner: { userId: payload.winnerUserId, deadlineTs: payload.deadlineTs },
        deadlineTs: payload.deadlineTs,
      }));
    });

    // Tiebreaker: someone skipped before anyone buzzed — a fresh
    // game:question for the new puzzle follows immediately after this.
    // Auto-clear on a short timer (like withdrawInfo) since the very next
    // game:question event fires in the same tick and would otherwise wipe
    // this before it's ever rendered.
    socket.on('game:puzzleSkipped', (payload: { skippedBy: string }) => {
      if (puzzleSkipTimerRef.current) clearTimeout(puzzleSkipTimerRef.current);
      setState((s) => ({ ...s, puzzleSkippedBy: payload.skippedBy }));
      puzzleSkipTimerRef.current = setTimeout(() => {
        setState((s) => ({ ...s, puzzleSkippedBy: null }));
      }, 2200);
    });

    // ── Correct answer reveal ────────────────────────────────────────────────

    socket.on('game:questionReveal', (payload: { round: string; correctAnswer: string }) => {
      setState((s) => ({ ...s, revealedAnswer: payload.correctAnswer }));
    });

    // ── Player left mid-game ─────────────────────────────────────────────────

    socket.on('game:playerLeft', (payload: { userId: string; room: OnlineRoom }) => {
      setState((s) => ({ ...s, room: payload.room }));
    });

    // ── Game over ────────────────────────────────────────────────────────────

    socket.on('game:over', (payload: {
      winnerUserId: string | null;
      scores: Record<string, number>;
      tied: string[];
      decidedByTiebreaker?: boolean;
    }) => {
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      setState((s) => ({
        ...s,
        phase: 'game_over',
        gameOver: payload,
        scores: payload.scores,
        transitionRound: null,
        roundEnd: null,
        lastResult: null,
      }));
    });

    // XP earned this match — the server only ever sends this to the winner's
    // own socket, so simply receiving it means "you won". Arrives shortly
    // after game:over once the DB write finishes; keep it independent of
    // gameOver's payload so ordering doesn't matter.
    socket.on('game:xpAwarded', (payload: { level: number; xp: number; totalWins: number; xpGain: number; leveledUp: boolean }) => {
      setState((s) => ({ ...s, xpAwarded: payload }));
    });

    // ── Reconnect state restore ──────────────────────────────────────────────

    socket.on('game:state', (payload: {
      room: OnlineRoom;
      questionDeadline: number | null;
      buzzLock: { userId: string } | null;
      auctionWinnerUserId: string | null;
      currentBid: { userId: string; amount: number } | null;
      questionStrikes?: Record<string, number>;
    }) => {
      setState((s) => ({
        ...s,
        room: payload.room,
        deadlineTs: payload.questionDeadline,
        currentBid: payload.currentBid,
      }));
    });
  }, [startReadyCountdown]);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  const connect = useCallback((token: string, userId: string) => {
    socketRef.current?.disconnect();
    const socket = createSocket(token);
    attachHandlers(socket);
    socketRef.current = socket;
    myUserIdRef.current = userId;
    myTokenRef.current = token;
    setMyUserId(userId);
    setMyToken(token);
  }, [attachHandlers]);

  const disconnect = useCallback(() => {
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (withdrawTimerRef.current) clearTimeout(withdrawTimerRef.current);
    if (puzzleSkipTimerRef.current) clearTimeout(puzzleSkipTimerRef.current);
    socketRef.current?.disconnect();
    socketRef.current = null;
    myUserIdRef.current = null;
    myTokenRef.current = null;
    setMyUserId(null);
    setMyToken(null);
    setState(INITIAL_STATE);
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (puzzleSkipTimerRef.current) clearTimeout(puzzleSkipTimerRef.current);
      if (withdrawTimerRef.current) clearTimeout(withdrawTimerRef.current);
    };
  }, []);

  // ── Room actions ───────────────────────────────────────────────────────────

  const createRoom = useCallback((difficulty: string): Promise<{ ok: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!socketRef.current?.connected) {
        resolve({ ok: false, error: 'غير متصل بالخادم' });
        return;
      }
      socketRef.current.emit('room:create', { difficulty }, (res: { ok: boolean; room?: OnlineRoom; error?: string }) => {
        if (res.ok && res.room) setState((s) => ({ ...s, room: res.room!, error: null }));
        resolve(res);
      });
    });
  }, []);

  const joinRoom = useCallback((code: string): Promise<{ ok: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!socketRef.current?.connected) {
        resolve({ ok: false, error: 'غير متصل بالخادم' });
        return;
      }
      socketRef.current.emit('room:join', { code: code.toUpperCase().trim() }, (res: { ok: boolean; room?: OnlineRoom; error?: string }) => {
        if (res.ok && res.room) setState((s) => ({ ...s, room: res.room!, error: null }));
        resolve(res);
      });
    });
  }, []);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('room:leave');
    setState((s) => ({ ...s, room: null, matchmaking: false, readyPlayers: [], readyCountdown: null }));
  }, []);

  const startGame = useCallback((): Promise<{ ok: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!socketRef.current?.connected) {
        resolve({ ok: false, error: 'غير متصل بالخادم' });
        return;
      }
      socketRef.current.emit('room:start', {}, (res: { ok: boolean; error?: string }) => {
        resolve(res);
      });
    });
  }, []);

  // ── Matchmaking ────────────────────────────────────────────────────────────

  const joinMatchmaking = useCallback((difficulty: string): Promise<{ ok: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!socketRef.current?.connected) {
        resolve({ ok: false, error: 'غير متصل بالخادم' });
        return;
      }
      setState((s) => ({ ...s, matchmaking: true, error: null }));
      socketRef.current.emit('matchmaking:join', { difficulty }, (res: { ok: boolean; matched?: boolean; room?: OnlineRoom; error?: string }) => {
        if (!res.ok) {
          setState((s) => ({ ...s, matchmaking: false }));
        } else if (res.matched && res.room) {
          setState((s) => ({ ...s, room: res.room!, matchmaking: false, readyPlayers: [] }));
        }
        resolve(res);
      });
    });
  }, []);

  const cancelMatchmaking = useCallback(() => {
    socketRef.current?.emit('matchmaking:cancel');
    setState((s) => ({ ...s, matchmaking: false }));
  }, []);

  // ── Ready system ───────────────────────────────────────────────────────────

  const sendReady = useCallback(() => {
    socketRef.current?.emit('player:ready');
    // Optimistically mark self as ready in local state
    const uid = myUserIdRef.current;
    if (uid) {
      setState((s) => ({
        ...s,
        readyPlayers: s.readyPlayers.includes(uid) ? s.readyPlayers : [...s.readyPlayers, uid],
      }));
    }
  }, []);

  // ── Game actions ───────────────────────────────────────────────────────────

  const submitAnswer = useCallback((text: string) => {
    socketRef.current?.emit('game:submitAnswer', { text });
  }, []);

  const buzz = useCallback(() => {
    socketRef.current?.emit('game:buzz');
  }, []);

  const skip = useCallback(() => {
    socketRef.current?.emit('game:skip');
  }, []);

  const skipPuzzle = useCallback(() => {
    socketRef.current?.emit('game:skipPuzzle');
  }, []);

  const placeBid = useCallback((amount: number) => {
    socketRef.current?.emit('game:bid', { amount });
  }, []);

  const withdraw = useCallback(() => {
    socketRef.current?.emit('game:withdraw');
  }, []);

  // ── UI helpers ─────────────────────────────────────────────────────────────

  const clearResult = useCallback(() => {
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    setState((s) => ({ ...s, lastResult: null }));
  }, []);

  const clearRevealedAnswer = useCallback(() => {
    setState((s) => ({ ...s, revealedAnswer: null }));
  }, []);

  return (
    <OnlineGameContext.Provider value={{
      state,
      myUserId,
      myToken,
      connect,
      disconnect,
      createRoom,
      joinRoom,
      leaveRoom,
      startGame,
      joinMatchmaking,
      cancelMatchmaking,
      sendReady,
      submitAnswer,
      buzz,
      skip,
      skipPuzzle,
      placeBid,
      withdraw,
      clearResult,
      clearRevealedAnswer,
    }}>
      {children}
    </OnlineGameContext.Provider>
  );
}

export function useOnlineGame(): OnlineGameContextValue {
  const ctx = useContext(OnlineGameContext);
  if (!ctx) throw new Error('useOnlineGame must be inside OnlineGameProvider');
  return ctx;
}
