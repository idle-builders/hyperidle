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
- **Design-W1 (approved.md update)** — `docs/design-explorations/L1/approved.md` §2.3 now carries an inline "L1 Step 5 amendment" paragraph documenting the dropped 5 buttons; §11 rejection list adds the 5 dropped buttons to the locked list.
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
