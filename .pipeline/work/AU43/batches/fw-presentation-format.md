# Delete batch — `fw-presentation-format`

2 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `deriveTitleFromPitch` | fn · UI: WorkBetCreate preview only | Deprecated alias of #1; migrate the one caller, honor the U1 removal promise. |
| 2 | `deriveInitials` | fn · UI: 2 server routes shipping agentInitials fields | Server presentation field; web already owns a different deriveInitials and all 4 web components use it — the split-brain dies with this export. |
