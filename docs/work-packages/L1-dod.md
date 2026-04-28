## L1 Definition-of-Done Audit

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
