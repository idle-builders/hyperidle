# Concept: Notion-Like Editing Experience

**Status:** Locked  
**Scope:** Every surface that renders blocks must also support Notion-like WYSIWYG editing. Any block can be attached to any thread as context. Markdown stays canonical for agents and storage — but humans never see raw markdown.

**Governing principle:** Two audiences, two interfaces, one format.
- **Agents** read and write GFM markdown. They never see the editor. The fabric, file watcher, and all programmatic consumers continue to work with plain text.
- **Humans** see and edit through a Notion-like WYSIWYG surface. They never need to know markdown exists. Slash commands, inline formatting, drag-to-reorder, block-level operations — the full modern editing experience.
- **Storage** is GFM markdown in the database. The editor serializes to markdown on save. `deriveBlocks()` derives the read representation. Markdown is the lingua franca between humans and agents.

---

## Required reading (for downstream /design, /architecture, /pipeline)

- `docs/blocks/` — full block primitive (especially `composition.md`, `contracts.md`, `canonical-shapes.md`)
- `docs/human-interface-layer/thread-primitive.md` — Thread + Message contracts, host kinds, message types
- `docs/human-interface-layer/block-primitive.md` — HIL perspective on blocks
- `packages/shared/src/thread.ts` — `InlineRef`, `PlainPayload` types (the refs vocabulary)
- `packages/shared/src/blocks/types.ts` — Block, BlockId, BlockHostKind types
- `packages/server/src/routes/threads-schema.ts` — Zod schemas for message payloads and refs
- `packages/web/src/contexts/CocContext.tsx` — `CocContextRef` type, CoC overlay attach pattern
- `packages/web/src/components/CocAttachButton.tsx` — existing attach-to-CoC pattern
- `packages/web/src/shell/CocOverlay.tsx` — how context refs are sent on messages
- `packages/web/src/pages/KnowledgeDetail.tsx` — current knowledge editing (textarea, broken save)
- `packages/web/src/pages/WorkBet.tsx` — current bet pitch rendering (blocks, no edit UI)
- `packages/design-system/src/Block.tsx` — block rendering component
- `packages/design-system/src/BlockActionsPopover.tsx` — block actions (Discuss, needs Share)

---

## The Problem

Three things went wrong:

### 1. The design docs rejected the wrong thing

`docs/blocks/` explicitly says "NOT a Notion-style block editor" and "the body is the unit of editing, not individual blocks." This was framed as protecting GFM purity and agent simplicity. But the rejection conflated two separate concerns:

- **Storage format** — should blocks be persisted as structured data? (No — derived from GFM. Correct.)
- **Editing experience** — should humans edit raw markdown in a textarea? (The docs implicitly said yes. Wrong.)

You can have a Notion-like **editing experience** while keeping GFM as the **storage format**. Every modern Notion-like editor (TipTap, BlockNote, Novel) does exactly this — WYSIWYG editing that serializes to/from markdown. The storage format choice and the editing UX are independent axes.

### 2. What shipped is a raw textarea

Even by the design docs' own vision (inline editing, auto-save, optimistic locking), the current implementation falls short:

| Designed | Shipped |
|---|---|
| Inline editing in the body view | Side-by-side split: textarea left, preview right |
| Auto-save with version conflict detection | Save button updates local React state only — **no API call** |
| Optimistic locking on `version` column | Not wired up |
| Rich markdown rendering on the edit surface | Monospace `<textarea>` with separate preview pane |
| Bet pitch editing | No frontend editing UI at all |

### 3. Creation is equally primitive

Both `KnowledgeCreateDialog` and `BetCreateDialog` use plain `<textarea>` elements with "Describe it in markdown" placeholders. Users who don't know markdown syntax get no assistance. There's no formatting toolbar, no slash commands, no block-type insertion — just a box.

---

## The Reframe

**One editor component, two modes, GFM underneath.**

