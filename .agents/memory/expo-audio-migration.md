---
name: expo-audio migration
description: expo-av is deprecated in SDK 54 — useSounds hook uses expo-audio instead
---

## Rule
Use `expo-audio` (not `expo-av`) for all sound playback. expo-av is removed in SDK 54.

## How to apply
- Import `useAudioPlayer` and `setAudioModeAsync` from `expo-audio`
- `useAudioPlayer({ uri })` accepts a remote URL object
- `player.play()` starts playback; `player.seekTo(0)` rewinds to start (seconds, not ms)
- Call `setAudioModeAsync({ playsInSilentModeIOS: true })` once on mount for iOS silent mode

**Why:** Project is on Expo SDK ~54.0.27 where expo-av is deprecated and warns loudly at runtime.

## Version pinning pitfall
Never pin `expo-audio` (or other Expo native modules) to a version number matching the Expo SDK number (e.g. `^57.0.0` for SDK 54/57). Expo native module packages have their own independent versioning line, separate from the SDK number.

**Why:** A mismatched native module version caused a native constructor argument-count crash ("Received 4 arguments, but 3 was expected") in `AudioPlayer` — the JS API shape didn't match the installed native binary.

**How to apply:** Always check `npx expo install expo-audio` or the Expo SDK compatibility table to get the correct version range for the installed `expo` version, rather than guessing/matching the SDK major number. For SDK 54, `expo-audio` should be `~1.1.1`.

## Sourcing real sound effect files
Direct hotlink downloads of stock sound effects (Mixkit, Pixabay CDN, Archive.org, Freesound) are blocked from this sandbox (403/503 even with browser UA/referer headers). There is also no audio-generation tool available (media-generation skill covers images/video/stock images only, not audio).

**Why:** User asked for real recorded sound effects with direct source URLs; every direct download attempt failed at the network level, not because the sources didn't exist.

**How to apply:** When a project needs real audio assets, be upfront that they must be supplied by the user (uploaded file) rather than fetched or generated. As a fallback, build layered/synthesized effects with ffmpeg (harmonics, noise, reverb, vibrato, distortion) and clearly disclose to the user that these are synthesized, not real recordings.
