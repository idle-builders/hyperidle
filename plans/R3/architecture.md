# R3 Architecture: Block Rendering in Messages

## Required reading

- `plans/R3/concept.md` -- concept decisions (messages are NOT block hosts)
- `plans/R3/design/approved.md` -- approved visual design
- `packages/shared/src/blocks/derive-blocks.ts` -- deriveBlocks implementation (source of mdNodeToPayload)
- `packages/design-system/src/CommentRow.tsx` -- current message rendering
- `packages/design-system/src/block/render-payload.tsx` -- payload dispatch function
- `packages/design-system/src/block/inline.tsx` -- inline node renderer
- `packages/web/src/pages/knowledge/KnowledgeBody.tsx` -- reference wiring pattern
- `packages/web/src/__tests__/CommentRow.test.tsx` -- existing CommentRow tests

---

## Phase 0 -- Interrogation

### Q1: Where does the parsing happen -- design-system or web?

**My read:** The design-system package (`@hyperidle/design-system`) already imports from `@hyperidle/shared` (CommentRow imports `Message`, `exhaustiveAssert`, `isRedactedPayload`, etc.). Adding an import of `derivePayloads` from `@hyperidle/shared` keeps the dependency direction clean (design-system -> shared). The parsing happens inside CommentRow itself, not in the web package. This avoids adding a new prop or injection point.

**Decision:** CommentRow calls `derivePayloads()` directly. No new prop on CommentRowProps for payloads.

### Q2: Where does the sanitizeHtml callback come from?

**My read:** KnowledgeBody creates `const sanitizeHtml = (raw: string): string => DOMPurify.sanitize(raw)` and passes it to `<Block sanitizeHtml={sanitizeHtml} />`. But KnowledgeBody is in the web package, which can import DOMPurify. CommentRow is in the design-system package, which must stay framework-host-agnostic and cannot import DOMPurify.

Option A: Add `sanitizeHtml?: (raw: string) => string` to CommentRowProps. Consumers pass it in.
Option B: CommentRow renders HtmlPayload without a sanitizer, causing it to fall through to UnknownPayload (the existing behavior when sanitizeHtml is undefined).

**Decision:** Option A -- add `sanitizeHtml` as an optional prop on `CommentRowProps`. This matches the Block component's pattern (Block takes `sanitizeHtml` as an optional prop). When not provided, html payloads degrade to UnknownPayload (defense-in-depth -- shows the raw source rather than rendering unsanitized HTML). The web package's ThreadShell or ConversationsChat passes `DOMPurify.sanitize` when rendering CommentRow.

### Q3: Design-it-twice: derivePayloads extraction strategy

**Alternative A: Factor out shared internals from derive-blocks.ts**

Extract `mdNodeToPayload`, `inlineFromMd`, `inlineToText`, `listItems`, `tableFromMd`, `isUrlInAllowlist`, `isImageScheme`, `isLinkScheme`, and the `MdNode` interface into a new file `packages/shared/src/blocks/md-to-payload.ts`. Both `deriveBlocks` and the new `derivePayloads` import from it.

- Trade-off: Cleaner separation, but refactors a well-tested file (derive-blocks.ts). Must verify all existing tests still pass after extraction. 7 functions + 1 interface move.
- Reject reason: N/A -- this is the better option.

**Alternative B: derivePayloads calls deriveBlocks and strips the block envelope**

`derivePayloads(text)` calls `deriveBlocks(text, { kind: "knowledge_item", id: "ephemeral" })` and maps `blocks.map(b => b.payload)`. No code extraction needed.

- Trade-off: Zero refactoring, but: (1) imports blake2s and runs unnecessary hashing, (2) uses "knowledge_item" as a fake host kind which is semantically wrong, (3) runs the oversize gate at 256KB which may differ from message length limits, (4) runs collision checking unnecessarily.
- Reject reason: Couples message rendering to the full Block identity pipeline. Violates concept doc principle #3 (deriveBlocks is heavier than needed).

**Decision: Alternative A.** Factor out the shared parser internals into `md-to-payload.ts`. The refactoring is mechanical (move functions, update imports) and the existing deriveBlocks tests provide confidence against regressions.

