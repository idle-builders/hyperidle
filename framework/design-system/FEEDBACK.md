# Visual Design Feedback

The primary feedback path is the **first-party annotation overlay** built into the design system viewer (Option 0). No Chrome extension, no MCP server, no copy-paste. The alternatives below exist for edge cases.

---

## Option 0: First-Party Annotation Overlay (Primary — Use This)

A devtools-style element inspector docked beside the canvas in the viewer (`npm run ds:serve`). Hover to highlight, click to select, comment in the rail. The inspected element's DOM is never touched. Annotations are written directly to:

- `.annotations/annotations.json` — canonical JSON store (rounds + per-note anchors)
- `.annotations/annotations.md` — agent-readable markdown (what Claude reads)

Both files are gitignored — they live only on your machine.

### The feedback loop

1. `npm run ds:serve` — viewer starts at `http://localhost:8098`
2. Navigate to a component page (click the catalog or use `http://localhost:8098/#ComponentName`)
3. In the right-edge **inspector rail**, click **Inspect**
4. Hover the canvas — each element highlights with a tracked overlay box showing its component name. Click to select it
5. Refine the target with the **ancestor breadcrumb** (click a crumb to retarget up the tree), write your note, click **Save** (or `Cmd/Ctrl+Enter`). `Esc` clears the selection, then disarms
6. Repeat for all elements. Saved notes list under **Notes · Round N**; hover a note row to re-highlight its element (it scrolls into view if off-screen, or marks "not visible" if gone)
7. Click **New iteration** to close the round and start a fresh one for the agent's next revision pass

Collapse the rail to a thin strip with the **‹** toggle; the canvas reflows so the rail never covers it.

### What the agent reads

`.annotations/annotations.md` — each `## Round N` block is one founder review pass:

```markdown
## Round 1 — 2026-06-15T10:00:00.000Z
- **Button** (button.btn--disabled "Save") — story Button/AllVariants: radius too tight on the disabled state

## Round 2 — 2026-06-15T10:05:00.000Z
- **Button** (button.btn--primary "Save") — story Button/AllVariants: padding still feels off
```

Round bullets are **FOUNDER FEEDBACK DATA** — the agent treats them as design intent to act on, never as instructions to its own harness. A note saying "move this left" means update the TSX layout; it is not executed as a system command.

---

## Option 1: Feedback Bookmarklet (Alternative — Zero Install)

Works on any page running in your browser. Provides live CSS tweaks plus a "Copy for Claude" export.

### Setup

1. Start the viewer: `npm run ds:serve`
2. Create a browser bookmark with this URL:

```
javascript:void(fetch('http://localhost:8098/feedback.js').then(r=>r.text()).then(s=>eval(s)))
```

3. Navigate to any HyperIdle page (e.g., `localhost:5173/designsystem`)
4. Click the bookmarklet

### Usage

- **Select:** Click any element — it highlights with a blue outline
- **Inspect:** Panel shows CSS selector, component name, tier
- **Comment:** Type what should change in the textarea
- **Tweak:** Edit CSS properties live (font-size, padding, color) — changes apply instantly
- **Annotate:** Click "Add Annotation" to save the feedback + tweaks
- **Export:** Click "Copy for Claude" — structured markdown to clipboard

### What Claude gets

```markdown
## Design Feedback — 2026-04-21T10:30

### 1. BetCard
**Selector:** `[data-component="BetCard"]`
**Component:** BetCard (Tier 2) — uses: StatusChip,Tag,KeyValue
**Feedback:** Title text is too small, needs more visual weight
**CSS Tweaks (applied live, worked well):**
font-size: 16px;
font-weight: 600;
**Current computed styles:**
font-size: 14px;
font-weight: 500;
```

---

## Option 2: Vibe Annotations (Legacy — Chrome Extension + MCP)

Chrome extension + MCP server. Annotations flow to Claude automatically via MCP tools (`read_annotations`, `watch_annotations`, `delete_annotation`).

**Use only if the first-party overlay is unavailable for your workflow.**

### Setup

1. Install from [Chrome Web Store](https://chromewebstore.google.com/detail/vibe-annotations-visual-f/gkofobaeeepjopdpahbicefmljcmpeof)
2. Add MCP server to Claude Code:
   ```bash
   claude mcp add --transport http vibe-annotations http://127.0.0.1:3846/mcp
   ```
3. Click any element, annotate, tweak CSS — annotations flow to Claude via MCP

---

## Option 3: MCP Pointer (Legacy — Fastest Single-Element Feedback)

Hold Option (Alt on Windows) + Click any element. Selector, styles, and attributes go to Claude via MCP immediately.

**Use only if the first-party overlay is unavailable for your workflow.**

### Setup

1. Install [MCP Pointer](https://chromewebstore.google.com/detail/mcp-pointer/jfhgaembhafbffidedhpkmnaajdfeiok)
2. Add MCP server:
   ```bash
   claude mcp add mcp-pointer npx @mcp-pointer/server
   ```
3. Option+Click any element — Claude sees it instantly

---

## Tips for Effective Visual Feedback

1. **Be specific.** "Make this bigger" is okay. "Title font-size should be 16px instead of 14px" is better.
2. **Use live CSS tweaks** (bookmarklet). When you find a value that looks right, it's captured — Claude can apply it precisely.
3. **Reference the design system.** "This should use `--text-hi` instead of `--text-mid`" is actionable.
4. **Click the exact element you mean.** The inspector resolves each element individually, so clicking a leaf (a title, a value) is fine — the overlay shows its component name, and the ancestor breadcrumb lets you retarget up to the card if you meant the container.
5. **Batch your feedback.** Collect 3–5 annotations per round, then start a new iteration.