```
┌──────────────────────────────────────────────┐
│           What the user sees                 │
│                                              │
│  Notion-like WYSIWYG surface:                │
│  - Click to type                             │
│  - "/" slash menu for block types             │
│  - Inline formatting (bold, italic, code)    │
│  - Drag to reorder blocks                    │
│  - Paste rich content → auto-convert         │
│                                              │
├──────────────────────────────────────────────┤
│           What's stored                      │
│                                              │
│  Plain GFM markdown in the DB column         │
│  (knowledge_items.body, bets.pitch)          │
│                                              │
├──────────────────────────────────────────────┤
│           What agents write                  │
│                                              │
│  Plain GFM markdown — unchanged              │
│  (agents never interact with the editor)     │
│                                              │
├──────────────────────────────────────────────┤
│           What reads use                     │
│                                              │
│  deriveBlocks() → <Block /> components       │
│  (thread anchoring, block actions, popovers) │
│  (unchanged — read path is not affected)     │
│                                              │
└──────────────────────────────────────────────┘
```

The key insight: **TipTap and deriveBlocks() solve different problems.** TipTap owns the editing experience (transient, human-facing). deriveBlocks() owns the read representation (stable IDs, thread anchoring, block actions). They don't conflict — they operate in different modes.

---

## Editor Technology: TipTap

**Choice: TipTap (ProseMirror-based)**

| Criterion | TipTap | Slate | BlockNote | Novel |
|---|---|---|---|---|
| Markdown round-trip | Native (tiptap-markdown extension) | Manual serializer needed | Built-in but opinionated | Built-in (TipTap wrapper) |
| Block-aware editing | Yes — each node is a block | Yes | Yes — block-first design | Yes |
| Slash commands | Built-in suggestion extension | Community plugin | Built-in | Built-in |
| Extensibility | Excellent — custom nodes/marks/extensions | Good | Limited — wraps TipTap | Limited — preset |
| GFM fidelity | High — remark-based serializer | Manual | Partial — some block types lost | Partial |
| Maturity | Established, well-maintained | Established | Newer, active | Newer, active |
| Headless (no imposed UI) | Yes — headless-first design | Yes | No — ships with React UI | No — ships with Tailwind UI |
| Bundle size | ~50KB gzipped (core + extensions) | ~30KB | ~80KB | ~90KB |

**Why TipTap over alternatives:**
- **Headless**: We control the UI completely — no imposed styling that conflicts with Lucid design system. This is critical for AQ compliance.
- **Markdown serialization**: `tiptap-markdown` extension handles GFM round-tripping. Proven in production.
- **Extension model**: We can add custom extensions later (block-level discussion, block selection gutter, agent attribution marks) without fighting the framework.
- **ProseMirror foundation**: Battle-tested in Google Docs-class editors. Schema-based — prevents invalid document states.

**Why NOT BlockNote/Novel:**
- Both ship opinionated UI (card-style blocks, colored backgrounds, drag handles with specific styling). This clashes with the Lucid design system's precision-instrument aesthetic.
- Less control over markdown serialization fidelity.
- Novel is a preset wrapper around TipTap — if we're going to use TipTap anyway, use it directly.

---

## Package: `@tiptap/` Dependencies

```
@tiptap/react           — React integration
@tiptap/starter-kit     — paragraph, heading, bold, italic, code, blockquote, lists, etc.
@tiptap/extension-code-block-lowlight  — fenced code blocks with syntax highlighting
@tiptap/extension-table — GFM tables
@tiptap/extension-image — block-level images
@tiptap/extension-placeholder — empty-state placeholder text
@tiptap/extension-horizontal-rule — dividers (---)
tiptap-markdown          — markdown serialization/deserialization
```

This maps 1:1 to the BlockKind vocabulary: heading, paragraph, list, quote, code, table, divider, image. `html` and `unknown` kinds don't need editor support (they're fallbacks for read mode).