### Q4: Image payload handling

**My read:** The design doc says "no image rendering in messages." The options:

A. `derivePayloads` itself maps image payloads to paragraph payloads containing the alt text.
B. The renderer (in CommentRow) filters out image payloads.

**Decision:** A -- `derivePayloads` handles image downgrade. This keeps the rendering path simple (CommentRow renders all payloads via renderPayload without filtering). The downgrade is: image payloads become `{ kind: "paragraph", inline: [{ type: "text", value: alt }] }`. If alt text is empty, the image payload is dropped entirely.

---

## Phase 1 -- Plan reconciliation

| Spec assumption | Codebase reality | Resolution |
|---|---|---|
| `renderPayload` can be imported by CommentRow | `renderPayload` is NOT exported from the design-system barrel (`index.ts`). It's an internal function in `block/render-payload.tsx`. | CommentRow is in the same package (design-system), so it uses a relative import: `import { renderPayload } from "./block/render-payload.js"`. No barrel change needed. |
| `derivePayloads` is a new function in `@hyperidle/shared` | Does not exist yet. | Created in this workpackage. |
| `mdNodeToPayload` and related functions can be extracted | Currently private (module-scoped) functions in `derive-blocks.ts`. Not exported. | Refactored into `md-to-payload.ts` and exported from the blocks sub-barrel. |
| CommentRow can import from `@hyperidle/shared` | CommentRow already imports `Message`, `exhaustiveAssert`, `isRedactedPayload`, `verdictDecisionLabel`, `verdictDecisionToStatus`. | Confirmed -- adding `derivePayloads` and `BlockPayload` imports is consistent. |
| `--text-strong` token exists | NOT defined in `tokens.css` or any CSS file. Referenced in HeadingPayload and inline.tsx but resolves to nothing (inherits parent color). | Pre-existing issue. For R3, headings in messages inherit the message wrapper's `--text-mid` via CSS cascade. This is acceptable for message context (headings are structural, not display). |
| `sanitizeHtml` can be passed to `renderPayload` | `renderPayload(payload, sanitizeHtml?)` already accepts this optional parameter. | Confirmed. |
| DOMPurify is available | `dompurify` is in web package's dependencies. Design-system does NOT depend on it. | CommentRow receives `sanitizeHtml` via prop injection. Consumer passes `DOMPurify.sanitize`. |
| Existing CommentRow tests assert plain text rendering | `CommentRow.test.tsx` line 73: `expect(screen.getByText("hello world")).toBeInTheDocument()` | After R3, "hello world" is rendered inside a ParagraphPayload `<p>` tag. `getByText("hello world")` still finds it. The test passes without modification. VERIFIED. |

---

## Phase 2 -- Acceptance criteria + tasks

### Acceptance criteria

