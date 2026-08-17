# Delete batch — `run-orchestration`

7 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `createBareRun` | UI:POST /api/sessions (legacy branch) + seam POST /runs/bare | Second way to start a session, kept for tests/back-compat; kill callers, seam route, and port method with it. |
| 2 | `recordSessionMetadata` | UI:PATCH /api/sessions/:id (effectiveness-only branch) | Its only door branch serves effectiveness scoring, which has no production writer; dies with the feature, branch and all. |
| 3 | `RunTransitionResult` |  | Alias of Awaited<ReturnType<transitionRun>> = unknown. A named type for unknown with zero production consumers. |
| 4 | `AgentTerminationReason` |  | Zero external consumers, and transition-run.ts:30 declares its own private duplicate — the export is a stale mirror. |
| 5 | `CreateBareRunInput` |  | Dies with createBareRun. |
| 6 | `FileWatcherConfig` |  | No external consumer (composition imports only the function); becomes file-internal after the de-loop. |
| 7 | `FileWatcher` |  | Same — the one-member (stop) handle type stays file-internal. |
