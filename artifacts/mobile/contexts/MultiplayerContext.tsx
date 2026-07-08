import React, { createContext, useContext, useState, ReactNode } from 'react';
import { API_BASE } from '@/lib/apiClient';
import type {
  Difficulty,
  PingPongQuestion,
  AuctionTopic,
  BuzzerQuestion,
  TransferPuzzle,
} from '@/types/game';

export type { Difficulty, PingPongQuestion, AuctionTopic, BuzzerQuestion, TransferPuzzle };

export const PLAYER_COLORS = ['#7B2FFF', '#00E5FF', '#FFD700', '#FF6B00', '#00C853'];
export const PLAYER_DEFAULTS = ['اللاعب ١', 'اللاعب ٢', 'اللاعب ٣', 'اللاعب ٤', 'اللاعب ٥'];

export interface MultiplayerState {
  players: string[];
  scores: number[];
  currentRound: number;   // 1 → 2 → 3 → 5 → 6 (done). Round 4 is skipped.
  difficulty: Difficulty;
  isMuted: boolean;
  isLoading: boolean;
  loadError: string | null;
  pingPongQuestions: PingPongQuestion[];
  auctionTopics: AuctionTopic[];
  buzzerQuestions: BuzzerQuestion[];
  transferPuzzles: TransferPuzzle[];
  tiebreakerPuzzle: TransferPuzzle;
  tiebreakerPool: TransferPuzzle[];
  isStarted: boolean;
}

interface MultiplayerContextType {
  state: MultiplayerState;
  startMultiplayerGame: (players: string[], difficulty: Difficulty) => void;
  addScore: (playerIndex: number, points: number) => void;
  nextRound: () => void;
  resetGame: () => void;
  toggleMute: () => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickTiebreaker(pool: TransferPuzzle[], usedIds: string[]): TransferPuzzle {
  const medHard = pool.filter(p => p.difficulty === 'medium' || p.difficulty === 'hard');
  const candidates = medHard.length > 0 ? medHard : pool;
  const unused = candidates.filter(p => !usedIds.includes(p.id));
  return pickRandom(unused.length > 0 ? unused : candidates);
}

const PLACEHOLDER_PUZZLE: TransferPuzzle = {
  id: '__placeholder__',
  difficulty: 'medium',
  transfers: [],
  answer: '',
};

const PLACEHOLDER_AUCTION: AuctionTopic = {
  id: '__placeholder__',
  difficulty: 'medium',
  category: '',
  description: '',
  possibleAnswers: [],
};

function makeDefaultState(n = 2): MultiplayerState {
  return {
    players: PLAYER_DEFAULTS.slice(0, n),
    scores: Array(n).fill(0) as number[],
    currentRound: 1,
    difficulty: 'medium',
    isMuted: false,
    isLoading: false,
    loadError: null,
    pingPongQuestions: [],
    auctionTopics: [PLACEHOLDER_AUCTION, PLACEHOLDER_AUCTION, PLACEHOLDER_AUCTION],
    buzzerQuestions: [],
    transferPuzzles: [],
    tiebreakerPuzzle: PLACEHOLDER_PUZZLE,
    tiebreakerPool: [],
    isStarted: false,
  };
}

const MultiplayerContext = createContext<MultiplayerContextType | null>(null);

export function MultiplayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MultiplayerState>(makeDefaultState(2));

  const startMultiplayerGame = (players: string[], difficulty: Difficulty) => {
    setState(prev => ({ ...prev, isLoading: true, loadError: null }));

    const fetchAndStart = async () => {
      try {
        const res = await fetch(`${API_BASE}/questions/game?difficulty=${difficulty}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json() as {
          round1: PingPongQuestion[];
          round2: AuctionTopic[];
          round3: BuzzerQuestion[];
          round4: unknown[];
          round5: TransferPuzzle[];
          tiebreaker: TransferPuzzle[];
        };

        const hasEnough =
          data.round1?.length >= 3 &&
          data.round2?.length >= 3 &&
          data.round3?.length >= 8 &&
          data.round5?.length >= 5 &&
          data.tiebreaker?.length >= 1;

        if (!hasEnough) throw new Error('بيانات غير كافية من قاعدة البيانات');

        const pickedAuctions = pick(data.round2, 3);
        const round5Puzzles = pick(data.round5, 4);
        const usedIds = round5Puzzles.map(p => p.id);
        const tb = pickTiebreaker(data.tiebreaker, usedIds);

        const n = players.length;
        setState({
          players: players.map((p, i) => p.trim() || PLAYER_DEFAULTS[i]),
          scores: Array(n).fill(0) as number[],
          currentRound: 1,
          difficulty,
          isMuted: state.isMuted,
          isLoading: false,
          loadError: null,
          pingPongQuestions: pick(data.round1, 3),
          auctionTopics: pickedAuctions,
          buzzerQuestions: shuffle(data.round3).slice(0, 10),
          transferPuzzles: round5Puzzles,
          tiebreakerPuzzle: tb,
          tiebreakerPool: data.tiebreaker,
          isStarted: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'تعذّر الاتصال بقاعدة البيانات';
        setState(prev => ({ ...prev, isLoading: false, loadError: msg }));
      }
    };

    fetchAndStart();
  };

  const addScore = (playerIndex: number, points: number) => {
    setState(prev => {
      const newScores = [...prev.scores];
      newScores[playerIndex] = Math.max(0, (newScores[playerIndex] ?? 0) + points);
      return { ...prev, scores: newScores };
    });
  };

  // Round 4 is skipped in multiplayer: 3 → 5
  const nextRound = () => {
    setState(prev => {
      const next = prev.currentRound === 3 ? 5 : prev.currentRound + 1;
      return { ...prev, currentRound: next };
    });
  };

  const resetGame = () => {
    setState({ ...makeDefaultState(state.players.length), isMuted: state.isMuted });
  };

  const toggleMute = () => {
    setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  };

  return (
    <MultiplayerContext.Provider value={{ state, startMultiplayerGame, addScore, nextRound, resetGame, toggleMute }}>
      {children}
    </MultiplayerContext.Provider>
  );
}

export function useMultiplayer(): MultiplayerContextType {
  const ctx = useContext(MultiplayerContext);
  if (!ctx) throw new Error('useMultiplayer must be used within MultiplayerProvider');
  return ctx;
}
