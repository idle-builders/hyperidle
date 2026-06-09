# AE5 Architecture Plan — Communication Refinements

## Required reading

- `plans/AE5/concept.md` (locked concept — MentionRef, thread context link, agent presence)
- `plans/AE5/design/approved.md` (design decisions)
- `packages/shared/src/thread.ts` (InlineRef union, PlainPayload, Message)
- `packages/shared/src/team.ts` (AgentOperationalStatus)
- `packages/server/src/routes/threads.ts` (thread routes, buildThreadIdentities)
- `packages/server/src/routes/threads-schema.ts` (Zod schemas for message input/row)
- `packages/design-system/src/CommentRow.tsx` (message body renderer)
- `packages/design-system/src/ThreadShell.tsx` (composition root)
- `packages/design-system/src/ThreadHostBanner.tsx` (banner with participants)
- `packages/design-system/src/ThreadRow.tsx` (thread list row)
- `packages/web/src/pages/Conversations.tsx` (Conversations page)
- `packages/web/src/hooks/useThreadDetail.ts` (thread detail hook)

---

## 1. Shared types — MentionRef variant

### 1.1 Add MentionRef to InlineRef discriminated union

**File:** `packages/shared/src/thread.ts`

Add the `MentionRef` interface and update the union:

```ts
// New interface — after BlockRef, before InlineRef union
export interface MentionRef {
  readonly kind: "mention";
  readonly identityId: IdentityId;
  readonly displayName: string;
}

// Updated InlineRefKind — add "mention" as 7th kind
export type InlineRefKind =
  | "knowledge_item" | "task" | "artifact" | "bet" | "message" | "block" | "mention";

// Updated union — three-way now
export type InlineRef = EntityRef | BlockRef | MentionRef;
```

### 1.2 Export from barrel

**File:** `packages/shared/src/index.ts`

Add `MentionRef` to the type exports from `./thread.js`.

### 1.3 Mention parsing utility

**File:** `packages/shared/src/mention.ts` (new file)

Pure function that parses `@name` tokens from message text and attempts to resolve them against a provided name-to-identity map. This lives in shared because both server (write-time resolution) and tests need it.

```ts
export interface MentionCandidate {
  /** The raw "@name" token including the "@" prefix. */
  sourceText: string;
  /** The extracted name without "@". */
  name: string;
  /** Character offset of the "@" in the source text. */
  offset: number;
}

/**
 * Extract @mention candidates from message text.
 * Rules:
 * - "@" must be at start of string or preceded by whitespace
 * - Name is one or more non-whitespace characters after "@"
 * - Deduplicates by lowercased name (case-insensitive matching)
 */
export function extractMentionCandidates(text: string): MentionCandidate[];

export interface ResolvedMention {
  identityId: IdentityId;
  displayName: string;
  sourceText: string;
}

/**
 * Resolve mention candidates against a name lookup map.
 * nameMap: lowercased display name -> IdentityId + displayName.
 * Unresolved candidates are silently dropped (left as plain text).
 * Deduplicates by identityId (same person mentioned twice = one MentionRef).
 */
export function resolveMentions(
  candidates: MentionCandidate[],
  nameMap: ReadonlyMap<string, { identityId: IdentityId; displayName: string }>,
  senderId: IdentityId,
): ResolvedMention[];
```

The `senderId` parameter enables self-mention suppression: mentions of the sender are resolved for display purposes but flagged so the server can skip the participant-addition side effect.

### 1.4 Mention text replacement utility

**File:** `packages/shared/src/mention.ts` (same file)

```ts
export interface MentionSegment {
  type: "text" | "mention";
  content: string;
  /** Only present when type === "mention" */
  mentionRef?: MentionRef;
}

/**
 * Split message text into segments for rendering. Each @name that
 * matches a MentionRef in the refs array becomes a "mention" segment;
 * everything else is "text".
 */
export function segmentMentions(
  text: string,
  refs: ReadonlyArray<InlineRef>,
): MentionSegment[];
```

This is the read-path utility used by the renderer. It matches `MentionRef.sourceText` occurrences in the text (via string indexOf, not regex) to produce alternating text/mention segments.

---

## 2. Server — mention resolution on message write

### 2.1 Build name lookup map

**File:** `packages/server/src/routes/threads.ts`

