# AF16 — Architecture

L-complexity correctness + hygiene consolidation. Split into 6 sub-batches. Every listed Z8-* finding maps to a task (traceability matrix at the end). Reuses the existing `formatMoney` helper (L17/AF10) and the existing `workspace-reaper.ts` reaper pattern wired through `packages/fabric/src/bootstrap.ts`. **CLAUDE.md's BullMQ/Redis claim is FALSE — confirmed: no `bullmq`/`ioredis`/`redis`/`node-cron` dependency anywhere.** The real scheduler is in-process `setInterval` services under `packages/fabric/src/services/`.

## Required reading (for the builder)

- `plans/AF16/concept.md`, `plans/AF16/design/approved.md` — fixed inputs (the two UI treatments + non-design defer list).
- `packages/shared/src/format/money.ts` — `formatMoney(value)`; reuse, do not reinvent.
- `packages/fabric/src/services/workspace-reaper.ts` — canonical TTL reaper: `reapXOnce(db, opts)` + `startX(db, opts): () => void` disposer. The retention sweep mirrors this exactly.
- `packages/fabric/src/bootstrap.ts` — where periodic services are wired (lines 109, 127, 144).
- `packages/web/src/kinds/renderer-registry.ts` — `getRenderer(kind)` dispatch the artifact surface must reuse.
- `packages/server/src/routes/search.ts` + `packages/fabric/src/fts.ts` — search route + the existing `ts_rank` relevance pattern.

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| BullMQ/Redis job stack | **No such dependency.** Scheduler = `setInterval` services in `packages/fabric/src/services/`, wired in `bootstrap.ts`. | Retention reaper mirrors `workspace-reaper.ts`; doc batch deletes the false claim. |
| `file_leases` mechanism | Documented in `docs/architecture/components.md:95-96`; **no table, no code**. Confirmed by `vision-gap-audit.md` N7. | Doc batch removes the schema-doc claim. |
| "NaN%" bug location | `WorkBet.tsx:1222-1234` — guard tests object-truthiness, not `total>0`; `0/0=NaN`. | Batch (i) Task 1. |
| Image renders as "400×300" text | `ArtifactPreviewSurface.tsx` calls `summarize()` for all kinds, ignoring the per-kind `renderer-registry.ts`. | Batch (iv). |
| Broken breadcrumb to "non-existent route" | `to="/work"` in `WorkTask.tsx:242` + `WorkBet.tsx:1047`; router has no `/work` (only `/work/portfolio`...). `/work` → `*` → NotFound. | Batch (ii) Task 4. |
| Post-mutation stale routine list | `WorkTeam.tsx:476` `onCreated` only closes dialog; agent path (line 465) calls `refetchAgents()`, routine path has no refetch. | Batch (i) Task 3. |
| Search "arbitrary candidate set" / nondeterministic order | `search.ts`: LIKE candidates, `orderBy(desc(createdAt/updatedAt/lastActiveAt))` — recency only, **no stable tiebreaker** → equal-timestamp rows order nondeterministically; no relevance signal. | Batch (iii). |
| Observability "silently off" | `config.ts:64` `enabled = kv.get(...) === 'true'` → default **false**; channels only `console|noop`. | Batch (v) Task 14. |
| Retention tables | All 5 exist in `packages/db/src/schema.ts` with usable timestamp cols (verified below). No schema change needed. | Batch (vi). |
| Money formatting helper | `formatMoney` (`packages/shared/src/format/money.ts`) — already imported by WorkBet/WorkTeam/WorkTask/etc. | Reuse; batch (i) Task 2 audits any raw money/label rendering and routes it through `formatMoney`. |

Retention table timestamp columns (no migration needed):
- `login_sessions`: `expiresAt`, `revokedAt`, `createdAt` → prune where `expiresAt < now − TTL` OR `revokedAt < now − TTL`.
- `invite_codes`: `expiresAt`, `claimedBy`, `createdAt` → prune where `expiresAt < now − TTL` (expired) OR `claimedBy IS NOT NULL AND createdAt < now − TTL` (consumed).
- `notification_queue`: `status`, `createdAt`, `sentAt` → prune terminal (`status IN ('sent','failed','dropped')`) and `createdAt < now − TTL`.
- `knowledge_access_log`: `accessedAt` → prune where `accessedAt < now − TTL`.
- `propagation_log`: `status`, `createdAt`, `appliedAt` → prune terminal (`status IN ('applied','skipped')`) and `createdAt < now − TTL`.

