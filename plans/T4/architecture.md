# T4 Architecture — Block Reference (Attach Block to Any Thread)

**Status:** Locked  
**Concept:** `plans/human-authoring/editing-experience-concept.md` lines 351-425  
**Depends on:** None (L18 block actions, L21 CocContext/CocAttachButton/CocOverlay all exist)

---

## 1. Overview

T4 extends the `InlineRef` discriminated union to include a `block` variant, then wires two UX paths for attaching a block reference to any thread:

1. **"Share" action** in the existing `BlockActionsPopover` (alongside "Discuss").
2. **CocAttachButton "+"** on blocks in knowledge bodies and bet pitches when the CoC overlay is open.

Messages that carry a block ref render the referenced block content as an inline embed card (`BlockRefEmbed`). When the source block no longer exists, the embed degrades to a "source changed" indicator.

---

## 2. Type Changes

### 2.1 InlineRef discriminated union (`packages/shared/src/thread.ts`)

Current `InlineRef` is a flat interface:
```ts
export interface InlineRef {
  readonly kind: "knowledge_item" | "task" | "artifact" | "bet" | "message";
  readonly id: string;
}
```

New shape — discriminated union:
```ts
export type InlineRefKind = "knowledge_item" | "task" | "artifact" | "bet" | "message" | "block";

export interface EntityRef {
  readonly kind: "knowledge_item" | "task" | "artifact" | "bet" | "message";
  readonly id: string;
}

export interface BlockRef {
  readonly kind: "block";
  readonly blockId: string;
  readonly hostKind: BlockHostKind;
  readonly hostId: string;
}

export type InlineRef = EntityRef | BlockRef;
```

Import `BlockHostKind` from `./blocks/types.js`.

**Migration cost:** Low. Existing consumers that read `ref.kind` continue to work (the discriminant is still `.kind`). Consumers that access `ref.id` unconditionally will get a type error — they must first narrow `ref.kind !== "block"`.

### 2.2 PlainPayload / PlainPayloadWithBlockId

No change. `refs` already carries `ReadonlyArray<InlineRef>`. The type widening flows through.

### 2.3 CocContextRef (`packages/web/src/contexts/CocContext.tsx`)

Current:
```ts
export interface CocContextRef {
  kind: InlineRef["kind"];
  id: string;
  label: string;
}
```

New — a discriminated union mirroring InlineRef:
```ts
export type CocContextRef =
  | { kind: "knowledge_item" | "task" | "artifact" | "bet" | "message"; id: string; label: string }
  | { kind: "block"; blockId: string; hostKind: BlockHostKind; hostId: string; label: string };
```

This lets the `CocOverlay` serialize block refs correctly when building the wire payload.

---

## 3. Zod Schema Changes (`packages/server/src/routes/threads-schema.ts`)

Current `inlineRefSchema`:
```ts
const inlineRefSchema = z.object({
  kind: z.enum(["knowledge_item", "task", "artifact", "bet", "message"]),
  id: z.string(),
});
```

New — discriminated union via `z.union` with a manual discriminator check (Zod v3 does not support `z.discriminatedUnion` on heterogeneous shapes without a shared discriminator field, but since both branches have `kind` we can use it):

```ts
const entityRefSchema = z.object({
  kind: z.enum(["knowledge_item", "task", "artifact", "bet", "message"]),
  id: z.string(),
});

const blockRefSchema = z.object({
  kind: z.literal("block"),
  blockId: z.string().min(1),
  hostKind: z.enum(BLOCK_HOST_KINDS),
  hostId: z.string().min(1),
});

const inlineRefSchema = z.discriminatedUnion("kind", [
  entityRefSchema,
  blockRefSchema,
]);
```

Note: `z.discriminatedUnion` requires all members to share the same discriminator key (`kind`). The entity schema uses `z.enum(...)` for `kind` and the block schema uses `z.literal("block")`. Since Zod v3 `z.discriminatedUnion` handles `z.enum` as a set of literals, this works. If Zod rejects it (different shapes), fall back to `z.union([entityRefSchema, blockRefSchema])` with a `.refine()` to reject block refs without the triple.

Import `BLOCK_HOST_KINDS` from `@hyperidle/shared`.

---

## 4. Component Changes

### 4.1 "Share" action in BlockActionsPopover

The `BlockActionsPopover` is a **design-system component** that receives `items: BlockAction[]` from its host page. It does NOT own the actions — pages construct the array.

