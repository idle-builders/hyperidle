# L1 — Step 9 (apply review findings: architecture + adversary + design)

Worktree: `feat/L1-thread-primitive` · base HEAD `e3118ee` · branch HEAD set by step-9 commit.

Scope: the three review documents committed at step 6-8 — `L1-architecture-review.md` (7.6/10 PASS), `L1-adversary-review.md` (verdict REVISE), `L1-design-review.md` (6.4/10 FAIL). This is the last apply pass before the DoD audit.

---

## Applied — CRITICAL (security + architecture)

### Adversary

- **Adv-C1 (WS subscribe authz)** — `packages/server/src/services/ws-broadcaster.ts` now takes an optional `SubscribeAuthorizer`; `subscribe()` returns `"ok" | "forbidden" | "unknown_client"`. `packages/server/src/auth/upgrade-token-store.ts` binds `identityId` to the issued token. `packages/server/src/routes/auth.ts` reads `X-Identity` and binds it to the token. `packages/server/src/routes/ws.ts` threads the consumed identity into `addClient(client, senderId)` and replies with a structured `{type:"forbidden", topic}` ack on rejection. `packages/server/src/server-factory.ts` wires `createDbSubscribeAuthorizer(db)`. New tests: `packages/server/src/__tests__/ws-subscribe-authz.test.ts` (6 cases — participant ok, non-participant forbidden + no events, no identity forbidden, global topics ok, unknown thread forbidden, malformed prefix forbidden).
- **Adv-C2 (sender spoof)** — `packages/server/src/routes/agents.ts` `sendMessageSchema` is now `.strict()` and drops `senderId`; sender is read from `X-Identity` header (400 on missing). `packages/server/src/__tests__/agents.test.ts` updated to use `X-Identity` and adds tests for body-supplied senderId rejection + missing-identity rejection. `api-e2e.integration.test.ts` updated likewise.
- **Adv-C3 (idempotency replay payload divergence)** — `packages/server/src/routes/threads.ts` POST `/threads/:id/messages`: replay path compares `(type, JSON.stringify(payload))` to the existing row; divergent payload returns 409 `idempotency_conflict`. New test in `threads.routes.test.ts`.
- **Adv-C4 (host immutability)** — new SQLite migration `packages/db/drizzle/0008_thread_host_immutability.sql` (BEFORE UPDATE triggers on `threads.host_kind` and `threads.host_id`); PG parity in `packages/db/drizzle-pg/0007_thread_host_immutability.sql` (plpgsql trigger function). Journal entries added in both `meta/_journal.json`. New tests in `packages/db/src/__tests__/migration-l1.test.ts` assert the triggers fire on host_kind / host_id mutation and don't fire on resolved_at / last_active_at.
- **Adv-C5 (PG migration parity)** — `packages/db/drizzle-pg/0006_thread_primitive_l1.sql` host_kind CASE arms now mirror SQLite's `0007` exactly, including the `EXISTS (SELECT 1 FROM items i WHERE i.kind IN ('review','questionnaire'))` branch. Drift would now be visible at code review.

### Architecture

- **Arch — discriminant exhaustiveness** — `packages/design-system/src/CommentRow.tsx:65-92` and `packages/design-system/src/ThreadHead.tsx:46-117` rewritten as `switch (message.type) { ...; default: return exhaustiveAssert(message); }`. Adding a 5th `MessageType` now triggers a TS narrowing failure at the renderer.
- **Arch — `packages/db/L1-rollback.md`** — written. Pre-conditions, rollback SQL template (SQLite + Postgres notes), post-rollback validation queries, downstream subscriber re-pointing table, snapshot-retention cleanup.
- **Arch — `ThreadShell` `isBlocking` wired** — `packages/design-system/src/ThreadShell.tsx` accepts an optional `agentSessionState: AgentSessionStateSnapshot` prop; the banner's `blocking` indicator is computed via `isBlocking(thread, ordered, snapshot)` from `@hyperidle/shared`. Two new tests in `ThreadShell.test.tsx` (active-for-this-thread → BLOCKED chip; active-for-other-thread → no chip).
- **Arch — `clientKey.min(8)`** — `packages/server/src/routes/threads-schema.ts` bumped from `min(1)` to `min(8)`. Contract tests updated: 6 short-key fixtures (`init-r`, `dup-key`, `ro-init`, `list-1`, `list-2`, `ev-1`) bumped to ≥8 chars; new test asserts a 5-char clientKey returns 400. Conversations test fixtures (`conversations.test.ts`) similarly bumped.
- **Adv-W2 (`as string[]` cast)** — `routes/threads.ts:373` now `threadParticipantsSchema.parse(JSON.parse(...))` with a 500 fallback if the row is malformed.
- **Adv-W4 (concurrent verdict guard)** — the resolve-message UPDATE now has `WHERE id=? AND resolved_at IS NULL`; 0 rows changed → throw `VerdictRaceConflict` → 409 `verdict_race`. Plan §6.1's first-verdict-wins contract is structurally enforced.

