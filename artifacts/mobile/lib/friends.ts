import { API_BASE } from './apiClient';
import { raceWithTimeout } from './http';

export interface PublicProfile {
  id: string;
  uniqueId: string;
  username: string;
  avatar: string;
}

export interface FriendProfile extends PublicProfile {
  online: boolean;
}

export interface FriendRequest {
  id: string;
  from: PublicProfile;
  createdAt: string;
}

export class FriendsError extends Error {}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string') return data.error;
  } catch {
    // ignore — non-JSON error body, fall back below
  }
  return fallback;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

export async function searchByUniqueId(token: string, uniqueId: string): Promise<PublicProfile> {
  const res = await raceWithTimeout(
    fetch(`${API_BASE}/users/search?uniqueId=${encodeURIComponent(uniqueId)}`, {
      headers: authHeaders(token),
    }),
    10000,
  );
  if (!res.ok) throw new FriendsError(await parseErrorMessage(res, 'فشل البحث'));
  const data = await res.json();
  return data.user;
}

export async function sendFriendRequest(
  token: string,
  toUniqueId: string,
): Promise<'pending' | 'accepted'> {
  const res = await raceWithTimeout(
    fetch(`${API_BASE}/friends/requests`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUniqueId }),
    }),
    10000,
  );
  if (!res.ok) throw new FriendsError(await parseErrorMessage(res, 'فشل إرسال طلب الصداقة'));
  const data = await res.json();
  return data.status;
}

export async function listIncomingRequests(token: string): Promise<FriendRequest[]> {
  const res = await raceWithTimeout(
    fetch(`${API_BASE}/friends/requests`, { headers: authHeaders(token) }),
    10000,
  );
  if (!res.ok) throw new FriendsError(await parseErrorMessage(res, 'فشل تحميل الطلبات'));
  const data = await res.json();
  return data.requests;
}

export async function respondToRequest(
  token: string,
  requestId: string,
  action: 'accept' | 'decline',
): Promise<void> {
  const res = await raceWithTimeout(
    fetch(`${API_BASE}/friends/requests/${encodeURIComponent(requestId)}/respond`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }),
    10000,
  );
  if (!res.ok) throw new FriendsError(await parseErrorMessage(res, 'فشل الرد على الطلب'));
}

export async function listFriends(token: string): Promise<FriendProfile[]> {
  const res = await raceWithTimeout(
    fetch(`${API_BASE}/friends`, { headers: authHeaders(token) }),
    10000,
  );
  if (!res.ok) throw new FriendsError(await parseErrorMessage(res, 'فشل تحميل قائمة الأصدقاء'));
  const data = await res.json();
  return data.friends;
}

export async function removeFriend(token: string, friendId: string): Promise<void> {
  const res = await raceWithTimeout(
    fetch(`${API_BASE}/friends/${encodeURIComponent(friendId)}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    }),
    10000,
  );
  if (!res.ok) throw new FriendsError(await parseErrorMessage(res, 'فشل حذف الصديق'));
}
