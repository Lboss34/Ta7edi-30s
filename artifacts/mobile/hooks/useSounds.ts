import { useCallback, useEffect, useRef } from 'react';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';

const SOUND_SOURCES = {
  click:   require('../assets/sounds/click.mp3'),
  correct: require('../assets/sounds/correct.mp3'),
  wrong:   require('../assets/sounds/wrong.mp3'),
  fanfare: require('../assets/sounds/fanfare.mp3'),
} as const;

const TICK_SOURCE = require('../assets/sounds/tick.mp3');

type SoundName = keyof typeof SOUND_SOURCES;

/**
 * Retries a playback attempt for a window = tries × delayMs milliseconds.
 *
 * The attempt callback must return:
 *   true  → success or deliberately abort (unmounted / muted)
 *   false → not ready yet, retry
 */
function playWithRetry(attempt: () => boolean, tries = 10, delayMs = 80) {
  if (attempt()) return;
  let remaining = tries;
  const id = setInterval(() => {
    remaining -= 1;
    if (attempt() || remaining <= 0) {
      clearInterval(id);
    }
  }, delayMs);
}

// ── Single-shot player ────────────────────────────────────────────────────────
function useSinglePlayer(name: SoundName, isMuted: boolean, tries = 10) {
  const player     = useAudioPlayer(SOUND_SOURCES[name]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _status    = useAudioPlayerStatus(player); // keeps native status in sync

  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const play = useCallback(() => {
    if (isMutedRef.current) return;
    if (!player) return;

    playWithRetry(() => {
      if (!mountedRef.current) return true; // component unmounted — abort silently

      try {
        // pause() is best-effort: it may throw if the player is in a state
        // that doesn't support it yet. We swallow that error and still
        // attempt seekTo + play, which will throw too if not ready, triggering
        // a retry.
        try { player.pause(); } catch (_) { /* not ready yet — handled below */ }

        player.seekTo(0);   // throws if native player not initialised → retry
        player.volume = 1;
        player.play();
        return true;
      } catch {
        if (!mountedRef.current) return true; // post-unmount error — abort
        return false; // not ready yet — retry
      }
    }, tries, 80);
  }, [player, tries]);

  return play;
}

// ── Looping tick player ───────────────────────────────────────────────────────
function useLoopingTickPlayer(isMuted: boolean) {
  const player     = useAudioPlayer(TICK_SOURCE);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _status    = useAudioPlayerStatus(player);

  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const playerRef = useRef(player);
  playerRef.current = player;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try { if (playerRef.current) playerRef.current.pause(); } catch (_) {}
    };
  }, []);

  useEffect(() => {
    if (!player) return;
    try { player.loop = true; } catch (_) {}
  }, [player]);

  const startTick = useCallback(() => {
    if (isMutedRef.current) return;
    if (!player) return;

    playWithRetry(() => {
      if (!mountedRef.current) return true;
      try {
        player.loop   = true;
        player.volume = 1;
        player.seekTo(0);
        player.play();
        return true;
      } catch {
        if (!mountedRef.current) return true;
        return false;
      }
    }, 10, 80);
  }, [player]);

  const stopTick = useCallback(() => {
    if (!player) return;
    try {
      player.pause();
      player.seekTo(0);
    } catch (_) {}
  }, [player]);

  return { startTick, stopTick };
}

// ── Public hook ───────────────────────────────────────────────────────────────
export function useSounds(isMuted: boolean) {
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  const playClick   = useSinglePlayer('click',   isMuted, 8);
  const playCorrect = useSinglePlayer('correct', isMuted, 8);
  const playWrong   = useSinglePlayer('wrong',   isMuted, 8);

  // Fanfare needs a wider retry window — it plays on navigation transitions
  // where the native audio session may take longer to initialise.
  const playFanfare = useSinglePlayer('fanfare', isMuted, 20);

  const { startTick, stopTick } = useLoopingTickPlayer(isMuted);

  return { playClick, playCorrect, playWrong, playFanfare, startTick, stopTick };
}
