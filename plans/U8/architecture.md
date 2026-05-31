# U8 Architecture Plan: Tier 2 Composites Restyle

**Workpackage:** U8 — Design System Components: Tier 2 Composites Restyle
**Depends on:** U3 (tokens), U4 (DaisyUI theme), U7 (Tier 1 restyle) -- all merged
**Date:** 2026-05-31

---

## Scope

Restyle all Tier 2 composite components from Lucid tokens to Hearth tokens. Delete PitchCard. Update HTML reference files, stories, and tests. No behavioral changes, no prop changes, no new components.

**Token migration reference:** `plans/U8/design/variant-1.md` contains the canonical token mapping table and per-component Hearth treatment. The builder should use that document as the primary reference for every class string change.

---

## Files Changed

### Group 1: Card Components (BetCard, TaskCard)

#### `packages/design-system/src/BetCard.tsx`
**Token replacements:**
- `bg-[var(--surface-4)]` -> `bg-[var(--surface-elevated)]`
- `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]`
- `bg-[var(--surface-6)]` -> `bg-[var(--surface-container)]` (progress track)
- `bg-[var(--primary)]` -> `bg-[var(--status-success)]` (progress fill)
- `duration-[var(--motion-medium)]` -> `duration-[var(--motion-default)]`
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (progress count)
- `text-[var(--text-hi)]` -> `text-[var(--text-primary)]` (lead avatar)
- `bg-[var(--surface-6)]` -> `bg-[var(--surface-container)]` (lead avatar bg)

**Structural additions:**
- Add `shadow-[var(--shadow-default)]` and `border border-[var(--border-subtle)]` to the outer div.
- Add `hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)] transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]` hover lift.

**Tests affected:** BetCard stories must render correctly. Snapshot tests checking class strings will need updating.

#### `packages/design-system/src/TaskCard.tsx`
**Token replacements:**
- `bg-[var(--surface-4)]` -> `bg-[var(--surface-elevated)]`
- `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]`
- `border-[var(--danger)]` -> `border-[var(--status-error)]` (blocked state)
- `text-[var(--text-hi)]` -> `text-[var(--text-primary)]` (title, owner)

**Structural additions:**
- Add `shadow-[var(--shadow-default)]` and `border border-[var(--border-subtle)]` to the outer div.
- Add `hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)] transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]` hover lift.

**Tests affected:** Story file update for visual verification.

---

### Group 2: Row Components (ThreadRow, KnowledgeRow, NotificationRow)

#### `packages/design-system/src/ThreadRow.tsx`
**Token replacements:**
- `rounded-[var(--r1)]` -> `rounded-[var(--r-subtle)]`
- `hover:bg-[var(--surface-4)]` -> `hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]`
- `border-[var(--primary)]` -> `border-[var(--accent-primary)]` (selected border)
- `border-[var(--danger)]` -> `border-[var(--status-error)]` (blocking border)
- `outline-[var(--primary)]` -> `outline-[var(--accent-primary)]` (focus ring)
- `bg-[var(--surface-4)]` -> `bg-[var(--surface-elevated)]` (selected state, initials chip bg)
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (initials, pin icon, snippet, host pill text)
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (timestamp)
- `bg-[var(--surface-ghost)]` -> `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]` (host pill bg)

**Structural additions:**
- Add unread dot: when `unread=true`, render a 6px `bg-[var(--status-success)]` dot before the title.

**Tests affected:** Any test checking for specific class strings or asserting unread visual indicator.

#### `packages/design-system/src/KnowledgeRow.tsx`
**Token replacements:**
- `rounded-[var(--r1)]` -> `rounded-[var(--r-subtle)]`
- `hover:bg-[var(--surface-4)]` -> `hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]`
- `outline-[var(--primary)]` -> `outline-[var(--accent-primary)]` (focus ring)
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (signals, timestamp)
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (caption)
- `font-heading` -> remove (factory mode title uses `font-bold` with default sans)
- `bg-[var(--surface-ghost)]` -> `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]` (version pill)
- `font-[var(--mono)]` -> `font-[family-name:var(--font-mono)]` (signal values -- normalize to Hearth pattern)

