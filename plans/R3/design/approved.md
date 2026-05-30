# R3 Approved Design: Block Rendering in Messages

## Summary

Wire the existing block payload renderers into CommentRow's `case "plain"` branch. A new `derivePayloads()` function (shared package) parses markdown into `BlockPayload[]`. CommentRow renders each payload via the existing `renderPayload()` dispatch. A wrapping `<div>` provides message-context styling overrides (text color, heading scale, gap between payloads). No new custom components. No changes to CommentRow's outer structure (avatar, sender header, grouping).

---

## 1. User task

Founder reads agent messages in a thread. Agent messages contain markdown (code, lists, bold, headings). Today: raw text, hard to read. After R3: properly formatted content with code blocks visually distinct, bold/italic rendered, lists indented, links clickable.

---

## 2. Component composition

### Existing components used

| Component | Role | Props |
|---|---|---|
| `CommentRow` | Outer message container | Unchanged -- message, sender, showSenderHeader, etc. |
| `renderPayload()` | Per-payload-kind dispatch | `(payload: BlockPayload, sanitizeHtml?: fn)` |
| `ParagraphPayload` | Paragraph rendering | `inline: InlineNode[]` |
| `CodePayload` | Fenced code block | `lang, text` |
| `HeadingPayload` | Heading rendering | `level, inline` |
| `ListPayload` | List rendering | `ordered, start, items` |
| `QuotePayload` | Blockquote rendering | `children: BlockPayload[]` |
| `TablePayload` | Table rendering | `align, header, rows` |
| `DividerPayload` | Thematic break | (none) |
| `HtmlPayload` | Sanitized raw HTML | `raw, sanitizeHtml` |
| `UnknownPayload` | Unknown block fallback | `raw, reason` |
| `renderInline()` | Inline node tree | `InlineNode[]` |

### New function (not a component)

`derivePayloads(text: string): BlockPayload[]` -- pure function in `@hyperidle/shared`. Parses markdown via unified/remark-parse/remark-gfm, maps top-level mdast nodes to BlockPayload[] via the existing `mdNodeToPayload()` logic. No BlockId, no source, no anchor, no outline-path computation.

### Component budget impact

**Zero new custom components.** `derivePayloads` is a utility function in the shared package. The rendering uses existing payload components from the design system.

---

## 3. Information hierarchy in a rendered message

```
CommentRow (existing structure)
  [28px avatar or spacer] | [content column]
                            [sender header if showSenderHeader]
                            [message payloads]
                              <div class="message-payloads-wrapper">
                                renderPayload(payload[0])   -- e.g., ParagraphPayload
                                renderPayload(payload[1])   -- e.g., CodePayload
                                renderPayload(payload[2])   -- e.g., ParagraphPayload
                                ...
                              </div>
```

The wrapper `<div>` applies:
- `flex flex-col gap-[8px]` -- vertical layout with 8px gap between payload blocks
- `text-[13px] text-[var(--text-mid)]` -- message-context text color (--text-mid for body, matching current plain message styling)
- Heading scale override: headings in messages render at a reduced scale compared to knowledge/pitch bodies

### Heading treatment in messages

Headings in messages are structural markers, not page titles. Agent messages use `##` and `###` to organize long responses. In message context:

- All heading levels render as styled `<strong>` text within the message body at 13px, differentiated by weight and optional uppercase treatment rather than type-scale jumps. This prevents an h1 in a message from looking like a page title.
- Alternative considered: render h1 at 16px, h2 at 14px, h3 at 13px within messages. This creates a mini type scale inside each message, which competes with the page-level hierarchy.
- **Decision:** Use the existing HeadingPayload component as-is, but wrap the message payloads in a container with `[&_h1]:text-[14px] [&_h2]:text-[13px] [&_h3]:text-[13px] [&_h4]:text-[13px] [&_h5]:text-[13px] [&_h6]:text-[13px]` Tailwind child selectors. H1 gets 14px (one step above body), h2-h6 get body size (13px). All headings retain `font-heading` (Geist Mono, uppercase tracking) from HeadingPayload, which provides visual distinction without type-scale disruption.

### Text color cascade

The wrapper applies `text-[var(--text-mid)]` which cascades into ParagraphPayload, ListPayload, and other text-rendering payloads. This ensures message body text uses the message-body color (--text-mid) rather than the knowledge-body color (--text, which resolves to --text-hi).

