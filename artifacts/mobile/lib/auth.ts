import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './apiClient';
import { raceWithTimeout } from './http';

const TOKEN_KEY = 'ta7edi30.authToken';

export interface AuthUser {
  id: string;
  uniqueId: string;
  username: string;
  avatar: string;
  createdAt: string;
}

export class AuthError extends Error {}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string') return data.error;
  } catch {
    // ignore — non-JSON error body, fall back below
  }
  return fallback;
}

export async function register(
  username: string,
  password: string,
  avatar: string,
): Promise<{ token: string; user: AuthUser }> {
  const res = await raceWithTimeout(
    fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password, avatar }),
    }),
    10000,
  );
  if (!res.ok) throw new AuthError(await parseErrorMessage(res, 'فشل إنشاء الحساب'));
  return res.json();
}

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const res = await raceWithTimeout(
    fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
    10000,
  );
  if (!res.ok) throw new AuthError(await parseErrorMessage(res, 'فشل تسجيل الدخول'));
  return res.json();
}

export async function fetchMe(token: string): Promise<AuthUser> {
  const res = await raceWithTimeout(
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    }),
    10000,
  );
  if (!res.ok) throw new AuthError(await parseErrorMessage(res, 'فشل تحميل الملف الشخصي'));
  const data = await res.json();
  return data.user;
}

export async function logout(token: string): Promise<void> {
  try {
    await raceWithTimeout(
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
      8000,
    );
  } catch (err) {
    // Best-effort: clearing the local token below is what actually matters.
    console.warn('[auth] logout request failed (clearing local session anyway):', err);
  }
}

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function loadToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}