**Tests affected:** `KnowledgeRow.signals.test.tsx` -- verify signal rendering still works. Factory mode test assertions for `font-heading` class need updating.

#### `packages/design-system/src/NotificationRow.tsx`
**Token replacements:**
- `rounded-[var(--r1)]` -> `rounded-[var(--r-subtle)]`
- `hover:bg-[var(--surface-4)]` -> `hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]`
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (timestamp)

**Structural additions:**
- Add colored left border: `border-l-[3px]` with color derived from severity prop via a severity-to-border-color mapping function.
- Add icon circle: before StatusChip, render a 24px circle with `bg-[color-mix(in_oklab,<status-color>_14%,transparent)]` using the same status color as the severity.

**Tests affected:** Story file and any tests checking DOM structure for the new border/icon elements.

---

### Group 3: Thread Components (CommentRow, Composer, ThreadHostBanner, ThreadShell)

#### `packages/design-system/src/CommentRow.tsx`
**Token replacements:**
- `bg-[var(--surface-2)]` -> `bg-[var(--surface-container)]` (avatar circle)
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (avatar, role, verdict note, redacted, inline anchor label)
- `text-[var(--text-hi)]` -> `text-[var(--text-primary)]` (sender name)
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (body text, verdict label, inline anchor highlight)

**Tests affected:** Story file updates.

#### `packages/design-system/src/Composer.tsx`
**Token replacements:**
- `bg-[var(--surface-1)]` -> `bg-[var(--surface-container)]` (container)
- `bg-[var(--surface-2)]` -> `bg-[var(--surface-elevated)]` (textarea)
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (textarea text)
- `placeholder:text-[var(--text-lo)]` -> `placeholder:text-[var(--text-placeholder)]` (placeholder)
- `rounded-[var(--r1)]` -> `rounded-[var(--r-subtle)]` (textarea, focus ring)
- `focus:border-[var(--accent)]` -> `focus:border-[var(--accent-primary)]` (textarea focus)
- `outline-[var(--accent)]` -> `outline-[var(--accent-primary)]` (focus rings)
- `bg-[var(--accent)]` -> `bg-[var(--accent-primary)]` (send button)
- `text-[var(--accent-on)]` -> `text-[var(--text-on-accent)]` (send button text)
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (cmd+enter hint)
- `text-[var(--danger)]` -> `text-[var(--status-error)]` (error message)

**Structural changes:**
- Send button: `rounded-[var(--r-pill)]` (pill-shaped per AC), add `hover:bg-[var(--accent-primary-hover)]`.
- Textarea: add `focus:shadow-[0_0_0_3px_var(--accent-primary-dim)]` focus ring.
- Unresolved review link: `text-[var(--accent-primary)]` and focus ring `outline-[var(--accent-primary)]`.

**Tests affected:** Story file updates.

#### `packages/design-system/src/ThreadHostBanner.tsx`
**Token replacements:**
- `bg-[var(--surface-1)]` -> `bg-[var(--surface-container)]`
- `text-[var(--text-hi)]` -> `text-[var(--text-primary)]` (host title)
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (pin icon, avatar text)
- `bg-[var(--surface-2)]` -> `bg-[var(--surface-elevated)]` (participant avatars)

**Tests affected:** Story file updates.

#### `packages/design-system/src/ThreadShell.tsx`
**Token replacements:**
- `bg-[var(--surface-1)]` -> `bg-[var(--surface-elevated)]` (shell container)
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (rich slot labels)
- `bg-[color-mix(in_oklab,var(--primary)_18%,transparent)]` -> `bg-[var(--accent-primary-dim)]` (tag pills)
- `text-[var(--primary)]` -> `text-[var(--accent-primary)]` (tag pill text)
- `text-[var(--text-hi)]` -> `text-[var(--text-primary)]` (rich slot titles)
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (rich slot reasoning, questionnaire text, disabled button text)
- `rounded-[var(--r1)]` -> `rounded-[var(--r-subtle)]` (disabled questionnaire buttons)

