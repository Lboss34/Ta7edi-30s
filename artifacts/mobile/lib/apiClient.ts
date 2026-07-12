/**
 * Base URL for the API server.
 *
 * IMPORTANT: this must point to the published Replit *deployment* URL,
 * not the workspace's `*.replit.dev` dev-preview domain. The dev-preview
 * domain is a workspace-session proxy meant for the browser preview pane —
 * it is not a stable public endpoint and does not reliably accept requests
 * from external devices (like a phone running Expo Go) once the workspace
 * browser session/preview isn't active. The deployment URL below is the
 * always-on, publicly routable address for the API server.
 */
export const API_BASE = "https://ta-7-edi-30-s--balodel378.replit.app/api";

