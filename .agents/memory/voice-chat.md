---
name: Voice Chat Architecture
description: WebRTC P2P voice chat for online rooms; requires eas build (not just eas update) to activate
---

# Voice Chat — WebRTC P2P

## Status
- Server-side signaling: ✅ deployed (socketHandlers.ts)
- Client VoiceContext.tsx: ✅ written with graceful degradation
- UI mic button: ✅ in online-waiting.tsx + online-game.tsx
- Native module: ⚠️ requires `eas build` — react-native-webrtc v124 is installed but native code not linked yet
- app.json: permissions set (NSMicrophoneUsageDescription + RECORD_AUDIO) but NO plugin entry (v124 lacks app.plugin.js)

## How it works
- `VoiceProvider` wraps the app inside OnlineGameProvider in _layout.tsx
- VoiceContext.tsx: dynamic `require('react-native-webrtc')` inside try/catch — no crash if native module missing
- `startVoice()`: calls `mediaDevices.getUserMedia({ audio: true, video: false })`
- `connectToPeers(socket, myUserId, peerIds)`: attaches Socket.io signaling listeners + creates WebRTC offers
- Offer/answer rule: player with lexicographically smaller userId sends the offer (prevents double-offer)
- `toggleMute()`: toggles `track.enabled` + emits `voice:mute` to server (broadcasts to room)

## Server signaling events (socketHandlers.ts)
- `voice:offer` → relay `{ from, offer }` to target player's socketId
- `voice:answer` → relay `{ from, answer }` to target player's socketId
- `voice:ice-candidate` → relay `{ from, candidate }` to target player's socketId
- `voice:mute` → broadcast `{ fromUserId, muted }` to whole room

## ICE servers
STUN: stun.l.google.com:19302, stun1, stun2

## Lifecycle (waiting room → game)
1. Player enters waiting room → `startVoice()` called → mic permission prompt
2. Each time players list changes → `connectToPeers()` called again (idempotent, skips existing connections)
3. Navigation to game → voice stays active (NOT stopped on route change)
4. Leave/disconnect → `stopVoice()` called → tracks stopped, PCs closed

## To deploy voice chat fully
Run: `eas build --profile production --platform all`
Then: `eas update` to push JS changes along with new native binary

**Why native build needed:** react-native-webrtc is a native module (JSI/NativeModule); it cannot be pushed via OTA update alone.
