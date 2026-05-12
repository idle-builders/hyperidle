# Electron Auth Model — Decision Document (N2)

**Status:** Decided  
**Workpackage:** N2 (Desktop Auth Model — X-API-Key Injection)  
**Depends on:** N1 (Node runtime migration)  
**Implemented by:** N3+ (Electron main process, preload script, packaging)

---

## Overview

HyperIdle requires every `/api/*` request to carry an `X-API-Key` header. In
the Electron desktop app the React SPA runs in a renderer process and must
inject this key on every API call. This document specifies how the key is
generated, stored, and injected in each runtime context.

---

## Key Generation

On the **first Electron launch**, the main process generates a cryptographically
secure 256-bit key:

```typescript
import { randomBytes } from "node:crypto";
const key = randomBytes(32).toString("hex"); // 64 hex chars
```

The key is persisted immediately after generation. Subsequent launches read the
persisted key — no re-generation.

---

## Key Storage

**File:** `<userData>/secrets.json`

`userData` resolves to the platform-appropriate application data directory:
- macOS: `~/Library/Application Support/HyperIdle/secrets.json`
- Linux: `~/.config/HyperIdle/secrets.json`
- Windows: `%APPDATA%\HyperIdle\secrets.json`

**Format:**
```json
{ "HYPERIDLE_API_KEY": "<64-hex-char-key>" }
```

**File mode:** `0600` (owner read/write only). Set immediately after creation:

```typescript
import { writeFileSync, chmodSync } from "node:fs";
writeFileSync(secretsPath, JSON.stringify(secrets), "utf8");
chmodSync(secretsPath, 0o600);
```

The key never leaves the local machine. It is not synced, not backed up, and
not transmitted to any remote service.

---

## Server Injection

The Electron main process sets `process.env.HYPERIDLE_API_KEY` **before**
importing or starting the Hono server:

```typescript
process.env.HYPERIDLE_API_KEY = key;
// then: import/start the server
```

The server's existing startup gate (`packages/server/src/index.ts:10`) validates
that `HYPERIDLE_API_KEY` is present and non-empty. If missing, the server
exits with a clear error message.

---

## SPA Injection (Preload Script)

The Electron preload script exposes the key to the renderer via Electron's
`contextBridge`:

```typescript
// preload.ts (N3 deliverable)
import { contextBridge } from "electron";
contextBridge.exposeInMainWorld("__HYPERIDLE_API_KEY__", key);
```

This sets `window.__HYPERIDLE_API_KEY__` in the renderer's global scope.

The `apiFetch` wrapper (N2 deliverable, `packages/web/src/services/api-fetch.ts`)
reads `window.__HYPERIDLE_API_KEY__` as its first-priority key source.

### Preload Isolation Guarantee

The preload script:
- Does NOT use `ipcRenderer` for the key (no round-trip, no async latency)
- Does NOT expose `require` or any Node.js globals to the renderer
- Does NOT expose the full `process.env` to the renderer
- Exposes exactly ONE value: the key string via `contextBridge`

This isolation is enforced by Electron's `contextIsolation: true` setting
(default in all modern Electron versions). Renderer code cannot access Node.js
APIs unless explicitly bridged.

---

## Dev Mode Injection

In development (`bun dev`), no Electron process is running. The SPA runs in a
Vite dev server. The `apiFetch` wrapper falls back to:

```
import.meta.env.VITE_HYPERIDLE_API_KEY
```

This variable is set in a root `.env` file (gitignored):

```
# Root .env — both must hold the same value
HYPERIDLE_API_KEY=dev-key-local
VITE_HYPERIDLE_API_KEY=dev-key-local
```

The `VITE_` prefix is required by Vite to expose the variable to client-side
code. The server reads `HYPERIDLE_API_KEY` (no prefix) from the same `.env` via
Bun's automatic env loading.

**IMPORTANT:** If these two values do not match, every API call returns 401 with
no diagnostic hint. See also the `@lore` comment in `api-fetch.ts`.

---

## Key Resolution Priority (in `apiFetch`)

1. `window.__HYPERIDLE_API_KEY__` — set by Electron preload (N3)
2. `import.meta.env.VITE_HYPERIDLE_API_KEY` — set by `.env` file (dev)

If neither is available, `apiFetch` falls through to bare `fetch()`. The server
returns 401. This is intentional — silent fallthrough lets the app start without
a key; the 401 response is the diagnostic signal.

---

## Two-Key Distinction

| Key | Variable | Set by | Scope | Purpose |
|---|---|---|---|---|
| HyperIdle API key | `HYPERIDLE_API_KEY` | Operator / Electron main process | Server-side | Authenticates all `/api/*` requests; auto-generated; user-invisible |
| Anthropic API key | `ANTHROPIC_API_KEY` | User (via Settings UI, N5) | Server-side (agent runtime) | Authorises Claude API calls; user-owned credential |

These two keys are **completely separate**. The HyperIdle API key is a local
security boundary (prevents other apps on the machine from calling the local
server). The Anthropic API key is a user credential for a third-party service.
N5 manages the Anthropic key lifecycle; N2/N3/N4 manage the HyperIdle key.

---

## Same-Origin Production (HYPERIDLE_STATIC_DIR)

When the Hono server is configured to serve the SPA from a static directory
(`HYPERIDLE_STATIC_DIR`), the browser loads the SPA from the same origin as the
API server. Same-origin requests do not require CORS headers and do not send an
`Origin` header.

In this context, `apiFetch` still injects `X-API-Key` from the appropriate
source. The CORS middleware sees no `Origin` header and adds no CORS headers —
which is correct.

---

## Sequence: N2 → N3 → N4

- **N2** (this workpackage): `apiFetch` wrapper reads from `window.__HYPERIDLE_API_KEY__`
  when present. The window property is `undefined` in dev and in N3-not-yet-wired builds.
- **N3**: Electron main process + preload script. Sets `window.__HYPERIDLE_API_KEY__`
  via `contextBridge`. Generates and persists the key to `userData/secrets.json`.
- **N4**: Electron shell packaging, auto-update, code signing.
