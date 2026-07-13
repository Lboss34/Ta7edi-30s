/**
 * VoiceContext — Real-time WebRTC voice chat for online rooms.
 *
 * Uses react-native-webrtc for P2P audio streams, Socket.io for signaling.
 * Gracefully degrades when native module is not available (requires `eas build`
 * with the react-native-webrtc config plugin — `eas update` alone is not enough).
 *
 * Architecture:
 *   • Peer-to-peer mesh: each pair creates one RTCPeerConnection.
 *   • The player with the lexicographically smaller userId sends the offer.
 *   • Server relays signaling messages (offer/answer/ICE) via Socket.io.
 *   • Mute state is broadcast to the room so every player can show indicators.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { Socket } from 'socket.io-client';

// ── Dynamic import — prevents crash when native module is not yet installed ────
let RTCPeerConnection: any;
let RTCSessionDescription: any;
let RTCIceCandidate: any;
let mediaDevices: any;

let WEBRTC_AVAILABLE = false;
try {
  const w = require('react-native-webrtc') as any;
  RTCPeerConnection   = w.RTCPeerConnection;
  RTCSessionDescription = w.RTCSessionDescription;
  RTCIceCandidate     = w.RTCIceCandidate;
  mediaDevices        = w.mediaDevices;
  WEBRTC_AVAILABLE    = true;
} catch {
  // Native build with react-native-webrtc plugin required
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VoiceContextValue {
  /** true only when react-native-webrtc native module is linked */
  isAvailable: boolean;
  /** true after getUserMedia succeeded */
  isActive: boolean;
  isMuted: boolean;
  /** peerId → whether that peer is muted */
  peerMuteStates: Record<string, boolean>;
  /** Request mic access and start audio capture */
  startVoice: () => Promise<boolean>;
  /** Release mic and close all peer connections */
  stopVoice: () => void;
  /** Toggle own mute; broadcasts state to room */
  toggleMute: () => void;
  /** Attach signaling listeners and create offers to all peerIds */
  connectToPeers: (socket: Socket, myUserId: string, peerIds: string[]) => void;
  /** Remove signaling listeners (call when leaving a room) */
  detachSocket: (socket: Socket) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [isMuted, setIsMuted]         = useState(false);
  const [isActive, setIsActive]       = useState(false);
  const [peerMuteStates, setPeerMuteStates] = useState<Record<string, boolean>>({});

  const localStreamRef  = useRef<any>(null);
  const pcMapRef        = useRef<Map<string, any>>(new Map());
  const myUserIdRef     = useRef('');
  const socketRef       = useRef<Socket | null>(null);

  // ── Tear down everything ─────────────────────────────────────────────────

  const stopAll = useCallback(() => {
    try {
      localStreamRef.current?.getTracks().forEach((t: any) => t.stop());
    } catch {}
    localStreamRef.current = null;

    pcMapRef.current.forEach(pc => { try { pc.close(); } catch {} });
    pcMapRef.current.clear();

    setIsActive(false);
    setIsMuted(false);
    setPeerMuteStates({});
  }, []);

  const detachSocket = useCallback((socket: Socket) => {
    socket.off('voice:offer');
    socket.off('voice:answer');
    socket.off('voice:ice-candidate');
    socket.off('voice:mute');
    socketRef.current = null;
  }, []);

  // ── Create a peer connection for one peer ────────────────────────────────

  const makePc = useCallback((peerId: string, socket: Socket): any => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcMapRef.current.set(peerId, pc);

    // Add local audio tracks
    localStreamRef.current
      ?.getTracks()
      .forEach((t: any) => pc.addTrack(t, localStreamRef.current));

    pc.onicecandidate = ({ candidate }: any) => {
      if (candidate) {
        socket.emit('voice:ice-candidate', { to: peerId, candidate: candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        pcMapRef.current.delete(peerId);
      }
    };

    return pc;
  }, []);

  // ── Public API ──────────────────────────────────────────────────────────

  const startVoice = useCallback(async (): Promise<boolean> => {
    if (!WEBRTC_AVAILABLE) return false;
    if (localStreamRef.current) return true; // already running
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setIsActive(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const connectToPeers = useCallback(
    (socket: Socket, myUserId: string, peerIds: string[]) => {
      if (!WEBRTC_AVAILABLE || !localStreamRef.current) return;
      socketRef.current = socket;
      myUserIdRef.current = myUserId;

      // Detach old listeners before re-attaching (idempotent)
      socket.off('voice:offer');
      socket.off('voice:answer');
      socket.off('voice:ice-candidate');
      socket.off('voice:mute');

      // ── Signaling listeners ──
      socket.on('voice:offer', async ({ from, offer }: any) => {
        let pc = pcMapRef.current.get(from);
        if (!pc) pc = makePc(from, socket);
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('voice:answer', { to: from, answer: pc.localDescription });
        } catch {}
      });

      socket.on('voice:answer', async ({ from, answer }: any) => {
        const pc = pcMapRef.current.get(from);
        if (pc) {
          try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); } catch {}
        }
      });

      socket.on('voice:ice-candidate', async ({ from, candidate }: any) => {
        const pc = pcMapRef.current.get(from);
        if (pc) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
        }
      });

      socket.on('voice:mute', ({ fromUserId, muted }: any) => {
        setPeerMuteStates(prev => ({ ...prev, [fromUserId]: muted }));
      });

      // ── Initiate offers (only the player with the smaller userId sends) ──
      for (const peerId of peerIds) {
        if (myUserId < peerId && !pcMapRef.current.has(peerId)) {
          const pc = makePc(peerId, socket);
          (async () => {
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              socket.emit('voice:offer', { to: peerId, offer: pc.localDescription });
            } catch {}
          })();
        }
      }
    },
    [makePc],
  );

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    setIsMuted(prev => {
      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach((t: any) => {
        t.enabled = !next;
      });
      socketRef.current?.emit('voice:mute', { muted: next });
      return next;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { stopAll(); }, [stopAll]);

  return (
    <VoiceContext.Provider
      value={{
        isAvailable: WEBRTC_AVAILABLE,
        isActive,
        isMuted,
        peerMuteStates,
        startVoice,
        stopVoice: stopAll,
        toggleMute,
        connectToPeers,
        detachSocket,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue | null {
  return useContext(VoiceContext);
}