---

## Sub-batch (i) — Work-surface display correctness

**Files:** `packages/web/src/pages/WorkBet.tsx`, `packages/web/src/pages/WorkTeam.tsx`, (audit) `WorkTask.tsx`, `WorkRoutine.tsx`, `WorkPortfolio.tsx`.

**Task 1 — Zero-task bet progress (design Treatment A).** In `WorkBet.tsx` stat card (~L1217-1236), branch on `total > 0` (compute `total = bet.progress?.total ?? 0`, `done = bet.progress?.done ?? 0`, `pct = clamp(round(done/total*100),0,100)`). `total>0` → `NN%` + bar at `pct`. `total===0` → "No tasks yet", no bar. Removes both NaN% string and the invalid-CSS full-bar.
- *Verify:* component test (`WorkBet.progress.test.tsx`) renders bet with `progress={done:0,total:0}` → asserts no "NaN", text "No tasks yet", no progress-bar element; and `progress={done:2,total:4}` → asserts "50%" + bar width style `50%`. (Z8-019, Z8-020.)

**Task 2 — Money/label formatting consistency.** Audit WorkBet/WorkTeam/WorkTask/WorkRoutine/WorkPortfolio for any money rendered without `formatMoney` (raw minor units, hardcoded `$`, or `.toFixed`) and any status/appetite label rendered raw. Route money through `formatMoney` (already imported). For appetite/status labels reuse the existing label maps already present in each page (e.g. `WorkBet.tsx` TaskState label map). No new helper.
- *Verify:* component test asserts a money cell renders `formatMoney(value)` output (e.g. `$12.00`) not a raw number; grep-based check is insufficient — assert rendered text. (Z8-085, Z8-086, Z8-087, Z8-089.)

**Task 3 — Post-mutation routine-list refresh.** In `WorkTeam.tsx`, the `useTeam` hook (`packages/web/src/hooks/useTeam.ts`) supplies `routines`. Add a `refetch` to `useTeam` (mirror `useTeamAgents.refetch` — a `fetchCount` bump trigger) and call it in `RoutineCreateDialog`'s `onCreated` (currently `WorkTeam.tsx:476` only closes). Same fix verified for the agent path already works (line 465).
- *Verify:* component/integration test: mount WorkTeam, create a routine via the dialog's onCreated, assert `useTeam` refetch fires and the new routine appears without remount. (Z8-128, Z8-129, Z8-130, Z8-131.)

---

## Sub-batch (ii) — Dead controls + broken navigation

**Files:** `packages/web/src/pages/WorkTask.tsx`, `WorkBet.tsx`, `KnowledgeDetail.tsx`, `WorkTeam.tsx`, plus a sweep across `packages/web/src/pages/**` and `components/**`.

**Task 4 — Broken breadcrumb route.** `WorkTask.tsx:242` and `WorkBet.tsx:1047` link `to="/work"`; router (`router.tsx`) has no `/work` route → NotFound. Retarget both to `/work/portfolio` (the real Work root). Audit all other `to=`/`navigate(...)` targets in pages against `router.tsx`'s route table (enumerated below).
- *Verify:* E2E (`AF16-breadcrumbs.spec.ts`) — open a task page, click the Work breadcrumb, assert URL = `/work/portfolio` and portfolio renders (not NotFound). Plus a unit test asserting every `to=` literal in pages matches a router path pattern. (Z8-046.)

**Task 5 — No-op / dead buttons sweep.** Enumerate every `<button>` and `role="button"` in `pages/**` + `components/**` lacking an `onClick`/`type="submit"`/form handler. For each: wire the intended action OR remove the control. Candidates already located: `KnowledgeDetail.tsx` (L380/395/404/690/698/746/768), `WorkTeam.tsx` (L314/631/680/741), `AgentAddDialog.tsx` (L198). (Many will be false positives — submit buttons inside forms; the test below distinguishes.)
- *Verify:* E2E per page: click every visible button, assert each causes a state change / navigation / network call (none is a silent no-op). Static lint-style unit test: no `<button>` in `pages/**` without an `onClick` or a `type` attribute. (Z8-066, Z8-067, Z8-068, Z8-069, Z8-070, Z8-113, Z8-114, Z8-115, Z8-117, Z8-118, Z8-120.)