Add a function that builds the name-to-identity map for mention resolution. Scoped to the thread's participant list + all users in the same team (so you can mention someone not yet in the thread).

```ts
/**
 * Build a case-insensitive name->identity map for mention resolution.
 * Includes: all thread participants + all users in the same team(s).
 * @lore AE5: The resolution scope is deliberately broad (team-wide) so
 * users can @mention agents not yet in the thread. Factory-wide resolution
 * (all users) would work too but team-scoped is more predictable.
 */
async function buildMentionLookup(
  db: HyperIdleDb,
  participantIds: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, { identityId: string; displayName: string }>>;
```

Implementation: query `users` table for all users where `teamId IN (SELECT teamId FROM users WHERE id IN participantIds)`. Build a `Map<lowercaseName, { identityId, displayName }>`. When two users share a name (unlikely but possible), the first match wins (deterministic by id sort).

### 2.2 Modify `POST /api/threads/:id/messages` for mention handling

**File:** `packages/server/src/routes/threads.ts`

In the plain message append path (after Zod validation, before the transaction):

1. If `input.type === "plain"`, call `extractMentionCandidates(input.payload.text)`.
2. If candidates exist, call `buildMentionLookup(db, participants)`.
3. Call `resolveMentions(candidates, nameMap, senderId)`.
4. For each resolved mention, create a `MentionRef` and append to `input.payload.refs`.
5. For each resolved mention where `identityId !== senderId`, add to the participants list.
6. Inside the transaction: update `threads.participants` if new participants were added.
7. Persist the enriched payload (with MentionRef entries in refs[]).

