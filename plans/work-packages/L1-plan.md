# L1 — Thread primitive: Architecture plan

**Story.** TRACK-L L1, split (post adversary review) into:
- **L1a** — foundation (this plan, ~4d): concept-doc updates, shared types, DB migration, REST endpoints, Event Bus + WS, ThreadShell + ThreadHostBanner + ThreadHead + ReviewVerdictBar + CommentRow + Composer with HTML references and visual regressions, ConversationsReview integration, e2e back-compat.
- **L1b** — follow-up (named here, planned separately, ~2d): QuestionnaireAnswerBar component, ThreadShell `onPromoteArtifact` canvas wiring, ConversationsChat full integration (route stays loadable in L1a via protected tests), WorkBet `MockBetComment` removal + bet threads-section.

**Status.** Plan for **L1a**; input to `/architecture-critique`, then `/write-tests`, then `/write-code`. The L1b plan is a separate document (to be drafted post-L1a ship).
**Sources of truth (do not re-litigate).**
- Concept: `docs/HUMAN_INTERFACE_LAYER.md` §4.5 (4.5.1 → 4.5.10).
- Shared contract + migration policy: `docs/work-packages/SHARED.md` (Thread primitive entry).
- Approved design: `plans/design-explorations/L1/approved.md` (sections 1 → 11).
- Story scope: `docs/work-packages/TRACK-L.md` lines 23-66.

This plan decides the *how*: types, schemas, endpoints, file paths, ordered tasks. The concept and the visual contract are fixed inputs.

`route-checklist:` block in §10. `security & abuse cases:` block in §11. `protectedTests:` block in §16. All three are required by `/architecture-critique`.

> **Adversary-revision note (Phase 4).** This document was revised to address 5 CRITICAL findings (concept-doc closed-enum closure for `verdict`; migration step ordering for `responses → verdict messages` mapping; protected-tests incompatibility on `ThreadSections.test.tsx` / `ThreadRow.test.tsx`; verdict authorization model; thread re-open semantics) and 5 high-leverage MAJOR findings (idempotency clientKey shape; Postgres ALTER TABLE / JSONB question; effort honesty / split into L1a+L1b; `daily-digest.ts` + `policy-engine.ts` route-checklist coverage; WebSocket subscribe/unsubscribe protocol). Each fix is anchored in-section where it lands. The revision log is in §17.

---

## Section 1 — Phase 0: Interrogation transcript (autonomous mode)

For each substantive question: my read + 1-2 sentence justification grounded in the spec/concept/design/code.

### Q1 — Smallest useful version of L1?
**Read.** Ship: shared types + DB migration + REST endpoints + Event Bus events + WebSocket per-thread topic + the seven L1 design-system components (`ThreadHostBanner`, `ThreadHead`, `ReviewVerdictBar`, `QuestionnaireAnswerBar`, `CommentRow`, `Composer`, `ThreadShell`) + page integrations on `ConversationsReview.tsx`, `ConversationsChat.tsx`, `WorkBet.tsx`. Defer: the `redact` endpoint (ship the column + constraint, not the verb), the canvas-promotion two-tab segmented control on mobile (defer the mobile fallback to L11), the `Inline-comment` anchor type's actual artifact-position selector (the message type stores the anchor string; the picker UI is L11). Cuts justified per design-it-twice §12 D and Q5/Q6 below.
**Justification.** TRACK-L L1 acceptance criteria (lines 31-45) require shared types + DB migration + back-compat-via-API + Vitest discriminant tests + Playwright e2e per shipping rich type + page-fixture removal. Redaction is a contract item in the migration (column + constraint) but the *operation* surface (`POST .../redact`) has no AC behind it.

### Q2 — "Back-compat preserved" vs "forward-only migration"
**Read.** API-level back-compat, NOT row-level. Existing `MOCK_*`-fed pages re-fetch from the new endpoints and continue to render. The legacy columns (`threads.kind`, `messages.recipient_id`, `messages.subject`, `messages.body`, `messages.file_lease_ids`) are dropped on migrate; legacy rows project per the SHARED.md rules (`threads.kind='coach'` → `host_kind='user'` + pinned, `'review'`/`'chat'` → host inferred from referencing item/task, `subject`+`body` collapse into `payload.text`). The legacy `responses` table is dropped — pre-existing verdict rows project into `verdict`-payload `messages` rows.
**Justification.** SHARED.md Thread-primitive entry, "Migration policy (L1)": forward-only, listed columns dropped, listed projections. The story's "back-compat preserved" is from the user's perspective ("existing review/chat-only data continues to load") — the read path keeps working. Rollback = revert migration; pre-migration snapshot retained for a defined retention window (decision §15-A: 30 days).

### Q3 — 5 binding verdicts vs. 10 verdict actions vs. no keyboard verb shortcuts
**Read.** Three are reconciled, no contradiction. (1) **Five binding verdicts** are concept §4.5.7's "Verdict" definition (`approve`, `approve-with-comments`, `request-changes`, `edit`, `reject`) — they emit a `verdict`-typed message (closed enum entry; see Q3.1) and set `resolvedAt` on the underlying review message. (2) **Ten verdict-grammar actions** is the SHARED.md catalogue: 5 binding + 3 non-binding (`comment`, `inline-comment`, `reply` emit a `plain` message in the thread) + 2 sidecar (`snooze`, `escalate` emit no message). (3) **No keyboard verb shortcuts** — the SHORTCUTS column in the SHARED.md "10 verdict actions" line is informational legacy and is NOT implemented in L1's components. The current `PREFILL_KEYS` map in `ConversationsReview.tsx:110-116` is removed in L1's page rewrite.
**Justification.** Concept §4.5.7 vocabulary table is explicit on the binding subset. SHARED.md keeps the 10-row table as the action vocabulary catalogue. Approved design §5 keyboard row says "NO verb shortcuts (founder-rejected)" and section 11 lists "Keyboard verb shortcuts" on the rejection list.

### Q3.1 — Adding `verdict` to the closed message-type enum (concept-doc closure rule)
**Read.** Concept §4.5.1 line 504 enumerates `Initial set: plain, review, questionnaire`, and §4.5.8 line 604 closes the enum with the hard rule: *"Adding a new message type requires updating this section first."* The Q3 / Decision §12-B choice (adopt `verdict` as a fourth type) therefore REQUIRES a concept-doc update **as part of L1a's commit**. The plan handles this via task T0 (§13). The concept-doc diff:
- `docs/HUMAN_INTERFACE_LAYER.md` §4.5.1 line 504 → `Initial set: plain, review, questionnaire, verdict.`
- `docs/HUMAN_INTERFACE_LAYER.md` §4.5.8 closure rule line 604 → `Message-type vocabulary is closed: plain, review, questionnaire, verdict.`
- `docs/HUMAN_INTERFACE_LAYER.md` §4.5.8 *Verdict semantics* paragraph: a `verdict`-type message carries `decision` (one of the 5 binding actions) AND `resolvesMessageId` pointing at the review/questionnaire message it terminates. Plain messages (the comment / inline-comment / reply non-binding actions) continue to be `type='plain'`.
- `docs/work-packages/SHARED.md` Thread primitive entry's `Message types (closed)` line → `plain | review | questionnaire | verdict`.
- `docs/ARCHITECTURE.md` §2.1 messages-table comment → `type ∈ {plain, review, questionnaire, verdict}`.

**Justification.** The plan's discriminated union (§4) and the renderer's exhaustiveness check (§4 / AC-11) only hold once the concept-doc closes the enum at four. Without T0 the L1a commit silently violates the §4.5.8.5 hard rule. The concept-doc itself permits in-PR concept updates when accompanied by primitive-store updates — T0 + T2 in the same commit satisfies that condition.

### Q4 — Head-collapse predicate edge cases (approved.md open question 1)
**Read.** Two edge cases:
- (a) Resolved review still mount HEAD? **No.** Once `resolvedAt` is set on the review message, the head collapses into chat-shape; the verdict-payload message rides as a `CommentRow` in the stream with a `StatusChip`. Approved design §4 "Populated (resolved)" supports this: "head (if present) shows the original substance message with `RESOLVED` strip in place of the verdict bar" — but this is *only when the underlying message has not been collapsed by predicate truth shifting*. To resolve consistently with §4.5.10: head mounts iff there exists an *unresolved* review/questionnaire message that is the most recent of its kind. After resolve, predicate flips to false → head unmounts.
- (b) Multiple unresolved reviews? **Most-recent unresolved review/questionnaire by `(created_at, id)` ascending.** Predicate picks one head message at a time. Older unresolved reviews surface as `CommentRow`s in the stream (with their `Pending` status badge) and the `Composer`'s "Unresolved review · acting required ↑" line links the reader to the *most-recent* pending one.
**Justification.** Approved design §8 hard-rule 1: "`ThreadHead` mounts iff there exists a message in the thread of type `review` or `questionnaire` whose `resolvedAt` is null AND that message is the most recent of its kind in the thread." Concept §4.5.5 "Multi-participant ordering" says messages order by `(createdAt, id)`. These two rules together resolve both edge cases.

### Q5 — `ArtifactView` slot prop contract (approved.md open question 2)
**Read.** L1 takes an `artifact_ref: { id: string; kind: ArtifactKind }` and renders an inline placeholder slot. L11 fills the slot via a `slot` prop on `ThreadHead` (component composition, not a global registry). For L1's e2e tests, the placeholder is a `text_diff` inline preview rendered by a stub `ArtifactSlot` component that L1 owns and L11 replaces with the real `ArtifactView`. Focus-return on canvas close: focus moves back to the `ArtifactView` slot inside the head (approved.md §5 row "Focus return" already specifies this).
**Justification.** Approved.md §10: "Exact field names on `messages` and `threads` rows... architect picks final shapes." §2.2 "ARTIFACT block" row: "L11 fills the slot." The L1 spec requires shipping a working e2e per rich message type — not the *full* ArtifactView family (5 shapes). `text_diff` is the simplest existing shape (already in `packages/web/src/shell/ArtifactView.tsx`), so the stub renders that one inline. Q1 cut already aligned.

### Q6 — Mobile fallback when canvas is requested (approved.md open question 3)
**Read.** No `Open full artifact` on mobile in L1. The two-tab segmented control (`Artifact | Discussion (N)`) is L11's responsibility. L1's mobile rule: render the artifact preview inline in the head; if it's heavy, scroll. Verdict bar pins to the floor above the composer (approved.md §6 already specifies this) — no canvas, no segmented tabs.
**Justification.** Approved.md §6 mobile section specifies "two-tab segmented control" only when "promoted artifact" — and approved.md §10 explicitly leaves the canvas-promote to be wired by `onPromoteArtifact` from L11. L1 ships the inline path; the promote affordance is a no-op no-op on mobile until L11.

### Q7 — Where does `headCollapsePredicate` live?
**Read.** Shared package: `packages/shared/src/thread.ts` (a new file). Both server (used to compute a hint for thread sorting / list rendering) and web (used to decide `<ThreadHead>` mount) import it. Tests live in `packages/shared/src/__tests__/thread.test.ts`. The function is pure: `headCollapsePredicate(messages: ReadonlyArray<Message>): { headMessageId: string | null }`.
**Justification.** Concept §4.5.5 says ordering is by `(createdAt, id)`. Approved.md §8 hard-rule 1 says the predicate reads off the messages — a single implementation prevents drift. CLAUDE.md "boring tech, clarity beats elegance" — one function, one place.

### Q8 — How is "redact" surfaced as an API operation?
**Read.** L1 ships the column + uniqueness/immutability constraint + the projected payload schema for redacted messages. The endpoint `POST /api/threads/:id/messages/:messageId/redact` is **deferred** — design-it-twice decision §12-D resolves to defer. The architect-decided redacted-message payload shape is `{ redacted: true, redactedBy: string, redactedAt: string, reason: string }`, replacing the original payload while preserving `id/sender/type/created_at`. Storage: a new `redactedAt` column on `messages` (nullable timestamp) is the constraint surface.
**Justification.** Concept §4.5.8 "Redaction" defines the structural rule. SHARED.md migration policy doesn't list `redactedAt` as a dropped column → it's new. Acceptance criteria (TRACK-L L1 lines 31-45) do not require a working redaction operation — they require the *contract*. Deferring to a follow-up keeps L1 in 5d.

### Q9 — `items` and `responses` in L1
**Read.**
- `responses` table: **dropped in L1 migration**. Verdict rows project into `messages` rows of `type='verdict'` (Decision §12-B chooses `verdict` as a fourth message type). Idempotency keys are synthesized from the legacy `responses.id` so the migration is rerunnable on a snapshot.
- `items` table: **kept**, untouched by L1. `items.kind` continues to drive `item-router.ts` routing categories. The Conversations queue's source-of-truth flips to `threads` (concept §4.5.10 rule 3) — L1 wires the new path; L8 is the story that consumes it. The legacy `routeItem(...) → 'conversations' | 'rail' | 'work' | 'knowledge'` continues to fire on item creation for compatibility (concept §4.5.10 rule 4).
- Existing services that touch threads (`review-item-factory.ts`, `session-review-creator.ts`, `agents.ts:170` `kind: "direct"`, `send-message.ts:33` `kind: "direct"`, `builtin-routines.ts:447` `kind: "post-bet-retro"`): **all** read the dropped `threads.kind` column. L1 must update each: synthesize `host_kind` + `host_id` from context (review item ⇒ `host_kind='task'`, host_id from the `items.proposed_action`-resolved task; "direct" agent message ⇒ `host_kind='agent'` + recipient agent id; "post-bet-retro" ⇒ `host_kind='bet'` + bet id). This is in-scope for L1 because the migration drops the column they read.
**Justification.** Concept §4.5.10 the five rules. Code reads (grep above) confirm 5 callers of `threads.kind`. Without updating them, the migration breaks `bun run check`.

### Q10 — What's "round-trip"?
**Read.** Server integration test (Vitest + ephemeral SQLite): for each of `plain | review | questionnaire | verdict`, (1) `POST /api/threads/:id/messages` with a fully-typed payload, (2) `GET /api/threads/:id?include=messages`, (3) assert the returned message's payload is *deep-equal* to the input payload (canonical JSON ordering). Plus: re-`POST` with the same `client_key` returns the same id, no duplicate row.
**Justification.** TRACK-L L1 line 42: "server tests cover every shipping type round-tripping through create + read". §4.5.6 idempotency rule mandates the dedup test.

