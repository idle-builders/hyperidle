# Architecture Critique: AF16

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:8 DM:8 N:8 MD:8 FMC:7 S:8 V:8

L-complexity correctness + hygiene consolidation, 6 sub-batches, 17 tasks. Every load-bearing reconciliation claim was spot-checked against the actual code — **all confirmed.** Verdict: APPROVED with WARNINGs that should be folded into the plan before `/write-tests`.

## Claims-match-code verification (CC-007 — all confirmed against grep)

| Plan claim | Verified |
|---|---|
| No BullMQ/ioredis/redis/node-cron dependency | ✅ Confirmed — grep of all `package.json` returns nothing. |
| Scheduler = `setInterval` services in `packages/fabric/src/services/` | ✅ Confirmed — `workspace-reaper.ts`, `cost-sentinel.ts`, `routine-scheduler.ts`, `notifications/drain.ts` all there. |
| `workspace-reaper.ts` = `reapXOnce` + `startX(): () => void` disposer | ✅ Confirmed — `reapWorkspacesOnce` + `startWorkspaceReaper` + `WORKSPACE_REAPER_INTERVAL_MS`. |
| `bootstrap.ts` wires via `disposers.push(start…)` | ✅ Confirmed — lines 109/127/145 push `startCostSentinel`/`startNotificationDrain`/`startWorkspaceReaper`. Plan's "lines 109,127,144" off by one on the last but the pattern is exact. |
| `formatMoney` in `packages/shared/src/format/money.ts`, already imported | ✅ Confirmed — present, signature `(WireMoney\|Money\|null)→string`, returns "--" for null; `formatTokenCount` co-located. WorkBet already imports it (Budget card uses it). |
| WorkBet NaN% guard tests object-truthiness | ✅ Confirmed `WorkBet.tsx:1222-1234` exactly. |
| ArtifactPreviewSurface calls `summarize()` for all kinds | ✅ Confirmed — `renderBody` → `getKindDefinition(kind).summarize(preview)`, no registry dispatch; `PlaceholderText` returns "PREVIEW NOT YET RENDERED"/"PREVIEW PENDING". |
| `to="/work"` 404s; router has no `/work` | ✅ Confirmed — `WorkTask.tsx:242`, `WorkBet.tsx:1047`; router has only `work/portfolio`, `work/team/...` etc., then `*`→NotFound. |
| `WorkTeam.tsx:476` onCreated only closes; agent path refetches | ✅ Confirmed — routine `onCreated={() => setCreateRoutineOpen(false)}`; agent path calls `refetchAgents()`. |
| `useTeamAgents.refetch` = `fetchCount` bump; `useTeam` lacks it | ✅ Confirmed — `useTeamAgents.ts:94-98` exposes `refetch`; `useTeam.ts` has no refetch. The mirror is precise. |
| search.ts: LIKE candidates, recency-only orderBy, no tiebreaker | ✅ Confirmed — `orderBy(desc(bets.createdAt))`, `desc(knowledgeItems.updatedAt)`, `desc(threads.lastActiveAt)`; over-fetch `limit(MAX*10)` then JS-cap; no `asc(id)` anywhere. `escapeLikePattern` already in use. |
| observability `enabled = kv.get(...) === "true"` → default false | ✅ Confirmed `config.ts:64`; `DEFAULTS.adapter="console"`. |
| 5 retention tables exist with usable timestamp cols | ✅ Confirmed — `loginSessions`(expiresAt/createdAt/revokedAt), `inviteCodes`(expiresAt/createdAt/claimedBy, createdBy RESTRICT), `notificationQueue`, `knowledgeAccessLog`(accessedAt), `propagationLog`. No migration needed. |
| `file_leases` never implemented | ✅ Confirmed — only in `components.md:96` doc text, no schema/code. |
| `LOGIN_SESSION_TTL_MS`/`INVITE_CODE_TTL_MS` in auth.ts | ✅ Confirmed (30d / 7d). |
| `renderer-registry.ts` `getRenderer(kind)` in packages/web/src/kinds | ✅ Confirmed line 45; full renderer set + stories present. design-system has no `@hyperidle/web` dep (upward-dep constraint real). |

This is the cleanest reconciliation section I've reviewed — no spec/codebase drift. Dimension 1 (Spec Alignment) and the CC-007 class are clean.

## AC coverage (all 6 mapped, verification methods graded)

