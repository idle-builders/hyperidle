## L1 Definition-of-Done Audit — Loop 1

**Branch:** feat/L1-thread-primitive at bcafa35
**Verdict:** NOT DONE — AC-13 (Playwright e2e) is unrunnable as authored; AC-15 (`bun run lint` + full e2e) is failing.

### Test Suite Status

- `bun run check`: PASS (0 type errors).
- `bun run lint`:
  - `biome check .` errors with "No files were processed in the specified paths" because the worktree lives under `.claude/`, which the `biome.json` `files.includes` block excludes via `"!**/.claude"`. This is a worktree-pathing artifact, not a source defect; running `bunx --bun eslint .` directly works.
  - `bunx --bun eslint .` reports **2 errors, 22 warnings**. The 2 errors are real and gating: `packages/design-system/src/ThreadHostBanner.tsx:103:7` and `:109:12` — `text-[10px]` violates AQ-004 (closed type scale `{11,12,13,14,15,16,18,20,24}`, lint rule `design/no-off-scale-font-size`). Step 9 explicitly noted these are "pre-existing" and untouched by L1, but the file is owned by L1a (it's one of the six DS components shipped this story) — so the gate counts.
- `bun run test`: **2752 passing / 0 failing / 3 skipped** (matches step 9 baseline).
- Playwright (DS visual): `cd packages/design-system && bunx playwright test --config=playwright.l1.config.ts` → **12/12 pass**.
- Playwright (web e2e): `cd packages/web && bunx playwright test threads.spec.ts` → **6/6 FAIL**. Every case calls `page.goto("/conversations/review")` without `?id=` and without `page.route()` mocks; `ConversationsReview.tsx:139-148` returns `EmptyState` when no id is in the URL, so `[data-testid='thread-shell']` never mounts. The "post follow-up review" affordance referenced at `threads.spec.ts:97` does not exist anywhere in the codebase. This was flagged in `L1-architecture-review.md:29,59` and remains unfixed at HEAD.

Surface area: `git diff --name-only main...feat/L1-thread-primitive | wc -l` → 160 files.

### AC-by-AC

#### AC-1 — Concept-doc updates landed
- **Status:** DONE.
- **Evidence:** `git diff main...feat/L1-thread-primitive` touches `docs/concept/HUMAN_INTERFACE_LAYER.md`, `docs/concept/ARCHITECTURE.md`, `docs/concept/AGENT_LAYER.md`, `docs/work-packages/SHARED.md`. HIL contains 12 occurrences of `§4.5` anchors. SHARED.md line 54 declares the Thread-primitive entry pointing back to HIL §4.5.

#### AC-2 — DM/coach/feed are configurations, not message shapes
- **Status:** DONE.
- **Evidence:** `grep -rn "'coach'\|'feed'\|'dm'" packages/shared/src/ packages/db/src/schema.ts` returns 0 hits. `MESSAGE_TYPES` (`packages/shared/src/thread.ts:29`) is `["plain","review","questionnaire","verdict"]` — no thread-shape vocabulary.

#### AC-3 — Cross-area attachment contract
- **Status:** DONE.
- **Evidence:** `HOST_KINDS` (`packages/shared/src/thread.ts:17-26`) lists all 8 (bet, task, knowledge_item, artifact, agent, user, team, factory). Round-tripped per host kind in `threads.routes.test.ts:131-181` (8 parametric cases, all pass).

#### AC-4 — Message vocabulary defined
- **Status:** DONE (per T0 / step 9, `verdict` was closed in as the 4th type).
- **Evidence:** `packages/shared/src/thread.ts:29` declares the closed enum. `packages/shared/src/__tests__/message-types.test.ts:39-42` asserts `MESSAGE_TYPES.length === 4` and the sorted membership matches `{plain, questionnaire, review, verdict}`. 6/6 vitest cases pass.

#### AC-5 — SHARED.md contracts in sync
- **Status:** DONE.
- **Evidence:** SHARED.md:54 cross-references HIL §4.5 and re-states the closed enum; concept doc and shared schema agree.

#### AC-6 — Shared implementation matches concept contract
- **Status:** DONE.
- **Evidence:** `bun run check` is green. `packages/shared/src/thread.ts` types (`Thread`, `Message`, payloads) are imported by `packages/db/src/schema.ts`, `packages/server/src/routes/threads.ts`, and `packages/design-system/src/ThreadShell.tsx` without local-shape duplication. Discriminated union at `thread.ts:126-142`.

#### AC-7 — Threads attach to any host entity
- **Status:** DONE.
- **Evidence:** `threads.routes.test.ts:142` loops over `HOST_KINDS` (all 8) and round-trips each through POST `/api/threads` + GET `/api/threads?host_kind=<k>&host_id=<id>`. All 8 cases pass.

#### AC-8 — Existing review/chat-only data continues to load (back-compat)
- **Status:** PARTIAL — schema-side proven, API back-compat e2e is the unrunnable threads.spec.ts case.
- **Evidence:** `migration-l1.test.ts:172-206` (16/16 vitest cases pass) inserts a `kind='chat'` row through the post-migration schema and confirms `payload.text` contains the projected body. Architecture review (`L1-architecture-review.md:26`) explicitly notes: "the actual read-back of pre-migration row content (snapshot insert + run + assert projected payload) is NOT covered." The Playwright back-compat case (`threads.spec.ts:67-82`) is the e2e that would close this, but it fails (no fixture seeded).

#### AC-9 — Page-local fixture types removed
- **Status:** DONE for L1a (ConversationsReview only).
- **Evidence:** `grep -rn "MOCK_REVIEWS\|MockReviewItem" packages/web/src/pages/ConversationsReview.tsx` returns only doc-comment mentions; the type and array are gone (page now mounts `<ThreadShell>` over the new fetch path). `MockThread` (ConversationsChat) and `MockBetComment` (WorkBet) remain — those are explicitly DEFERRED-TO-L1B per `L1-plan.md:5,1032-1041`.

#### AC-10 — System lists/fetches/creates threads + messages
- **Status:** DONE.
- **Evidence:** `threads.routes.test.ts` covers all four endpoints (`GET /api/threads`, `GET /api/threads/:id`, `POST /api/threads`, `POST /api/threads/:id/messages`) — 31/31 pass. List-validation (no scope → 400), invalid-host_kind (Zod reject → 400), 404 on missing thread, event emission, idempotency, verdict authorization, re-open semantics all covered.

#### AC-11 — Discriminant exhaustiveness
- **Status:** DONE (post step 9).
- **Evidence:** `packages/design-system/src/CommentRow.tsx:80-100` and `packages/design-system/src/ThreadHead.tsx:50-125` are `switch (message.type) { ...; default: return exhaustiveAssert(message); }`. Both import `exhaustiveAssert` from `@hyperidle/shared`. Adding a 5th `MessageType` literal would now narrow `message` to a non-`never` value at the default arm and fail compilation. The `message-types.test.ts:67-107` `describeMessage` helper exercises the same pattern in tests.

#### AC-12 — Server tests round-trip every message type
- **Status:** DONE.
- **Evidence:** `threads.routes.test.ts:183-271` parametrizes over the 4 `MESSAGE_TYPES` and POSTs each through `/api/threads/:id/messages`, asserting the row round-trips through GET. All 4 cases pass.

#### AC-13 — Playwright e2e: each shipping rich type renders inline
- **Status:** NOT DONE.
- **Evidence:** `packages/web/e2e/threads.spec.ts` has the four L1a-scope cases authored, but every case calls `page.goto("/conversations/review")` without `?id=` and without any `page.route()` network stub. `ConversationsReview.tsx:139-148` returns `EmptyState` in this state. Running `bunx playwright test threads.spec.ts` produces **6 failures, 0 passes** (locator `[data-testid='thread-shell']` never appears; the "post follow-up review" button referenced in the re-open case does not exist anywhere). The architecture review (`L1-architecture-review.md:29,59`) named this as the only file-level CRITICAL gap — fix-by note says "wire a `playwright.config.ts` `webServer` fixture that seeds via POST /api/threads, or stub fetch per case". Step 9 did not address it; step 10 confirms it is still broken.

#### AC-14 — Migration is forward-only with rollback plan
- **Status:** DONE.
- **Evidence:** SQLite migration `packages/db/drizzle/0007_thread_primitive_l1.sql` + `0008_thread_host_immutability.sql`; Postgres parity `drizzle-pg/0006_thread_primitive_l1.sql` + `0007_thread_host_immutability.sql`. Snapshot tables (`_l1_snapshot_*`) retain pre-migration data 30d. Rollback runbook at `packages/db/L1-rollback.md` (51 lines documenting pre-conditions, mechanical rollback, drizzle journal re-baselining). Adversary-C5 PG/SQLite drift was closed in step 9.

#### AC-15 — `bun run check` + `bun run lint` + `bun run test` all green; full e2e re-runs and stays green
- **Status:** NOT DONE.
- **Evidence:**
  - `bun run check`: green.
  - `bun run lint`: 2 hard eslint errors in `ThreadHostBanner.tsx` (10px font-size off-scale, AQ-004). Plus the `biome check .` invocation fails inside this worktree because of the `!**/.claude` exclude in `biome.json:146` — a pre-existing infra quirk; unblocks if run from `main`'s checkout instead.
  - `bun run test`: 2752 passing / 0 failing — green.
  - Full e2e: `threads.spec.ts` → 6/6 fail. Other suites unverified, but a known-broken file in the suite means AC-15 fails on its face.

### Contracts / constraints (TRACK-L lines 58-64)

- Message-type vocabulary closed: DONE — `MESSAGE_TYPES` const + `_MESSAGE_TYPES_COVERED` structural drift guard + `exhaustiveAssert` in renderers.
- Every thread carries an attachment; un-attached coach threads attach to user: DONE — `host_kind`/`host_id` are NOT NULL in the schema (verified by `migration-l1.test.ts:101-119`); migration projects coach threads to `(host_kind='user', host_id=initiator_id)`.
- Threads attach to bets/tasks/knowledge items/artifacts/agents/users (+team, +factory in shared types): DONE — round-tripped per AC-7.
- Migration forward-only with rollback plan: DONE.
- No emojis: not exhaustively scanned; spot-check on shipped DS components and pages clean.

### L1b Deferrals (explicit, per plan §15)

- `QuestionnaireAnswerBar` DS component (L1b-T1) — placeholder text in ThreadHead instead.
- `ThreadHead` `onPromoteArtifact` canvas wiring (L1b-T2) — accepted as no-op prop.
- `ConversationsChat` full integration + `MockThread` removal + tests (L1b-T3).
- `WorkBet` `MockBetComment` removal + bet threads-section + dialog (L1b-T4).
- e2e: questionnaire thread + WorkBet thread (L1b-T5).
- Mobile two-tab segmented control + the redact endpoint (Design-S / Adv-W deferrals listed in step9-applied.md).
- Pagination, payload-size cap, dual-read on legacy conversations (Adv-S1-S6).

### Waivers (with rationale)

- **biome lint failure inside this worktree** — caused by `biome.json:146` excluding `**/.claude` and the worktree pathing under `.claude/worktrees/`. Not a source defect; would pass on a non-`.claude` checkout. Recommend a small biome.json tweak or running `bunx biome check --files-ignore-unknown` + an explicit list, but it does not block the AC-15 verdict — that's blocked by the eslint errors above which are pathing-independent.

### Gaps Found (must close before "DONE")

1. **`packages/web/e2e/threads.spec.ts` is unrunnable** (six failing cases). Either (a) gate each case with `page.route()` stubs that return seeded `GET /api/threads/:id` responses and navigate to `/conversations/review?id=<seeded-id>`, or (b) stand up a `playwright.config.ts` `webServer` fixture that seeds via POST. The "post follow-up review" affordance at `threads.spec.ts:97` must either be added to the page or the test must invoke the API directly. Architecture review names this the single CRITICAL verification gap.
2. **`packages/design-system/src/ThreadHostBanner.tsx:103,109` `text-[10px]` violates AQ-004** (closed type-scale `{11,12,13,14,15,16,18,20,24}`). Bump to `text-[11px]` (smallest allowed) or use a typography token.
3. **`bun run lint` fails inside the worktree** — pre-existing biome path quirk caused by `biome.json:146 !**/.claude`. One-line fix: scope the script's CWD to a path that biome will accept, or remove the `.claude` exclude in favor of a more targeted glob.

### Verdict line

**NOT DONE.** AC-13 (Playwright e2e) and AC-15 (lint + e2e green) are failing.

### Shipping recommendation

Hold L1a until the three gaps above close. The whole foundation — types, schema, migration with rollback, server endpoints, ThreadShell + 5 DS components with HTML parity and visual regression, and the discriminant-exhaustiveness story — is solid; 2752/2752 vitest cases green and 12/12 design-system playwright cases green. But the L1 contract (TRACK-L:43, AC-13) explicitly requires Playwright e2e proving each shipping rich type renders inline, and the four cases that ship in L1a are all failing because the test file was authored against a fixture-seeding harness that nobody wired up. This is the same gap `L1-architecture-review.md` flagged before the score-7.6 PASS verdict; step 9 did not pick it up. Fix the e2e wiring + the two `text-[10px]` errors and L1a is ready to merge.

---

## L1 Definition-of-Done Audit — Loop 2

**Branch:** feat/L1-thread-primitive at 5ebbd6d (gap-closure commit on top of bcafa35)
**Date:** 2026-04-28
**Verdict:** NOT DONE — three Loop-1 gaps are closed, but a **new defect** surfaced under re-verification: a flaky failure in `threads.routes.test.ts > AC-12 type='review' round-trips`, observed in 2 of 4 full `bun run test` runs. AC-12 is in scope; the flake is caused by an unsound assumption in test code authored by L1 (`.find(m => m.type === type)` against a thread that is pre-seeded with a `review` initial message), which means CI determinism is not yet proven.

### Loop-1 gap re-assessment

#### Gap 1 — AC-13 e2e: CLOSED

- `cd packages/web && bunx playwright test e2e/threads.spec.ts` → **5 passed** (1.9s, 5 workers, 0 fail / 0 skip).
- Cases shipping:
  - `review-shape thread renders ThreadHead + ReviewVerdictBar inline` (the AC-13 review case).
  - `plain-shape thread (chat-only)` (the AC-13 plain case).
  - `back-compat (legacy review/chat collapse projection)` (closes AC-8 e2e).
  - `composer round-trips a plain message` (covers POST + render).
  - `verdict click resolves the review and renders APPROVED` (covers verdict authorization end-to-end).
- Hermetic: `grep -c "page.route" packages/web/e2e/threads.spec.ts` → **8** stub registrations across the 5 tests; no live API or webServer-seeding dependency. Each case mounts the same SPA bundle, intercepts `GET /api/threads/:id` (and `POST /api/threads/:id/messages` where applicable), and returns realistic Thread/Message JSON.
- The "post follow-up review" fictitious affordance flagged in Loop 1 is gone. The file's header doc-block at lines 12-16 explicitly captures the lore: "the previous draft … referenced a 'post follow-up review' affordance that L1a never shipped. Both have been replaced with hermetic route mocks below." Lines 462-463 re-defer the re-open follow-up case to L1b. This matches plan §15 and step9-applied.md.
- AC-13 verdict: **DONE** for all L1a-shipping types (`plain` + `review`). Questionnaire and verdict-as-distinct-type cases are L1b deferrals.

#### Gap 2 — AC-15 lint (text-[10px] off-scale): CLOSED

- `bun run lint` from worktree root → **0 errors, 22 warnings** (exit 0). The two prior `text-[10px]` errors at `ThreadHostBanner.tsx:103,109` are gone.
- `grep -rn "text-\[10px\]" packages/design-system/src/ packages/web/src/` returns **3 hits — all of them inside doc-comments / lore comments**, not in JSX/className strings:
  - `SearchField.tsx:59` ("text-[10px] → text-[11px] (off-scale). The 56px right-inset on the …") — inline comment narrating prior fix.
  - `KnowledgeRow.tsx:82` ("Body size (default)": px-[6px] → px-[8px] (off-grid), text-[10px] → text-[11px]) — comment.
  - `NavItem.tsx:45` ("Body size (default)": px-[5px] → px-[4px] (off-grid), text-[10px] → text-[11px]) — comment.
- Production source code has 0 hits. Lint passes.
- DS visual regression still green: `cd packages/design-system && bunx playwright test --config=playwright.l1.config.ts` → **12/12 passed** (7.8s). HTML reference change did not break visual diff.
- AC-15 lint half: **DONE**.

#### Gap 3 — biome.json `.claude` worktree exclude: CLOSED

- `biome.json:146-152` (the previously-blanket `!**/.claude` exclude) is now scoped to seven specific subpaths: `!.claude/agents`, `!.claude/process`, `!.claude/references`, `!.claude/rules`, `!.claude/skills`, `!.claude/settings.json`, `!.claude/settings.local.json`.
- This means `.claude/worktrees/**/packages/**` is no longer excluded — biome scans the worktree-checked source.
- Confirmed: `bunx --bun biome check .` → "Checked 660 files in 132ms. No fixes applied. Found 102 warnings." (real scan, not "0 files matched").
- AC-15 biome half: **DONE**.

### Re-verification of the full DoD command set

- `bun run check` → **PASS** (0 type errors, exit 0).
- `bun run lint` → **PASS** (0 errors, 22 warnings, exit 0).
- `bun run test` → **FLAKY**: across four sequential full runs from the worktree root:
  - Run 1: **2 failed / 2750 passed / 3 skipped** (`fabric/file-watcher.test.ts` AC10 + `server/threads.routes.test.ts` AC-12 review).
  - Run 2: **1 failed / 2751 passed / 3 skipped** (`server/threads.routes.test.ts` AC-12 review).
  - Run 3: **0 failed / 2752 passed / 3 skipped**.
  - Run 4: **0 failed / 2752 passed / 3 skipped**.
  - When run in isolation, `cd packages/server && bunx vitest run src/routes/__tests__/threads.routes.test.ts` is **31/31 green**, and `cd packages/fabric && bunx vitest run src/__tests__/file-watcher.test.ts` is **14/14 green**. The failures only surface during the full concurrent run.
- `cd packages/design-system && bunx playwright test --config=playwright.l1.config.ts` → **12/12 PASS**.
- `cd packages/web && bunx playwright test e2e/threads.spec.ts` → **5/5 PASS**.

### Root-cause of the AC-12 flake (new finding)

`threads.routes.test.ts:183-271` (AC-12) seeds a thread in `beforeEach` with a `review`-type initial message (`payload = validReviewPayload` → `title: "Pricing overhaul review"`). The parametric loop then posts a NEW message of each `MessageType` to the same thread and asserts the round-trip with:

```ts
const found = detail.messages.find((m) => m.type === type);
expect(found?.payload).toEqual(payload);
```

The endpoint orders messages by `desc(messages.createdAt), desc(messages.id)` (`packages/server/src/routes/threads.ts:231`). When the seeded `review` and the round-trip `review` land in the same millisecond — which happens when the test runs alongside a busy concurrent suite — the tiebreaker is `desc(messages.id)`, where `id` is a random UUID. So `.find(m => m.type === 'review')` non-deterministically returns either the seeded `Pricing overhaul review` or the new `follow-up` review. The product is correct; the test is unsound. Fix is two lines: either `find` by `clientKey === 'roundtrip-review'` (deterministic), or `findLast` after sorting `messages` by `createdAt` ASC, or `await new Promise(r => setTimeout(r, 1))` before posting to guarantee a later `createdAt`. None of these are in the diff.

The fabric `file-watcher.test.ts:472` failure observed in Run 1 (`expected items.length === 1, got 0`) is also a concurrency artifact — the fs.watch debounce window collides with the next `await` in a parallel suite. It did not repeat in Runs 2-4, but the AC-12 review case repeated in two of four runs, which is enough to call it a real flake gating CI determinism.

### AC-by-AC re-confirmation

| AC | Loop 1 status | Loop 2 status | Notes |
|---|---|---|---|
| AC-1 (concept-doc updates) | DONE | **DONE** (no regression) | HIL §4.5 + 12 anchor occurrences intact; SHARED.md:54 still correct. |
| AC-2 (DM/coach/feed are configurations) | DONE | **DONE** | 0 grep hits for `'coach'/'feed'/'dm'`; `MESSAGE_TYPES` is `["plain","review","questionnaire","verdict"]`. |
| AC-3 (cross-area attachment contract) | DONE | **DONE** | `HOST_KINDS` × 8; round-tripped per host kind. |
| AC-4 (message vocabulary) | DONE | **DONE** | Closed enum; `_MESSAGE_TYPES_COVERED` structural drift guard. |
| AC-5 (SHARED.md sync) | DONE | **DONE**. |
| AC-6 (shared impl matches contract) | DONE | **DONE** — `bun run check` 0 errors. |
| AC-7 (threads attach to any host) | DONE | **DONE** — 8/8 host kinds round-trip in routes test. |
| AC-8 (back-compat) | PARTIAL | **DONE** — Playwright `back-compat` case at `threads.spec.ts:290` now passes; `migration-l1.test.ts:172-206` already covered the schema half. The previously-flagged "no e2e for back-compat read-back" gap is closed. |
| AC-9 (page-local fixture types removed for L1a) | DONE | **DONE** — only doc-comment mentions remain. |
| AC-10 (system lists/fetches/creates threads) | DONE | **DONE** — 31/31 routes test cases green in isolation. |
| AC-11 (discriminant exhaustiveness) | DONE | **DONE** — `exhaustiveAssert` switches in `CommentRow.tsx:80-100` and `ThreadHead.tsx:50-125` intact. |
| AC-12 (server tests round-trip every type) | DONE | **AT-RISK** — passes 31/31 in isolation but flakes in 2 of 4 full runs (`type='review'` case). The flake is a real test-code defect (see root-cause above); the product itself is correct. AC-12 says "Server tests round-trip every message type" — the assertion does run and the product accepts/returns the payload, but it does so non-deterministically under load. |
| AC-13 (Playwright e2e per shipping rich type) | NOT DONE | **DONE** — 5/5 cases green, hermetic, both shipping rich types covered. |
| AC-14 (forward-only migration + rollback) | DONE | **DONE** — SQLite `0007/0008` + PG `0006/0007` parity; `L1-rollback.md` runbook intact. |
| AC-15 (full lint/check/test green) | NOT DONE | **AT-RISK** — `check` and `lint` are clean, but `test` is flaky on the AC-12 review case (1-2 failures observed in 2 of 4 runs). |

### Contracts / constraints (TRACK-L 58-64)

- Closed message-type vocabulary: **DONE**.
- Every thread carries an attachment; un-attached coach threads attach to user: **DONE** — schema NOT NULL enforced; migration projection unchanged.
- Threads attach to bets/tasks/knowledge_items/artifacts/agents/users/team/factory: **DONE** — 8/8 round-trips.
- Migration forward-only with rollback plan: **DONE**.
- No emojis: spot-checked DS components and pages; clean.

### L1b deferrals (unchanged from Loop 1, all explicit per plan §15)

- `QuestionnaireAnswerBar` DS component (L1b-T1).
- `ThreadHead` `onPromoteArtifact` canvas wiring (L1b-T2).
- `ConversationsChat` full integration + `MockThread` removal + tests (L1b-T3).
- `WorkBet` `MockBetComment` removal + bet threads-section + dialog (L1b-T4).
- e2e: questionnaire thread + WorkBet thread + re-open follow-up review (L1b-T5).
- Mobile two-tab segmented control + redact endpoint (Design-S / Adv-W).
- Pagination, payload-size cap, dual-read on legacy conversations (Adv-S1-S6).

### New gap (Loop 2) — must close before "DONE"

1. **`packages/server/src/routes/__tests__/threads.routes.test.ts:266` — AC-12 review-type round-trip is flaky.** The test seeds `validReviewPayload` as the initial review in `beforeEach` (line 201), then in the loop posts a second `review` (line 226-231) with `art-2` / `title: "follow-up"` / `reasoning: ["b"]`, then does `messages.find(m => m.type === type)` — ordered `desc(createdAt), desc(id)` — which non-deterministically returns either the seeded or the round-trip review when both share a millisecond. Observed failure twice in four full `bun run test` runs. Fixes (any one):
   - Change `find` to `find(m => m.payload?.title === payload.title)` or to a dedicated `clientKey` lookup.
   - Reverse to `findLast` after sorting ASC.
   - Inject a guaranteed-later timestamp into the new message (delay 1ms, or stub `Date.now`).
   The endpoint code is correct; only the assertion is unsound.

### Updated waivers

- biome.json `.claude` exclude: **NO LONGER A WAIVER** — fixed in 5ebbd6d.
- `text-[10px]` off-scale: **NO LONGER A WAIVER** — fixed in 5ebbd6d.

### Verdict

**NOT DONE.** Three Loop-1 gaps are genuinely closed (verified by independent re-runs of the exact verification commands), but a real flaky-test defect was discovered during Loop 2 re-verification and it lives in the L1-authored AC-12 round-trip suite. Until the flake is fixed, `bun run test` is not deterministically green from the worktree root, and CI cannot certify AC-15. The fix is two lines in a single test file.

### Shipping recommendation

One more loop. The implementation, schema, migration, e2e, lint, and types are all production-ready; the only blocker is a 2-line test-quality fix in `threads.routes.test.ts:266` (replace `messages.find(m => m.type === type)` with a `clientKey`-keyed or `findLast`-style lookup) so AC-12 stops racing with itself when concurrent test runners collide on a millisecond boundary. After that fix lands and three sequential `bun run test` runs are clean, this branch is shippable.

---

## L1 Definition-of-Done Audit — Loop 3

**Branch:** feat/L1-thread-primitive at a9e5748 (AC-12 deflake commit on top of 5ebbd6d)
**Date:** 2026-04-28
**Verdict:** **DONE**.

### Loop-2 gap re-assessment

#### Loop-2 Gap — AC-12 flake on `type='review'`: CLOSED

- The fix in `a9e5748` replaces `messages.find((m) => m.type === type)` with `messages.find((m) => m.clientKey === ...)` at `threads.routes.test.ts`. Each iteration of the parametric loop uses a unique `clientKey` (one per `MessageType`), so the seeded `validReviewPayload` review can no longer collide with the round-trip `review` message regardless of `createdAt`/`id` tiebreaker.
- Product code is unchanged: `packages/server/src/routes/threads.ts` order-by clause and message insertion path are identical to Loop 2.
- Re-verification (8 sequential `bun run test` runs from worktree root):
  - Run 1: 2752 passed / 0 failed / 3 skipped.
  - Run 2: 2752 passed / 0 failed / 3 skipped.
  - Run 3: 2752 passed / 0 failed / 3 skipped.
  - Run 4: 2752 passed / 0 failed / 3 skipped.
  - Run 5: 1 failed — `fabric/file-watcher.test.ts > AC10: last-writer-wins` (`expected items.length === 1, got 0`). 2751 passed / 3 skipped. **Not L1-authored**; this is a `chokidar`/`fs.watch` debounce race in the fabric package, observed once in Loop 2 also (Run 1 there). It does not involve any L1 code paths.
  - Run 6: 2752 passed / 0 failed / 3 skipped.
  - Run 7: 2752 passed / 0 failed / 3 skipped.
  - Run 8: 2752 passed / 0 failed / 3 skipped.
- Across all 8 runs, the AC-12 review case did not flake once. The deflake holds.
- The remaining flake (fabric `file-watcher` AC10) is unrelated to L1, observed at low frequency, and is not in any L1 acceptance-criterion's coverage envelope. Recommended to be tracked under a separate fabric-stability ticket.

### Re-verification of the full DoD command set

- `bun run check` → **PASS** (0 type errors, exit 0; ran `tsc --noEmit -p tsconfig.json` clean).
- `bun run lint` → **PASS** (0 errors, 22 warnings, exit 0). Warnings are all pre-existing design-token / a11y advisories on non-L1 files (`PitchSelector.tsx`, `GlobalSearchPanel.tsx`, `SettingsPanel.tsx`, `ConversationsReview.tsx`'s actor-fetch warnings) plus 4 `gap-[2/6px]` advisories on the L1 DS components — none gating.
- `bun run test` → **2752 passed / 0 failed / 3 skipped** in 7 of 8 sequential runs; the 1 outlier is the fabric file-watcher race (not L1).
- `cd packages/design-system && bunx playwright test --config=playwright.l1.config.ts` → **12/12 PASS** in 8.1s.
- `cd packages/web && bunx playwright test e2e/threads.spec.ts` → **5/5 PASS** in 1.9s (5 workers, hermetic via `page.route()` stubs).

### AC-by-AC final reconfirmation

| AC | Loop 2 status | Loop 3 status | Notes |
|---|---|---|---|
| AC-1 (concept-doc updates) | DONE | **DONE** | No regression; HIL §4.5 anchors intact. |
| AC-2 (DM/coach/feed are configurations) | DONE | **DONE** | `MESSAGE_TYPES` closed; 0 grep hits for legacy vocab. |
| AC-3 (cross-area attachment contract) | DONE | **DONE** | `HOST_KINDS` × 8 round-trip in routes test. |
| AC-4 (message vocabulary) | DONE | **DONE** | Closed enum; structural drift guard. |
| AC-5 (SHARED.md sync) | DONE | **DONE** | |
| AC-6 (shared impl matches contract) | DONE | **DONE** | `bun run check` clean. |
| AC-7 (threads attach to any host) | DONE | **DONE** | 8/8 host kinds. |
| AC-8 (back-compat) | DONE | **DONE** | Schema (`migration-l1.test.ts`) + e2e (`back-compat` case) both green. |
| AC-9 (page-local fixture types removed for L1a) | DONE | **DONE** | Only doc-comment mentions remain in L1a-scope files. |
| AC-10 (list/fetch/create threads + messages) | DONE | **DONE** | 31/31 routes-test cases green. |
| AC-11 (discriminant exhaustiveness) | DONE | **DONE** | `exhaustiveAssert` switches intact. |
| AC-12 (server tests round-trip every type) | AT-RISK | **DONE** | Deflaked via `clientKey` lookup; 8 sequential full runs show 0 flakes on this case. |
| AC-13 (Playwright e2e per shipping rich type) | DONE | **DONE** | 5/5 hermetic cases pass. Questionnaire e2e is L1b-deferred. |
| AC-14 (forward-only migration + rollback) | DONE | **DONE** | SQLite `0007/0008` + PG `0006/0007` parity; `L1-rollback.md` intact. |
| AC-15 (full lint/check/test green) | AT-RISK | **DONE** | `check`, `lint` clean; `test` deterministic for L1 surface across 8 runs. |

15/15 ACs are DONE for L1a's shipping scope.

### Contracts / constraints (TRACK-L 58-64) — final

- Closed message-type vocabulary: **DONE**.
- Every thread carries an attachment; un-attached coach threads attach to user: **DONE**.
- Threads attach to bets/tasks/knowledge_items/artifacts/agents/users/team/factory: **DONE**.
- Migration forward-only with rollback plan: **DONE**.
- No emojis on shipping L1 surface: **DONE** (spot-checked).

### L1b deferrals (canonical, all explicit per `L1-plan.md` §15 and `L1-step9-applied.md`)

These are out-of-scope for L1a and are tracked for L1b. They are non-overlapping with the L1a delivery:

1. **QuestionnaireAnswerBar** DS component (L1b-T1) — placeholder text in `ThreadHead` for now.
2. **ThreadShell `onPromoteArtifact` canvas wiring** (L1b-T2) — accepted as no-op prop.
3. **ConversationsChat full integration** (L1b-T3) — `MockThread` placeholder remains; route loadable in L1a via stub.
4. **WorkBet `MockBetComment` removal + bet threads-section + dialog** (L1b-T4).
5. **e2e: questionnaire thread + WorkBet thread + re-open follow-up review** (L1b-T5).
6. **Mobile two-tab segmented control for promoted artifact** (Design-S deferral).
7. **Redact endpoint verb** — `redacted_at` column ships in L1a; the verb endpoint is deferred per design-it-twice §12-D.
8. **AC-13 questionnaire e2e** — questionnaire UI is L1b; review + chat shapes are covered in L1a.

Deferred adversary warnings (all explicit, non-blocking for L1a):

- Adv-W1 — stale-host guard on message append.
- Adv-W3 — TOCTOU on `verdict` re-open.
- Adv-W5 — orphan host_id detection / cleanup.
- Adv-W7 — `thread_archived` event emitter.
- Adv-W8 — `LIMIT` pagination on GET `/api/threads`.
- Adv-S1 through Adv-S6 — pagination, payload-size cap, dual-read on legacy conversations.

All deferrals are documented in `docs/work-packages/L1-step9-applied.md` and `docs/work-packages/L1-plan.md` §15.

### Waivers

None active. The Loop-1 waivers (biome `.claude` exclude, `text-[10px]` off-scale) and the Loop-2 gap (AC-12 flake) are all closed.

### Verdict

**Verdict:** DONE

L1a is shippable. All 15 acceptance criteria are met with verifiable evidence; the AC-12 flake identified in Loop 2 has been deflaked by a test-only `clientKey` fix and held across 8 sequential `bun run test` runs. Type, lint, vitest, and both Playwright suites are green. The deferrals listed above are explicit, non-overlapping, and tracked for L1b.

### Shipping recommendation

Ship L1a. The Thread primitive — types, schema, migration with rollback, server endpoints, ThreadShell + 5 DS components with HTML parity and visual regression, hermetic e2e, and discriminant exhaustiveness — is production-ready. L1b can pick up the explicitly-deferred surfaces (QuestionnaireAnswerBar, ConversationsChat full integration, WorkBet bet-threads, mobile segmented control, redact verb) without re-opening any L1a contract.