---

## Section 2 — Phase 1: Plan reconciliation (spec ⇆ codebase)

| Spec assumption | Codebase reality (today) | Plan response |
|---|---|---|
| `threads(host_kind, host_id, initiator_id, participants[], pinned, resolved_at, last_active_at, created_at)` | `threads(id, kind, pinned, participants, created_at)` — has `kind`, lacks `host_kind`/`host_id`/`initiator_id`/`resolved_at`/`last_active_at`. | Migration adds host_kind/host_id/initiator_id/resolved_at/last_active_at; drops `kind`. Project legacy rows per SHARED.md rules. |
| `messages(id, thread_id, sender_id, type, payload, client_key, deleted_at, redacted_at, created_at)` | `messages(id, sender_id, recipient_id, thread_id, subject, body, file_leases, created_at)` — no `type`, no `payload`, no `client_key`, no `deleted_at`, no `redacted_at`. | Migration adds type/payload (TEXT JSON)/client_key/deleted_at/redacted_at; drops recipient_id/subject/body/file_leases. Existing rows project into `type='plain'` with payload `{text: subject? + '\n' + body}`. recipient_id rolls into `threads.participants`. |
| Closed message-type enum: `plain | review | questionnaire`. | No enum exists; type column doesn't exist. | Add `MessageType` closed string-literal union in shared; runtime check is a Zod enum at the API boundary. Discriminant exhaustiveness in TS via `never` fallthrough (see §4). |
| Verdicts emit a `verdict`-payload message. | `responses` table records verdicts; no verdict-message concept. | **Decision §12-B:** add a fourth message type `verdict` (closed enum becomes 4: `plain | review | questionnaire | verdict`). Concept §4.5.8 hard-rule 4 mandates verdict-as-message; making it a distinct type satisfies the discriminant exhaustiveness rule cleanly. Concept §4.5.7 says "verdict" terminology refers to the *binding subset of actions* — using `verdict` as a message type matches concept usage ("emit a `verdict`-payload message", §4.5.8). |
| Closed host-kind enum: `bet | task | knowledge_item | artifact | agent | user | team | factory`. | `threads.kind` carries (`'review'`, `'chat'`, `'coach'`, `'direct'`, `'post-bet-retro'`) today — none of which are host kinds. | Migration projects: `kind='coach'` → `host_kind='user'` + pinned; `kind='review'`/`'chat'` → host_kind+host_id from referencing item/task; `kind='direct'` → `host_kind='agent'`; `kind='post-bet-retro'` → `host_kind='bet'`. |
| `responses` table dropped. | `responses` table active, queried by `routes/conversations.ts` and `services/handoff-protocol.ts` (verify). | Drop in L1; backfill verdicts as `verdict`-payload messages. Update `routes/conversations.ts` + any other reader. |
| Blocking is derived. | `items.blocking` exists as a stored column. `threads` has no blocking column. | Keep the rule derived. `isBlocking(thread, messages, sessions)` in shared (signature in §4). The `items.blocking` column stays for routing purposes — orthogonal axis. Do not store on `threads`. |
| Idempotency: unique `(thread_id, sender, client_key)`. | No idempotency on messages today. | Add unique index. Server returns existing canonical `id` on duplicate; row count in test stays 1. |
| Audit invariant: messages immutable after persistence; soft-delete via `deleted_at`. | No `deleted_at` column; rows are mutable through Drizzle. | Add `deleted_at` (nullable text ISO). Server endpoints never expose update-message; only soft-delete + redact endpoints (the latter deferred per Q8). |
| Server-authoritative; every write emits an event. | `routes/conversations.ts` emits `item_created` and `response_recorded` today. | Replace with the new event types: `thread_created`, `thread_message_appended`, `thread_resolved`, `thread_archived`. Keep the legacy events firing in parallel for one release for downstream subscribers (`Knowledge Fabric`, `Harness Adapter`) until those subscribers move; tracked in retro/upgrade. |
| WebSocket push contract: `_event: 'update' \| 'delete'`. | `WsBroadcaster` broadcasts events by topic (`'conversations'`, `'work'`, `'rail'`). | Add topic `'thread:<id>'` (per-thread channel — Decision §12-C). Keep the existing `'conversations'` topic firing thread-list events. The shape stays per SHARED.md WebSocket contract. |
| L1 components in design system. | DS has 14 existing components. Tests + stories per component required. | New files in `packages/design-system/src/`: ThreadHostBanner, ThreadHead, ReviewVerdictBar, QuestionnaireAnswerBar, CommentRow, Composer, ThreadShell. Each gets a `.tsx`, `.stories.tsx`, `__tests__/<name>.test.tsx`, and a corresponding `.html` reference in `packages/design-system/html/`. |
| Page-local fixtures removed. | `MockReviewItem` `MockThread` `MockBetComment` exist verbatim per spec. | Replace with real `GET /api/threads/:id` (or `GET /api/threads?host_kind=bet&host_id=X` for WorkBet) + `<ThreadShell>` mount. |
| Thread sort order: `(host_kind, host_id, last_active_at DESC)` for thread list per host; blocking-first for global queue. | Existing `routes/conversations.ts` sorts by `recency` or `attention_score` (joins `items.attention_score`). | New endpoint sorts blocking-first (server applies `isBlocking` predicate to a window of recent threads), then `last_active_at DESC`. The `attention_score` sort is L8/L9 territory and stays untouched on the legacy endpoint. |

---

## Section 3 — Acceptance criteria with verification method

Restated from `TRACK-L.md` lines 31-45. Each AC has a numbered identifier and a concrete verification method.

- **AC-1 — Concept-doc updates landed.** HIL §4.5 (4.5.1 → 4.5.10) is present and stable; ARCHITECTURE.md §2.1 references the new schema; AGENT_LAYER.md vocabulary note + SHARED.md Thread-primitive entry exist.
  - **Verify.** `git diff --stat` against the L1 base shows the four files. A doc-anchor sweep (manual grep for `§4.5.1` … `§4.5.10`) resolves. No conflicts vs the locked design.
- **AC-2 — Configurations are described, not enumerated.** No type, no enum, no schema column for "DM"/"coach"/"feed".
  - **Verify.** Grep `packages/shared/src/` and `packages/db/src/` for `'coach'|'feed'|'dm'` returns zero hits. HIL §4.5.2 documents them as recognised patterns.
- **AC-3 — Cross-area attachment contract.** Threads attach to any `host_kind` from the closed set.
  - **Verify.** Vitest unit: round-trip a thread with each `host_kind`. Concept §4.5.4 anchor stays.
- **AC-4 — Message vocabulary defined.** Closed enum: `plain | review | questionnaire | verdict`.
  - **Verify.** `MessageType` exported from `@hyperidle/shared`. TS exhaustiveness test (a switch statement that returns a `never` fallthrough — compiles only when all cases are listed). Vitest assertion that `MESSAGE_TYPES` length = 4.
- **AC-5 — SHARED.md contracts in sync.** SHARED.md "Thread primitive" matches HIL §4.5.
  - **Verify.** Manual diff during plan adoption.
- **AC-6 — Shared implementation matches concept.** Types in `@hyperidle/shared`, schema in `@hyperidle/db`, components in `@hyperidle/design-system`, all enforce the closure rules and the audit invariant.
  - **Verify.** TS compile (`bun run check`) green with `--noUnusedLocals` etc. Drizzle schema infers row types that match the shared types (compile check via shared module re-exporting from `@hyperidle/db`).
- **AC-7 — Threads attach to any host entity.** All 8 host kinds round-trip.
  - **Verify.** Vitest server integration: parametric over `HOST_KINDS`, `POST /api/threads` + `GET /api/threads?host_kind=<k>&host_id=<id>` returns the row.
- **AC-8 — Existing review/chat-only data continues to load.** API back-compat at the `/api/threads/:id` endpoint for any thread that had been a `kind='review'` or `kind='chat'` before migration.
  - **Verify.** Vitest server integration with a fixture pre-migration row (`packages/db/__tests__/migration-l1.test.ts`); after migration, `GET /api/threads/:id` returns a `host_kind` + `host_id` projection per the SHARED.md rules. Plus: a separate Playwright e2e against `ConversationsReview.tsx` loading the same fixture renders the messages.
