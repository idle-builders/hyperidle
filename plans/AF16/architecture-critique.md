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

---

# Re-critique (round 2) — revised plan

ARCHITECTURE-SCORE: 8/10 → **8/10**  rounds=2  score-line: SA:9 LI:9 AC:8 DM:9 N:8 MD:8 FMC:8 S:8 V:8

Focused re-critique of the revised plan against the round-1 CRITICAL + 4 WARNINGs. Every load-bearing claim re-grepped against the worktree tree — not trusting the changelog. Net: the CRITICAL and 3 of 4 WARNINGs are genuinely RESOLVED. WARNING-2 surfaced a **new, narrower internal inconsistency** on the `file_leases` "absolute ban" vs the lint scope. Below: per-finding verdict, then the new gap.

## Per-finding verdicts

### 1. CRITICAL (banned-term scope) — **RESOLVED**
- (a) **AF14 owns the rename — confirmed.** `TRACK-AF.md:561` (AF15 §"Plan calls"/"Contracts" for the AF14 block) states verbatim: *"Resolve the half-landed `CocOverlay`→`AssistantOverlay` rename"* and *"Complete the overlay rename rather than leaving two divergent components."* Originated by AD8b (`AD8b-Assistant*.test.tsx` on disk). Scope assignment is correct.
- (b) **Revised T15 rule no longer scans the web tree — confirmed.** Plan §T15 verify is explicitly scoped to **`docs/** excluding docs/archive/**`** and states *"The rule does **not** scan `packages/web/src/**`."* The R2 risk entry says the same. The old self-failing blanket web scan is gone. With `CocOverlay.tsx`/`CocContext.tsx`/`CocAttachButton.tsx`/`useCocThread.ts` + their tests still on disk (verified — all coexist with `Assistant*` duplicates), the docs-scoped rule cannot self-fail. The self-contradiction the round-1 CRITICAL flagged is eliminated.
- (c) **Zero live banned-term UI strings in web src — confirmed plausible (with nuance).** Grepped `\bcoc\b`/`chief of staff`/`\brail\b` across `packages/web/src`. Every hit is one of: an AF14-owned `Coc*` component file; a `@lore`/comment annotation; a **test asserting absence** (`queryByText("Chief of Staff")).not.toBeInTheDocument()`); an `index.css` keyframe (`coc-open`); a WS topic literal (`"rail"`, annotated AD8b-owned); or a **prop/identifier** in live files (`Sidebar.tsx` `onCocClick`/`cocOverlayOpen`; `KnowledgeDetail.tsx`/`WorkBet.tsx`/`KnowledgeBody.tsx` importing the AF14-owned `CocContext`/`CocAttachButton`). **No user-facing display string** carries a banned term outside AF14's component files. The live `Coc*` identifiers in `Sidebar.tsx`/`WorkBet.tsx` etc. are references to AF14-owned symbols that AF14's rename will sweep — correctly out of AF16 scope, and harmless to the docs-scoped rule. Designer's claim holds.

### 2. WARNING-1 (button no-op rule) — **RESOLVED**
Revised T5 rule (plan §Sub-batch ii) flags a bare `<button type="button">` with no `onClick` as a **finding** (the real no-op the old rule let through), allows `type="submit"` only when lexically inside a `<form onSubmit=...>`, exempts case (c) headless-control trigger children, and is specified as an **AST/ESLint rule** (not grep) so it can resolve `<form>` ancestry. AC-2 ("no button is a no-op") is now statically enforceable. The under-catch is closed.

