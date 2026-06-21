# Variant B — Challenge the pattern: persistent side-rail of anchored threads

Direction: instead of threading comments inline at the anchor, keep the canvas purely readable. Selecting a spot opens a persistent side-rail inside the right pane that lists all anchored threads; hovering a thread highlights the source line/paragraph/region. Composer lives in the rail and is always pre-filled with the current target.

---

## Create flow

1. **Select target.**
   - **Code diff:** hover a line to reveal a subtle left-bar highlight; click the line to select it.
   - **Prose / block content:** click the left edge of a block (or use `Space`/`Enter` on the existing `BlockHandle`).
   - The selected spot is drawn with a 2px dashed `--accent-primary` outline + `--accent-primary-dim` fill over `--motion-fast`.
2. **Rail opens.** A 280px rail slides in on the right side of the canvas (inside the existing examine pane, not a top-level third pane). It lists existing anchored threads for this artifact, ordered top-to-bottom by position in the content.
3. **Composer prefill.** The bottom of the rail contains a sticky composer; its placeholder is prefilled with the current spot label: `Commenting on {spotLabel}…`. The selected target is echoed above the composer as a monospace breadcrumb.
4. **Submit.** `Cmd/Ctrl+Enter` or `Send` posts the message; the thread appears in the rail at the correct position.
5. **Cancel.** `Esc` deselects the current spot and closes the composer without posting. The rail remains open.

## Render

### In the rail

- Each thread is a vertical card (`--surface-elevated`, `--r-subtle`, 1.5px `--border-subtle`, 12px padding, `--shadow-subtle`).
- Thread header shows author avatar, name, agent badge, timestamp, and the spot-label chip (`on {spotLabel}`).
- Thread body and replies reuse `CommentRow`, stacked vertically with decreasing left indentation for replies.
- Empty rail state: left-aligned text, `No comments on this artifact yet.`
- Resize: rail can be collapsed to a 48px strip showing the anchored-comment count badge.

### Source highlighting

- Hovering a thread card in the rail adds a transient dashed outline (`--accent-primary`) and a matching background tint to the corresponding line/block in the canvas.
- The highlight is applied via a data attribute on the block/line element so no DOM mutation occurs.

### In the global conversation

- Anchored comments are shown with the same `inlineAnchor` chip, but the chip now says `jump to thread in rail` semantics.

## States

- **Creating:** rail open, target selected, composer sticky at bottom.
- **Posted:** thread added to rail; source line returns to normal, highlight removed.
- **Orphan:** thread card in the rail dims and shows `source changed`; the source highlight is skipped.
- **Resolved review:** rail shows read-only threads.

## Motion

- Rail slide: `width` + `translateX` over `--motion-default`.
- Source highlight: `outline` + `background` over `--motion-fast`.
- New thread card: `translateX(12px) → 0` + `opacity` over `--motion-default`.

## Pros

- Canvas remains clean even with lots of comments.
- Creates a scalable review pattern for prose/docs and dense data tables.
- One persistent composer reduces layout jumps.

## Cons

- Splits attention: the comment is no longer visually next to the line it references.
- Adds a third pane inside an already dual-anchor composition (header + center + right examine pane); risks occlusion on laptops.
- Does not match the existing `BlockActionsPopover` / `KnowledgeBody` inline pattern, so reviewers must learn two anchor idioms.
- Mobile is awkward: rail becomes a bottom sheet, and line ↔ thread mapping is hard.