---

## Editing Surfaces

**Rule: everywhere blocks render, humans can edit.** If `deriveBlocks()` touches it on read, `<BodyEditor />` replaces the textarea on write. No exceptions.

### Tier 1 — Block-rendered content (must ship with the editor)

These fields currently render through `deriveBlocks() → <Block />`. They're the primary editing surfaces.

#### 1. Knowledge Body (edit mode)

**Current:** textarea + preview split → `KnowledgeDetail.tsx:367-374`  
**Target:** TipTap editor replacing the entire edit panel. No split view — the editor IS the view. Click anywhere in the body to start typing. The read view and edit view are the same surface — clicking into it activates editing, clicking out saves.

- Editor loads markdown from API → TipTap `content` via markdown deserializer
- Typing is WYSIWYG — what you see is what's stored
- Auto-save: debounced (1.5s after last keystroke) → `PATCH /api/knowledge/:id` with `{ body, version }`
- Conflict detection: if PATCH returns 409, show inline conflict banner
- No explicit "Edit" button needed — the body is always editable (except factory items under review)

#### 2. Knowledge Create (dialog)

**Current:** plain textarea → `KnowledgeCreateDialog.tsx:157-163`  
**Target:** TipTap editor inside the dialog, replacing the textarea.

- Starts empty with placeholder "Start writing..."
- Same WYSIWYG experience — slash commands, formatting, the works
- On "Create": serialize to markdown → POST to API

#### 3. Bet Pitch (edit mode)

**Current:** No frontend editing UI exists  
**Target:** Same TipTap editor pattern as knowledge — click into the pitch to edit

- Inline editor replaces the read-mode Block rendering
- Only editable in mutable statuses (shaped, committed, in_progress, paused, behind, blocked, review)
- Auto-save → `PATCH /api/bets/:id` with `{ field: "pitch", value, reason }`
- Reason field: auto-generated "Edited by [user]"

#### 4. Bet Create (dialog)

**Current:** plain textarea → `BetCreateDialog.tsx:175-181`  
**Target:** TipTap editor replacing the pitch textarea.

### Tier 2 — Structured text fields (upgrade to editor)

These fields exist in the schema as text and would benefit from rich editing. They don't currently render through `deriveBlocks()` but they contain structured content that humans author.

#### 5. Bet Done Condition (create + edit)

**Current:** No UI for editing. Set at creation time in BetCreateDialog (plain input).  
**Target:** Small `<BodyEditor />` instance — supports formatting but doesn't need the full slash menu. A "mini" editor variant.

#### 6. Bet Hypothesis (create + edit)

**Current:** No UI for editing.  
**Target:** Same mini editor as done condition.

#### 7. Task Description (future)

**Current:** `tasks.description` exists in schema but has no editing UI.  
**Target:** When task detail view ships, use `<BodyEditor />` for the description field.

### Not upgraded — plain text by nature

These surfaces stay as plain textareas. They're short-form metadata, not structured documents:

- **Thread message composer** (`HostThreadSection.tsx`) — chat messages are L1 Thread messages, not blocks. Plain text.
- **Task notes** (`TaskSheet.tsx`) — "What should the agent know?" is a note, not a document.
- **Action reasons** (pause/kill/appetite in `WorkBet.tsx`) — metadata justification, not content.

---

## The Editor Component

One shared component used across all surfaces. Two variants:

### Full editor (Tier 1 surfaces — knowledge body, bet pitch)

```typescript
interface BodyEditorProps {
  /** Initial markdown content (empty string for create) */
  initialContent: string;
  /** Called on every content change with serialized markdown */
  onChange: (markdown: string) => void;
  /** Placeholder text when editor is empty */
  placeholder?: string;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** Minimum height — varies by surface (dialog vs full page) */
  minHeight?: string;
  /** When false, editor is read-only (non-editable surfaces, factory items) */
  editable?: boolean;
  /** Variant: "full" = slash menu + all block types; "mini" = inline formatting only */
  variant?: "full" | "mini";
}
```

