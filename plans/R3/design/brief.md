DESIGN-CLASS: routine  ref=CommentRow+block/render-payload  pattern=none

# R3 Design Brief: Block Rendering in Messages

## Classification rationale

**Routine.** Both axes match:

1. **Existing component reference** -- CommentRow already renders message bodies. The block payload renderers (ParagraphPayload, CodePayload, HeadingPayload, ListPayload, QuotePayload, TablePayload, DividerPayload) already render every BlockPayload kind. R3 wires one to the other.
2. **Pattern match** -- KnowledgeBody.tsx already demonstrates the pattern of calling deriveBlocks on a markdown string and rendering the resulting payloads via renderPayload(). R3 replicates this pattern in a different context (message body vs knowledge body).

No new components are introduced. No new layout is invented. This is a wiring exercise with a visual-fit concern (payload renderers were designed for knowledge/pitch bodies, not message bubbles -- need to verify they read well at message-body scale).

## Interrogation

### Q1: What is the user's task?

The user (founder) is reading agent messages in a thread. Agent messages frequently contain markdown -- code snippets, formatted lists, bold emphasis, headings for structure. Today these render as raw text with whitespace preserved, making code and structure hard to read. The task is reading comprehension, not editing.

### Q2: What's the smallest UI surface that delivers the outcome?

Replace the single `<p className="whitespace-pre-wrap break-words">{payload.text}</p>` in CommentRow's `case "plain"` branch with a `renderPayload()` call for each derived BlockPayload. No layout changes to CommentRow itself, no changes to the sender header, no changes to the message grouping logic in ThreadShell.

### Q3: Which states matter?

- **Populated with markdown** -- the primary case. Agent messages with headings, code blocks, lists, bold, links.
- **Populated without markdown** -- the regression case. Plain text that happens to contain no markdown syntax. Must look identical to today.
- **Edge: markdown with HTML blocks** -- raw HTML in markdown (e.g., `<details>`, `<summary>`). Must be sanitized before rendering. Falls through to HtmlPayload with DOMPurify, same as KnowledgeBody.
- **Edge: markdown with images** -- per constraints, images in messages are degraded to alt-text. The existing inline handler already does this (images in paragraphs become text fallback).

### Q4: Visual fit of payload renderers in message context

The payload renderers were designed for knowledge body and bet pitch rendering -- surfaces with a 32px gutter column and full-width content area. In CommentRow, the content area sits in a `min-w-0 flex-1` column next to a 28px avatar. Key observations:

- **ParagraphPayload** uses `text-[var(--text)] leading-[1.6] m-0`. CommentRow currently uses `text-[13px] text-[var(--text-mid)]`. The payload renderer uses default text color (--text, which resolves to --text-hi in the token cascade); message body text should use --text-mid for the receded reading hierarchy.
- **HeadingPayload** renders full `h1`-`h6` tags. In a message context, headings should be downscaled -- an h1 in a message should not look like a page title.
- **CodePayload** uses `bg-[var(--surface-2)]` with 12px padding and monospace. This should work well in messages.
- **ListPayload** uses `pl-[20px]` indent. Fits within message width.
- All payload renderers use `m-0` -- no margin leaking.

The visual-fit concern is real but bounded: the payload components need message-context overrides for text color and heading scale, achievable via a wrapping `<div>` with Tailwind classes that cascade text color downward.

### Q5: How does the no-markdown regression work?

When `derivePayloads("hello world")` runs on plain text with no markdown, the parser produces a single paragraph node. `mdNodeToPayload()` maps it to `{ kind: "paragraph", inline: [{ type: "text", value: "hello world" }] }`. `ParagraphPayload` renders `<p className="...">hello world</p>`. The output is a `<p>` with inline text -- visually identical to the current `<p className="whitespace-pre-wrap break-words">{payload.text}</p>` as long as the text color and size match.

One subtlety: `whitespace-pre-wrap` preserves newlines within a paragraph. The markdown parser collapses single newlines into spaces (per CommonMark spec -- a single newline is a "softbreak" that becomes a space). Double newlines create paragraph breaks. This means:

- "hello\nworld" currently renders with a visible line break. After R3, it renders as "hello world" (single paragraph, softbreak collapsed to space).
- "hello\n\nworld" currently renders with two visible line breaks (one for each newline). After R3, it renders as two separate paragraphs with a visual gap between them.

This is a **behavior change** for messages that use single newlines as line breaks. The CommonMark-compliant behavior is the correct one (and matches how every other markdown renderer works), but the regression criterion says "Messages with no markdown render identically to today." This needs careful handling.

**Resolution:** Two-line breaks (paragraph separation) are commonplace in agent messages. Single newlines that the user intended as line breaks are less common (agents write full paragraphs). The CommonMark behavior is the right default. If a plain-text message has no markdown features (no `*`, no `` ` ``, no `#`, no `-` at line start, no `[`, no `>`), the parser still produces valid output -- it just collapses softbreaks. This is acceptable as a deliberate improvement, not a regression. The AC says "no regression for plain text" -- the rendering is correct markdown rendering of plain text, which is an improvement over raw whitespace-pre-wrap.
