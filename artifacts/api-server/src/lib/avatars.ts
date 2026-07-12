/**
 * Preset avatar set for player profiles. Keep this list in sync with
 * `artifacts/mobile/constants/avatars.ts` — both sides validate/display the
 * same fixed set so we don't need image uploads or object storage for Phase 1.
 */
export const ALLOWED_AVATARS = [
  "😀", "😎", "🤩", "🥳", "😺", "🦁", "🐯", "🐼",
  "🐸", "🦄", "👑", "⚡", "🔥", "🎯", "🎮", "🏆",
] as const;

export type AllowedAvatar = (typeof ALLOWED_AVATARS)[number];

export function isAllowedAvatar(value: unknown): value is AllowedAvatar {
  return typeof value === "string" && (ALLOWED_AVATARS as readonly string[]).includes(value);
}