**Task 6 — Small a11y/UX consistency fixes.** Apply the remaining audit nits (labels, focus, aria) co-located with the touched controls.
- *Verify:* component tests assert the specific aria/label per fix. (Z8-147–Z8-160 a11y subset, Z8-164, Z8-165.)

**Route checklist (breadcrumb/nav targets must match `router.tsx`):**
`/setup`, `/`, `/conversations`, `/conversations/:threadId`, `/conversations/review`, `/conversations/chat`, `/work/portfolio`, `/work/team/:teamId`, `/work/product/:productId` (redirect), `/work/routine/:routineId`, `/work/bet/:betId`, `/work/bet/:betId/task/:taskId`, `/agents/:agentId`, `/knowledge`, `/knowledge/new`, `/knowledge/:knowledgeId`, `/artifacts/:id`, `/settings` (redirect), `*` (NotFound). **There is NO `/work` route — any `to="/work"` is a defect.**

---

## Sub-batch (iii) — Search determinism + relevance

**File:** `packages/server/src/routes/search.ts`.

**Task 7 — Deterministic ordering.** Add a stable secondary sort key (`id` ASC) to all three category queries so equal-timestamp rows have a total order: bets `orderBy(desc(createdAt), asc(id))`; knowledge `orderBy(desc(updatedAt), asc(id))`; threads `orderBy(desc(lastActiveAt), asc(id))`. Eliminates nondeterministic candidate selection from the over-fetch + JS-cap path (the conversations over-fetch `limit(MAX*10)` then caps — make the over-fetch query itself ordered `desc(lastActiveAt), asc(threads.id)` so the cap is deterministic).
- *Verify:* integration test runs the same query twice against fixtures with tied timestamps; asserts identical ordered id lists both runs. (Z8-033.)

**Task 8 — Relevance awareness.** Bias ordering toward match quality, not pure recency. Minimal, boring approach (no new FTS dependency for the cross-category route): rank exact/prefix/word-boundary matches above mid-string substring matches via a computed match-rank column (`CASE WHEN title/description ILIKE 'query%' THEN 0 WHEN ILIKE '% query%' THEN 1 ELSE 2 END`), then order `(matchRank ASC, recency DESC, id ASC)`. Keeps three separate queries (AD7 contract) and stays deterministic.
- *Verify:* integration test: a query where an exact-title match is older than a substring match asserts the exact match ranks first. (Z8-033 relevance half.)

---

## Sub-batch (iv) — Artifact rendering per kind (design Treatment B)

**Files:** `packages/design-system/src/ArtifactPreviewSurface.tsx`, `packages/web/src/kinds/renderer-registry.ts` (+ renderers), `packages/design-system/src/ArtifactPreview.stories.tsx`.

**Design-it-twice — registry home (open question from approved.md):**
- **Option A (chosen): move `renderer-registry.ts` + the `*-renderer.tsx` components into `packages/design-system/src/kinds/`.** Trade-off: one-time move + import-path updates across `packages/web`. Reject reason for B: keeping the registry in `packages/web` forces design-system to either depend upward (forbidden) or accept an injected lookup prop on every call site — more coupling surface, permanent. The renderers ARE presentation primitives; co-locating them with the embodied surface collapses the duplicate text path. Migration cost is bounded (≈8 files), one-time. **Choose A.**
- Option B (rejected): inject `getRenderer` via prop. Permanent prop-threading; design-system stays renderer-blind; the second text path survives.

**Task 9 — Move renderer registry to design-system.** Relocate `renderer-registry.ts` and `{code,data,fallback,html,image,text,url}-renderer.tsx` (+ stories) from `packages/web/src/kinds/` to `packages/design-system/src/kinds/`. Re-export from `packages/design-system/src/index.ts`. Update all `packages/web` import sites (grep `from ".*kinds/`). `sharedFiles`: `packages/design-system/src/index.ts`.
- *Verify:* `npm run check` green; existing renderer tests pass at new path.

