## Design Critique: AU20 corrective current-contract recovery

DESIGN-CRITIQUE: variant=current-contract score=8/10  rounds=4  axes: H:8 S:8 T:8 C:8 Co:8 St:8 A:8 AS:9 PP:7

VERDICT: ACCEPT

### CRITICAL

- None.

### WARNING

- None blocking. Current production paint visibly contains AU20 runtime regressions and unresolved behavior; design correctly preserves these as downstream red-proof obligations rather than approving them.

### SUGGESTION

- Keep the capture script's semantic postconditions when later states are added. A successful story render is insufficient unless the named state is visibly present.

### What's Working Well

- Round-3 blocker is resolved. `search-results` visibly renders the open Global Search dialog with “Deploy review”; `search-empty` independently renders the open dialog with “No matches”; postconditions enforce mutual exclusion. `block-actions` visibly renders the real open menu with exactly “Copy permalink” and “View threads.” All originate from production components through the official TSX viewer.
- Artifact no-preview paint is explicitly recorded as a regression: current “NO PREVIEW AVAILABLE” contradicts locked “Preview pending.” It remains a runtime obligation, not accepted current behavior.
- All 26 screenshots have explicit real-story/component provenance; mutually exclusive states are separate; capture fails viewer errors and required semantic-state absence. Handwritten facsimile/collage evidence is removed.
- Viewer is stopped, no AU20 viewer build/process remains, and stale synthetic state directories are absent.
- Contract logic remains exact and coherent: **268 = 94 intentional moves + 58 stale tests/mocks + 23 known regressions + 93 unresolved**; architecture receives all **116 runtime obligations** and 152 test corrections. Settings authority, Assistant dismissal/focus, seven-dialog inventory/nine-ID mapping, Agents, and Status remain settled.

### Handoff

Corrective light design is accepted. Architecture and its independent critique may proceed to the concept gate. Design approval does not authorize test/code edits and does not convert any of the 116 runtime obligations into passes.