**Tests affected:** Story file updates.

---

### Group 4: RichMessageCard

#### `packages/design-system/src/RichMessageCard.tsx`
**Token replacements (extensive -- largest component):**
- `bg-[var(--surface-0)]` -> `bg-[var(--surface-page)]` (primary button text background)
- `text-[var(--surface-0)]` -> `text-[var(--text-on-accent)]` (primary button text)
- `bg-[var(--primary)]` -> `bg-[var(--accent-primary)]` (primary button bg)
- `text-[var(--danger)]` -> `text-[var(--status-error)]` (danger button, error text)
- `var(--danger)` -> `var(--status-error)` in color-mix expressions
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (ghost button, meta text, reasoning)
- `text-[var(--text-hi)]` -> `text-[var(--text-primary)]` (title, sender name)
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (role, resolved actor, timestamp, re-expand button)
- `bg-[var(--surface-2)]` -> `bg-[var(--surface-elevated)]` (card bg, action footers)
- `bg-[var(--surface-3)]` -> `bg-[var(--surface-container)]` (reasoning toggle bg)
- `bg-[var(--surface-4)]` -> `bg-[var(--surface-elevated)]` (reasoning toggle hover)
- `hover:bg-[var(--surface-ghost)]` -> `hover:bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]` (ghost button hover)
- `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]` (card, resolved view)
- `rounded-[var(--r1)]` -> `rounded-[var(--r-subtle)]` (buttons, reasoning toggle)
- `outline-[var(--primary)]` -> `outline-[var(--accent-primary)]` (focus rings)
- `border-l-[var(--danger)]` -> `border-l-[var(--status-error)]` (blocking border)
- `var(--motion-medium)` -> `var(--motion-default)` (chevron transition)
- `bg-[color-mix(in_oklab,var(--primary)_18%,transparent)]` -> `bg-[var(--accent-primary-dim)]` (tag pills)
- `text-[var(--primary)]` -> `text-[var(--accent-primary)]` (tag pill text)
- `text-[var(--ok)]` -> `text-[var(--status-success)]` (resolved verdict label)
- `bg-[var(--surface-ghost)]` -> `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]` (resolved pill)

**Structural additions:**
- Action toolbar idle state: add subtle green tint `bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]`.

**Tests affected:** Story file and any RichMessageCard-specific tests.

---

### Group 5: Block and Payloads

#### `packages/design-system/src/Block.tsx`
**Token replacements:**
- `outline-[var(--primary)]` -> `outline-[var(--accent-primary)]`
- `hover:bg-[var(--surface-ghost)]` -> `hover:bg-[color-mix(in_oklab,var(--text-secondary)_4%,transparent)]`

**Tests affected:** `Block.test.tsx`, `Block.contrast.test.tsx`

#### `packages/design-system/src/block/CodePayload.tsx`
**Token replacements:**
- `bg-[var(--surface-2)]` -> `bg-[var(--surface-container)]`
- `text-[var(--text)]` -> `text-[var(--text-primary)]`
- `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]`
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (language label)
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (expand button)
- `outline-[var(--primary)]` -> `outline-[var(--accent-primary)]` (expand button focus)
- `rounded-[var(--r1)]` -> `rounded-[var(--r-subtle)]` (expand button)

#### `packages/design-system/src/block/TablePayload.tsx`
**Token replacements:**
- `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]`
- `bg-[var(--surface-3)]` -> `bg-[var(--surface-container)]` (thead)
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (th text)

#### `packages/design-system/src/block/HeadingPayload.tsx`
**Token replacements:**
- `font-heading` -> remove entirely (use default sans)
- `text-[var(--text-strong)]` -> `text-[var(--text-primary)]`