**Task 10 — Dispatch full-size surface through the registry.** In `ArtifactPreviewSurface.tsx`, when `size==="full"` and `preview` present, render `getRenderer(kind)` (image → `<img>`, etc.). Keep `size==="gallery"` on the `summarize()` text path (thumbnails stay summaries). Image dimension stays a caption under `<img>`, never the whole render.
- *Verify:* component test: `<ArtifactPreviewSurface kind="image" size="full" preview={{url,width:400,height:300}} />` asserts an `<img>` with that `src` renders (NOT the text "400 × 300" as the body). (Z8-026, Z8-027, Z8-028.)

**Task 11 — Honest no-preview affordance.** Replace `PlaceholderText` copy: `full` → "No preview available", `gallery` → "No preview". Shows on `preview == null` (registered or not). Keep existing chrome/tokens.
- *Verify:* component test: registered kind with `preview={null}` asserts text "No preview available", asserts strings "PREVIEW PENDING"/"PREVIEW NOT YET RENDERED" absent. (Z8-025-class honesty; Z8-026/027 fallback.)

**Task 12 — Stories.** Update `ArtifactPreviewSurface.stories.tsx` + `ArtifactPreview.stories.tsx` to cover image-with-preview, image-no-preview, code, unregistered-no-preview.
- *Verify:* stories render at `/designsystem`; `npm run ds:sync` within 5% threshold.

---

## Sub-batch (v) — Doc / naming hygiene

**Files:** `CLAUDE.md`, `docs/architecture/technology-summary.md`, `docs/architecture/components.md`, `docs/human-interface-layer/*`, `docs/product/*`, plus the observability config.

**Task 13 — False-claim removal.**
- CLAUDE.md Tech Stack line: remove "BullMQ"; replace with the truth: "in-process `setInterval` schedulers (`packages/fabric/src/services/`)". Same for `docs/architecture/technology-summary.md:40` (`pipeline` → BullMQ) and `components.md:140` ("optionally backed by BullMQ"). `technology-summary.md:11` already states the real scheduler (`setInterval + EventBus + SQLite polling`) in the "current" column — make the "future" column not read as present.
- Remove `file_leases` schema claim from `docs/architecture/components.md:95-96` and the FR mentions that describe it as a present mechanism (keep conceptual "file leases" prose only where clearly aspirational, or strike per `vision-gap-audit.md` N7 recommendation).
- *Verify:* lint-style unit test / ESLint doc rule: `CLAUDE.md` + `docs/architecture/**` contain no "BullMQ", "Redis", "file_leases" outside `docs/archive/**`. (Z8-091 false-claim portion, plus the BullMQ/file_leases AC.)

**Task 14 — Observability default.** `packages/server/src/services/observability/config.ts`: change the boot default so tracing is configured-on rather than silently off — `enabled` defaults `true` when unset (`kv.get(KEYS.enabled) !== "false"`) with `adapter` defaulting to `console` (a real, readable sink). Document that `noop` is the explicit opt-out, not the silent default.
- *Verify:* unit test on `buildConfig`: empty kv map → `enabled === true`, `adapter === "console"`; `{enabled:"false"}` → disabled. (Z8-100.)

**Task 15 — Banned-term purge (Rail / CoC / coach-as-role).** Purge HyperIdle-concept "Rail" and "CoC/Chief of Staff/coach" (role) from non-archive docs and any live UI strings/component names. Notes: (a) `docs/archive/**` is historical — leave OR strip per existing `@lore AD8a` convention already applied inline; (b) generic-English "coach"/"chief of staff" already annotated `@lore AD8a` as legit may stay; (c) `CocOverlay.tsx` / `CocAttachButton` component names + the `agent-coc` test fixtures are the half-landed rename — complete `Coc*`→`Assistant*` where AF14/AD8b hasn't (coordinate: if AD8b owns the overlay rename, scope AF16 to docs + non-overlay strings to avoid collision — see Risk R2).
- *Verify:* lint-style unit test: no banned-concept "Rail"/"CoC"/"Chief of Staff" (role sense) in `docs/**` (excluding `archive/`) and no `Coc`/`Rail` identifier in `packages/web/src/**` except annotated `@lore` historical comments. (Z8-091 banned-term portion.)