| AC | Criterion | Verification method |
|---|---|---|
| AC-1 | `derivePayloads(text: string): BlockPayload[]` exists in `@hyperidle/shared` and is exported from the barrel. | Unit test: import `derivePayloads` from `@hyperidle/shared`; call with markdown string; assert return type is `BlockPayload[]`. |
| AC-2 | `derivePayloads` parses fenced code blocks into `{ kind: "code", lang, text }` payloads. | Unit test: call with ` ```ts\nconst x = 1;\n``` `; assert `payloads[0].kind === "code"` and `payloads[0].text === "const x = 1;"`. |
| AC-3 | `derivePayloads` parses bold, italic, inline code, and links into correct inline nodes within paragraph payloads. | Unit test: call with `**bold** and *italic* and \`code\` and [link](https://example.com)`; assert paragraph payload has strong, emphasis, inlineCode, and link inline nodes. |
| AC-4 | `derivePayloads` parses lists (ordered and unordered) into list payloads. | Unit test: call with `- a\n- b\n`; assert `payloads[0].kind === "list"` with 2 items. Call with `1. a\n2. b\n`; assert ordered list. |
| AC-5 | `derivePayloads` parses headings (h1-h6) into heading payloads with correct level. | Unit test: call with `## Title`; assert `payloads[0].kind === "heading"` and `payloads[0].level === 2`. |
| AC-6 | `derivePayloads` downgrades image payloads to paragraph payloads with alt text. | Unit test: call with `![screenshot](https://example.com/img.png)`; assert output contains a paragraph payload with inline text "screenshot", NOT an image payload. |
| AC-7 | `derivePayloads` returns `[]` for empty or whitespace-only input. | Unit test: call with `""` and `"   "`; assert empty array. |
| AC-8 | `derivePayloads` does NOT compute BlockIds, sources, anchors, or any Block-level properties. | Unit test: assert return type is `BlockPayload[]` (not `Block[]`). TypeScript type check confirms no `id`, `source`, or `anchor` fields. |
| AC-9 | Plain message payloads in CommentRow are rendered through the block payload rendering pipeline. | Component test: render `CommentRow` with a plain message containing markdown; assert rendered DOM contains appropriate HTML elements (e.g., `<code>` for inline code, `<strong>` for bold). |
| AC-10 | Fenced code blocks in messages render with monospace font on a `--surface-2` background. | Component test: render CommentRow with a message containing a fenced code block; assert a `<pre>` element exists with the expected CSS classes. |
| AC-11 | Bold, italic, lists, and headings render correctly in messages. | Component test: render CommentRow with markdown containing each feature; assert corresponding HTML elements are present. |
| AC-12 | Links in messages are clickable (rendered as `<a>` elements with href). | Component test: render CommentRow with `[link](https://example.com)`; assert `<a>` element with `href="https://example.com"`. |
| AC-13 | Messages with no markdown render identically to today -- single paragraph, same visual output. | Component test: render CommentRow with `"hello world"` (no markdown); assert a single `<p>` element containing the text. Compare with snapshot of current output structure. |
| AC-14 | Existing message type rendering (review, questionnaire, verdict) is not affected. | Existing test: `CommentRow.test.tsx` verdict test still passes. `CommentRow.richVariant.test.tsx` still passes. No changes to review/questionnaire/verdict branches. |
| AC-15 | HTML in messages is sanitized via the `sanitizeHtml` callback before rendering. | Component test: render CommentRow with a message containing `<script>alert(1)</script>`; when `sanitizeHtml` is provided, assert no `<script>` in DOM. When `sanitizeHtml` is not provided, assert UnknownPayload renders instead. |
| AC-16 | `javascript:` URLs in markdown links are stripped (defense-in-depth). | Unit test: call `derivePayloads` with `[click](javascript:alert(1))`; assert the inline node has type "text" (link degraded), not type "link". |
| AC-17 | The refactoring of `derive-blocks.ts` does not break any existing tests. | All existing tests in `packages/shared/src/__tests__/` and `packages/web/src/__tests__/` that touch `deriveBlocks` continue to pass. |

### Ordered task list

**Task 1: Extract shared parser internals to md-to-payload.ts**

Files:
- NEW: `packages/shared/src/blocks/md-to-payload.ts`
- MODIFY: `packages/shared/src/blocks/derive-blocks.ts` (import from md-to-payload instead of defining locally)
- MODIFY: `packages/shared/src/blocks/index.ts` (re-export from md-to-payload)

Move these functions/types from `derive-blocks.ts` to `md-to-payload.ts`:
- `MdNode` interface
- `MdRoot` interface
- `isUrlInAllowlist()` function
- `isImageScheme()` function
- `isLinkScheme()` function
- `inlineFromMd()` function
- `inlineToText()` function (if needed by derivePayloads; currently only used by mdNodeToPayload for heading text extraction -- yes, needed)
- `listItems()` function
- `tableFromMd()` function
- `mdNodeToPayload()` function

`derive-blocks.ts` then imports these from `./md-to-payload.js`.

Verification: `npm run check` passes. All existing deriveBlocks tests pass (`npm run test`).

Depends on: nothing.

**Task 2: Create derivePayloads function**

Files:
- NEW: `packages/shared/src/blocks/derive-payloads.ts`
- MODIFY: `packages/shared/src/blocks/index.ts` (export derivePayloads)
- MODIFY: `packages/shared/src/index.ts` (re-export derivePayloads)

