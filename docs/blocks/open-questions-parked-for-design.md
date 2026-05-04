## 13. Open questions parked for `/design`

Designer call during L2's design + critique pass — these do not block the concept:

- Designer call: visual treatment of the per-block anchor (gutter dot, hover-only chip, focus ring on click) and the gutter width.
- Designer call: how the "block deleted" indicator reads on an anchored thread (per L26 contract — concept fixes the data, design fixes the look).
- Designer call: in-block hover affordances for `code` and `table` (copy, expand, language label position) and density of `list` rendering.
- Designer call: typography scale across `heading` levels 1–6 inside the bet-pitch and knowledge-body surfaces (these are different reading densities).
- Designer call: how / whether body-level metadata (front matter, exposed via the sibling `metadata` field per §6) is surfaced to readers — silent, summary chip in the body header, or fully hidden.

Architect call during L2's architecture pass — concept-shaped:

- Architect call: cache placement (in-memory, dedicated `block_cache` table, React-Query-only) and parser-version invalidation flow. (The *existence* of derivation in both client and server, sharing one function in `packages/shared`, is fixed by §10 — placement is the open question, not whether to fork.)
- Architect call: which markdown parser (remark + remark-gfm; micromark; markdown-it) — the contract is GFM-faithful + deterministic + pure; the choice is implementation-side.

---
