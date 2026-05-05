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
- The L1 client-side `task-threads.ts` service (`packages/web/src/services/task-threads.ts`) demonstrates the resolve-or-create-thread pattern; L18 generalises this into `host-threads.ts`. Existing exports are `resolveOrCreateTaskThread(taskId, founderId, agentParticipantId)` and `postRequestMessage(threadId, text, clientKey)`.
- **Data fetching is `useFetch`-based, not React Query.** Verified: `packages/web/package.json` does not depend on `@tanstack/react-query`, and a grep across `packages/web/src` returns zero references. The shared primitive is `packages/web/src/hooks/useFetch.ts` — a 50-line `fetch + useState + cancellation` hook. Existing consumers (`useBet`, `useArtifact`, `useArtifacts`) all wrap it. L18 follows the same pattern; introducing React Query is a cross-cutting workpackage of its own and is out of scope here. (See §"Data fetching" for the L18 hook contract.)
- Server-side query parameter convention is camelCase. Verified: `packages/server/src/routes/artifacts.ts:200` reads `c.req.query("betId")` (and `taskId`, `productId`); `packages/web/src/hooks/useArtifacts.ts:9` writes the same via `params.set("betId", filter.betId)`. ⚠️ Exception: the threads list endpoint uses `host_kind` / `host_id` (snake) — that contract is L1a's, not changed by L18.
- Block primitive's per-action menu is `BlockActionsPopover` (`packages/design-system/src/BlockActionsPopover.tsx`) with `BlockAction[]`. Adding `{ id: "discuss-block", label: "Discuss", … }` is the L2-sanctioned extension path. **The popover itself is not wired on either of L18's consumer surfaces today** — see §"Block popover wiring" for the new host-side work.

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
| **Bet-level artifact-thread summary** | `GET /api/bets/:id/artifact-thread-summary` | **NEW** | Returns `{ summaries: ArtifactThreadSummary[], totalCount: number, truncated: boolean }`. Joins `artifacts` (filtered by bet via the existing aggregate query in `artifacts.ts`) with `threads` and `messages`. **Server-enforced cap: 10 rows.** See "Endpoint shape" below for cap semantics. |

Why a new endpoint, not an extension of `/api/artifacts`? Two reasons:

1. The artifact list endpoint (`GET /api/artifacts?betId=…` — note camelCase, verified at `packages/server/src/routes/artifacts.ts:200`) is consumed by other surfaces (L12 aggregate, the artifact gallery). Adding a non-default `include=thread_summary` flag couples the two lifecycles. A separate endpoint keeps them clean.
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
  ],
  "totalCount": 12,
  "truncated": true
}
```

Cap rule (F6 polish): the server returns at most **10 summaries**, ordered by `lastMessageAt DESC, artifactId ASC` (deterministic tie-break). `totalCount` is the unbounded count of artifacts on the bet that have at least one thread message; `truncated` is `true` when `totalCount > 10`. The client uses these to render the "+N more" affordance (design F3). Cap-without-cursor is acceptable for v1; the `View all` link points to `/artifacts?betId=<bet>` which already supports pagination.

Filter rule: only artifacts with `messageCount >= 1` are included (server-side filter). Empty `summaries` is a valid 200 — render the design's empty-section stub.

Authorisation (F5 polish): the new endpoint must verify the caller has access to the named bet **before** returning any artifact-thread snippets. The `bets.ts` route file already has a per-bet read path used by `GET /api/bets/:id`; L18 reuses **the same** auth check. Builder name to follow the existing helper — if `bets.ts` exposes a `loadBetForCaller(betId, c)` (or equivalent) helper that returns 404 on missing-or-unauthorised, the new endpoint calls it first. If no such helper exists today, builder extracts the existing per-bet auth path into a named helper (`assertBetReadable(betId, c)` is the suggested name) and uses it on **both** endpoints. Without this guard the summary endpoint inherits the broader IDOR risk that L1's L8 lore note already flagged on `participant_id`-scoped thread reads (`packages/server/src/routes/threads.ts:147-153`); L18 does not get to leave a second IDOR door open. See §Risks for the cross-cutting framing.

## Web surfaces, files, and components

### Files added

| Path | Tier | Purpose |
|---|---|---|
| `packages/web/src/services/host-threads.ts` | Service | Generalised resolve-or-create. Replaces / supersedes `task-threads.ts`. Exposes `resolveOrCreateHostThread(hostKind, hostId, founderId, agentParticipantId)` and `postPlainHostMessage(threadId, text, clientKey, blockId?)`. **F4 rename rationale:** the existing `postRequestMessage` name is misleading — the message type is `plain` (not `request`); the L18 generalisation drops the `Request` misnomer. The old `task-threads.ts` re-exports the renamed functions under the legacy names so existing TaskSheet callers compile unchanged (`postRequestMessage = postPlainHostMessage`, `resolveOrCreateTaskThread = (taskId, founderId, agent) => resolveOrCreateHostThread("task", taskId, founderId, agent)`). |
| `packages/web/src/hooks/useHostThread.ts` | Hook | `useFetch`-based hook. Returns `{ data: { thread, messages } | null, error, isLoading, refresh }`. Internals: composes two `useFetch` calls — first `GET /api/threads?host_kind=…&host_id=…` to resolve the thread id, then `GET /api/threads/:id` for the messages. The `refresh` function is a stable callback that bumps an internal version counter (used as a cache-buster in the URL key) — exactly the pattern that already works against `useFetch`'s URL-keyed effect. No global cache, no key invalidation surface; `refresh` is called explicitly after `postPlainHostMessage` resolves. |
| `packages/web/src/hooks/useArtifactThreadSummary.ts` | Hook | `useFetch<ArtifactThreadSummaryResponse>(`/api/bets/${betId}/artifact-thread-summary`)`. Exposes the same `{ data, error, isLoading, refresh }` shape. `refresh` is wired to fire after any `postPlainHostMessage` whose `hostKind === "artifact"` resolves on a thread the bet aggregates. The wiring lives at the page level on `WorkBet.tsx` — when the user posts on a per-artifact thread elsewhere (cross-tab), the summary is stale until next focus / navigation; that is acceptable for v1 (see §Risks). |
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
| `packages/web/src/services/task-threads.ts` | Replace bodies with re-exports from `host-threads.ts`: `export const resolveOrCreateTaskThread = (taskId, founderId, agentParticipantId) => resolveOrCreateHostThread("task", taskId, founderId, agentParticipantId)` and `export { postPlainHostMessage as postRequestMessage } from "./host-threads"`. Add `@deprecated` JSDoc pointing to `host-threads.ts`. **No call-site changes.** A round-trip Vitest spec asserts the legacy names still work (see §Tests). |
| `packages/design-system/src/BlockActionsPopover.tsx` | No code change. The popover already accepts `BlockAction[]`; consumers (BetPitch, KnowledgeBody) build the `items` array including the new `discuss-block` action. |
| `packages/web/src/pages/WorkBet.tsx` (BetPitch) | **Brand-new popover plumbing on this surface.** See §"Block popover wiring" below for the full data flow. Summary: BetPitch gains an `onDiscussBlock(blockId)` prop wired to the page-level discuss handler (resolve-or-create the bet thread, prefill composer with the `blockId`). Each `<Block>` gets `onOpenActions={() => setOpenBlockId(b.id)}`. The page renders one `BlockActionsPopover` whose `anchor` and `items` are derived from `openBlockId`; an "Discuss" item dispatches `onDiscussBlock(openBlockId)`. Block-anchored messages are surfaced inline-after-payload via `<Block>`'s `slots.inlineAfterPayload` — see §"Anchored-message rendering" for the grouping logic. |
| `packages/web/src/pages/knowledge/KnowledgeBody.tsx` | Same popover plumbing as BetPitch, against the knowledge-item host. The page that mounts `KnowledgeBody` (`KnowledgeDetail.tsx`) owns the discuss handler and renders the popover; `KnowledgeBody` accepts an `onDiscussBlock(blockId)` prop and a `messagesByBlockId: ReadonlyMap<BlockId, ReadonlyArray<Message>>` prop and passes them through to each `<Block>`. |
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
- Calls `useHostThread(hostKind, hostId)` (the new `useFetch`-based hook).
- Renders `<ThreadShell …/>` with composer wired to `postPlainHostMessage`. First post triggers resolve-or-create via `resolveOrCreateHostThread`.
- After a successful post, calls `refresh()` from the hook to re-fetch messages. (The existing `useFetch` hook already cancels in-flight on URL change, so a version-keyed URL produces a clean reload.)
- Maintains focus-restore behaviour around posts to prevent layout-shift focus loss (the textarea reclaims focus after the optimistic clear).

This component is the **single place** the four detail surfaces converge through. Renaming, extending, or routing changes happen here once.

## Block popover wiring (BetPitch + KnowledgeBody)

The L1 `BlockActionsPopover` is the design-sanctioned mechanism, but neither `BetPitch` (`packages/web/src/pages/WorkBet.tsx:57-67`) nor `KnowledgeBody` (`packages/web/src/pages/knowledge/KnowledgeBody.tsx:46-67`) wires it today. Both render `<Block id payload />` with no `onOpenActions`, no popover anchor, no popover state. L18 adds the wiring on each consumer surface.

**Pattern (used identically on both surfaces):**

```ts
// Page-level state (WorkBet.tsx and KnowledgeDetail.tsx)
const [openBlockId, setOpenBlockId] = useState<string | null>(null);
const anchorRefs = useRef<Map<string, HTMLElement>>(new Map());
```

- Each `<Block>` is rendered with `onOpenActions={() => setOpenBlockId(block.id)}` and a ref-callback that records its DOM anchor for popover positioning: `ref={(el) => { if (el) anchorRefs.current.set(block.id, el); else anchorRefs.current.delete(block.id); }}`. (⚠️ UNVERIFIED: the `Block` component currently exposes a `BlockHandle`; if it does not forward a ref to the gutter element, the builder either threads a render-prop `gutterAnchorRef` through Block or attaches the popover anchor to the parent flex-row that already wraps each block. Inspect `packages/design-system/src/Block.tsx` before choosing.)
- One `<BlockActionsPopover>` is rendered at page level, mounted into a portal. Its `open` is `openBlockId !== null`; its `anchor` is `anchorRefs.current.get(openBlockId)`; its `items` is built from a small builder that includes the new `discuss-block` action plus any others the host wants to expose.
- Selecting `discuss-block` calls `onDiscussBlock(openBlockId)` on the page (provided by the page) and closes the popover (`setOpenBlockId(null)`).
- Focus management: when the popover opens, focus moves to the first action item; `Escape` closes the popover and returns focus to the block gutter that opened it. The popover already implements focus-trap and Escape-to-close (verify in `BlockActionsPopover.tsx`); the host's responsibility is the focus-return behaviour.

**`onDiscussBlock(blockId)` handler (page level):**

```ts
async function discussBlock(blockId: string): Promise<void> {
  const threadId = await resolveOrCreateHostThread(hostKind, hostId, founderId, PLACEHOLDER_AGENT_PARTICIPANT_ID);
  setComposerPrefill({ threadId, blockId, blockExcerpt: blockExcerptFor(blockId) });
  scrollComposerIntoView(); // existing behaviour on TaskSheet; add on WorkBet/KnowledgeDetail
}
```

`HostThreadSection` exposes a `prefill?: { blockId: string; blockExcerpt: string }` prop. When set, the composer renders an inline `Re: <excerpt>` chip above the textarea (design F5) and includes `blockId` in the `postPlainHostMessage` payload. Clearing the chip clears the prefill (composer reverts to a normal post on the bet thread).

## Anchored-message rendering (block-anchored messages on the host page)

Once a block-anchored message exists in the bet thread (or knowledge-item thread), the host page must render those messages **inline after their anchored block's payload**, not only in the chronological thread log. The plumbing:

1. The page that owns the block surface (WorkBet, KnowledgeDetail) reads the host thread once via `useHostThread(hostKind, hostId)`. The same `messages` array drives both rendering paths — the chronological `ThreadShell` and the block-anchored inline insertion.
2. Page derives `messagesByBlockId: ReadonlyMap<BlockId, ReadonlyArray<Message>>` via a `useMemo` over `messages.filter(m => m.type === "plain" && m.payload.blockId)` grouped by `blockId`.
3. `BetPitch` / `KnowledgeBody` accept `messagesByBlockId` as a prop and pass each block's slice into `<Block slots={{ inlineAfterPayload: <AnchoredMessages messages={messagesByBlockId.get(block.id) ?? []} /> }} />`.
4. `<AnchoredMessages>` is a tiny inline web component (not new design-system surface) that renders a stacked compact view of each anchored message — sender chip + relative time + body, density-token spacing. (⚠️ UNVERIFIED: confirm `Block` exposes a `slots.inlineAfterPayload` named slot; if its current API uses a different prop name, rename to match. See `packages/design-system/src/Block.tsx`.)
5. The same messages **also** render in the chronological thread log below — anchoring is additive, not exclusive. This avoids "where did my comment go" confusion when the user collapses or reorders the bet pitch.

This data flow is one-way: page → BetPitch/KnowledgeBody → Block. No callbacks for inline interactions in v1; the chronological thread log is the authoritative interaction surface.

## Data fetching

L18 follows the existing `useFetch`-based pattern in `packages/web` — there is no React Query in this codebase and L18 does not introduce it. Each hook returns the same `FetchState<T>` shape used by `useBet` / `useArtifact` / `useArtifacts`, plus an explicit `refresh()` callback for post-mutation reloads.

| Hook | URL it fetches | Refresh trigger |
|---|---|---|
| `useHostThread(hostKind, hostId)` | `GET /api/threads?host_kind=…&host_id=…` then `GET /api/threads/:id` | After successful `postPlainHostMessage`, the consumer (`HostThreadSection`) calls `refresh()`. The hook re-fetches both URLs. No background invalidation. |
| `useArtifactThreadSummary(betId)` | `GET /api/bets/:id/artifact-thread-summary` | After successful `postPlainHostMessage` on a thread whose `hostKind === "artifact"` mounted from the same `WorkBet` page. Cross-tab / cross-page posts do not refresh the summary until the user navigates back to the bet — acceptable for v1. |
| `useBet(betId)` | (existing) | Unchanged. |
| `useArtifact(id)` | (existing) | Unchanged. |

**Implementation note for `refresh()`.** `useFetch(url)` re-fetches when `url` changes. The hook composes a `useState<number>` "version" counter into the URL (e.g. `${url}#v=${version}`) and exposes `refresh()` as `() => setVersion(v => v + 1)`. The fragment is stripped server-side (browsers don't send fragments). Alternative: pass a `Cache-Control: no-cache` request header by switching to a direct `fetch` call inside the hook — but that abandons `useFetch` as the underlying primitive. The version-fragment trick keeps `useFetch` as-is.