### 3. WARNING-2 (doc-hygiene file list + BullMQ/Redis semantics) — **RESOLVED** (BullMQ/Redis), with a **new file_leases gap** (see below)
- `deployment-architecture.md:50` (`├── Redis (Event Bus, optional)`) is now in the T13 edit list (item 6) and gets a `cloud profile only` marker — **confirmed line exists**.
- Present-tense-only rule is satisfiable: enumerated all `BullMQ`/`Redis` occurrences in lint scope (`CLAUDE.md` + `docs/architecture/**` excl archive) = exactly the 9 lines the edit list names; **no stray occurrence the list misses**. Each surviving (future/optional) line is rewritten to carry an allow-marker on the same line (`Future candidate:`, `cloud profile only`, `candidate … could back … not used today`); the two present-tense rows (`CLAUDE.md:118` stack list, `technology-summary.md:40` infra row) remove the token entirely. Line-scoped rule passes on the produced tree. All cited lines verified to exist at the stated positions.

### 4. WARNING-3 (retention predicates) — **RESOLVED**
Per-table predicates are pinned exactly. Expiry-based (`login_sessions`, `invite_codes` expired branch): `expiresAt < now − expiredGraceMs`, `expiredGraceMs` **default 0** → `expiresAt < now`; plan explicitly rejects `expiresAt < now − TTL` ("would retain expired rows a full TTL too long — the bug WARNING-3 flagged"). Age-based: `createdAt/accessedAt < now − ttl`. `RetentionReaperOptions` exposes `expiredGraceMs`, `terminalLogTtlMs`, `consumedInviteTtlMs`, `now` — the needed TTLs. Regression-guard is specified: T16 verify (a) seeds `expiresAt = now − 1ms` → asserts **deleted same sweep**, `now + 1h` → retained. Schema spot-check confirms all 5 tables + columns are `text` ISO-8601 (`loginSessions.expiresAt/revokedAt`, `inviteCodes.expiresAt/claimedBy/createdBy RESTRICT`, `notificationQueue.status/createdAt`, `knowledgeAccessLog.accessedAt`, `propagationLog.status/createdAt`); lexical `lt(col, cutoffIso)` is sound. Terminal status enums verified real in code: notification `sent/failed/dropped` (excl `pending`), propagation `applied/skipped` (excl `pending/failed`). `revokedAt`/`claimedBy` confirmed nullable so the `IS NOT NULL` branches are valid.

### 5. WARNING-4 (artifact error/alt) — **RESOLVED**
Treatment B + T11 now route ALL non-paintable cases to one honest "No preview available" affordance: (a) `preview == null`, (b) renderer **throws** (wrapped in an error boundary whose fallback IS the affordance), (c) **malformed** preview (e.g. `image` missing `url`). T11 verify has the error-branch assertion (stub a throwing renderer → "No preview available", tree not crashed) and the malformed-branch assertion (`kind="image"` `preview={{}}` → no `<img>` with empty `src`). Image alt source pinned: `image-renderer.tsx:21` confirmed exactly `alt={preview.alt ?? \`${preview.width}×${preview.height} image\`}`; T10 verify asserts `alt="My chart"` when title-sourced, non-empty dimensional fallback otherwise. Both round-1 design WARNINGs are now encoded assertions.

## NEW — internal inconsistency surfaced while verifying WARNING-2 (file_leases ban scope)

**[plan §T13 item 7 + verify predicate] — `file_leases` "absolute ban" overreaches its own lint scope and would either miss two genuine false claims or destroy two legitimate mentions.** Severity: **WARNING** (plan-text reconciliation, not rework).

