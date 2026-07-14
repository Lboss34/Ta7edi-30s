import { API_BASE } from './apiClient';
import { raceWithTimeout } from './http';

export interface GameStats {
  level: number;
  xp: number;
  totalWins: number;
  nextLevelXp: number;
}

export class GameStatsError extends Error {}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string') return data.error;
  } catch {
    // ignore — non-JSON error body, fall back below
  }
  return fallback;
}

export async function fetchGameStats(token: string): Promise<GameStats> {
  const res = await raceWithTimeout(
    fetch(`${API_BASE}/game/stats`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    }),
    10000,
  );
  if (!res.ok) throw new GameStatsError(await parseErrorMessage(res, 'فشل تحميل الإحصائيات'));
  return res.json();
}