**Structural changes:**
- Add level-based font sizing per Hearth type scale. The heading should use appropriate size classes based on level (h1 -> `text-[var(--density-text-h1)]`, h2 -> `text-[var(--density-text-h2)]`, h3+ -> fixed sizes from Hearth scale).

#### `packages/design-system/src/block/QuotePayload.tsx`
**Token replacements:**
- `border-[var(--border-emphasis)]` -> `border-[var(--border-strong)]`
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]`

#### `packages/design-system/src/block/ParagraphPayload.tsx`
**Token replacements:**
- `text-[var(--text)]` -> `text-[var(--text-primary)]`

#### `packages/design-system/src/block/ListPayload.tsx`
**Token replacements:**
- `text-[var(--text)]` -> `text-[var(--text-primary)]`

#### `packages/design-system/src/block/ImagePayload.tsx`
**Token replacements:**
- `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]` (figure, zoom button)
- `bg-[color-mix(in_oklab,var(--surface-0)_75%,transparent)]` -> `bg-[color-mix(in_oklab,var(--surface-page)_75%,transparent)]` (zoom button)
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (zoom button)
- `outline-[var(--primary)]` -> `outline-[var(--accent-primary)]` (zoom focus ring)
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (figcaption)

#### `packages/design-system/src/block/HtmlPayload.tsx`
**Token replacements:**
- `bg-[var(--surface-2)]` -> `bg-[var(--surface-container)]`
- `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]`

#### `packages/design-system/src/block/UnknownPayload.tsx`
**Token replacements:**
- `border-[var(--warn)]` -> `border-[var(--status-warning)]`
- `bg-[color-mix(in_oklab,var(--warn)_15%,var(--surface-1))]` -> `bg-[color-mix(in_oklab,var(--status-warning)_15%,var(--surface-container))]`
- `text-[var(--warn)]` -> `text-[var(--status-warning)]`
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (description, pre text)
- `bg-[var(--surface-2)]` -> `bg-[var(--surface-container)]` (pre bg)
- `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]` (pre)

#### `packages/design-system/src/block/inline.tsx`
**Token replacements:**
- `text-[var(--text-strong)]` -> `text-[var(--text-primary)]` (strong)
- `rounded-[var(--r1)]` -> `rounded-[var(--r-subtle)]` (inline code)
- `bg-[var(--surface-2)]` -> `bg-[var(--surface-container)]` (inline code bg)
- `text-[var(--text)]` -> `text-[var(--text-primary)]` (inline code text)
- `text-[var(--primary)]` -> `text-[var(--accent-primary)]` (links)

---

### Group 6: Artifact Family

#### `packages/design-system/src/ArtifactCostChip.tsx`
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]`
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]`

#### `packages/design-system/src/ArtifactEmbed.tsx`
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (identity bar, dots)
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (view text)
- `text-[var(--text-hi)]` -> `text-[var(--text-primary)]` (arrow hover)
- `outline-[var(--primary)]` -> `outline-[var(--accent-primary)]` (focus ring)

#### `packages/design-system/src/ArtifactGalleryCard.tsx`
- `bg-[var(--surface-4)]` -> `bg-[var(--surface-elevated)]`
- `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]`
- `hover:bg-[var(--surface-5)]` -> `hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)]` (card lift)
- `outline-[var(--primary)]` -> `outline-[var(--accent-primary)]`
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (header, footer)
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (dots)
- `text-[var(--text-hi)]` -> `text-[var(--text-primary)]` (title)
- `bg-[var(--surface-ghost)]` -> `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]` (pill)
- Add `shadow-[var(--shadow-default)]` and `border border-[var(--border-subtle)]`.
- Add `transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]`.

#### `packages/design-system/src/ArtifactKindBadge.tsx`
- `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]`
- `bg-[var(--surface-ghost)]` -> `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]`
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]`

