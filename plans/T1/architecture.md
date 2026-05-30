# T1 Architecture Plan -- BodyEditor Component (TipTap WYSIWYG)

**Workpackage:** T1  
**Concept:** `plans/human-authoring/editing-experience-concept.md` (locked)  
**Design:** Skipped per spec -- headless TipTap styled with Lucid tokens.

---

## 1. Component API

```typescript
// packages/design-system/src/BodyEditor.tsx

export interface BodyEditorProps {
  /** GFM markdown to load into the editor. Empty string for blank editor. */
  initialContent: string;

  /** Called on every content change with the serialized GFM markdown. */
  onChange: (markdown: string) => void;

  /** Placeholder text shown when editor is empty. Default: "Start writing..." */
  placeholder?: string;

  /** Auto-focus the editor on mount. Default: false. */
  autoFocus?: boolean;

  /** Minimum CSS height for the editor surface. Default: "120px". */
  minHeight?: string;

  /** When false, editor is read-only. Default: true. */
  editable?: boolean;

  /**
   * "full" = slash menu + all block types + inline formatting.
   * "mini" = inline formatting only (no slash menu, no block insertion).
   * Default: "full".
   */
  variant?: "full" | "mini";

  /** Additional CSS class on the outermost wrapper. */
  className?: string;
}
```

