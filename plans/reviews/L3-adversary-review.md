# L3 — Adversary Review

Read-only adversarial review of `git diff main..HEAD` against `docs/architecture-plans/L3.md`, `docs/concept/HUMAN_INTERFACE_LAYER.md` §4.5, and the project's CLAUDE.md / TypeScript / aesthetic rules.

Severity legend: **blocker** = must fix before merge; **major** = creates concrete production risk; **minor** = worth fixing but not load-bearing.

---

## BLOCKERS

### B1 — Plan deliverables silently dropped: missing eslint rules `closed-view-family` and `no-embed-chrome`
- **Where:** `packages/eslint-plugin-design/src/rules/` — neither file exists. AC-3 + AC-12 (L3.md §2 lines 24, 33) and §6.6 require both rules.
- **Flaw:** L3.md §9 calls these the **enforcement** layers for the closed view family; §12 lists `eslint-no-embed-chrome` and `eslint-closed-view-family` as protected tests. Only the export-boundary vitest exists. The promised "layered defence" collapses to one layer. AC-3 (closed view family) and AC-12 (lint includes the new rules) are unmet — the plan reconciliation table (§13) explicitly cites the rule for the no-chrome guarantee.
- **Fix:** Implement both rules in `packages/eslint-plugin-design/src/rules/`, register in the plugin index, enable in `packages/design-system/.eslintrc`, ship the two rule tests listed in §12. Until then this story does not satisfy its own AC.

### B2 — Plan deliverables dropped: agent-runtime services `createArtifact`, `settleArtifactPreview`, `settleArtifactCost`
- **Where:** `packages/server/src/services/` — none of `createArtifact.ts`, `settleArtifactPreview.ts`, `settleArtifactCost.ts` exist. Plan §1 calls the single `createArtifact` service the **agent-runtime entry path**; §6.3 lists all three; §7 makes them tasks 3–4.
- **Flaw:** All write logic lives inline in the route handlers. The harness/handoff path the plan promises has no callable function — when L11 / Task-handoff goes to wire this in, they have to either duplicate route logic or re-wire through HTTP. Also breaks the §5.5 event-bus integration: `createArtifactRoutes(db)` doesn't take an `EventBus` (compare every other route in `app.ts` line 264–272), and no `artifact_created` / `artifact_preview_settled` / `artifact_cost_settled` event is emitted anywhere.
- **Fix:** Lift insert/update logic into the three services; pass `EventBus` into `createArtifactRoutes`; emit the three events.

### B3 — Tenant scoping absent on every fetch path
- **Where:** `packages/server/src/routes/artifacts.ts` lines 163–242. No filter joins to `tenant_id` / product owner / auth-principal.
- **Flaw:** Plan §8 STRIDE info-disclosure mitigation ("Fetch route applies the existing tenant-scope filter (joins tasks → bets → products → tenant). 404 (not 403) on cross-tenant lookups so existence does not leak") is not implemented. The cross-tenant test (`artifacts-route.test.ts:296`) admits "Without multi-tenant test seam we can't truly cross tenants" and only asserts `status !== 403` — a tautology because the route never returns 403 for any reason. Anyone with a valid API key can read every artifact in every tenant by id or by axis. AC-8 failure-mode "cross-tenant request returns 404 not 200-empty" is unverified.
- **Fix:** Add a tenant-scope predicate (likely `tasks → bets → products → tenant_id == authPrincipal.tenantId`) to every SELECT; replace the toothless cross-tenant test with one that seeds two principals.

### B4 — Role gating absent on POST/PATCH writers
- **Where:** `packages/server/src/routes/artifacts.ts`. No `role >= agent` check on POST, PATCH /preview, PATCH /cost.
- **Flaw:** Plan §5.1 and STRIDE elevation row (§8) commit to "role ≥ agent on POST/PATCH; viewer-role can only GET". Implementation accepts any authenticated principal. The `Auth` row in the route checklist (§5.4) is unfulfilled.
- **Fix:** Add role middleware on the POST/PATCH handlers, or document why the existing `authMiddleware` is sufficient (it is not — it only validates the API key).

### B5 — Pagination cursor advertised but never accepted or honored
- **Where:** `packages/server/src/routes/artifacts.ts` line 226: `nextCursor` is computed and returned, but the handler never reads `c.req.query("cursor")` and never applies it to the WHERE. `ArtifactQuery.cursor` (shared) is dead. Test at `artifacts-route.test.ts:239` asserts `nextCursor !== null` but never re-fetches with it.
- **Flaw:** AC-8 protected test `pagination-cursor-stable` (plan §12) requires "Cursor returned at page 1 → page 2 yields the next 50 with no overlap." Currently passing the cursor back yields the same first page. This is a behavioural regression vector the moment a list crosses 50 rows. Also the cursor format (a bare ISO timestamp from the last item) cannot disambiguate ties on `created_at` — `(createdAt, id)` was the spec (§3.4 / §10 Q10).
- **Fix:** Accept `cursor`, decode `createdAt|id`, apply `WHERE (createdAt, id) < (cursorCreatedAt, cursorId)`; ship a real overlap-free pagination test.

