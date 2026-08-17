# Delete batch — `fw-tool-protocol`

6 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `wrapForRegistry` | fn · INTERNAL (tool-definitions.ts, 2 call sites) | Exists to convert the second result grammar back to the first; dies with the AssistantTool family (kill #3). |
| 2 | `composeWorkflowAllowDeny` | fn · TEST-ONLY (AL7-classifier.test.ts) | Promised harness-carrier consumers never wired; the invoke-router does the real work. Delete function + its test cases (kill #1). |
| 3 | `ToolCatalogEntry` | interface · DEAD as import (zero external importers — settings uses the const, type inferred) | Dies with the catalog; the projection's row type lives in tool-handlers (kill #2). |
| 4 | `AssistantToolResult` | type · DEAD as export (zero external importers; internal to the shape's handler signature) | Second result grammar for two tools (kill #3). |
| 5 | `AssistantToolShape` | interface · INTERNAL (tool-definitions.ts, 2 factories: create_bet, edit_bet) | Rewrite the two factories as plain ToolDefinition; the family dies (kill #3). |
| 6 | `BUILTIN_TOOL_CATALOG` | const · UI: indirectly — plugin-configuration.ts:761 seeds tool-capability defaults read by settings routes | 127-line hand-kept mirror of ALL_TOOL_DEFINITIONS guarded by a drift test. Replace with a derived projection injected at the composition root; delete mirror + drift test (kill #2). |
