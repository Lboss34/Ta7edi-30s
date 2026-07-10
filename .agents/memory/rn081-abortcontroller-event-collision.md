---
name: RN 0.81 AbortController breaks unrelated screens
description: Why using `new AbortController()` for a fetch timeout caused an unrelated crash ("Cannot assign to read-only property 'NONE'") elsewhere in the app.
---

Constructing `new AbortController()` on React Native 0.81 (Expo SDK 54) touches the native
Event/EventTarget polyfill machinery (`abort-controller` + `event-target-shim`, still a
transitive dep of react-native itself). This can collide with RN's own built-in DOM Event
classes and throw `TypeError: Cannot assign to read-only property 'NONE'` — and because the
global `Event` class gets poisoned, the crash can surface on a completely unrelated screen
(e.g. a different fetch call elsewhere in the app), not at the AbortController call site.

**Why:** RN 0.81 ships native DOM Event/EventTarget classes with read-only static props
(NONE, CAPTURING_PHASE, etc). Any code path that still exercises the legacy
`abort-controller`/`event-target-shim` polyfill (via `new AbortController()`) can trip a
double-initialization of those statics.

**How to apply:** avoid `AbortController`/`AbortSignal` for simple fetch timeouts on RN 0.81.
Use a `Promise.race`-style timeout instead (reject after N ms, still attach handlers to the
original promise so late failures aren't unhandled rejections). Only reach for AbortController
if true request cancellation is required, and test carefully across screens if you do.
