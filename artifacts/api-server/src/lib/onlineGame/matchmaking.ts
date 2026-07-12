import type { Difficulty } from "./types";

interface QueueEntry {
  userId: string;
  username: string;
  avatar: string;
  socketId: string;
  difficulty: Difficulty;
  queuedAt: number;
}

const queue: QueueEntry[] = [];

export function enqueue(entry: QueueEntry): QueueEntry | null {
  // Try to find a waiting opponent at the same difficulty first.
  const idx = queue.findIndex((q) => q.difficulty === entry.difficulty && q.userId !== entry.userId);
  if (idx !== -1) {
    const [opponent] = queue.splice(idx, 1);
    return opponent ?? null;
  }
  queue.push(entry);
  return null;
}

export function dequeue(userId: string): void {
  const idx = queue.findIndex((q) => q.userId === userId);
  if (idx !== -1) queue.splice(idx, 1);
}

export function isQueued(userId: string): boolean {
  return queue.some((q) => q.userId === userId);
}