**Change location:** `packages/web/src/pages/WorkBet.tsx` and `packages/web/src/pages/KnowledgeDetail.tsx` — the two places that mount `<BlockActionsPopover>`.

Add a second `BlockAction` item:
```ts
{
  id: "share-block",
  label: "Share",
  onSelect: () => handleShareBlock(openBlockId),
}
```

The new `handleShareBlock` function calls `attachContext` from `CocContext`:
```ts
function handleShareBlock(blockId: string): void {
  const blockEl = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
  const rawText = blockEl?.textContent?.trim() ?? "";
  const blockExcerpt = rawText.slice(0, 60) || blockId;
  attachContext({
    kind: "block",
    blockId,
    hostKind: HOST_KIND,       // "bet" or "knowledge_item"
    hostId: ENTITY_ID,         // the bet.id or item.id
    label: blockExcerpt,
  });
  setOpenBlockId(null);
}
```

Where `HOST_KIND` and `ENTITY_ID` are the page-level constants (bet.id / item.id with their respective host kinds).

### 4.2 CocAttachButton on blocks

When the CoC overlay is open, blocks in bet pitches and knowledge bodies show a "+" button. This uses the existing `CocAttachButton` component — the question is WHERE to mount it.

**Option A:** Pass CocAttachButton as a slot into the `<Block>` design-system component.  
**Option B:** Wrap each `<Block>` at the page level with a container that adds the button.

**Decision: Option A via the existing `slots` prop.** The `<Block>` component already accepts a `slots` object (with `inlineAfterPayload`). We add a new optional slot: `gutterAction`.

But wait — let me check if `Block` already renders a gutter that could host this.

Actually, looking at the architecture more carefully: the `CocAttachButton` is NOT a design-system component — it lives in `packages/web/src/components/`. And the `Block` design-system component should not depend on web-layer context. So the integration point is at the page level (BetPitch / KnowledgeBody).

**Decision: Option B** — at the page level (BetPitch, KnowledgeBody), wrap each rendered `<Block>` in a relative container. Conditionally render a `<CocAttachButton>` positioned in the block's gutter area when `overlayOpen === true`. This keeps the design-system `Block` component pure.

Implementation:
- In `KnowledgeBody.tsx` and `BetPitch` (inside `WorkBet.tsx`): import `useContext(CocContext)` and `CocAttachButton`.
- For each block in the `.map()`, render:
  ```tsx
  <div className="relative group/block-attach" key={block.id}>
    <Block ... />
    <CocAttachButton ref={{
      kind: "block",
      blockId: block.id,
      hostKind: "knowledge_item", // or "bet"
      hostId: hostId,
      label: blockExcerptFromPayload(block),
    }} />
  </div>
  ```
- `CocAttachButton` already returns `null` when `overlayOpen === false`, so no conditional wrapping needed.

**Helper function:** `blockExcerptFromPayload(block: Block): string` — extract a short text label from `block.payload` for the chip. Lives in a shared utility file.

### 4.3 CocOverlay wire serialization

The `CocOverlay.handleAppendMessage` currently maps refs as:
```ts
const refsToSend = contextRefs.map(({ kind, id }) => ({ kind, id }));
```

This must handle block refs:
```ts
const refsToSend = contextRefs.map((ref) =>
  ref.kind === "block"
    ? { kind: "block" as const, blockId: ref.blockId, hostKind: ref.hostKind, hostId: ref.hostId }
    : { kind: ref.kind, id: ref.id }
);
```

### 4.4 ContextChip (in CocOverlay)

The `ContextChip` currently renders `cocRef.kind` and `cocRef.label`. For block refs, the kind label "block" is sufficient. The label already carries the excerpt. No structural change needed — just ensure the JSX handles both shapes (it already reads `.kind` and `.label` which exist on both union members).

The chip's `key` currently uses `${cocRef.kind}-${cocRef.id}`. For block refs, use `${cocRef.kind}-${cocRef.blockId}-${cocRef.hostId}`.

### 4.5 BlockRefEmbed — new component

A new component that resolves and renders a block reference within a thread message. Lives in `packages/web/src/components/BlockRefEmbed.tsx`.

**Props:**
```ts
export interface BlockRefEmbedProps {
  blockId: string;
  hostKind: BlockHostKind;
  hostId: string;
}
```

**Resolution logic (client-side, at render time):**

1. Fetch the host body:
   - If `hostKind === "bet"` → `GET /api/bets/${hostId}` → response has `pitch` field.
   - If `hostKind === "knowledge_item"` → `GET /api/knowledge/${hostId}` → response has `body` field.
   - Other host kinds: show "unsupported host" indicator (future-proof).