**Optimistic update.** Not in scope for L18. After a successful `postPlainHostMessage`, the consumer calls `refresh()` and the message stream re-renders from server state. The latency budget at SQLite scales (single-figure ms) makes optimistic merge unnecessary.

**Block-anchored post path.** Identical to the plain path; the `blockId` rides inside the payload (see §Type / schema changes). Thread re-fetch picks up the new message; `messagesByBlockId` recomputes; the `<Block>` re-renders the anchored slot.

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
- `bets.artifact-thread-summary.test.ts` (new) — `GET /api/bets/:id/artifact-thread-summary`:
  - returns one row per artifact with at least one message, ordered by `lastMessageAt DESC, artifactId ASC`;
  - filters out artifacts with zero thread messages;
  - caps results at 10 rows; sets `truncated: true` and a correct `totalCount` when more than 10 artifacts qualify;
  - returns `404` when the caller cannot read the bet (auth-helper path).

**Web (`packages/web/src/__tests__/` and surface-specific `__tests__/`)**:
- `WorkBet.thread.test.tsx` — bet detail page renders `HostThreadSection` with `hostKind=bet`; legacy comments section is gone (assert `bet-comment-thread` testid is absent).
- `WorkBet.artifact-thread-summary.test.tsx` — bet with two artifacts (one has thread messages, one doesn't) → summary lists exactly one row.
- `WorkBet.block-popover.test.tsx` — opening, closing, and selecting `Discuss` from the per-block actions popover; focus-restore on Escape.
- `WorkBet.discuss-block.test.tsx` — selecting `Discuss` prefills the composer with the block excerpt; submitting forwards `blockId` to `postPlainHostMessage`.
- `WorkBet.anchored-messages.test.tsx` — block-anchored messages render inline after the block payload **and** in the chronological log.
- `KnowledgeDetail.thread.test.tsx` — knowledge entry renders thread; `ObservationLog` gone.
- `KnowledgeDetail.block-popover.test.tsx` and `KnowledgeDetail.anchored-messages.test.tsx` — parallel coverage of the popover + anchored-message paths.
- `TaskSheet.thread.test.tsx` — task sheet renders thread inline; "Open thread" link absent.
- `ArtifactPermalink.thread.test.tsx` — artifact detail renders thread below `ArtifactPreview`.
- `host-threads.test.ts` — service `resolveOrCreateHostThread` round-trip on each host kind; idempotency on duplicate `clientKey`; `postPlainHostMessage` propagates `blockId` field.
- `task-threads-shim.test.ts` — legacy `postRequestMessage` and `resolveOrCreateTaskThread` re-exports compile and dispatch to the new functions.
- `useHostThread.test.tsx` and `useArtifactThreadSummary.test.tsx` — fetch + refresh; refresh causes URL re-fetch.
- `HostThreadSection.test.tsx` and `HostThreadSection.prefill.test.tsx` — empty / loading / error / populated states; the `Re: <excerpt>` chip when `prefill` is set.
- `ArtifactThreadsSummary.test.tsx` — populated rows with snippet + relative time; empty-with-artifacts stub; `+N more` affordance when `truncated`; section hides when bet has zero artifacts.
- `BlockActionsPopover.discuss-block.test.tsx` — adding a `discuss-block` item invokes the supplied `onSelect`. (Pure design-system test; the wiring lives at the call site.)

### Playwright e2e (`packages/web/e2e/`)

- `bet-thread.spec.ts` — open Bet detail → thread surface shows → post a comment → reload → message persists.
- `artifact-thread.spec.ts` — open `/artifacts/:id` → thread renders → post a message → reload → message persists.
- `task-thread.spec.ts` — open the kanban → click a task → sheet opens → thread renders → post a message → reload → message persists.
- `knowledge-thread.spec.ts` — open a knowledge entry → thread renders (replacing the observation log) → post → reload → message persists.
- `bet-artifact-thread-summary.spec.ts` — bet detail with artifacts that have messages renders summary section; clicking a row navigates to `/artifacts/:id` and the right thread is open.
- `block-anchor-comment.spec.ts` — open Bet detail → focus a pitch block → open the actions popover → "Comment on this block" → composer opens with prefilled blockId reference → post → message renders inline-after-payload on the block.

All previously-green e2e specs must remain green.

## Ordered tasks for the builder

Each step lists its **named failing test** — the specific `*.test.ts(x)` file and `it(...)` block that must fail before the implementation lands. (F7 polish.)

1. **AC contract proof.** Walk AC §618-628 line by line. Define the verification method for each. Capture in `plans/L18/dod.md`. (Builder.)
2. **Schema sweep.** Confirm `packages/db/src/schema.ts` needs no migration. (5-min audit; emit a note if surprised.) Failing test: `packages/server/src/routes/__tests__/threads.host-kinds.test.ts > "host_kind=artifact accepts GET and POST"` (extends existing file with the artifact host-kind row).
3. **Shared schema extension.** Add optional `blockId` to plain-message payload schema. Add `ArtifactThreadSummary` type + `ArtifactThreadSummaryResponse` (`{ summaries; totalCount; truncated }`) exports. Failing test: `packages/shared/src/__tests__/thread-payload.test.ts > "plain payload round-trips with blockId"`.
4. **Server endpoint.** New `GET /api/bets/:id/artifact-thread-summary` route. Place in `packages/server/src/routes/bets.ts` (the file is currently small enough — verify before splitting). Failing tests:
   - `packages/server/src/routes/__tests__/bets.artifact-thread-summary.test.ts > "returns one row per artifact with at least one message, ordered by lastMessageAt desc"`
   - `… > "filters out artifacts with zero thread messages"`
   - `… > "caps results at 10 rows; sets truncated=true and totalCount when more"`
   - `… > "returns 404 when caller cannot read the bet"` (the auth path; reuses the bet-readable helper).
5. **Service rename.** Create `packages/web/src/services/host-threads.ts` with `resolveOrCreateHostThread` + `postPlainHostMessage(threadId, text, clientKey, blockId?)`. Reduce `task-threads.ts` to a re-export shim with `@deprecated` JSDoc. Failing tests:
   - `packages/web/src/services/__tests__/host-threads.test.ts > "resolveOrCreateHostThread round-trips on each host kind"`
   - `… > "postPlainHostMessage forwards blockId in payload when provided"`
   - `packages/web/src/services/__tests__/task-threads-shim.test.ts > "legacy postRequestMessage is the same function as postPlainHostMessage"`
   - `… > "legacy resolveOrCreateTaskThread delegates to resolveOrCreateHostThread with hostKind=task"`.
6. **Hooks.** `useHostThread` and `useArtifactThreadSummary` built on `useFetch`. Each exposes `refresh()`. Failing tests:
   - `packages/web/src/hooks/__tests__/useHostThread.test.tsx > "fetches the host thread; refresh re-fires the URL"`
   - `packages/web/src/hooks/__tests__/useArtifactThreadSummary.test.tsx > "fetches the bet's summary endpoint; refresh re-fires"`.
7. **Shell component.** `HostThreadSection` (Tier 3 shell) — failing test: `packages/web/src/shell/__tests__/HostThreadSection.test.tsx > "renders empty / loading / error / populated states"`. Stories cover the same five states + `inline` variant.
8. **Mount on Bet detail.** Replace `WorkBet.tsx` lines 233-259 with `<HostThreadSection hostKind="bet" …/>`. Remove `comments` from `BetDetail` (`packages/web/src/types/bet.ts`) and from `bets.ts` server response shape. Failing tests:
   - `packages/web/src/pages/__tests__/WorkBet.thread.test.tsx > "renders HostThreadSection with hostKind=bet"`
   - `… > "legacy bet-comment-thread testid is absent"`.
9. **Mount on Task sheet.** Replace the "Open thread" link with `<HostThreadSection hostKind="task" inline …/>`. Sheet width grows to `min(640px, 90vw)`. Failing test: `packages/web/src/shell/__tests__/TaskSheet.thread.test.tsx > "renders thread inline; legacy 'Open thread' link is absent"`.
10. **Mount on Knowledge detail.** Replace `ObservationLog` with `<HostThreadSection hostKind="knowledge_item" …/>`. Drop the `observationLog` field on `DetailItem`. Delete `MockObservationEntry` field on the fixture. Failing test: `packages/web/src/pages/__tests__/KnowledgeDetail.thread.test.tsx > "renders HostThreadSection where ObservationLog used to render"`.
11. **Mount on Artifact permalink.** Add `<HostThreadSection hostKind="artifact" …/>` below `ArtifactPreview`. Adjust page padding to `p-3`. Failing test: `packages/web/src/pages/__tests__/ArtifactPermalink.thread.test.tsx > "thread renders below the artifact preview"`.
12. **Block popover wiring on BetPitch.** Implement page-level popover state + anchor refs + portal-mounted `<BlockActionsPopover>` per §"Block popover wiring". Each `<Block>` gets `onOpenActions`. Items list includes `{ id: "discuss-block", label: "Discuss", onSelect }`. Failing tests:
   - `packages/web/src/pages/__tests__/WorkBet.block-popover.test.tsx > "clicking a block's gutter opens the actions popover"`
   - `… > "Escape closes the popover and returns focus to the block gutter"`
   - `… > "selecting Discuss invokes onDiscussBlock with the block id"`.
13. **Block popover wiring on KnowledgeDetail.** Same pattern; the page (not `KnowledgeBody`) owns the popover. Failing tests parallel WorkBet's: `packages/web/src/pages/__tests__/KnowledgeDetail.block-popover.test.tsx > …`.
14. **Discuss handler + composer prefill.** Page-level `discussBlock(blockId)` resolves-or-creates the host thread, sets composer prefill (`{ blockId, blockExcerpt }`), scrolls the composer into view. `HostThreadSection` accepts the `prefill` prop, renders the `Re: <excerpt>` chip, includes `blockId` in `postPlainHostMessage`. Failing tests:
   - `packages/web/src/shell/__tests__/HostThreadSection.prefill.test.tsx > "renders the Re: chip when prefill is set"`
   - `… > "post forwards blockId to postPlainHostMessage"`
   - `packages/web/src/pages/__tests__/WorkBet.discuss-block.test.tsx > "selecting Discuss prefills composer with the block excerpt"`.
15. **Anchored-message rendering.** Page derives `messagesByBlockId`, passes through to `BetPitch` / `KnowledgeBody`, each `<Block>` receives `slots.inlineAfterPayload` with the relevant `<AnchoredMessages>` slice. Failing tests:
   - `packages/web/src/pages/__tests__/WorkBet.anchored-messages.test.tsx > "block-anchored messages render inline after the block payload"`
   - `packages/web/src/pages/__tests__/KnowledgeDetail.anchored-messages.test.tsx > …`.
16. **ArtifactThreadsSummary section.** Component, hook, and mount on `WorkBet.tsx` below the bet thread. Includes the empty-with-artifacts stub and the `+N more` row when `truncated`. Failing tests:
   - `packages/web/src/components/__tests__/ArtifactThreadsSummary.test.tsx > "renders a row per summary including snippet and relative time"`
   - `… > "renders the empty stub when bet has artifacts but zero summaries"`
   - `… > "hides entirely when bet has zero artifacts"`
   - `… > "renders +N more affordance when truncated"`
   - `packages/web/src/pages/__tests__/WorkBet.artifact-thread-summary.test.tsx > "summary section appears below the bet thread"`.
17. **Close inventory rows.** Once L6 lands, mark the rows with `closed-by: L18`. (If L6 is not present in this branch when L18 ships, leave a follow-up note.)
18. **Vitest + Playwright.** Run `bun run verify` (orchestrated check + lint + test) and `bun run e2e`. All green.
19. **Visual proof.** Screenshot each of the four detail surfaces with a populated thread, plus the bet view with a populated `ArtifactThreadsSummary`, plus the bet view with an open block-actions popover and an anchored message. Attach to PR.

Each step has a single failing-test-first gate per the project's first principle.

## Open questions / risks

1. **L6 inventory precedence.** The `plans/reviews/hardcoded-data-inventory.md` file does not exist in this worktree. AC §626 says "matching inventory rows from L6 are closed". L18 closes the substantive comment fixtures (Bet comments, Knowledge ObservationLog) regardless. If L6 has not landed by L18 ship-time, the `closed-by` annotation is appended in the PR description and migrated to the inventory file once L6 merges. **Recommendation:** track as a single follow-up.
2. **Artifact "title" derivation.** `ArtifactPreview` previews vary by kind (text_diff has a `file`, deck has `firstSlideTitle`, etc.). The summary endpoint needs a stable display label per artifact. **Recommendation:** reuse the rules already in `packages/web/src/shell/artifactToView.tsx` for the preview header — pull them into a shared helper `artifactDisplayTitle(artifact)` in `packages/shared/src/artifact-display.ts`.
3. **`task-threads.ts` deprecation.** Removing it now would touch every TaskSheet caller and inflate the diff. Recommendation: leave a re-export shim (`postRequestMessage` → `postPlainHostMessage`; `resolveOrCreateTaskThread` → curried `resolveOrCreateHostThread`), schedule deletion as a follow-up.
4. **IDOR risk on the new summary endpoint (F5).** `GET /api/bets/:id/artifact-thread-summary` returns artifact-thread snippets to anyone who knows a bet id — same shape of risk that L1's L8 lore note flagged on `participant_id`-scoped thread reads (`packages/server/src/routes/threads.ts:147-153`). **L18 closes this in-scope, not as a follow-up.** The endpoint reuses the existing per-bet read auth check from `bets.ts` (the same path that backs `GET /api/bets/:id`); if that path is not yet a named helper, the builder extracts it as `assertBetReadable(betId, c)` and applies it to both the existing and the new endpoint. The cross-cutting `participant_id` IDOR on threads is **not** L18's to fix and stays tracked under the auth-middleware follow-up.
5. **Performance of the summary endpoint at scale.** SQLite query plan on `LEFT JOIN threads + correlated subquery` is fine for tens of artifacts. ⚠️ UNVERIFIED at hundreds. The `threads_host_idx` already covers `(host_kind, host_id, last_active_at)`; that should suffice. With the server-enforced cap of 10 rows (F6), the worst-case payload is bounded; the cap also caps the cost of the correlated subqueries. Builder profiles if `totalCount` exceeds 100 in the wild.
6. **WS-driven invalidation of the summary.** When a message lands on an artifact thread elsewhere, the bet view's summary should refresh. Today the codebase invalidates only on explicit user actions. The L18 hook calls `refresh()` after same-page artifact-thread posts but does NOT subscribe to WS events; cross-tab and cross-page posts leave the summary stale until the next navigation. **Acceptable for v1**; a WS-driven refresh lives with the auth-middleware / notification follow-up.
7. **Multiple participants on a bet thread.** L1's resolve-or-create defaults participants to `[founder, agent-unassigned]` (per L15). For bet threads, the participant set is more like `[founder, team-lead-agent]` — but agent assignment is a separate workpackage. **Recommendation:** keep the `[founder, "agent-unassigned"]` default for consistency; revisit when the team-agent assignment story lands.
8. **`agent-unassigned` placeholder consistency.** L15 introduced the placeholder. L18 inherits. Following L15's convention; nothing new.
9. **Observation-log data is fixture-only (F8).** Verified: `packages/web/src/fixtures/knowledge-data.ts:78,119` defines `observationLog?: ReadonlyArray<MockObservationEntry>` on the mock knowledge fixtures only. Grep across `packages/db/src/schema.ts` and `packages/server/src/routes/knowledge.ts` returns no persisted `observation_log` table or column. **Deletion is non-destructive.** No migration; no data preservation step.
10. **No new observation-log instrumentation in L18.** The architecture introduces no observation-log entries (persisted or fixture-only). L18 deletes the existing fixture-only log and replaces the surface with the L1 thread primitive; no replacement instrumentation lands as part of this workpackage.
11. **`Block.slots.inlineAfterPayload` API name.** ⚠️ UNVERIFIED at the time of writing. The architecture assumes `Block` exposes a `slots.inlineAfterPayload` named slot. If the actual prop name differs (e.g. `inlineAfterPayload` directly on Block, or `renderAfterPayload`), the builder updates §"Anchored-message rendering" to match and threads the correct prop through. The pattern (page derives `messagesByBlockId`, BetPitch/KnowledgeBody pass per-block slices into Block) does not change.
12. **`Block` anchor ref for the popover.** ⚠️ UNVERIFIED. `Block` may not currently forward a DOM ref to its gutter for popover anchoring. If it does not, the builder either adds a forward-ref escape hatch (`gutterAnchorRef?: Ref<HTMLElement>`) — strictly additive — or wraps each Block in a host-controlled flex-row that owns the anchor. Either is acceptable; the builder picks the smaller diff after reading `packages/design-system/src/Block.tsx`.

## Acceptance-criteria mapping

| AC | Verification |
|---|---|
| §619: surface mounted on Bet, Task, Knowledge, Artifact | Vitest + Playwright per surface. |
| §620: every host carries a thread; artifact-attached threads work | `host-threads.test.ts` + Playwright on all four. |
| §621: bet's prior comment fixture replaced; task's "open thread" opens the same primitive | `WorkBet.thread.test.tsx` (asserts old testid absent) + `TaskSheet.thread.test.tsx`. |
| §622: volume-management designer call documented and shipped | `ArtifactThreadsSummary` component + `bet-artifact-thread-summary.spec.ts`. |
| §623: block-anchored discussion uses L2's affordance, no separate dependency | `BlockActionsPopover.discuss-block.test.tsx` + `WorkBet.block-popover.test.tsx` + `WorkBet.discuss-block.test.tsx` + `WorkBet.anchored-messages.test.tsx` (and KnowledgeDetail parallels). |
| §624: Vitest covers thread lifecycle on each host + posting + block anchor | Test list above. |
| §625: Playwright covers Bet and Artifact post-and-reload | `bet-thread.spec.ts` + `artifact-thread.spec.ts`. |
| §626: hardcoded comments removed; L6 rows closed | Inventory annotations + assertion that `bet-comment-thread` testid is gone. |
| §627: green check + lint + test + e2e | `bun run verify` + Playwright in CI. |