Function signature:
```ts
/**
 * Pure markdown -> BlockPayload[] derivation for message rendering.
 * 
 * Unlike deriveBlocks, this function produces ONLY payloads -- no BlockId,
 * no source tracking, no anchor, no outline-path computation. It is the
 * rendering-only subset of the block derivation pipeline.
 *
 * Image payloads are downgraded to paragraph payloads containing the alt
 * text (R3 constraint: no image rendering in messages).
 *
 * @lore R3 concept doc: messages are NOT block hosts. This function reuses
 * the parser and payload-mapping infrastructure but does not create Block
 * objects. See plans/R3/concept.md for the rationale.
 */
export function derivePayloads(text: string): BlockPayload[] {
  if (text.length === 0 || text.trim().length === 0) return [];
  
  const processor = unified().use(remarkParse).use(remarkGfm);
  let tree: MdRoot;
  try {
    tree = processor.parse(text) as MdRoot;
  } catch {
    return [{ kind: "unknown", raw: text, reason: "parser-unrecognised" }];
  }
  
  const payloads: BlockPayload[] = [];
  for (const node of tree.children ?? []) {
    const payload = mdNodeToPayload(node);
    if (!payload) continue;
    // Image downgrade: replace image payloads with alt-text paragraphs
    if (payload.kind === "image") {
      if (payload.alt) {
        payloads.push({ kind: "paragraph", inline: [{ type: "text", value: payload.alt }] });
      }
      continue;
    }
    payloads.push(payload);
  }
  return payloads;
}
```

Verification: AC-1 through AC-8 unit tests pass.

Depends on: Task 1.

**Task 3: Write derivePayloads unit tests**

Files:
- NEW: `packages/shared/src/__tests__/derive-payloads.test.ts`

Tests for AC-1 through AC-8, AC-16. Test matrix:
- Empty string -> []
- Whitespace-only -> []
- Plain text "hello world" -> single paragraph payload
- Fenced code block -> code payload with lang and text
- Bold/italic/inline code/links -> paragraph with correct inline nodes
- Ordered and unordered lists -> list payloads
- Headings h1-h6 -> heading payloads with correct levels
- Image -> downgraded to paragraph with alt text
- Image with empty alt -> dropped entirely
- Blockquote -> quote payload
- Table -> table payload
- HTML block -> html payload (raw)
- `javascript:` link -> degraded to text (not a link node)
- Mixed content (paragraph + code + list) -> correct sequence of payloads

Verification: all tests pass.

Depends on: Task 2.

**Task 4: Add sanitizeHtml prop to CommentRow and wire payload rendering**

Files:
- MODIFY: `packages/design-system/src/CommentRow.tsx`

Changes:
1. Add `sanitizeHtml?: (raw: string) => string` to `CommentRowProps`.
2. Import `derivePayloads` from `@hyperidle/shared` and `BlockPayload` type.
3. Import `renderPayload` from `./block/render-payload.js`.
4. In the `case "plain"` branch of `renderBody`, replace:
   ```tsx
   <p className="text-[13px] text-[var(--text-mid)] whitespace-pre-wrap break-words">
     {payload.text}
   </p>
   ```
   with:
   ```tsx
   <MessagePayloads text={payload.text} sanitizeHtml={sanitizeHtml} />
   ```
5. Define `MessagePayloads` as a local function component (NOT exported, NOT a new design-system component) inside `CommentRow.tsx`:

```tsx
function MessagePayloads({
  text,
  sanitizeHtml,
}: {
  text: string;
  sanitizeHtml?: (raw: string) => string;
}): JSX.Element {
  const payloads = useMemo(() => derivePayloads(text), [text]);
  
  if (payloads.length === 0) {
    // Empty or whitespace-only: render nothing (matches current behavior
    // for empty payload.text -- the <p> would be empty anyway)
    return <p className="text-[13px] text-[var(--text-mid)] whitespace-pre-wrap break-words" />;
  }
  
  return (
    <div
      className={[
        "flex flex-col gap-[8px]",
        "text-[13px] text-[var(--text-mid)]",
        // Heading scale overrides: prevent page-level heading sizes in messages
        "[&_h1]:text-[14px] [&_h2]:text-[13px] [&_h3]:text-[13px]",
        "[&_h4]:text-[13px] [&_h5]:text-[13px] [&_h6]:text-[13px]",
      ].join(" ")}
    >
      {payloads.map((payload, i) => (
        <div key={i}>{renderPayload(payload, sanitizeHtml)}</div>
      ))}
    </div>
  );
}
```

