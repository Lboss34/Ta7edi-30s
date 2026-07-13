/**
 * OnlineGameContext — Socket.io-backed state machine for online multiplayer.
 *
 * Creates a dedicated socket (separate from AuthContext's presence socket) so
 * the game lifecycle is independent. Connect on entering the online flow,
 * disconnect on leaving.
 *
 * Server events handled:
 *   room:update, room:matched, game:started, game:roundStart, game:question,
 *   game:answerResult, game:answerAck, game:bidUpdate, game:auctionWon,
 *   game:auctionResult, game:buzzResult, game:round4Reveal, game:questionReveal,
 *   game:playerLeft, game:over, game:state, voice:clip
 *
 * Client events emitted:
 *   room:create, room:join, room:leave, room:start,
 *   matchmaking:join, matchmaking:cancel,
 *   game:submitAnswer, game:buzz, game:skip, game:bid, voice:clip
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
}

export interface OnlineRoom {
  code: string;
  mode: 'group' | 'quick';
  status: 'lobby' | 'playing' | 'finished';
  hostUserId: string;
  players: OnlinePlayer[];
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface QuestionData {
  id: string;
  question?: string;       // Round 1, Round 3
  choices?: string[];      // Round 3 optional choices
  category?: string;       // Round 2 auction category
  description?: string;    // Round 2 auction description
  transfers?: string[];    // Round 5 / Tiebreaker player chain
}

export interface AnswerResult {
  round: string;
  userId: string | null;
  correct: boolean;
  correctAnswer: string;
  submittedText: string | null;
  skipped?: boolean;
  strikes?: number;
  outOfRound1?: boolean;
  scores?: Record<string, number>;
}

export interface OnlineGameState {
  connected: boolean;
  error: string | null;

  // Room
  room: OnlineRoom | null;
  matchmaking: boolean;

  // Game progression
  currentRound: string | null;   // 'round1' | 'round2' | ... | 'tiebreaker'
  phase: string | null;          // mirrors server phase field
  turnUserId: string | null;     // Round 1: who has the turn
  question: QuestionData | null;
  deadlineTs: number | null;
  scores: Record<string, number>;

  // Round 2 – auction
  currentBid: { userId: string; amount: number } | null;
  biddingDeadline: number | null;
  auctionWonBy: { winnerUserId: string; amount: number; deadlineTs: number } | null;

  // Buzzer rounds
  buzzWinner: { userId: string; deadlineTs: number } | null;

  // Result display (auto-clears after 2.5 s)
  lastResult: AnswerResult | null;

  // Round 4 reveal
  round4Results: { userId: string; text: string; correct: boolean; points: number }[] | null;
  round4CorrectAnswer: string | null;

  // Between-round animation
  transitionRound: string | null;

  // Correct answer reveal (buzzer / auction no-winner)
  revealedAnswer: string | null;

  // Game over
  gameOver: {
    winnerUserId: string | null;
    scores: Record<string, number>;
    tied: string[];
    decidedByTiebreaker?: boolean;
  } | null;

  // Voice clip received (latest, consumed by caller)
  lastVoiceClip: { fromUserId: string; data: unknown; mimeType: string } | null;
}

const INITIAL_STATE: OnlineGameState = {
  connected: false,
  error: null,
  room: null,
  matchmaking: false,
  currentRound: null,
  phase: null,
  turnUserId: null,
  question: null,
  deadlineTs: null,
  scores: {},
  currentBid: null,
  biddingDeadline: null,
  auctionWonBy: null,
  buzzWinner: null,
  lastResult: null,
  round4Results: null,
  round4CorrectAnswer: null,
  transitionRound: null,
  revealedAnswer: null,
  gameOver: null,
  lastVoiceClip: null,
};

// ── Context interface ──────────────────────────────────────────────────────────

interface OnlineGameContextValue {
  state: OnlineGameState;
  myUserId: string | null;

  // Lifecycle
  connect: (token: string, userId: string) => void;
  disconnect: () => void;

  // Room management
  createRoom: (difficulty: string) => Promise<{ ok: boolean; error?: string }>;
  joinRoom: (code: string) => Promise<{ ok: boolean; error?: string }>;
  leaveRoom: () => void;
  startGame: () => Promise<{ ok: boolean; error?: string }>;

  // Matchmaking
  joinMatchmaking: (difficulty: string) => Promise<{ ok: boolean; error?: string }>;
  cancelMatchmaking: () => void;

  // Game actions
  submitAnswer: (text: string) => void;
  buzz: () => void;
  skip: () => void;
  placeBid: (amount: number) => void;

  // Voice
  sendVoiceClip: (data: unknown, mimeType: string) => void;

  // UI helpers
  clearResult: () => void;
  clearRevealedAnswer: () => void;
  clearVoiceClip: () => void;
}

// ── Context ────────────────────────────────────────────────────────────────────

const OnlineGameContext = createContext<OnlineGameContextValue | null>(null);

export function OnlineGameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnlineGameState>(INITIAL_STATE);
  const socketRef = useRef<Socket | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Socket event handlers ────────────────────────────────────────────────────

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
        error: null,
      }));
    });

    // ── Game lifecycle ───────────────────────────────────────────────────────

    socket.on('game:started', (payload: { room: OnlineRoom }) => {
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
      }));
    });

    socket.on('game:roundStart', (payload: { round: string; scores: Record<string, number> }) => {
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      setState((s) => ({
        ...s,
        currentRound: payload.round,
        transitionRound: payload.round,
        scores: payload.scores,
        question: null,
        deadlineTs: null,
        lastResult: null,
        currentBid: null,
        biddingDeadline: null,
        auctionWonBy: null,
        buzzWinner: null,
        round4Results: null,
        round4CorrectAnswer: null,
        revealedAnswer: null,
        turnUserId: null,
      }));
    });

    socket.on('game:question', (payload: {
      round: string;
      phase: string;
      turnUserId?: string;
      question: QuestionData;
      deadlineTs: number;
      scores: Record<string, number>;
    }) => {
      setState((s) => ({
        ...s,
        currentRound: payload.round,
        transitionRound: null,        // clear transition when first question arrives
        phase: payload.phase,
        turnUserId: payload.turnUserId ?? null,
        question: payload.question,
        deadlineTs: payload.deadlineTs,
        scores: payload.scores,
        lastResult: null,
        buzzWinner: null,
        auctionWonBy: null,
        currentBid: null,
        biddingDeadline: null,
        revealedAnswer: null,
        round4Results: null,
        round4CorrectAnswer: null,
      }));
    });

    socket.on('game:answerResult', (payload: AnswerResult) => {
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      setState((s) => ({
        ...s,
        lastResult: payload,
        scores: payload.scores ?? s.scores,
      }));
      resultTimerRef.current = setTimeout(() => {
        setState((s) => ({ ...s, lastResult: null }));
      }, 2800);
    });

    socket.on('game:answerAck', () => {
      // Server acknowledged our Round 4 answer — handled implicitly by UI disabling the input
    });

    // ── Round 2 – Auction ────────────────────────────────────────────────────

    socket.on('game:bidUpdate', (payload: { userId: string; amount: number; deadlineTs: number }) => {
      setState((s) => ({
        ...s,
        currentBid: { userId: payload.userId, amount: payload.amount },
        biddingDeadline: payload.deadlineTs,
      }));
    });

    socket.on('game:auctionWon', (payload: { winnerUserId: string; amount: number; deadlineTs: number }) => {
      setState((s) => ({
        ...s,
        phase: 'round2_answer',
        auctionWonBy: payload,
        deadlineTs: payload.deadlineTs,
      }));
    });

    socket.on('game:auctionResult', (payload: { winnerUserId: null; amount: number }) => {
      // No one bid — topic skipped
      setState((s) => ({ ...s, auctionWonBy: null }));
    });

    // ── Buzzer rounds ────────────────────────────────────────────────────────

    socket.on('game:buzzResult', (payload: { winnerUserId: string; deadlineTs: number }) => {
      setState((s) => {
        const buzzPhase = s.currentRound === 'round3' ? 'round3_answer'
          : s.currentRound === 'round5' ? 'round5_answer'
          : 'tiebreaker_answer';
        return {
          ...s,
          phase: buzzPhase,
          buzzWinner: { userId: payload.winnerUserId, deadlineTs: payload.deadlineTs },
          deadlineTs: payload.deadlineTs,
        };
      });
    });

    // ── Round 4 – Rapid Fire reveal ──────────────────────────────────────────

    socket.on('game:round4Reveal', (payload: {
      correctAnswer: string;
      results: { userId: string; text: string; correct: boolean; points: number }[];
      scores: Record<string, number>;
    }) => {
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      setState((s) => ({
        ...s,
        phase: 'round4_reveal',
        round4Results: payload.results,
        round4CorrectAnswer: payload.correctAnswer,
        scores: payload.scores,
      }));
    });

    // ── Correct answer reveal (buzzer / auction no-bid) ──────────────────────

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
        lastResult: null,
      }));
    });

    // ── Reconnect state restore ──────────────────────────────────────────────

    socket.on('game:state', (payload: {
      room: OnlineRoom;
      questionDeadline: number | null;
      buzzLock: { userId: string } | null;
      auctionWinnerUserId: string | null;
      currentBid: { userId: string; amount: number } | null;
    }) => {
      setState((s) => ({
        ...s,
        room: payload.room,
        deadlineTs: payload.questionDeadline,
        currentBid: payload.currentBid,
      }));
    });

    // ── Voice relay ──────────────────────────────────────────────────────────

    socket.on('voice:clip', (payload: { fromUserId: string; data: unknown; mimeType: string }) => {
      setState((s) => ({ ...s, lastVoiceClip: payload }));
    });
  }, []);

  // ── Lifecycle actions ──────────────────────────────────────────────────────

  const connect = useCallback((token: string, userId: string) => {
    socketRef.current?.disconnect();
    const socket = createSocket(token);
    attachHandlers(socket);
    socketRef.current = socket;
    myUserIdRef.current = userId;
    setMyUserId(userId);
  }, [attachHandlers]);

  const disconnect = useCallback(() => {
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    socketRef.current?.disconnect();
    socketRef.current = null;
    myUserIdRef.current = null;
    setMyUserId(null);
    setState(INITIAL_STATE);
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
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
        if (res.ok && res.room) {
          setState((s) => ({ ...s, room: res.room!, error: null }));
        }
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
        if (res.ok && res.room) {
          setState((s) => ({ ...s, room: res.room!, error: null }));
        }
        resolve(res);
      });
    });
  }, []);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('room:leave');
    setState((s) => ({ ...s, room: null, matchmaking: false }));
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
          setState((s) => ({ ...s, room: res.room!, matchmaking: false }));
        }
        // If not matched, matchmaking:true stays — waiting for room:matched event
        resolve(res);
      });
    });
  }, []);

  const cancelMatchmaking = useCallback(() => {
    socketRef.current?.emit('matchmaking:cancel');
    setState((s) => ({ ...s, matchmaking: false }));
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

  const placeBid = useCallback((amount: number) => {
    socketRef.current?.emit('game:bid', { amount });
  }, []);

  const sendVoiceClip = useCallback((data: unknown, mimeType: string) => {
    socketRef.current?.emit('voice:clip', { data, mimeType });
  }, []);

  // ── UI helpers ─────────────────────────────────────────────────────────────

  const clearResult = useCallback(() => {
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    setState((s) => ({ ...s, lastResult: null }));
  }, []);

  const clearRevealedAnswer = useCallback(() => {
    setState((s) => ({ ...s, revealedAnswer: null }));
  }, []);

  const clearVoiceClip = useCallback(() => {
    setState((s) => ({ ...s, lastVoiceClip: null }));
  }, []);

  return (
    <OnlineGameContext.Provider value={{
      state,
      myUserId,
      connect,
      disconnect,
      createRoom,
      joinRoom,
      leaveRoom,
      startGame,
      joinMatchmaking,
      cancelMatchmaking,
      submitAnswer,
      buzz,
      skip,
      placeBid,
      sendVoiceClip,
      clearResult,
      clearRevealedAnswer,
      clearVoiceClip,
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
