# HistSieve — Design Spec

**Date**: 2026-05-18
**Status**: Approved (user authorized direct implementation)

## Goal

A single Chrome extension (MV3) that merges two existing extensions:

1. **Real-time keyword deletion** — when a visited page's URL or title matches any user-defined keyword, immediately remove the entry from browser history.
2. **Scheduled / startup history cleanup** — on a chosen interval and/or on browser startup, automatically wipe browser history. The user picks the scope: all history, or only entries older than N days.

Design principles: **simple, easy to onboard, core features complete**.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Match mode | Contains substring, case-insensitive, against URL **or** page title |
| Cleanup triggers | Interval (every N hours) + on browser startup |
| Cleanup scope | User-selectable: "all history" or "older than N days" |
| Keyword deletion timing | Real-time via `chrome.history.onVisited` |
| Data types cleaned | Browsing history only (no cookies / cache / downloads) |
| UI surface | Toolbar popup + options page |
| i18n | `en` + `zh_CN`, follow browser locale |
| Manifest | V3 |

## Permissions

```json
"permissions": ["history", "alarms", "storage"]
```

No host permissions. No `browsingData`. Minimum-permission posture.

## Architecture

```
src/
  background/
    index.ts              # Service-worker entry: wire events to handlers
    keyword-watcher.ts    # chrome.history.onVisited → match → delete
    scheduler.ts          # chrome.alarms registration + onStartup hook
    cleaner.ts            # Execute scheduled cleanup
  core/                   # Pure functions, no chrome.* imports
    matcher.ts            # matchesAnyKeyword(url, title, keywords): boolean
    settings.ts           # Settings schema, defaults, validation
    types.ts              # Shared types (Settings, Keyword, etc.)
    time.ts               # Pure date math (ageThresholdMs)
  platform/
    chrome.ts             # Thin promise-ified wrappers around chrome.* APIs
                          # (one seam → easy to mock in tests)
  ui/
    popup/
      index.html, popup.ts, popup.css
    options/
      index.html, options.ts, options.css
    shared/
      i18n.ts             # t(key) helper
  _locales/
    en/messages.json
    zh_CN/messages.json
manifest.json
tests/                    # *.test.ts alongside or under tests/
```

### Module responsibility

- **core/** — Zero chrome dependency. Pure functions, fully unit-tested.
- **platform/chrome.ts** — Promise wrappers, makes background and UI mockable.
- **background/** — Event registration + glue. Thin orchestration: receive event → call core → call platform.
- **ui/** — Static HTML, vanilla TS, no React (YAGNI).

## Data model

`Settings` lives in `chrome.storage.sync`:

```ts
type Settings = {
  enabled: boolean;                     // master switch
  keywords: Keyword[];                  // ordered list
  cleanup: {
    intervalEnabled: boolean;
    intervalHours: number;              // e.g. 24
    onStartup: boolean;                 // run at browser startup
    scope: "all" | "olderThan";
    olderThanDays: number;              // when scope === "olderThan"
  };
  lastCleanAt: number | null;           // epoch ms
};

type Keyword = {
  id: string;        // uuid
  value: string;     // raw user string, used as case-insensitive substring
  enabled: boolean;
};
```

Defaults: enabled=true, keywords=[], intervalEnabled=true, intervalHours=24, onStartup=true, scope="olderThan", olderThanDays=30, lastCleanAt=null.

## Behavior

### Keyword deletion flow

1. Service worker registers `chrome.history.onVisited`.
2. On visit, if `settings.enabled` and any enabled keyword matches `url` or `title` (case-insensitive contains), call `chrome.history.deleteUrl({ url })`.
3. Edge case: titles arrive empty initially, then updated. Listen also to `chrome.history.onTitleChanged` if available, re-check on title update. (Chrome does not expose `onTitleChanged` — we rely on the fact that `onVisited` fires again on subsequent visits with title populated, and we additionally accept that some title-only matches may miss the first visit; for those, the scheduled cleanup will catch up via a `history.search` scan.)
4. Scheduled cleanup also runs a keyword sweep over recent history to backfill any missed title-only matches.

### Scheduled cleanup flow

- On install / settings change: `chrome.alarms.create("histsieve-cleanup", { periodInMinutes: intervalHours * 60 })`.
- On alarm and on `chrome.runtime.onStartup` (when `onStartup` enabled): run `cleaner.run(settings)`.
- `cleaner.run`:
  - If `scope === "all"`: `chrome.history.deleteAll()`.
  - If `scope === "olderThan"`: `chrome.history.deleteRange({ startTime: 0, endTime: now - olderThanDays*86400_000 })`.
  - Always: run keyword sweep across remaining recent history.
  - Update `settings.lastCleanAt`.

### UI

- **Popup**: status (enabled / disabled), last clean timestamp, "Clean now" button, "Open settings" link.
- **Options**:
  - Master enable toggle
  - Keyword list: add / edit / delete / per-row enable toggle
  - Scheduled cleanup section: interval toggle + hours input, startup-clean toggle, scope radio, days input.

## Testing strategy

- **Unit** (core/, time, settings validation, matcher): Vitest, no DOM, no chrome. Target 90%+.
- **Integration** (background handlers, cleaner): Vitest with hand-rolled `chrome` mock injected via the `platform/chrome.ts` seam. Verify correct API calls with correct arguments.
- **UI logic**: Vitest + jsdom for any non-trivial popup/options logic (debounced save, list ops). Pure render code untested.
- **Manual smoke**: load unpacked extension in Chrome, exercise both flows.
- **Coverage target**: ≥80% per project rule.

## Out of scope (YAGNI)

- Regex / wildcard keywords (decided against)
- Cookies / cache / downloads cleanup (decided against)
- Per-domain rules / allowlist
- Sync conflict UI (storage.sync is best-effort; we trust last-write-wins)
- Cross-browser (Firefox/Edge) — Manifest V3 should mostly work on Edge, untested

## Risks

- Service worker MV3 lifecycle: workers sleep; alarms handle long delays; for keyword watch we re-register on each wakeup via top-level listener.
- `chrome.history.onTitleChanged` does not exist — mitigated by sweep during cleanup.
- `storage.sync` quotas (~100 KB total). Keywords are short strings; thousands fit. We will not preemptively over-engineer chunking.
