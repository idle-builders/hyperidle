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
| BullMQ/Redis job stack | **No such dependency.** Scheduler = `setInterval` services in `packages/fabric/src/services/`, wired in `bootstrap.ts`. | Retention reaper mirrors `workspace-reaper.ts`; T13 removes/reframes the **present-tense** BullMQ/Redis claims, leaves clearly-future/cloud-profile mentions (present-tense-only rule — see T13). |
| `file_leases` mechanism | Documented in `docs/architecture/components.md:95-96`; **no table, no code**. Confirmed by `vision-gap-audit.md` N7. | Doc batch removes the schema-doc claim. |
| "NaN%" bug location | `WorkBet.tsx:1222-1234` — guard tests object-truthiness, not `total>0`; `0/0=NaN`. | Batch (i) Task 1. |
| Image renders as "400×300" text | `ArtifactPreviewSurface.tsx` calls `summarize()` for all kinds, ignoring the per-kind `renderer-registry.ts`. | Batch (iv). |
| Broken breadcrumb to "non-existent route" | `to="/work"` in `WorkTask.tsx:242` + `WorkBet.tsx:1047`; router has no `/work` (only `/work/portfolio`...). `/work` → `*` → NotFound. | Batch (ii) Task 4. |
| Post-mutation stale routine list | `WorkTeam.tsx:476` `onCreated` only closes dialog; agent path (line 465) calls `refetchAgents()`, routine path has no refetch. | Batch (i) Task 3. |
| Search "arbitrary candidate set" / nondeterministic order | `search.ts`: LIKE candidates, `orderBy(desc(createdAt/updatedAt/lastActiveAt))` — recency only, **no stable tiebreaker** → equal-timestamp rows order nondeterministically; no relevance signal. | Batch (iii). |
| Observability "silently off" | `config.ts:64` `enabled = kv.get(...) === 'true'` → default **false**; channels only `console|noop`. | Batch (v) Task 14. |
| Retention tables | All 5 exist in `packages/db/src/schema.ts` with usable timestamp cols (verified below). No schema change needed. | Batch (vi). |
| Money formatting helper | `formatMoney` (`packages/shared/src/format/money.ts`) — already imported by WorkBet/WorkTeam/WorkTask/etc. | Reuse; batch (i) Task 2 audits any raw money/label rendering and routes it through `formatMoney`. |

Retention prune predicate per table (resolves WARNING-3 — EXACT predicates, no migration needed). **Storage note:** these timestamp cols are `text` ISO-8601 strings (verified in `schema.ts`), so the reaper computes the cutoff as an ISO string (`new Date(now − ttl).toISOString()`) and compares lexically with Drizzle `lt(col, cutoffIso)` — ISO-8601 sorts lexically = chronologically. `now` comes from the injectable `opts.now`. Two predicate shapes: **expiry-based** (the row carries an `expiresAt`; prune once it is past, no extra window) and **age-based** (no natural expiry; prune `terminal/consumed` rows older than a configured TTL). A `0`/optional grace window (`expiredGraceMs`, default `0`) may be added for the expiry tables only, to avoid racing an in-flight request — but the DEFAULT is `expiresAt < now` (no extra TTL retention).

