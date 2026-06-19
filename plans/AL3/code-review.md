# AL3 — Code review

Reviewer: cold read of the implementation against the workpackage (`TRACK-AL.md` §AL3), the approved design (`plans/AL1/design/approved.md`), and `plans/AL3/architecture.md`.

## Verdict: DONE

All acceptance criteria have executable evidence. The composition renders the frame, the right-pane examination via the AL2 canvas registry, the global conversation, and a single Subject-level verdict control.

### AC completeness

| AC | Evidence | Status |
|---|---|---|
| Open one review and see bet/task + prompt + outcome + visible result | `ReviewComposition.test.tsx` AC1 queries prompt, outcome, KPIs, and Before/After proof. | PASS |
| Surface derived gaps/risks/blockers linking to relevant artifact | Needs are rendered; AC3 clicks a need and asserts the linked artifact opens in the pane. | PASS |
| Open any artifact to examine at full size; close returns | AC4/AC5/AC6 exercise pane open/close/Esc on a real `ReviewCodeDiff`. | PASS |
| One global conversation with artifact/spot reference chips | AC7 queries the Conversation section and a reference chip label. | PASS |
| Resolve Subject with one binding verdict, reachable without obscuring | AC8/AC9 assert the Approve / Request changes / overflow buttons call `onSubmitVerdict` with the correct `VerdictDecision`. | PASS |
| Canvas selection by kind (family canvases) | `ReviewComposition.tsx` uses `getReviewCanvas(artifact.kind)` to render the pane. | PASS |
| No per-artifact verdict | Only one `Approve` button exists across the whole tree (test) and verdict props stay in the frame header. | PASS |

### Findings

**CRITICAL — none.**

**WARNING**
- `ReviewPage.tsx:49`: `onSubmitVerdict` is currently a no-op. The AC is satisfied by the callback contract and tests, but production wiring should map this to the thread verdict API in AL7 / a follow-up. Left as a deliberate boundary because this workpackage owns the surface, not the verdict execution loop.

**SUGGESTIONS**
- The review route returns a fixture rather than a persisted Subject; this is the planned AL3 stub and the route shape is real.
- The visible proof (`CheckoutProof`) is hard-coded to the checkout-before/after from the design seed. As the composition is generalized, this should be driven by a `headlineArtifactId` prop in a future workpackage.

### Lenses

- **Architecture:** No layer violations; `ReviewComposition` is pure props and lives in `packages/web`; the server route is a thin stub. AL2 canvas registry reused unchanged.
- **Design:** Matches approved composition layout (header, Task, Result, Needs, Artifacts, Conversation, right pane). CSS uses Hearth tokens by name.
- **Security:** `GET /api/reviews/:reviewId` is behind auth and declares `requireBoundary`. No user input is rendered unsanitized.
- **Adversarial:** Empty block statements in placeholders are intentional no-ops and marked as such. Type coercion for payload accessors is localized in test/fixture helpers.
- **Simplification:** None — the component is large but follows the approved design sections.
- **AI Slop:** None.