The participant addition is atomic with the message write (concept hard rule #2).

### 2.3 Modify `POST /api/threads` for initial message mentions

Same logic as 2.2, applied to the initial message in thread creation. The participants array in the create-thread body already lists initial participants; mention-resolved participants are added to this array before the transaction.

### 2.4 Update Zod schemas

**File:** `packages/server/src/routes/threads-schema.ts`

Add `mentionRefSchema` to the `inlineRefSchema` discriminated union:

```ts
export const mentionRefSchema = z.object({
  kind: z.literal("mention"),
  identityId: z.string().min(1),
  displayName: z.string().min(1),
});

// Updated union — three members
export const inlineRefSchema = z.discriminatedUnion("kind", [
  entityRefSchema,
  blockRefSchema,
  mentionRefSchema,
]);
```

This allows mention refs to round-trip through the Zod validation on both write (messageInputSchema) and read (messageRowSchema).

---

## 3. Server — thread detail identity extension

### 3.1 Extend buildThreadIdentities

**File:** `packages/server/src/routes/threads.ts`

Modify `buildThreadIdentities` to return additional fields:

```ts
async function buildThreadIdentities(
  db: HyperIdleDb,
  senderIds: string[],
): Promise<Record<string, {
  name: string;
  role?: string;
  isAgent?: boolean;
  operationalStatus?: AgentOperationalStatus;
}>>;
```

For each user row:
- Set `isAgent: row.kind === "ai"`.
- For AI users, query the most recent session: `SELECT state FROM sessions WHERE agent_id = :id ORDER BY started_at DESC LIMIT 1`. If `state === "active"`, set `operationalStatus: "active"`. If the most recent session has `outcome === "crashed"`, set `operationalStatus: "error"`. Otherwise `"idle"`.
- For human users, omit `isAgent` and `operationalStatus` (they remain undefined).

This is a backward-compatible extension. Existing consumers that read `{ name, role }` continue to work. New consumers can optionally read `isAgent` and `operationalStatus`.

### 3.2 Add hostTitle to thread detail response

**File:** `packages/server/src/routes/threads.ts`

In `GET /api/threads/:id`, after building the thread response, resolve the host entity's title:

```ts
// Resolve host title for context link
let hostTitle: string | null = null;
switch (row.hostKind) {
  case "bet":
    const [bet] = await db.select({ description: bets.description })
      .from(bets).where(eq(bets.id, row.hostId)).limit(1);
    hostTitle = bet ? deriveTitle(bet.description) : null;
    break;
  case "task":
    const [task] = await db.select({ title: tasks.title })
      .from(tasks).where(eq(tasks.id, row.hostId)).limit(1);
    hostTitle = task?.title ?? null;
    break;
  case "knowledge_item":
    const [ki] = await db.select({ title: knowledgeItems.title })
      .from(knowledgeItems).where(eq(knowledgeItems.id, row.hostId)).limit(1);
    hostTitle = ki?.title ?? null;
    break;
  // agent, user: use identities map (already resolved)
  // team, factory: use team name or "Factory"
}
```

Add `hostTitle` to the response JSON. Nullable — null when the host entity doesn't exist or the kind doesn't support title resolution.

---

## 4. Design system — mention rendering

### 4.1 CommentRow mention segments

**File:** `packages/design-system/src/CommentRow.tsx`

Modify the `MessagePayloads` component to handle mentions. Before rendering through `derivePayloads`, check if the message has `MentionRef` entries in its refs. If so, use `segmentMentions` to split the text into segments and render mention segments with the styled span.

```tsx
function MentionToken({ displayName }: { displayName: string }): JSX.Element {
  return (
    <span
      className="inline-flex items-center px-[3px] py-[1px] rounded-[var(--r-pill)]
                 bg-[color-mix(in_oklab,var(--accent-primary)_8%,transparent)]
                 text-[var(--accent-primary)]"
    >
      @{displayName}
    </span>
  );
}
```

The segmentation applies BEFORE the markdown rendering pipeline (`derivePayloads`). This means mentions in markdown-formatted messages will be rendered as styled spans within the markdown output. The `segmentMentions` utility handles this by operating on the raw text, and the renderer inserts React elements at the appropriate positions.

**Alternative considered:** Apply mention styling AFTER markdown rendering by post-processing the rendered HTML. Rejected because it would require HTML string manipulation and would not compose cleanly with React's rendering model.

**Chosen approach:** Pre-segment the text. For each text segment, pass it through `derivePayloads` for markdown rendering. For each mention segment, render the `MentionToken` directly. This means mentions inside code blocks or other markdown constructs will still be highlighted — this is acceptable and arguably correct (the mention was intentional regardless of surrounding formatting).

### 4.2 ThreadShell mention rendering pass-through

No changes needed to ThreadShell. The mention rendering is entirely within CommentRow's `renderBody` path. ThreadShell already passes `message` to CommentRow; CommentRow reads `message.payload.refs` to detect mentions.

The `renderRefEmbeds` render prop on ThreadShell currently filters for `BlockRef` entries. It must be updated to skip `MentionRef` entries (which render inline, not as cards). This is a filter change in the consumer (`Conversations.tsx`), not in ThreadShell itself.

### 4.3 Update renderRefEmbedsForConversations

**File:** `packages/web/src/pages/Conversations.tsx`

In `renderRefEmbedsForConversations`, the filter already selects only `BlockRef` entries (`r.kind === "block"`). MentionRef entries (`r.kind === "mention"`) are automatically excluded. No change needed.

---

## 5. Design system — presence indicators

### 5.1 ThreadHostBanner presence dots

**File:** `packages/design-system/src/ThreadHostBanner.tsx`

Extend `ThreadHostBannerParticipant` with optional presence fields:

```ts
export interface ThreadHostBannerParticipant {
  id: string;
  name: string;
  avatarUrl?: string;
  isAgent?: boolean;
  operationalStatus?: AgentOperationalStatus;
}
```

In the avatar rendering loop, wrap each avatar `<span>` in a `relative` positioned container and conditionally render a 6px presence dot:

```tsx
function PresenceDot({ status, name }: {
  status: AgentOperationalStatus;
  name: string;
}): JSX.Element | null {
  if (status === "idle") return null;
  const bg = status === "active"
    ? "bg-[var(--accent-primary)]"
    : "bg-[var(--status-error)]";
  return (
    <span
      className={`absolute bottom-0 right-0 w-[6px] h-[6px] rounded-full
                  border-[1.5px] border-[var(--surface-container)] ${bg}`}
      aria-label={`${name} - ${status}`}
    />
  );
}
```

### 5.2 ThreadRow presence dots

**File:** `packages/design-system/src/ThreadRow.tsx`

Extend `ThreadAvatarItem`:

```ts
export interface ThreadAvatarItem {
  initials: string;
  agent?: boolean;
  operationalStatus?: AgentOperationalStatus;
}
```

In the avatar rendering within ThreadRow's meta area, add the same `PresenceDot` component (or extract it to a shared `PresenceDot.tsx` within the design-system — but since it's only 10 lines, inline duplication is acceptable for 2 consumers).

