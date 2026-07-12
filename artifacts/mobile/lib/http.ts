export class TimeoutError extends Error {}

// NOTE: deliberately not using `AbortController`/`signal` here. On RN 0.81,
// constructing an AbortController touches the native Event/EventTarget
// polyfill, which can collide with React Native's own built-in DOM Event
// classes and throw "Cannot assign to read-only property 'NONE'" —
// poisoning the global Event class for the rest of the JS runtime. A plain
// timeout race avoids touching that machinery entirely. See
// lib/leaderboard.ts and lib/safeAbortPolyfill.ts for the original writeup.
export function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError('Request timed out')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