2. Call `deriveBlocks(body, { kind: hostKind, id: hostId })`.
3. Find the block where `block.id === blockId`.
4. If found: render the block payload using `renderPayload()` from the design-system.
5. If not found: render "source changed" indicator.

**States:**
- Loading: skeleton placeholder (single-line shimmer).
- Error (fetch failed): "Could not load referenced content" with a retry button.
- Resolved: the block's payload rendered in a bordered card.
- Degraded: "Source changed — the referenced block no longer exists in the source document."

**Rendering container:** A small bordered card (not a full `<Block>` — no handle, no gutter). Just the content with a thin border, a small "from: [host title]" label, and the payload.

```tsx
<div className="border border-[var(--border-subtle)] rounded-[var(--r1)] px-3 py-2 bg-[var(--surface-1)]">
  <div className="text-[10px] uppercase tracking-wider text-[var(--text-lo)] mb-1">
    Block from {hostKindLabel}
  </div>
  <div className="text-[13px] text-[var(--text-mid)]">
    {renderPayload(block.payload, sanitizeHtml)}
  </div>
</div>
```

**Caching:** Use a simple in-memory cache keyed by `(hostKind, hostId)` for the fetched body. Multiple block refs from the same host share one fetch. The hook `useBlockRef(hostKind, hostId, blockId)` encapsulates this.

### 4.6 Thread message rendering — integrate BlockRefEmbed

The `CommentRow` component renders plain message text via `renderBody()`. Block refs live in `message.payload.refs[]`. The rendering integration happens in `ThreadShell` (design-system, Tier 1) — but `BlockRefEmbed` is a web-layer component that does data fetching. So the integration must be at the consumer level.

**Integration point:** `ThreadShell` already passes messages to `CommentRow`. We add an optional `refEmbedSlot` prop to `CommentRow` that renders AFTER the message body. The slot is assembled by the host (CocOverlay, HostThreadSection, or any other ThreadShell consumer) by inspecting `message.payload.refs`.

Wait — this is complex. Let me reconsider.

**Simpler approach:** `CommentRow` already has a `slots` architecture via `richHeader`, `richBody`, `richActions`. But those are for review/questionnaire messages only.

**Decision:** Add an optional `afterBody` slot to `CommentRowProps`:
```ts
/** Slot rendered after the message body — used for inline ref embeds. */
afterBody?: ReactNode;
```

`ThreadShell` passes this slot through when rendering plain messages. The host that mounts `ThreadShell` provides a render function for building the `afterBody` content based on the message's refs.

Actually — `ThreadShell` is a design-system component. It cannot import `BlockRefEmbed` (web-layer). So `ThreadShell` needs a render prop or slot builder:

```ts
export interface ThreadShellProps {
  // ... existing props ...
  /** Optional render function for inline ref embeds. Called per-message. */
  renderRefEmbeds?: (refs: ReadonlyArray<InlineRef>) => ReactNode;
}
```

`ThreadShell` calls `renderRefEmbeds(message.payload.refs)` and passes the result as `afterBody` to `CommentRow`.

**In the web layer**, the consumer provides:
```tsx
<ThreadShell
  ...
  renderRefEmbeds={(refs) => {
    const blockRefs = refs.filter((r): r is BlockRef => r.kind === "block");
    if (blockRefs.length === 0) return null;
    return (
      <div className="flex flex-col gap-1 mt-1">
        {blockRefs.map((r) => (
          <BlockRefEmbed key={`${r.blockId}-${r.hostId}`} {...r} />
        ))}
      </div>
    );
  }}
/>
```

---

## 5. Hook: useBlockResolution

`packages/web/src/hooks/useBlockResolution.ts`

```ts
export interface BlockResolutionResult {
  status: "loading" | "resolved" | "degraded" | "error";
  payload?: BlockPayload;
  hostLabel?: string;
  error?: string;
}

export function useBlockResolution(
  hostKind: BlockHostKind,
  hostId: string,
  blockId: string,
): BlockResolutionResult;
```

Implementation:
1. Maintains a module-level `Map<string, Promise<string>>` cache keyed by `${hostKind}:${hostId}` holding the raw body text.
2. Fetches the body from the appropriate API endpoint.
3. Calls `deriveBlocks(body, { kind: hostKind, id: hostId })`.
4. Searches for the block by id.
5. Returns the block payload or degraded status.

The cache invalidates on component unmount? No — the cache is module-level and lives for the page session. Bodies are typically stable during a conversation read. If the user edits the source, they would reload anyway.