Exceptions that override the cascade:
- HeadingPayload uses `text-[var(--text-strong)]` which is `--text-hi` -- headings in messages stand out, matching the existing heading component.
- CodePayload uses `text-[var(--text)]` on the `<pre>` -- code keeps its own color.
- Links via renderInline use `text-[var(--primary)]` -- links override the cascade.
- UnknownPayload uses `text-[var(--warn)]` / `text-[var(--text-mid)]` -- its own palette.

This cascade behavior is correct: message body text recedes (--text-mid), while code, headings, and links maintain their semantic colors.

---

## 4. States

### Populated with markdown (primary)

Agent message with fenced code, lists, bold text, headings:

```
[Avatar] sender-name . agent
         ## Summary                          <- heading, 13px, font-heading
                                             
         The analysis found **three issues** <- paragraph with bold
         in the configuration:               
                                             
         - Missing `API_KEY` env var         <- list with inline code
         - Timeout set to 0                  
         - No retry logic                    
                                             
         ```typescript                       <- code block, monospace, surface-2 bg
         const config = {                    
           timeout: 30000,                   
           retries: 3,                       
         };                                  
         ```                                 
                                             
         See the [docs](https://...)         <- paragraph with clickable link
```

Visual characteristics:
- Paragraphs: 13px, --text-mid color, leading-[1.6], no margin (payload components use m-0)
- 8px gap between payload blocks (the wrapper div's gap)
- Code blocks: monospace 12px, --surface-2 background, 12px padding, --r2 border radius
- Lists: 20px left indent, 13px text
- Bold: `font-semibold text-[var(--text-strong)]` (from inline.tsx strong rendering)
- Inline code: monospace 0.92em, 4px horizontal padding, --surface-2 background, --r1 radius
- Links: --primary color, underline, underline-offset-2

### Populated without markdown (regression case)

Plain text message with no markdown features:

```
[Avatar] sender-name . agent
         I've completed the task and everything looks good.
```

`derivePayloads("I've completed the task and everything looks good.")` produces:
- `[{ kind: "paragraph", inline: [{ type: "text", value: "I've completed the task and everything looks good." }] }]`

Rendered via ParagraphPayload: `<p class="text-[var(--text)] leading-[1.6] m-0">I've completed...</p>`

With the wrapper's `text-[var(--text-mid)]` cascade, the paragraph text color resolves to --text-mid. The visual output is a single `<p>` with 13px text in --text-mid -- identical to today's rendering.

### Edge: multiline plain text

```
Line one
Line two
```

Per CommonMark: single newlines are softbreaks, collapsed to spaces in output. Result: "Line one Line two" in a single paragraph. This differs from today's whitespace-pre-wrap behavior.

**Mitigation:** Agent messages are markdown. Treating single newlines as softbreaks is the correct CommonMark behavior. Agents that want line breaks use `\n\n` (paragraph break) or `  \n` (hard break via two trailing spaces). No special-casing needed.

### Edge: raw HTML in markdown

A message containing `<details><summary>Click</summary>Content</details>`:
- `derivePayloads()` maps this to `{ kind: "html", raw: "<details>..." }`
- `renderPayload()` calls `HtmlPayload` with the `sanitizeHtml` callback
- DOMPurify sanitizes the HTML before rendering via `dangerouslySetInnerHTML`
- If sanitization strips everything, falls through to `UnknownPayload` with reason "sanitiser-stripped"

### Edge: image in markdown

A message containing `![screenshot](https://example.com/img.png)`:
- If the image is the sole content of a paragraph, `mdNodeToPayload` produces `{ kind: "image", ... }`
- Per R3 constraints: no image rendering in messages
- **Decision:** Skip image payloads during message rendering. When the payload is `kind: "image"`, render the alt text as a paragraph instead. This is handled at the rendering layer (the wrapper component checks for image payloads and downgrades them).

---

## 5. Behavior

### Keyboard

No new keyboard interactions. Links are focusable and follow standard browser behavior (Enter to follow, Tab to traverse). Code blocks are not interactive (no copy button in v1).

### Focus

No focus management changes. CommentRow is not focusable (it's a list item in a scrolling container).

### Motion

No motion. Content renders statically. No expand/collapse animations on code blocks (CodePayload's expand/collapse for long code blocks already has no animation).

### Copy/paste

Rendered markdown content should copy as formatted text (browser default behavior for rendered HTML). Code blocks copy as plain text (browser default for `<pre><code>` content).

---

## 6. Mobile adaptation

No mobile-specific changes. CommentRow's existing responsive behavior applies. The payload renderers are already min-width-safe (CodePayload has `overflow-x-auto`, TablePayload has `overflow-x-auto` wrapper). The message content column has `min-w-0 flex-1` which prevents overflow.

---

## 7. Rejected directions

### A: Full Block component with gutter disabled

Use the `<Block>` component with `slots={undefined}` and no `onOpenActions`/`onCopyPermalink` handlers, effectively rendering it as a payload-only container.

**Rejected because:** Block renders a 2-column grid (32px gutter + content) even when the gutter is empty. This wastes 32px of horizontal space inside the already-constrained message column. Block also adds tabIndex=0 for keyboard block-stepping, which would make every payload block in every message tabbable -- a keyboard navigation hazard in a long thread. Block is for addressable, interactive content regions; message payloads are read-only display.

### B: Client-side markdown-to-HTML with dangerouslySetInnerHTML

Use a markdown-to-HTML library (e.g., remark + rehype + rehype-sanitize) to produce sanitized HTML and render via `dangerouslySetInnerHTML`.

**Rejected because:** (1) Adds new dependencies (rehype ecosystem). (2) Loses the typed BlockPayload intermediate representation. (3) Styling has to happen via global CSS on rendered HTML tags rather than through Tailwind-styled React components. (4) The existing payload renderers already solve this problem with better type safety and consistent design-system integration.

### C: New MessageBody component in the design system

Create a dedicated `MessageBody` component that wraps the parsing + rendering logic.

**Rejected because:** This is a wiring change inside CommentRow, not a reusable design-system primitive. A separate component would add to the component budget without serving a second consumer. If a second consumer appears (e.g., notification previews), the rendering logic can be extracted then. YAGNI applies.

---

## 8. Open questions for the architect

1. **derivePayloads extraction strategy** -- Factor `mdNodeToPayload` and the parser setup out of `deriveBlocks` into a shared internal module, then have both `deriveBlocks` and `derivePayloads` consume it? Or duplicate the parser setup in `derivePayloads` (it's ~5 lines)?

2. **sanitizeHtml injection** -- CommentRow is a design-system component (Tier 2). It cannot import DOMPurify directly (design-system is framework-host-agnostic). The `sanitizeHtml` callback needs to be passed from the web package, same pattern as KnowledgeBody. Where does this injection happen -- via CommentRow props, or via a wrapper component in the web package?

3. **Memoization** -- `derivePayloads` is pure and deterministic. Should the result be memoized in CommentRow via `useMemo`? Messages are immutable after persistence, so the payload.text never changes for a given message -- memoization is cheap and avoids re-parsing on every render.

4. **Image payload downgrade** -- Should `derivePayloads` itself skip image blocks (returning a text-fallback paragraph instead), or should the renderer handle this? The concept doc says "no image rendering in messages" but the boundary could live in either place.

---

## 9. Design critique (in-session, routine single-variant)

### Scoring

| Dimension | Score | Notes |
|---|---|---|
| Hierarchy | 8/10 | Message body text recedes (--text-mid), headings and code stand out. Clear reading order. |
| Spacing | 8/10 | 8px gap between payloads matches the CommentRow internal gap. No off-grid values. |
| Typography | 8/10 | 13px body matches existing messages. Headings scaled down to avoid page-level conflict. Monospace for code. |
| Color | 9/10 | All semantic tokens. No hardcoded colors. --text-mid cascade is correct. |
| Coherence | 9/10 | Same payload renderers as KnowledgeBody and BetPitch. Consistent visual language across surfaces. |
| States | 7/10 | Primary and regression cases covered. Image downgrade and HTML sanitization handled. No loading/error states needed (synchronous parsing). |
| A11y | 8/10 | Semantic HTML from payload renderers (h1-h6, ul/ol, blockquote, a with rel="noopener noreferrer"). Links are keyboard-accessible. |
| Anti-slop | 9/10 | No new components, no new patterns, no AI-aesthetic tells. Dense, purposeful rendering. |
| Premium polish | 7/10 | v1 -- no syntax highlighting, no code copy button, no collapsible sections. These are explicit non-goals. The rendering is correct and clean. |

**Overall: 8.1/10** -- Strong for a routine wiring exercise. The visual quality comes from reusing well-designed existing components.

### Concerns addressed

- **Heading scale in messages** -- Downscaled to 13-14px to avoid competing with page hierarchy. Uses Tailwind child selectors, not a new component.
- **Text color mismatch** -- Wrapper div cascades --text-mid. Verified that code, headings, and links override correctly.
- **Softbreak behavior change** -- Accepted as correct CommonMark behavior. Not a regression.
- **Image rendering** -- Explicitly downgraded to alt-text. Clear constraint boundary.
