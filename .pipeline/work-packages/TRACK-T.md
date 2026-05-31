# Track T: Block Editing & Connections

Notion-like WYSIWYG editing everywhere blocks render. Block references as cross-entity citations in any thread. Completion of per-block discussion. Markdown stays canonical for agents and storage; humans get a rich editing surface.

**Concept:** `plans/human-authoring/editing-experience-concept.md` (locked)

**Constraint:** `deriveBlocks()` is unchanged — it remains the read-mode rendering pipeline. The editor serializes to GFM markdown; blocks re-derive on read. No new markdown dialect. No block persistence table. `npm run dev` works at every merge boundary.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### T1 — BodyEditor Component (TipTap WYSIWYG)

**Workpackage.** As a human editing content in HyperIdle, I want a Notion-like WYSIWYG editor that presents formatted text — headings, lists, code blocks, tables — without exposing raw markdown syntax, so that I can author rich documents without knowing markdown.

**Depends on.** None. The component is self-contained in the design system, with no dependency on surface-level wiring.

**Complexity.** M

**Acceptance criteria.**
- A `BodyEditor` component exists in `packages/design-system/` with a companion `.stories.tsx` rendering key states at `/designsystem`.
- The editor accepts `initialContent` as GFM markdown and presents it as formatted WYSIWYG text.
- Serializing the editor content back to markdown produces equivalent GFM (round-trip fidelity).
- A slash menu (`/`) inserts all 8 insertable BlockKind types: heading (1-3), bullet list, ordered list, blockquote, code block, table, horizontal rule, image (URL-only).
- A floating toolbar appears on text selection with: bold, italic, inline code, strikethrough, link.
- Keyboard shortcuts work: Cmd+B (bold), Cmd+I (italic), Cmd+E (code), Cmd+K (link), Cmd+Shift+X (strikethrough).
- Empty editor shows configurable placeholder text.
- The component accepts a `variant` prop: `"full"` (slash menu + all block types) and `"mini"` (inline formatting only).
- The component respects Lucid design system tokens (spacing, typography, colors). No AI aesthetic violations.

**Validation scenarios.**
- Given an empty editor with variant="full", when the user types "/" at the start of a line, then a dropdown appears listing all 8 block types. Selecting "heading1" inserts a level-1 heading. Serializing outputs `# <text>`.
- Given markdown content `## Hello\n\nSome **bold** text`, when the editor mounts, then "Hello" renders as a styled heading and "bold" renders visually bold — no `**` markers visible.
- Given the user selects text and clicks "Bold" in the floating toolbar, when the content is serialized, then the output contains `**selected text**`.
- Given variant="mini", when the user types "/", then no slash menu appears. Inline formatting (bold, italic, code) still works.

**Plan calls.** Standard architecture pass — component props, TipTap extension selection, markdown serializer configuration, storybook states. Skip /design step — the editor's visual treatment follows TipTap's headless defaults styled with Lucid tokens.

**Contracts / constraints.**
- TipTap (`@tiptap/react`) as the editor framework — headless, ProseMirror-based.
- `tiptap-markdown` for GFM serialization/deserialization.
- The component is a design-system primitive (the 20th custom component). TipTap is a peer dependency.
- No raw markdown visible to the user. Ever.
- Round-trip fidelity: markdown → editor → markdown must produce semantically equivalent GFM. Whitespace normalization is acceptable; structural loss is not.

**Out of scope.**
- Surface integration (Knowledge, Bet) — those are T2 and T3.
- Auto-save / persistence — that's surface-level wiring.
- Drag-to-reorder blocks — deferred to a future workpackage.
- Image upload — URL-only for now.
- Collaborative editing / real-time sync.

**Effort.** M (~4h)

---

### T2 — Knowledge WYSIWYG Editing

**Workpackage.** As a human editing a knowledge item, I want the body to be a Notion-like WYSIWYG surface — click anywhere to type, auto-save as I go, no raw markdown visible — so that editing knowledge feels like writing in Notion, not fighting a textarea.

**Depends on.**
- T1: the BodyEditor component must exist before it can be integrated into the knowledge surface.

**Complexity.** M

**Acceptance criteria.**
- `KnowledgeDetail` uses `BodyEditor` instead of the textarea + preview split for editing.
- `KnowledgeCreateDialog` uses `BodyEditor` instead of the plain textarea for the body field.
- Knowledge body auto-saves via `PATCH /api/knowledge/:id` with the `version` field for optimistic locking.
- On version conflict (409 response), an inline conflict banner appears.
- A saving indicator ("Saving..." / "Saved") appears near the editor during and after auto-save.
- Factory-scoped items under review remain read-only (existing "amendable" banner behavior preserved).
- Read mode continues using `deriveBlocks() → <Block />` for thread anchoring and block actions.