### 5.3 Wire presence data to ThreadShell consumers

**File:** `packages/web/src/pages/Conversations.tsx`

The `ConversationsDetail` component reads `data.identities` to build the thread display. It already passes `data.thread.participants` to ThreadShell, which maps them to `ThreadHostBannerParticipant`. With the extended identities (3.1), the mapping now includes `isAgent` and `operationalStatus`:

```ts
const participants = thread.participants.map((id) => ({
  id,
  name: identityFor(identities, id).name,
  isAgent: identities[id]?.isAgent,
  operationalStatus: identities[id]?.operationalStatus,
}));
```

This flows through ThreadShell to ThreadHostBanner. No intermediate prop threading needed — ThreadShell already builds the participants array and passes it to ThreadHostBanner.

### 5.4 Wire presence data to thread list

**File:** `packages/web/src/hooks/useConversationsThreads.ts`

The thread list API response (`GET /api/threads`) already returns participant IDs. To show presence in the thread list, the `useConversationsThreads` hook (or the consumer that maps threads to `ThreadItem[]`) must resolve agent operational status per thread.

**Design decision:** The thread list endpoint does NOT include per-participant operational status (that would require N extra queries per thread). Instead, the thread list shows presence based on a simpler signal: the `hasActiveAgent` boolean that can be derived from the thread's participant list + a single query for all agents with active sessions.

**Implementation:** Add a new optional field to `ThreadItem`:

```ts
// In ThreadSections.tsx
export interface ThreadItem {
  // ... existing fields ...
  /** AE5: Participant avatars with presence data for ThreadRow rendering. */
  participantAvatars?: ThreadAvatarItem[];
}
```

