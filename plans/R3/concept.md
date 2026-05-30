# R3 Concept: Block Rendering in Messages

## Required reading for downstream skills

- `docs/blocks/definition.md` -- Block primitive definition
- `docs/blocks/what-a-block-is-not.md` -- rejection list (item #2 is load-bearing for R3)
- `docs/blocks/where-blocks-render.md` -- render surface table (explicitly excludes Conversations)
- `docs/blocks/contracts.md` -- cardinality, closure, identity contracts
- `docs/blocks/canonical-shapes.md` -- BlockHostKind closed enum, deriveBlocks signature
- `docs/human-interface-layer/thread-primitive.md` -- Message types, PlainPayload shape
- `packages/design-system/src/CommentRow.tsx` -- current plain text rendering
- `packages/design-system/src/block/render-payload.tsx` -- payload dispatch (the reuse target)
- `packages/design-system/src/block/inline.tsx` -- inline node renderer
- `packages/web/src/pages/knowledge/KnowledgeBody.tsx` -- reference: how L23 wires deriveBlocks

---

## Phase 0 -- Nouns

| Noun | Working definition | Classification |
|---|---|---|
| **Block** | Derived, addressable, renderable region of a markdown body. Has id, source, payload, anchor. | **Stable concept** -- R3 does not change what a Block is. |
| **Message** | Element inside a Thread; plain, review, questionnaire, or verdict. | **Stable concept** -- R3 does not change what a Message is. |
| **BlockPayload** | The kind-specific structured shape a renderer needs (heading text + level; paragraph inline AST; code lang + text; etc.). | **Stable concept** -- R3 reuses this type as-is. |
| **MessageBlockPayload** (candidate) | The markdown-derived payload sequence rendered inside a plain message. | **Not a new concept** -- see analysis below. |

**Central question: does R3 introduce a new concept?**

No. R3 introduces no new primitive and reshapes no existing one. It reuses the *rendering infrastructure* (the `renderPayload` dispatch and its per-kind payload components) that was built for the Block primitive, but it does NOT make messages into block hosts, does not derive full Block objects for messages, and does not add "message" to BlockHostKind.

---

## Phase 1 -- Concept probe: "Message as Block host" -- REJECTED

The key concept question is whether `message` should become a `BlockHostKind`. The answer is **no**, for three independent reasons:

### Reason 1: The concept docs explicitly forbid it

`docs/blocks/what-a-block-is-not.md` item #2:

> **A Block is NOT a chat message.** Conversations does not use Blocks. Threads carry messages (per L1); messages are independent shapes (plain, review, questionnaire). Folding "block" and "message" together because both are "things in a list" would create one shape with two sets of contracts and break both.

`docs/blocks/where-blocks-render.md`:

> Conversations does **not** render Blocks.

These are concept-level decisions, not incidental commentary. Violating them would require a concept-doc update and founder sign-off.

### Reason 2: Messages lack the properties that make Blocks meaningful

The Block primitive's essential value comes from:
- **Stable identity** (BlockId) for thread anchoring and cross-body references
- **Source tracking** (hostKind, hostId, bodyDigest) for cache invalidation and host scoping
- **Anchor affordance** for per-block discussion (L26)

Messages need none of these. R3's acceptance criteria explicitly state:
- No per-block discussion anchoring on messages
- No image rendering in messages
- No syntax highlighting

A message's markdown content is ephemeral display formatting, not addressable structured content.

### Reason 3: deriveBlocks is heavier than needed

`deriveBlocks` computes BlockId hashes (blake2s), outline paths, heading stacks, intra-level ordinals, body digests, source ranges, and collision checks. For message rendering, all of that is thrown away -- only the `payload` field is consumed. The right path is to extract the markdown-to-payload mapping as a lighter function that skips the identity/source/anchor machinery.

---

## Phase 2 -- What R3 IS and IS NOT

### What R3 IS

R3 is a **rendering wiring change**. It connects the existing markdown parsing infrastructure (`remark-parse`, `remark-gfm`, via `unified`) and the existing payload rendering components (`renderPayload`, `ParagraphPayload`, `CodePayload`, `HeadingPayload`, `ListPayload`, etc.) to the message display path in `CommentRow`.

The pipeline for R3 is:

```
PlainPayload.text (string)
  -> markdown parse (remark-parse + remark-gfm) 
  -> mdast top-level nodes
  -> map to BlockPayload[] (reusing mdNodeToPayload logic)
  -> renderPayload() per payload (reusing existing components)
```

This is a subset of what `deriveBlocks` does. It shares the parsing and payload-mapping steps but skips the identity, source, anchor, and outline-path steps.

### What R3 IS NOT

1. **R3 is NOT making messages into block hosts.** No new BlockHostKind. No BlockId derivation for messages. No `Block` objects created.

2. **R3 is NOT introducing a new concept.** "Message payload rendering" is an implementation detail of CommentRow, not a domain primitive. It does not need a concept doc entry, a canonical-shapes row, or a vocabulary table entry.

3. **R3 is NOT changing the Block primitive.** The Block concept docs remain untouched. The `where-blocks-render.md` table is not updated -- Conversations still does not render Blocks. What it renders is markdown *formatted using the same visual components*.

4. **R3 is NOT adding new dependencies.** The existing `unified`, `remark-parse`, and `remark-gfm` packages in `@hyperidle/shared` are reused. No new markdown library.

5. **R3 is NOT rendering images in messages.** Image payloads from markdown are degraded to alt-text (consistent with the existing `inlineFromMd` behavior for inline images).

6. **R3 is NOT adding syntax highlighting.** Code blocks get monospace + background surface, matching the existing `CodePayload` component.

---

## Phase 3 -- Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **derivePayloads** | Pure function: markdown string -> BlockPayload[]. The parsing-only subset of deriveBlocks, without identity/source/anchor computation. | "deriveMessageBlocks", "parseMessageMarkdown", "messageBlocks" |
| **BlockPayload** | Existing type from `@hyperidle/shared`. R3 reuses it; does not rename or extend. | "MessagePayload" (collision with Message.payload), "BlockContent" |
| **renderPayload** | Existing function from `design-system/block/render-payload.tsx`. R3 reuses it. | "renderBlock" (that implies the full Block component) |

The function name `derivePayloads` (not `deriveBlocks`) is deliberate. It signals that the output is `BlockPayload[]`, not `Block[]`. No ids, no sources, no anchors. This naming makes the concept boundary visible in code.

---

## Phase 4 -- Contracts

### What R3 commits to

1. **Rendering fidelity.** The same BlockPayload that renders correctly in KnowledgeBody or BetPitch must render correctly in a message. One set of payload components, consistent visual treatment.

2. **No-markdown regression.** Plain text with no markdown syntax must render identically to today's `whitespace-pre-wrap` output. The acceptance criteria are explicit about this. This is verified by checking that `derivePayloads("hello world")` produces a single paragraph payload whose rendered output matches a plain `<p>` with the same text.

3. **Sanitization.** Messages authored by agents can contain arbitrary markdown. The `html` block kind (raw HTML in markdown) must be sanitized before rendering. The existing `sanitizeHtml` callback pattern (injected into `renderPayload`) handles this -- same pattern as KnowledgeBody.

4. **No Block identity.** R3 must NOT compute BlockIds for message content. This is the hard boundary between "reusing rendering components" and "making messages into block hosts."

5. **Closure.** `derivePayloads` produces `BlockPayload[]` using the same closed `BlockKind` set. No new kinds are added by R3.

### What R3 does NOT commit to

- No persistence of derived payloads (messages store `PlainPayload.text`, a string).
- No anchoring, discussion, or linking to message-internal content.
- No outline-path computation or heading-stack tracking.
- No body-digest caching.
- No changes to the Message type union or PlainPayload shape.

---

## Phase 5 -- Architecture hint

The `derivePayloads` function should be extracted from `deriveBlocks` by factoring out the shared markdown-to-payload mapping. Both functions share:
- The `unified().use(remarkParse).use(remarkGfm).parse(body)` pipeline
- The `mdNodeToPayload()` mapping function
- The `inlineFromMd()` inline-node converter
- The URL allowlist gating

`derivePayloads` skips:
- `blockId()` computation
- `normalisedPayload()` computation
- Heading-stack / outline-path tracking
- Body-digest computation
- Collision checking
- Oversize gate (messages are bounded by the server's message-length limit, not the 256KB block body cap)

This factoring is the architect's job. The concept merely notes that the shared code is the parser and payload mapper, not the identity machinery.

---

## Phase 6 -- Self-critique

**Does this concept contradict existing docs?** No. It explicitly respects the Block concept's rejection list. Messages do not become block hosts. Conversations does not render Blocks. The rendering components are reused, but the Block primitive is untouched.

**Is the rejection list real?** Yes. Each rejection is distinct and has a concrete reason tied to the existing concept docs.

**Are the contracts complete?** The four commitments and four non-commitments cover the acceptance criteria. The rendering-fidelity contract is the main one; the no-Block-identity contract is the boundary guard.

**Does "derivePayloads" collide with anything?** Searched the codebase -- no existing function by that name. The name clearly signals "payloads, not blocks." The alternative "parseMarkdownPayloads" is longer without being clearer.

**Is the concept doing too much?** No -- R3 does not introduce a new primitive, so this concept doc is appropriately lightweight. The main value is the explicit decision NOT to make messages into block hosts, documented with reasons.

---

## Rationale

The temptation in R3 is to call `deriveBlocks(message.payload.text, { kind: "message", id: message.id })` and render `Block` components. This would be the shortest code path. But it violates the Block concept's explicit rejection list, adds a seventh BlockHostKind that carries no anchoring/discussion value, computes identity hashes that are immediately discarded, and couples message rendering to the full Block component (with its gutter, drag handle, and actions popover) rather than the lightweight payload renderers.

The right path is to extract the markdown-to-payload mapping, reuse the payload rendering components, and keep messages and blocks as separate concepts that share infrastructure.