Note: `useMemo` is used because messages are immutable after persistence -- the payload.text never changes for a given message. Re-parsing on every render would be wasteful on large markdown messages.

The `renderBody` function now needs access to `sanitizeHtml`. Since `renderBody` is currently a standalone function, two options:
- Pass `sanitizeHtml` as a parameter to `renderBody`.
- Inline the rendering into the JSX.

**Decision:** Pass it as a parameter: `renderBody(message, sanitizeHtml)`. This preserves the existing structure and the exhaustive switch.

Updated signature:
```ts
function renderBody(
  message: Message,
  sanitizeHtml?: (raw: string) => string,
): ReactNode
```

And in the JSX: `renderBody(message, sanitizeHtml)`.

Verification: AC-9 through AC-15 component tests pass. AC-14 existing tests pass.

Depends on: Task 2.

**Task 5: Wire sanitizeHtml in CommentRow consumers**

Files to check and update:
- `packages/web/src/__tests__/CommentRow.test.tsx` -- may need to pass sanitizeHtml for HTML block tests
- Any consumer in `packages/web/src/` that renders `<CommentRow>` -- needs to pass `sanitizeHtml={DOMPurify.sanitize}`

```bash
grep -rn "<CommentRow" packages/web/src/ --include="*.tsx"
```