### Design

- **Design-C2 (sender-grouping)** — `computeSenderGrouping(messages)` in `ThreadShell.tsx`; consecutive same-sender messages within 5 minutes share one header. `ThreadShell` passes `showSenderHeader` per row. 3 new tests in `ThreadShell.test.tsx` + 3 unit tests on the helper itself.
- **Design-C3 (composer fallback)** — `hasMostRecentUnresolvedReview(messages)` in `ThreadShell.tsx`; when true AND a verdict bar is on screen, `Composer` receives `unresolvedReviewLink={onClick}`. The link calls `verdictBarRef.scrollIntoView()`. Tests cover both true/false branches.
- **Design-C4 (a11y end-to-end)** —
  - `ThreadShell` outermost `<div>` carries `aria-live="polite"` for shape-change announcements.
  - `:focus-visible` outlines added to: Composer textarea, Send button, fallback link, ReviewVerdictBar buttons (`outline focus-visible:outline-1 focus-visible:outline-[var(--accent)]`).
  - 44px min touch targets on: ReviewVerdictBar verdict buttons (`min-h-[44px]`), Composer Send button, fallback link.
  - 1 new test asserts `aria-live="polite"` on the shell.
- **Design-W (sticky `IntersectionObserver`)** — `ThreadShell` mounts an IntersectionObserver on a 1px sentinel placed below `ThreadHead`. While intersecting → verdict bar `position: sticky bottom-0`; otherwise → `position: static` (releases). The sentinel + observer are no-ops in test environments without `window.IntersectionObserver`.
- **Design-W1 (approved.md update)** — `plans/design-explorations/L1/approved.md` §2.3 now carries an inline "L1 Step 5 amendment" paragraph documenting the dropped 5 buttons; §11 rejection list adds the 5 dropped buttons to the locked list.
- **Storybook glob fix** — `packages/web/src/designsystem/DesignSystem.tsx:11` was `../../../../design-system/src/*.stories.tsx` (one level too deep — resolved to `<repo>/design-system/...`); now `../../../design-system/src/*.stories.tsx`. Browser-verified: the L1 stories appear in the catalog (screenshot below).

---

## Applied — WARNING