### B6 — Cost PATCH "second call returns 409" is implemented incorrectly when first cost is partial
- **Where:** `routes/artifacts.ts:346-353` — the immutability check bails when ANY cost column is non-null. But the protected test (`artifacts-route.test.ts:408`) seeds rows with `costMoneyMicros: 1000, costTokensInput: 10, costTokensOutput: 10` *and `costSettledAt: null`* (the `insertArtifact` helper line 88 forces `costSettledAt: null`). The handler treats any non-null cost column as "settled," so the test passes — but a row created with `cost: null` and then patched once will set all three columns and `cost_settled_at`; a *second* patch correctly 409s. So far so good. **However**, partial-state rows (any non-null cost column without `cost_settled_at`) are rejected as already-settled, locking artifacts into a permanently un-settle-able state. The DB has no constraint preventing such partial inserts and the route POST allows `cost: { money_micros: null, tokens_input: 5, tokens_output: null }` (zod is `nullable()` per-field, line 108–110).
- **Flaw:** The "immutable iff any column populated" rule conflates "cost present" with "cost settled." Plan §3.3 says "`tokens` is null iff BOTH token columns are NULL"; the route inverts this for the immutability check. An artifact with a partial cost row can never be completed.
- **Fix:** Introduce one canonical "is-settled" predicate (`cost_settled_at IS NOT NULL`) and use it everywhere — POST, PATCH, and read normalisation. Reject partial-cost POST payloads or treat them as not-yet-settled.

---

## MAJOR

### M1 — Tier-2 layouts render `<button>` containing nested `<span>`/`<div>` and the `ArtifactKindBadge` `<span>` — accessibility/HTML validity risk
- **Where:** `ArtifactGalleryCard.tsx:30`, `ArtifactStackItem.tsx:31` — `<button>` wrapping a flex-column with paragraphs and a sub-`<button>` is not invalid here, but `ArtifactEmbed.tsx:36` puts a `<button>` (the arrow) inside a non-button container that the host treats as clickable. Also `ArtifactGalleryCard` renders `ArtifactKindBadge` (a `<span>`) inside a `<button>` — fine — but the entire CardBase listens to `onClick` and a nested clickable `ArrowButton` does not exist there. Less an HTML bug, more an a11y trap: the entire card is one button label = the rendered text concatenation.
- **Flaw:** No `aria-label` on the gallery/stack `<button>` — screen-reader users hear "code diff · task title · src/foo.ts · $0.42 · 5 min ago". Plan §13 row "Approved design …focus ring outline, click-to-open handler" is silent on labels.
- **Fix:** Add `aria-label={artifactDisplayTitle(data)}` (or similar) to the `<button>` root in `ArtifactGalleryCard` and `ArtifactStackItem`.