### Mini editor (Tier 2 surfaces — done condition, hypothesis)

Same component with `variant="mini"`. Supports inline formatting (bold, italic, code, link) but no slash menu, no block-type insertion. For short structured text that benefits from formatting but isn't a full document.

This is a **design-system-level component** — it lives in `packages/design-system/` alongside Block, Tag, StatusChip, etc. It's the 20th custom component.

### Slash Menu

Type `/` at the start of a line to insert:

| Command | Block type | GFM output |
|---|---|---|
| `/heading1` through `/heading3` | Heading | `# ` / `## ` / `### ` |
| `/bullet` | Bullet list | `- ` |
| `/numbered` | Ordered list | `1. ` |
| `/quote` | Blockquote | `> ` |
| `/code` | Code block | ` ``` ` |
| `/divider` | Horizontal rule | `---` |
| `/table` | Table (2x2 starter) | GFM table syntax |
| `/image` | Image placeholder | `![alt](url)` |

No callouts, no toggles, no embeds, no synced blocks. The slash menu offers exactly the 8 insertable BlockKind types — nothing more. This isn't Notion's everything-is-a-block maximalism; it's the minimum set that makes GFM authoring frictionless.

### Inline Formatting

Standard markdown inline marks, available via toolbar or keyboard shortcuts:

| Format | Shortcut | Markdown |
|---|---|---|
| Bold | Cmd+B | `**text**` |
| Italic | Cmd+I | `*text*` |
| Code | Cmd+E | `` `text` `` |
| Strikethrough | Cmd+Shift+X | `~~text~~` |
| Link | Cmd+K | `[text](url)` |

### Toolbar

Minimal floating toolbar appears on text selection:
- Bold, Italic, Code, Strikethrough, Link
- No block-type controls in the toolbar (those live in the slash menu)
- No color, no highlight, no alignment — GFM doesn't support them

### What Makes This Feel Like Notion (Not a Textarea)

The quality bar is "a user who has never heard of markdown can author a rich document." Specifically:

1. **Click-to-type anywhere.** No "Edit" button, no mode switch. The body IS the editor. Click, type.
2. **Slash menu.** Type `/` and a dropdown appears with block types. Select one, it inserts. No syntax knowledge required.
3. **Floating toolbar on selection.** Select text, toolbar pops up. Click bold, text is bold. No `**` visible.
4. **Block-level operations.** Hover a block → drag handle appears in gutter. Drag to reorder. Click to select entire block. Backspace at start of empty block to delete it.
5. **Smart paste.** Paste from a webpage → auto-converts to markdown structure (headings, lists, links preserved). Paste a URL on selected text → auto-creates link.
6. **Keyboard-first.** Power users never touch the mouse: `/` for blocks, `Cmd+B/I/E/K` for formatting, `Enter` for new paragraph, `Tab` for list indent, `Shift+Tab` for list outdent, `Cmd+Shift+1-3` for heading levels.
7. **No raw markdown visible.** Ever. The user sees formatted text, not `**bold**` or `## heading`. Markdown is the serialization format, not the editing language.
8. **Placeholder on empty.** Empty document shows greyed-out "Start writing..." or "Type / for commands" — not a blank void.
9. **Auto-save.** No save button. Content saves as you type (debounced). "Saved" indicator appears briefly. The user doesn't think about saving.
10. **Seamless read-to-edit transition.** In read mode, content shows styled. Click into it → cursor appears, same styling, you're editing. Click away → saved and back to read mode. No visual jank between modes.

---

## Relationship: TipTap ↔ deriveBlocks()

These are NOT competing systems. They serve different purposes and never run simultaneously on the same content:

| Concern | Edit mode (TipTap) | Read mode (deriveBlocks) |
|---|---|---|
| **Who uses it** | Humans editing | Everyone reading |
| **Document model** | ProseMirror doc (transient, in-memory) | Block[] with stable BlockIds |
| **Block identity** | ProseMirror node positions (ephemeral) | Blake2s content hash (stable, addressable) |
| **Thread anchoring** | Not supported — you're editing, not discussing | Full support via BlockAnchor |
| **Block actions** | Not needed — you ARE the editor | Popover: Discuss, Copy link |
| **Lifecycle** | Created on edit-start, destroyed on edit-end | Derived on every read/render |

**Transition flow:**
1. **Read → Edit:** User clicks Edit. TipTap mounts, loads markdown from DB. ProseMirror doc created.
2. **Editing:** TipTap manages the document. Changes auto-save as markdown to DB.
3. **Edit → Read:** User exits edit mode. TipTap unmounts. `deriveBlocks()` re-derives from saved markdown. Block components render with stable IDs. Thread anchors re-attach.

The Block rendering pipeline (`deriveBlocks → <Block />`) is untouched. It remains the read-mode system, and gains nothing from — and loses nothing to — TipTap.

---

## Persistence Changes

### Knowledge: Fix the broken save

**Current bug:** `KnowledgeDetail.tsx:267` — `saveEdit()` calls `setSavedContent(draft)` but never hits the API. The PATCH endpoint exists and works (`/api/knowledge/:id`), it's just not called.

**Fix:** Auto-save on content change (debounced) → `PATCH /api/knowledge/:id` with optimistic locking. Remove the explicit Save/Cancel buttons — auto-save replaces them.

### Bets: Wire up frontend editing

The PATCH endpoint for pitch exists (`/api/bets/:id` with `{ field: "pitch", value, reason }`). The frontend just needs the editing UI.

### Auto-save pattern

```
User types → TipTap onChange → debounce 1500ms → serialize to markdown → PATCH API
                                                                          ↓
                                                                    409 Conflict? → show banner
                                                                    200 OK? → update local version
```

Saving indicator: small "Saving..." / "Saved" text near the editor (not a toast — too noisy for auto-save). Uses the standard `var(--text-lo)` color.

---

## Concept: Block Reference (extends InlineRef)

### Definition

A **Block Reference** is a typed entry in a message's `refs` array that points to a specific block within a specific host body. When a message carries a block ref, the rendering surface shows the referenced block's content as an inline embed — the block "in full" — alongside the message text.

This is the missing piece in the cross-entity connection model. Today, `InlineRef` lets messages reference knowledge items, tasks, artifacts, bets, and other messages. Adding `block` completes the set: any message in any thread can cite any block in any body.

### Essential properties

