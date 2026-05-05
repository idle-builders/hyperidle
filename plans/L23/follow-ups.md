# L23 — Follow-ups

## R1: LEGACY_DETAILS / LEGACY_SOURCES deferred deletion

**Decision (T-GREEN-4):** LEGACY_DETAILS and LEGACY_SOURCES constants are **kept** in `KnowledgeDetail.tsx`.

**Reason:** The protected `KnowledgeDetail.test.tsx` asserts `"company"` and `"belief"` string labels. These values live only in `LEGACY_DETAILS` (the fixture `MOCK_KNOWLEDGE_ITEMS` k1 uses `layer:"L0"`, `kind:"decision"`). Deleting the constants would break the protected tests.

**What changed:** The `<pre>` rendering path is gone. `KnowledgeBody` now drives the body render. LEGACY_DETAILS data is still consumed by `findDetail()` to supply the layer/kind metadata to the metadata bar — it is no longer used for `<pre>` rendering.

**Deferred to:** L25 (Save-actually-persists). When the data layer replaces the fixture lookup entirely with a real API call, LEGACY_DETAILS and LEGACY_SOURCES can be deleted and the protected test updated to use real fixture data.

## R2: FU-1 (floating-ui wiring) + FU-2 (mobile sheet)

`BlockActionsPopover` floating-ui positioning (FU-1) and mobile-sheet adaptation (FU-2) are L26 prereqs. L23 ships `<Block />` with no `slots.gutterLeading`, so `BlockHandle` never renders and `BlockActionsPopover` is never invoked. Both follow-ups remain open as L26 prereqs.

## L6 inventory pre-closure

When L6 (hardcoded-data inventory) ships and walks the codebase, the following Knowledge body rows are pre-closed by L23:

- `LEGACY_DETAILS` rendering via `<pre>` — deleted in L23.
- `<pre data-testid="knowledge-body">` — deleted in L23.
- `<pre data-testid="knowledge-edit-preview">` — deleted in L23.

LEGACY_DETAILS data constants remain (R1 above). L6 should note this row as deferred to L25.
