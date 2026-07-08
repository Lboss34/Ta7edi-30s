import { useCallback, useEffect, useRef } from 'react';
import type { AudioPlayer } from 'expo-audio';
import { useSoundContext } from '@/contexts/SoundContext';

/**
 * Group-mode sound hook.
 *
 * Unlike `useSounds` (which creates a brand-new native audio player every
 * time a screen mounts), this hook plays through the players created ONCE
 * by `SoundProvider` at the app root. Because group mode hops between many
 * screens per round (intro → playing → confirming → result → next question),
 * per-screen players were frequently still initializing when a sound was
 * triggered, which is why some sounds played and others silently dropped.
 * Reusing the always-warm shared players removes that race entirely.
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

export function useGroupSounds(isMuted: boolean) {
  const ctx = useSoundContext();

  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const playOnce = useCallback((player: AudioPlayer | undefined, tries: number) => {
    if (isMutedRef.current || !player) return;
    playWithRetry(() => {
      if (!mountedRef.current) return true;
      try {
        try { player.pause(); } catch (_) { /* not ready — handled below */ }
        player.seekTo(0);
        player.volume = 1;
        player.play();
        return true;
      } catch {
        if (!mountedRef.current) return true;
        return false;
      }
    }, tries, 80);
  }, []);

  const playClick   = useCallback(() => playOnce(ctx?.clickPlayer,   8),  [ctx, playOnce]);
  const playCorrect = useCallback(() => playOnce(ctx?.correctPlayer, 8),  [ctx, playOnce]);
  const playWrong   = useCallback(() => playOnce(ctx?.wrongPlayer,   8),  [ctx, playOnce]);
  const playFanfare = useCallback(() => playOnce(ctx?.fanfarePlayer, 20), [ctx, playOnce]);

  const startTick = useCallback(() => {
    if (isMutedRef.current || !ctx?.tickPlayer) return;
    const player = ctx.tickPlayer;
    playWithRetry(() => {
      if (!mountedRef.current) return true;
      try {
        player.loop = true;
        player.volume = 1;
        player.seekTo(0);
        player.play();
        return true;
      } catch {
        if (!mountedRef.current) return true;
        return false;
      }
    }, 10, 80);
  }, [ctx]);

  const stopTick = useCallback(() => {
    if (!ctx?.tickPlayer) return;
    try {
      ctx.tickPlayer.pause();
      ctx.tickPlayer.seekTo(0);
    } catch (_) { /* noop */ }
  }, [ctx]);

  return { playClick, playCorrect, playWrong, playFanfare, startTick, stopTick };
}
