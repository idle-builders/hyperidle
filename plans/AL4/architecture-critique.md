## Architecture Critique: AL4

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:8 LI:8 AC:6 DM:8 N:7 MD:7 FMC:7 S:8 V:8

### CRITICAL
- None.

### WARNING
- [architecture.md §7] The route/API checklist reuses existing routes but omits request/response shapes and status codes, especially for `POST /api/threads/:id/messages` which now carries `spotLabel` and an `artifact` ref. Fix: add a "Request / response" column with the augmented payload and 200/400/403/404 shapes.
- [architecture.md §5.2] `ReviewCommentRef.kind` introduces `"line"` alongside `"artifact" | "block"`, but `"line"` is not a member of the `InlineRefKind` vocabulary. Fix: either fold the line label into `spotLabel` and keep `kind` limited to real `InlineRef` entity kinds, or rename to `ReviewCommentAnchorKind` and document why it is canvas-local.
- [architecture.md §6 ReviewComposition] The error path for a failed `onAddAnchor`/`onPostComment` is not specified; the plan only says the parent re-renders on success. Fix: state what `ReviewComposition` renders on rejection (inline error, retry affordance, or returned composer) and how `ReviewPage` surfaces it.
- [architecture.md §11.1] The review thread attaches to `task` or `bet` host because `HostKind` has no `review` value, which can collapse multiple reviews of the same work item into one thread and weakens the AL1 "one global Thread per Subject" contract. Fix: file an explicit follow-up concept issue and document the limitation in `docs/human-interface-layer/review-primitive.md`.
- [architecture.md §6 ReviewCodeDiff] Synthetic line `blockId` depends on `filePath#hunk${hunkIndex}` plus line text, so file renames or hunk renumbering will orphan anchors. Fix: accept the trade-off but add an `// @lore` comment in `review-canvas.ts` linking to §11.2 and to the AC3 test case so the limitation is visible in code.

### SUGGESTION
- [architecture.md §5.2] `ReviewComment` carries both `refs?: ReviewCommentRef[]` and `anchor?: AnchorRef`, creating two representations of the same address that can drift. Fix: keep `anchor` canonical and derive display refs from it, or keep `refs` canonical and derive `anchor` when it contains an `artifact` entry plus `blockId`/`spotLabel`.
- [architecture.md §8 Security & abuse] The resolved-review bypass mitigation depends on `ReviewCanvasContext.readOnly`, but `ReviewPage` could pass `resolved=false` by accident. Fix: derive `readOnly` from authoritative review state inside `ReviewComposition` rather than relying on the caller.
- [architecture.md §6 New `review-canvas.ts`] `deriveProseBlocks` wraps the shared `deriveBlocks`; if the wrapper is thin, make it pure and add a unit test so prose anchors stay byte-identical with canonical block derivation.

### What's Working Well
- §3 maps every AC to a concrete component test file with a specific assertion shape, satisfying the verifiability gate.
- The security & abuse table addresses AL4-specific risks (metadata length, no coordinate persistence, verdict bypass, resolved-review guard) and ties each to an existing or planned mitigation.
