# L18 — Architecture

## Goal

Mount the L1 `ThreadShell` on Bet detail, Task detail, Knowledge entry, and Artifact detail surfaces. Ship a small per-bet artifact-thread summary so the Bet view doesn't drown when an aggregate carries dozens of artifact threads. Add a `discuss-block` action to L2's `BlockActionsPopover` and thread an optional `blockId` through the message payload. Replace the legacy hand-rolled bet-comment fixture and knowledge ObservationLog with the real thread surface.

## Non-goals

- New Thread / Message types or schemas.
- A new "comments" entity. None exists; none is created.
- Notification chrome (L20's territory).
- Identity disambiguation (auth-middleware follow-up).
- The artifact aggregate component on `WorkBet` (L12's territory). L18 ships a standalone `ArtifactThreadsSummary` section that L12 may absorb later.
- Migration changes (none required — see §types).

## Source-driven notes

- Hono routes are confirmed in repo: `packages/server/src/routes/threads.ts` (L1a) handles `GET /api/threads`, `GET /api/threads/:id`, `POST /api/threads`, `POST /api/threads/:id/messages`. L18 adds one read-side aggregate endpoint and one payload-field extension; nothing else.
- The threads table stores `host_kind` as `text` (`packages/db/src/schema.ts:179`) — opaque string, no Drizzle enum to extend. Adding `artifact` as a host kind is **already legal** and used by L1's contract. No migration.
- The L1 client-side `task-threads.ts` service (`packages/web/src/services/task-threads.ts`) demonstrates the resolve-or-create-thread pattern; L18 generalises this into `host-threads.ts`.
- React Query is already in `packages/web` (used by `useArtifact`, `useBet`); L18 reuses it. ⚠️ UNVERIFIED note: at the time of writing the bet-view fetch is via a custom `useBet` hook (not React Query directly). Architecture confirms this in §data fetching and reuses the same shape.
- Block primitive's per-action menu is `BlockActionsPopover` (`packages/design-system/src/BlockActionsPopover.tsx`) with `BlockAction[]`. Adding `{ id: "discuss-block", label: "Comment on this block", … }` is the L2-sanctioned extension path.

## Type / schema changes

### Database

**None.** `threads.host_kind` is `text not null`; `artifact` is already a permitted value. `messages.payload` is JSON text; the `blockId?` field nests inside the existing plain-message payload. No new tables, no new columns, no migration.

### `packages/shared`

Extend the plain message payload schema:

```ts
// packages/shared/src/thread.ts (illustrative)
export const plainMessagePayloadSchema = z.object({
  text: z.string().min(1),
  blockId: z.string().optional(), // L18 — anchor to a Block id when posted via "Comment on this block"
});
```

`MessageType` enum, `HostKind` enum, `Thread` shape, `Message` discriminant union — **unchanged**. The host-kind `artifact` literal is already in the union.

Add a small read-side type for the bet-level summary endpoint:

```ts
// packages/shared/src/thread.ts (new export)
export interface ArtifactThreadSummary {
  artifactId: string;
  artifactKind: ArtifactKind;
  artifactTitle: string;          // derived display label per ArtifactPreview rules
  threadId: string | null;        // null when no thread exists yet
  messageCount: number;           // 0 means "exists but empty" (rare; never rendered)
  lastMessageAt: string | null;   // ISO8601, null when no messages
  lastMessageSnippet: string | null; // first ~80 chars of last plain payload, null otherwise
  hasUnresolvedReview: boolean;   // mirrors the field already returned by GET /api/threads
}
```

### `packages/db`

**None.**

### `packages/server`

**None for existing routes.** One new read endpoint — see §API.

## API contracts

| Need | Endpoint | Status | Notes |
|---|---|---|---|
| Fetch the thread for a bet | `GET /api/threads?host_kind=bet&host_id=<betId>` | Reuse | L1a, `threads.ts:154`. |
| Fetch the thread for a task | `GET /api/threads?host_kind=task&host_id=<taskId>` | Reuse | L1a + L15's existing helper. |
| Fetch the thread for a knowledge entry | `GET /api/threads?host_kind=knowledge_item&host_id=<knowledgeId>` | Reuse | L1a. |
| Fetch the thread for an artifact | `GET /api/threads?host_kind=artifact&host_id=<artifactId>` | Reuse | L1a. |
| Create a thread on first post | `POST /api/threads` body `{ hostKind, hostId, participants, initialMessage }` | Reuse | L1a, `threads.ts:277`. |
| Append a message (plain, optionally with blockId) | `POST /api/threads/:id/messages` body `{ type: "plain", payload: { text, blockId? }, clientKey }` | Reuse + payload field | L1a route logic unchanged. The `blockId` is opaque to the server; just-string. |
| **Bet-level artifact-thread summary** | `GET /api/bets/:id/artifact-thread-summary` | **NEW** | Returns `{ summaries: ArtifactThreadSummary[] }`. Joins `artifacts` (filtered by bet via the existing aggregate query in `artifacts.ts`) with `threads` and `messages`. |

Why a new endpoint, not an extension of `/api/artifacts`? Two reasons:

1. The artifact list endpoint (`GET /api/artifacts?bet_id=…`) is consumed by other surfaces (L12 aggregate, the artifact gallery). Adding a non-default `include=thread_summary` flag couples the two lifecycles. A separate endpoint keeps them clean.
2. The summary join is a different cost shape — one query that aggregates by-artifact rather than artifact-by-artifact. ⚠️ UNVERIFIED: a single SQL with `LEFT JOIN threads ON threads.host_kind='artifact' AND threads.host_id=artifacts.id` + correlated subquery for `messageCount` and `lastMessageAt` should suffice on SQLite at expected volumes. Builder benchmarks under load.

**Endpoint shape.**

```http
GET /api/bets/:id/artifact-thread-summary
200 OK
{
  "summaries": [
    {
      "artifactId": "a-…",
      "artifactKind": "code_diff",
      "artifactTitle": "auth-service.ts",
      "threadId": "t-…",
      "messageCount": 3,
      "lastMessageAt": "2026-05-04T10:11:12Z",
      "lastMessageSnippet": "Looks good but the cache TTL …",
      "hasUnresolvedReview": false
    }
  ]
}
```

Filter rule: only artifacts with `messageCount >= 1` are returned (server-side filter). Empty array is a valid 200 — render nothing.

Authorisation: same as the artifact list — the founder is the implicit caller; per-tenant isolation inherits from the broader auth middleware (open follow-up — see L1's L8 lore comment).

## Web surfaces, files, and components

### Files added

| Path | Tier | Purpose |
|---|---|---|
| `packages/web/src/services/host-threads.ts` | Service | Generalised resolve-or-create. Replaces / supersedes `task-threads.ts`. Exposes `resolveOrCreateThread(hostKind, hostId, participants, initialText?)`, `postPlainMessage(threadId, text, clientKey, blockId?)`. |
| `packages/web/src/hooks/useHostThread.ts` | Hook | React Query hook keyed `["thread", hostKind, hostId]`. Returns `{ thread, messages, refresh, isLoading, error }`. Wraps `GET /api/threads?host_kind=…&host_id=…` + `GET /api/threads/:id`. |
| `packages/web/src/hooks/useArtifactThreadSummary.ts` | Hook | React Query hook keyed `["bet", betId, "artifact-thread-summary"]`. |
| `packages/web/src/components/ArtifactThreadsSummary.tsx` | Web component (Tier 3 shell-adjacent) | Renders the per-bet summary section. Uses `Tag`, plain text and a Link. No new design-system component. |
| `packages/web/src/components/ArtifactThreadsSummary.stories.tsx` | Stories | Empty / loading / populated / many states. |
| `packages/web/src/components/__tests__/ArtifactThreadsSummary.test.tsx` | Test | Vitest. |

### Files modified

| Path | Change |
|---|---|
| `packages/web/src/pages/WorkBet.tsx` | Replace lines 233-259 (hand-rolled comment section) with `<HostThreadSection hostKind="bet" hostId={bet.id} title="Discussion" />`. Remove `comments` from `BetDetail` (page-side). Append `<ArtifactThreadsSummary betId={bet.id} />`. |
| `packages/web/src/types/bet.ts` | Remove `BetComment` interface (line 14) and the `comments: BetComment[]` field (line 37). |
| `packages/web/src/pages/__fixtures__/work-bet-fixtures.ts` | Drop `comments` array from each `MOCK_BETS` entry. Stories no longer need it. |
| `packages/server/src/routes/bets.ts` | Drop the `comments` aggregate from `GET /api/bets/:id` (it is fixture-only today; the change ripples through the response). |
| `packages/web/src/shell/TaskSheet.tsx` | Replace the "Open thread" link with an inline `<HostThreadSection hostKind="task" hostId={task.id} title="Discussion" inline />`. Sheet width grows to `min(640px, 90vw)`. |
| `packages/web/src/pages/KnowledgeDetail.tsx` | Replace `<ObservationLog … />` with `<HostThreadSection hostKind="knowledge_item" hostId={item.id} title="Discussion" />`. Delete `ObservationLog`, `ObservationLogProps`, and the legacy `observationLog` field on `DetailItem`. |
| `packages/web/src/pages/ArtifactPermalink.tsx` | Below the existing `ArtifactPreview`, add `<HostThreadSection hostKind="artifact" hostId={data.id} title="Discussion" />`. Page wrapper changes to `<div className="p-3 flex flex-col gap-3">` (was `p-6`). |
| `packages/web/src/services/task-threads.ts` | Mark `@deprecated` and re-export from `host-threads.ts`. Builder may delete callers in a follow-up. |
| `packages/design-system/src/BlockActionsPopover.tsx` | No code change. Consumers add a `discuss-block` action to the `items` array. |
| `packages/web/src/pages/WorkBet.tsx` (BetPitch) | When mounting the L16 `BetPitch`, pass an `onCommentBlock(blockId)` callback that resolves-or-creates the bet thread, opens the composer pre-filled with `blockId`. |
| `packages/web/src/pages/knowledge/KnowledgeBody.tsx` | Same `onCommentBlock` wiring against the knowledge-item host. |
| `packages/shared/src/thread.ts` | Add optional `blockId` to plain-message payload schema; export `ArtifactThreadSummary` type. |

### `HostThreadSection` — new co-located web component

`packages/web/src/shell/HostThreadSection.tsx` (Tier 3 shell — shared by bet, task, knowledge, artifact mounts):

```ts
export interface HostThreadSectionProps {
  hostKind: "bet" | "task" | "knowledge_item" | "artifact";
  hostId: string;
  title: string;             // section header — defaults to "Discussion"
  inline?: boolean;          // when true (TaskSheet), no <section> wrapper, no header chrome
}
```

Internals:
- Calls `useHostThread(hostKind, hostId)`.
- Renders `<ThreadShell …/>` with composer wired to `postPlainMessage`. First post triggers resolve-or-create.
- Maintains a focus-restore behaviour around posts to prevent layout-shift focus loss.

This component is the **single place** the four detail surfaces converge through. Renaming, extending, or routing changes happen here once.

## Data fetching

React Query keys (matching the rest of the codebase):

| Hook | Key | Invalidations |
|---|---|---|
| `useHostThread(hostKind, hostId)` | `["thread", hostKind, hostId]` | Invalidate on successful `postPlainMessage` AND on `thread_message_appended` event (when WS is available; out of scope to wire here). |
| `useArtifactThreadSummary(betId)` | `["bet", betId, "artifact-thread-summary"]` | Invalidate when ANY `["thread", "artifact", *]` mutation succeeds inside this bet. Naive: invalidate the summary key on every artifact-thread post regardless of bet (cheaper than scoping). |
| `useBet(betId)` | (existing) | Unchanged. |
| `useArtifact(id)` | (existing) | Unchanged. |

Cache invalidation on post:
- `postPlainMessage` returns the appended message. Caller-side: `queryClient.setQueryData(["thread", hostKind, hostId], …)` to optimistically merge, then refetch on focus / blur. The server's `lastActiveAt` update bumps ordering on the next list call.
- For block-anchored posts: identical flow; the `blockId` is in the payload.

## Hardcoded comment fixtures (AC §626)

The L6 inventory file (`plans/reviews/hardcoded-data-inventory.md`) is **not yet written** in this worktree (L6 has not landed in this branch). The known fixture surfaces L18 closes:

1. `packages/web/src/pages/WorkBet.tsx:233-259` — the hand-rolled `Comments` section with `bet.comments.map(…)`. Backed by `BetComment[]` in the fixture (`packages/web/src/types/bet.ts:14,37` + `__fixtures__/work-bet-fixtures.ts`). **L18 removes it entirely.**
2. `packages/web/src/types/bet.ts:14` — `BetComment` type. **L18 deletes.**
3. `packages/web/src/types/bet.ts:37` — `BetDetail.comments`. **L18 deletes.**
4. `packages/web/src/pages/KnowledgeDetail.tsx:309-347` — `ObservationLog` component (mock observation-log entries). **L18 deletes.**
5. `packages/web/src/fixtures/knowledge-data.ts` — `MockObservationEntry` + `observationLog` arrays in mock knowledge items. **L18 deletes the field; keeps the file for other knowledge fixtures.**
6. `packages/server/src/routes/bets.ts` — comments aggregate in the response. **L18 removes.**

Builder writes follow-up rows back into `plans/reviews/hardcoded-data-inventory.md` with `closed-by: L18` once L6 lands; for now, the change is logged in this architecture doc. (Open question item below.)

## Tests

### Vitest

**Server (`packages/server/src/routes/__tests__/`)**:
- `threads.host-kinds.test.ts` — already covers `host_kind=bet|task|knowledge_item`. Add coverage for `host_kind=artifact` GET / POST round-trip.
- `bets.artifact-thread-summary.test.ts` (new) — `GET /api/bets/:id/artifact-thread-summary` returns the right summaries; filters out artifacts without messages; reflects `lastMessageAt` and `messageCount` correctly.

**Web (`packages/web/src/__tests__/` and `components/__tests__/`)**:
- `WorkBet.thread.test.tsx` — bet detail page renders `HostThreadSection` with hostKind=bet; legacy comments section is gone (assert `bet-comment-thread` testid is absent).
- `WorkBet.artifact-thread-summary.test.tsx` — given a bet with two artifacts (one has thread messages, one doesn't), the summary lists exactly one row.
- `TaskSheet.thread.test.tsx` — task sheet renders thread inline; "Open thread" link absent.
- `KnowledgeDetail.thread.test.tsx` — knowledge entry renders thread; ObservationLog gone.
- `ArtifactPermalink.thread.test.tsx` — artifact detail renders thread below `ArtifactPreview`.
- `host-threads.test.ts` — service `resolveOrCreateThread` round-trip on each host kind; idempotency on duplicate `clientKey`; `postPlainMessage` propagates `blockId` field.
- `BlockActionsPopover.discuss-block.test.tsx` — adding a `discuss-block` item invokes the supplied `onSelect`. (Pure design-system test; the wiring lives at the call site.)
- `BetPitch.block-comment.test.tsx` — clicking "Comment on this block" on a pitch block triggers a `postPlainMessage` with the right `blockId`.

### Playwright e2e (`packages/web/e2e/`)

- `bet-thread.spec.ts` — open Bet detail → thread surface shows → post a comment → reload → message persists.
- `artifact-thread.spec.ts` — open `/artifacts/:id` → thread renders → post a message → reload → message persists.
- `task-thread.spec.ts` — open the kanban → click a task → sheet opens → thread renders → post a message → reload → message persists.
- `knowledge-thread.spec.ts` — open a knowledge entry → thread renders (replacing the observation log) → post → reload → message persists.
- `bet-artifact-thread-summary.spec.ts` — bet detail with artifacts that have messages renders summary section; clicking a row navigates to `/artifacts/:id` and the right thread is open.
- `block-anchor-comment.spec.ts` — open Bet detail → focus a pitch block → open the actions popover → "Comment on this block" → composer opens with prefilled blockId reference → post → message renders inline-after-payload on the block.

All previously-green e2e specs must remain green.

## Ordered tasks for the builder

1. **AC contract proof.** Walk AC §618-628 line by line. Define the verification method for each. Capture in `plans/L18/dod.md`. (Builder.)
2. **Schema sweep.** Confirm `packages/db/src/schema.ts` needs no migration. (5-min audit; emit a note if surprised.)
3. **Shared schema extension.** Add optional `blockId` to plain-message payload schema. Add `ArtifactThreadSummary` type export. Failing test first (a Zod test that round-trips `{ text, blockId }`).
4. **Server endpoint.** New `GET /api/bets/:id/artifact-thread-summary` route in `packages/server/src/routes/bets.ts` (or a new file `bets-artifact-thread-summary.ts` if `bets.ts` is large). Failing test first.
5. **Service.** `host-threads.ts` with `resolveOrCreateThread` + `postPlainMessage(blockId?)`. Failing tests first; deprecate `task-threads.ts`.
6. **Hooks.** `useHostThread` and `useArtifactThreadSummary` with React Query. Failing tests first.
7. **Shell component.** `HostThreadSection` failing test first, then implementation. Stories cover empty / loading / error / populated / inline-vs-section.
8. **Mount on Bet detail.** Replace lines 233-259 of `WorkBet.tsx` with `<HostThreadSection hostKind="bet" …/>`. Remove `comments` from `BetDetail` and `bets.ts` server response. Failing tests first.
9. **Mount on Task sheet.** Replace the "Open thread" link with `<HostThreadSection hostKind="task" inline …/>`. Failing tests first.
10. **Mount on Knowledge detail.** Replace `ObservationLog` with `<HostThreadSection hostKind="knowledge_item" …/>`. Drop the `observationLog` field. Failing tests first.
11. **Mount on Artifact permalink.** Add `<HostThreadSection hostKind="artifact" …/>` below `ArtifactPreview`. Adjust page padding. Failing tests first.
12. **Block-anchored discussion.** Add `discuss-block` action wiring at the BetPitch and KnowledgeBody call sites. Composer accepts a `prefillBlockId`. Plain-message post threads `blockId` through. Failing tests first.
13. **ArtifactThreadsSummary section.** Component, hook, and mount on `WorkBet.tsx` below the bet thread. Failing tests first.
14. **Close inventory rows.** Once L6 lands, mark the rows with `closed-by: L18`. (If L6 is not present in this branch when L18 ships, leave a follow-up note.)
15. **Vitest + Playwright.** Run `bun run check && bun run lint && bun run test && bun run e2e`. All green.
16. **Visual proof.** Screenshot each of the four detail surfaces with a populated thread. Attach to PR.

Each step has a single failing-test-first gate per the project's first principle.

## Open questions / risks

1. **L6 inventory precedence.** The `plans/reviews/hardcoded-data-inventory.md` file does not exist in this worktree. AC §626 says "matching inventory rows from L6 are closed". L18 closes the substantive comment fixtures (Bet comments, Knowledge ObservationLog) regardless. If L6 has not landed by L18 ship-time, the `closed-by` annotation is appended in the PR description and migrated to the inventory file once L6 merges. **Recommendation:** track as a single follow-up.
2. **Artifact "title" derivation.** `ArtifactPreview` previews vary by kind (text_diff has a `file`, deck has `firstSlideTitle`, etc.). The summary endpoint needs a stable display label per artifact. **Recommendation:** reuse the rules already in `packages/web/src/shell/artifactToView.tsx` for the preview header — pull them into a shared helper `artifactDisplayTitle(artifact)` in `packages/shared/src/artifact-display.ts`.
3. **`task-threads.ts` deprecation.** Removing it now would touch every TaskSheet caller and inflate the diff. Recommendation: leave a re-export shim, schedule deletion as a follow-up.
4. **Performance of the summary endpoint at scale.** SQLite query plan on `LEFT JOIN threads + correlated subquery` is fine for tens of artifacts. ⚠️ UNVERIFIED at hundreds. The `threads_host_idx` already covers `(host_kind, host_id, last_active_at)`; that should suffice. Builder profiles if a bet exceeds 100 artifacts in the wild.
5. **WS-driven invalidation of the summary.** When a message lands on an artifact thread, the bet view should refresh the summary. Today, the codebase invalidates on focus/blur and explicit user actions. Wiring a WS event to the summary is out of scope; the founder navigating between pages refreshes naturally.
6. **Multiple participants on a bet thread.** L1's resolve-or-create defaults participants to `[founder, agent-unassigned]` (per L15). For bet threads, the participant set is more like `[founder, team-lead-agent]` — but agent assignment is a separate workpackage. **Recommendation:** keep the `[founder, "agent-unassigned"]` default for consistency; revisit when the team-agent assignment story lands.
7. **`agent-unassigned` placeholder consistency.** L15 introduced the placeholder. L18 inherits. Following L15's convention; nothing new.

## Acceptance-criteria mapping

| AC | Verification |
|---|---|
| §619: surface mounted on Bet, Task, Knowledge, Artifact | Vitest + Playwright per surface. |
| §620: every host carries a thread; artifact-attached threads work | `host-threads.test.ts` + Playwright on all four. |
| §621: bet's prior comment fixture replaced; task's "open thread" opens the same primitive | `WorkBet.thread.test.tsx` (asserts old testid absent) + `TaskSheet.thread.test.tsx`. |
| §622: volume-management designer call documented and shipped | `ArtifactThreadsSummary` component + `bet-artifact-thread-summary.spec.ts`. |
| §623: block-anchored discussion uses L2's affordance, no separate dependency | `BlockActionsPopover.discuss-block.test.tsx` + `BetPitch.block-comment.test.tsx`. |
| §624: Vitest covers thread lifecycle on each host + posting + block anchor | Test list above. |
| §625: Playwright covers Bet and Artifact post-and-reload | `bet-thread.spec.ts` + `artifact-thread.spec.ts`. |
| §626: hardcoded comments removed; L6 rows closed | Inventory annotations + assertion that `bet-comment-thread` testid is gone. |
| §627: green check + lint + test + e2e | `bun run verify` + Playwright in CI. |
