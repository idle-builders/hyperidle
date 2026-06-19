# AL3 — Concept note

Workpackage AL3 does **not** introduce a new primitive. It composes the already-locked review nouns into a single surface.

- **Subject** — the top-level thing under review. Locked in AL1 / `plans/AL1/concept.md`; a set of artifacts resolved by one verdict.
- **Artifact / kind** — locked in AL1 / AL2; `ReviewCanvasKind` is the family vocabulary (`code_diff`, `action_operation`, `field_change_set`, `metrics_moved`, `rendered_in_context`, `visual_diff`, `batch`, `browser_preview`, `outcome_summary`).
- **Verdict** — locked in `@hyperidle/shared/src/thread.ts`; `VerdictDecision` has five values (`approve`, `approve-with-comments`, `request-changes`, `edit`, `reject`) and resolves a Subject.
- **Thread / conversation** — locked thread model; one global conversation per Subject. AL3 uses `PlainPayload` messages with optional artifact-reference chips, deferring real anchored comments to AL4.

## What AL3 adds

A **composition surface** that turns the AL2 artifact list into a coherent review page:

```
ReviewPage (route /work/bet/:betId/review/:reviewId)
└─ ReviewComposition
   ├─ FrameHeader        (bet›task breadcrumb, author→reviewer, tools, cost, verdict)
   ├─ TaskSection        (the real prompt + source link)
   ├─ ResultSection      (outcome, KPIs, visible proof, intent met-line)
   ├─ NeedsSection       (derived risks, each jump-linked to an artifact)
   ├─ ArtifactsSection   (thin opener rows per artifact)
   ├─ ConversationSection (one global thread, reference chips)
   └─ ExaminePane        (right pane, canvas from AL2 registry)
```

No change to verdict semantics, canvas selection rules, or thread model. The review is one Subject, one verdict.