### M2 — `as never` + `as z.infer<…>` casts on every `c.req.valid("json")` site
- **Where:** `routes/artifacts.ts:249, 309, 331`.
- **Flaw:** Project rule `.claude/rules/typescript.md`: *"No `any`, no `@ts-ignore`, no unsafe `as` casts."* Three of them, identical pattern, in the new code. The right shape is to use Hono's typed `zValidator` from `@hono/zod-validator` so `c.req.valid("json")` returns the inferred type. The custom `validateBody` middleware does not propagate the schema through Hono's generics, so every call site re-asserts.
- **Fix:** Either swap to `zValidator` (verified Hono v4 pattern: https://hono.dev/docs/guides/validation), or fix `validateBody`'s typing so `c.req.valid("json")` is correctly inferred. Remove all three pairs of casts.

### M3 — `as readonly string[]` cast and `as ArtifactKind` cast in `rowToArtifact`
- **Where:** `routes/artifacts.ts:19, 136`.
- **Flaw:** Same TS rule. `RECOGNISED_KIND_VALUES = ARTIFACT_KINDS as readonly string[]` is the lazy fix to `Array.includes` narrowing. Replace with a typed predicate `function isArtifactKind(s: string): s is ArtifactKind { return (ARTIFACT_KINDS as readonly string[]).includes(s); }` — the cast is then encapsulated and the call site is type-safe (`row.kind` is narrowed to `ArtifactKind`, no `as`).
- **Fix:** Add the predicate; drop both casts.

### M4 — `JSON.parse … as ArtifactPreview` swallows corruption silently and trusts DB content
- **Where:** `routes/artifacts.ts:141`. Comment says "let it propagate", but the code then validates `parsed.kind === kind` and silently returns `preview: null` on mismatch, discarding the row entirely. So we *do* swallow — but only by emitting `null` instead of the bad data, which masks corruption from observability. There's no `console.warn` (banned anyway), no observability event.
- **Flaw:** Two failure modes are conflated: (a) JSON parse throws (propagates → 500) vs (b) JSON parses to a kind-mismatched payload (silently null). The mismatch case is the one most likely in a forward-compat ingest scenario, and it disappears without trace. If the agent runtime ever writes a `preview_json` whose `kind` differs from the row's `kind`, the API silently elides it.
- **Fix:** Either run the parsed body through the zod `artifactPreviewSchema` (defensive parse) and emit an observability event on failure, OR enforce kind-match at write time so this branch is genuinely impossible (and then drop the silent-null fallback). Don't both reject and silently elide.

### M5 — `useFetch` cancels the *state set* but not the underlying `fetch` request
- **Where:** `packages/web/src/hooks/useFetch.ts:24-46`.
- **Flaw:** No `AbortController` passed to `fetch`. The in-flight request continues, parses JSON, and is then thrown away when `cancelled` is checked. With React 18 strict-mode double-invocation in dev and rapid axis changes, this fires duplicate requests, holds memory longer than necessary, and races on slow networks. The "Cancels in-flight responses" comment is a lie.
- **Fix:** Use `AbortController`, pass `signal` into `fetch`, call `controller.abort()` in cleanup.

### M6 — `ArtifactPermalink` does brittle `error?.includes("404")` to discriminate not-found from other errors
- **Where:** `packages/web/src/pages/ArtifactPermalink.tsx:17`.
- **Flaw:** The error string is whatever `useFetch` produced — `"HTTP 404"`. Any future tweak to the error format silently breaks the EmptyState path; in a 401/403 scenario the user sees an `ErrorState` with raw "HTTP 401" — leaking internals. No type-safe error discrimination because `useFetch` returns `error: string | null`.
- **Fix:** Make `useFetch` return `{ status: number | null }` or a discriminated `error: { kind: "not_found" | "forbidden" | "network" | "other"; ... }`. Then branch on the discriminant.

### M7 — `axis=portfolio` returns ALL artifacts regardless of caller — no portfolio scoping
- **Where:** `routes/artifacts.ts:175-200`. `taskIds` is left `null` for portfolio; the query joins tasks but never filters. Combined with B3 (no tenant scope), portfolio is "every artifact in the database."
- **Flaw:** Plan §3.4 line 140 says portfolio is "implicit current-tenant scope" — that scope is missing. Even single-tenant deployments will surface artifacts from products the principal cannot see once role/permission lands.
- **Fix:** Apply the same tenant predicate as B3; once L1/permissions land, gate by visible-product-id list.

### M8 — `bet`/`product` axes pre-fetch task ids then `inArray` — N+2 query and unbounded `IN ()` size
- **Where:** `routes/artifacts.ts:187, 194`. For a product with 10k tasks, `inArray(producingTaskId, taskIds)` becomes a 10k-parameter SQL statement; SQLite's default `SQLITE_LIMIT_VARIABLE_NUMBER` is 999, PG's is 32767 but performance still degrades.
- **Flaw:** Plan §4.2 says "no materialised aggregation table — the read shape and the cardinality (artifacts per bet typically O(10–100)) do not justify it." That assumption holds for *artifacts per bet*, not *tasks per product*. Use a JOIN, not a pre-query.
- **Fix:** Replace pre-query with `INNER JOIN tasks ON … WHERE tasks.productId = ?` (and similar for bet). Single round-trip, no parameter blow-up.

### M9 — Closed-view-family test only checks `^Artifact` — does not catch `ArtifactCardLayout` or `Artifacts*` (plural)
- **Where:** `packages/design-system/src/__tests__/closed-view-family.test.ts:27, 42`.
- **Flaw:** A future agent adds `ArtifactPreviewSurfaceLite.tsx`. Regex matches, file fails the "must be in allow-list" test → caught. Good. But `Artifacts.tsx` (plural) or `ArtifactList.tsx` (acceptable name) would also fail the test even though it could be a non-layout. More worrying: `ArtifactView.tsx` is not in the allow-list and would be rejected — but plan §6.4 mentions an `ArtifactView` host in `web/src/shell/`. If anyone moves it to design-system, the test fails for the *right* reason but with a misleading message ("5th layout") when the violation is "wrong package."
- **Fix:** Make the regex narrower (e.g. require it not match an `*Layout` or specific suffixes), or have the failure message clearly differentiate "unknown Artifact* file" from "5th layout."

### M10 — `validateBody` on `PATCH /:id/cost` runs without a body-limit middleware
- **Where:** `routes/artifacts.ts:329` — only POST and PATCH-preview wrap with `createBodyLimit`. Cost PATCH does not.
- **Flaw:** Three integers should never be ≥1MB but the plan §5.4 says all writers get body-limit. The general 1MB body limit on `/api/*` (app.ts:223) does cover it — minor consistency issue, not a hole.
- **Fix:** Add the same `createBodyLimit({ maxSize: 1024 })` for symmetry, or drop body-limit from the others and rely on the global cap.

---

## OBSERVATIONS

### O1 — `summarizePreview` and `artifactDisplayTitle` are exported public API surface but plan called for `getArtifactViewProps` instead
- Plan §3.2 / §6.2 / §10 Q4 spec a single helper `getArtifactViewProps(artifact)` that maps to one of 5 ArtifactView shapes (or `no_view`). Implementation ships two ad-hoc string helpers and no shape-mapping function. Downstream `ArtifactEmbed` uses `summarizePreview` directly. The plan's promise of a "5 ArtifactView shape" mapping is silently abandoned. Re-evaluate before L11/L12 wires the embed.

### O2 — Discriminant union zod schema is duplicated
- The 12-arm `artifactPreviewSchema` lives only in `packages/server/src/routes/artifacts.ts:29`. The TS type lives in `packages/shared/src/types/artifact.ts:27`. They drift independently. Lift the zod schema into shared and derive the TS type from it (`z.infer<typeof artifactPreviewSchema>`), or generate the zod from the TS via `zod-to-ts`. As written, adding a 13th kind requires touching both files and there is no test that fails if one is forgotten.

### O3 — `routes/artifacts.ts` returns `{ ok: true }` from PATCH endpoints — plan §5.1 says return `Artifact`
- Plan: "PATCH `/api/artifacts/:id/preview` … Response: `Artifact`". Implementation returns `{ ok: true }` (line 325, 380). Callers cannot use the return value to update local state. Minor, but the plan/code disagree.

### O4 — `EventBus` parameter in `createArtifactRoutes` removed; `app.ts:266` doesn't pass it; tests construct one anyway (line 103)
- Symptom of B2. The test file imports `EventBus` and constructs one for no reason — dead code that mimics other route tests. Will quietly hide event-emission bugs once B2 is fixed.

### O5 — Portfolio + bet + product axes have NO test coverage for tenant isolation, NO test that asserts only-this-bet's-tasks (only "contains art_pa"), and NO failure-mode test for an empty bet
- `artifacts-route.test.ts:179-189` — `axis=portfolio` test asserts `toContain` not set-equality; data from a previous test or a different tenant would still pass. Tests are happy-path-only despite the plan §2 demanding failure-mode tests for every AC.

### O6 — `crypto.randomUUID()` instead of UUID v7
- Plan §4.1 ("UUID v7 string, opaque"). Implementation uses `crypto.randomUUID()` which is v4. v7 is desirable for time-ordered indexes — in particular the `artifacts_created_at_idx` would benefit. Not a blocker; capture as @lore.

### O7 — `ArtifactTimestamp` re-renders relative time on every render but never updates over time
- Computes `Date.now()` inside the render function. A page open for an hour will keep showing "5 min ago." No ticker, no invalidation. Either accept this (and document) or use `useEffect` + interval. Same trap caught in earlier design system work.

### O8 — Comment on `routes/artifacts.ts:138` claims `if (recognised && row.previewJson)` but the type is `string | null` — `""` would be falsy and silently produce `preview: null`
- DB column allows empty string in SQLite. Tighten with explicit `!== null && !== ""` or treat empty as corruption.

### O9 — `ArtifactKindBadge` ignores `unknown_kind` styling
- The badge uppercases and replaces underscores; `unknown_kind` renders as `UNKNOWN KIND`. Plan §3.1 says renderer dispatches on the catch-all token; spec doesn't dictate label, but a user-facing "UNKNOWN KIND" badge looks like a bug. Tier-1 component should explicitly label `unknown_kind` as e.g. "UNRECOGNIZED" or hide the badge.

---

## VERDICT

**STOP.**

Six blockers, ten majors. The implementation ships the surfaces (DB, route, 8 components, e2e specs) but drops three load-bearing deliverables the plan explicitly committed to:

1. **No tenant/role enforcement** (B3, B4, M7) — every authenticated principal can read every artifact across every tenant. STRIDE info-disclosure unmitigated.
2. **No ESLint enforcement of the closed view family / no-embed-chrome** (B1) — the plan's two-layer defence is one-layer.
3. **No agent-runtime services or event-bus integration** (B2) — the harness/handoff path the plan calls "the entry path" doesn't exist; downstream consumers will either re-implement via HTTP or block.

Plus B5 (pagination cursor doesn't actually paginate), B6 (cost partial-state lockout), and a thicket of `as` casts violating the project TypeScript rule.

Do not merge. Do not advance to /ship. Cycle back through /apply-review with these findings.
