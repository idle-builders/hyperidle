# L15 — Security Review (read-only)

**Counts:** 0 blocker, 0 high, 3 medium, 4 low, 2 informational. No blockers.

## Findings

### SR1 — No in-flight guard against double-fire / cost amplification (medium, L15-specific)
- File: `packages/web/src/pages/WorkTeam.tsx:192-266`; menu item `packages/design-system/src/TaskCard.tsx:200-221`.
- Threat: STRIDE-D (DoS / cost amplification). Architecture §3.4 + §7 say "the kebab is disabled while a request is in flight" — implementation has neither a per-task in-flight flag nor a disabled menu state. Each click rolls a fresh `crypto.randomUUID()` so idempotency does NOT collapse rapid clicks: N clicks → N distinct messages, each amplifying agent context tokens and audit-log writes. Lazy-bootstrap path: a fast double-click can race two `POST /api/threads` with the same `(hostKind, hostId)` (server has no uniqueness on host_kind+host_id), creating duplicate threads.
- Severity: **medium**.
- Suggested fix: add `pendingTaskId: string | null` (or `Set<string>`) state in `WorkTeam.tsx`; set before fetch, clear in `finally`; pass `pending` down so the menu item renders `aria-disabled` and short-circuits clicks. Document the deviation explicitly if intentionally deferred.

### SR2 — Client-supplied `X-Identity` header (medium, pre-existing — L15 widens use)
- File: `packages/web/src/pages/WorkTeam.tsx:210, 223`; server `packages/server/src/routes/threads.ts:50-56`.
- Threat: STRIDE-S/E. The web hardcodes `X-Identity: u-founder`; the server trusts the header verbatim with default `u-founder`. Any unauthenticated caller can post in the founder's name. L15 is the first surface that creates founder-attributed plain messages from a UI verb path, increasing the operational impact of the existing `auth-middleware-participant-scope` follow-up.
- Severity: **medium**.
- Suggested fix: do NOT block L15. Reaffirm in `plans/work-packages/follow-ups.md` that L15 expanded the footprint (kanban kebab, not just review surface).

### SR3 — `?id=<threadId>` deep-link, no access control on GET /api/threads/:id (medium, pre-existing)
- File: `packages/server/src/routes/threads.ts:250-275`; navigation site `packages/web/src/pages/WorkTeam.tsx:179`.
- Threat: STRIDE-I (IDOR). `GET /api/threads/:id` returns the thread + all messages without checking participant membership. Thread IDs are `crypto.randomUUID()` (unguessable), but L15 ships them in URLs (history, browser sync, referer leakage). Combined with SR2 (any X-Identity), a leaked thread URL grants full read of cross-tenant messages.
- Severity: **medium** (pre-existing; L15 introduces the URL-as-capability pattern).
- Suggested fix: log as `thread-detail-participant-authz` follow-up; do not block L15. Long-term, GET /api/threads/:id must check sender ∈ participants.

### SR4 — `crypto.randomUUID` undefined in non-secure context (low)
- File: `packages/web/src/pages/WorkTeam.tsx:146, 197`.
- Threat: STRIDE-D (availability). `crypto.randomUUID` requires a secure context; on `http://<lan-ip>` (non-localhost) it throws `TypeError`, which falls through the narrow `try/catch` and bubbles as an unhandled promise rejection. Plan §7 declares non-localhost HTTP "not a deployment target" but a misconfigured laptop/VPS is a realistic accident.
- Severity: **low**.
- Suggested fix: wrap UUID generation in a helper that throws an explicit `InsecureContextError`, surfaced as a real error toast; or use a UUID polyfill. Add a runtime assertion at app boot.

### SR5 — `TaskCell` ignores `aria-disabled` for keyboard activation (low)
- File: `packages/design-system/src/TaskCard.tsx:201-221`.
- Threat: STRIDE-T (input validation, a11y bypass). Disabled rows render `<button aria-disabled="true">` but the `<button>` is fully focusable and Enter/Space invokes `onClick`. The handler short-circuits via `if (disabled) return`, so behaviour is correct — but the disabled hint can be bypassed only by JS state. The agent ultimately decides; documented as out-of-scope `task-verb-server-validation`.
- Severity: **low** (already accepted as a documented limitation).

### SR6 — `hostId` is a fixture string, no server-side validation it exists (low, pre-existing)
- File: `packages/web/src/pages/WorkTeam.tsx:226`; server `threads.ts:278-378`.
- Threat: STRIDE-T. `POST /api/threads` accepts any non-empty `hostId` without verifying a task with that id exists or that the founder owns it. L15 supplies UI-fixture ids (`t1`-`t5`); future real ids inherit the gap.
- Severity: **low** (server gap, not L15-introduced).
- Suggested fix: add follow-up `thread-host-existence-check` to validate `hostId` against `tasks` table when `hostKind === "task"`.

### SR7 — Toast text safe (informational, confirmed)
Only static literals passed to `showToast`. No `dangerouslySetInnerHTML`. Clean.

### SR8 — Request message body helper-derived (informational, confirmed)
`text = requestMessageText(verb)`; `verb` is a closed enum; helper is a pure lookup table. No user input enters the wire. Clean for L15.

### SR9 — CSRF posture (informational, pre-existing)
CORS restricted to `http://localhost:5173`; no CSRF token; auth by API key / `X-Identity`. Dev: low risk (no ambient credential). Production: real concern only if cookies/sessions added (auth-middleware follow-up). L15 does not change posture.

### SR10 — Idempotency double-click intentional (informational)
L1 contract `unique(thread_id, sender_id, client_key)` is satisfied. Two clicks with two distinct UUIDs are accepted as two distinct messages — documented L1 behaviour. SR1's fix subsumes the practical concern.

## Summary

- **No L15-introduced critical issues.** SR2/SR3/SR6 are pre-existing follow-ups; L15 expands blast radius without introducing root cause.
- **Highest-priority L15-specific finding: SR1** — missing in-flight guard contradicts architecture plan and creates a cost/audit amplification path. **Recommend addressing before merge.**
- Tier: SR1 = ALWAYS (cost-budget enforcement client-side). SR2/SR3/SR6 = ASK FIRST (existing scope; pre-auth-middleware era). SR4/SR5 = ASK FIRST. Toast/CSRF/idempotency informational.
