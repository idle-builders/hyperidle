# Delete batch — `filesystem-mounting`

1 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `AdapterDeps` |  | Zero external references — boot.ts builds the deps structurally without importing it. After feature-kill 1, two of its three members (capturesDir, db) are dead anyway; the survivor is "pass the git-runner factory", which needs no interface. |