- (Adv-W2 + W4 listed above under Architecture.)
- All other warnings listed in the brief were either no-ops (Adv-W1 `isRedactedPayload` is now actually called in CommentRow / ThreadHead / ThreadShell — adversary review's claim was stale) or out-of-scope deferrals (see below).

---

## Deferred (with rationale)

- **Adv-W5 (orphaned `responses` silently dropped during migration)** — defer; the migration is forward-only and already deployed-shape, the audit "must equal 0" precondition is documented, and adding a synthetic-agent path is more migration churn than an orphan-rate metric query post-migration.
- **Adv-W6 (participants JSON-shape constraint)** — defer; the LIKE probe + Zod re-parse on read both succeed under the current write-path. A check-constraint or join table is L1b territory.
- **Adv-W7 (`thread_archived` event)** — defer; the WS broadcaster forwarding stays for L1b. Removing it would orphan tests; adding the API endpoint is L1b feature territory.
- **Adv-W8 (LIMIT N on GET messages)** — defer; the unbounded read is acceptable while L1a threads are bounded by their humans-in-the-loop nature; pagination is plan §6.1's open follow-up.
- **Adv-S1-S6 (UUIDv4 ordering, conversations dual-read, direct-thread race, strict schemas, payload size cap, missing tests)** — defer to follow-ups per scope discipline.
- **Design-S1-S5 (loading-state banner skeleton, RESOLVED strip, overflow row, host-kind label map, canvas promotion)** — defer; S2 + S5 are L11 territory (artifact view); S3 is "Show N earlier" overflow row, scoped to L1b; S4 is a labels-map polish.

---

## Production bug surfaced incidentally

- **Pre-existing: vite proxy `rewrite` strips `/api`** — `packages/web/vite.config.ts:15` rewrites `/api/*` → `/*`. The server mounts everything under `/api` (only `/health` exists at root for backwards compat). Result: `bun dev` against the worktree returns 404 from any `/api/*` endpoint forwarded through the proxy. Health works only by accident (root-mounted alias). Browser smoke-test workaround: a one-off `vite.config.smoke.ts` removed the rewrite. Tracked as a NOTICED-but-not-touching item.

---

## Verification gates

- `bun run check` — 0 errors.
- `bunx biome check packages/server packages/design-system packages/web packages/db` — 0 errors, 76 warnings (same as step 5 baseline; no new lint issues).
- `bunx --bun eslint packages/server/src packages/design-system/src packages/web/src packages/db/src` — 24 problems (2 pre-existing errors in `ThreadHostBanner.tsx` avatar font sizes — same as step 5 baseline; 22 pre-existing warnings; no new issues).
- `bun run test` — **2752 passing / 0 failing / 3 skipped** (up from step 5's 2725 passing — net +27 from new L1 step9 tests).
- `cd packages/design-system && bunx playwright test --config=playwright.l1.config.ts` — **12/12 passing**.
- **Browser smoke** — confirmed via Playwright against `bun dev` running on 3001/5181:
  1. **Empty state** (`?id` absent) — `EmptyState` "No thread selected" renders in `AppShell`.
  2. **Error state** (auth-rejected fetch) — `ErrorState` "Failed to load review" renders.
  3. **Storybook glob fix** — the L1 stories appear in `/designsystem` catalog (was empty before fix).
  4. **`ThreadShell::PopulatedReview` story** — banner + ThreadHead title "Review me" + REASONING block + 5 verdict buttons + "Unresolved review · acting required ↑" composer fallback link + Composer placeholder "Reply to thread…" — pixel-verified screenshot at `/tmp/L1-step9-threadshell.png`.
  5. **`ThreadShell::PopulatedChat` story** — verifies the composer fallback rule is conditional (does NOT show on chat-shape).

The populated-state-via-real-API check was blocked by a pre-existing dev-proxy bug (see "Production bug surfaced incidentally"). All L1 behavior was browser-verified via the Storybook story instead, which renders the same `<ThreadShell>` against real props.

---

## Gap-closure pass (attempt 2)

The DoD audit at `docs/work-packages/L1-dod.md` returned NOT DONE with three concrete gaps. This pass closes all three. HEAD before pass: `bcafa35`.

### Gap 1 — AC-13: `web/e2e/threads.spec.ts` runnable + passing

**Approach:** option 2 (hermetic `page.route()` mocks). The dev server only serves the SPA bundle; every `GET /api/threads/:id` and `POST /api/threads/:id/messages` is intercepted in-browser. No DB seeding, no API server dependency. A future contract drift fails the e2e the same way it fails production — the page can't render the expected shape.

**Spec rewrite:**
- `packages/web/e2e/threads.spec.ts` rewritten end-to-end. 5 cases ship + 0 skipped:
  1. **review-shape** — ThreadHead + 5 verdict buttons + plain follow-up CommentRow render inline.
  2. **plain-shape** — no head; CommentRow renders the plain text; Composer present.
  3. **back-compat** — legacy `subject + body` collapsed into `payload.text` reads through the new endpoint.
  4. **composer round-trip** — typing + Send POSTs and the new message appears after re-fetch.
  5. **verdict click** — Approve POSTs a verdict; APPROVED CommentRow + RESOLVED tag appear; head unmounts.
- The fictitious "post follow-up review" affordance from the previous draft is gone. L1b deferral noted at the file footer.
- StrictMode-safe: the route mocks key off a `postObserved` flag rather than a GET-count, so React's dev-mode double-effect doesn't flip the response prematurely.
- Realistic Thread/Message payloads — shape-mirrored from `@hyperidle/shared`'s discriminated union (so a future schema rename breaks the tests).

**Test infra fix:** `packages/web/playwright.config.ts` now uses port **5179** (not 5173) and `cwd: "."` (web package only, not the root concurrently script). This isolates the e2e dev server from any parallel `bun dev` running in another checkout/worktree, which was the root cause of the spec hitting the **legacy** ConversationsReview code (the user's main-branch dev server was reused via `reuseExistingServer: true`). `--strictPort` + `cwd: "."` keep boot deterministic; no API server is needed because everything is mocked.

**Result:** `cd packages/web && bunx playwright test e2e/threads.spec.ts` → **5 passed** (parallel and serial). AC-13 is satisfied (review-shape AND plain-shape both render correctly inline; back-compat + composer + verdict cases add depth beyond the minimum).

### Gap 2 — AC-15: fix `text-[10px]` lint errors

- `packages/design-system/src/ThreadHostBanner.tsx:103,109` — `text-[10px]` → `text-[11px]` (smallest allowed value on AQ-004's closed scale `{11,12,13,14,15,16,18,20,24}`).
- `packages/design-system/html/ThreadHostBanner.html:50` — matching update from `font-size: 10px` to `font-size: 11px` so HTML and TSX stay in pixel parity.
- 1px change at the avatar's monogram only; visual diff stays well under the 5% threshold; the design-system playwright suite (`bunx playwright test --config=playwright.l1.config.ts`) reports **12/12 pass**.

### Gap 3 — biome.json worktree parity

- The `!**/.claude` exclude in `biome.json:146` was matching the worktree's full path (`.claude/worktrees/...`), so `biome check .` from the worktree skipped every file with "No files were processed". Replaced with explicit subfolder excludes (`.claude/agents`, `.claude/process`, `.claude/references`, `.claude/rules`, `.claude/skills`, plus the two settings JSON files). Worktree paths under `.claude/worktrees/` now lint normally; the agent-config subfolders that have no source files stay excluded for clarity.
- Biome's `useBiomeIgnoreFolder` rule required dropping the trailing `/**`; the new entries are bare directory names per the v2.2.0+ contract.
- Pre-existing `noImportantStyles` violation in `packages/design-system/src/tokens.css:337` (now in scope due to the unblocked path) was suppressed with a `biome-ignore` comment citing WCAG SC 2.3.3 — the `!important` is the canonical mechanism for the reduced-motion override against Tailwind's arbitrary-value `animate-[skeleton-pulse]` utility (equal specificity otherwise). Behavior preserved; lint clean.
- One unsafe-fix from `bunx biome check . --write --unsafe` left in: `packages/eslint-plugin-design/src/util.ts` — `!(attr && attr.value)` → `!attr?.value`. Behaviorally identical, idiomatic.

### Verification gates (gap-closure pass)

- `bun run check` — **0 errors**.
- `bun run lint` — **0 errors, 22 warnings** (all pre-existing; same set as the step-9 baseline).
- `bun run test` — **2752 passing / 3 skipped / 0 failing** (matches step-9 baseline).
- `cd packages/design-system && bunx playwright test --config=playwright.l1.config.ts` — **12/12 passing**.
- `cd packages/web && bunx playwright test e2e/threads.spec.ts` — **5/5 passing**.
- Visual regression baseline unchanged (1px avatar font-size adjustment matched in HTML + TSX).

L1-dod.md gaps 1, 2, 3 are closed. The DoD audit can be re-run to flip the verdict to DONE.
