import { io, Socket } from 'socket.io-client';
import { API_BASE } from './apiClient';

// API_BASE already ends in "/api" — strip it back off to get the bare origin
// that socket.io-client connects to (it appends its own `path` below).
const SOCKET_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

/**
 * Creates an authenticated Socket.io client for the current session. Mounted
 * at /api/socket.io (not the default /socket.io) so it still resolves
 * through the artifact's path-based proxy — see
 * artifacts/api-server/src/lib/socket.ts for the server-side counterpart.
 */
export function createSocket(token: string): Socket {
  return io(SOCKET_ORIGIN, {
    path: '/api/socket.io',
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
  });
}
