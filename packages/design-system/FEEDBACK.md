# Visual Design Feedback

Three ways to give Claude visual feedback on components, from easiest to most powerful.

---

## Option 1: Feedback Bookmarklet (Zero Install)

Built into this repo. Works on any page running in your browser.

### Setup

1. Start the design system server: `bun run ds:serve`
2. Create a bookmark in your browser with this URL:

```
javascript:void(fetch('http://localhost:8098/feedback.js').then(r=>r.text()).then(s=>eval(s)))
```

3. Navigate to any HyperIdle page (e.g., `localhost:5173/designsystem`)
4. Click the bookmarklet

### Usage

- **Select:** Click any element — it highlights with a blue outline
- **Inspect:** The panel shows the CSS selector, component name, and tier
- **Comment:** Type what should change in the textarea
- **Tweak:** Edit CSS properties live (font-size, padding, color, etc.) — changes apply instantly
- **Annotate:** Click "Add Annotation" to save the feedback + tweaks
- **Repeat:** Select more elements, add more annotations
- **Export:** Click "Copy for Claude" — pastes structured markdown to clipboard
- **Paste** into Claude Code and it has: selector, component context, your feedback, CSS tweaks that worked, and current computed styles

### What Claude Gets

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
...
```

---

## Option 2: Vibe Annotations (Recommended for Heavy Use)

Chrome extension + MCP server. Same concept as the bookmarklet but with richer UI and direct MCP integration (Claude gets annotations automatically, no copy-paste).

### Setup

1. Install from [Chrome Web Store](https://chromewebstore.google.com/detail/vibe-annotations-visual-f/gkofobaeeepjopdpahbicefmljcmpeof)
2. Add MCP server to Claude Code:
   ```bash
   claude mcp add --transport http vibe-annotations http://127.0.0.1:3846/mcp
   ```
3. Click any element, annotate, tweak CSS — annotations flow to Claude via MCP

### Why Choose This

- No copy-paste needed — annotations are MCP tools Claude can query
- Zoned screenshots capture visual context automatically
- Supports up to 200 annotations at once
- Works with React, Vue, Angular, Svelte, any localhost server

---

## Option 3: MCP Pointer (Fastest Single-Element Feedback)

Chrome extension. Hold Option (Alt on Windows) + Click any element. Its selector, styles, and attributes are immediately available to Claude via MCP.

### Setup

1. Install [MCP Pointer](https://chromewebstore.google.com/detail/mcp-pointer/jfhgaembhafbffidedhpkmnaajdfeiok)
2. Add MCP server:
   ```bash
   claude mcp add mcp-pointer npx @mcp-pointer/server
   ```
3. Option+Click on any element — Claude sees it instantly

### Why Choose This

- Fastest possible feedback loop (one click)
- No UI overlay — just a click and talk to Claude
- Detects React component names via Fiber
- Configurable CSS depth (0-3)

---

## Tips for Effective Visual Feedback

1. **Be specific.** "Make this bigger" is okay. "Title font-size should be 16px instead of 14px" is better.
2. **Use the CSS tweaks.** When you can tweak a property live and it looks right, the exact value is captured — Claude can apply it precisely.
3. **Reference the design system.** "This should use --text-hi instead of --text-mid" is actionable.
4. **Annotate the component, not a leaf element.** Click the card, not the text inside it. The component context (name, tier, composition) helps Claude find the right file.
5. **Batch your feedback.** Collect 3-5 annotations, then paste them all at once. Claude can address them as a set.