---

## 6. File-by-File Change List

### Tier 0: Shared types (packages/shared)

| # | File | Change |
|---|------|--------|
| 1 | `packages/shared/src/thread.ts` | Refactor `InlineRef` from interface to discriminated union (`EntityRef \| BlockRef`). Add `InlineRefKind` type. Import `BlockHostKind`. Export new types. |
| 2 | `packages/shared/src/index.ts` | Export `EntityRef`, `BlockRef`, `InlineRefKind` alongside existing `InlineRef`. |

### Tier 1: Server schemas (packages/server)

| # | File | Change |
|---|------|--------|
| 3 | `packages/server/src/routes/threads-schema.ts` | Split `inlineRefSchema` into `entityRefSchema` + `blockRefSchema`, combine with `z.discriminatedUnion("kind", [...])`. Import `BLOCK_HOST_KINDS`. |

### Tier 2: Design system (packages/design-system)

| # | File | Change |
|---|------|--------|
| 4 | `packages/design-system/src/CommentRow.tsx` | Add optional `afterBody?: ReactNode` prop. Render it after the message body `div`. |
| 5 | `packages/design-system/src/ThreadShell.tsx` | Add optional `renderRefEmbeds?: (refs: ReadonlyArray<InlineRef>) => ReactNode` prop. Wire it to `CommentRow.afterBody` for plain messages that have `refs`. |

### Tier 3: Web layer (packages/web)

| # | File | Change |
|---|------|--------|
| 6 | `packages/web/src/contexts/CocContext.tsx` | Change `CocContextRef` to a discriminated union supporting both entity refs and block refs. |
| 7 | `packages/web/src/shell/CocOverlay.tsx` | Update `refsToSend` mapping to handle block refs. Update `ContextChip` key generation. |
| 8 | `packages/web/src/components/CocAttachButton.tsx` | Update `CocAttachButtonProps.ref` type to `CocContextRef` (already is — type widens automatically). Update aria-label to handle block kind. |
| 9 | `packages/web/src/hooks/useBlockResolution.ts` | **NEW.** Hook that fetches host body, derives blocks, resolves a specific block by id. |
| 10 | `packages/web/src/components/BlockRefEmbed.tsx` | **NEW.** Component that uses `useBlockResolution` and renders the block content or degraded state. |
| 11 | `packages/web/src/components/BlockRefEmbed.stories.tsx` | **NEW.** Stories for loading, resolved, degraded, error states. |
| 12 | `packages/web/src/pages/WorkBet.tsx` | Add "Share" action to `BlockActionsPopover` items. Import CocContext. Add `handleShareBlock`. Add `CocAttachButton` in BetPitch block loop. Pass `renderRefEmbeds` to ThreadShell in HostThreadSection. |
| 13 | `packages/web/src/pages/KnowledgeDetail.tsx` | Same as WorkBet: "Share" action, CocAttachButton on blocks, renderRefEmbeds. |
| 14 | `packages/web/src/pages/knowledge/KnowledgeBody.tsx` | Add CocAttachButton in the block render loop (relative wrapper). |
| 15 | `packages/web/src/utils/block-excerpt.ts` | **NEW.** `blockExcerptFromPayload(block: Block): string` — extracts short text from block payload for chip labels. |

### Tier 4: Tests

| # | File | Change |
|---|------|--------|
| 16 | `packages/shared/src/__tests__/thread.test.ts` | Tests for InlineRef type narrowing (compile-time) and any runtime guards. |
| 17 | `packages/server/src/routes/__tests__/threads-schema.block-ref.test.ts` | **NEW.** Zod validation: valid block ref, missing fields rejected, entity ref still works. |
| 18 | `packages/web/src/__tests__/BlockRefEmbed.test.tsx` | **NEW.** Unit tests: loading state, resolved render, degraded "source changed", fetch error. |
| 19 | `packages/web/src/__tests__/CocOverlay.block-ref.test.tsx` | **NEW.** Integration: attach a block ref, verify chip renders, verify wire payload shape. |
| 20 | `packages/web/src/pages/__tests__/WorkBet.share-block.test.tsx` | **NEW.** "Share" action attaches block ref to CocContext. |
| 21 | `packages/web/src/pages/__tests__/KnowledgeDetail.share-block.test.tsx` | **NEW.** Same for knowledge page. |
| 22 | E2E: `packages/web/e2e/block-reference.spec.ts` | **NEW.** Playwright test: open CoC overlay, click "+" on a block, verify chip appears, send message, verify embed renders. |

