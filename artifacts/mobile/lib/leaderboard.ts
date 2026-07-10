import { API_BASE } from './apiClient';

export interface LeaderboardEntry {
  playerName: string;
  bestScore:  number;
  gamesWon:   number;
  lastPlayed: number;
}

export class LeaderboardFetchError extends Error {}

class TimeoutError extends Error {}

// NOTE: deliberately not using `AbortController`/`signal` here. On RN 0.81,
// constructing an AbortController touches the native Event/EventTarget
// polyfill (`abort-controller` + `event-target-shim`), which can collide
// with React Native's own built-in DOM Event classes and throw
// "Cannot assign to read-only property 'NONE'" — poisoning the global Event
// class for the rest of the JS runtime (breaking unrelated screens like
// Round 1's question loading). A plain timeout race avoids touching that
// machinery entirely; it just means the underlying fetch keeps running in
// the background after we give up on it, which is fine for a read-only GET.
function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError('Request timed out')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Fetches the full leaderboard from MongoDB via the API server.
 * Retries a couple of times (deployments can take a moment to wake from
 * sleep), then throws LeaderboardFetchError so the UI can tell a real
 * network/server failure apart from a genuinely empty leaderboard.
 */
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const attempts = 3;
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await raceWithTimeout(
        fetch(`${API_BASE}/leaderboard`, { headers: { Accept: 'application/json' } }),
        8000,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Unexpected response shape');
      return data as LeaderboardEntry[];
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
      }
    }
  }

  console.warn('[leaderboard] getLeaderboard failed after retries:', lastErr);
  throw new LeaderboardFetchError(
    lastErr instanceof Error ? lastErr.message : 'Unknown error',
  );
}

/**
 * Sends a win to the API. MongoDB upserts the document:
 * - If the player is new  → creates an entry.
 * - If the player exists  → updates bestScore only when the new score is higher;
 *                            always increments gamesWon.
 *
 * Returns { entry, isNewRecord } from the server, or null on failure.
 */
export async function addLeaderboardEntry(
  playerName: string,
  score: number,
): Promise<{ entry: LeaderboardEntry; isNewRecord: boolean } | null> {
  try {
    const res = await fetch(`${API_BASE}/leaderboard`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify({ playerName: playerName.trim().slice(0, 20), score }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[leaderboard] addLeaderboardEntry failed:', err);
    return null;
  }
}
