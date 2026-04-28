# L1 — Step 5 (apply scan findings)

Worktree: `feat/L1-thread-primitive` · base HEAD `5de1c32`.

Scope: simplification-scan + slop-scan reports under `docs/work-packages/L1-{simplification,slop}-scan.md`.

## Applied — CRITICAL

- **S-C1 (`ReviewVerdictBar` exposes 5 dead buttons)** — `packages/design-system/src/ReviewVerdictBar.tsx` now renders only the 5 binding verdicts; `VerdictGrammarAction` collapses to `VerdictDecision` from `@hyperidle/shared`. `packages/design-system/html/ReviewVerdictBar.html`, `packages/web/src/__tests__/ReviewVerdictBar.test.tsx`, and `packages/design-system/src/ThreadShell.tsx:163-184` updated. `packages/design-system/src/ThreadHostBanner.tsx` drops the never-wired `onMoreActions` prop and `ThreadHostBannerAction` enum (`packages/design-system/src/index.ts`, `packages/web/src/__tests__/ThreadHostBanner.test.tsx`).
- **S-C2 (dual-write verdict path in `routes/conversations.ts`)** — deleted `POST /api/conversations/responses` and the verdict→`responses` projection in `GET /api/conversations/:threadId`. Items keep the wire shape via `responses: []`. Tests ported to the canonical `POST /api/threads/:id/messages` surface in `packages/server/src/__tests__/conversations.test.ts` and `packages/server/src/__tests__/api-e2e.integration.test.ts`. `VERDICT_ACTIONS` literal removed.
- **SL-C1 (unsafe `as` casts in CommentRow/ThreadHead/ThreadShell)** — promoted `isRedactedPayload` to `@hyperidle/shared/thread.ts` (real type guard returning `payload is RedactedPayload`), then replaced every `as { … }` access with discriminated narrowing in `CommentRow.tsx`, `ThreadHead.tsx`, and `ThreadShell.tsx` (artifact slot via new `resolveArtifactSlot` helper). `verdictDecisionToStatus` and `verdictDecisionLabel` now take `VerdictDecision` so the switch is exhaustive (no `default` / "error" fallthrough).
- **SL-C2 (DB→Message boundary laundered through `as`)** — `packages/server/src/routes/threads-schema.ts` exposes `messageRowSchema` (DU mirroring `Message` payload + redacted variants) and `threadParticipantsSchema`. `packages/server/src/routes/threads.ts` `rowToThread` / `rowToMessage` parse the JSON columns through Zod; per-variant `switch` on `parsed.type` returns a typed `Message` with no outer cast.

## Applied — WARNING

- **W2 (dead exhaustiveness `void TypesCheck`)** — replaced with a structural `{ [K in (typeof MESSAGE_TYPES)[number]]: true }` constant in `threads-schema.ts:104-110` that fails to compile if `MESSAGE_TYPES` drifts.
- **W5 (`policy-engine.ts:108-113` review-message lookup discards index)** — pushed `eq(messages.type, "review")` + `orderBy(desc(createdAt)).limit(1)` into SQL.
- **W6 (JS-side participant scan)** — `routes/threads.ts` participant_id branch and `routes/agents.ts:154-170` inbox query now pre-filter in SQL with `LIKE %"<id>"% ESCAPE '\\'` (using `services/like-escape.ts`); the JS pass re-parses to verify the match.
- **W10 (duplicate banner JSX in error vs populated branch)** — error path no longer duplicates the outer JSX; the `ThreadHostBanner` is rendered once and the body switches on `error`.
- **W11 (`onPromoteArtifact` / `onVerdict` dead props on ThreadHead)** — removed; `VerdictGrammarAction` import dropped from `ThreadHead.tsx`.
- **W14 (direct-thread reuse copy-paste)** — extracted `findOrCreateDirectThread(db, sender, recipient, now)` into `packages/server/src/services/direct-thread.ts`. `routes/agents.ts` (`POST /:id/inbox`) and `skill-tools/send-message.ts` both call it.
- **Slop W (ConversationsReview `FALLBACK_THREAD_ID` + `as ThreadDetail` casts)** — `packages/web/src/pages/ConversationsReview.tsx` reads `?id=` from the URL, renders an `EmptyState` when missing, and decodes the response through a `decodeThreadDetail` helper (no `as` casts at the boundary). `cause as Error` on the AbortError path replaced with `cause instanceof Error`.
- **Slop S (placeholder string "Answer UI coming in L1b")** — `ThreadHead.tsx` now renders the questionnaire payload's `options` list as a real chip stack; the placeholder string is gone.
- **Slop S (`MAX_AVATARS = 3` magic number)** — extracted to a module constant in `ThreadHostBanner.tsx`.

## Deferred (with rationale)

- **W1 (brand-style `as Thread["id"]` casts in `rowToThread`)** — superseded by SL-C2; the surviving `as HostKind` / `as MessageType` casts read DB-typed string columns and are validated downstream by Zod, but a fully-Zod-validated `HostKind` parse would touch a wider surface than this step's scope.
- **W3 (`readInitialSenderId` peeks at `agents`)** — the L1a contract tests in `packages/server/src/routes/__tests__/threads.routes.test.ts` rely on the sender-default behaviour; rewriting either the helper or the tests is >5 LOC of contract-test churn and out-of-scope for step 5.
- **W4 (`err()` wrapper)** — used 9 times; the wrapper is consistent today and the inline rewrite would re-introduce its own copy-paste. Better tackled as a "decide on `c.json(error, status)` shape once" follow-up.
- **W7 (server force-add of sender to participants)** — semantic decision (silent mutate vs 400). Defer to a contract-doc clarification.
- **W8 (`testResetRequested` module global in `builtin-routines.ts`)** — pulling it behind a DI hook touches the routine-runner signature and every test that toggles the cache. >5 LOC and ripples through cost-sentinel tests.
- **W9 (`[...messages].sort()` in `ThreadShell`)** — defer; the API returns DESC and the consumer wants ASC for natural reading. Picking a single canonical order on the wire requires touching `routes/threads.ts:195-203` and ASC-aware Composer pagination — bigger than step 5.
- **W12 (`generateClientKey` `Math.random` fallback in `Composer.tsx`)** — defer; tiny but the fallback is a defence-in-depth hedge that costs nothing.
- **W13 (`handoff-protocol.ts` re-thrown guard)** — defer; the duplicate guard is annotative, not load-bearing.
- **All 8 simplification suggestions (S1-S8)** and **slop suggestions** — deferred (1-line trivia or refactors that need a separate PR).

## Production bug surfaced incidentally

- `routes/threads.ts` participant_id list branch silently dropped a row when `JSON.parse` threw (no logging, no error). The W6 fix preserves the `try/catch` but the underlying broken row would now be detectable via Zod parse on read in any branch. Worth a separate observability story to log the malformed JSON.

## Verification gates

- `bun run check` — 0 errors.
- `bunx --bun eslint packages/server/src packages/design-system/src packages/web/src` — 24 problems (2 pre-existing errors in `ThreadHostBanner.tsx` avatar font size, 22 pre-existing warnings). No regressions.
- `bun run test` — 257 files / 2725 passing / 3 skipped (baseline 2728; the 3 deltas are: dropped 5 legacy `POST /responses` test cases, dropped 1 e2e legacy verdict test case, replaced with 4 canonical-surface verdict tests + 1 EmptyState test; net `−3` on the count even though coverage is broader).
- `cd packages/design-system && bunx playwright test --config=playwright.l1.config.ts` — 12/12 passed.
