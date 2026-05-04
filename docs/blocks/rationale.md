## 12. Rationale

The founder reframe in the L2 story is the entire reason this primitive has the shape it does. Two quoted lines from the spec:

> these blocks need to work without agents having to follow formatting or us introducing a new markdown dialect, that will fail. this block element needs to be something that we translate in when ingesting the markdown from the files watched back to the application.

> we do not introduce a new markdown dialect. the markdown dialect stay github dialect compatible

The shape this forces:

- **Agents stay dumb about Blocks.** They write GFM. They do not annotate blocks. They do not learn a new format. They cannot break the block model by writing the "wrong" markdown — because there is no "wrong" markdown. Any GFM body produces a valid block list, with `unknown` as the safety valve.
- **The Knowledge Fabric stays simple.** The file watcher does not parse; it copies. Markdown remains a transparent storage format that humans can `cat`, `grep`, `git diff` directly (per `KNOWLEDGE_ARCHITECTURE.md` §123: "if a file is human-readable, that means a human will actually read it").
- **Block-anchored discussion (L26) is independent of any linking primitive.** The block-anchor is a property of the block — `{ blockId }` — usable today by L1 threads without waiting for L24 (deferred). This is what unblocks L26 from any linking story.
- **Re-derivation is cheap and safe.** Because derivation is pure, every render re-derives if it must; the `body_sha` cache is an optimisation, not a correctness requirement.

The cost is the BlockId algorithm complexity in §8.4 — paid once, in one place, behind a stable contract. The benefit is that every story downstream of L2 (L16, L23, L26, and all future structured-prose surfaces) inherits the same rendering, anchoring, and discussion contract for free, with zero ceremony at the writing surface.

---
