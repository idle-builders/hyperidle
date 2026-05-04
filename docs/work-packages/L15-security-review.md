# L15 Security Review

Scope: untracked L15 client surfaces + reused `/api/threads` route. Read-only.

## Severity counts
Critical 0 | High 1 | Medium 3 | Low 2 | Info 1

## Findings

### HIGH — Inherited IDOR on host scope (ASK FIRST)
File: `packages/server/src/routes/threads.ts:148-153` (existing, surfaced by L15).
`ensureTaskThread` lists/creates threads keyed on `(host_kind=task, host_id=taskId)`. The route's own comment notes participant scope is NOT verified against authenticated identity (tracked as `auth-middleware-participant-scope`). L15 makes this exploitable from the UI: any user can craft `/work/team/task/<arbitrary-id>/thread` and read or seed another tenant's task thread. Fix: gate `host_id` against the caller's product/team in the auth middleware before L18 ships chat UI.

### MEDIUM — Race on lazy thread creation (S/T) 
File: `packages/web/src/shell/ensureTaskThread.ts:42-72`.
Two concurrent tabs/menu clicks both pass the GET-empty check and POST. Server-side de-dup on `(hostKind,hostId)` is not visible in the route excerpt; if absent, duplicate threads collide downstream. Fix: enforce a unique index or upsert on `(hostKind,hostId)` server-side; client cannot solve this.

### MEDIUM — clientKey accepts attacker-controlled `taskId` (T)
File: `packages/web/src/shell/taskStateRequest.ts:45-49`.
`makeStateRequestClientKey` interpolates `taskId` directly. Comment promises regex `^[A-Za-z0-9_\-:.]{8,128}$` but the function never validates. A taskId containing `:` or `/` produces a key that may parse-collide with other actions or violate the server regex causing 400s. Fix: validate `taskId` shape at the caller, or hash/encode before interpolation.

### MEDIUM — Open-redirect-shaped param in placeholder route (I/E)
File: `packages/web/src/pages/WorkTeamTaskThread.tsx:25-56` and `router.tsx:36`.
`taskId` from `useParams` flows unvalidated into `ensureTaskThread`, then renders `Task {taskId} thread` (React-escaped, so no XSS). Risk is reflected user-controlled identifier driving server lookups (see HIGH). Fix: reject non-`[a-z0-9_-]{1,64}` taskIds client-side and 404 the route.

### LOW — Error-reason leakage to UI (I)
File: `WorkTeamTaskThread.tsx:42-44`, `ensureTaskThread.ts:21-25`.
Mapping 4xx/5xx to `validation|forbidden|server` is fine, but distinguishing 403 "forbidden" from 404 lets an unauthenticated probe enumerate which task IDs exist in other tenants. Fix: collapse 403/404 to a single "not available" state for cross-tenant safety.

### LOW — Keyboard shortcut hijacking on document focus (D/spoof)
File: `packages/web/src/shell/TaskActionsMenu.tsx:88-115`.
`handleRootKeyDown` only fires while `open`, and `p/b/i/d/t` are scoped to the menu container — acceptable. However the menu re-opens on failure (`handleSelectState`) which can produce a denial-of-service-style click trap if the server returns 5xx repeatedly. Fix: cap auto-reopen to one retry or surface an inline error instead.

### INFO — No CSRF token; relies on same-origin cookies (R)
All `fetch()` calls omit a CSRF token and rely on same-origin SameSite cookies. Acceptable for an SPA on the same origin, but document this assumption — a future cross-subdomain deployment would silently break the model. Mutation routes in `threads.ts` should require `content-type: application/json` (already present) plus an `Origin` check.

## Out of scope / clean
- XSS: `WorkTeam.tsx` and `WorkTeamTaskThread.tsx` only render React-escaped strings; no `dangerouslySetInnerHTML`.
- SSRF: no server-side fetch driven by L15 inputs.
- SQLi: Drizzle parameterized; no raw SQL added.
- Prompt-injection in state-request text: `STATE_REQUEST_PREFIX + "<FROM> → <TO>"` is built from a closed enum (`KanbanColumnState`/`TaskState`), not free text — safe for L15. Re-review when L18 promotes to a typed `state_request` MessageType.
