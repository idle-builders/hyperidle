## Rules

1. **Don't wrap DaisyUI for the sake of wrapping.** Use `btn` directly in a page. Only create a Tier-1 primitive when it adds real semantics (state colour mapping, identity labels, label-value pairing, nav selection, standard search shape).
2. **Merge before you add.** If a new thing looks 80% like an existing Tier-2 block, make it a variant of that block, not a sibling.
3. **One shape per meaning.** One status chip, one card per domain object, one row per list context.
4. **Density over whitespace.** 8/12 px internal padding is the default. Whitespace is earned.
5. **Stitch outputs are mood boards.** A screen ships only after it decomposes into the tree above. If it can't, the screen is wrong — not the tree.
6. **Theme in one place.** All colour, radius, spacing changes happen in `tokens.css` and the DaisyUI theme config. Never in a component.
7. **Conversations owns notifications. Fully.** No bell icon, no top-bar toasts. Triage badge, filter chips, and agent health indicators are the ambient surfaces — they surface awareness without demanding attention.

---
