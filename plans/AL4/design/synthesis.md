# Synthesis

## Chosen direction

Adopt **Variant A** as the AL4 anchoring interaction.

Rationale: AL4’s job is to replace the textual reference-chip placeholder in `ReviewComposition` with a real, content-following anchor. The existing product already teaches users the “hover a block → discuss → message appears at the block” pattern via `HostThreadSection` and `KnowledgeBody`. Extending that same pattern to review canvases (code lines, prose blocks, regions) is the smallest conceptual leap and the lowest implementation risk. It keeps the comment right next to the thing being discussed, which is the core promise of anchored feedback, and it avoids introducing a new pane inside the already settled center/right-pane composition.

## Rejected

- **Variant B** — persistent side-rail. It is intellectually interesting for dense prose/doc review, but it conflicts with the established block-anchor mental model and would add a third pane inside the examine pane. Parked as a future optional view if review analytics later justify it; not the default for AL4.
- **Coordinate/offset anchoring** — rejected by AL4 concept hard rules; not reconsidered.
- **Per-spot threads / separate artifact thread** — rejected by AL1; one global Thread per Subject stands.
- **Inline suggestion/patch mode** — out of scope for AL4; re-evaluate in a later workpackage.

## Implementation hand-off note

The locked design lives in `approved.md`. A presentational story (`packages/design-system/src/ReviewAnchoredComment.stories.tsx`) renders Variant A’s two key states: code-line hover + inline composer, and an anchored thread under a code line. It is the looked-at artifact for `/design` and the starting visual contract for `/architecture`.
