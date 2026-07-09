/**
 * Base URL for the API server.
 * On Replit: uses EXPO_PUBLIC_DOMAIN (the dev proxy domain).
 * The API server is mounted at /api via the path-based router.
 */
const domain = process.env["EXPO_PUBLIC_DOMAIN"] ?? "";
export const API_BASE = domain
  ? `https://${domain}/api`
  : "https://ta-7-edi-30-s--doxola7994.replit.app/api";