The component renders a `<div>` wrapper with `dsProps("BodyEditor", "2")` data attributes (Tier 2 design-system component, matching Block's tier). It uses the `EditorContent` component from `@tiptap/react` internally.

**Return type:** `JSX.Element`. No imperative handle needed -- the parent controls the editor via props (initialContent on mount, onChange for reads, editable for lock/unlock).

**Key contract:** `onChange` fires with the full serialized markdown on every document mutation. The parent owns debouncing and persistence. The editor is stateless from the parent's perspective after mount -- `initialContent` is consumed once at mount time and not synced.

---

## 2. TipTap Extensions

### Packages to install

| Package | Version | Purpose |
|---------|---------|---------|
| `@tiptap/react` | `^2.12` | React integration (EditorContent, useEditor, BubbleMenu) |
| `@tiptap/pm` | `^2.12` | ProseMirror dependency (peer of @tiptap/react) |
| `@tiptap/starter-kit` | `^2.12` | Paragraph, Heading (1-6), Bold, Italic, Strike, Code, Blockquote, BulletList, OrderedList, ListItem, HardBreak, HorizontalRule, History |
| `@tiptap/extension-code-block-lowlight` | `^2.12` | Fenced code blocks with syntax highlighting |
| `@tiptap/extension-table` | `^2.12` | GFM tables |
| `@tiptap/extension-table-row` | `^2.12` | Table row nodes (required by table) |
| `@tiptap/extension-table-cell` | `^2.12` | Table cell nodes (required by table) |
| `@tiptap/extension-table-header` | `^2.12` | Table header nodes (required by table) |
| `@tiptap/extension-image` | `^2.12` | Block-level images |
| `@tiptap/extension-placeholder` | `^2.12` | Empty-state placeholder text |
| `@tiptap/extension-link` | `^2.12` | Inline links with Cmd+K |
| `tiptap-markdown` | `^0.8` | GFM markdown serialization/deserialization |
| `lowlight` | `^3.3` | Syntax highlighting engine (peer of code-block-lowlight) |

**Note on starter-kit overlap:** StarterKit includes CodeBlock, HorizontalRule, Heading, BulletList, OrderedList, Blockquote, Bold, Italic, Strike, Code, etc. We disable StarterKit's built-in CodeBlock in favor of CodeBlockLowlight for syntax highlighting. StarterKit's HorizontalRule stays as-is.

### Extension-to-BlockKind mapping

| BlockKind | TipTap Extension | Slash menu entry |
|-----------|-----------------|------------------|
| heading | Heading (StarterKit, levels 1-3) | `/heading1`, `/heading2`, `/heading3` |
| list (unordered) | BulletList + ListItem (StarterKit) | `/bullet` |
| list (ordered) | OrderedList + ListItem (StarterKit) | `/numbered` |
| quote | Blockquote (StarterKit) | `/quote` |
| code | CodeBlockLowlight | `/code` |
| table | Table + TableRow + TableCell + TableHeader | `/table` |
| divider | HorizontalRule (StarterKit) | `/divider` |
| image | Image | `/image` |
| paragraph | Paragraph (StarterKit) | (default, no slash entry) |

BlockKinds `html` and `unknown` have no editor support -- they are read-mode fallbacks only.

### Dependency placement

**`packages/design-system/package.json`** -- TipTap packages as `peerDependencies`:
```json
{
  "peerDependencies": {
    "react": "^19.0.0",
    "@tiptap/react": "^2.12.0",
    "@tiptap/pm": "^2.12.0",
    "@tiptap/starter-kit": "^2.12.0",
    "@tiptap/extension-code-block-lowlight": "^2.12.0",
    "@tiptap/extension-table": "^2.12.0",
    "@tiptap/extension-table-row": "^2.12.0",
    "@tiptap/extension-table-cell": "^2.12.0",
    "@tiptap/extension-table-header": "^2.12.0",
    "@tiptap/extension-image": "^2.12.0",
    "@tiptap/extension-placeholder": "^2.12.0",
    "@tiptap/extension-link": "^2.12.0",
    "tiptap-markdown": "^0.8.0",
    "lowlight": "^3.3.0"
  }
}
```

**`packages/web/package.json`** -- same packages as regular `dependencies` (web is the consumer that provides them):
```json
{
  "dependencies": {
    "@tiptap/react": "^2.12.0",
    "@tiptap/pm": "^2.12.0",
    "@tiptap/starter-kit": "^2.12.0",
    "@tiptap/extension-code-block-lowlight": "^2.12.0",
    "@tiptap/extension-table": "^2.12.0",
    "@tiptap/extension-table-row": "^2.12.0",
    "@tiptap/extension-table-cell": "^2.12.0",
    "@tiptap/extension-table-header": "^2.12.0",
    "@tiptap/extension-image": "^2.12.0",
    "@tiptap/extension-placeholder": "^2.12.0",
    "@tiptap/extension-link": "^2.12.0",
    "tiptap-markdown": "^0.8.0",
    "lowlight": "^3.3.0"
  }
}
```

**`packages/design-system/package.json`** also gets them as `devDependencies` so the design-system's own storybook/vite server can resolve them for dev.

---

## 3. Markdown Serialization

### Strategy

Use `tiptap-markdown` extension which provides:
- `editor.storage.markdown.getMarkdown()` -- serialize editor content to GFM
- Loading markdown content via `content` option using markdown string

### Configuration

```typescript
import { Markdown } from "tiptap-markdown";

// In the useEditor extensions array:
Markdown.configure({
  html: false,           // Do not parse/serialize HTML blocks
  tightLists: true,      // Tight lists (no blank lines between items)
  tightListClass: undefined,
  bulletListMarker: "-", // Use `-` not `*` for unordered lists
  linkify: false,        // Do not auto-linkify URLs in text
  breaks: false,         // Do not convert single newlines to <br>
  transformPastedText: true,  // Convert pasted markdown to rich text
  transformCopiedText: true,  // Copy as markdown
})
```

### Round-trip fidelity contract

- Structural equivalence: `markdown -> editor -> markdown` produces GFM that parses to the same AST. Whitespace normalization (trailing spaces, blank line counts) is acceptable.
- All 8 insertable BlockKinds must round-trip without loss.
- Inline formatting (bold, italic, code, strikethrough, link) must round-trip.
- Lists (nested, mixed ordered/unordered) must round-trip.
- Tables (header + alignment + rows) must round-trip.
- Images (alt, URL, title) must round-trip.

### Testing approach

Unit tests comparing `input markdown -> load into editor -> serialize -> parse both with remark -> compare ASTs`. This avoids whitespace noise. The test suite covers one representative sample per BlockKind plus edge cases (nested lists, inline formatting inside headings, multi-row tables with alignment).

---

## 4. Slash Menu

### Implementation

TipTap's `@tiptap/suggestion` extension (included via StarterKit) provides the slash-command pattern. We create a custom Suggestion configuration that:

1. Triggers on `/` typed at the start of a block (char: `/`)
2. Shows a dropdown with filtered results based on typed text
3. Executes the corresponding editor command on selection

### Slash menu items

```typescript
interface SlashMenuItem {
  title: string;
  description: string;
  command: (props: { editor: Editor; range: Range }) => void;
}

const SLASH_MENU_ITEMS: SlashMenuItem[] = [
  {
    title: "Heading 1",
    description: "Large section heading",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Unordered list",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Ordered list",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Quote",
    description: "Blockquote",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "Code Block",
    description: "Fenced code block",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "Table",
    description: "Insert a 2x2 table",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range)
        .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
        .run();
    },
  },
  {
    title: "Divider",
    description: "Horizontal rule",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: "Image",
    description: "Image from URL",
    command: ({ editor, range }) => {
      const url = window.prompt("Image URL");
      if (url) {
        editor.chain().focus().deleteRange(range).setImage({ src: url }).run();
      }
    },
  },
];
```

### Slash menu rendering

The dropdown is a React component rendered via TipTap's `ReactRenderer` + `tippy.js` (comes with `@tiptap/suggestion`). It renders as a `<div>` with `bg-[var(--surface-2)]` background, `border border-[var(--border-default)]` border, and `rounded-[var(--r2)]` radius. Items use `text-[var(--text-hi)]` for the title and `text-[var(--text-lo)]` for the description. Selected item gets `bg-[var(--surface-ghost)]`.

The dropdown is styled with Lucid tokens -- no DaisyUI dropdown component, since we need full control over the rendering for keyboard navigation and filtering.

### Filtering

Items are filtered by matching the typed text (after `/`) against both `title` and `description` using case-insensitive `includes()`. Empty query shows all items.

### Keyboard navigation

- `ArrowUp` / `ArrowDown` to navigate
- `Enter` to select
- `Escape` to dismiss

### Variant gating

When `variant === "mini"`, the slash-menu suggestion extension is NOT registered in the `useEditor` extensions array. This is a clean conditional:

```typescript
const extensions = [
  // ... always-on extensions
  ...(variant === "full" ? [slashMenuSuggestion] : []),
];
```

---

## 5. Floating Toolbar (BubbleMenu)

### Implementation

Use `@tiptap/react`'s `<BubbleMenu>` component. It renders a floating toolbar when text is selected.

### Toolbar buttons

| Button | Action | Active check |
|--------|--------|-------------|
| **B** | `toggleBold()` | `editor.isActive("bold")` |
| *I* | `toggleItalic()` | `editor.isActive("italic")` |
| `<>` | `toggleCode()` | `editor.isActive("code")` |
| ~~S~~ | `toggleStrike()` | `editor.isActive("strike")` |
| Link | `setLink({ href })` / `unsetLink()` | `editor.isActive("link")` |

### Toolbar rendering

A horizontal `<div>` with `flex items-center gap-[4px]`:
- Background: `bg-[var(--surface-2)]`
- Border: `border border-[var(--border-default)]`
- Radius: `rounded-[var(--r1)]`
- Shadow: `shadow-[var(--float)]` (overlays are allowed heavy shadow per AQ-012)
- Padding: `px-[4px] py-[2px]`
- Each button: 28x28px, `rounded-[var(--r1)]`, `text-[var(--text-mid)]`, active state: `bg-[var(--primary-dim)] text-[var(--primary)]`
- Font: `text-[13px] font-medium`

The buttons are icon-free (text labels: **B**, *I*, `<>`, ~~S~~, Link) to avoid icon dependency. This matches the density-first aesthetic -- text labels at 13px are denser than 16px icons.

### Link handling

When the user clicks "Link" in the toolbar:
- If text is selected and no link exists: prompt for URL via `window.prompt("URL")`. If provided, call `editor.chain().focus().setLink({ href: url }).run()`.
- If a link is active: call `editor.chain().focus().unsetLink().run()`.

This is intentionally simple. A proper link popover (edit URL, open in new tab) is a future enhancement. `window.prompt` is adequate for v1.

### BubbleMenu configuration

```typescript
<BubbleMenu
  editor={editor}
  tippyOptions={{
    placement: "top",
    animation: false,
  }}
>
  {/* toolbar buttons */}
</BubbleMenu>
```

The BubbleMenu is rendered for both `full` and `mini` variants -- inline formatting is always available.

---

## 6. Keyboard Shortcuts

All keyboard shortcuts are provided by TipTap extensions out of the box:

| Shortcut | Extension | Action |
|----------|-----------|--------|
| Cmd+B | Bold (StarterKit) | Toggle bold |
| Cmd+I | Italic (StarterKit) | Toggle italic |
| Cmd+E | Code (StarterKit) | Toggle inline code |
| Cmd+Shift+X | Strike (StarterKit) | Toggle strikethrough |
| Cmd+K | Link extension | Set/unset link |

**Cmd+K handling:** The Link extension does not provide a keyboard shortcut by default. We add a custom keyboard shortcut via `addKeyboardShortcuts()` on the Link extension configuration:

```typescript
Link.configure({
  openOnClick: false,    // Don't navigate on click in edit mode
  HTMLAttributes: {
    class: "text-[var(--primary)] underline",
  },
}).extend({
  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        const url = window.prompt("URL");
        if (url) {
          this.editor.chain().focus().setLink({ href: url }).run();
          return true;
        }
        return false;
      },
    };
  },
}),
```

---

## 7. Variant System

Two variants that differ only in which extensions are loaded:

| Feature | `full` | `mini` |
|---------|--------|--------|
| Paragraph, text formatting | Yes | Yes |
| Bold, Italic, Code, Strike, Link | Yes | Yes |
| BubbleMenu (floating toolbar) | Yes | Yes |
| Heading (1-3) | Yes | No |
| BulletList, OrderedList | Yes | No |
| Blockquote | Yes | No |
| CodeBlockLowlight | Yes | No |
| Table (+ Row, Cell, Header) | Yes | No |
| HorizontalRule | Yes | No |
| Image | Yes | No |
| Slash menu (Suggestion) | Yes | No |
| Placeholder | Yes | Yes |
| Markdown serialization | Yes | Yes |
| History (undo/redo) | Yes | Yes |

**Implementation:** Two extension-builder functions:

```typescript
function buildFullExtensions(placeholder: string): Extension[] {
  return [
    StarterKit.configure({
      codeBlock: false, // replaced by CodeBlockLowlight
    }),
    CodeBlockLowlight.configure({ lowlight }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    Image.configure({ inline: false }),
    Placeholder.configure({ placeholder }),
    Link.configure({ openOnClick: false })/* .extend(...) for Cmd+K */,
    Markdown.configure({ /* ... */ }),
    slashMenuSuggestion, // custom suggestion extension
  ];
}

function buildMiniExtensions(placeholder: string): Extension[] {
  return [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
    }),
    Placeholder.configure({ placeholder }),
    Link.configure({ openOnClick: false })/* .extend(...) for Cmd+K */,
    Markdown.configure({ /* ... */ }),
  ];
}
```

The mini variant strips all block-level extensions except Paragraph (always on). This means a mini editor only supports paragraphs with inline formatting -- suitable for short structured text fields like bet done conditions and hypotheses.

---

## 8. Storybook Stories

File: `packages/design-system/src/BodyEditor.stories.tsx`

### Story export shape (matches existing pattern)

```typescript
export default {
  title: "BodyEditor",
  tier: "2" as const,
  order: [
    "Empty",
    "WithContent",
    "MiniVariant",
    "ReadOnly",
    "WithPlaceholder",
    "RichContent",
  ],
};
```

### Stories

| Story | Props | What it demonstrates |
|-------|-------|---------------------|
| **Empty** | `initialContent=""`, `variant="full"` | Empty editor with default placeholder |
| **WithContent** | `initialContent="## Hello\n\nSome **bold** text\n\n- Item one\n- Item two"`, `variant="full"` | Editor loaded with mixed markdown content |
| **MiniVariant** | `initialContent="A short note with **bold** and *italic*."`, `variant="mini"` | Mini variant -- no slash menu, inline formatting only |
| **ReadOnly** | `initialContent="## Read Only\n\nThis content is not editable."`, `editable={false}` | Non-editable state |
| **WithPlaceholder** | `initialContent=""`, `placeholder="Type your hypothesis..."` | Custom placeholder text |
| **RichContent** | Complex markdown with heading, list, code block, table, blockquote, image, divider | All block types rendered together |

All stories pass `onChange={() => {}}` as a no-op handler.

---

## 9. Design Token Application

TipTap is headless -- it renders semantic HTML (`<h1>`, `<p>`, `<ul>`, `<blockquote>`, `<pre><code>`, `<table>`, `<hr>`, `<img>`) without any styling. We style these via a scoped CSS file.

### Styling approach

A CSS file `packages/design-system/src/body-editor.css` with styles scoped under `.body-editor` class (applied to the EditorContent wrapper). This avoids global style pollution and keeps editor styles isolated.

```css
/* packages/design-system/src/body-editor.css */

.body-editor .ProseMirror {
  outline: none;
  font-family: var(--ui);
  font-size: var(--density-text);
  line-height: var(--leading-body);
  color: var(--text-hi);
}

/* Headings */
.body-editor .ProseMirror h1 {
  font-size: var(--density-text-h1);
  line-height: var(--leading-heading);
  font-weight: var(--fw-emphasis);
  color: var(--text-hi);
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

.body-editor .ProseMirror h2 {
  font-size: var(--density-text-h2);
  line-height: var(--leading-heading);
  font-weight: var(--fw-emphasis);
  color: var(--text-hi);
  margin-top: 1.25em;
  margin-bottom: 0.5em;
}

.body-editor .ProseMirror h3 {
  font-size: calc(var(--density-text) * 1.1);
  line-height: var(--leading-heading);
  font-weight: var(--fw-medium);
  color: var(--text-hi);
  margin-top: 1em;
  margin-bottom: 0.5em;
}

/* Paragraphs */
.body-editor .ProseMirror p {
  margin-bottom: 0.5em;
}

/* First child removes top margin */
.body-editor .ProseMirror > :first-child {
  margin-top: 0;
}

/* Lists */
.body-editor .ProseMirror ul {
  list-style-type: disc;
  padding-left: 1.5em;
  margin-bottom: 0.5em;
}

.body-editor .ProseMirror ol {
  list-style-type: decimal;
  padding-left: 1.5em;
  margin-bottom: 0.5em;
}

.body-editor .ProseMirror li {
  margin-bottom: 0.125em;
}

/* Blockquote */
.body-editor .ProseMirror blockquote {
  border-left: 2px solid var(--border-emphasis);
  padding-left: 1em;
  color: var(--text-mid);
  margin-bottom: 0.5em;
}

/* Code blocks */
.body-editor .ProseMirror pre {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r1);
  padding: 0.75em 1em;
  margin-bottom: 0.5em;
  overflow-x: auto;
}

.body-editor .ProseMirror pre code {
  font-family: var(--mono);
  font-size: 0.875em;
  color: var(--text-hi);
  background: none;
  padding: 0;
  border: none;
  border-radius: 0;
}

/* Inline code */
.body-editor .ProseMirror code {
  font-family: var(--mono);
  font-size: 0.875em;
  background: var(--surface-ghost);
  padding: 0.125em 0.375em;
  border-radius: var(--r1);
  color: var(--text-hi);
}

/* Tables */
.body-editor .ProseMirror table {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 0.5em;
}

.body-editor .ProseMirror th,
.body-editor .ProseMirror td {
  border: 1px solid var(--border-default);
  padding: 0.375em 0.75em;
  text-align: left;
  font-size: var(--density-text);
  font-variant-numeric: tabular-nums;
}

.body-editor .ProseMirror th {
  background: var(--surface-1);
  font-weight: var(--fw-medium);
  color: var(--text-hi);
}

.body-editor .ProseMirror td {
  color: var(--text-mid);
}

/* Horizontal rule */
.body-editor .ProseMirror hr {
  border: none;
  border-top: 1px solid var(--border-subtle);
  margin: 1em 0;
}

/* Images */
.body-editor .ProseMirror img {
  max-width: 100%;
  height: auto;
  border-radius: var(--r1);
  margin-bottom: 0.5em;
}

/* Links */
.body-editor .ProseMirror a {
  color: var(--primary);
  text-decoration: underline;
}

/* Bold */
.body-editor .ProseMirror strong {
  font-weight: var(--fw-emphasis);
}

/* Strikethrough */
.body-editor .ProseMirror s {
  text-decoration: line-through;
  color: var(--text-lo);
}

/* Placeholder */
.body-editor .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: var(--text-lo);
  pointer-events: none;
  height: 0;
}

/* Selection */
.body-editor .ProseMirror ::selection {
  background: var(--primary-dim);
}
```

### Token compliance checklist

- Colors: all semantic tokens (`--text-hi`, `--surface-1`, `--border-subtle`, etc.). No hex values. (AQ-008, AQ-009)
- Typography: `var(--ui)` / `var(--mono)`, density-aware text sizes. (AQ-004)
- Radii: `var(--r1)` / `var(--r2)` only. (AQ-011)
- Spacing: 4px-grid multiples via em units relative to density-text. (AQ-001)
- Font weights: 400/500/600 only via tokens. (AQ-004)
- Tabular nums on table cells. (AQ-006)
- No hardcoded colors, no AI-aesthetic tells.

---

## 10. File Structure

```
packages/design-system/src/
  BodyEditor.tsx              # Main component
  BodyEditor.stories.tsx      # Storybook stories
  body-editor.css             # Scoped editor styles
  body-editor/
    slash-menu.tsx            # Slash menu suggestion plugin + dropdown component
    floating-toolbar.tsx      # BubbleMenu wrapper with formatting buttons
    extensions.ts             # Extension builder functions (full/mini)
    use-body-editor.ts        # useEditor hook wrapper with markdown config
```

### Barrel export additions to `packages/design-system/src/index.ts`

```typescript
export type { BodyEditorProps } from "./BodyEditor.js";
export { BodyEditor } from "./BodyEditor.js";
```

### Why this structure

- **BodyEditor.tsx** -- thin orchestrator: creates the editor via the hook, renders EditorContent + BubbleMenu + SlashMenu dropdown.
- **body-editor/** -- internal submodules. Not exported from the barrel. These are implementation details, not public API.
- **body-editor.css** -- imported by BodyEditor.tsx. Scoped styles for ProseMirror content.
- **slash-menu.tsx** -- the suggestion configuration + the React dropdown component rendered via ReactRenderer. Separated because it is conditionally included (full variant only) and has its own rendering concerns.
- **floating-toolbar.tsx** -- the BubbleMenu content. Separated for clarity -- it is always rendered and has its own button state logic.
- **extensions.ts** -- `buildFullExtensions()` and `buildMiniExtensions()`. Pure configuration, no React.
- **use-body-editor.ts** -- wraps `useEditor` with the markdown loading/serialization logic. Handles `initialContent` parsing and `onChange` serialization. Single hook that BodyEditor.tsx calls.

---

## 11. Ordered Implementation Tasks

### Phase 0: Setup (no tests yet)

**Task 0.1 -- Install dependencies**
- Add TipTap packages to `packages/design-system/package.json` (peerDependencies + devDependencies) and `packages/web/package.json` (dependencies).
- Run `bun install`.
- Verify `bun run check` passes (no type errors from new deps).

### Phase 1: Red -- Write failing tests

**Task 1.1 -- Unit tests for markdown round-trip**
- File: `packages/design-system/src/__tests__/BodyEditor.test.tsx`
- Tests:
  - Renders without error (mount with empty content)
  - Renders with markdown content (mount with heading + paragraph)
  - Round-trip: heading markdown -> editor -> serialize -> heading markdown
  - Round-trip: bold/italic/code/strikethrough inline marks
  - Round-trip: bullet list
  - Round-trip: ordered list
  - Round-trip: blockquote
  - Round-trip: code block with language
  - Round-trip: table (header + alignment + rows)
  - Round-trip: horizontal rule
  - Round-trip: image (alt + url)
  - Round-trip: link
  - Round-trip: complex document with multiple block types
  - Calls onChange when content changes
  - Respects editable={false} (read-only)
  - Renders placeholder when empty
  - Mini variant does not register heading/list/etc extensions

**Task 1.2 -- Unit tests for slash menu**
- File: `packages/design-system/src/__tests__/BodyEditor.test.tsx` (same file, grouped describe block)
- Tests:
  - Slash menu items list has exactly 10 entries (h1, h2, h3, bullet, numbered, quote, code, table, divider, image)
  - Each item's command produces the expected node type
  - Items filter correctly by query text
  - Mini variant: no slash menu rendered

**Task 1.3 -- Storybook stories (failing until component exists)**
- File: `packages/design-system/src/BodyEditor.stories.tsx`
- 6 stories as defined in section 8.

### Phase 2: Green -- Implement component

**Task 2.1 -- Extensions module**
- File: `packages/design-system/src/body-editor/extensions.ts`
- Implement `buildFullExtensions()` and `buildMiniExtensions()`.
- Configure all TipTap extensions with Lucid-compatible settings.

**Task 2.2 -- useBodyEditor hook**
- File: `packages/design-system/src/body-editor/use-body-editor.ts`
- Wraps `useEditor` from `@tiptap/react`.
- Accepts `initialContent`, `onChange`, `editable`, `variant`, `placeholder`.
- Loads markdown content via `tiptap-markdown`.
- Registers `onUpdate` handler that serializes to markdown and calls `onChange`.

**Task 2.3 -- Slash menu**
- File: `packages/design-system/src/body-editor/slash-menu.tsx`
- Suggestion extension configuration.
- React dropdown component with keyboard navigation.
- Styled with Lucid tokens.

**Task 2.4 -- Floating toolbar**
- File: `packages/design-system/src/body-editor/floating-toolbar.tsx`
- BubbleMenu wrapper with 5 formatting buttons.
- Active state tracking.
- Link prompt handling.

**Task 2.5 -- Editor styles**
- File: `packages/design-system/src/body-editor.css`
- All ProseMirror content styles using Lucid tokens.

**Task 2.6 -- BodyEditor component**
- File: `packages/design-system/src/BodyEditor.tsx`
- Composes hook + EditorContent + SlashMenu + FloatingToolbar.
- `dsProps("BodyEditor", "2")` on outermost wrapper.
- CSS import for editor styles.

**Task 2.7 -- Barrel export**
- Add `BodyEditor` and `BodyEditorProps` to `packages/design-system/src/index.ts`.

**Task 2.8 -- Stories**
- Complete `BodyEditor.stories.tsx` with all 6 stories.
- Verify they render at `/designsystem`.

### Phase 3: Verify

**Task 3.1 -- Run full verification**
- `bun run check` -- zero type errors
- `bun run lint` -- zero lint errors
- `bun run test` -- all tests pass (including new BodyEditor tests)

**Task 3.2 -- Visual verification**
- Open storybook at `/designsystem`
- Screenshot each story
- Verify: no AI aesthetic violations, Lucid tokens applied, density-responsive, placeholder visible, content renders correctly

### Phase 4: Commit and ship

**Task 4.1 -- Commit**
- One commit per logical change (deps, component, tests, stories) or one squashed commit if small enough.
- Branch: `feat/T1-body-editor`
- Message: `feat(T1): BodyEditor TipTap WYSIWYG component`

---

## 12. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `tiptap-markdown` GFM fidelity gaps (e.g., tables lose alignment) | Medium | High | Round-trip tests for every BlockKind. If a specific case fails, file it as a known limitation and document the gap. |
| TipTap + React 19 compatibility | Low | High | TipTap 2.x officially supports React 18/19. Verify on install. |
| Bundle size concern (50KB+ gzipped for TipTap core) | Low | Low | TipTap is the only editor in the app. 50KB is acceptable for a primary editing surface. Tree-shaking eliminates unused extensions. |
| ProseMirror CSS conflicts with Tailwind reset | Medium | Medium | Scoped `.body-editor` class prevents leakage. ProseMirror's own CSS is minimal (just outline removal). |
| `window.prompt` for link/image URL is rough UX | Expected | Low | Acceptable for v1. Future workpackage can replace with inline popover. |
| Slash menu tippy.js positioning conflicts | Low | Medium | TipTap's suggestion plugin handles positioning. Use default tippy options. |

---

## 13. What This Plan Does NOT Cover

- Surface integration (Knowledge, Bet) -- that is T2/T3.
- Auto-save / debounce / persistence -- surface-level wiring.
- Drag-to-reorder blocks -- deferred.
- Image upload -- URL-only for v1.
- Collaborative editing.
- Markdown source toggle -- deferred (concept doc open question 2).
- HTML component (`.html` file) -- BodyEditor is interactive/stateful and cannot meaningfully render as a static HTML file. It gets TSX + stories only. The design-system rules note `.html` files are "self-contained" static snapshots; an editor requires JS lifecycle.

---

## 14. Self-Critique

**Strengths:**
- Clean variant system with extension-level gating (no runtime conditionals in the render path).
- Scoped CSS avoids global pollution and uses only semantic tokens.
- Round-trip test strategy is concrete and covers all BlockKinds.
- File structure keeps internals private (only BodyEditor + BodyEditorProps exported).

**Weaknesses:**
- `window.prompt` for links/images is the weakest UX point. Acceptable for v1 but should be explicitly tracked for improvement.
- The slash menu dropdown component will need its own React rendering context (ReactRenderer from TipTap). This is well-documented in TipTap docs but adds complexity.
- No E2E Playwright tests specified in this plan (unit tests + visual verification cover the AC). E2E tests make more sense at T2 when the editor is integrated into a real surface.

**Over-engineering check:**
- The `body-editor/` subdirectory with 4 internal files is warranted: each file has a distinct concern (extensions config, hook, slash menu UI, floating toolbar UI). Collapsing them into one file would exceed 400 lines.
- No unnecessary abstractions: the hook wraps `useEditor` directly, no intermediate "editor context" or "editor provider" pattern.

**Scope check:**
- All 9 acceptance criteria from TRACK-T.md are addressed by this plan.
- No scope creep beyond T1 boundaries.
