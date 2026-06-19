# AL3 — Architecture critique

Reviewer: cold read of `plans/AL3/architecture.md` + the workpackage spec (`TRACK-AL.md` §AL3) + the approved design (`plans/AL1/design/approved.md`).

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:8 DM:7 N:8 MD:8 FMC:7 S:8 V:8

### CRITICAL
None. The plan covers all ACs, keeps the route already established, and reuses the AL2 canvas registry without leaking cross-layer.

### WARNING
- [AC → verification §"Resolve Subject with one binding verdict"] The plan tests the callback interface but does not yet name the exact HTTP endpoint / payload shape for posting the verdict. Fix: in Phase 3, wire `onSubmitVerdict` to the existing `POST /api/threads/:threadId/messages` (message type `verdict`) and assert the body shape matches `@hyperidle/shared/src/thread.ts` `VerdictPayload`.
- [Data shapes] `ComposedReviewSubject` extends `ReviewSubject`. If AL2 later makes `ReviewSubject` stricter (e.g., adds required fields), the fixture could break. Fix: keep the fixture explicit and type-check it against `ComposedReviewSubject` in a unit test.

### SUGGESTION
- Add a protected-test note in `architecture.md` once Phase 3 lands: the AC table tests in `ReviewComposition.test.tsx` should be treated as frozen because they encode the composition layout contracts. This signals future refactors not to rename the section labels or remove pane behavior silently.

### What's Working Well
- Strong spec alignment: every AC maps to a concrete component test or type-system guard; no invented requirements.
- Layer discipline: web composes from AL2 canvases; server provides a thin, real-shaped endpoint; no front-end DB access.
- Module depth: `ReviewComposition` is pure props, `ReviewPage` owns loading/data, separation is clean for testing.

VERDICT: DONE