Each consumer that renders CommentRow should pass `sanitizeHtml={(raw) => DOMPurify.sanitize(raw)}`. If no consumer currently passes it, plain-text messages without HTML blocks work fine (renderPayload only calls sanitizeHtml for `kind: "html"` payloads, and when it's missing, HtmlPayload degrades to UnknownPayload).

Verification: AC-15 component test passes.

Depends on: Task 4.

**Task 6: Write CommentRow rendering tests for R3**

Files:
- NEW: `packages/web/src/__tests__/CommentRow.markdown.test.tsx`

Tests for AC-9 through AC-15:
- Plain message with markdown renders formatted output (code, bold, list, heading, link)
- Plain message with fenced code block renders `<pre>` with monospace
- Plain message with bold renders `<strong>`
- Plain message with link renders `<a>` with correct href
- Plain message with no markdown renders single `<p>` (regression test)
- Verdict message still renders as before (no regression)
- Redacted message still renders as before (no regression)
- Message with `<script>` tag: when sanitizeHtml provided, no script in DOM
- Message with `<script>` tag: when sanitizeHtml not provided, UnknownPayload renders

Verification: all tests pass.

Depends on: Task 4.

**Task 7: Verify no regression on existing tests**

Run full test suite to confirm:
- `packages/shared/src/__tests__/` -- all deriveBlocks tests pass after Task 1 refactoring
- `packages/web/src/__tests__/CommentRow.test.tsx` -- existing plain/verdict/redacted tests pass
- `packages/web/src/__tests__/CommentRow.richVariant.test.tsx` -- rich variant tests pass
- `packages/web/src/__tests__/KnowledgeBody*.test.tsx` -- knowledge body tests pass (they import deriveBlocks)
- `packages/web/src/__tests__/WorkBet.pitch.test.tsx` -- bet pitch tests pass

Verification: `npm run verify` passes (zero type errors, zero lint errors, all tests green).

Depends on: Tasks 1-6.

### Type signatures

```ts
// packages/shared/src/blocks/md-to-payload.ts

/** mdast node shape (internal -- not exported from barrel) */
export interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  lang?: string | null;
  url?: string;
  title?: string | null;
  alt?: string;
  align?: ("left" | "right" | "center" | null)[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

export interface MdRoot {
  type: "root";
  children: MdNode[];
}

export function isUrlInAllowlist(
  url: string,
  allowlist: readonly string[],
  allowFragment?: boolean,
): boolean;

export function isImageScheme(url: string): boolean;
export function isLinkScheme(url: string): boolean;
export function inlineFromMd(nodes: MdNode[] | undefined): InlineNode[];
export function inlineToText(nodes: InlineNode[]): string;
export function listItems(node: MdNode): ListItem[];
export function tableFromMd(node: MdNode): {
  header: InlineNode[][];
  rows: InlineNode[][][];
  align: ("left" | "right" | "center" | null)[];
};
export function mdNodeToPayload(node: MdNode): BlockPayload | null;


// packages/shared/src/blocks/derive-payloads.ts

export function derivePayloads(text: string): BlockPayload[];


// packages/design-system/src/CommentRow.tsx (updated)

export interface CommentRowProps extends CommentRowRichSlots {
  message: Message;
  sender: CommentRowSender;
  showSenderHeader: boolean;
  inlineAnchor?: string;
  /** Optional HTML sanitizer for rendering raw HTML blocks in messages. */
  sanitizeHtml?: (raw: string) => string;
}
```

### Risks and ambiguities

1. **Softbreak behavior change.** Single newlines in messages currently render as line breaks (whitespace-pre-wrap). After R3, CommonMark rules apply: single newlines are collapsed to spaces. This is correct markdown behavior but changes the visual output for some messages. Risk: low. Agent messages are already markdown-formatted. Mitigation: none needed -- this is the correct behavior.

2. **Performance on large messages.** `derivePayloads` runs remark-parse + remark-gfm on every render (memoized by text via useMemo). For typical messages (< 10KB), parsing takes < 1ms. The 256KB body cap from deriveBlocks is NOT applied to derivePayloads (messages have their own server-side length limit). Risk: very low.

3. **`--text-strong` undefined.** HeadingPayload and inline.tsx reference `var(--text-strong)` which is not defined in tokens.css. The CSS resolves to `initial` (inherits parent). In message context, headings inherit `--text-mid` from the wrapper. This is acceptable but means headings in messages do not stand out in color -- only in font (font-heading: Geist Mono, uppercase, tracking). Risk: cosmetic. Not an R3 issue to fix.

4. **ParagraphPayload uses `text-[var(--text)]`.** This resolves to `--text-hi` (bright white). The design doc requires `--text-mid` for message body text. The wrapper div's `text-[var(--text-mid)]` cascades into ParagraphPayload because `var(--text)` in CSS is the property `color: var(--text)`, which sets color explicitly. The wrapper's `text-[var(--text-mid)]` is a Tailwind utility that also sets `color: var(--text-mid)`. ParagraphPayload's explicit `color: var(--text)` will override the cascade. **This needs to be handled.** Solution: the wrapper div does NOT rely on CSS cascade for paragraphs. Instead, the wrapper applies `[&_p]:text-[var(--text-mid)]` to force paragraph text color. But this would also affect paragraphs inside blockquotes which already use `--text-mid`. Simpler: ParagraphPayload's `text-[var(--text)]` will render as `--text-hi` (too bright for messages). The wrapper overrides with `[&_p]:text-[var(--text-mid)]`. This is safe because all paragraphs in messages should use --text-mid.

### Security and abuse cases

| Surface | Applicable? | Addressed |
|---|---|---|
| Rate-limit on POST/PATCH | N/A -- R3 is client-side rendering only, no new endpoints. | N/A |
| Input-trust boundary for agent-authored fields | **Yes** -- `payload.text` is agent-authored markdown. | Addressed: (1) `derivePayloads` reuses the URL allowlist from `derive-blocks.ts`, stripping `javascript:`, `vbscript:`, etc. from links. (2) Image URLs are gated by `IMAGE_URL_SAFE_SCHEMES`. (3) Raw HTML blocks require `sanitizeHtml` callback (DOMPurify) to render; without it they degrade to UnknownPayload showing raw source. (4) XSS via inline code/text is not possible -- React's JSX escaping handles text content. |
| Secret-handling for new credential surface | N/A -- no new credentials. | N/A |
| Path-traversal for path input | N/A -- no file paths. | N/A |
| SSRF for outbound URL | N/A -- links render as `<a>` tags for user click-through, not server-side fetch. Image rendering is disabled (downgraded to alt text). | N/A |

### Protected tests

```
protectedTests:
  - packages/web/src/__tests__/CommentRow.test.tsx
  - packages/web/src/__tests__/CommentRow.richVariant.test.tsx
  - packages/web/src/__tests__/KnowledgeBody.test.tsx
  - packages/web/src/__tests__/KnowledgeBody.id-stability.test.tsx
  - packages/web/src/__tests__/WorkBet.pitch.test.tsx
```

These tests must continue to pass without assertion changes. The refactoring of `derive-blocks.ts` (Task 1) must not alter any existing behavior.

### Migrations

| Symbol | Change | Affected files |
|---|---|---|
| `mdNodeToPayload` (private in derive-blocks.ts) | Moved to md-to-payload.ts, now exported | `derive-blocks.ts` imports from `./md-to-payload.js` |
| `MdNode` interface (private in derive-blocks.ts) | Moved to md-to-payload.ts, now exported | `derive-blocks.ts` imports from `./md-to-payload.js` |
| `MdRoot` interface (private in derive-blocks.ts) | Moved to md-to-payload.ts, now exported | `derive-blocks.ts` imports from `./md-to-payload.js` |
| `inlineFromMd` (private in derive-blocks.ts) | Moved to md-to-payload.ts, now exported | `derive-blocks.ts` imports from `./md-to-payload.js` |
| `inlineToText` (private in derive-blocks.ts) | Moved to md-to-payload.ts, now exported | `derive-blocks.ts` imports from `./md-to-payload.js` |
| `listItems` (private in derive-blocks.ts) | Moved to md-to-payload.ts, now exported | `derive-blocks.ts` imports from `./md-to-payload.js` |
| `tableFromMd` (private in derive-blocks.ts) | Moved to md-to-payload.ts, now exported | `derive-blocks.ts` imports from `./md-to-payload.js` |
| `isUrlInAllowlist` (private in derive-blocks.ts) | Moved to md-to-payload.ts, now exported | `derive-blocks.ts` imports from `./md-to-payload.js` |
| `isImageScheme` (private in derive-blocks.ts) | Moved to md-to-payload.ts, now exported | `derive-blocks.ts` imports from `./md-to-payload.js` |
| `isLinkScheme` (private in derive-blocks.ts) | Moved to md-to-payload.ts, now exported | `derive-blocks.ts` imports from `./md-to-payload.js` |
| `CommentRowProps` interface | Added optional `sanitizeHtml` prop | No existing callers break (prop is optional) |

No test files, fixtures, or Playwright specs reference the moved symbols directly (they're private). No renames -- only relocations with re-exports.

---

## File summary

### New files

| File | Purpose |
|---|---|
| `packages/shared/src/blocks/md-to-payload.ts` | Shared parser internals: mdast -> BlockPayload mapping |
| `packages/shared/src/blocks/derive-payloads.ts` | `derivePayloads()`: markdown text -> BlockPayload[] (no Block identity) |
| `packages/shared/src/__tests__/derive-payloads.test.ts` | Unit tests for derivePayloads (AC-1 through AC-8, AC-16) |
| `packages/web/src/__tests__/CommentRow.markdown.test.tsx` | Component tests for markdown rendering in CommentRow (AC-9 through AC-15) |

### Modified files

| File | Change |
|---|---|
| `packages/shared/src/blocks/derive-blocks.ts` | Import from `./md-to-payload.js` instead of defining parser functions locally |
| `packages/shared/src/blocks/index.ts` | Re-export `derivePayloads` and md-to-payload internals |
| `packages/shared/src/index.ts` | Re-export `derivePayloads` |
| `packages/design-system/src/CommentRow.tsx` | Add `sanitizeHtml` prop; replace plain text rendering with payload pipeline |

### Unchanged files (protected)

| File | Why unchanged |
|---|---|
| `packages/design-system/src/block/render-payload.tsx` | Reused as-is; no modifications |
| `packages/design-system/src/block/inline.tsx` | Reused as-is |
| `packages/design-system/src/block/*.tsx` (all payload components) | Reused as-is |
| `packages/design-system/src/Block.tsx` | Not used by R3 (messages don't use the Block component) |
| `packages/shared/src/blocks/types.ts` | No new types or type changes |
| `packages/shared/src/thread.ts` | No changes to Message or PlainPayload types |