The `useConversationsThreads` hook maps the thread list response to `ThreadItem[]`. The avatar mapping happens in the hook or in the AppShell that prepares the thread data. The server returns participant IDs; the client fetches agent operational status in a single batch (one endpoint call for all agents' current status).

**Simpler v1 approach (chosen):** Skip thread-list presence for v1. The value is highest in the thread detail view where the user is actively reading a conversation. Thread-list presence can be added in a follow-up when a batch agent-status endpoint exists.

---

## 6. UI — thread context link

### 6.1 Host route resolution utility

**File:** `packages/web/src/services/host-route.ts` (new file)

```ts
import type { HostKind } from "@hyperidle/shared";

/**
 * Resolve a (hostKind, hostId) pair to a client-side route path.
 * Returns null for host kinds that don't have navigable pages (user, factory).
 */
export function resolveHostRoute(hostKind: HostKind, hostId: string): string | null {
  switch (hostKind) {
    case "bet": return `/work/bet/${hostId}`;
    case "task": return `/work/task/${hostId}`;
    case "knowledge_item": return `/knowledge/${hostId}`;
    case "artifact": return `/work/artifact/${hostId}`;
    case "agent": return `/work/agent/${hostId}`;
    case "team": return `/work/team/${hostId}`;
    case "user": return null;
    case "factory": return null;
  }
}
```

### 6.2 Render context link in Conversations header

**File:** `packages/web/src/pages/Conversations.tsx`

In `ConversationsDetail`, below the thread title in the `<header>`, add the context link line:

```tsx
import { resolveHostRoute } from "../services/host-route.js";

// Inside ConversationsDetail, when data is loaded:
const hostRoute = resolveHostRoute(data.thread.hostKind, data.thread.hostId);
const hostTitle = data.hostTitle ?? data.identities[data.thread.hostId]?.name ?? data.thread.hostId;

// In the header:
<header ...>
  <div>
    <h2 ...>{threadTitle}</h2>
    {hostRoute && (
      <div className="flex items-center gap-[6px] text-[13px] mt-[3px]">
        <Tag label={data.thread.hostKind} />
        <Link to={hostRoute} className="text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:underline">
          {hostTitle}
        </Link>
      </div>
    )}
  </div>
  {dialInButton}
</header>
```

### 6.3 Update useThreadDetail to include hostTitle

**File:** `packages/web/src/hooks/useThreadDetail.ts`

Extend `ThreadDetail` with optional `hostTitle`:

```ts
export interface ThreadDetail {
  thread: Thread;
  messages: ReadonlyArray<Message>;
  headMessageId: string | null;
  identities: Record<string, { name: string; role?: string; isAgent?: boolean; operationalStatus?: string }>;
  artifactRef?: ArtifactRef;
  hostTitle?: string | null;
}
```

Update the decoder to read `hostTitle` from the response.

---

## 7. Type signatures affected

### 7.1 packages/shared/src/thread.ts

| Change | Type |
|---|---|
| Add `MentionRef` interface | New |
| Add `"mention"` to `InlineRefKind` | Modified |
| Update `InlineRef` union to include `MentionRef` | Modified |

### 7.2 packages/shared/src/mention.ts

| Export | Type |
|---|---|
| `extractMentionCandidates` | New function |
| `resolveMentions` | New function |
| `segmentMentions` | New function |
| `MentionCandidate` | New interface |
| `ResolvedMention` | New interface |
| `MentionSegment` | New interface |

### 7.3 packages/server/src/routes/threads-schema.ts

| Change | Type |
|---|---|
| Add `mentionRefSchema` | New |
| Update `inlineRefSchema` to 3-member union | Modified |

### 7.4 packages/server/src/routes/threads.ts

| Change | Type |
|---|---|
| `buildMentionLookup` function | New |
| `buildThreadIdentities` return type extended | Modified |
| `POST /api/threads/:id/messages` mention handling | Modified |
| `POST /api/threads` mention handling | Modified |
| `GET /api/threads/:id` hostTitle + extended identities | Modified |

### 7.5 packages/design-system/src/ThreadHostBanner.tsx

| Change | Type |
|---|---|
| `ThreadHostBannerParticipant.isAgent` | New optional field |
| `ThreadHostBannerParticipant.operationalStatus` | New optional field |
| `PresenceDot` internal component | New |

### 7.6 packages/design-system/src/ThreadRow.tsx

| Change | Type |
|---|---|
| `ThreadAvatarItem.operationalStatus` | New optional field |

### 7.7 packages/design-system/src/CommentRow.tsx

| Change | Type |
|---|---|
| `MentionToken` internal component | New |
| `MessagePayloads` handles mention segments | Modified |

### 7.8 packages/web/src/pages/Conversations.tsx

| Change | Type |
|---|---|
| Context link rendering in header | Modified |
| Presence data wiring to ThreadShell | Modified |

### 7.9 packages/web/src/hooks/useThreadDetail.ts

| Change | Type |
|---|---|
| `ThreadDetail.hostTitle` | New optional field |
| `ThreadDetail.identities` extended shape | Modified |

### 7.10 packages/web/src/services/host-route.ts

| Export | Type |
|---|---|
| `resolveHostRoute` | New function |

---

## 8. Database changes

**None.** No schema migration, no new tables, no new columns.

- MentionRef is stored inside the `messages.payload` JSON column (which already stores `PlainPayload.refs[]`).
- Participant additions are written to the existing `threads.participants` JSON column.
- Agent operational status is derived from the existing `sessions` table at query time.
- Host title is resolved from existing entity tables at query time.

---

## 9. Event bus changes

**None.** The existing `ThreadMessageAppendedEvent` is sufficient. When a mention adds a participant to a thread, the thread's `participants` column is updated — this is observable through the existing thread list refresh. No new event type is needed because:

1. The concept explicitly states "the thread's presence in Conversations IS the notification." The mentioned user sees the thread in their Conversations list on next refresh.
2. The `notification_queue` is not involved — mentions use the simpler thread-membership path.

---

## 10. Trade-off analysis

### 10.1 Server-side vs client-side mention resolution

| Factor | Server-side (chosen) | Client-side |
|---|---|---|
| Correctness | Server owns identity resolution; no stale client cache | Client must know all identities; stale data = wrong resolution |
| Complexity | One code path in the server | Resolution logic in Composer + sync with server |
| Participant atomicity | Transaction guarantees mention + participant-add | Two-phase: resolve on client, confirm on server |
| Autocomplete | Deferred (v1 has no client resolution) | Required for good UX |
| Cost | One extra DB query per message with @mentions | Zero extra server queries; more client code |

Server-side is the obvious choice. Client-side adds complexity with no benefit until autocomplete is built.

### 10.2 Mention parsing: regex vs custom parser

| Factor | Regex (chosen) | Custom parser |
|---|---|---|
| Simplicity | 1 regex captures @name tokens | Manual character-by-character scanning |
| Edge cases | Handles word boundaries with `(?:^|\s)@(\S+)` | Full control but more code |
| Performance | Negligible for message-length strings | Same |
| Maintenance | One line of regex vs 20 lines of loop | More code to maintain |

Regex is sufficient. The only edge case is `@name` at start of line (handled by `^` in the alternation).

### 10.3 Presence: per-request derivation vs cached status

| Factor | Per-request (chosen) | Cached column |
|---|---|---|
| Freshness | Always current | Stale until cache refresh |
| Complexity | One extra query per thread detail request | Cache invalidation on session start/end |
| Cost | 1 query x ~5 senders per thread = trivial | Migration + event handler + cache staleness bugs |
| Scalability | O(1) queries per thread detail (batched) | O(1) reads but O(n) writes on state changes |

Per-request derivation is correct for v1. Operational status changes every few minutes (session start/end). The thread detail endpoint is hit once per thread open. The cost is one batched query.

---

## 11. Implementation task order

Tasks are ordered by dependency. Each task is independently testable.

### Task 1: Shared types — MentionRef

**Files:**
- `packages/shared/src/thread.ts` (modify InlineRefKind, InlineRef, add MentionRef)
- `packages/shared/src/index.ts` (export MentionRef)
- `packages/shared/src/__tests__/thread-mention-ref.test.ts` (new — type narrowing tests)

**Acceptance:** `InlineRefKind` includes `"mention"`. `InlineRef` narrows to `MentionRef` when `kind === "mention"`. TypeScript compiles. Existing tests pass.

### Task 2: Mention parsing utilities

**Files:**
- `packages/shared/src/mention.ts` (new)
- `packages/shared/src/index.ts` (export mention utilities)
- `packages/shared/src/__tests__/mention.test.ts` (new — parsing + resolution + segmentation tests)

**Acceptance:** `extractMentionCandidates` extracts `@name` tokens from text. `resolveMentions` resolves candidates against a name map. `segmentMentions` splits text into text/mention segments. Self-mention produces a MentionRef but is flagged. Unknown @names are dropped.

### Task 3: Server Zod schema update

**Files:**
- `packages/server/src/routes/threads-schema.ts` (add mentionRefSchema to inlineRefSchema)
- `packages/server/src/routes/__tests__/threads-schema.mention-ref.test.ts` (new — Zod validation tests)

**Acceptance:** `inlineRefSchema` accepts `{ kind: "mention", identityId: "...", displayName: "..." }`. Rejects malformed mention refs. Existing entity and block ref validation unchanged.

### Task 4: Server mention resolution on message append

**Files:**
- `packages/server/src/routes/threads.ts` (add buildMentionLookup, modify POST handlers)
- `packages/server/src/routes/__tests__/threads.mention.integration.test.ts` (new)

**Acceptance:**
- AC: "Users can @mention a specific participant, and the mentioned user receives a notification" — a message with `@AgentName` results in the mentioned agent being added to `thread.participants`.
- AC: "@mentions are a recognized inline element" — the returned message payload contains a MentionRef in `refs[]`.
- Given participant A @mentions participant B, then B receives a notification (= B is added to thread participants, thread appears in B's conversations).
- Self-mention does not add sender to participants (already a participant).
- Unknown @name stays as plain text (no MentionRef, no error).

### Task 5: Server identity extension (presence + hostTitle)

**Files:**
- `packages/server/src/routes/threads.ts` (extend buildThreadIdentities, add hostTitle to GET response)
- `packages/server/src/routes/__tests__/threads.identity.integration.test.ts` (extend existing)

**Acceptance:**
- Thread detail response includes `identities[agentId].isAgent === true` for AI users.
- Thread detail response includes `identities[agentId].operationalStatus` derived from session state.
- Thread detail response includes `hostTitle` for bet/task/knowledge_item host kinds.
- Backward compatible — existing fields unchanged.

### Task 6: Design system — mention rendering

**Files:**
- `packages/design-system/src/CommentRow.tsx` (add MentionToken, modify MessagePayloads)
- `packages/design-system/src/CommentRow.stories.tsx` (add mention story)
- `packages/web/src/__tests__/CommentRow.mention.test.tsx` (new — mention rendering tests)

**Acceptance:** CommentRow renders `@Name` as a styled inline span when the message has MentionRef entries in refs[]. Messages without mentions render unchanged. Redacted messages do not show mentions.

### Task 7: Design system — presence dots

**Files:**
- `packages/design-system/src/ThreadHostBanner.tsx` (extend participant interface, add PresenceDot)
- `packages/design-system/src/ThreadRow.tsx` (extend ThreadAvatarItem, add PresenceDot)
- `packages/design-system/src/ThreadHostBanner.stories.tsx` (add presence story)
- `packages/design-system/src/ThreadRow.stories.tsx` (add presence story)
- `packages/web/src/__tests__/ThreadHostBanner.test.tsx` (extend)

**Acceptance:**
- AC: "Agent presence is visible — whether currently in an active session or idle" — ThreadHostBanner renders green dot for active agents, red dot for error agents, no dot for idle agents and humans.
- ThreadRow renders presence dots in the avatar group.
- Presence props are optional — no dots when status is omitted (backward compat).

### Task 8: UI — thread context link + presence wiring

**Files:**
- `packages/web/src/services/host-route.ts` (new)
- `packages/web/src/hooks/useThreadDetail.ts` (extend ThreadDetail, update decoder)
- `packages/web/src/pages/Conversations.tsx` (add context link, wire presence to ThreadShell)
- `packages/web/src/__tests__/Conversations.context-link.test.tsx` (new)

**Acceptance:**
- AC: "Within conversations, a user can see and navigate to the thread's host context (bet, task, session)" — the Conversations detail header renders a clickable context link with Tag + host title.
- AC: "Given a thread attached to a task, when viewing the thread, then the task context is visible and clickable" — clicking the link navigates to `/work/task/:hostId`.
- Context link not shown for user/factory host kinds.
- Presence data flows from extended identities to ThreadHostBanner participants.

---

## 12. Files changed summary

| Package | File | Action |
|---|---|---|
| shared | `src/thread.ts` | Modify (MentionRef, InlineRefKind, InlineRef) |
| shared | `src/mention.ts` | Create (parsing + resolution + segmentation) |
| shared | `src/index.ts` | Modify (exports) |
| server | `src/routes/threads-schema.ts` | Modify (mentionRefSchema) |
| server | `src/routes/threads.ts` | Modify (mention handling, identity extension, hostTitle) |
| design-system | `src/CommentRow.tsx` | Modify (mention rendering) |
| design-system | `src/ThreadHostBanner.tsx` | Modify (presence dots) |
| design-system | `src/ThreadRow.tsx` | Modify (presence on avatars) |
| web | `src/services/host-route.ts` | Create (route resolution) |
| web | `src/hooks/useThreadDetail.ts` | Modify (hostTitle, extended identities) |
| web | `src/pages/Conversations.tsx` | Modify (context link, presence wiring) |

Test files (all new):
- `packages/shared/src/__tests__/thread-mention-ref.test.ts`
- `packages/shared/src/__tests__/mention.test.ts`
- `packages/server/src/routes/__tests__/threads-schema.mention-ref.test.ts`
- `packages/server/src/routes/__tests__/threads.mention.integration.test.ts`
- `packages/web/src/__tests__/CommentRow.mention.test.tsx`
- `packages/web/src/__tests__/Conversations.context-link.test.tsx`

Story files (new or modified):
- `packages/design-system/src/CommentRow.stories.tsx`
- `packages/design-system/src/ThreadHostBanner.stories.tsx`
- `packages/design-system/src/ThreadRow.stories.tsx`

---

## 13. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| @name conflicts (two users named "Aria") | Wrong person mentioned | Team-scoped resolution + first-match-by-id determinism. Low probability in small teams. Future: autocomplete resolves ambiguity by showing identity. |
| Message payload size increase from MentionRef entries | Marginal — each MentionRef is ~80 bytes | PlainPayload.text already capped at 16KB. 20 mentions = 1.6KB of refs. Negligible. |
| Operational status query adds latency to thread detail | One extra query per thread detail load | Batched query for all senders. ~5 senders = one IN query. Sub-millisecond on indexed sessions table. |
| hostTitle resolution adds queries per host kind | One query per thread detail load | Single query, per host kind switch. Cached by the client (thread detail is fetched once per view). |
| InlineRef union widening breaks exhaustive switches | Compile-time failure in switch statements | TypeScript narrowing catches this. All switch statements that handle InlineRef kinds must add the "mention" case. Grep for `kind === "block"` and `kind === "knowledge_item"` to find all sites. |
