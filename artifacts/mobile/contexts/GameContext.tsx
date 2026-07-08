import React, { createContext, useContext, useState, ReactNode } from 'react';
import { API_BASE } from '@/lib/apiClient';
import type {
  Difficulty,
  PingPongQuestion,
  AuctionTopic,
  BuzzerQuestion,
  RapidQuestion,
  TransferPuzzle,
} from '@/types/game';

export type { Difficulty, PingPongQuestion, AuctionTopic, BuzzerQuestion, RapidQuestion, TransferPuzzle };

export interface GameState {
  players: [string, string];
  scores: [number, number];
  currentRound: number;
  difficulty: Difficulty;
  isMuted: boolean;
  isLoading: boolean;
  loadError: string | null;
  // Round 1
  pingPongQuestions: PingPongQuestion[];
  // Round 2
  auctionTopics: [AuctionTopic, AuctionTopic, AuctionTopic];
  // Round 3
  buzzerQuestions: BuzzerQuestion[];
  // Round 4
  round4Questions: RapidQuestion[];
  // Round 5
  transferPuzzles: TransferPuzzle[];
  // Tiebreaker — selected puzzle + full pool for skip
  tiebreakerPuzzle: TransferPuzzle;
  tiebreakerPool: TransferPuzzle[];
  isStarted: boolean;
}

interface GameContextType {
  state: GameState;
  startGame: (player1: string, player2: string, difficulty: Difficulty) => void;
  addScore: (playerIndex: 0 | 1, points: number) => void;
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

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pick<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
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

const defaultState: GameState = {
  players: ['اللاعب ١', 'اللاعب ٢'],
  scores: [0, 0],
  currentRound: 1,
  difficulty: 'medium',
  isMuted: false,
  isLoading: false,
  loadError: null,
  pingPongQuestions: [],
  auctionTopics: [PLACEHOLDER_AUCTION, PLACEHOLDER_AUCTION, PLACEHOLDER_AUCTION],
  buzzerQuestions: [],
  round4Questions: [],
  transferPuzzles: [],
  tiebreakerPuzzle: PLACEHOLDER_PUZZLE,
  tiebreakerPool: [],
  isStarted: false,
};

const GameContext = createContext<GameContextType | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(defaultState);

  const startGame = (player1: string, player2: string, difficulty: Difficulty) => {
    // Show loading immediately
    setState(prev => ({ ...prev, isLoading: true, loadError: null }));

    const fetchAndStart = async () => {
      try {
        const url = `${API_BASE}/questions/game?difficulty=${difficulty}`;
        const res = await fetch(url);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json() as {
          round1: PingPongQuestion[];
          round2: AuctionTopic[];
          round3: BuzzerQuestion[];
          round4: RapidQuestion[];
          round5: TransferPuzzle[];
          tiebreaker: TransferPuzzle[];
        };

        // Validate we got enough data (12 per difficulty is the max available)
        const hasEnough =
          data.round1?.length >= 3 &&
          data.round2?.length >= 3 &&
          data.round3?.length >= 8 &&
          data.round4?.length >= 10 &&
          data.round5?.length >= 5 &&
          data.tiebreaker?.length >= 1;

        if (!hasEnough) throw new Error('بيانات غير كافية من قاعدة البيانات');

        const pickedAuctions = pick(data.round2, 3) as [AuctionTopic, AuctionTopic, AuctionTopic];
        const pickedTransfers = pick(data.round5, 5);
        const round5Puzzles = pickedTransfers.slice(0, 4);
        const usedIds = round5Puzzles.map(p => p.id);
        const tb = pickTiebreaker(data.tiebreaker, usedIds);

        // Give each player their own independently shuffled pool of 10 questions
        // so P2 always has a full set regardless of how many P1 answered.
        const p1Round4 = shuffle([...data.round4]).slice(0, 10);
        const p2Round4 = shuffle([...data.round4]).slice(0, 10);

        setState({
          players: [player1 || 'اللاعب ١', player2 || 'اللاعب ٢'],
          scores: [0, 0],
          currentRound: 1,
          difficulty,
          isMuted: state.isMuted,
          isLoading: false,
          loadError: null,
          pingPongQuestions: pick(data.round1, 3),
          auctionTopics: pickedAuctions,
          buzzerQuestions: shuffle(data.round3).slice(0, 10),
          round4Questions: [...p1Round4, ...p2Round4],
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

  const addScore = (playerIndex: 0 | 1, points: number) => {
    setState(prev => {
      const newScores: [number, number] = [prev.scores[0], prev.scores[1]];
      newScores[playerIndex] = Math.max(0, newScores[playerIndex] + points);
      return { ...prev, scores: newScores };
    });
  };

  const nextRound = () => {
    setState(prev => ({ ...prev, currentRound: prev.currentRound + 1 }));
  };

  const resetGame = () => {
    setState({ ...defaultState, isMuted: state.isMuted });
  };

  const toggleMute = () => {
    setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  };

  return (
    <GameContext.Provider value={{ state, startGame, addScore, nextRound, resetGame, toggleMute }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame(): GameContextType {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