**Validation scenarios.**
- Given a knowledge item with body `## Setup\n\nRun npm install`, when the user navigates to the detail page and clicks into the body, then the content appears as formatted WYSIWYG text and a cursor is active.
- Given the user edits the body (adds a paragraph), when 1.5 seconds pass without further typing, then the PATCH endpoint is called with the serialized markdown and the current version number, and "Saved" appears.
- Given two tabs edit the same item and Tab B saves after Tab A, when Tab A auto-saves, then a 409 conflict is returned and an inline banner warns of the conflict.
- Given a factory-scoped item with status "needs_human", when the user views it, then the body is NOT editable and the "amendable under review" banner is shown.

**Plan calls.** Standard architecture pass — auto-save debounce hook, optimistic locking integration, conflict banner component, read-to-edit transition behavior.

**Contracts / constraints.**
- Auto-save debounce: 1500ms after last keystroke.
- The existing `PATCH /api/knowledge/:id` endpoint is used as-is — no API changes.
- `deriveBlocks()` read path is untouched. Block rendering, thread anchoring, and block actions must not regress.
- No explicit Save/Cancel buttons — auto-save replaces them. The edit/read boundary is the click-in / click-out behavior.

**Out of scope.**
- Bet pitch editing — that's T3.
- Block discussion changes — that's T5.
- Scope change UX — unchanged.

**Effort.** M (~4h)

---

### T3 — Bet Pitch WYSIWYG Editing

**Workpackage.** As a founder editing a bet's pitch, I want the same Notion-like WYSIWYG experience as knowledge editing — click into the pitch to type, auto-save, no markdown syntax visible — so that refining a bet's pitch is as natural as writing in Notion.

**Depends on.**
- T1: the BodyEditor component must exist before it can be integrated into the bet surface.

**Complexity.** M

**Acceptance criteria.**
- `WorkBet` detail page shows an editable BodyEditor for the pitch (replacing the read-only block rendering) in mutable bet statuses (shaped, committed, in_progress, paused, behind, blocked, review).
- In non-mutable statuses (shipped, killed), the pitch renders as read-only blocks (existing behavior).
- `BetCreateDialog` uses `BodyEditor` instead of the plain textarea for the pitch field.
- Pitch auto-saves via `PATCH /api/bets/:id` with `{ field: "pitch", value, reason }`.
- A saving indicator appears during and after auto-save.
- Block actions (Discuss, block popover) work in read-only mode when the pitch is not being actively edited.

**Validation scenarios.**
- Given a bet in "shaped" status, when the user navigates to the bet detail and clicks into the pitch area, then the pitch appears as formatted WYSIWYG text and editing is possible.
- Given a bet in "shipped" status, when the user views the pitch, then the pitch renders as read-only blocks (not an editor) and block actions (Discuss) work.
- Given the user creates a new bet via the dialog, when they type in the pitch field, then they see formatted text (not raw markdown) and slash commands work.
- Given the user edits the pitch and 1.5s passes, when auto-save fires, then `PATCH /api/bets/:id` is called with `field: "pitch"`, the serialized markdown as `value`, and an auto-generated reason.

**Plan calls.** Standard architecture pass — bet pitch edit-mode toggle, status-based editability, auto-save wiring to the existing PATCH endpoint.

**Contracts / constraints.**
- The existing `PATCH /api/bets/:id` endpoint is used as-is — no API changes.
- Pitch mutability follows the existing 7-status rule (shaped, committed, in_progress, paused, behind, blocked, review).
- `deriveBlocks()` read path is untouched. Block anchoring and thread integration must not regress.

**Out of scope.**
- Done condition / hypothesis editing with mini editor — deferred.
- Cost appetite editing UX — unchanged.
- Knowledge editing — that's T2.

**Effort.** M (~4h)

---

### T4 — Block Reference (Attach Block to Any Thread)

**Workpackage.** As a human reading a knowledge item or bet pitch, I want to attach any block to the Chief of Staff chat or any new conversation — block content shown in full as an inline embed — so that I can bring specific content into any discussion without copy-pasting.

**Depends on.** None. The CocAttachButton pattern, CocContext, CocOverlay, and InlineRef infrastructure all exist. This workpackage extends them.

**Complexity.** M

