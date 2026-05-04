# L3 — Architecture Review (Implementation vs Plan)

**Worktree.** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L3`
**Diff range.** `main..HEAD` (8 commits, ~28 source files post-apply-review)
**Plan.** `docs/architecture-plans/L3.md`
**Critique.** `docs/architecture-plans/L3-critique.md`
**Concept.** `docs/concept/HUMAN_INTERFACE_LAYER.md` §4.5
**Shared contract.** `docs/work-packages/the canonical-shapes contracts under docs/`

This review checks the **shipped code** against the **architecture plan** that was scored 8.6/10. It is **not** a re-score of the plan. Different from `/architecture-critique` (Step 4) which reviewed the document.

Severity legend:
- **BLOCKER** — concept/contract violation OR a route/service the plan promised but does not exist; ships a broken system.
- **MAJOR** — material drift from plan (missing layer, missing protection, or contract diverges) that does not break user-visible function but compromises forward-compat / discipline the plan committed to.
- **MINOR** — stylistic / dead-code / tightening drift; safe to defer to a follow-up.

---

## BLOCKERS (3)

### B1. Two ESLint rules promised by the plan are NOT implemented
**Files.** `packages/eslint-plugin-design/src/rules/` — directory exists; `no-embed-chrome.ts` and `closed-view-family.ts` are **absent**.
**Plan reference.** L3.md §6.6 lists both rule files + their tests; §9 names the eslint rule as Layer-2 of the closed-view-family defence; §12 names two protected tests (`eslint-no-embed-chrome`, `eslint-closed-view-family`); §10 Q9 marks the rule "in scope".
**Found.** `ls packages/eslint-plugin-design/src/rules/` returns only the pre-existing K6 rules (`no-ai-aesthetic`, `no-density-tokens`, `no-hardcoded-color`, `no-off-grid-spacing`, `no-off-scale-font-size`, `no-off-scale-radius`, `no-raw-actor-fetch`, `no-raw-tailwind-color`, `require-ds-attribute`). No `no-embed-chrome.ts`, no `closed-view-family.ts`, no `__tests__` for either.
**Why blocker.** The closed-view-family was marked AC-3 "view family closed at four layouts" with **layered defence**: the export-boundary test is Layer 1, the eslint rule is Layer 2 (§9). With Layer 2 missing, a future agent who adds `packages/design-system/src/ArtifactCard.tsx` AND remembers to update `index.ts` is caught only by the export-boundary test discovering an additional file in `src/` — which the test does check (`ArtifactStackItem.test.tsx` would not flag it because it tests by-allow-list directory scan). Re-reading `closed-view-family.test.ts:39-46` — yes, the directory scan IS in place, so Layer 1 *over*-covers what Layer 2 was meant to add. But `no-embed-chrome` (the chrome-prohibition for `ArtifactEmbed`) has **no other defence** — the only enforcement is the Playwright `artifact-embed-no-chrome.spec.ts` which (i) requires the route `/conversations/review` to seed an embed (not yet wired) and (ii) runs only at e2e time, well after CI lint.
**Fix suggestion.**
- Add `packages/eslint-plugin-design/src/rules/no-embed-chrome.ts`: AST scan of any `.tsx` whose file name is `ArtifactEmbed.tsx`; reject `bg-`, `border`, `border-`, `rounded-`, `shadow-` Tailwind class fragments on the JSX root. Pattern matches existing `no-raw-tailwind-color.ts` (string-fragment regex over `className`).
- Add `packages/eslint-plugin-design/src/rules/closed-view-family.ts`: file-path-keyed allow-list of the 8 sanctioned `Artifact*` filenames; rejects any new `packages/design-system/src/Artifact*.tsx` whose basename is not in the allow-list.
- Wire both in `packages/eslint-plugin-design/src/index.ts` (the rules registry).
- Land the `__tests__` siblings the plan §12 named.

---

### B2. `createArtifact` / `settleArtifactPreview` / `settleArtifactCost` services are NOT implemented
**Files.** `packages/server/src/services/` — `createArtifact.ts`, `settleArtifactPreview.ts`, `settleArtifactCost.ts` are **absent** (`ls .../services/ | grep -i artifact` returns nothing).
**Plan reference.** L3.md §6.3 lists all three service files; §7 step 3 ("`createArtifact` server service used by both POST route and the agent harness") and step 4 (settle services with immutability guards); §1 explicitly calls out "the agent-runtime entry path (a single `createArtifact` service used by Task-handoff and the agent harness)".
**Found.** The route handlers in `packages/server/src/routes/artifacts.ts` perform insert / update directly (POST at lines 271–283; PATCH preview at 311–315; PATCH cost at 354–370). There is no shared service the harness or task-handoff path can call without going through HTTP.
**Why blocker.** The plan's first-paragraph promise (§1) was that the agent runtime gets a *direct, function-call* entry point so the harness emits artifacts without round-tripping its own server. Today the harness has only the HTTP route. When L11/L12 land and the harness creates artifacts in-process, every call must go through Hono — adds latency, bypasses the agent's own auth context, and makes integration tests need a running server. Also: AC-2 says "Tasks are the unique producers of Artifacts" (concept §4.5 hard rule #1); without a service, the agent runtime has no clear chokepoint where the producer-rule check can live.
**Fix suggestion.** Extract three thin functions from the route handlers into `packages/server/src/services/`:
- `createArtifact(db, eventBus, input): Artifact` — FK validation + insert + emit `artifact_created`. POST route delegates.
- `settleArtifactPreview(db, eventBus, id, preview): Artifact | ImmutableError` — race-safe SELECT-then-UPDATE-WHERE-NULL; emits `artifact_preview_settled`. PATCH route delegates.
- `settleArtifactCost(db, eventBus, id, cost): Artifact | ImmutableError` — same pattern; emits `artifact_cost_settled`. PATCH route delegates.

Add `packages/server/src/services/__tests__/createArtifact.test.ts` per plan §6.3.

---

### B3. Event-bus emission promised by the plan is NOT implemented
**File.** `packages/server/src/routes/artifacts.ts:160` — `createArtifactRoutes(db: HyperIdleDb)`. No `eventBus` parameter; no emission.
**Plan reference.** L3.md §5.5 ("Three events emitted") — `artifact_created`, `artifact_preview_settled`, `artifact_cost_settled`, with payload shapes and per-stream ordering keyed on `producingTaskId`. §6.3 mounts the route as `api.route("/artifacts", createArtifactRoutes(options.db, eventBus))`. The slop scan flagged this (M5: "EventBus parameter accepted then ignored") — the apply-review pass appears to have *removed* the unused parameter rather than wire it.
**Found.** `app.ts:266` mounts as `api.route("/artifacts", createArtifactRoutes(options.db))` — no eventBus passed. No `eventBus.emit("artifact_*", ...)` call in any route handler.
**Why blocker.** The plan committed three events as part of the contract for downstream consumers. Without them: notifications (G-track) cannot subscribe to artifact lifecycle; observability (H-track) cannot trace artifact creation; the WebSocket push contract (the canonical-shapes contracts under `docs/<topic>/` line 44) loses parity for artifacts. Drops a whole forward-compat hook the plan promised.
**Fix suggestion.** Reinstate the `eventBus` parameter (typed, not underscored) on `createArtifactRoutes`. Emit the three events from the service-layer extraction (B2). Update `app.ts` to pass `eventBus`. Add an `events.ts` entry in `@hyperidle/shared` for the three event types so other packages can subscribe with type safety.

---

## MAJORS (5)

### M1. `ArtifactPermalink` page exists but is NOT registered in the router
**Files.** Page `packages/web/src/pages/ArtifactPermalink.tsx` exists and imports `useParams` from `react-router-dom`. Router `packages/web/src/router.tsx:22-44` does **not** register the `/artifacts/:id` route.
**Plan reference.** L3.md §5.4 routes-checklist row "GET /api/artifacts/:id → ArtifactPermalink.tsx (new — single_full_preview surface)"; §6.5 lists the page; §10 Q1 anchors AC-9 + AC-11 partly on this page.
**Found.** Navigating to `/artifacts/art-fixture-1` (the e2e test's target URL — `artifact-permalink.spec.ts:5`) hits the catch-all `NotFound` handler at `router.tsx:41`. The Playwright tests `artifact-permalink.spec.ts`, `artifact-no-preview.spec.ts`, and `artifact-cost-pending.spec.ts` will all fail at smoke time.
**Why major (not blocker).** The page component is built and tested in isolation; the route wiring is a one-line `router.tsx` addition. Not a contract violation but kills three of the five new e2e specs.
**Fix suggestion.** Add to `router.tsx:35` (after the knowledge child routes):
```
{ path: "artifacts/:id", element: <ArtifactPermalink /> },
```
Import `ArtifactPermalink` at the top.

---

### M2. `getArtifactViewProps` helper (planned in shared) is NOT implemented; ArtifactView shape types were NOT lifted to shared
**Files.** `packages/shared/src/types/artifact.ts` — no `getArtifactViewProps`; no `packages/shared/src/types/artifact-view.ts`. `packages/web/src/shell/ArtifactView.tsx` (assumed pre-existing) is unchanged.
**Plan reference.** L3.md §3.5 + §6.2 names `getArtifactViewProps` as an export from `packages/shared/src/types/artifact.ts`; §10 Q4 made the type-lift to `packages/shared/src/types/artifact-view.ts` an explicit step-1 mitigation for the Q4 layer-violation concern (verified at adversary finding A2). §12 lists the protected test `getArtifactViewProps-mapping-exhaustive`.
**Found.** The simplification scan H1 explicitly **removed** `getArtifactViewProps` ("70-line layer used by exactly one caller … saves ~70 LOC"). Inspection of `packages/shared/src/types/artifact.ts` confirms only `summarizePreview` and `artifactDisplayTitle` remain. The exhaustive-mapping test the plan promised does not exist.
**Why major.** Two consequences:
1. The plan's L11 forward-compat path was: rich review messages embed an Artifact via `ArtifactEmbed`, which calls `getArtifactViewProps(artifact)` to dispatch into the 5 `ArtifactView` shapes (per the canonical-shapes contracts under docs/ "5 ArtifactView shapes"). Today `ArtifactEmbed` calls `summarizePreview` and renders a single string. When L11 lands and needs to render the *visual_comparison* shape inline, the dispatch layer is missing.
2. The simplification scan's argument ("only one consumer") was reasonable for the L3 standalone surface — but it conflated current usage with the documented L11 forward-compat. The decision to delete should have been coordinated with the plan's reconciliation table (§13 row "L11 forward-compat (rich review messages embed artifact)").

This is a **legitimate disagreement** between simplification (delete the unused layer) and forward-compat (keep the planned dispatch layer). The plan is the canonical source for L3 — if the plan committed to this layer for L11, deletion is drift.
**Fix suggestion.** Either:
- (A) Reinstate `getArtifactViewProps` + `ArtifactViewShape` types in `packages/shared/src/types/artifact-view.ts` per plan Q4. Wire `ArtifactEmbed` to consume it; keep `summarizePreview` as the string-collapse helper.
- (B) Update plan §13 + the L11 story to declare that L11 will define its own dispatch when needed, and document that L3 ships only `summarizePreview`. Either is acceptable — but the **drift must be resolved at the plan level**, not silently in a slop-scan apply.

Recommend (A) — re-introducing 30 LOC keeps the L11 contract on track and the cost is negligible.

---

### M3. POST/PATCH endpoints lack the role-check the plan committed to
**Files.** `packages/server/src/routes/artifacts.ts:244-381` — POST and both PATCH endpoints are mounted with no role check.
**Plan reference.** L3.md §5.1 table "Auth: required + role≥agent" on POST + both PATCH rows; §8 STRIDE row "Elevation: Viewer-role principal POSTs an artifact → Auth middleware enforces role ≥ agent on POST/PATCH".
**Found.** Auth is enforced by `authMiddleware` at `app.ts:245` (catch-all on `/api/*`) — but that only verifies the API key is present. There is no `requireRole("agent")` middleware on the artifact write routes, and no scan of the auth context for role. The route accepts any authenticated principal.
**Why major.** The plan named this as an explicit STRIDE mitigation. Without it, a viewer-role API key can write artifacts. Forward-compat: when human-role / viewer-role keys are introduced (track-G), today's tests for those won't catch this gap.
**Fix suggestion.** Verify whether `packages/server/src/middleware/auth.ts` exposes a role helper. If it does, wire `requireRole("agent")` per the plan. If not, file a follow-up — but mark the gap explicitly with a `// @lore L3 elevation-pending` block at the route definition so it is not forgotten.

---

### M4. Cross-tenant 404 isolation is NOT actually enforced — the test even admits it
**Files.** `packages/server/src/__tests__/artifacts-route.test.ts:296-305` — the cross-tenant test reads:
> "Without multi-tenant test seam we can't truly cross tenants, but the route must NEVER return 403 for a missing-or-foreign id; assert the status set is exactly {200, 404} for any id lookup."

The route in `routes/artifacts.ts:232-242` does `db.select(...).where(eq(artifacts.id, id))` with no tenant predicate.
**Plan reference.** L3.md §5.3 error-cases row "Cross-tenant fetch → 404 NOT_FOUND … Never 403 — do not leak existence"; §8 STRIDE Info-disclosure row "Fetch route applies the existing tenant-scope filter (joins tasks → bets → products → tenant). 404 (not 403) on cross-tenant lookups so existence does not leak"; §12 protected test `cross-tenant-isolation`: "Caller in tenant A fetches artifact id from tenant B → 404, NOT 200-empty or 403."
**Found.** No JOIN through tasks → bets → products → tenant. No tenant column on the DB schema (verified — `schema.ts:390-409` has no tenant_id). The test trivially passes because there are no two tenants in the test seed.
**Why major.** The plan committed an isolation pattern the codebase cannot honour today (no tenant column anywhere in the schema). This is an honest gap — multi-tenancy is genuinely not landed in this codebase. But the plan and the protected test both pretend it is. The drift here is between **plan claim** and **achievable defence given the current schema**.
**Fix suggestion.** Reconcile at the plan level. Two options:
- (A) Remove the cross-tenant claim from L3 and document it as a follow-up (add `L3-FU-7: cross-tenant artifact isolation`) once a tenant column lands. Update the protected test to assert "the test framework cannot prove cross-tenant isolation — track L3-FU-7."
- (B) If a tenant axis exists somewhere I missed (api-key-scoped tenant?), wire it into the artifact fetch and rewrite the test to actually create two tenant scopes.

Recommend (A) — clearer than asserting a non-functional invariant.

---

### M5. `unknown_kind` discriminant integrity drifts: the `RECOGNISED_KINDS` set was removed; the plan committed to "always normalise"
**Files.** `packages/server/src/routes/artifacts.ts:19, 134-158`.
**Plan reference.** L3.md §3.1 "the fetch route normalises any unrecognised value to `unknown_kind` before responding"; §10 Q2 ("closed at the wire, lenient at the column"); §12 protected test `unknown-kind-normalised`.
**Found.** The simplification scan M6 advocated dropping `RECOGNISED_KINDS`. The post-simplification code at line 19 keeps `RECOGNISED_KIND_VALUES = ARTIFACT_KINDS as readonly string[]` and uses `RECOGNISED_KIND_VALUES.includes(row.kind) && row.kind !== "unknown_kind"` at line 135. This works — but the test `normalises an unrecognised kind to unknown_kind with preview:null` at line 255 only seeds `kind: "internet_meme"`. There is no test for the case where the DB carries `kind: "unknown_kind"` directly (which the new check excludes from "recognised") — i.e. is `unknown_kind` itself considered recognised? Line 135 says no (`!== "unknown_kind"`), so a row stored with `kind: "unknown_kind"` is normalised to `unknown_kind` (idempotent — fine), but `preview` is forced null. If a future ingester writes `previewJson` alongside `kind: "unknown_kind"`, the preview is silently dropped.
**Why major (small).** Edge case but the data-integrity contract was load-bearing in §3.2 ("unknown_kind carries no preview"). Add a test for the `kind: "unknown_kind"` path explicitly.
**Fix suggestion.** Add to `artifacts-route.test.ts`: insert a row with `kind: "unknown_kind"` AND a non-null `previewJson` of any shape; assert the API returns `kind: "unknown_kind"`, `preview: null` (preview deliberately dropped per concept).

---

## MINORS (8)

### m1. `tasks_state_idx` lore comment in schema.ts:109 mentions migration `0006_drop_tasks_state_idx` but the L3 migration is `0007_dusty_maria_hill.sql`
File: `packages/db/src/schema.ts:109-110`. Pre-existing comment about a different migration; not L3-introduced. Mentioned only to flag that future agents may grep for "0006" and find both this and the L3 PG migration `0006_soft_epoch.sql` — minor naming collision.
**Fix.** Rename PG migration to a 0007 prefix to match SQLite, OR re-number SQLite to keep both at 0006 / 0007. The current state is internally consistent (each driver auto-numbers) but cross-driver greppability suffers. Defer.

### m2. The plan's Storybook arg-toggle for `cost-pending` (§17 ⚠️ UNVERIFIED) is unresolved
File: `packages/design-system/src/ArtifactCostChip.stories.tsx`. Plan §17 + §12 named this as an open question; the implementation just renders compact and full variants but not a toggle for the pending state.
**Fix.** Either land the arg-toggle or add a 5th explicit story for pending; remove the ⚠️ UNVERIFIED tag from the plan §17.

### m3. `useArtifacts` hook fetches via `useFetch` (good — slop-scan H1 applied) but does not include `cursor`/`limit` in the URL
File: `packages/web/src/hooks/useArtifacts.ts:7-13`. The plan's `ArtifactQuery` has `limit` + `cursor`; the hook ignores both. L12 will need them when the gallery surface paginates.
**Fix.** Extend `useArtifacts(filter, opts?: { limit?: number; cursor?: string })` and append to the URL params. Add a smoke test.

### m4. `ArtifactCostChip` compact variant hides tokens entirely
File: `packages/design-system/src/ArtifactCostChip.tsx:14-15` — `const showTokens = variant === "full" && cost.tokens !== null;`. This is intentional per the design (compact = money only), but the embed surface uses compact in a context where tokens are useful too. Cross-check with approved design §3 to ensure intent.
**Fix.** Confirm with design intent; if compact must show tokens too, drop the `variant === "full"` clause; otherwise document the rule in the component header.

### m5. `EM_DASH` constant deletion (slop-scan L3) was applied but inline `"—"` lives only in `ArtifactCostChip.tsx:14`. The slop-scan listed M5 with the same removal — consolidated. No issue; just confirms apply-review was selective and consistent.
No fix.

### m6. `costSettledAt` column populated on POST when `cost` is non-null (line 269) but **not** when settle is the second-stage PATCH
Wait — the PATCH cost path *does* set `costSettledAt: now` (line 360). False alarm. Removed.

### m7. `bigint` columns in PG schema are typed `integer` instead
Files: `packages/db/src/schema.pg.ts:387-391` — `costMoneyMicros: integer(...)`, `costTokensInput: integer(...)`, `costTokensOutput: integer(...)`. Plan §4.1 specifies `bigint` for PG (to absorb large micro-value sums and very large token counts).
**Why minor.** PG `integer` is 4-byte signed (max ~2.1 billion). $2,147 in micros = 2.1 billion micros — credible cap on a single artifact's cost over its lifetime, but token totals (input + output) for a long-running session can easily exceed 2 billion. Likely to wrap during a heavy training/eval workload.
**Fix.** Change PG schema to `bigint("...", { mode: "number" })` or `bigint("...", { mode: "bigint" })`. Regenerate migration. Same recommendation for SQLite is moot (SQLite `integer` is 64-bit by spec).

### m8. The plan's `producing_task_title` is documented as "denormalised — see Q3" (point-in-time at fetch). The implementation aligns. But the e2e fixture seeds task titles as literal "T" (one char) — make sure the visual stories show realistic task titles so visual-parity reviews catch font / truncation regressions.
File: `packages/server/src/__tests__/artifacts-route.test.ts:58` and the design-system stories. Stories should pass realistic titles.
**Fix.** Audit story fixtures; replace one-char placeholders with realistic strings ("Refactor auth middleware to support API-key plus session-cookie principals").

---

## Plan-vs-implementation drift summary

### Implemented but NOT planned
- `summarizePreview` and `artifactDisplayTitle` exported from shared (replacing `getArtifactViewProps`). Sensible refactor — but it conflicts with the plan's L11 forward-compat story (M2).

### Planned but NOT implemented
- ESLint rules `no-embed-chrome` and `closed-view-family` (B1).
- Service layer `createArtifact` / `settleArtifactPreview` / `settleArtifactCost` (B2).
- Event-bus emission of three artifact lifecycle events (B3).
- `ArtifactPermalink` route registration (M1).
- `getArtifactViewProps` + `ArtifactViewShape` types lift to shared (M2).
- `requireRole("agent")` on POST/PATCH (M3).
- Cross-tenant isolation as a real defence (M4).
- Storybook `cost-pending` arg-toggle (m2).

### Planned and implemented (correctly)
- Drizzle schema dual-driver SQLite + PG.
- FK `producing_task_id` → `tasks.id` ON DELETE RESTRICT.
- Indexes on `producing_task_id` and `created_at`.
- Closed `ARTIFACT_KINDS` literal union with `unknown_kind` catch-all.
- Discriminated-union Zod schema for `preview`.
- Preview / cost null-until-settled with race-safe SELECT-then-WHERE-NULL update.
- Limit cap (200) + default (50); cursor pagination shape.
- Wire-shape collapses precision-safe DB integers to display strings via `formatArtifactCost`.
- Eight DS components in the closed view family + the export-boundary protected test.
- Single `useFetch` hook (slop-scan H1 applied).

---

## Forward-compat status

### L1 (threads attach to artifacts)
**Status: ready.** The `threadCount: 0` constant is in place at `routes/artifacts.ts:155`; the `@lore L3 / L1 forward-compat` block at line 24 documents the future query shape. The forward-compat protected test at `artifacts-route.test.ts:204-213` asserts the type is always a number, never null. Once L1 ships `threads.attached_host_*`, the change is one query rewrite at `routes/artifacts.ts` and the forward-compat test continues to pass with non-zero counts.

### L4 (Money + TokenUsage)
**Status: ready.** DB stores precision-safe integers (`cost_money_micros`, `cost_tokens_input`, `cost_tokens_output`). Wire shape `ArtifactCostFromSession = { money: string | null; tokens: string | null }` is published in shared. The single chokepoint `formatArtifactCost` in `packages/shared/src/format/artifact-cost.ts:25-32` is the only place that translates DB → wire — when L4 ships, replace this function with the L4 type constructors. the canonical-shapes contracts under docs/ publishes the contract. **Watch-out: PG schema uses `integer` not `bigint` (m7); fix before L4 lands real workloads.**

### L11 (rich review messages embed artifact)
**Status: at risk.** The `ArtifactEmbed` component is built and exports a clean wire-shape. But the planned dispatch helper `getArtifactViewProps` was deleted in the simplification pass (M2). When L11 needs to render the 5 `ArtifactView` shapes inline, the dispatch layer must be re-introduced. Reinstate or update the plan to absorb this drift.

### L12 (Work surfaces consume gallery / stack / preview)
**Status: at risk.** The DS components are built. The `useArtifacts` hook is built but does not accept pagination params (m3). The aggregation routes work. The `ArtifactPermalink` page is **not registered** in the router (M1). L12 work surfaces will need: (a) router fix, (b) pagination on the hook, (c) the four placeholder L12 web pages from L3.md §5.4. None block L12 starting; all three are quick fixes.

---

## Files written / edited

- **Written.** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L3/docs/reviews/L3-architecture-review.md` (this file)
- **Edited.** None (read-only review per Step 10 contract).