- `login_sessions` (**expiry-based**): cols `expiresAt`, `revokedAt`. Prune where `expiresAt < now − expiredGraceMs` (expired) OR `revokedAt IS NOT NULL AND revokedAt < now − expiredGraceMs` (revoked). Default `expiredGraceMs = 0` → `expiresAt < now`. **NOT** `expiresAt < now − TTL` (that would retain expired rows a full TTL too long — the bug WARNING-3 flagged).
- `invite_codes` (**expiry-based + age-based for consumed**): cols `expiresAt`, `claimedBy`, `createdAt`, `createdBy` (RESTRICT). Prune where `expiresAt < now − expiredGraceMs` (expired, unclaimed) OR `claimedBy IS NOT NULL AND createdAt < now − consumedInviteTtlMs` (consumed, keep a short audit window). Skip rows where deletion would violate the `createdBy` RESTRICT FK (only prune rows whose FK targets still permit delete — invite rows are leaf rows, so safe; verified in test).
- `notification_queue` (**age-based, terminal-only**): cols `status`, `createdAt`. Prune where `status IN ('sent','failed','dropped') AND createdAt < now − terminalLogTtlMs`.
- `knowledge_access_log` (**age-based**): col `accessedAt`. Prune where `accessedAt < now − terminalLogTtlMs`.
- `propagation_log` (**age-based, terminal-only**): cols `status`, `createdAt`. Prune where `status IN ('applied','skipped') AND createdAt < now − terminalLogTtlMs`.

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
- *Verify:* E2E per page: click every visible button, assert each causes a state change / navigation / network call (none is a silent no-op). Static lint-style unit test (tightened per WARNING-1 — the AC says "no button is a no-op", so `type="button"` with no handler is a finding, not a pass): a `<button>` (or `role="button"`) in `pages/**`+`components/**` is a **finding** UNLESS it satisfies one of:
  - (a) has an `onClick` prop, OR
  - (b) has `type="submit"` AND is lexically inside a `<form>` that has an `onSubmit` handler (the form's submit handler IS its action), OR
  - (c) has a non-static handler that the lint rule recognizes as an action: a `formAction`, or it is the trigger child of a known headless control (`<MenuButton>`/`Disclosure`/`Popover.Button` etc. — enumerate the project's wrappers) where the action lives on the parent.
  Specifically: a bare `<button type="button">` with no `onClick` (and not case (c)) **fails** — this is the real no-op the old rule let through. A `<button>` with neither `onClick` nor `type` **fails**. A `<button type="submit">` NOT inside an `onSubmit` form **fails** (dangling submit). The rule is an ESLint custom rule / AST unit test over the JSX (not a grep), so it can resolve the enclosing `<form onSubmit=...>` ancestry for case (b). (Z8-066, Z8-067, Z8-068, Z8-069, Z8-070, Z8-113, Z8-114, Z8-115, Z8-117, Z8-118, Z8-120.)

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

**Task 9 — Move renderer registry to design-system.** Relocate `renderer-registry.ts`, `{code,data,fallback,html,image,text,url}-renderer.tsx`, AND their `.stories.tsx` (7 story files) from `packages/web/src/kinds/` to `packages/design-system/src/kinds/`. Re-export from `packages/design-system/src/index.ts`. Update all `packages/web` import sites (grep `from ".*kinds/`). The existing renderer tests at the OLD path move with the renderers (their assertions must survive unchanged — see protectedTests). `sharedFiles`: `packages/design-system/src/index.ts`.
- *Verify:* `npm run check` green; existing renderer tests pass at new path; story-sync baseline unchanged (the moved stories must render identically — `npm run ds:sync` within threshold).

**Task 10 — Dispatch full-size surface through the registry (with `alt`).** In `ArtifactPreviewSurface.tsx`, when `size==="full"` and `preview` present, render `getRenderer(kind)` (image → `<img>`, etc.) inside an error boundary (see Task 11). Keep `size==="gallery"` on the `summarize()` text path (thumbnails stay summaries). Image dimension stays a caption under `<img>`, never the whole render. The `<img>` `alt` is inherited from `ImageRenderer` (`preview.alt ?? "${w}×${h} image"`, `image-renderer.tsx:21`) — routing the permalink through the registry must preserve it.
- *Verify:* component test: (a) `<ArtifactPreviewSurface kind="image" size="full" preview={{url,width:400,height:300}} />` asserts an `<img>` with that `src` renders (NOT the text "400 × 300" as the body). (b) **WARNING-4 alt assertion:** the rendered `<img>` has a non-empty `alt` attribute; with `preview.alt="My chart"` the `alt` is exactly "My chart" (title-sourced, not dimensional); with no `alt` provided it falls back to a non-empty dimensional string. (Z8-026, Z8-027, Z8-028.)

**Task 11 — Honest no-preview affordance + error/malformed fallback.** Replace `PlaceholderText` copy: `full` → "No preview available", `gallery` → "No preview". Wrap the Task 10 `getRenderer` dispatch in an error boundary whose fallback renders this SAME affordance. The affordance shows on: `preview == null` (registered or not); a renderer that **throws**; a non-null but **malformed** preview the renderer can't paint (WARNING-4 — null/error/bad all collapse to one honest affordance, no separate error chrome). Keep existing chrome/tokens.
- *Verify:* component test, four assertions:
  - registered kind with `preview={null}` → text "No preview available"; strings "PREVIEW PENDING"/"PREVIEW NOT YET RENDERED" absent.
  - **WARNING-4 error branch:** stub/register a kind whose renderer throws on a non-null preview → the surface renders "No preview available" (error boundary caught it), does NOT crash the tree, and shows no broken/partial render.
  - **WARNING-4 malformed branch:** `kind="image"` with `preview={{ }}` (no `url`) → "No preview available", no `<img>` with empty `src`.
  - gallery size, `preview={null}` → "No preview". (Z8-026/027 fallback honesty.)

**Task 12 — Stories.** Update `ArtifactPreviewSurface.stories.tsx` + `ArtifactPreview.stories.tsx` to cover image-with-preview, image-no-preview, code, unregistered-no-preview.
- *Verify:* stories render at `/designsystem`; `npm run ds:sync` within 5% threshold.

---

## Sub-batch (v) — Doc / naming hygiene

**Files:** `CLAUDE.md`, `docs/architecture/technology-summary.md`, `docs/architecture/components.md`, `docs/architecture/deployment-architecture.md` (line 50 — added per WARNING-2), `docs/human-interface-layer/*`, `docs/product/*`, plus the observability config.

**Task 13 — False-claim removal.**

**Rule semantics (resolves WARNING-2): ban present-tense FALSE claims, not aspirational future/optional mentions.** AC-6 forbids "false claims … that the audit disproved" — a claim is false only when it states present infrastructure that does not exist. A clearly-future/optional column ("VPS/cloud profile: optionally backed by BullMQ") is not a false claim; forcing its deletion would degrade the docs and is outside AC-6. So the lint rule must distinguish present-tense claims from future/optional ones. Making that distinction robustly in a lint rule is hard, so we make the rule **trivially satisfiable by editing the present-tense lines and leaving the future/optional lines in a form the rule explicitly allows** (see the rule definition below). **Exact edit list (every present-tense false claim — the rule asserts each of these strings is gone or reframed):**

1. **`CLAUDE.md` Tech Stack line** — remove "BullMQ" from the present-tense stack list; replace with the truth: "in-process `setInterval` schedulers (`packages/fabric/src/services/`)".
2. **`docs/architecture/technology-summary.md:40`** — row `| `pipeline` | Infra | Async job execution (BullMQ) |` claims BullMQ as a present component. Reword to the real mechanism: `Async job execution (in-process `setInterval` services)`.
3. **`docs/architecture/technology-summary.md:10-11`** — these are the **future column** (`Redis pub/sub or NATS`, `BullMQ / Temporal`). The lint rule is line-scoped, so the future marker must appear **on the same line** as the token: prefix each future-column cell so the row reads e.g. `| Scheduler | setInterval + EventBus + SQLite polling | _Future candidate:_ BullMQ / Temporal |`. The inline `Future candidate:` marker on the same line satisfies the future-allow predicate. No claim removal.
4. **`docs/architecture/components.md:140`** — "optionally backed by BullMQ for distributed job scheduling." Reword to make the conditional unmistakably future: "for VPS/cloud profiles, a distributed scheduler (candidate: BullMQ or Temporal) **could** back this; not used today." (keeps the name in an explicitly-future sentence).
5. **`docs/architecture/components.md:247`** — "Redis pub/sub or NATS … for cloud profiles that need distributed event delivery." Already future-framed; leave, ensuring the sentence retains its "For cloud profiles" lead so the future-allow predicate matches.
6. **`docs/architecture/deployment-architecture.md:50`** — `├── Redis (Event Bus, optional)` inside the cloud-topology diagram. This is in `docs/architecture/**` scope and WAS missing from the list (WARNING-2). Reword to `├── Redis or NATS (Event Bus — cloud profile only, not used on laptop/VPS)` so it reads as a profile option, or strike it if the diagram is the laptop profile. (The rule's future-allow predicate must match this line — it carries "cloud profile only".)
7. **`file_leases`** — remove the schema claim from `docs/architecture/components.md:95-96` and any FR mentions that describe it as a **present** mechanism. There is no future/optional defense for `file_leases` (no table, no plan) — strike entirely per `vision-gap-audit.md` N7. Absolute ban on the `file_leases` token outside archive.

- *Verify:* lint-style unit test / ESLint doc rule over `CLAUDE.md` + `docs/architecture/**` (excluding `docs/archive/**`), two predicates:
  - **`file_leases`** — absolute ban: zero occurrences (no false/future distinction; it never existed).
  - **`BullMQ` / `Redis`** — present-tense ban: a line containing the token **fails** UNLESS the line (or its table column header) is marked future/optional via the allow-list of markers the rule recognizes: `Future`, `cloud profile`, `cloud-profile`, `VPS/cloud`, `candidate`, `could back`, `not used today`, `planned`, `optional` paired with one of the former. Every line in the edit list above is rewritten to contain such a marker (or removed), so the rule passes on AF16's produced tree. Present-tense claims (lines 1, 2 stack/infra rows) remove the token entirely. (Z8-091 false-claim portion, plus the BullMQ/file_leases AC.)

**Task 14 — Observability default.** `packages/server/src/services/observability/config.ts`: change the boot default so tracing is configured-on rather than silently off — `enabled` defaults `true` when unset (`kv.get(KEYS.enabled) !== "false"`) with `adapter` defaulting to `console` (a real, readable sink). Document that `noop` is the explicit opt-out, not the silent default.
- *Verify:* unit test on `buildConfig`: empty kv map → `enabled === true`, `adapter === "console"`; `{enabled:"false"}` → disabled. (Z8-100.)

**Task 15 — Banned-term purge (Rail / CoC / coach-as-role) — DOCS ONLY.** Purge the HyperIdle-concept nouns "Rail" and "CoC/Chief of Staff/coach" (role sense) from **non-archive `docs/**` only**. AF16's AC-6 is explicitly documentation-scoped ("Project documentation contains no banned terms (Rail, CoC)"), and AC-2's control sweep is the only UI surface AF16 owns.

**Scope decision (resolves R2 / CRITICAL).** The `Coc*`→`Assistant*` **component rename is NOT in AF16's scope** — it is owned by **AF14** (TRACK-AF.md:561: *"Resolve the half-landed `CocOverlay`→`AssistantOverlay` rename"*; AF14 closes the conversation/overlay findings Z8-103–112) and was originated by **AD8b** ("Assistant Agent + Overlay"; the `AD8b-Assistant*.test.tsx` files are on disk). The duplicates `CocOverlay.tsx`+`AssistantOverlay.tsx`, `CocContext.tsx`+`AssistantContext.tsx`, `CocAttachButton.tsx`+`AssistantAttachButton.tsx` (plus `useCocThread.ts`/`useAssistantThread.ts` and `Coc*` test files) all coexist; deleting the dead `Coc*` half is AF14's job (the wrong overlay is still *mounted*, which AF14 swaps). AF16 must NOT touch these files or it collides with AF14 on the same tree.

**No live UI-string work for AF16.** Audited `packages/web/src/**` for word-boundary `\brail\b`/`\bcoc\b`/`chief of staff`: every non-`Coc*`-component hit is a code comment, `@lore` annotation, animation-keyframe name (`coc-open`), `data-testid` migration note, or a WS topic literal — **zero user-facing banned-term strings** outside the AF14-owned component files. So AF16's purge is genuinely docs-only; there is nothing for AF16 to change in `packages/web/src/**`.

Notes: (a) `docs/archive/**` is historical — excluded from the rule; (b) generic-English "coach"/"chief of staff" annotated `@lore AD8a` as legit may stay (the rule targets the HyperIdle-concept noun, see verify scoping below).

- *Verify:* lint-style unit test scoped to **`docs/**` excluding `docs/archive/**`** (NOT `packages/web/src/**`): no HyperIdle-concept "Rail" / "CoC" / "Chief of Staff" (role sense) token. To avoid false positives on legit `@lore AD8a`-annotated lines, the rule excludes any line containing `@lore` or matching the allow-list of generic-English usages enumerated in the test. The rule does **not** scan `packages/web/src/**` (that tree retains `Coc*` files until AF14 lands, so a blanket web scan would self-fail — which is exactly the CRITICAL the reviewer caught). (Z8-091 banned-term portion.)

---

## Sub-batch (vi) — Retention / TTL sweep

**New file:** `packages/fabric/src/services/retention-reaper.ts` (mirrors `workspace-reaper.ts`). **Wire:** `packages/fabric/src/bootstrap.ts`.

**Task 16 — Retention reaper.** Implement `reapRetentionOnce(db, opts): Promise<{ table: string; deleted: number }[]>` deleting expired/terminal rows from the 5 tables per the EXACT predicates above (Drizzle `delete().where(...)`, never raw SQL). Add `startRetentionReaper(db, opts): () => void` with `RETENTION_REAPER_INTERVAL_MS` (recommend 6h) returning a disposer — exact shape of `startWorkspaceReaper`.

**Predicate/TTL pinning (resolves WARNING-3).** Expiry-based tables (`login_sessions`, `invite_codes` expired branch) prune at `expiresAt < now − expiredGraceMs` with `expiredGraceMs` defaulting to **`0`** — i.e. as soon as expired, NOT after an extra TTL window. The expiry timestamps are already written by auth using `LOGIN_SESSION_TTL_MS`/`INVITE_CODE_TTL_MS` (`packages/shared/src/auth.ts`) at row creation, so the reaper does NOT re-apply those TTLs — it only reads `expiresAt`. Age-based tables (`notification_queue`, `knowledge_access_log`, `propagation_log`, and the consumed-`invite_codes` audit window) prune at `createdAt/accessedAt < now − <ttl>` where the ttl comes from the options interface (`terminalLogTtlMs` default 30d; `consumedInviteTtlMs` default 30d). All TTLs are named config constants, not magic numbers.

- *Verify:* integration test (`retention-reaper.integration.test.ts`) with injected `now`: (a) seed a login session with `expiresAt = now − 1ms` → asserts deleted (NOT retained for a TTL window — the WARNING-3 regression guard); seed `expiresAt = now + 1h` → retained. (b) seed a terminal `notification_queue` row at `createdAt = now − 31d` → deleted; at `now − 29d` → retained (boundary on `terminalLogTtlMs`). (c) seed a non-terminal `notification_queue`/`propagation_log` row past the TTL → RETAINED (terminal-only predicate). (d) seed a consumed invite past `consumedInviteTtlMs` → deleted; an unclaimed expired invite → deleted; an unclaimed unexpired invite → retained. (e) assert FK-restricted rows (`invite_codes.createdBy` RESTRICT) are handled — only prune rows safe to delete. (Z8-097.)

**Task 17 — Wire into bootstrap.** In `bootstrap.ts`, `disposers.push(startRetentionReaper(db, {}))` alongside `startWorkspaceReaper`/`startNotificationDrain`. Add a `@lore` noting this is the in-process scheduler (not BullMQ).
- *Verify:* integration test asserts bootstrap returns a disposer that stops the interval; (covered by existing bootstrap disposer test pattern). `sharedFiles`: `packages/fabric/src/bootstrap.ts`.

---

## Type signatures / contracts

```ts
// packages/fabric/src/services/retention-reaper.ts
export const RETENTION_REAPER_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const TERMINAL_LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30d
export const CONSUMED_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d audit window
export interface RetentionReaperOptions {
  readonly now?: () => number;            // injectable clock (tests); default Date.now
  // Expiry-based tables prune at `expiresAt < now − expiredGraceMs` (NOT now − TTL).
  readonly expiredGraceMs?: number;       // login_sessions / invite_codes expired branch, default 0
  // Age-based tables prune at `createdAt/accessedAt < now − <ttl>`.
  readonly terminalLogTtlMs?: number;     // notification_queue / knowledge_access_log / propagation_log, default 30d
  readonly consumedInviteTtlMs?: number;  // invite_codes consumed (claimedBy set) audit window, default 30d
}
export interface RetentionSweepResult { readonly table: string; readonly deleted: number; }
export function reapRetentionOnce(db: HyperIdleDb, opts?: RetentionReaperOptions): Promise<RetentionSweepResult[]>;
export function startRetentionReaper(db: HyperIdleDb, opts?: RetentionReaperOptions): () => void;

// packages/design-system/src/kinds/renderer-registry.ts (moved — keep the existing real type name `RendererComponent`, not `ComponentType<RendererProps>`)
export function getRenderer(kind: string): RendererComponent;

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
- **No `Coc*`→`Assistant*` rename in AF16** — owned by AF14 (see R2). AF16 touches no `packages/web/src/**` file for the banned-term purge; docs-only.

## protectedTests
- `packages/shared/src/__tests__/money.test.ts` (formatMoney contract — must not change).
- `packages/server/src/routes/__tests__/*search*` existing assertions on result shape (ordering tests are additive).
- `packages/fabric/src/services/__tests__/af7-workspace-reaper.integration.test.ts` (reaper pattern reference).
- Existing renderer tests + the `ArtifactPreviewSurface`/`ArtifactPreview` story-sync baseline — these move with Task 9 and their assertions must survive the path move UNCHANGED (the move is a relocation, not a behavior change).

## sharedFiles
- `packages/db/src/schema.ts` (read-only here, but other WPs may touch — no AF16 change).
- `packages/fabric/src/bootstrap.ts` (Task 17).
- `packages/design-system/src/index.ts` (Task 9 re-export).
- `packages/web/src/router.tsx` (read-only — verify only, no change).
- `CLAUDE.md` (Task 13).

## Risks / open questions for the reviewer

- **R1 — Dead-button sweep breadth.** Z8-066–120 span many buttons; some are legitimate form-submit buttons (no `onClick` by design). The tightened T5 rule (WARNING-1) passes `type="submit"` only when inside an `onSubmit` form, and flags bare `type="button"` with no handler as the real no-op. Risk of over-removal mitigated: classify before removing; prefer wiring over deleting where intent is obvious; case (c) exempts headless-control trigger children whose action lives on the parent.
- **R2 — Overlay-rename collision — RESOLVED.** The `Coc*`→`Assistant*` component rename is owned by **AF14** (TRACK-AF.md:561 explicitly: "Resolve the half-landed `CocOverlay`→`AssistantOverlay` rename") and originated by **AD8b** ("Assistant Agent + Overlay"; `AD8b-Assistant*.test.tsx` on disk). AF16 therefore scopes Task 15 to **`docs/**` only**, touches **no** `packages/web/src/**` file, and its verify lint rule is scoped to `docs/**` (excluding archive) — NOT a blanket web-tree scan (which would self-fail while AF14-owned `Coc*` files still exist). Audit confirmed zero live banned-term UI strings outside the AF14-owned component files. No collision; no self-failing rule.
- **R3 — Search relevance scope.** Task 8 uses a `CASE`-based match-rank, deliberately NOT the Postgres FTS `ts_rank` path (that exists only for `knowledge_items.fts_vector`). If reviewer wants true FTS relevance across all three categories, that's a larger change (per-category tsvector columns) — out of AF16's hygiene scope; flag if the AC demands it.
- **R4 — Observability default-on noise.** Flipping `enabled` default to true makes the `console` adapter emit at boot for fresh DBs. Confirm this is desired ("tracing configured rather than silently off") vs. emitting too much — `noop` remains the explicit opt-out.
- **R5 — Retention TTL predicates — PINNED.** Per WARNING-3: expiry-based tables (`login_sessions`, `invite_codes` expired branch) prune at `expiresAt < now − expiredGraceMs`, `expiredGraceMs` default `0` (prune as soon as expired — NOT `now − TTL`, which would over-retain). Age-based tables prune at `createdAt/accessedAt < now − terminalLogTtlMs` (30d) / `consumedInviteTtlMs` (30d). 6h cadence. All exposed as named constants/options (`RETENTION_REAPER_INTERVAL_MS`, `TERMINAL_LOG_TTL_MS`, `CONSUMED_INVITE_TTL_MS`, `expiredGraceMs`). The integration test asserts the expiry-vs-age distinction directly (a just-expired login session is pruned the same sweep, not a TTL later).

## Z8-finding → task traceability

| Finding(s) | Task |
|---|---|
| Z8-019, Z8-020 | T1 (NaN% progress) |
| Z8-021 | T1 (misleading bar) |
| Z8-026, Z8-027, Z8-028 | T10, T11 (artifact image-as-text + no-preview + error/malformed fallback + alt) |
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