#### `packages/design-system/src/ArtifactPreview.tsx`
- `bg-[var(--surface-3)]` -> `bg-[var(--surface-container)]`
- `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]`
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (meta)
- `text-[var(--text-hi)]` -> `text-[var(--text-primary)]` (title)
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (dots, id)
- `bg-[var(--surface-2)]` -> `bg-[var(--surface-elevated)]` (discussion)
- `rounded-[var(--r1)]` -> `rounded-[var(--r-subtle)]` (discussion)

#### `packages/design-system/src/ArtifactPreviewSurface.tsx`
- `bg-[var(--surface-3)]` -> `bg-[var(--surface-container)]`
- `rounded-[var(--r1)]` -> `rounded-[var(--r-subtle)]`
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]`

#### `packages/design-system/src/ArtifactStackItem.tsx`
- `hover:bg-[var(--surface-4)]` -> `hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]`
- `outline-[var(--primary)]` -> `outline-[var(--accent-primary)]`
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (task, right meta)
- `text-[var(--text-hi)]` -> `text-[var(--text-primary)]` (title)
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (dot separator)
- `bg-[var(--surface-ghost)]` -> `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]` (pill)

#### `packages/design-system/src/ArtifactTimestamp.tsx`
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]`

---

### Group 7: Body Editor

#### `packages/design-system/src/body-editor/floating-toolbar.tsx`
- `bg-[var(--primary-dim)]` -> `bg-[var(--accent-primary-dim)]` (active button)
- `text-[var(--primary)]` -> `text-[var(--accent-primary)]` (active button text)
- `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]` (inactive button)
- `hover:bg-[var(--surface-ghost)]` -> `hover:bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]`
- `bg-[var(--surface-2)]` -> `bg-[var(--surface-elevated)]` (toolbar bg)
- `rounded-[var(--r1)]` -> `rounded-[var(--r-subtle)]` (toolbar, buttons)
- `shadow-[var(--float)]` -> `shadow-[var(--shadow-elevated)]`

#### `packages/design-system/src/body-editor/slash-menu.tsx`
- `bg-[var(--surface-2)]` -> `bg-[var(--surface-elevated)]` (dropdown bg)
- `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]` (dropdown)
- `shadow-[var(--float)]` -> `shadow-[var(--shadow-elevated)]`
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (no results, description)
- `text-[var(--text-hi)]` -> `text-[var(--text-primary)]` (item title)
- `bg-[var(--surface-ghost)]` -> `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]` (selected/hover)

---

### Group 8: BlockActionsPopover

#### `packages/design-system/src/BlockActionsPopover.tsx`
- `bg-[var(--surface-1)]` -> `bg-[var(--surface-elevated)]`
- `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]`
- `shadow-lg` -> `shadow-[var(--shadow-elevated)]`
- `rounded-[var(--r1)]` -> `rounded-[var(--r-subtle)]` (menu items)
- `hover:bg-[var(--surface-ghost)]` -> `hover:bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]`
- `outline-[var(--primary)]` -> `outline-[var(--accent-primary)]`
- `text-[var(--text)]` -> `text-[var(--text-primary)]` (menu item text)
- `color: "var(--ok)"` -> `color: "var(--status-success)"` (copied state)
- `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]` (shortcut text)

**Tests affected:** `BlockActionsPopover.test.tsx`

---

### Group 9: PitchCard Deletion

#### Delete files:
- `packages/design-system/src/PitchCard.tsx`
- `packages/design-system/src/PitchCard.stories.tsx`
- `packages/design-system/html/PitchCard.html`

#### Update:
- `packages/design-system/src/index.ts` -- remove `PitchCard` and `PitchCardProps` exports (lines 57-58).

**Verification:** `grep -rn "PitchCard" packages/` should show zero results in production code (only in git history or plan docs).

---

### Group 10: HTML Reference Files

Every HTML file in `packages/design-system/html/` for Tier 2 components must be updated to match the new Hearth styling. The HTML files are the design reference (per `.claude/rules/visual-parity.md`), so the TSX must match the HTML pixel-for-pixel.