---

## Sub-batch (vi) — Retention / TTL sweep

**New file:** `packages/fabric/src/services/retention-reaper.ts` (mirrors `workspace-reaper.ts`). **Wire:** `packages/fabric/src/bootstrap.ts`.

**Task 16 — Retention reaper.** Implement `reapRetentionOnce(db, opts): Promise<{ table: string; deleted: number }[]>` deleting expired/terminal rows from the 5 tables per the TTL rules above (Drizzle `delete().where(...)`, never raw SQL). Add `startRetentionReaper(db, opts): () => void` with `RETENTION_REAPER_INTERVAL_MS` (recommend 6h) returning a disposer — exact shape of `startWorkspaceReaper`. Defaults: login-session/invite TTL = `LOGIN_SESSION_TTL_MS`/`INVITE_CODE_TTL_MS` grace + buffer (already in `packages/shared/src/auth.ts`); access-log/propagation/notification terminal TTL = 30d (config constant).
- *Verify:* integration test (`retention-reaper.integration.test.ts`): seed expired + fresh rows in each table, run `reapRetentionOnce`, assert expired deleted and fresh retained; assert FK-restricted rows (`invite_codes.createdBy` RESTRICT) handled (only prune rows safe to delete). (Z8-097.)

**Task 17 — Wire into bootstrap.** In `bootstrap.ts`, `disposers.push(startRetentionReaper(db, {}))` alongside `startWorkspaceReaper`/`startNotificationDrain`. Add a `@lore` noting this is the in-process scheduler (not BullMQ).
- *Verify:* integration test asserts bootstrap returns a disposer that stops the interval; (covered by existing bootstrap disposer test pattern). `sharedFiles`: `packages/fabric/src/bootstrap.ts`.

---

## Type signatures / contracts

```ts
// packages/fabric/src/services/retention-reaper.ts
export const RETENTION_REAPER_INTERVAL_MS = 6 * 60 * 60 * 1000;
export interface RetentionReaperOptions {
  readonly now?: () => number;            // injectable clock (tests)
  readonly terminalLogTtlMs?: number;     // access/propagation/notification, default 30d
}
export interface RetentionSweepResult { readonly table: string; readonly deleted: number; }
export function reapRetentionOnce(db: HyperIdleDb, opts?: RetentionReaperOptions): Promise<RetentionSweepResult[]>;
export function startRetentionReaper(db: HyperIdleDb, opts?: RetentionReaperOptions): () => void;

// packages/design-system/src/kinds/renderer-registry.ts (moved)
export function getRenderer(kind: string): ComponentType<RendererProps>;

// WorkBet progress (web) — no exported type change; pure render branch.
// search.ts — no signature change; ORDER BY clauses + match-rank CASE only.
// observability/config.ts buildConfig — same signature; default flip only.
```

No DB schema/migration change in this WP (retention reuses existing columns). `npm run db:generate` not required.

## Security & abuse cases

- **Retention reaper** — deletes rows: confine to TTL/terminal predicates via Drizzle; never delete RESTRICT-referenced rows (invite_codes.createdBy). No external input. **Addressed.**
- **Search ordering/relevance** — `match-rank CASE` uses the already-escaped `pattern` (`escapeLikePattern`); no new injection surface; query-length cap (200) unchanged. **Addressed.**
- **Artifact renderer dispatch** — `ImageRenderer` renders `<img src={preview.url}>`; preview URLs are agent-authored. Confirm existing SSRF/sanitization on artifact preview ingest (out of AF16 scope — ingest owned elsewhere); AF16 adds no new outbound fetch, only renders an existing `src`. **N/A (no new boundary); flag if ingest sanitization absent.**
- **Observability default-on** — `console` adapter writes via the structured logger (no `console.log`); no secret fields in current `ObservabilityConfig`. **Addressed.**
- Rate-limit / path-traversal / new-credential — **N/A** (no new POST/PATCH, no path input, no credential surface).

