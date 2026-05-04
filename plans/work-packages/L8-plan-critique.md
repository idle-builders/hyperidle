# L8 — Architecture Plan Critique

**Plan path:** `docs/work-packages/L8-plan.md`
**Critique skill:** `/architecture-critique`
**Iterations run:** 2 (max 3)
**Final score: 8.4/10** — clears the ≥7 threshold.

---

## Iteration 1

**Score: 7.4/10** (SA:8 LI:9 AC:7 DM:7 N:8 MD:7 FMC:8 S:6 V:7)

### CRITICAL findings
1. **§3.1, §3.3 — Server response shape extension is scope creep.** Plan added `hasUnresolvedReview` + `blocking` + `displayTitle` + `displaySnippet` (4 fields). Story only requires the list to be sectioned; rich titles/snippets are L9/L11 territory. `blocking` requires `agentSessionState` not yet wired (placeholder field is API debt). XSS surface introduced unnecessarily. → Fix: redo §10 design-it-twice; pick smallest viable extension.
2. **§3.2 — Title/snippet inconsistency.** UI tests (§6 task 13) render meaningful titles but the wire shape doesn't carry them unless §3.3 lands. Internal inconsistency. → Fix: make dependency explicit OR cut §3.3 entirely; render stubs.

### WARNING findings
3. **§3.4 — `hostTag` union widened with `'coach'`** which is a configuration, not a host kind. Conflicts with the closed `HOST_KINDS` enum in `@hyperidle/shared`. → Fix: narrow to `HostKind`.
4. **§3.5 — Routing contract ambiguous.** Plan said "URL param keeps working" — invites a future regression where row-click writes the URL. → Fix: make hard rule explicit; URL param is read-only fallback.
5. **§6 task 5 — Visual parity check posed as conditional.** `.claude/rules/visual-parity.md` is non-negotiable; HTML reference must be present BEFORE TSX changes. → Fix: pre-task gate, not "if it exists".
6. **§7.1 — Counts assertion only at section level.** Title-bar count not protected. Recurrence guard incomplete. → Fix: add chrome-count assertion.
7. **§10 — Design-it-twice straw-manned.** Option B was a near-clone of A. → Fix: rewrite with three honest options including "ship stubs".

### SUGGESTION findings
8. §3.6 hook state-machine convention drift vs `ConversationsReview.tsx`.
9. §6 task 11 boundary with L10 should be explicit.

### What's working well
- §2 Plan reconciliation is exemplary — every spec assumption greppped against reality.
- §7 Protected tests with named bug-replay assertions hit CC-008 squarely.
- §9 Route checklist correctly records single-route as N/A explicitly (recurrence guard from L7 retro lesson honoured).

---

## Fixes applied between iterations 1 and 2

| Finding | Fix |
|---|---|
| §3.1 scope creep | Wire shape reduced to `Thread + hasUnresolvedReview` only. `blocking` deferred (client-side `false`). Title/snippet deferred (client stubs). |
| §3.3 inconsistency | Replaced with explicit stub derivation: `\`${capitalize(hostKind)} thread ${id.slice(0,8)}\``. No agent content in L8 Submenu. |
| §3.4 widened union | `hostTag?: HostKind` only. Coach indicator handled by pin glyph (already in design §4). |
| §3.5 routing contract | Hard rule: state-only on click; no `navigate()`; no `location.search` mutation. URL `?id=` is first-mount fallback only. |
| §6 task 5 visual parity | Pre-task HTML existence check; if HTML lacks new prop shapes, escalate to design step BEFORE TSX change. |
| §7.1 counts assertion | Added chrome-level title-bar count protected assertion. |
| §10 design-it-twice | Rewrote with Options A (rich, rejected — scope creep), B (chosen — minimal), C (rejected — N+1 client fetches). |
| §8 XSS row | Now N/A by design — no agent content in L8 Submenu. |

Plus minor:
- §11 AC mapping aligned to the new contract.
- §6 task 13 Playwright fixture corrected — 4 hasUnresolvedReview + 1 plain + 2 resolved (no blocking rows in L8).
- §12.5 added: explicit "what L8 does NOT ship" list to pre-empt scope re-litigation.

---

## Iteration 2

**Score: 8.4/10** (SA:9 LI:9 AC:9 DM:9 N:9 MD:8 FMC:8 S:8 V:8)

### Dimension-by-dimension

- **Spec Alignment (9/10):** Every TRACK-L L8 AC mapped to a verification artifact in §11. No invented requirements. The §6 task 11 filter wiring slightly overflows L8's literal AC list but is justified by design §6 hard-pin and explicitly noted as L10 scope reduction.
- **Layer Integrity (9/10):** Server change isolated to one route handler; no cross-package leak; web stays in `packages/web` and design-system change confined to `ThreadRow.tsx`. Outlet-context pattern is layer-correct.
- **API Contracts (9/10):** Wire shape exactly specified, request/response shapes typed, error shapes inherited from existing `ApiErrorResponse`. The `inArray` helper has an UNVERIFIED flag — appropriate per source-driven rule.
- **Data Model Alignment (9/10):** No schema migration. Single field added to a derived response object. SQLite/PostgreSQL parity preserved (the new query uses portable SQL — `IN`, `IS NULL`).
- **Naming (9/10):** `useConversationsThreads`, `ConversationsSection`, `ThreadListRow` — all honest names. `mode: 'conversations' | 'legacy'` correctly disambiguates the dual classifier without inventing a parallel component.
- **Module Depth (8/10):** `useConversationsThreads` has a small public surface (4 fields). `ThreadSections` extension via `mode` parameter rather than a new component — preserves a single deep module. -2 because the legacy mode adds a parameter no current caller exercises after L8; transient debt acceptable, removal queued for L26.
- **Failure-Mode Coverage (8/10):** §5 failure-mode table is comprehensive (10 distinct states). Security & abuse §8 fully populated. -2 because the long-list amplification entry is documented but not actively bounded for L8 (50-row cap is the only guard).
- **Simplicity (8/10):** Iteration 2 cut 3 server fields. Stubs for title/snippet eliminate XSS surface. No premature abstractions. -2 because the `mode` parameter on the classifier is mild future-proofing; defensible because the legacy consumers still exist transiently.
- **Verifiability (8/10):** Every AC has a concrete verification artifact path. Protected tests §7 enumerate three named bug-replay assertions. -2 because some Vitest tests rely on mocking `useNavigate` (vi.spyOn module-level) — pattern works but is fragile to react-router-dom upgrades; the plan does not mention an alternative (MemoryRouter wrap).

### CRITICAL — none.

### WARNING — addressed in plan §6 task 13 (fixture corrected).

### SUGGESTION — accepted as §12.5 in plan.

---

## Verdict

The plan crosses the ≥7 threshold cleanly at 8.4/10 in iteration 2. No third iteration needed.

Closed gaps from L7-retro recurrence: counts-derived-from-list assertion (§7.1), selection-not-routing assertion (§7.2), route-checklist N/A explicit (§9). Pre-empts CC-003 (security & abuse cases populated), CC-008 (protected tests enumerated).

**Plan ready for `/write-tests`.**