---

## 7. Ordered Task Sequence

```
Phase A: Types & Schemas (no UI, no tests break)
  Task 1: Refactor InlineRef to discriminated union (thread.ts + index.ts)
  Task 2: Update Zod inlineRefSchema (threads-schema.ts)
  Task 3: Update CocContextRef union (CocContext.tsx)
  Task 4: Fix CocOverlay wire serialization + ContextChip key

Phase B: Resolution infrastructure
  Task 5: Create block-excerpt.ts utility
  Task 6: Create useBlockResolution hook
  Task 7: Create BlockRefEmbed component + stories

Phase C: Design-system slots
  Task 8: Add afterBody to CommentRow
  Task 9: Add renderRefEmbeds to ThreadShell

Phase D: Page-level wiring
  Task 10: WorkBet — add "Share" action + CocAttachButton on blocks + renderRefEmbeds
  Task 11: KnowledgeDetail / KnowledgeBody — same treatment

Phase E: Tests
  Task 12: Unit tests for types, schemas, hook, component
  Task 13: Integration tests for CocOverlay, WorkBet, KnowledgeDetail
  Task 14: Playwright E2E test
```

Tasks within a phase are independent and can be parallelized. Phases are sequential (each depends on the prior).

---

## 8. Acceptance Criteria Mapping

| AC | Covered by |
|----|-----------|
| `InlineRef.kind` includes `"block"` with shape `{ kind: "block"; blockId; hostKind; hostId }` | Task 1 (thread.ts refactor) |
| Zod `inlineRefSchema` validates block refs (discriminated union) | Task 2 (threads-schema.ts) |
| Block actions popover includes "Share" alongside "Discuss" | Tasks 10, 11 (page-level items array) |
| When CoC overlay is open, blocks show CocAttachButton "+" | Tasks 10, 11 (BetPitch/KnowledgeBody block loop) |
| Clicking "Share" or "+" adds block as context ref chip in CoC composer | Tasks 3, 4, 10, 11 (CocContextRef union + attachContext call) |
| Messages with block refs render inline embed card | Tasks 6, 7, 8, 9 (resolution + embed + slots + wiring) |
| Deleted block renders "source changed" indicator | Task 7 (BlockRefEmbed degraded state) |

---

## 9. Contracts & Hard Rules

1. **Block refs carry the full `(blockId, hostKind, hostId)` triple.** A ref with `kind: "block"` and only an `id` is rejected by Zod.
2. **`InlineRef.kind` is a closed enum.** Extended from 5 to 6 members. The concept doc authorizes this.
3. **Block refs are immutable after message persistence.** Same L1 payload immutability contract — no patching persisted refs.
4. **Resolution is client-side at render time.** No server-side pre-resolution or caching endpoint.
5. **Access control:** If you can read the message, you can see the embedded block content. The embed fetches from the standard GET endpoint (which already enforces scope/access).

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Zod v3 `z.discriminatedUnion` rejects mixed `z.enum` + `z.literal` for the `kind` field | Build fails | Fallback: use `z.union([entityRefSchema, blockRefSchema])` (slightly less specific error messages but functionally equivalent). Test the schema in Task 2 before proceeding. |
| Existing code accesses `ref.id` without narrowing on block refs | Type errors after Task 1 | grep for all `ref.id` / `.id` access sites on InlineRef. The only consumer in production is `CocOverlay.refsToSend` (fixed in Task 4) and `ContextChip` key (fixed in Task 4). Confirm via `npm run check`. |
| BlockRefEmbed triggers N+1 fetches for messages with many block refs from different hosts | Slow render in dense threads | The module-level cache deduplicates by `(hostKind, hostId)`. In practice, a CoC conversation references 2-3 distinct hosts. If perf becomes an issue, batch into a single endpoint (follow-up, not T4). |
| `renderRefEmbeds` prop on ThreadShell widens the design-system's public API surface | Component budget | It is an optional render prop (no new component). ThreadShell is already in the 19-component budget. The slot pattern (`afterBody` on CommentRow) is a 1-line prop addition, not a new component. |

---

## 11. Non-Goals (Explicitly Deferred)

- Server-side block resolution / caching endpoint.
- Inline linking (`[[blockId]]` in markdown) — that is L24.
- Block permalink / deep link navigation from the embed card.
- Block refs on message types other than `plain` (review, questionnaire, verdict do not carry `refs`).
- Resolution for host kinds beyond `bet` and `knowledge_item` (future host kinds get a "unsupported" fallback).