## Migrations (symbol moves)

- **Move** `packages/web/src/kinds/{renderer-registry,*-renderer}.tsx` → `packages/design-system/src/kinds/`. Call sites to update: any `from "../kinds/..."`/`from "./kinds/..."` in `packages/web/src/**` (grep before move); their `.stories.tsx`; design-system `index.ts` re-export. (delete old path / rename imports.)
- **Reroute** `to="/work"` → `to="/work/portfolio"` in `WorkTask.tsx`, `WorkBet.tsx`. (reroute.)
- **Rename** (conditional, see R2) `Coc*` identifiers → `Assistant*` only if not owned by a concurrent overlay-rename WP.

## protectedTests
- `packages/shared/src/__tests__/money.test.ts` (formatMoney contract — must not change).
- `packages/server/src/routes/__tests__/*search*` existing assertions on result shape (ordering tests are additive).
- `packages/fabric/src/services/__tests__/af7-workspace-reaper.integration.test.ts` (reaper pattern reference).

## sharedFiles
- `packages/db/src/schema.ts` (read-only here, but other WPs may touch — no AF16 change).
- `packages/fabric/src/bootstrap.ts` (Task 17).
- `packages/design-system/src/index.ts` (Task 9 re-export).
- `packages/web/src/router.tsx` (read-only — verify only, no change).
- `CLAUDE.md` (Task 13).

## Risks / open questions for the reviewer

- **R1 — Dead-button sweep breadth.** Z8-066–120 span many buttons; some are legitimate form-submit buttons (no `onClick` by design). The "every button does something" test must not flag `type="submit"` inside a `<form>`. Risk of over-removal. Mitigate: classify before removing; prefer wiring over deleting where intent is obvious.
- **R2 — Overlay-rename collision.** The `Coc*`→`Assistant*` component rename is half-landed and may be owned by a concurrent overlay WP (AF14/AD8b per docs). If so, AF16 scopes Task 15 to **docs + non-overlay UI strings only** to avoid two WPs editing `CocOverlay.tsx`. Reviewer to confirm ownership boundary.
- **R3 — Search relevance scope.** Task 8 uses a `CASE`-based match-rank, deliberately NOT the Postgres FTS `ts_rank` path (that exists only for `knowledge_items.fts_vector`). If reviewer wants true FTS relevance across all three categories, that's a larger change (per-category tsvector columns) — out of AF16's hygiene scope; flag if the AC demands it.
- **R4 — Observability default-on noise.** Flipping `enabled` default to true makes the `console` adapter emit at boot for fresh DBs. Confirm this is desired ("tracing configured rather than silently off") vs. emitting too much — `noop` remains the explicit opt-out.
- **R5 — Retention TTL values.** 6h cadence / 30d terminal-log TTL are recommendations, not spec-pinned. Reviewer to confirm before they become load-bearing.

## Z8-finding → task traceability

| Finding(s) | Task |
|---|---|
| Z8-019, Z8-020 | T1 (NaN% progress) |
| Z8-021 | T1 (misleading bar) |
| Z8-026, Z8-027, Z8-028 | T10, T11 (artifact image-as-text + no-preview) |
| Z8-033 | T7, T8 (search determinism + relevance) |
| Z8-046 | T4 (breadcrumb /work 404) |
| Z8-066–070, Z8-113–120 | T5 (dead buttons) |
| Z8-085, Z8-086, Z8-087, Z8-089 | T2 (money/label formatting) |
| Z8-091 | T13 (false claims) + T15 (banned terms) |
| Z8-097 | T16, T17 (retention sweep) |
| Z8-100 | T14 (observability default) |
| Z8-125 | T5/T6 (control/consistency) |
| Z8-128, Z8-129, Z8-130, Z8-131 | T3 (post-mutation refresh) |
| Z8-147–152, Z8-154–158, Z8-160, Z8-164, Z8-165 | T6 (a11y/UX consistency), T5 where button-related |
| Z8-117, Z8-118, Z8-120 | T5 (no-op controls) |

Every Z8-* finding in the AF16 spec line maps to at least one task; none dropped.
