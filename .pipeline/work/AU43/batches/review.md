# Delete batch — `review`

15 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `findProposedCall` |  | A1 FINISH — it is the reader the verdict endpoint and the review page both call. |
| 2 | `resolveReengagementRequest` |  | A1 — must additionally bake the approved call, else session 2 can never be grant-bearing. |
| 3 | `recordProposedCall` |  | A1 — must stop hardcoding reversibility:"irreversible" and must mint the review anchor. |
| 4 | `transitionProposedCall (consumed overload)` |  | A1 — the CAS-consume is correct as written. |
| 5 | `transitionProposedCall (non-consumed overload)` |  | A1 — the granted/held/outcome signature is correct as written. |
| 6 | `transitionProposedCall (implementation)` |  | A1 — its granted branch swallows the bake failure; that swallow is the loop's silent-death path. |
| 7 | `handleUnconsumedGrantOnSessionEnd` |  | A1 — the liveness net becomes live the moment grants exist. |
| 8 | `reengageOnAdmissionFailure` |  | A1 — same behavior, second trigger point; its producer returns. |
| 9 | `ReviewAgentWorkIntentInput` |  | A1 — its producer returns. |
| 10 | `ProposedCallQuery` |  | A1. |
| 11 | `ProposedCallView` |  | A1. |
| 12 | `ReengagementResolverDeps` |  | A1 — survives, but its five optional members must become required. |
| 13 | `BakedReengagementRequest` |  | A1 — must carry the approved call. |
| 14 | `ProposedCallTransition` |  | A1. |
| 15 | `ReengagementSourceUnavailableError (class)` |  | A1 — survives in substance, but as a returned result, not a thrown error every caller swallows. |