The T13 verify predicate says *"`file_leases` — absolute ban: zero occurrences"* and item 7 says *"Absolute ban on the `file_leases` token outside archive."* But the T13 lint **scope** is `CLAUDE.md` + `docs/architecture/**`. Grep of non-archive docs finds five live occurrences:
- `docs/architecture/components.md:95-96` — in the strike list ✓ (removed).
- `docs/requirements/functional-requirements.md:25` — "artifacts (with file leases)" — a **present-tense false claim** about HyperIdle's own model. Item 7 says "and any FR mentions that describe it as a present mechanism" — but this file is **outside** the `docs/architecture/**` lint scope, so the rule as scoped will NOT catch it and the spec's AC-6 ("no false claims … a `file_leases` mechanism that the audit disproved") is not enforced for it.
- `docs/process-layer/the-five-primitives.md:123` — "they share file leases on artifacts" — also a **present-tense false claim**, also outside lint scope.
- `docs/knowledge-architecture/inspirations.md:11` — "MCP Agent Mail … file leases" — describes an **external tool** (Yegge's fork); legitimate, must NOT be banned.
- `docs/product/vision-gap-audit.md` (218–407) — the audit doc that **documents** the very finding; banning `file_leases` here would erase the audit's own description. Must NOT be banned.

So an "absolute ban outside archive" is self-contradictory two ways: it's narrower than its own prose (misses the FR + five-primitives false claims, which AC-6 actually requires removing) AND, if widened to truly "outside archive," it would self-fail on `inspirations.md`/`vision-gap-audit.md` (legitimate non-HyperIdle uses) — the exact class of self-failing rule the round-1 CRITICAL was about, in miniature.

**Fix (before `/write-tests`):** (i) extend the T13 edit list to strike/reword the two false claims — `functional-requirements.md:25` (drop "(with file leases)") and `the-five-primitives.md:123` (drop "they share file leases on artifacts"); (ii) scope the `file_leases` ban to **HyperIdle-as-present-mechanism** claims with an explicit allow-list for the external-tool mention (`inspirations.md`) and the audit doc (`vision-gap-audit.md`) — mirroring exactly how T15 allow-lists `@lore`/generic-English to avoid self-failing. Drop the word "absolute." This is the same distinction the plan already drew correctly for `BullMQ`/`Redis` (present-tense vs legitimate); it just wasn't applied to `file_leases`.

(Minor: `components.md:95` reads `-- File leases` (capitalized, space) — a `file_leases` token regex wouldn't match it, but line 95-96 are struck together in the edit list, so it's removed regardless. No action needed beyond keeping both lines in the strike.)

## Self-consistency sweep — does any specified lint rule fail on AF16's produced tree?
- **T15 banned-term (Rail/CoC)** — docs-scoped, allow-lists `@lore`/generic-English. Does NOT scan web tree. **Passes** on produced tree (the `Coc*` files AF14 owns are out of scope). ✓
- **T13 BullMQ/Redis** — line-scoped present-tense ban with same-line future markers. Every surviving line rewritten to carry a marker; present-tense rows strip the token. **Passes.** ✓
- **T13 file_leases** — **FAILS the self-consistency bar as written** (see NEW above): "absolute ban" either under-enforces (scoped to architecture) or self-fails (if truly outside-archive, hits the legit external/audit mentions). The only rule in the plan that does not yet pass cleanly on its intended tree. Fix is text-level.
- **T5 no-op button (AST)** — flags bare `type="button"`; produced tree wires/removes the enumerated candidates → **passes** once code lands.

## Z8 traceability — still complete
Re-cross-checked the matrix against the spec's AF16 closes-list (Z8-019/020/021/026/027/028/033/046/066-070/085-089/091/097/100/113-120/125/128-131/147-160/164/165). All present; none dropped. The round-1 note on T11's stray `Z8-025` reference is no longer present in the revised T11 verify text (now cites Z8-026/027). Clean.

## Verdict
**NEEDS-REVISION (minor).** The round-1 CRITICAL + all 4 WARNINGs are genuinely resolved — verified against the tree, not just the changelog. One **new WARNING** remains: the `file_leases` "absolute ban" is internally inconsistent with its own lint scope and the AC-6 false-claim requirement. It is a **plan-text reconciliation** (extend the edit list by two lines; allow-list two legitimate mentions; drop "absolute") of the exact shape the designer already executed correctly for BullMQ/Redis — no structural rework, no restart. Fix it in the plan before `/write-tests` encodes the predicate, then proceed to build. If the builder prefers, this can also be handled as a `/write-tests`-time scoping decision since it is purely the test's scope/allow-list — but pinning it in the plan now is cleaner. Score holds at **8/10** (DM +1 for the now-pinned retention predicates; FMC +1 for the resolved file-list/scope; offset by the new file_leases finding).
