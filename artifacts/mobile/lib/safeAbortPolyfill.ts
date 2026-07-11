/**
 * Defensive guard against a known RN 0.81 / Hermes issue: React Native lazily
 * polyfills `global.AbortController`/`AbortSignal` (via `abort-controller` +
 * `event-target-shim`) the first time either is touched. If that polyfill's
 * module ever gets evaluated a second time in the same JS context (observed
 * after certain Fast Refresh reloads), it tries to redefine non-writable
 * static properties (e.g. `Event.NONE`) on the already-frozen `Event` class
 * and throws `Cannot assign to read-only property 'NONE'` — which then
 * poisons the global `Event` class for the rest of the session, breaking
 * *any* later screen that touches fetch/XHR (they dispatch progress/load
 * events under the hood), not just whichever screen happened to trigger it.
 *
 * We proactively "warm" the polyfill once, synchronously, at app startup,
 * swallowing the error if it happens here instead of letting it surface
 * later on a random screen. This is a defensive guard, not a fix for the
 * underlying double-eval — but it ensures the failure (if it recurs) is
 * silent and harmless rather than a visible crash mid-game.
 */
export function warmAbortControllerPolyfill(): void {
  try {
    // Touching these getters is what triggers RN's lazy polyfillGlobal setup.
    void global.AbortController;
    void global.AbortSignal;
  } catch {
    // Swallow — see comment above. Worst case, a stale/partial polyfill
    // remains, which is still safer than an unhandled crash.
  }
}
