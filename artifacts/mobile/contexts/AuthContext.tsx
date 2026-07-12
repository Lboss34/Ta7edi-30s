import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import * as authLib from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';
import { createSocket } from '@/lib/socket';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  /** Live-updated via socket presence events; only meaningful for the user's friends. */
  onlineFriendIds: Set<string>;
  register: (username: string, password: string, avatar: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [onlineFriendIds, setOnlineFriendIds] = useState<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);

  const connectSocket = useCallback((authToken: string) => {
    socketRef.current?.disconnect();
    const socket = createSocket(authToken);

    socket.on('friend:online', ({ userId }: { userId: string }) => {
      setOnlineFriendIds((prev) => new Set(prev).add(userId));
    });
    socket.on('friend:offline', ({ userId }: { userId: string }) => {
      setOnlineFriendIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    });
    socket.on('connect_error', (err) => {
      console.warn('[auth] socket connect_error:', err.message);
    });

    socketRef.current = socket;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const savedToken = await authLib.loadToken();
        if (savedToken) {
          const me = await authLib.fetchMe(savedToken);
          if (cancelled) return;
          setToken(savedToken);
          setUser(me);
          connectSocket(savedToken);
        }
      } catch (err) {
        console.warn('[auth] session restore failed, clearing token:', err);
        await authLib.clearToken();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
    };
  }, [connectSocket]);

  const handleRegister = useCallback(
    async (username: string, password: string, avatar: string) => {
      const { token: newToken, user: newUser } = await authLib.register(username, password, avatar);
      await authLib.saveToken(newToken);
      setToken(newToken);
      setUser(newUser);
      connectSocket(newToken);
    },
    [connectSocket],
  );

  const handleLogin = useCallback(
    async (username: string, password: string) => {
      const { token: newToken, user: newUser } = await authLib.login(username, password);
      await authLib.saveToken(newToken);
      setToken(newToken);
      setUser(newUser);
      connectSocket(newToken);
    },
    [connectSocket],
  );

  const handleLogout = useCallback(async () => {
    if (token) await authLib.logout(token);
    socketRef.current?.disconnect();
    socketRef.current = null;
    await authLib.clearToken();
    setToken(null);
    setUser(null);
    setOnlineFriendIds(new Set());
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        onlineFriendIds,
        register: handleRegister,
        login: handleLogin,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