1. **No NaN%/placeholder/misleading bar** → T1, component test asserts no "NaN", "No tasks yet", no bar element + `50%`+bar for populated. ✅ Real runtime test.
2. **Every control acts or removed; no 404 nav** → T4 (breadcrumb E2E + `to=`-matches-router unit test) + T5 (per-page button E2E + static "no `<button>` without onClick/type" unit test). ✅ Mixed E2E + lint-style — correct tool per criterion. See WARNING-1 on the static test.
3. **Deterministic relevance-aware search** → T7 (twice-run identical-id-list integration test) + T8 (exact-match-ranks-above-substring integration test). ✅ Real DB integration tests.
4. **Honest artifact rendering** → T10 (`<img>` not text assertion) + T11 (no-preview copy + absence of "PREVIEW PENDING"). ✅ Component tests.
5. **Post-mutation refresh without reload** → T3 (mount WorkTeam, create routine, assert refetch fires + new routine appears without remount). ✅ Component/integration.
6. **No banned terms + no false claims** → T13 (lint-style: no BullMQ/Redis/file_leases in `docs/architecture/**`+CLAUDE.md outside archive) + T15 (no Rail/CoC concept-sense). ✅ Lint-style — correct (static property). See CRITICAL-1 and WARNING-2.

## Z8 traceability

The traceability matrix maps the enumerated findings. Cross-checked the spec's Z8 list against the matrix: every spec-listed finding (Z8-019/020/021/026/027/028/033/046/066-070/085-089/091/097/100/113-120/125/128-131/147-160/164/165) appears. **None silently dropped.** Note: Z8-025 is referenced in T11's verify line but is NOT in the spec's closes-list — harmless (extra honesty coverage), but the plan should not imply it closes a finding it doesn't own.

## Risk adjudication (R1-R5)

- **R1 (dead-button false positives)** — **Handled acceptably.** The static test is scoped to `<button>` without `onClick` OR `type`; form-submit buttons have `type="submit"`, so they pass. Mitigation (classify before removing) is correct. But see WARNING-1: the static rule as written ("no `<button>` without an `onClick` or a `type` attribute") will pass a `type="button"` with no handler — a genuine no-op — so it under-catches. Needs tightening.
- **R2 (Coc*→Assistant* overlay rename collision)** — **Real and correctly scoped.** Confirmed BOTH `CocOverlay.tsx`+`AssistantOverlay.tsx`, `CocContext.tsx`+`AssistantContext.tsx`, `CocAttachButton.tsx`+`AssistantAttachButton.tsx` coexist in `packages/web/src/` — the rename is genuinely half-landed with divergent duplicates. The plan's decision to scope AF16's Task 15 to **docs + non-overlay UI strings** if AD8b owns the overlay is the right call. **But** the T15 verify rule ("no `Coc`/`Rail` identifier in `packages/web/src/**` except annotated `@lore`") will FAIL while `CocOverlay.tsx`/`CocContext.tsx`/`CocAttachButton.tsx` still exist — i.e. the test contradicts the scoping. See CRITICAL-1.
- **R3 (CASE match-rank not FTS)** — **Acceptable for the AC.** The AC says "relevance-aware," not "FTS." CASE-rank (exact/prefix < boundary < substring) over the existing escaped pattern is deterministic and a defensible relevance signal across three heterogeneous categories. Correctly flagged as out-of-scope-for-FTS. No revision needed.
- **R4 (observability default-on noise)** — **Acceptable but confirm sink.** Flipping `enabled` default to true with `console` adapter satisfies "configured rather than silently off." `console` writes via the structured logger (confirmed `@lore` says no raw `console.log`). Acceptable; the `noop` explicit opt-out is preserved. No revision.
- **R5 (TTL values not spec-pinned)** — **Needs a pin, not revision.** 6h cadence / 30d terminal-log TTL are reasonable. login/invite use the real `auth.ts` constants. Pin them as named config constants (T16 already says "config constant") so they're not magic numbers; reviewer accepts 6h/30d. See WARNING-3 on the grace-buffer wording.

## CRITICAL
- **[plan §Sub-batch v T15 + R2]** The Task 15 verify rule ("no `Coc`/`Rail` identifier in `packages/web/src/**` except annotated `@lore`") **directly contradicts** its own R2 scoping. If AD8b owns the overlay rename, `CocOverlay.tsx`/`CocContext.tsx`/`CocAttachButton.tsx` remain on disk and the lint rule **fails AF16's own verify** — a self-blocking plan. Fix: make T15's verify rule scope explicit and consistent with R2 — either (a) AF16 owns the full `Coc*`→`Assistant*` rename and the rule applies to all of `packages/web/src/**` (then delete the duplicate `Assistant*` files question — which is the canonical?), or (b) AF16 is docs+strings only and the identifier rule is scoped to `docs/**` + the specific non-overlay strings, NOT `packages/web/src/**` blanket. The plan must pick one before `/write-tests`, because the test encodes the scope. As written the scope is ambiguous and the test will fail under the R2-preferred path.