**Files to update:**
- `html/BetCard.html`
- `html/ThreadRow.html`
- `html/TaskCard.html`
- `html/KnowledgeRow.html`
- `html/CommentRow.html`
- `html/Composer.html`
- `html/RichMessageCard.html`
- `html/NotificationRow.html`
- `html/ThreadHostBanner.html`
- `html/ThreadShell.html`
- `html/Block.html`
- `html/ArtifactEmbed.html`
- `html/ArtifactGalleryCard.html`
- `html/ArtifactKindBadge.html`
- `html/ArtifactPreview.html`
- `html/ArtifactPreviewSurface.html`
- `html/ArtifactStackItem.html`
- `html/ArtifactTimestamp.html`
- `html/ArtifactCostChip.html`
- `html/BlockActionsPopover.html`
- `html/BlockHandle.html` (if it has old tokens)

**Delete:** `html/PitchCard.html`

The HTML updates mirror the exact same token replacements as the TSX. Use the Hearth theme CSS (`html/themes/hearth-light.css`, `html/themes/hearth-dark.css`) for the HTML files.

---

### Group 11: Stories

Every `.stories.tsx` file for the affected components needs updating. Most stories should work after the TSX restyle since they just render the component with props. If any story uses inline styles with old tokens, those must be updated.

**Files:**
- `BetCard.stories.tsx`
- `ThreadRow.stories.tsx`
- `TaskCard.stories.tsx`
- `KnowledgeRow.stories.tsx`
- `CommentRow.stories.tsx`
- `Composer.stories.tsx`
- `RichMessageCard.stories.tsx`
- `NotificationRow.stories.tsx`
- `ThreadHostBanner.stories.tsx`
- `ThreadShell.stories.tsx`
- `Block.stories.tsx`
- All Artifact stories
- `BlockActionsPopover.stories.tsx`
- `BlockHandle.stories.tsx`

---

### Group 12: Tests

**Tests that assert specific class strings or tokens (must update):**
- `__tests__/Block.test.tsx` -- may check for `--primary` or `--surface-ghost`
- `__tests__/Block.contrast.test.tsx` -- checks contrast ratios against token values
- `__tests__/BlockActionsPopover.test.tsx` -- may check for `--ok`, `--primary`
- `__tests__/ArtifactGalleryCard.test.tsx` -- may check class strings
- `__tests__/ArtifactPreviewSurface.test.tsx` -- may check class strings
- `__tests__/ArtifactPreview.test.tsx` -- may check class strings
- `__tests__/ArtifactEmbed.test.tsx` -- may check class strings
- `__tests__/ArtifactCostChip.test.tsx`
- `__tests__/ArtifactKindBadge.test.tsx`
- `__tests__/ArtifactStackItem.test.tsx`
- `__tests__/ArtifactTimestamp.test.tsx`
- `__tests__/KnowledgeRow.signals.test.tsx`
- `__tests__/BlockHandle.test.tsx`
- `__tests__/BodyEditor.test.tsx`
- `__tests__/html-components.test.ts` -- validates HTML reference files exist and are well-formed
- `__tests__/html-components-block.test.ts`
- `__tests__/visual-regression.test.ts` -- visual regression baselines need re-capture
- `__tests__/themes.test.ts` -- may check theme-specific token values

**Strategy:** Run tests after each group of changes. Fix failures caused by old token references in assertions. Do NOT change test behavioral assertions -- only token/class references.

---

## Task Ordering

The builder should proceed in this order to maintain a compilable state throughout:

1. **Delete PitchCard** (Group 9) -- removes dead code first. Update `index.ts`.
2. **Block payloads** (Group 5, sub-components) -- leaf components with no dependencies.
3. **Block.tsx** (Group 5, main) -- depends on payloads.
4. **Artifact sub-primitives** (ArtifactCostChip, ArtifactKindBadge, ArtifactTimestamp, ArtifactPreviewSurface) -- leaf artifact components.
5. **Artifact composites** (ArtifactEmbed, ArtifactGalleryCard, ArtifactPreview, ArtifactStackItem) -- compose artifact sub-primitives.
6. **Body editor** (floating-toolbar, slash-menu) -- isolated overlay components.
7. **BlockActionsPopover** (Group 8) -- isolated popover.
8. **Row components** (ThreadRow, KnowledgeRow, NotificationRow) -- independent row components.
9. **Card components** (BetCard, TaskCard) -- independent card components.
10. **Thread components** (CommentRow, Composer, ThreadHostBanner) -- compose Tier 1 primitives.
11. **RichMessageCard** -- largest component, benefits from all other tokens being already migrated.
12. **ThreadShell** -- composes CommentRow, Composer, RichMessageCard, ThreadHostBanner.
13. **HTML reference files** (Group 10) -- update after TSX is done so they match.
14. **Stories** (Group 11) -- update after components and HTML.
15. **Tests** (Group 12) -- update assertions, re-capture visual baselines.
16. **Final verification** -- `npm run verify`.

---

## Risks and Mitigations

### Risk: `--surface-ghost` has no Hearth equivalent
**Mitigation:** Replace with `color-mix(in oklab, var(--text-secondary) 8%, transparent)`. This produces a transparent tint that adapts to both light and dark modes. Verified: in light mode, text-secondary (#6b5d4d) at 8% on white produces a subtle warm tint. In dark mode, text-secondary (#a89880) at 8% on dark surfaces produces a subtle warm tint.

### Risk: `--warn` token may not exist in Hearth
**Mitigation:** Replace with `--status-warning`. The `--warn` token was a Lucid-era alias. Verify it is not defined in the Hearth tokens.css -- confirmed not present. Use `--status-warning` (#d97706) directly.

### Risk: `font-heading` removal affects HeadingPayload size
**Mitigation:** HeadingPayload currently uses a single class for all heading levels. Add level-based sizing per Hearth type scale. The `font-heading` class was from Lucid's font family -- Hearth uses system-ui everywhere via `--font-sans`.

### Risk: `--float` shadow token may not exist in Hearth
**Mitigation:** Replace with `--shadow-elevated`. The `--float` token was a Lucid alias for floating surfaces (popovers, tooltips). Hearth uses `--shadow-elevated` for these surfaces.

### Risk: `--text` (unqualified) and `--text-strong` are Lucid tokens
**Mitigation:** Replace `--text` with `--text-primary` and `--text-strong` with `--text-primary` (with font-weight adjustments where needed).

### Risk: Some components use `border-l-2` which is 2px, but Hearth has `--bw-strong` at 2.5px
**Mitigation:** The visual difference between 2px and 2.5px is negligible. Use `border-l-[var(--bw-strong)]` for consistency with the Hearth token system, or keep `border-l-2` where the exact pixel value matters for layout. Decision: use `border-l-[var(--bw-strong)]` for semantic consistency.

---

## Verification Checklist

- [ ] `npm run check` -- zero type errors
- [ ] `npm run lint` -- zero lint errors
- [ ] `npm run test` -- all tests green
- [ ] `npm run test -- --all` -- full suite green
- [ ] No references to old tokens: `grep -rn 'surface-[0-6]\|surface-ghost\|text-hi\|text-mid\|text-lo\b\|text-strong\|--primary\b\|--danger\b\|--ok\b\|--warn\b\|--r0\b\|--r1\b\|--r2\b\|--r3\b\|--motion-medium\|--float\b\|font-heading\|--accent\b[^-]\|--accent-on\|--border-emphasis\|--primary-dim' packages/design-system/src/` returns zero matches in production code (excluding comments/lore that document the migration).
- [ ] PitchCard files deleted and removed from exports
- [ ] All HTML reference files updated
- [ ] All stories render correctly at `/designsystem`
- [ ] Both hearth-light and hearth-dark modes work
- [ ] `npm run verify` passes
