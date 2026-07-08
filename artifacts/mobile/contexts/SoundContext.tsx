/**
 * SoundContext — creates ALL audio players ONCE at the app root so they stay
 * warm across every navigation transition. Screens just call play-functions;
 * they never create or destroy native players themselves.
 */
import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';

const SOUND_SOURCES = {
  click:   require('../assets/sounds/click.mp3'),
  correct: require('../assets/sounds/correct.mp3'),
  wrong:   require('../assets/sounds/wrong.mp3'),
  fanfare: require('../assets/sounds/fanfare.mp3'),
} as const;

const TICK_SOURCE = require('../assets/sounds/tick.mp3');

export interface SoundContextValue {
  clickPlayer:   AudioPlayer;
  correctPlayer: AudioPlayer;
  wrongPlayer:   AudioPlayer;
  fanfarePlayer: AudioPlayer;
  tickPlayer:    AudioPlayer;
}

const SoundContext = createContext<SoundContextValue | null>(null);

export function SoundProvider({ children }: { children: ReactNode }) {
  const clickPlayer   = useAudioPlayer(SOUND_SOURCES.click);
  const correctPlayer = useAudioPlayer(SOUND_SOURCES.correct);
  const wrongPlayer   = useAudioPlayer(SOUND_SOURCES.wrong);
  const fanfarePlayer = useAudioPlayer(SOUND_SOURCES.fanfare);
  const tickPlayer    = useAudioPlayer(TICK_SOURCE);

  // Keep native status in sync with JS side (required by expo-audio SDK 54)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _cs = useAudioPlayerStatus(clickPlayer);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _rs = useAudioPlayerStatus(correctPlayer);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ws = useAudioPlayerStatus(wrongPlayer);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _fs = useAudioPlayerStatus(fanfarePlayer);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ts = useAudioPlayerStatus(tickPlayer);

  useEffect(() => {
    // Set audio mode once at app startup — all screens inherit it.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    // Pre-configure tick player for looping.
    try { tickPlayer.loop = true; } catch (_) {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SoundContext.Provider
      value={{ clickPlayer, correctPlayer, wrongPlayer, fanfarePlayer, tickPlayer }}
    >
      {children}
    </SoundContext.Provider>
  );
}

export function useSoundContext(): SoundContextValue | null {
  return useContext(SoundContext);
}