## WARNING
- **[plan §Sub-batch ii T5 / R1]** The static no-op-button rule "no `<button>` without an `onClick` or a `type` attribute" under-catches: a `<button type="button">` with no `onClick` is a real no-op but passes (it has a `type`). Tighten to: a `<button>` must have `onClick` OR (`type="submit"` inside a `<form>`); `type="button"` without a handler is a finding. Otherwise AC-2 ("no button is a no-op") is not actually enforced by the static test — only by the per-page E2E, which only covers *visible* buttons on tested pages.
- **[plan §Sub-batch v T13]** The false-claim verify rule covers `docs/architecture/**` but the plan's file list for T13 names only `technology-summary.md` and `components.md`. **`docs/architecture/deployment-architecture.md:50` also contains "Redis (Event Bus, optional)"** — the lint rule will catch it and fail unless that file is also edited. Add `deployment-architecture.md` to T13's file list. Also: `technology-summary.md:10-11` and `components.md:140/247` frame BullMQ/Redis as **future/optional/cloud-profile** columns, not present-tense claims. A blanket "no BullMQ/Redis string outside archive" rule will force deleting legitimately-aspirational future-column mentions. Decide explicitly: either the rule bans the strings everywhere (then rewrite the future columns to name a real candidate like "Temporal/NATS" or strike them), or the rule targets only present-tense claims (harder to lint). The current plan text ("make the future column not read as present") implies the softer intent but the verify rule is the harder ban — reconcile.
- **[plan §Sub-batch vi T16 / R5]** `RetentionReaperOptions` exposes `terminalLogTtlMs` + `now` but NOT the login-session/invite TTLs, yet the prose says they use `auth.ts` constants "grace + buffer." For `login_sessions`/`invite_codes` the honest predicate is `expiresAt < now` (already expired) — an extra "grace + buffer" beyond `expiresAt` is undefined behavior and risks pruning too-eagerly or too-late. Specify the exact predicate per table (the reconciliation table says `expiresAt < now − TTL` which would *retain* expired rows for an extra TTL — clarify whether TTL here is a post-expiry retention window, and if so name it `expiredRetentionMs`). The semantics of "TTL relative to expiresAt vs createdAt" must be pinned per table before tests assert on it.

## SUGGESTION
- **[plan §Type signatures]** `getRenderer(kind: string): ComponentType<RendererProps>` — the actual export is `RendererComponent` (alias). Use the codebase's real type name to avoid a drift in the moved file.
- **[plan §Sub-batch iv T9]** The registry move touches ~8 files + all `packages/web` import sites + stories + design-system `index.ts`. Add the moved `.stories.tsx` files (7) to the `sharedFiles`/migration note explicitly so the builder doesn't orphan stories at the old path.
- **[plan §Z8 traceability T11]** T11 cites "Z8-025-class" which is not in AF16's closes-list. Drop the Z8-025 reference or confirm ownership; don't imply closure of an unowned finding.
- **[plan §protectedTests]** Good that it's populated. Add the existing `ArtifactPreviewSurface`/`ArtifactPreview` story-sync baseline and any existing renderer tests at the OLD path to protectedTests, since T9 moves them — their assertions must survive the move unchanged.

## What's Working Well
- **The reconciliation section is exemplary.** Every spec assumption is paired with verified reality and a plan handling, with exact file:line citations that all check out. This is precisely how CC-007 (spec/codebase drift) gets killed in the plan rather than surfacing in code review.
- **Verification-method discipline.** The plan correctly picks the tool per AC: runtime component/integration tests for behavior (NaN%, search determinism, refetch), lint-style static rules for static properties (banned terms, no-op-button shape, observability default). It explicitly rejects grep-as-test for the money case ("grep-based check is insufficient — assert rendered text"). This matches the CLAUDE.md validation philosophy exactly.

**Verdict: APPROVED (8/10), conditional.** One CRITICAL (T15/R2 self-contradicting scope) and three WARNINGs that are plan-text reconciliations, not structural rework. The builder must resolve the CRITICAL scope ambiguity before `/write-tests` encodes a self-failing lint rule. No restart needed.