- **Typed ref, not a new primitive.** A block reference is an entry in the existing `refs` array on `PlainPayload`. It follows the same pattern as knowledge_item, task, etc. No new message type, no new table.
- **Full coordinate.** `{ kind: 'block', blockId, hostKind, hostId }`. The `blockId` alone is not globally unique — identical content in different hosts produces identical blockIds (per block contracts §8.4). The host pair scopes the reference to the correct body.
- **Renders "in full."** The UI resolves the ref at render time: fetches the source body → derives blocks → finds the matching blockId → renders the block content as an embed card. This is not a link — the user sees the block's actual content inline in the thread.
- **Live resolution.** Shows current block content when resolvable. If the source body was edited and the blockId no longer exists, the embed shows "source changed" — same pattern as L26's "anchor lost" indicator. The ref persists; the resolution is best-effort.
- **Travels on any thread.** Unlike block anchors (which live within the host's own thread), block references travel on ANY thread — DM with an agent, chief of staff chat, team discussion. This is the "attach a block to any conversation" capability.

### What a Block Reference is NOT

- **NOT a Block Anchor.** A block anchor (`payload.blockId` on a message within the host's own thread) is positional — it renders the message next to the block in the body view. A block reference is contextual — it renders the block as an embed in any thread. Different semantics, different rendering paths, same block coordinate. Both coexist; neither replaces the other.
- **NOT a snapshot.** The ref is a pointer, not a copy. It resolves to current content at render time. We do not store the block's markdown at attachment time. If the source changes, the embed updates. If the block disappears, the embed degrades gracefully. Rationale: blocks are derived from markdown; storing snapshots would create a parallel truth.
- **NOT a link (L24).** L24 (inline linking, deferred) is about `[[id]]` wiki-style links within markdown bodies. Block references are message-level citations in threads. Different layer, different primitive, no dependency.
- **NOT a deep link or URL.** The block ref is a structured data reference in the message payload, not a user-facing URL. A permalink affordance (copy link to block) is a separate concern — it navigates to the host and scrolls to the block. The ref _embeds_ the content; the permalink _navigates_ to it.

### Composition

```
PlainPayload.refs[] ──→ InlineRef (discriminated union)
                            ├── { kind: "knowledge_item", id }
                            ├── { kind: "task", id }
                            ├── { kind: "artifact", id }
                            ├── { kind: "bet", id }
                            ├── { kind: "message", id }
                            └── { kind: "block", blockId, hostKind, hostId }  ← NEW
```

- A message's `refs` array carries 0..N refs. A block ref is one entry among potentially many.
- Multiple messages across different threads can reference the same block.
- A block does not know about its inbound references (same one-way pattern as block anchors — keeps derivation pure).
- The block ref does NOT own the block. The body is the source of truth.

### Lifecycle

- **Created** when a user attaches a block to a message — via the "Share" block action, the CoC "+" attach button on a block, or a future paste/mention affordance.
- **Persisted** in the message payload's `refs` array (same immutability contract as all message payloads — once written, never patched).
- **Resolved** at render time by the UI. No server-side pre-resolution.
- **Degraded** if the source block no longer exists: embed renders "source changed" indicator. The ref entry remains in the payload.

### Authority

- The message sender creates the ref (by attaching a block to their message).
- Resolution is reader-side: the UI fetches the body, derives blocks, finds the match.
- Access control: if you can read the message, you can see the embedded block content. Navigation to the source (clicking through to the host) may be gated by scope/access rules — but the inline embed is always shown. Rationale: the sender chose to share this context; hiding it from readers of the thread would break the conversation.

### Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Block Reference** | A typed ref in `PlainPayload.refs[]` pointing to a block by `(blockId, hostKind, hostId)` | block attachment (ambiguous with block anchor), block citation, block embed (rendering term) |
| **Block Anchor** | A `blockId` on a message within the host's own thread, rendering next to the block (L18/L26) | block reference (the cross-entity one), block comment |
| **InlineRef** | The typed reference shape on messages: `{ kind, id, ... }` | context ref (UI-layer display term used in CocContext) |

### Contracts

- **Cardinality.** A message carries 0..N block refs in `refs[]`. A block is referenced by 0..N messages across 0..N threads. No upper bound.
- **Closure.** `InlineRef.kind` is a closed enum. Adding `block` extends it from 5 to 6 kinds. This concept doc authorizes the extension. Future kinds require another concept-doc update.
- **Mutability.** Block refs are immutable after message persistence (L1 payload immutability contract). The _resolution_ is dynamic (current block content), but the _ref itself_ never changes.
- **Identity.** A block ref is identified by the triple `(blockId, hostKind, hostId)`. This breaks the flat `{ kind, id }` shape of existing InlineRef. The type becomes a discriminated union:
  - Entity refs: `{ kind: "knowledge_item" | "task" | "artifact" | "bet" | "message"; id: string }`
  - Block refs: `{ kind: "block"; blockId: string; hostKind: BlockHostKind; hostId: string }`
- **Hard rule.** A block ref MUST carry the full `(blockId, hostKind, hostId)` triple. A ref with `kind: "block"` and only an `id` is invalid. The host pair prevents cross-host resolution ambiguity — same reasoning as L2 contracts §8.5.4.

### Rationale

The founder's reframe: "the entire idea of our thing is this easy way to connect between block - task - thread - artifact." The `InlineRef` vocabulary is the cross-cutting connection model. It already connects tasks, bets, knowledge items, artifacts, and messages to any thread. Blocks are the missing node. Adding them completes the graph — any entity can cite any other entity via the refs system.

The pattern already exists in code. `CocAttachButton` surfaces on bets (Canvas, WorkBet) and tasks (Kanban). `CocContext` provides `attachContext(ref)`. `CocOverlay` sends refs on the next message. All that's missing is:
1. `"block"` in `InlineRef.kind`
2. `CocAttachButton` in the block gutter
3. A `BlockRefEmbed` component that resolves and renders the ref in any thread

### UX entry points (for /design)

Three ways to attach a block to a thread:

1. **From the block (share action).** Block actions popover currently has "Discuss" (L18). Add "Share" — opens the CoC overlay or a recipient picker with the block pre-attached as a context ref.
2. **From the CoC overlay (attach button).** When the CoC overlay is open, blocks in knowledge bodies and bet pitches show a "+" button (same `CocAttachButton` pattern as bets/tasks). Clicking attaches the block to the next CoC message.
3. **From any thread composer (future).** Paste a block permalink → auto-expands to block embed. Or a `/ref` command in the composer. Deferred — the first two entry points cover the primary use case.

---

## What This Does NOT Change

- **Block primitive**: Blocks remain derived from GFM. No block persistence. No new schema for blocks.
- **deriveBlocks()**: Unchanged. Still the read-mode rendering pipeline.
- **Block components**: `<Block />` in `packages/design-system/` unchanged for read mode.
- **Block anchoring (L18)**: In-host thread attachment via `blockId` on payload unchanged.
- **Agent authoring**: Agents continue writing plain GFM. They never see TipTap.
- **Knowledge Fabric**: File watcher and writeback continue handling plain markdown.
- **BlockId algorithm**: Unchanged. Content-hash stability preserved.
- **Thread primitive**: Threads still attach to exactly one host. Block references travel on message refs, not on thread metadata.
- **Message types**: Still `plain | review | questionnaire | verdict`. No new message type.

---

## What This DOES Change

| File / Area | Change |
|---|---|
| `packages/design-system/src/BodyEditor.tsx` | **New** — TipTap editor component |
| `packages/design-system/src/BodyEditor.stories.tsx` | **New** — Storybook for editor states |
| `packages/web/package.json` | Add `@tiptap/*` + `tiptap-markdown` dependencies |
| `packages/web/src/pages/KnowledgeDetail.tsx` | Replace textarea+preview with `<BodyEditor />`, wire auto-save to PATCH API |
| `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx` | Replace textarea with `<BodyEditor />` |
| `packages/web/src/pages/WorkBet.tsx` | Add edit mode with `<BodyEditor />`, wire to PATCH API |
| `packages/web/src/pages/work/BetCreateDialog.tsx` | Replace pitch textarea with `<BodyEditor />` |
| `packages/shared/src/thread.ts` | Extend `InlineRef` to discriminated union with `block` kind |
| `packages/server/src/routes/threads-schema.ts` | Extend `inlineRefSchema` Zod validator for block refs |
| `packages/web/src/contexts/CocContext.tsx` | Extend `CocContextRef` to support block refs |
| `packages/web/src/components/CocAttachButton.tsx` | Support block refs (needs hostKind/hostId) |
| `packages/design-system/src/BlockRefEmbed.tsx` | **New** — renders a block ref as an inline embed card |
| `packages/web/src/pages/knowledge/KnowledgeBody.tsx` | Add `CocAttachButton` on each block when overlay open |
| `packages/web/src/pages/WorkBet.tsx` | Add `CocAttachButton` on each block when overlay open; add "Share" to block actions |
| `packages/design-system/src/BlockActionsPopover.tsx` | Add "Share" action alongside "Discuss" |
| `docs/blocks/composition.md` | Add Block Reference concept (cross-entity refs via InlineRef) |
| `docs/blocks/definition.md` | Update to clarify: blocks are the read model, editing uses WYSIWYG |
| `docs/blocks/what-a-block-is-not.md` | Remove/soften "NOT a Notion-style block editor" — the read model isn't, but the edit UX is |

---

## Open Questions (for /design and /architecture)

1. **Floating toolbar vs fixed toolbar?** Floating appears on selection (more Notion-like, less chrome). Fixed sits above the editor (more discoverable for users unfamiliar with rich editors). Recommendation: floating — consistent with the dense/minimal Lucid aesthetic.

2. **Markdown source toggle?** Should there be a "view source" toggle that shows raw markdown? Useful for power users and debugging. Low cost to add — TipTap content is always serializable. Recommendation: yes, as a small toggle in the editor footer.

3. **Drag-to-reorder blocks?** TipTap supports this via `@tiptap/extension-draggable`. Adds a drag handle gutter. Nice but not essential for v1. Recommendation: defer to v2.

4. **Table editing UX?** GFM tables are painful to author. TipTap's table extension provides add-row/add-column affordances. Worth including from v1. Recommendation: yes — tables without a visual editor defeat the purpose.

5. **Image upload?** Current system has no file upload infrastructure. The image slash command would insert a URL reference (`![](url)`), not upload. Recommendation: URL-only for v1, upload deferred.

6. **Editor in design-system or web?** The component depends on TipTap which is a heavy dependency. If it lives in design-system, the package gains ~50KB. If it lives in web, it's not reusable by other packages. Recommendation: design-system with TipTap as a peer dependency — the editor IS a design primitive.

---

## Acceptance Criteria (for work package scoping)

### Editor (Notion-like WYSIWYG)

1. All four Tier 1 editing surfaces (knowledge edit, knowledge create, bet pitch edit, bet create) use a WYSIWYG editor instead of a textarea.
2. Editor supports all 8 insertable BlockKind types via slash menu.
3. Inline formatting (bold, italic, code, strikethrough, link) works via keyboard shortcuts and floating toolbar.
4. Content round-trips through markdown without loss: markdown → TipTap → markdown produces equivalent GFM.
5. Knowledge auto-saves to API with optimistic locking (version conflict detection).
6. Bet pitch saves to API via the existing PATCH endpoint.
7. Read mode continues using `deriveBlocks() → <Block />` — no regression in block rendering, thread anchoring, or block actions.
8. Empty editor shows placeholder text.
9. Editor respects Lucid design system tokens (spacing, typography, colors). No AI aesthetic.
10. `npm run verify` passes (types, lint, tests).

### Block Reference (attach block to any thread)

11. `InlineRef.kind` includes `"block"` with `{ blockId, hostKind, hostId }` shape.
12. Block actions popover includes a "Share" action that attaches the block to the CoC overlay as a context ref.
13. `CocAttachButton` renders on blocks when the CoC overlay is open (same pattern as bets/tasks).
14. Messages with block refs render the referenced block content as an inline embed card in the thread.
15. When a referenced block no longer exists (source body edited), the embed shows a "source changed" indicator.
16. Block refs travel on the existing `refs` array in `PlainPayload` — no new message type or table.
17. `npm run verify` passes (types, lint, tests).

### Block Discussion (complete L18/L26)

18. "Discuss" block action creates/uses the host's thread with `blockId` on the message (existing L18 pattern, currently working).
19. Block-anchored messages persist `blockId` durably (not just in opaque JSON payload — structured for query).
20. "Anchor lost" indicator when a block's content changes and blockId no longer resolves.