**Acceptance criteria.**
- `InlineRef.kind` includes `"block"` with shape `{ kind: "block"; blockId: string; hostKind: BlockHostKind; hostId: string }`.
- The Zod schema for `inlineRefSchema` validates block refs (discriminated union: entity refs use `{ kind, id }`, block refs use `{ kind, blockId, hostKind, hostId }`).
- Block actions popover includes a "Share" action alongside the existing "Discuss" action.
- When the CoC overlay is open, blocks in knowledge bodies and bet pitches show a `CocAttachButton` "+" button.
- Clicking "Share" or the "+" attach button adds the block as a context ref chip in the CoC overlay composer.
- Messages with block refs render the referenced block's content as an inline embed card in the thread.
- When a referenced block no longer exists (source body was edited), the embed renders a "source changed" indicator instead of crashing.

**Validation scenarios.**
- Given the CoC overlay is open and a knowledge item is visible, when the user hovers a paragraph block, then a "+" attach button appears. Clicking it adds a chip "block: <excerpt>" to the CoC composer. Sending a message includes the block ref in `refs[]`.
- Given a message in the CoC thread has a block ref pointing to a live block, when the thread renders, then the block's content appears as an inline embed card below the message text.
- Given a message has a block ref and the source knowledge item's body was edited (block content changed, blockId no longer matches), when the thread renders, then the embed shows "Source changed" instead of the block content.
- Given the user opens the block actions popover on a bet pitch block, when they click "Share", then the CoC overlay opens (or focuses if already open) with the block pre-attached as a context ref.

**Plan calls.** Standard architecture pass — InlineRef discriminated union, Zod schema update, CocContextRef extension, BlockRefEmbed rendering component, resolution logic (fetch body → derive → find block).

**Contracts / constraints.**
- Block refs carry the full `(blockId, hostKind, hostId)` triple. A ref with `kind: "block"` and only an `id` is invalid.
- `InlineRef.kind` is a closed enum. Adding `block` is authorized by the editing-experience concept doc.
- Block refs are immutable after message persistence (L1 payload immutability contract).
- Resolution is client-side at render time. No server-side pre-resolution or caching.
- Access control: if you can read the message, you can see the embedded block content.

**Out of scope.**
- Paste-to-embed (paste a block permalink into any thread composer → auto-expand). Deferred.
- Block references on non-plain message types (review, questionnaire, verdict).
- L24 linking primitive (inline wiki-links within markdown). Separate concern, deferred.

**Effort.** M (~6h)

---

### T5 — Block Discussion Completion

**Workpackage.** As a human discussing a specific block on a knowledge item or bet pitch, I want anchored messages to persist their block association durably and degrade gracefully when the source block changes — so that per-block discussions remain navigable and honest even as the document evolves.

**Depends on.** None. The L18 UI wiring (Discuss action, prefill chip, blockId on payload) is already built and working. This workpackage completes the data-layer gaps.

**Complexity.** M

**Acceptance criteria.**
- Block-anchored messages persist `blockId` in a structured, queryable field — not only inside the opaque JSON payload.
- When a block's content changes (blockId no longer resolves to a derived block in the host body), messages anchored to that blockId show an "anchor lost" indicator.
- The "anchor lost" indicator is honest: it does not distinguish between "block deleted" and "block edited" — both produce the same signal.
- Anchored messages outlive their block — they are never deleted when a block disappears.
- Thread rendering can filter to show only messages for a specific block (block-scoped thread view).

**Validation scenarios.**
- Given a user posts a message via "Discuss" on a block with blockId "abc123", when the message is persisted, then `blockId = "abc123"` is queryable on the message row (not only buried in the JSON payload).
- Given a knowledge item has a block-anchored message and the user edits the paragraph's content, when the page re-renders, then the anchored message shows "anchor lost" (blockId no longer matches any derived block).
- Given a block has 3 anchored messages and the block is deleted (heading removed from body), when the thread renders, then all 3 messages remain visible with "anchor lost" indicators.
- Given a thread has 5 messages (2 anchored to block A, 1 anchored to block B, 2 unanchored), when the user views block A's discussion, then only the 2 messages for block A are shown.

**Plan calls.** Standard architecture pass — message schema migration (add blockId column), backfill from existing payload JSON, anchor-lost detection logic (compare message.blockId against deriveBlocks output), filtered thread query.

**Contracts / constraints.**
- The `blockId` column is additive — existing message rows without blockId are unaffected.
- The "anchor lost" indicator is a render-time derivation (compare stored blockId against current deriveBlocks output). No background job.
- Forward migration only. No rollback of the blockId column.
- L1 Thread primitive is unchanged — blockId is message-level metadata, not thread-level.

**Out of scope.**
- Thread-level attachment kind `"block"` (the L1 closed enum extension). That's a separate concept-level change.
- Cross-entity block references (that's T4).
- Notion-like editor (that's T1-T3).

**Effort.** M (~4h)
