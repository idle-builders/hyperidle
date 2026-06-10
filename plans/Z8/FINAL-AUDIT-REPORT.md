# Z8 Deep Full-System Audit — Final Report

**Date:** 2026-06-10
**Branch:** `audit/Z8-live-qa-deep-audit`
**Method:** 8 parallel deep code-tracers (every UI element → handler → hook → API → service → Drizzle → table, read line-by-line) + 7 parallel Playwright/API live-testers (every flagged element exercised in a real browser, DB side-effects verified, flags confirmed/refuted with evidence) + master flag register with deduplication.

**Artifacts:**
- `plans/Z8/traces/*.md` — 8 code traces (1,945 lines), 175 raw flags
- `plans/Z8/test-results/*.md` — 7 live-test reports with screenshots, console/network logs, DB probes
- `plans/Z8/master-flag-register.md` — 165 deduplicated entries with stable Z8-NNN IDs, file:line, fix-shape
- Screenshots in `/tmp/test-*/`

---

## Verdict

**The application is not launch-ready.** The UI shell renders and basic reads work, but the system has three classes of systemic failure:

1. **The verification foundation is broken.** `npm run check` typechecks *nothing* (proven: injecting `const x: string = 123` into a source file still exits 0). The root `tsconfig.json` has `"include": []` and the script runs `tsc -p` instead of `tsc -b`, so project references are never built. Running the gate correctly (`tsc -b`) surfaces **1,539 type errors** — the codebase has effectively never been typechecked. Two are confirmed ship-affecting (`assistant-dispatcher.ts` `event.hostId` TS2339; `useSettings.ts` `density` TS2353). **Every "green" check in this repo's history is meaningless.**

2. **The automation backbone is built but never wired.** The routine scheduler is never started (all cron routines show `nextRunAt=null`); task auto-dispatch (AD2) never receives its deps; the notification queue has no drain loop (pending rows confirmed); relevance scoring and auto-promotion sweeps have no caller; FTS is never set up so `query_practice` throws at runtime. The "AI-first" automation that is the product's premise does not run.

3. **Core write-paths are dead or broken end-to-end.** UI-created bets can never be activated (no draft→active control); "Adjust appetite" sends a duration string against a money schema → guaranteed 400; the kill-bet dialog promises a cascade that doesn't happen (killed bet leaves `in_progress` tasks running); knowledge items created with the default scope are immediately uneditable; `GET /api/tasks/:id/sessions` doesn't exist so the task sessions pane and Dial-in are permanently dead.

Plus four confirmed security holes (thread IDOR, X-Identity soul-prompt spoofing — *exploited live*, shared worker-token credential exfiltration, plaintext API key on disk).

---

## Confirmation tally

175 raw flags → 165 deduplicated register entries. Live testing confirmed the overwhelming majority; testers also **honestly refuted** several, which raises confidence in the rest:

| Severity | Count | Examples |
|---|---|---|
| Critical | 14 | vacuous typecheck, quadratic cost over-count, dead scheduler/dispatcher/drain, IDOR, X-Identity spoof, no bet-activation path |
| High | 37 | broken list sort, dead filter chips, NaN%/"--" stat cards, broken Adjust-appetite, false kill cascade, uneditable knowledge, unreachable Settings sections |
| Medium | 51 | duplicate DM threads, no-debounce search, stale badges, no-CAS task transitions, autosave self-409 |
| Low | 63 | raw ISO timestamps, truncated IDs, missing empty-state CTAs, a11y footguns |

**Refuted/corrected by live testing (integrity checks):**
- Z8-025 idempotency 500-race — **refuted** under PGlite (single-writer serializes; real only under Postgres concurrency).
- Routine "Trigger Now bricks via coalescing" — **refuted**; dev sessions crash rather than hang.
- `file_leases` "table doesn't exist" — **corrected**; the table physically exists (migration 0000) but is referenced by no code.
- Knowledge triage badge "prop never passed" — **corrected**; AppShell does pass it and it renders; the real defect is staleness.
- AgentEditDialog "dialog is a no-op" — **refuted**; save persists end-to-end.

---

## The 14 Critical issues

| ID | Issue | Evidence |
|---|---|---|
| Z8-001 | `npm run check` typechecks nothing; ~1,539 latent type errors | Injected error exited 0; `tsc -b` → 1,539 errors |
| Z8-002 | Cost over-counting: running total recorded as a per-event delta → quadratic inflation | `session-provisioning.ts:603` passes total to `cost-cap.ts:239` increment |
| Z8-003 | Routine scheduler never started; no cron routine ever fires | No `startRoutineScheduler` boot caller; `nextRunAt=null` for all |
| Z8-004 | AD2 task auto-dispatch dead in production | `GET /api/dispatch-queue` → empty; `dispatcherDeps` never passed |
| Z8-005 | Notification queue has no drain loop; deferred notifications stay pending forever | 1 pending row confirmed; drain only via manual API |
| Z8-006 | Daily digest can never fire automatically | Seed routine `active:false` + depends on never-emitted `routine_fired` |
| Z8-007 | `notification` events have zero listeners; "push to human" is a no-op | No `.on("notification")` anywhere |
| Z8-008 | Factory cost sentinel monitors `factory_settings.cost_actual` — a key nothing writes | Reads only; always 0 |
| Z8-009 | `setupFts` never runs → `query_practice` throws ("column does not exist") | `fts_vector` column absent |
| Z8-010 | draft→active unreachable: UI-created bets stay draft forever | Overflow menu has only Adjust appetite + Kill |
| Z8-011 | Assistant overlay messages vanish after send; replies never appear live | Persisted in DB, absent from stream until reopen |
| Z8-012 | IDOR: `GET /api/threads/:id` has no participant check | Non-participant identity → 200 with full thread body (code-confirmed threads.ts:497-545) |
| Z8-013 | X-Identity header spoofing defeats assistant "self-only" guard | **Exploited live**: wrote `PWNED_BY_SPOOF_TEST` into another user's soul prompt |
| Z8-014 | Shared worker token = org-wide credential exfiltration + worker identity hijack | Static + protocol analysis |