- **AC-9 — Page-local fixture types removed.** `MockReviewItem` (`ConversationsReview.tsx:22-33`), `MockThread` (`ConversationsChat.tsx:14-32`), `MockBetComment` (`WorkBet.tsx:24-28`) all gone.
  - **Verify.** `git grep -nE 'Mock(ReviewItem|Thread|BetComment)' packages/web/src/pages/` returns zero outside `__tests__/` and `*.stories.tsx`. Existing page-level tests `ConversationsReview.test.tsx`, `ConversationsChat.test.tsx`, `WorkBet.*.test.tsx` either continue to pass against the new fetch-based render path (with `msw` stubbing the new endpoints) or are explicitly listed in `protectedTests:` (§16) — which they are not (these tests' assertions are about UI, and the UI changes meaningfully in L1).
- **AC-10 — System lists/fetches/creates.** `GET /api/threads`, `GET /api/threads/:id`, `POST /api/threads`, `POST /api/threads/:id/messages` all functional.
  - **Verify.** Vitest server integration covers all four. See §6.
- **AC-11 — Discriminant exhaustiveness.** Adding a new message type that isn't in `MessageType` triggers a TS error in the renderer.
  - **Verify.** A guard test in `packages/web/src/__tests__/Thread.exhaustiveness.test-d.ts` (a `.test-d.ts` type-test using `expectError`) — alternatively, a `// @ts-expect-error` comment around the never-fallthrough renderer. Either passes when the union is closed.
- **AC-12 — Server tests round-trip every type.** As §1 Q10 + AC-10.
  - **Verify.** Vitest server integration `messages.roundtrip.test.ts` parametric over the 4 message types.
- **AC-13 — Playwright e2e: each shipping rich type renders inline.** `plain`, `review`, `verdict` in a thread (review + verdict reply, plus a plain reply); the `questionnaire` rich-type e2e ships in **L1b** (the answer-bar UI is L1b's surface). L1a covers four cases instead: `plain coach thread`, `review thread (issue-shape)`, `back-compat (legacy data)`, and `re-open semantics` (per adversary C5).
  - **Verify.** `packages/web/e2e/threads.spec.ts` — four L1a cases listed. Each uses Playwright's network mocks to seed the relevant endpoint responses, mounts the page, asserts visible inline UI per type. L1b adds two more cases.
- **AC-14 — Migration is forward-only with rollback plan.** Plan + snapshot.
  - **Verify.** Migration script in `packages/db/drizzle/0007_thread_primitive_l1.sql` and `packages/db/drizzle-pg/0006_thread_primitive_l1.sql`; `packages/db/L1-rollback.md` documents revert steps + retention. Vitest migration-runner test asserts post-up state matches post-down state (idempotent revert) on a sample dataset.
- **AC-15 — `bun run check` + `bun run lint` + `bun run test` all green.** Plus full e2e suite.
  - **Verify.** CI pre-merge gate.

---

## Section 4 — Type signatures (the contracts)

All under `packages/shared/src/thread.ts` (new file) + re-exported from `packages/shared/src/index.ts`. Drizzle row types (`packages/db/src/schema.ts`) are derived; the source of truth for the *closed enums* is the shared module.

```ts
// packages/shared/src/thread.ts

// ── Closed enums ────────────────────────────────────────────────

export const HOST_KINDS = [
  'bet', 'task', 'knowledge_item', 'artifact',
  'agent', 'user', 'team', 'factory',
] as const;
export type HostKind = (typeof HOST_KINDS)[number];

export const MESSAGE_TYPES = ['plain', 'review', 'questionnaire', 'verdict'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const VERDICT_DECISIONS = [
  'approve', 'approve-with-comments',
  'request-changes', 'edit', 'reject',
] as const;
export type VerdictDecision = (typeof VERDICT_DECISIONS)[number];

export const ARTIFACT_KINDS = [
  'text_diff', 'content_preview',
  'visual_comparison', 'action_summary', 'data_metrics',
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

// ── Identity ────────────────────────────────────────────────────

export type ThreadId   = string & { readonly __brand: 'ThreadId' };
export type MessageId  = string & { readonly __brand: 'MessageId' };
export type IdentityId = string & { readonly __brand: 'IdentityId' };

// ── Thread row ──────────────────────────────────────────────────

export interface Thread {
  readonly id: ThreadId;
  readonly hostKind: HostKind;
  readonly hostId: string;
  readonly initiatorId: IdentityId;
  /** Identity ids, sorted lexicographically for stable equality. */
  readonly participants: ReadonlyArray<IdentityId>;
  readonly pinned: boolean;
  readonly resolvedAt: string | null; // ISO 8601
  readonly lastActiveAt: string;       // ISO 8601
  readonly createdAt: string;          // ISO 8601
}

// ── Message payloads (discriminated union) ──────────────────────

export interface PlainPayload {
  readonly text: string;
  /** Optional inline references (knowledge item, task, artifact). */
  readonly refs?: ReadonlyArray<InlineRef>;
}

export interface ReviewPayload {
  readonly title: string;
  readonly reasoning: ReadonlyArray<string>;
  readonly artifactRef: ArtifactRef;
}

export interface QuestionnairePayload {
  readonly title: string;
  readonly question: string;
  readonly options: ReadonlyArray<string>;     // closed answer set
}

export interface VerdictPayload {
  readonly decision: VerdictDecision;
  /** Id of the review/questionnaire message this verdict resolves. */
  readonly resolvesMessageId: MessageId;
  readonly note?: string;                       // approve-with-comments / request-changes etc.
}

export interface RedactedPayload {
  readonly redacted: true;
  readonly redactedBy: IdentityId;
  readonly redactedAt: string;                  // ISO 8601
  readonly reason: string;
}

export interface InlineRef {
  readonly kind: 'knowledge_item' | 'task' | 'artifact' | 'bet';
  readonly id: string;
}

export interface ArtifactRef {
  readonly id: string;
  readonly kind: ArtifactKind;
}

// Discriminated union — adding a 5th type without updating MessageType triggers
// a `never`-narrowing failure in the renderer (see exhaustiveAssert below).
export type Message =
  | (BaseMessage & { readonly type: 'plain';         readonly payload: PlainPayload | RedactedPayload })
  | (BaseMessage & { readonly type: 'review';        readonly payload: ReviewPayload | RedactedPayload })
  | (BaseMessage & { readonly type: 'questionnaire'; readonly payload: QuestionnairePayload | RedactedPayload })
  | (BaseMessage & { readonly type: 'verdict';       readonly payload: VerdictPayload | RedactedPayload });

interface BaseMessage {
  readonly id: MessageId;
  readonly threadId: ThreadId;
  readonly senderId: IdentityId;
  readonly clientKey: string;
  readonly deletedAt: string | null;
  readonly redactedAt: string | null;
  readonly resolvedAt: string | null; // applies only to review/questionnaire — null elsewhere
  readonly createdAt: string;
}

/** Compile-time exhaustiveness helper. Pass the discriminant; switch must cover it. */
export function exhaustiveAssert(value: never): never {
  throw new Error(`Unhandled message type: ${String(value)}`);
}

// ── Configuration classifier (NOT a stored field) ──────────────

export type ThreadConfiguration = 'dm' | 'coach' | 'feed' | 'attached';

/** Classify a thread for documentation/styling — never persisted. */
export function classifyThreadConfiguration(thread: Thread): ThreadConfiguration {
  if (thread.hostKind === 'user' && thread.pinned) return 'coach';
  if (thread.hostKind === 'team' || thread.hostKind === 'factory') return 'feed';
  if ((thread.hostKind === 'agent' || thread.hostKind === 'user') && thread.participants.length === 2) return 'dm';
  return 'attached';
}

// ── Predicates ──────────────────────────────────────────────────

export interface HeadCollapseResult {
  /** Null = head does NOT mount (chat-shape). Non-null = id of the head message. */
  readonly headMessageId: MessageId | null;
}

/**
 * Approved.md §8 hard-rule 1: head mounts iff there exists a message of
 * type 'review' or 'questionnaire' whose resolvedAt is null AND that message
 * is the most recent of its kind in the thread.
 *
 * Pure: messages must be sorted by (createdAt, id) ascending. Returns the
 * id of the most-recent unresolved review/questionnaire by ordering, or null.
 */
export function headCollapsePredicate(
  messages: ReadonlyArray<Message>,
): HeadCollapseResult {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if ((m.type === 'review' || m.type === 'questionnaire') && m.resolvedAt === null) {
      return { headMessageId: m.id };
    }
  }
  return { headMessageId: null };
}

/**
 * Concept §4.5.5: "blocking iff the agent participating in this thread cannot
 * continue to work without an answer to a message in this thread." Decision
 * §12-A (storage): derived from (a) presence of an unresolved review/
 * questionnaire whose underlying task/session is in state in_progress|review,
 * AND (b) at least one agent identity is in participants.
 */
export function isBlocking(
  thread: Thread,
  messages: ReadonlyArray<Message>,
  /** Thin slice of session state — see §4 below. */
  agentSessionState: AgentSessionStateSnapshot,
): boolean {
  const head = headCollapsePredicate(messages);
  if (head.headMessageId === null) {
    // No unresolved review/questionnaire. A "plain quick question" thread
    // can still be blocking iff the agent has paused pending the reply —
    // this is signalled by agentSessionState.pausedOnThreadId === thread.id.
    return agentSessionState.pausedOnThreadId === thread.id;
  }
  // Unresolved review/questionnaire AND agent in the relevant working state.
  return agentSessionState.activeForThreadId === thread.id;
}

export interface AgentSessionStateSnapshot {
  /** If non-null, agent has explicitly paused the work the thread is about. */
  readonly pausedOnThreadId: ThreadId | null;
  /** If non-null, agent's current session needs an answer in this thread. */
  readonly activeForThreadId: ThreadId | null;
}
```

**Discriminant exhaustiveness**: The renderer in `packages/web/src/components/threads/MessageRenderer.tsx` (DS-side: a thin dispatch on `message.type` that picks the L1 component) uses `switch (message.type) { ... default: return exhaustiveAssert(message.type) }`. Adding a 5th type without updating both the renderer and the union triggers a TS narrowing failure → AC-11.

**Module structure.**
- `packages/shared/src/thread.ts` — types, enums, predicates, `exhaustiveAssert`, `classifyThreadConfiguration`.
- `packages/shared/src/__tests__/thread.test.ts` — Vitest unit tests for predicates + classifier.
- Re-exported from `packages/shared/src/index.ts`.

⚠️ UNVERIFIED: Drizzle does not generate branded-type rows out of the box; the `Thread` / `Message` types in `@hyperidle/shared` are the canonical exports, and the DB-row types (`typeof threads.$inferSelect`) are coerced via thin mapper functions in `packages/server/src/repos/thread-repo.ts` (a new file). Verified that this is a common pattern in the existing codebase (no branded types today) — choose to keep ids as plain strings if branded types add friction at the Drizzle boundary; the `__brand` is opt-in.

---

## Section 5 — Schema + migration

### 5.1 Final `threads` table (Drizzle, dual-driver)

```ts
// packages/db/src/schema.ts (replacement for current threads/messages)

export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  hostKind: text('host_kind').notNull(), // closed enum at API layer (Zod); DB stores TEXT
  hostId: text('host_id').notNull(),
  initiatorId: text('initiator_id').notNull(),
  participants: text('participants').notNull(), // JSON array of IdentityId, sorted
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  resolvedAt: text('resolved_at'),
  lastActiveAt: text('last_active_at').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('threads_host_idx').on(t.hostKind, t.hostId, t.lastActiveAt),
  index('threads_initiator_idx').on(t.initiatorId, t.lastActiveAt),
]);

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull().references(() => threads.id, { onDelete: 'restrict' }),
  senderId: text('sender_id').notNull().references(() => agents.id, { onDelete: 'restrict' }),
  type: text('type').notNull(),    // 'plain' | 'review' | 'questionnaire' | 'verdict'
  payload: text('payload').notNull(), // JSON, typed by `type`
  clientKey: text('client_key').notNull(),
  deletedAt: text('deleted_at'),
  redactedAt: text('redacted_at'),
  resolvedAt: text('resolved_at'),
  createdAt: text('created_at').notNull(),
  legacyItemId: text('legacy_item_id'), // migration-only — see §5.3 step 3 commentary
}, (t) => [
  index('messages_thread_id_idx').on(t.threadId, t.createdAt),
  uniqueIndex('messages_idempotency_uq').on(t.threadId, t.senderId, t.clientKey),
  index('messages_unresolved_idx').on(t.threadId, t.resolvedAt), // partial-index-friendly for blocking sort
]);
```

**Postgres adapter:** identical schema via `packages/db/src/schema.pg.ts`, matching the existing dual-driver pattern. `payload` is `text('payload')` (NOT `jsonb`) — VERIFIED: `packages/db/src/schema.pg.ts` line 1 imports do not include `jsonb`; line 166 stores `participants: text("participants")`; the convention is TEXT for JSON-shaped columns in both drivers. Timestamp columns stay TEXT (ISO 8601) per existing convention. Tradeoff: Postgres loses JSONB indexable path queries; not used by any L1a endpoint. See §5.4 for FK/constraint handling on Postgres.

### 5.2 Drop list

| Object | Reason |
|---|---|
| `threads.kind` column | Replaced by `host_kind` (concept §4.5 closure rule). |
| `messages.recipient_id` | Folded into `threads.participants` (SHARED.md migration policy). |
| `messages.subject` | Folded into `payload.text` for `type='plain'`. |
| `messages.body` | Folded into `payload.text`. |
| `messages.file_lease_ids` | No replacement in L1; file leases attach via `payload.refs[*]` in a future story. Existing rows preserve the value in `payload._legacy_file_leases` (string array) for the rollback window. |
| `responses` table | Replaced by `verdict`-payload messages. Existing rows backfill into `messages` rows of `type='verdict'` (one per response). |

### 5.3 Migration step ordering (forward-only) — REVISED for adversary C2

The original ordering set every legacy message to `type='plain'` BEFORE attempting the verdict backfill, which left zero `review`-type messages to attach `verdicts.resolvesMessageId` to. Additionally, the `responses.item_id → message_id` mapping had no deterministic backbone (no `message_id` column on `items`). The corrected ordering threads a `legacy_item_id` audit column on `messages` and reorders the type backfill to precede verdict synthesis.

1. **Snapshot** `threads`, `messages`, `items`, `responses` to `_l1_snapshot_*` tables (same database, separate names) — retention 30 days post-merge (decision §15-A). Source of the rollback artifact.
2. **Add new columns** to `threads`: `host_kind`, `host_id`, `initiator_id`, `resolved_at`, `last_active_at` (all nullable initially).
3. **Add new columns** to `messages`: `type`, `payload`, `client_key`, `deleted_at`, `redacted_at`, `resolved_at`, **`legacy_item_id`** (all nullable initially). The `legacy_item_id` column is a `// migration-only` audit column: NOT NULL on rows generated FROM the migration (each legacy `messages` row is tagged with the `items.id` it corresponds to); NULL on every new row created post-migration. The column survives in the schema with a comment noting it is read-only audit metadata; a follow-up DB-cleanup story (post-snapshot-retention) may drop it.
4. **Backfill `threads`**: for every row, project `host_kind`/`host_id`/`initiator_id`/`last_active_at` per the SHARED.md rules. `initiator_id` derived from the first message's `sender_id` (deterministic by `created_at` ASC). `last_active_at` = MAX(messages.created_at).
5. **Backfill `messages.type` based on legacy data** (was: previously this step set every message to `'plain'`):
   - For each legacy `messages` row, look up the `items` row that *references the same thread*: `SELECT * FROM items WHERE thread_id = m.thread_id AND created_at <= m.created_at ORDER BY created_at DESC LIMIT 1`. If exactly one matching item exists with `kind='review'`, set `m.type='review'`, `m.payload = JSON{ title: items.title, reasoning: split_to_lines(items.body), artifactRef: { id: items.artifact_id, kind: items.artifact_kind } }`, `m.legacy_item_id = items.id`.
   - If the matching item exists with `kind='questionnaire'` (current code may not have this kind; if so, the branch is a no-op), set `m.type='questionnaire'` analogously. Audit query in T4 confirms zero questionnaire rows in current data.
   - Otherwise (no matching item, or an item with a non-review kind), set `m.type='plain'`, `m.payload = JSON{ text: <subject?+'\n\n'+>body }`, `m.legacy_item_id = NULL`.
   - In all cases set `m.client_key = '__l1_legacy_' || m.id` (per §14 risk row).
6. **Backfill `threads.host_kind` + `host_id`** from the projection rules (SHARED.md). Already partially done in step 4; this step reconciles edge cases and ensures the JSON `participants` shape (sorted lex).
7. **Backfill verdicts from `responses`**: for each `responses` row r, look up the `messages` row whose `legacy_item_id = r.item_id` (the column populated in step 5). If exactly one row matches AND its `type='review'`, generate a synthetic `verdict`-typed `messages` row: `INSERT INTO messages (id, thread_id, sender_id, type, payload, client_key, created_at, legacy_item_id) VALUES (<new uuid>, <review.thread_id>, r.approver_id, 'verdict', JSON{ decision: r.decision, resolvesMessageId: <review.id>, note: r.feedback }, '__l1_migrate_'||r.id, r.responded_at, r.item_id)`. Set the review message's `resolved_at = r.responded_at`. Also set `threads.resolved_at = r.responded_at` for the underlying thread.
   - **Pre-migration audit query (run in T4 test before applying):** `SELECT count(*) FROM responses r LEFT JOIN messages m ON m.legacy_item_id = r.item_id WHERE m.id IS NULL` — must equal 0. If non-zero, the migration falls back to: pick the most recent `messages` row in `r.item.thread_id` with `type='review'`. The migration test in §9 covers both paths.
8. **Add indexes**: `threads_host_idx`, `messages_thread_id_idx`, `messages_idempotency_uq`, `messages_unresolved_idx`.
9. **Make new columns NOT NULL**: `host_kind`, `host_id`, `initiator_id`, `last_active_at`, `participants` (JSON shape), `type`, `payload`, `client_key`. (Note: `legacy_item_id` stays nullable — that is its closure rule.)
10. **Drop legacy columns** on `threads` (`kind`) and `messages` (`recipient_id`, `subject`, `body`, `file_lease_ids`). On Postgres, drop FK constraints first (see §5.4).
11. **Drop legacy `responses` table** (after step 10's success).

**Rollback plan** (`packages/db/L1-rollback.md`):
- (i) Down-migration replays the inverse of steps 11 → 2 from the `_l1_snapshot_*` tables (atomic per step).
- (ii) Snapshot retention: 30 days. After 30 days the snapshot is droppable by ops.
- (iii) Rollback test: a CI job (gated to L1a PR only) applies up + down on a sample dataset and asserts row equality (column-by-column) between pre-up and post-down.

**Schema column comment** for `legacy_item_id` (in `packages/db/src/schema.ts`):

```ts
// `legacy_item_id` — migration-only audit column. NOT NULL on rows
// generated by the L1a migration (each legacy `messages` row was tagged
// with the `items.id` it corresponds to, so the verdict-from-responses
// backfill could resolve `responses.item_id → messages.id` deterministically).
// NULL on every row created post-migration. Eligible for drop after the
// snapshot retention window in a follow-up DB-cleanup story.
legacyItemId: text('legacy_item_id'),  // migration-only
```

### 5.4 Dual-driver concerns

- **SQLite (default):** integer booleans (`0`/`1`) for `pinned`. Drizzle `mode: 'boolean'` handles this — verified the convention is in use today (`tasks.crossTeam`).
- **Postgres:** boolean columns are native via `boolean` from `drizzle-orm/pg-core` (confirmed by reading `packages/db/src/schema.pg.ts` line 1: imports `boolean`). The L1a migration writes `pinned BOOLEAN NOT NULL DEFAULT false`; existing convention is `0004_boolean_coerce.sql`-style.
- **JSON columns (RESOLVED):** Postgres adapter uses **TEXT, not JSONB**. Verified by reading `packages/db/src/schema.pg.ts` (line 1 imports list does not include `jsonb`; line 166: `participants: text("participants")`). Both drivers store JSON-shaped columns as TEXT; validators (Zod) parse on read at the API boundary. This keeps the dual-driver schema identical and matches the existing pattern. Tradeoff: Postgres loses indexable JSON path queries, but no L1 endpoint requires that — `payload` is read whole, not by key.
- **Postgres ALTER TABLE / DROP CONSTRAINT (added per adversary M2):** before each `DROP COLUMN` in step 10, the migration emits `ALTER TABLE ... DROP CONSTRAINT IF EXISTS ...` for every FK referencing that column. Specifically: `messages_recipient_id_agents_id_fk` (FK on `messages.recipient_id → agents.id`) is dropped before `ALTER TABLE messages DROP COLUMN recipient_id`. SQLite does not support `DROP CONSTRAINT`, but it also does not support FK as separately-named constraints — the legacy SQLite schema's FKs are inline column definitions, so the column drop is sufficient. The `responses` table drop in step 11 needs `DROP CONSTRAINT IF EXISTS responses_item_id_items_id_fk` and `DROP CONSTRAINT IF EXISTS responses_approver_id_agents_id_fk` on Postgres before `DROP TABLE responses`. The migration-test (`packages/db/__tests__/migration-l1.test.ts`) parametrizes over both drivers and asserts no orphaned constraints post-migration.

### 5.5 Indexes — load-pattern justification

| Index | Use case |
|---|---|
| `threads_host_idx (host_kind, host_id, last_active_at DESC)` | "List threads attached to bet/task/knowledge_item/artifact/agent X" — bounded host context view. Composite covers the WorkBet detail's "threads on this bet" query. |
| `threads_initiator_idx (initiator_id, last_active_at DESC)` | "Threads I started" — feeds the user-coach view. |
| `messages_thread_id_idx (thread_id, created_at)` | The detail-page render. Always sorted by `(created_at, id)` per concept §4.5.5 — the natural index covers this. |
| `messages_idempotency_uq (thread_id, sender_id, client_key)` | UNIQUE — concept §4.5.6 idempotency rule. |
| `messages_unresolved_idx (thread_id, resolved_at)` | Predicate `headCollapsePredicate` server-side: "any message in thread X with resolved_at IS NULL?" — used to power the blocking-sort hint. |

---

## Section 6 — API endpoints + Event Bus

All paths under `/api`. New router file `packages/server/src/routes/threads.ts`. Mounted in `app.ts` alongside the existing `/api/conversations` (which stays for one release for legacy callers). Authorization: per the existing `requireAuth` middleware. Per-request rate limit + body-size limit per the existing middleware (I2 work).

### 6.1 REST endpoints

#### `GET /api/threads`

List threads scoped to a host or to the current participant.

**Query params:**
- `host_kind`, `host_id` (optional pair) — list threads attached to a host.
- `participant_id` (optional) — list threads where this identity is a participant.
- At least one must be present (or 400). Both can be combined.
- `cursor`, `limit` (pagination — keyset by `(last_active_at DESC, id DESC)`), `limit` ≤ 50.

**Response:** `{ threads: Thread[], nextCursor: string | null }`. Each `Thread` carries the row plus a derived `headMessageId: string | null` (for client convenience — server runs `headCollapsePredicate` on a fetched-once last-N messages for that thread; cheap because of `messages_unresolved_idx`).

**Errors:** 400 (missing scope), 403 (forbidden — caller not the host's owner / not a participant), 500.

#### `GET /api/threads/:id`

Thread + paginated messages.

**Query params:** `messages_cursor`, `messages_limit` (≤ 100, default 50). The first page is the most-recent N; subsequent pages walk backward (Slack/Linear convention).

**Response:** `{ thread: Thread, messages: Message[], headMessageId: string | null, nextMessagesCursor: string | null }`.

**Errors:** 404 (thread not found), 403 (caller not a participant), 500.

#### `POST /api/threads`

Create a thread + initial message atomically.

**Body (Zod-validated):**
```
{
  hostKind: HostKind,
  hostId: string,
  participants: IdentityId[],   // initiator MUST be included
  pinned?: boolean,
  initialMessage: { type: MessageType, payload: <typed by type>, clientKey: ClientKey },
}
```

**`clientKey` Zod constraint (REVISED for adversary M1).** `clientKey` is `z.string().min(8).max(128)` matching the regex `^[A-Za-z0-9_\-:.]+$` (URL-safe, matches the existing convention used by Item idempotency keys). A UUID v4 / v7 satisfies this constraint. Empty string, whitespace-only, or strings outside the regex return 400 with `{ error: 'invalid_client_key' }`. Same Zod validator is reused on `POST /api/threads/:id/messages` body.

**Response (201):** `{ thread: Thread, messages: [Message] }`.

**Errors:** 400 (validation), 401 (unauth), 409 (idempotency replay → returns the existing thread+message id, code 200), 500.

**Side effect:** emits `thread_created` and `thread_message_appended` events.

#### `POST /api/threads/:id/messages`

Append a message.

**Body:** `{ type: MessageType, payload: <typed>, clientKey: string }`.

**Response (201):** `{ message: Message, thread: Thread }` (thread carries updated `lastActiveAt`, `resolvedAt` for verdict messages).

**Errors:** 400, 403, 404, 409 (duplicate clientKey → returns existing message — code 200 not 201), 500.

**Side effect:** emits `thread_message_appended`. If `type='verdict'` AND the targeted review/questionnaire message gets `resolved_at` set: also emit `thread_resolved`. If `type ∈ {review, questionnaire}` AND the thread had `resolved_at != null`: emits `thread_reopened` (see "Re-open semantics" below).

**Authorization (REVISED for adversary C4 — verdict authorship rule).** Beyond the base `caller.identityId ∈ thread.participants` check:

- **Verdict-specific rule.** If `type === 'verdict'`, the server enforces:
  - (a) caller's identity is in `thread.participants` (base rule), AND
  - (b) caller's role is in the founders set (`identity.role === 'founder'`), AND
  - (c) the caller's identity is NOT the sender of the review/questionnaire message that the verdict resolves (`caller.identityId !== reviewMessage.senderId`).
- The (b) condition is the L1a closure: only founders can verdict. The future v2 of this rule reads a per-thread `requestedReviewerRole` field; for L1a, founder-only is the simplest correct rule because TRACK-L L1's review queue is the founder review surface (HIL §4.5.7 prose).
- Returns **403** with `{ error: 'forbidden', code: 'verdict_authorization' }` if any of (a), (b), (c) fails.

**Re-open semantics (REVISED for adversary C5).** Concept §4.5.5 permits re-opening a resolved thread. The server's rule:

> When a `type ∈ {review, questionnaire}` message is appended to a thread where `thread.resolvedAt != null`, the server (atomically, in the same transaction as the message insert) clears `thread.resolvedAt = NULL`, emits `thread_reopened`, and emits `thread_message_appended` with the new message id. The new review/questionnaire becomes the HEAD per §1 Q4 + approved.md §8 hard-rule 1. The previous resolved review's `verdict`-message stays in the audit trail (its `resolvesMessageId` continues to point at the now-historical review). No separate `POST /api/threads/:id/reopen` endpoint exists.

The `thread_reopened` event is documented in §6.3.

#### (DEFERRED in L1) `POST /api/threads/:id/messages/:messageId/redact`

Out of scope for L1 implementation (Decision §12-D). Column + constraint shipped; the verb is a follow-up story.

### 6.2 WebSocket subscriptions

WS path: existing `/ws` route (Bun WebSocket) with topic-based subscriptions per `WsBroadcaster`.

- New topic: `thread:<threadId>` (per-thread channel — Decision §12-C). Clients subscribe when the user opens a thread; unsubscribe on close.
- Event payload shape per SHARED.md: existing event JSON + `_event: 'update' | 'delete'`. Map:
  - `thread_message_appended` → broadcast on `thread:<threadId>` topic with `_event: 'update'`.
  - `thread_resolved` → broadcast with `_event: 'update'`.
  - `thread_reopened` → broadcast with `_event: 'update'`.
  - `thread_archived` → broadcast with `_event: 'delete'` (clients remove from their local cache).
  - `thread_created` → broadcast on the `'conversations'` topic (the thread-list channel) so the Submenu refreshes.

**Subscribe / unsubscribe protocol (REVISED for adversary M5).**

- **Client → server messages (JSON over the existing `/ws` channel):**
  - `{ "action": "subscribe",   "topic": "thread:<id>" }` — request to join a topic.
  - `{ "action": "unsubscribe", "topic": "thread:<id>" }` — request to leave a topic.
- **Server authorizes the subscribe before joining the topic.** The auth check for `thread:<id>` topics:
  - Fetch the thread row by id; assert `caller.identityId ∈ thread.participants`. If not, server replies `{ "error": "forbidden", "topic": "thread:<id>" }` and does NOT join the topic. The client receives no further messages on that topic.
  - On success, server replies `{ "ack": "subscribed", "topic": "thread:<id>" }`. (The ack lets the client distinguish "subscribed" from "silently dropped" during e2e tests.)
- **Auto-release on close.** When the WebSocket closes (client disconnect or server shutdown), all topic subscriptions for that connection are released. No explicit unsubscribe is required for cleanup. The `WsBroadcaster.onClose` handler iterates the connection's topic set and removes the connection from each.
- **The existing topics** (`'conversations'`, `'work'`, `'rail'`) keep their current behavior: any authenticated user may subscribe (they are global feeds; per-row authorization is applied by the server when constructing the broadcast payload). Only `thread:<id>` introduces per-topic authorization.

### 6.3 Event Bus events (new)

```ts
// packages/shared/src/events.ts (additions; keep the existing union)

export interface ThreadCreatedEvent {
  type: 'thread_created';
  streamId: string;
  threadId: string;
  hostKind: HostKind;
  hostId: string;
  initiatorId: string;
  timestamp: number;
}

export interface ThreadMessageAppendedEvent {
  type: 'thread_message_appended';
  streamId: string;
  threadId: string;
  messageId: string;
  messageType: MessageType;
  senderId: string;
  timestamp: number;
}

export interface ThreadResolvedEvent {
  type: 'thread_resolved';
  streamId: string;
  threadId: string;
  resolvedByMessageId: string; // the verdict message that triggered it
  timestamp: number;
}

export interface ThreadReopenedEvent {
  type: 'thread_reopened';
  streamId: string;
  threadId: string;
  reopenedByMessageId: string; // the new review/questionnaire message that re-opened it
  timestamp: number;
}

export interface ThreadArchivedEvent {
  type: 'thread_archived';
  streamId: string;
  threadId: string;
  timestamp: number;
}
```

`streamId` = `threadId` so per-thread events arrive in order (SHARED.md per-stream-ordering guarantee).

Add to `DomainEvent` union; `WsBroadcaster.start()` subscribes to all five and routes per §6.2.

### 6.4 Coexistence with legacy endpoints

> **Adversary C3 update.** The "legacy projection rule" (server-side `host_kind → kind: 'review' | 'chat'` for L8 / ThreadSections consumers) is no longer required because `ThreadSections.test.tsx` and `ThreadRow.test.tsx` are rewritten in T17 to consume the new shape directly. The projection rule below is documented but ships as a **dormant deprecation transform** on `routes/conversations.ts` — kept commented in the code with a 1-release retention note. If a downstream non-test consumer surfaces during the L1a write-tests phase, T9 unfolds the rule. Otherwise it stays dormant and is dropped in L8.

| Endpoint | Disposition |
|---|---|
| `GET /api/conversations` | Stays for one release. Continues to query `threads` with the new schema; result shape adapts: `kind` replaced with `hostKind` in the JSON (deprecation note in response header `X-Deprecation: thread-list-v1`). L8 removes it. The legacy `'review' \| 'chat'` predicate (`host_kind ∈ {bet, task, knowledge_item, artifact}` AND there exists an unresolved `review`/`questionnaire` HEAD message → `'review'`; else → `'chat'`) is documented as the dormant projection rule per the adversary-C3 note above. |
| `GET /api/conversations/:id` | Stays one release. Returns `thread + messages` (new shape; legacy `items + responses` not in response). L9 removes it. |
| `POST /api/conversations/items` | Stays. The Router still creates `items` rows for routing. Internally it now also creates a thread + a substance message — but the items table is the routing axis. |
| `POST /api/conversations/responses` | **Deprecated and replaced** by `POST /api/threads/:id/messages` with `type='verdict'`. The legacy endpoint stays for one release with a deprecation warning header. Internally it appends a `verdict` message and writes a row to `responses` for compat. |
| `routes/agents.ts:170` `db.select().from(threads).where(eq(threads.kind, 'direct'))` | Rewrite: `where host_kind='agent' AND host_id=<recipient>`. |
| `services/builtin-routines.ts:474` `eq(threads.kind, 'post-bet-retro')` | Rewrite: store the marker in a different column (e.g., a row in a `threads_meta` JSON column) — Decision §12: easier to add a per-routine `thread_id` reference on the routine row itself. ⚠️ UNVERIFIED: read `builtin-routines.ts:447` context — the marker is checked via a `LIKE %marker%` on `items.body`; the `threads.kind='post-bet-retro'` filter is a coarse pre-filter. L1's fix: drop the `threads.kind` half of the `WHERE` and rely on the `items.body LIKE` half. Performance acceptable because `post-bet-retro` rows are rare. |

---

## Section 7 — Web: design system components

All seven components ship in `packages/design-system/src/`. Each gets:
- `<Component>.tsx` — implementation.
- `<Component>.stories.tsx` — DS storybook entries (one story per state from §4 of approved.md).
- `__tests__/<Component>.test.tsx` — Vitest unit tests.
- `packages/design-system/html/<Component>.html` — design reference (Claude Design owns the HTML, per `.claude/rules/visual-parity.md`).
- Visual regression test in `packages/design-system/visual/<Component>.visual.test.ts` — tolerance ≤5% per the rule.

Token-driven; no hardcoded spacing, color, or radius (per `.claude/rules/aesthetic-quality.md`).

### 7.1 `ThreadHostBanner.tsx`

```ts
export interface ThreadHostBannerProps {
  hostKind: HostKind;
  hostTitle: string;          // resolved entity title
  hostHref?: string;          // navigation target (null for host_kind='user')
  blocking: boolean;
  resolved: boolean;
  pinned: boolean;
  participants: ReadonlyArray<{ id: string; name: string; avatarUrl?: string }>;
  onMoreActions?: (action: 'snooze' | 'escalate' | 'archive' | 'pin' | 'unpin') => void;
}
```

States covered: blocking-true, resolved-true, pinned-true, participants overflow (>3), no-action default. Mobile-collapsed variant (one row).

### 7.2 `ThreadHead.tsx`

```ts
export interface ThreadHeadProps {
  message: Message;           // type === 'review' | 'questionnaire'
  resolvedVerdict?: VerdictDecision; // present if resolvedAt set, drives the RESOLVED strip
  /** L11 passes the rendered ArtifactView via this slot. L1a ships a stub. */
  artifactSlot?: React.ReactNode;
  /** L1b wires the canvas-promote handler. L1a accepts the prop but no-op. */
  onPromoteArtifact?: () => void;
  /** Verdict bar callbacks; see ReviewVerdictBar below. */
  onVerdict?: (action: VerdictGrammarAction) => void;
}
```

States: review (unresolved + resolved-with-each-verdict-decision), questionnaire (unanswered renders the question + L1b-placeholder for the answer affordance — `QuestionnaireAnswerBar` ships in L1b), heavy artifact (artifactSlot present, promote button accepts L1b's handler), error (artifact slot fails to load). The component is purely presentational; a sibling renderer feeds it the resolved values.

### 7.3 `ReviewVerdictBar.tsx`

```ts
export type VerdictGrammarAction =
  | 'approve' | 'approve-with-comments' | 'request-changes' | 'edit' | 'reject'
  | 'comment' | 'inline-comment' | 'reply'
  | 'snooze' | 'escalate';

export interface ReviewVerdictBarProps {
  onAction: (action: VerdictGrammarAction) => void;
  disabled?: boolean;          // e.g. when posting in flight
  /** Sticky behavior is a CSS trick (position: sticky); no IntersectionObserver in L1. */
}
```

States: idle, action-in-flight (all buttons disabled), reject-confirm modal (decision: confirm via DaisyUI `<dialog>`).

### 7.4 `QuestionnaireAnswerBar.tsx`

```ts
export interface QuestionnaireAnswerBarProps {
  options: ReadonlyArray<string>;
  onAnswer: (option: string) => void;
  disabled?: boolean;
}
```

States: idle, answer-in-flight.

### 7.5 `CommentRow.tsx`

```ts
export interface CommentRowProps {
  message: Message;
  sender: { id: string; name: string; role?: string; avatarUrl?: string };
  showSenderHeader: boolean;   // sender-grouping rule: false when previous row is same sender within 5min
  inlineAnchor?: string;       // for inline-comment plain messages
  /** When the message is type='verdict', renders a StatusChip alongside body. */
}
```

States: plain text, plain text with inline ref (knowledge/task/artifact pill), verdict (status chip + decision label), inline-comment (anchor label above body), redacted (greyed body, "Redacted by X — reason"), grouped vs ungrouped variant.

### 7.6 `Composer.tsx`

```ts
export interface ComposerProps {
  threadId: string;
  /** Submit emits a 'plain' message via the host page's mutation handler. */
  onSubmit: (input: { text: string; clientKey: string; refs?: InlineRef[] }) => Promise<void>;
  /** True if the most recent message is unresolved review/questionnaire. */
  unresolvedReviewLink?: { onClick: () => void };
}
```

States: empty (placeholder), typing, focused, submitting (disabled + spinner), submit-error (banner). `Cmd/Ctrl+Enter` submits.

### 7.7 `ThreadShell.tsx`

```ts
export interface ThreadShellProps {
  thread: Thread;
  messages: ReadonlyArray<Message>;
  /** Resolved sender + identity info for each unique sender id. */
  identities: Record<string, { name: string; role?: string; avatarUrl?: string }>;
  artifactSlot?: (ref: ArtifactRef) => React.ReactNode; // L1 ships a stub
  onAppendMessage: (input: { type: MessageType; payload: unknown; clientKey: string }) => Promise<void>;
  loading?: boolean;
  error?: string;
}
```

Composition root. Mounts: `ThreadHostBanner` + (`ThreadHead` if `headCollapsePredicate(messages).headMessageId !== null`) + `CommentStream` (a thin `<ul>` of `CommentRow`s, with date separators and the `Show N earlier comments` collapse) + `Composer`.

States from approved.md §4: empty / loading / error / populated-issue / populated-chat / populated-resolved / populated-overflow. `Promoted artifact` state is wired via `onPromoteArtifact` but the actual canvas+dock layout is L11.

### 7.8 Page-level renderer choice

**Decision (Q1 / approved.md §10):** keep both pages (`ConversationsReview.tsx`, `ConversationsChat.tsx`) — each mounts `<ThreadShell>` with the same props but different page-level chrome. L9 collapses the routes to one detail surface; that's not L1's job. WorkBet's threads section is a separate `<ThreadList>` + (on click) `<ThreadShell>` mount inline. The `ThreadList` is owned by L8 — for L1, WorkBet shows a flat list of threads (read from `GET /api/threads?host_kind=bet&host_id=:id`) and clicking opens the `<ThreadShell>` in an inline modal slot (DaisyUI `<dialog>` for L1; replaced with the proper detail route in L9).

---

## Section 8 — Page-local fixture removal

Concrete edits:

- **`packages/web/src/pages/ConversationsReview.tsx:22-33`** — `MockReviewItem` interface deleted; `MOCK_REVIEWS` array deleted. The page reads:
  - `useEffect`: `GET /api/threads/:id?messages_limit=50` (id from URL params via React Router).
  - State: `{ thread, messages, identities, loading, error }`.
  - Render: `<ThreadShell thread messages identities onAppendMessage={...} />` — no page-local rendering of artifact / verdict / comment row anymore.
  - `PREFILL_KEYS` map removed (no keyboard verb shortcuts — approved.md §5).
  - `ReasoningBlock` from `packages/web/src/components/ReasoningBlock.tsx` is reused inside `ThreadHead` — ensures the Reasoning block visual stays the same.

- **`packages/web/src/pages/ConversationsChat.tsx:14-32`** — `MockMessageArtifactPreview`, `MockMessage`, `MockThread` interfaces deleted; `MOCK_THREADS` array deleted. `ConversationsChatProps.threads` removed. Replacement: same pattern as Review — fetch by id, mount `<ThreadShell>`. The page-local `groupBySender` removed (replicated in `CommentStream`). The `onSubmit` handler in `Composer` calls `POST /api/threads/:id/messages` with `type='plain'`.

- **`packages/web/src/pages/WorkBet.tsx:24-28`** — `MockBetComment` interface + the comments array on `MockBetDetail` deleted. The bet page adds a "Threads" section that fetches `GET /api/threads?host_kind=bet&host_id=:id`; clicking a row opens a `<ThreadShell>` in a DaisyUI dialog. The `MOCK_BETS` literal stays for *bet detail itself* (a separate hardcoded-data inventory row owned by L17/L18); only the comments / threads slice is touched in L1.

**Inventory closure (per L6 hardcoded-data inventory).** The L6 inventory is an L6 deliverable (separate story); L1 does not deliver the inventory but explicitly closes the rows for `MockReviewItem`, `MockThread`, `MockBetComment`. List included in §16 protected-tests for the closure assertion.

---

## Section 9 — Tests required by AC

### Vitest unit (shared package)

- **`packages/shared/src/__tests__/thread.test.ts`** —
  - `headCollapsePredicate`: empty → null; only plain → null; review unresolved most-recent → review id; review unresolved older + plain newest → review id (correct: predicate is "most recent of its kind"); review resolved → null; review resolved + questionnaire unresolved → questionnaire id; multiple unresolved reviews → most recent. (Covers AC-11 edge cases; Q4.)
  - `isBlocking`: head-null + paused → true; head-null + not-paused → false; head-null + active-for-thread → false (active without head means the thread isn't the source of the block); head-non-null + agent-active → true; head-non-null + agent-not-active → false (agent walked away → not blocking).
  - `classifyThreadConfiguration`: each branch.
  - `exhaustiveAssert`: receives a `never` (compile-only).
  - `MESSAGE_TYPES.length === 4`, `HOST_KINDS.length === 8` (closure assertions).

### Vitest server integration (server package)

- **`packages/server/src/routes/__tests__/threads.routes.test.ts`** —
  - `POST /api/threads` happy path per host_kind (parametric over `HOST_KINDS`) — round-trips.
  - `POST /api/threads/:id/messages` round-trip per `MessageType` (parametric over `MESSAGE_TYPES`).
  - Idempotency: re-POST with same `(thread_id, sender_id, client_key)` → 200 (not 201), same id, row count unchanged (Q10).
  - **Idempotency cross-sender:** two different senders POST with the same `clientKey` → both succeed, two rows persisted (per adversary M1; per-sender dedupe namespace).
  - **clientKey validation:** `clientKey: ''` → 400; `clientKey: 'a'.repeat(129)` → 400; `clientKey: 'has space'` → 400; valid UUID v4 → 201.
  - Verdict semantics: append `type='verdict'` → underlying review's `resolved_at` is set; thread `last_active_at` updates; `thread_resolved` event fires.
  - **Verdict authorization (adversary C4):** "agent participant posts `type=verdict` on its own review → 403 with `code: 'verdict_authorization'`"; "non-founder participant posts type=verdict → 403"; "founder participant who is NOT the review's sender posts type=verdict → 200 + `thread.resolvedAt` set + `thread_resolved` event emitted".
  - **Re-open semantics (adversary C5):** "participant posts `type=review` on a thread where `resolvedAt != null` → 201 + `thread.resolvedAt = NULL` + `thread_reopened` event emitted + new HEAD points at the new review message"; "previous verdict message remains in the audit trail with its `resolvesMessageId` unchanged"; "non-participant tries to re-open → 403".
  - Authorization: non-participant `GET /api/threads/:id` → 403.
  - **WS subscribe authorization (adversary M5):** non-participant subscribes to `thread:<id>` → server replies forbidden ack, no events delivered for that topic; participant subscribes → ack received, subsequent `thread_message_appended` events delivered.
  - Pagination: `messages_cursor` walks backward correctly.
  - Validation: `host_kind: 'invalid'` → 400; missing `client_key` → 400.
- **`packages/db/__tests__/migration-l1.test.ts`** (REVISED per adversary C2) —
  - Insert pre-migration sample data: a `threads.kind='review'` row, an `items` row with `kind='review'` referencing that thread, a `messages` row in that thread with subject+body matching the item, AND a `responses` row referencing the `items.id`. Plus a separate plain `kind='chat'` thread with a `messages` row but no item / no response.
  - Run up-migration.
  - Assert step 5 outcome: the chat thread's message has `type='plain'` with `payload.text = '<subject>\n\n<body>'`, `legacy_item_id = NULL`. The review thread's message has `type='review'` with `payload.title/reasoning/artifactRef` populated from the items row, `legacy_item_id = items.id`.
  - Assert step 7 outcome: a NEW `messages` row exists with `type='verdict'`, `payload.resolvesMessageId === <review-message.id>`, `payload.decision === <responses.decision>`, `legacy_item_id === <responses.item_id>`. The review message's `resolved_at = responses.responded_at`. The thread's `resolved_at = responses.responded_at`.
  - Assert audit query passes: `SELECT count(*) FROM responses LEFT JOIN messages ON messages.legacy_item_id = responses.item_id WHERE messages.id IS NULL` returns 0.
  - Assert FK / constraint state: post-migration, the `responses` table no longer exists (Postgres: confirms the constraint drop ran first, no orphaned constraint).
  - Run down-migration.
  - Assert: pre-migration shape restored from snapshot, including the original `responses` row.
  - Parametrized over both drivers (sqlite + pg) using the existing `pg-test-runner.ts`.

### Playwright e2e (web package)

- **`packages/web/e2e/threads.spec.ts`** —
  - **plain coach thread** — open Conversations, navigate to a coach thread (host_kind=user, pinned), send a plain message via Composer, assert message appears in the stream and the API was called with `type='plain'`.
  - **review thread (issue-shape)** — open Conversations, navigate to a review thread, assert `ThreadHead` mounts with the artifact slot rendering inline (text_diff stub), the sticky `ReviewVerdictBar` is visible, click `Approve`, assert verdict CommentRow appears with `StatusChip='approved'`, head collapses (`ThreadHead` unmounts).
  - **questionnaire thread** — same shape as review but with `QuestionnaireAnswerBar`; clicking an option records the answer + resolves the questionnaire.
  - **back-compat (legacy data)** — seed an L1-pre-migration thread fixture; load via the new endpoint; assert the message renders as `type='plain'` (subject+body collapsed into payload.text).
  - **WorkBet thread** — open `/work/bet/:id`, click a thread row in the bet's threads section, assert `<ThreadShell>` opens in a dialog.

### Visual regression

- **`packages/design-system/visual/Thread*.visual.test.ts`** — one test per L1 component, ≤5% pixel diff against the corresponding `.html` reference.

---

## Section 10 — Route checklist

`route-checklist:` block — every route the L1 migration touches.

**Server routes that change shape (or get rewritten):**
- `GET /api/conversations` — coexists; column shape changes (`kind` → `hostKind` + `hostId`); deprecation header.
- `GET /api/conversations/:threadId` — coexists; returns new shape (no `items + responses` aggregate).
- `POST /api/conversations/items` — unchanged externally; internally writes a thread + plain message in addition to the `items` row.
- `POST /api/conversations/responses` — deprecated but functional; internally creates a `verdict` message + writes a `responses` row for compat (until L7 unblock unifies on the new path).

**New server routes:**
- `GET /api/threads` (with `host_kind` + `host_id` OR `participant_id` scope).
- `GET /api/threads/:id` (with messages pagination).
- `POST /api/threads`.
- `POST /api/threads/:id/messages`.
- `WS /ws` topic `thread:<id>` (subscription; not a new route).

**Server services that change reads:**
- `services/agents.ts:170` (and `routes/agents.ts:170`) — `threads.kind='direct'` → `host_kind='agent'`.
- `services/skill-tools/send-message.ts:33` — same rewrite.
- `services/builtin-routines.ts:474` — drop the `threads.kind='post-bet-retro'` filter; rely on the `items.body LIKE marker` filter alone (or, follow-up: add a routine_id reference on the thread row — defer).
- `services/review-item-factory.ts` — when creating a thread, sets `host_kind` + `host_id` from the knowledge item context.
- `services/session-review-creator.ts` — when creating a thread, sets `host_kind='task'` + `host_id=task.id`.
- **`services/daily-digest.ts`** (REVISED for adversary M4) — currently reads from the legacy `responses` table to filter items "already responded to" (lines 33-44 read range). The L1a migration drops `responses`. Resolution: rewrite the query to `LEFT JOIN messages m ON m.legacy_item_id = items.id AND m.type = 'verdict'` and filter on `m.id IS NULL` for "not yet responded". Drift-prevention: add a Vitest assertion that the rewritten digest produces the same row set as the pre-migration query on the snapshot fixture. **Owned by L1a in T8** (legacy reader fixes).
- **`services/policy-engine.ts`** (REVISED for adversary M4) — currently does `db.insert(responses)` to record verdicts (line 104). The L1a migration drops `responses`. Resolution decision: **for L1a, refactor `policy-engine.ts` to call the new write path internally** — instead of `db.insert(responses)`, it constructs the same shape and posts via the repo layer (T5) as a `verdict`-typed message append. The legacy `POST /api/conversations/responses` route (§6.4 row "POST /api/conversations/responses") wraps the same call so external callers continue to work for one release. This avoids a half-state where policy-engine writes to a dropped table. **Owned by L1a in T8.5** (new sub-task; tracked in §13).

**Web page mounts:**
- `/conversations/review` (existing) — `<ThreadShell>` mount; AC-9 fixture removal.
- `/conversations/chat` (existing) — same.
- `/work/bet/:id` (existing) — adds threads-section + dialog-mounted `<ThreadShell>`.

**Authorization-required routes (participants-only):**
- `GET /api/threads`, `GET /api/threads/:id`, `POST /api/threads/:id/messages` — caller must be in `thread.participants` (server enforces). `POST /api/threads` — caller must be in `participants` of the body.

---

## Section 11 — Security & abuse cases

`security & abuse cases:` block.

| Concern | Status | Notes |
|---|---|---|
| Rate-limit on every POST/PATCH | Addressed | Existing rate-limit middleware applies to `POST /api/threads`, `POST /api/threads/:id/messages`. Reuse the per-IP-per-route limits. The redact endpoint (deferred) inherits the same. |
| Body-size limit on POST | Addressed | Existing payload-size middleware applies. Message `payload` is JSON; cap at 64KB per message (decision §15-B) — covers `reasoning[]` arrays, rejects large pasted secrets. Larger artifacts go through artifact refs. |
| Input-trust boundary on agent-authored fields | Addressed | `payload.reasoning[]` (review) and `payload.text` (plain) come from agent harness. Server validates against Zod schemas at the boundary (length caps: text ≤16KB, reasoning items ≤256 each, ≤16 items). HTML/markdown rendering on the client is via React (no `dangerouslySetInnerHTML`); inline refs are rendered as DS pills, not embedded HTML. |
| Secret-handling for new credential surfaces | N/A | No new credentials in L1. |
| Path-traversal | N/A | `host_kind` is a closed Zod enum — server rejects anything not in `HOST_KINDS`. `host_id` is a string but never used as a filesystem path. |
| SSRF on outbound URLs | N/A | No outbound URLs in L1. Inline refs are internal entity ids only. |
| Authorization: who can post a message? | Addressed | Server checks `caller.identityId ∈ thread.participants`. Agents posting *as* a user: an agent identity can be in `participants`; an agent cannot impersonate a human (server checks `senderId === auth.identityId`). |
| Authorization: who can post a `verdict`-typed message? | Addressed (REVISED for adversary C4) | Beyond the base participant rule: caller's role must be `founder`, AND caller's identity must NOT equal the sender of the review/questionnaire message that the verdict resolves. Prevents an agent participant self-approving its own review. Returns 403 (`code: 'verdict_authorization'`) on failure. Tests in §9: "agent participant posts type=verdict on own review → 403"; "founder participant posts type=verdict → 200 + thread.resolvedAt set". |
| Authorization: who can re-open a resolved thread? | Addressed (REVISED for adversary C5) | Re-open is implicit: any participant who can post a `review` or `questionnaire` message to the thread also re-opens it. The server enforces `caller.identityId ∈ thread.participants` and (for `type='review'`) the message-creator role rule per Concept §4.5.7 (the future v2 may restrict this; for L1a the participant check is sufficient). Tests in §9: "non-participant posts re-opening review → 403"; "participant posts review on resolved thread → 201 + `resolvedAt = NULL` + `thread_reopened` event". |
| Authorization: who can subscribe to `thread:<id>` over WS? | Addressed (REVISED for adversary M5) | Server fetches the thread on subscribe; `caller.identityId ∈ thread.participants` required. Otherwise replies `{ "error": "forbidden", "topic": "thread:<id>" }` and does not join the topic. Test in §9: "non-participant subscribes → forbidden ack, no further events delivered". |
| Authorization: who can create a thread? | Addressed | Caller must be one of the participants in the request body. Cross-team threads: the bet's team or an explicitly-invited agent. Server checks via the existing identity matrix (`agents` + `users` table union). |
| Idempotency: clientKey collision across senders | Addressed (REVISED for adversary M1) | The unique constraint is `(thread_id, sender_id, client_key)`. Different senders may submit the same clientKey by design (each owns its own dedupe namespace). The 8-128-char URL-safe regex (§6.1) prevents pathological values; per-IP rate limit prevents key-space-flood DoS. |
| Authorization: who can redact? | Deferred (with column) | Concept §4.5.8 says structured replacement preserving id/sender/type. L1 ships the `redactedAt` column + the `RedactedPayload` type; the *operation* is L7 or later. When implemented: founders + the message's sender (within an N-minute self-redact window) may redact. |
| Authorization: who can soft-delete? | Addressed | Same as redact — deferred at the verb level. Column + type ship. |
| Audit invariant: payload immutability | Addressed | Server endpoints expose only append + soft-delete + redact (deferred); no `PATCH` on a message. Drizzle accessors are wrapped in a thin repo (`thread-repo.ts`) to prevent stray updates. |
| Idempotency replay | Addressed | `(thread_id, sender_id, client_key)` UNIQUE → duplicate replays return the existing row, not a new one. Test in §9. |
| Cost / DoS via thread-creation spam | Addressed (by inheritance) | Existing rate-limit + body-size middleware. Per-user per-day cap on thread creations is enforced at the routing layer (existing). |

---

## Section 12 — Design-it-twice on non-trivial sub-decisions

### Decision A — Where does `headCollapsePredicate` live?

**Option 1.** `@hyperidle/shared` package (`packages/shared/src/thread.ts`). Server (sort hint, list endpoint) and web (head mount decision) both import.

**Option 2.** Server-only, with the result projected onto each thread row as a derived `head_message_id` field returned by the API. Web reads the field; never re-runs the predicate.

**Trade-off.**
- Option 1: one source of truth at code level; web *can* re-run if it has the messages locally (e.g., after appending a verdict, predicate flips → head unmounts without a server round-trip). +1 latency saving on the resolve-flip animation. Cost: shared package owns a tiny piece of business logic.
- Option 2: zero web logic; simpler. Cost: every state change requires a refetch to know the new head; resolve-flip animation requires either WebSocket push of the new `head_message_id` (which is what Option 1 also needs for cross-tab consistency, so this is parity) OR a refetch.

**Pick: Option 1.** Consistency with concept §4.5.5's "deterministic re-render" — same function, server and client. The shared package already houses thread-level types; one tiny pure function does not bloat it. Performance is identical; the architecture is cleaner.

### Decision B — Is `verdict` a separate message type or a sub-shape of `plain`?

**Option 1.** A fourth message type `verdict` (closed enum: `plain | review | questionnaire | verdict`).

**Option 2.** A `plain` message with a special `verdict` field in payload.

**Trade-off.**
- Option 1: discriminant exhaustiveness covers verdict (renderer must handle it). Verdict messages render via a dedicated `CommentRow` variant with a `StatusChip`. Concept §4.5.7 vocabulary calls "verdict" a *binding response* (action) but §4.5.8 hard-rule 4 says "a binding verdict is a message in the thread, not hidden state". Calling the message type `verdict` matches the concept's prose.
- Option 2: smaller enum, but requires a runtime predicate `isVerdict(payload)` to switch on; loses TS narrowing.

**Pick: Option 1.** Concept §4.5.8 hard-rule 4 + approved.md §8 hard-rule 2 both treat the verdict-message as a thing. Discriminant exhaustiveness wants a flat enum. Approved.md §2.4 `CommentRow.message.payload.verdict` already imagines a verdict-shaped payload — a separate type expresses that cleanly.

### Decision C — WebSocket topic strategy

**Option 1.** Per-thread channel: subscribe to `thread:<threadId>`; server fans out per thread.

**Option 2.** Per-host channel: subscribe to `host:<hostKind>:<hostId>` and receive all events on that host.

**Option 3.** Per-user channel: subscribe to `user:<userId>` and receive every event on threads where you participate.

**Trade-off.**
- Option 1: minimal noise; client only gets what it's looking at. Cost: subscribe/unsubscribe on every navigation. The Submenu still needs the global thread-list channel `'conversations'` (already exists).
- Option 2: useful for the WorkBet "threads on this bet" view (one subscription covers all threads). Cost: subscribers receive events for threads they don't have open.
- Option 3: simplest from the server side; one subscription per user. Cost: heavy client-side filtering; cross-org noise; doesn't compose with anonymous (agent) participants.

**Pick: Option 1, plus the existing `'conversations'` topic for the thread-list refresh.** Per-thread is what the detail view actually needs; the host-scoped use case (WorkBet threads section) gets a refetch on the thread-list channel emit, which is rare enough to be acceptable. We can layer Option 2 on later if it becomes a hot path.

### Decision D — Ship the `redact` endpoint in L1 or defer?

**Option 1.** Ship column + endpoint + test.

**Option 2.** Ship column + constraint, defer endpoint to a follow-up.

**Trade-off.**
- Option 1: complete contract. Adds ~half-day of endpoint + auth + audit-event work + tests.
- Option 2: contract surface intact (the column + RedactedPayload type), just no verb. Saves time. The audit-event for `thread_message_redacted` can be added in the follow-up without breaking subscribers.

**Pick: Option 2.** L1 is already at the edge of 5d (§15). Concept and migration are complete; the verb adds no AC value. Ship as part of L7 or a dedicated follow-up.

### (Out-of-scope in §12 but worth recording) Decision E — `participants` storage

JSON column (TEXT, sorted IdentityId array) vs. join table `thread_participants(thread_id, identity_id)`. Picked JSON to match the existing convention (`threads.participants TEXT` today) and keep the migration small. Trade-off: cannot index participant membership efficiently; the `participant_id` filter on `GET /api/threads` does a linear scan. Acceptable at HyperIdle's scale (one factory, single-digit founders, low hundreds of agents). If this becomes a hot path, add a `thread_participants` join table in a follow-up — concept-doc-impact zero (it's a storage detail).

---

## Section 13 — Ordered task list

Each task: file(s) touched, what proves it (tests from §9), dependencies (earlier task numbers).

0. **T0 — Concept-doc updates (REVISED for adversary C1).** Land the closed-enum closure for `verdict` AS PART OF L1a's commit. Without T0, the L1a discriminated union violates the §4.5.8.5 hard rule "Adding a new message type requires updating this section first". *Documentation-only change.*
   - Files:
     - `docs/HUMAN_INTERFACE_LAYER.md` §4.5.1 line 504 → `Initial set: plain, review, questionnaire, verdict.`
     - `docs/HUMAN_INTERFACE_LAYER.md` §4.5.8 closure rule line 604 → `Message-type vocabulary is closed: plain, review, questionnaire, verdict.`
     - `docs/HUMAN_INTERFACE_LAYER.md` §4.5.8 *Verdict semantics* paragraph: explicit relationship — a `verdict`-typed message carries `decision` (one of the 5 binding actions) AND `resolvesMessageId` pointing at the review/questionnaire it terminates.
     - `docs/work-packages/SHARED.md` Thread primitive entry's `Message types (closed)` line.
     - `docs/ARCHITECTURE.md` §2.1 messages-table comment.
     - `docs/AGENT_LAYER.md` vocabulary note (if present, sync with new vocabulary).
   - Proof: AC-1 git diff; the four anchors all read the new vocabulary.
   - Deps: none.

1. **T1 — Concept-doc verification.** Verify HIL §4.5 + ARCHITECTURE.md §2.1 + AGENT_LAYER.md vocabulary + SHARED.md Thread-primitive entry are all consistent with this plan AND T0's edits.
   - Files: same as T0 (read-only verification pass).
   - Proof: AC-1 git diff matches T0's expected changes; manual review.
   - Deps: T0.

2. **T2 — Shared types.** Implement `packages/shared/src/thread.ts` per §4.
   - Files: `packages/shared/src/thread.ts` (new), `packages/shared/src/index.ts` (re-exports), `packages/shared/src/__tests__/thread.test.ts` (new).
   - Proof: AC-4, AC-11, headCollapsePredicate + isBlocking + classifyThreadConfiguration + closure tests.
   - Deps: T1.

3. **T3 — DB schema + migration up.** Apply §5.1 schema; write the up-migration with backfill (steps 1-7 of §5.3). Add new columns nullable, populate, then NOT NULL.
   - Files: `packages/db/src/schema.ts`, `packages/db/drizzle/0007_thread_primitive_l1.sql`, `packages/db/drizzle-pg/0006_thread_primitive_l1.sql`, `packages/db/drizzle/meta/_journal.json`, `packages/db/drizzle-pg/meta/_journal.json`.
   - Proof: `bun run db:migrate` succeeds on a sample database.
   - Deps: T2.

4. **T4 — DB drop step + responses backfill.** Steps 8-10 of §5.3 (verdict backfill, drop legacy columns, drop `responses`).
   - Files: same migration file as T3 (one migration, multiple steps inside) plus rollback doc `packages/db/L1-rollback.md`.
   - Proof: AC-14 migration test (`packages/db/__tests__/migration-l1.test.ts`).
   - Deps: T3.

5. **T5 — Repo layer.** Thin Drizzle wrapper module that mediates row-type ⇄ shared-type and enforces append-only / no-mutation constraints on messages.
   - Files: `packages/server/src/repos/thread-repo.ts` (new).
   - Proof: covered by T6 + T8 integration tests.
   - Deps: T3, T4.

6. **T6 — Event Bus events + WS topic.** Add the four new events to the union; subscribe in `WsBroadcaster`; route to `thread:<id>` topic per Decision C.
   - Files: `packages/shared/src/events.ts`, `packages/server/src/services/ws-broadcaster.ts`, `packages/shared/src/__tests__/events.test.ts`, `packages/server/src/services/__tests__/ws-broadcaster.test.ts`.
   - Proof: events are part of the union (compile); broadcaster routes per topic (unit test).
   - Deps: T2.

7. **T7 — Server REST routes.** Implement `routes/threads.ts` (the four endpoints in §6.1). Mount in `app.ts` at `/api/threads`. Add Zod schemas.
   - Files: `packages/server/src/routes/threads.ts` (new), `packages/server/src/app.ts` (mount), `packages/server/src/routes/__tests__/threads.routes.test.ts` (new).
   - Proof: AC-7, AC-10, AC-12; round-trip + idempotency + auth tests.
   - Deps: T5, T6.

8. **T8 — Legacy reader fixes (REVISED for adversary M4).** Update the SEVEN `threads.kind` / `responses` callers: `routes/agents.ts`, `skill-tools/send-message.ts`, `services/builtin-routines.ts`, `services/review-item-factory.ts`, `services/session-review-creator.ts`, **`services/daily-digest.ts`** (rewrite the responses-join to a verdict-message-join via `legacy_item_id`), and **`services/policy-engine.ts`** (see T8.5 — policy-engine is non-trivial enough to be its own task).
   - Files: `packages/server/src/routes/agents.ts`, `packages/server/src/skill-tools/send-message.ts`, `packages/server/src/services/builtin-routines.ts`, `packages/server/src/services/review-item-factory.ts`, `packages/server/src/services/session-review-creator.ts`, `packages/server/src/services/daily-digest.ts`.
   - Proof: existing tests for those services (`daily-digest.test.ts` etc.) continue to pass post-migration; type-check green; daily-digest fixture-snapshot test asserts the rewritten query returns the same row-set as the pre-migration query on the seed dataset.
   - Deps: T3, T4 (the columns the readers reference no longer exist).

8.5. **T8.5 — policy-engine.ts refactor (REVISED for adversary M4).** Replace `db.insert(responses)` (line 104) with a call into the new repo layer (T5) that appends a `verdict`-typed message via `POST /api/threads/:id/messages` semantics. The legacy `POST /api/conversations/responses` route (T9) wraps the same call so external callers continue to work for one release.
   - Files: `packages/server/src/services/policy-engine.ts`, `packages/server/src/__tests__/policy-engine.test.ts` (rewrite expectations).
   - Proof: `policy-engine.test.ts` continues to assert "verdict was recorded for item X" — the new assertion checks for a `verdict`-message in the relevant thread instead of a `responses` row. Round-trip through the repo layer.
   - Deps: T5, T7.

9. **T9 — Legacy endpoint coexistence.** Update `routes/conversations.ts`: project new schema → legacy response shape; add deprecation headers; rewire the `POST .../responses` to internally append a `verdict` message via the repo layer (no more `responses` write — the table is dropped).
   - Files: `packages/server/src/routes/conversations.ts`.
   - Proof: existing tests for the conversations endpoint continue to pass (back-compat via API).
   - Deps: T7, T8, T8.5.

10. **T10 — DS HTML references.** Claude Design produces 7 HTML reference files in `packages/design-system/html/`. *Not coded by the implementer — produced ahead of T11 by the design step.*
    - Files: `packages/design-system/html/{ThreadHostBanner,ThreadHead,ReviewVerdictBar,QuestionnaireAnswerBar,CommentRow,Composer,ThreadShell}.html`.
    - Proof: visual regression baseline established.
    - Deps: T1 (designer cross-reference with approved.md).

11. **T11 — DS components (L1a scope: SIX components).** Implement six components per §7. `QuestionnaireAnswerBar` is L1b's responsibility — until then, `ThreadHead` renders the questionnaire body but does not surface an answer affordance (a placeholder text node states "Answer UI coming in L1b" — covered by a Vitest assertion).
    - Files: `packages/design-system/src/{ThreadHostBanner,ThreadHead,ReviewVerdictBar,CommentRow,Composer,ThreadShell}.{tsx,stories.tsx}`, `packages/design-system/src/__tests__/<each>.test.tsx`, `packages/design-system/visual/<each>.visual.test.ts`.
    - Proof: AC-13 visual regression ≤5% per component; per-state Vitest assertions.
    - Deps: T2, T10.

12. **T12 — MessageRenderer.** Discriminant-dispatching component used by `CommentStream` and `ThreadHead` to pick the right render path per `message.type`. Renderer covers all FOUR closed-enum types (`plain | review | questionnaire | verdict`) — exhaustiveness requires the questionnaire branch to render *something*; in L1a it renders the body + placeholder.
    - Files: `packages/design-system/src/MessageRenderer.tsx`, `__tests__/MessageRenderer.test.tsx`.
    - Proof: `exhaustiveAssert` reachable only when a new type is added without updating the switch (compile-time AC-11).
    - Deps: T2, T11.

13. **T13 — Page integration: ConversationsReview.tsx.** Replace `MockReviewItem` + `MOCK_REVIEWS` with a fetch + `<ThreadShell>` mount.
    - Files: `packages/web/src/pages/ConversationsReview.tsx`, `__tests__/ConversationsReview.test.tsx` (rewrite), `__tests__/ConversationsReview.reasoning.test.tsx` (rewrite — Reasoning block lives inside `ThreadHead` now).
    - Proof: AC-9 grep on `MockReviewItem`; existing tests rewrite + AC-13 e2e (review thread).
    - Deps: T7, T11, T12.

14. **T14 — DEFERRED to L1b.** ConversationsChat.tsx full integration. **For L1a:** keep the page loading by leaving the existing `MOCK_THREADS` fixture in place with a TODO comment referencing L1b; AC-9 grep on `MockThread` is L1b's responsibility. The protected e2e `conversations.spec.ts` continues to pass against the stubbed page. (See §15 split rationale.)
    - L1a files (minimal): `packages/web/src/pages/ConversationsChat.tsx` — TODO comment only.
    - Proof: existing protected `conversations.spec.ts` passes.
    - Deps: T7.

15. **T15 — DEFERRED to L1b.** WorkBet `MockBetComment` removal + bet threads-section. **For L1a:** keep `MockBetComment` with a TODO comment; AC-9 grep on `MockBetComment` is L1b's responsibility. (See §15 split rationale.)
    - L1a files (minimal): `packages/web/src/pages/WorkBet.tsx` — TODO comment only.
    - Proof: existing protected `work.spec.ts` passes.
    - Deps: none for L1a.

16. **T16 — Playwright E2E (L1a scope: FOUR test cases).** Implement `packages/web/e2e/threads.spec.ts` with the L1a-shipping cases:
    - `plain coach thread` — open Conversations, navigate to a coach thread, send a plain via Composer.
    - `review thread (issue-shape)` — open, see ThreadHead with stub artifact slot, click Approve, see verdict CommentRow with `StatusChip='approved'`, head collapses (ThreadHead unmounts).
    - `back-compat (legacy data)` — seed pre-migration thread fixture; load via the new endpoint; assert `type='plain'` rendering with subject+body collapsed into `payload.text`.
    - `re-open semantics` (adversary C5) — resolve a review, then post a new review on the same thread; assert `thread.resolvedAt` clears, the new review becomes HEAD, and the previous verdict-message remains visible in the stream.
    - The `questionnaire thread` and `WorkBet thread` cases ship in L1b.
    - Files: `packages/web/e2e/threads.spec.ts`.
    - Proof: AC-13 directly for L1a's four shipping cases.
    - Deps: T13, T11.

17. **T17 — Rewrite `ThreadSections.test.tsx` + `ThreadRow.test.tsx` (REVISED for adversary C3).** These tests asserted the legacy `kind: 'review' | 'chat'` literal on `ThreadItem`. The new `ThreadItem` shape is `{ thread: Thread; head: HeadCollapseResult }`. Rewrite both tests against the new shape; rewrite the components to consume it directly. The legacy projection rule documented in §6.4 stays dormant in `routes/conversations.ts`.
    - Files: `packages/web/src/__tests__/ThreadSections.test.tsx`, `packages/web/src/__tests__/ThreadRow.test.tsx`, `packages/web/src/components/ThreadSections.tsx`, `packages/web/src/components/ThreadRow.tsx`.
    - Proof: rewritten tests pass; existing visual regression on the row component (if any) untouched. Removed from §16 protectedTests list (already done).
    - Deps: T2, T7.

18. **T18 — Full e2e regression sweep.** Run the full `bun run test` + Playwright suite; fix any incidental breakage. The protected suite (§16) MUST still pass — explicitly run `conversations.spec.ts`, `work.spec.ts`, `navigation.spec.ts`.
    - Files: targeted by failures.
    - Proof: AC-15.
    - Deps: T16, T17.

---

## Section 14 — Risks + ambiguities

| Risk | Impact | Mitigation |
|---|---|---|
| Migration backfill maps `responses.item_id → message_id` via the assumption "items.id == substance message id". | If the existing data violates this, verdicts attach to the wrong message. | T4's migration test seeds a fixture with a known `items.id` that does NOT match a message id; if it fails, a fallback maps via `items.threadId` + the most recent `review` message in that thread. Pre-migration audit query: `SELECT count(*) FROM responses WHERE item_id NOT IN (SELECT id FROM items)` — if zero, the assumption holds. |
| Backfilled `client_key = id` for legacy messages collides if a re-emitted client message later uses the same id. | Idempotency uniqueness constraint can fail. | Backfill prefix: `client_key = '__l1_legacy_' || id` (decision §15-C). New messages cannot collide. |
| `routes/conversations.ts` emits both `response_recorded` (legacy) and `thread_message_appended` (new) for one verdict during the deprecation window. | Downstream subscribers double-process. | Subscribers (Knowledge Fabric, Harness Adapter) opt into the new event explicitly; the legacy event stays for one release; documented in the L1 ship-note. |
| Drizzle dual-driver boolean coercion. | `pinned` reads as `0`/`1` vs `false`/`true`. | RESOLVED: `packages/db/src/schema.pg.ts` line 1 imports `boolean` from `drizzle-orm/pg-core` — Postgres uses native boolean. SQLite uses Drizzle `mode: 'boolean'`. Existing `0004_boolean_coerce.sql` confirms the pg convention. |
| ThreadShell scroll-position memory across mount/unmount (approved.md §5 row "Scroll"). | UX regression. | Ship a simple `useRef` + `useLayoutEffect` save/restore in T11; covered by visual regression and a Vitest test asserting `scrollTop` restored after remount. |
| Sticky `ReviewVerdictBar` behavior depends on viewport. | Mobile collision with composer. | Approved.md §6 specifies floor-pin on mobile; T11 implements via `position: sticky bottom` inside the head's container on desktop and `position: fixed bottom` above composer on mobile. Touch targets ≥44px (AQ-015). |
| L8 (Submenu thread sections) consumes `thread.kind` today (`packages/web/src/components/ThreadSections.tsx:16`). The `ThreadItem` interface in that file has a literal `kind: 'review' | 'chat'`. | L1a dropping `threads.kind` breaks L8's existing type. | RESOLVED per adversary C3: T17 rewrites `ThreadSections` and its tests to consume the new `Thread` shape directly. The legacy projection rule (host_kind → 'review' | 'chat') stays dormant in `routes/conversations.ts` for any non-test external consumer; documented in §6.4. |
| The `headCollapsePredicate` runs on every render; for very long threads it scans messages right-to-left. | Perf at >1000 messages. | The shell renders a windowed last-N (50 by default per approved.md §4 overflow row); the full message list isn't loaded. The predicate operates on the loaded window. Documented in the function's JSDoc. |
| The two-tab segmented control on mobile (approved.md §6) is deferred to L11 — but if a user is on mobile and L11 isn't shipped, the artifact never expands. | Acceptable UX gap until L11. | Approved.md §6 and Q6 explicitly defer; the inline preview is enough for L1's e2e. |

---

## Section 15 — Effort breakdown (REVISED for adversary M3 — split L1a / L1b)

The original plan totalled 60h pre-cuts and 51h post-cuts against a 5d cap, with cuts that ate into AC scope (visual-regression baselines, ConversationsChat test rewrites). Per the adversary's M3 finding, the correct response is to SPLIT the story honestly rather than carry over-cap delivery into a "single" L1 ship.

### L1a — foundation (this plan)

| Task | Estimate |
|---|---|
| T0 Concept-doc updates (per adversary C1) | 1h |
| T1 Concept-doc verification | 1h |
| T2 Shared types + tests | 4h |
| T3 Schema + up-migration (steps 1-9 of §5.3) | 5h |
| T4 Migration drop + responses backfill + rollback doc (steps 10-11 + tests) | 4h |
| T5 Repo layer | 2h |
| T6 Event Bus events + WS topic + subscribe protocol | 3h |
| T7 Server REST routes + tests (verdict-auth + reopen + clientKey validation) | 7h |
| T8 Legacy reader fixes (incl. daily-digest rewrite per adversary M4) | 3h |
| T8.5 policy-engine refactor (per adversary M4) | 2h |
| T9 Legacy endpoint coexistence | 2h |
| T10 DS HTML references — 6 components (designer time, parallel) | (parallel) |
| T11 DS components — SIX (6 × ~1h impl + ~1h test/story = 12h) | 12h |
| T12 MessageRenderer | 2h |
| T13 ConversationsReview integration | 2h |
| T14 ConversationsChat — TODO comment only | 0.5h |
| T15 WorkBet — TODO comment only | 0.5h |
| T16 Playwright E2E — FOUR test cases | 3h |
| T17 ThreadSections + ThreadRow rewrite (per adversary C3) | 2h |
| T18 Full regression sweep + fixes | 3h |
| **L1a total** | **~57h ≈ 7d** |

⚠️ This is still over a clean 5d cap, but is honest about the work that L1a's ACs actually require. The two paths to a clean 5d:

- **Path X — accept L+ effort.** Declare L1a's effort = L+ (~7d). Update TRACK-L's effort label. The cuts proposed in the original plan (deferring visual-regression baselines, reversing the ConversationsChat test rewrite cut) violate ACs and DS-quality rules — they shouldn't have been on the table.
- **Path Y — defer T16 e2e to T18 (squash) and trim T11 visual baselines to 4 of 6.** Saves ~3h, brings to 6d. Cost: visual-regression coverage stays partial in L1a; the remaining two baselines land in a follow-up DS story.

**Recommendation: Path X.** L1a is foundational; cutting visual regression undermines the visual-parity rule (`.claude/rules/visual-parity.md`). L1b's smaller surface compensates the calendar.

### L1b — follow-up (separate plan; named here)

| Task | Estimate |
|---|---|
| L1b-T1 `QuestionnaireAnswerBar` DS component + html ref + tests | 3h |
| L1b-T2 `ThreadHead` `onPromoteArtifact` canvas wiring | 3h |
| L1b-T3 ConversationsChat full integration (delete `MockThread` + tests) | 3h |
| L1b-T4 WorkBet `MockBetComment` removal + bet threads-section + dialog | 4h |
| L1b-T5 e2e: questionnaire thread + WorkBet thread | 2h |
| L1b-T6 Final hardcoded-fixture inventory closure | 1h |
| **L1b total** | **~16h ≈ 2d** |

The **L1a + L1b boundary** is named explicitly: L1a closes the foundation (shared types, DB, server, event bus, ThreadShell + 5 supporting DS components, ConversationsReview integration, e2e for shipping types); L1b closes the follow-up surface (questionnaire UI, canvas wiring, ChatPage + WorkBet integrations).

Decisions A-E in §12 apply across the boundary. The L1a commit lands T0 (concept-doc updates), so L1b inherits the closed `verdict` enum without further concept work.

---

## Section 16 — Protected tests

`protectedTests:` block. These test files' assertions must NOT change in the L1 PR. DoD audits the protected set with `git diff --name-only`.

```
protectedTests:
  - packages/web/src/__tests__/ReviewHeader.test.tsx
  - packages/web/src/__tests__/ReviewHeader.blocking.test.tsx
  - packages/web/src/__tests__/ArtifactView.test.tsx
  - packages/web/src/__tests__/ArtifactView.metadata.test.tsx
  - packages/web/src/__tests__/Rail.test.tsx
  - packages/web/src/__tests__/Rail.collapsed-pills.test.tsx
  - packages/web/src/__tests__/IconRail.test.tsx
  - packages/web/src/__tests__/IconRail.unread.test.tsx
  - packages/web/src/__tests__/AppShell.test.tsx
  - packages/web/src/__tests__/AppShell.knowledge-submenu.test.tsx
  - packages/server/src/routes/__tests__/bets.validation.test.ts
  - packages/server/src/routes/__tests__/tasks.validation.test.ts
  - packages/server/src/routes/__tests__/knowledge.validation.test.ts
  - packages/web/e2e/conversations.spec.ts
  - packages/web/e2e/conversations-surface.spec.ts
  - packages/web/e2e/work-surface.spec.ts
  - packages/web/e2e/work.spec.ts
  - packages/web/e2e/navigation.spec.ts
```

**Rationale.**
- `ReviewHeader*`, `ArtifactView*` — Tier-3 components consumed by L1a internally (via the `artifactSlot`); their visual contract stays.
- `Rail*`, `IconRail*`, `AppShell*` — chrome around the thread detail; assertions must hold.
- `bets/tasks/knowledge.validation.test.ts` — server tests for the legacy endpoints; back-compat at the API level.
- `conversations.spec.ts` and the listed e2e specs — the existing user journey through Conversations and Work must continue to load post-L1a. They will need a *fixture refresh* (the new endpoints serve real data, not mocks), but the assertions about layout, navigation, and the verdict grammar must hold.

**Removed from protected set (REVISED for adversary C3).** `ThreadSections.test.tsx` and `ThreadRow.test.tsx` were on the protected list in the original plan, but those tests assert literal `kind: 'review' | 'chat'` on the `ThreadItem` interface — the L1a contract removes that shape. They are now in-scope for L1a rewrite (task T17), consuming the new `Thread` shape directly. The "legacy projection rule" approach (server-side `host_kind → kind: 'review' | 'chat'` projection) is **dropped** from L1a entirely — too much complexity for a single-release coexistence window when the only consumer of the legacy shape was these two tests. If any *external* consumer of `GET /api/conversations` requires the `'review' | 'chat'` field for the duration of one release, the projection rule moves into `routes/conversations.ts` as the legacy endpoint's response transform: predicate `host_kind ∈ {bet, task, knowledge_item, artifact} AND headCollapsePredicate(messages).headMessageId !== null AND messages[headMessageId].type ∈ {review, questionnaire}` ⇒ `'review'`; else ⇒ `'chat'`. This is documented in §6.4 (the legacy endpoint coexistence row) but is no longer required by any in-tree test.

**Tests deliberately NOT in the protected set (because L1a changes their content materially).**
- `ThreadSections.test.tsx`, `ThreadRow.test.tsx` — `ThreadItem` shape rewritten in T17; tests adapt.
- `ConversationsReview.test.tsx`, `ConversationsReview.reasoning.test.tsx` — UI replaced; tests rewrite.
- `ConversationsChat.test.tsx`, `ConversationsChat.chatmode.test.tsx`, `ConversationsChat.j8.test.tsx` — full UI rewrite is L1b; in L1a these tests are kept by stubbing the network layer (msw) and asserting the route loads. See §16 "L1a-vs-L1b test ownership" below.
- `WorkBet.*` tests for the comments slice — removed in L1b with the `MockBetComment` slice.
- `routes/conversations.test.ts` (if exists) — endpoint shape changes; tests rewrite.

**L1a-vs-L1b test ownership (added per adversary M3 split).**
- L1a OWNS: shared types tests; threads.routes.test.ts (server integration); migration-l1.test.ts; ThreadSections.test.tsx + ThreadRow.test.tsx rewrites (T17); ConversationsReview rewrite + reasoning; threads.spec.ts e2e for `plain coach`, `review`, `back-compat (legacy data)`, and a route-level smoke that ConversationsChat + WorkBet still load (no behavior assertions on the comments slice).
- L1b OWNS: questionnaire e2e test case (the answer bar component does not yet exist in L1a); WorkBet thread row e2e; full ConversationsChat rewrite with msw-driven network layer.

---

## Appendix — File touch summary

**New files.**
- `packages/shared/src/thread.ts` + `packages/shared/src/__tests__/thread.test.ts`
- `packages/server/src/repos/thread-repo.ts`
- `packages/server/src/routes/threads.ts` + `packages/server/src/routes/__tests__/threads.routes.test.ts`
- `packages/db/drizzle/0007_thread_primitive_l1.sql` + `packages/db/drizzle-pg/0006_thread_primitive_l1.sql`
- `packages/db/__tests__/migration-l1.test.ts`
- `packages/db/L1-rollback.md`
- `packages/design-system/src/{ThreadHostBanner,ThreadHead,ReviewVerdictBar,QuestionnaireAnswerBar,CommentRow,Composer,ThreadShell,MessageRenderer}.tsx` + `.stories.tsx` siblings + `__tests__/<name>.test.tsx`
- `packages/design-system/html/{ThreadHostBanner,ThreadHead,ReviewVerdictBar,QuestionnaireAnswerBar,CommentRow,Composer,ThreadShell}.html`
- `packages/design-system/visual/ThreadShell.visual.test.ts` (per the cut in §15-(b))
- `packages/web/e2e/threads.spec.ts`

**Edits.**
- `packages/shared/src/index.ts` (re-exports)
- `packages/shared/src/events.ts` (add 4 events)
- `packages/db/src/schema.ts` (replace threads + messages tables; drop responses)
- `packages/server/src/services/ws-broadcaster.ts` (add 4 subscriptions + per-thread topic)
- `packages/server/src/app.ts` (mount /api/threads)
- `packages/server/src/routes/conversations.ts` (legacy coexist + deprecation)
- `packages/server/src/routes/agents.ts:170` (kind→host_kind)
- `packages/server/src/skill-tools/send-message.ts:33` (kind→host_kind)
- `packages/server/src/services/builtin-routines.ts:474` (drop kind filter)
- `packages/server/src/services/review-item-factory.ts` (set host_kind+host_id)
- `packages/server/src/services/session-review-creator.ts` (set host_kind+host_id)
- `packages/web/src/pages/ConversationsReview.tsx` (delete fixture, mount ThreadShell)
- `packages/web/src/pages/ConversationsChat.tsx` (delete fixture, mount ThreadShell)
- `packages/web/src/pages/WorkBet.tsx` (delete MockBetComment — minimal touch per §15 cut)
- `packages/web/src/components/ThreadSections.tsx` (read host_kind, project to legacy `kind: 'review' | 'chat'` for L8 — non-breaking)
- `docs/HUMAN_INTERFACE_LAYER.md`, `docs/ARCHITECTURE.md`, `docs/AGENT_LAYER.md`, `docs/work-packages/SHARED.md` (already aligned per T1 verification)

**Drops (in code).**
- `MockReviewItem`, `MOCK_REVIEWS`, `PREFILL_KEYS` (ConversationsReview.tsx)
- `MockMessageArtifactPreview`, `MockMessage`, `MockThread`, `MOCK_THREADS` (ConversationsChat.tsx)
- `MockBetComment` (WorkBet.tsx) — comments slice on `MockBetDetail` only

**Drops (in DB).**
- `threads.kind`, `messages.recipient_id`, `messages.subject`, `messages.body`, `messages.file_lease_ids`, `responses` table.
- `messages.legacy_item_id` is NOT dropped in L1a — it is a migration-only audit column kept for the snapshot retention window (30 days). A follow-up cleanup story drops it.

---

## Section 17 — Adversary revision log (Phase 4)

Each row maps a finding to the section(s) where the fix lands.

| Finding | Severity | Resolution location |
|---|---|---|
| C1: `verdict` 4th type silently violates closed-enum concept rule | CRITICAL | T0 added in §13 (concept-doc updates). Q3.1 added in §1. AC-1 verification text in §3. |
| C2: `responses.item_id → message_id` mapping unsound | CRITICAL | §5.3 migration step ordering rewritten. `legacy_item_id` audit column added in §5.1 schema and §5.3 step 3. Migration test in §9 covers the ordering and the audit query. |
| C3: protected `ThreadSections.test.tsx` / `ThreadRow.test.tsx` incompatible | CRITICAL | Removed from §16 protectedTests; T17 added in §13 to rewrite both tests + their consumers; legacy projection rule moved to dormant deprecation transform in §6.4. |
| C4: verdict authorization missing | CRITICAL | §6.1 `POST /api/threads/:id/messages` "Authorization (REVISED)" subsection. §11 security table row added. §9 tests added. |
| C5: re-open semantics unspecified | CRITICAL | §6.1 "Re-open semantics" subsection. `ThreadReopenedEvent` added to §6.3. §11 security table row. §9 e2e + integration tests added. |
| M1: idempotency clientKey shape under-specified | MAJOR | §6.1 "clientKey Zod constraint" subsection. §11 idempotency row added. §9 cross-sender + validation tests. |
| M2: Postgres ALTER TABLE / DROP CONSTRAINT + JSONB question | MAJOR | §5.4 expanded; JSONB question RESOLVED (TEXT, both drivers — verified by reading `packages/db/src/schema.pg.ts`). FK-drop ordering specified for `responses` and `messages.recipient_id`. |
| M3: effort honesty — split L1 | MAJOR | §15 rewritten as L1a + L1b split. Header on plan updated. T14 + T15 deferred to L1b. T11 + T16 trimmed to L1a-shipping scope. |
| M4: `daily-digest.ts` + `policy-engine.ts` missing from §10 | MAJOR | §10 services-list updated. T8 expanded to include daily-digest. T8.5 added for policy-engine refactor (writes via repo layer, not the dropped table). |
| M5: WebSocket subscribe/unsubscribe protocol unspecified | MAJOR | §6.2 "Subscribe / unsubscribe protocol" subsection. §11 WS-auth row. §9 WS subscribe test. |
| (Minor) Drizzle boolean-coerce verification | minor | Confirmed in §5.4 (Postgres native `boolean`); ⚠️ flag removed. |
| (Minor) `routes/conversations.ts` double-event during deprecation | minor | §14 risk row stays — deferred to write-tests phase to confirm subscriber list. |
| (Minor) Branded ID types vs. Drizzle row types | minor | §4 ⚠️ flag stays — deferred to write-code phase, opt-in branding. |
| (Minor) `headCollapsePredicate` perf at >1000 messages | minor | §14 risk row stays — JSDoc note covers it; no large-message threads in L1a fixtures. |
| (Minor) Two-tab segmented control mobile gap | minor | §14 risk row stays — explicit gap until L11; documented. |
| (Minor) ScrollPosition memory across mount/unmount | minor | §14 risk row stays — covered by T11 implementation note. |

---

End of L1a plan.
