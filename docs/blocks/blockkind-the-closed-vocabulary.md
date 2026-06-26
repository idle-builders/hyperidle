## 6. BlockKind — the closed vocabulary

The `BlockKind` set is **closed**. Adding a new kind requires updating this document first, then `docs/blocks/canonical-shapes.md`, then the consumers. The set ships with **nine content kinds plus an `unknown` sentinel** (ten total), picked to cover the existing GitHub-flavoured markdown the project already uses in pitches and knowledge bodies:

| Kind | Description | Example markdown |
|---|---|---|
| `heading` | Section header (level 1–6). Renders as a styled heading; participates in the document outline used for id stability. | `## Problem` |
| `paragraph` | Run of inline text. Renders as a styled paragraph. | `We see X happening when Y.` |
| `list` | Bullet or ordered list, possibly nested. The whole list is one block; list items are payload children, not separate blocks. | `- one\n- two` |
| `quote` | Blockquote. May contain other inline content; nested blocks inside a quote remain inside its payload. | `> some quoted text` |
| `code` | Fenced code block with optional language tag. Body is preserved verbatim. | ` ```ts\nconst x = 1;\n``` ` |
| `table` | GFM table. Rows and column alignment in payload. | GFM table syntax |
| `divider` | Thematic break (`---` on its own line). | `---` |
| `image` | Block-level image (a paragraph that is solely an image). | `![alt](url)` |
| `html` | Raw HTML block GFM permits. Rendered as a sanitised HTML region; if sanitiser strips it, falls back to a paragraph showing the original source. | `<details>...</details>` |
| `unknown` | Catch-all for AST nodes the parser produces that don't match a known kind. Renders the original source as a paragraph. Exists so derivation never throws. | parser-dependent |

`unknown` is the safety valve. New GFM features land before we close the kind set: derivation must emit a useful block instead of crashing or silently dropping content. When `unknown` blocks start appearing in real bodies, that is the signal to update this list.

**Body metadata is not a Block.** YAML/TOML front matter (and any future body-level metadata) is **not** in `BlockKind`. It is parsed once and returned as a sibling `metadata: BodyMetadata` field on the derivation result:

```
deriveBlocks(body, host) → { blocks: Block[]; metadata: BodyMetadata }
```

`BodyMetadata` is the parsed front-matter object (or `null` when the body has none). The default renderer does not paint it; consumers that need it (a diagnostics panel, the Knowledge index, a chip in the body header) read it from the sibling field. This keeps `BlockKind` aligned with §1's "renderable region" definition — front matter is addressable as data, not as a renderable region.

**Tabs / front-matter exposure / sanitiser policy** are designer/architect calls during the L2 design pass. The kind set is fixed.

**Rendering layer (AM5 — cross-reference).** `BlockKind` stays its own closed AST vocabulary (this section). It is **not merged** into the shared content-Kind set; instead each `BlockKind` **renders through the shared content-Kind `mixture` renderers** — `table`→`data`, the prose grammar (`heading·paragraph·quote·list·divider`)→`text`/mixture, fenced `code`/`image`/`html`→the matching Kind. `mixture` is one of the three closed **Representations** (`single|diff|mixture`) of the shared Kind basis; see `docs/process-layer/artifact-primitive.md` §The three axes and `plans/AM5/concept.md`. This is a rendering-layer reconciliation only — no on-disk dialect, no per-block key, derived-not-stored; the Block hard rules are unchanged.

---