---

## Fix-now vs. separate runs

**Per the original directive ("solve simple improvements and stark issues; report the rest for separate concept and pipeline runs"), and given the broken verification gate, almost nothing is safely fixable in isolation right now.** A code change cannot be verified while `npm run check` is vacuous, and the "simple" candidates (IDOR, NaN guard) turn out to carry scoping/design decisions that need review. Scattering unverifiable fixes is exactly the pattern that produced 1,539 hidden errors.

**Already fixed and committed on this branch (earlier, behavior-verified):**
- Dev-server PGlite path resolution (server crashed on `npm run dev`)
- Rate limit 60→300/min (429 storms on normal navigation)
- `GET /api/knowledge/:id` now JOINs fabric (kind/layer; body "not found" bug)
- KnowledgeDetail remount key (stale body on API load)

**Mandatory FIRST pipeline — `Z8-FIX-00: Repair the gate.** Change `check` to `tsc -b`, fix the project-reference config (TS6307/TS6059 noise), triage the 1,539 errors (production src first, then test-file `noUncheckedIndexedAccess`), land the 2 confirmed production errors. **No other fix can be trusted until this passes.** Nothing else should be merged before it.

**Then, ordered remediation pipelines (each its own run with the repaired gate + reviewer):**
1. **Automation backbone** (Z8-003/004/005/006/007/008/009/029/038) — wire the scheduler, dispatcher, notification drain, FTS, promotion sweep at boot. Largest functional gap.
2. **Cost integrity** (Z8-002/030/031/049) — fix delta-vs-total, wire routine/team cost write-paths.
3. **Security hardening** (Z8-012/013/014/043 + plaintext-key-at-rest) — needs a concept run on the identity/authz model (participant-scoped vs host-scoped threads; X-Identity trust boundary).
4. **Bet/task lifecycle** (Z8-010/022/023/024/025/061/062/063/064/065) — activation path, appetite schema, kill cascade, sessions endpoint. Needs a concept run on the lifecycle contract.
5. **Knowledge UX** (Z8-034/035/036/071/072/073/074/075/076) — default-scope editability, real sort, scope-version race.
6. **Conversations UX** (Z8-011/015/016/017/018/052/053/060) — overlay refresh, recency sort, live updates, the CocOverlay/AssistantOverlay rename half-land.
7. **Settings reachability** (Z8-040/041/042/044/045) — mount Worker/Agents sections, fix Backend field, idempotent setup.
8. **Dead-UI cleanup** (Z8-019/020/021/026/027/028/046/055/056) — NaN guard, missing onClicks, dead breadcrumb, rail-indicators purge, no-op buttons. Many are individually small but should land *after* the gate so they're verified.

**Concept runs needed before their pipelines** (load-bearing decisions, not mechanical):
- Identity & authorization model (threads, X-Identity, worker tokens)
- Bet/task lifecycle contract (who can transition, what cascades)
- The automation execution model (what runs, when, under what budget)

---

## Cross-cutting themes (the *why*)

1. **Dead/unwired code is the dominant failure mode.** Scheduler, dispatcher, drain loop, promotion sweep, FTS, Worker/Agents settings, AssistantOverlay, merge/split/flag — all built, tested in isolation, and never connected at the seam. The vacuous typecheck let the wiring rot undetected.
2. **Events emitted into the void.** `notification`, `knowledge_accessed`, `knowledge_created/archived`, `knowledge_item_updated` have emitters and no listeners; `thread_archived` has a listener and no emitter.
3. **FE/BE contract drift.** Portfolio expects `title`/`costAppetite`, server sends neither; task `owner`/`startedAt` absent on the wire; knowledge hook declares `accessCount`/`relatedItems` the route omits. No shared contract enforcement (and the type gate that would catch it is off).
4. **Cost integrity.** Delta-vs-total confusion + missing write-paths mean every money figure in the UI is either wrong, zero, or "--".
5. **Seed data masks everything.** The single zero-cost, zero-session, single-team seed never exercises a non-zero path, so the broken aggregations render plausibly empty instead of visibly wrong.

---

## What this audit verified works

Not everything is broken — confirmed-healthy with evidence:
- Setup flow (idempotent user create), first-run redirect, 404, legacy redirects, mobile drawer (focus trap, escape, auto-close).
- Profile save (dirty-tracking + persistence), Appearance theme persistence, review/cost/blocker notification persistence, credentials GET leaks no values.
- Knowledge create→read, private-item edit→autosave→persist, seed body fix holds.
- Bet create, AgentEditDialog/AgentAddDialog/RoutineCreateDialog save paths, soft-delete.
- Review verdict toolbar (Approve → resolves + creates verdict message), hint dismissal persistence.
- Global search returns correct grouped results; navigation sanitized (no XSS/SQLi paths found).
- Lifecycle propagation (session→task→bet→team) is fully wired (the one automation that works).
- Zero console errors and zero unexpected non-2xx across all live browser flows.
