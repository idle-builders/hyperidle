# tool-protocol — destroyer verdict (framework)

## Where does this package go?
**Verdict: SPLIT then dissolve — seam types → `harness-protocol`, behavior → `tool-handlers`, catalog → DELETE. Package dies.**

This package's founding rationale is dead. The AU19 docstring in `tool.ts` says it exists so
`tool-provider` (agent-execution) and `tool-handlers` (agent-orchestration) can share types without
depending on each other. `tool-provider` no longer exists — AU31 moved `tool-registry.ts` into
`tool-handlers`. What remains is one package that owns almost everything (`tool-handlers` imports
16 of the 23 exports and is the sole production caller of 6 of the 9 functions) plus a thin
cross-layer residue of 4 seam types that execution and core-api consume via DI.

That residue (`ToolRegistry`, `ToolResult`, `ToolContext`, `RegisteredTool` + the `ClaudeToolSpec`
member type and the `ok`/`err` constructors) is exactly what `harness-protocol` already is: the
server-side execution-seam contract package, already imported by core-api, agent-orchestration,
agent-execution, and both applications. `tool-protocol` already depends on `harness-protocol`
(for `SessionWorkflow`) and has zero consumers `harness-protocol` doesn't have. Two packages, one
seam, one direction — merge them.

**The three-siblings answer: `tool-protocol` + `harness-protocol` should be ONE package.
`harness-capability` stays a second, separate one.** The audience test decides it:
- `tool-protocol` and `harness-protocol` have the identical audience — core-api / orchestration /
  execution / applications, **zero UI consumers**. Two names for one seam is tidiness, not value.
- `harness-capability` has a genuinely different audience: `core-ui` imports it in 7 files
  (SettingsHarnesses, AgentEditor, SetupFlow, SessionView, …) and must not see the worker
  protocol / EventBus / db-adjacent types that live in `harness-protocol`. That is the one
  audience split AU34 got right. (Its own 15-export surface is another destroyer's problem;
  per the `conversation-parts` finding, that package's edge to it — a six-line composer filter —
  should die regardless.)

So: three packages → two. `tool-protocol` is the one that dies.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/tool-protocol"` — 11 production files across 6 packages; everything else is
tests (30+ files, almost all importing only `ToolContext` to type fixtures).

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `agent-orchestration/tool-handlers` (tool-definitions.ts, tool-registry.ts) | `toRegistered`, `wrapForRegistry`, `toClaudeToolSpec`, `classifyReversibility`, `identityHash`, `ok`, `err`, `AssistantToolShape`, `ToolDefinition`, `BuildToolRegistryOptions`, `RegistrySessionWorkflow`, `ProposedCallWorkflowPort`, `ClaudeToolSpec`, `RegisteredTool`, `ToolContext`, `ToolRegistry`, `ToolResult` | **Yes — it is the real owner.** Sole production caller of 6 of 9 functions. All registry-building machinery moves here. |
| `agent-execution/harness-registry` (mcp-bridge, mcp/index, builtin-harness-adapter, return-status-tool) | `ToolRegistry`, `ToolResult`, `RegisteredTool`, `ToolContext`, `ok` | No — it consumes the built registry via DI. Needs a shared home → `harness-protocol`, which it already imports in 12 files. |
| `agent-execution` (boot.ts) | `RegisteredTool`, `ToolRegistry` (types) | No — same as above. |
| `agent-orchestration` (run-orchestration-composition.ts) | `ProposedCallWorkflowPort`, `ToolContext`, `ToolRegistry` (types) | Partly — same layer as `tool-handlers`, imports the port from there. |
| `core-api/review` (proposed-call-workflow.ts) | `ToolResult` (type, one import) | No — one type → `harness-protocol`, already a core-api dependency. |
| `core-api/settings` (plugin-configuration.ts) | `BUILTIN_TOOL_CATALOG` (one call site, line 761) | Yes — via a DI parameter wired at the composition root. The static import dies with the catalog. |

## If written today, from scratch

There is no `tool-protocol` package. The seam contract — "orchestration builds a tool registry,
execution invokes it, review records outcomes" — is five types and two 3-line constructors inside
`harness-protocol`:

- `ToolResult`, `ok`, `err`
- `ToolContext`
- `RegisteredTool`
- `ToolRegistry` (whose face carries `ClaudeToolSpec`)

Everything that *builds* registries (`ToolDefinition`, `toRegistered`, `toClaudeToolSpec`,
`classifyReversibility`, `identityHash`, `BuildToolRegistryOptions`, `RegistrySessionWorkflow`,
`ProposedCallWorkflowPort`) lives inside `tool-handlers`, mostly unexported. The builtin-tool
catalog is a projection computed from `ALL_TOOL_DEFINITIONS`, not a hand-maintained mirror.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 7 |
| MERGE | 16 |
| SIMPLIFY | 0 |
| KEEP | 0 |
Surface: 23 exports → 0 (package deleted; ~9 survive as public exports elsewhere — 7 in `harness-protocol`, ~2 in `tool-handlers` — the rest become unexported internals or die). 100% of the package cut.

## Feature-level kills

1. **The AL7 native-carrier allow/deny composer never shipped.** `composeWorkflowAllowDeny`'s own
   docstring promises it is "used by per-harness native carriers (Claude allowedTools/
   disallowedTools)". No production file imports it — only
   `layers/core-api/src/__tests__/AL7-classifier.test.ts`. The real enforcement is the router
   inside `tool-registry.invoke`. TEST-ONLY = dead code plus a test that dies with it.
   What breaks: nothing; the native-carrier optimization was never wired.

2. **The hand-maintained builtin-tool mirror.** `BUILTIN_TOOL_CATALOG` (127 lines of duplicated
   name/description/roles/reversibility) exists only because `settings` (core-api) can't import
   `tool-handlers` (orchestration), and it is kept honest by a dedicated drift test
   (`builtin-tool-catalog-consistency.integration.test.ts`) that deep-equals it against
   `ALL_TOOL_DEFINITIONS`. A mirror plus a test proving the mirror is a mirror is pure ceremony.
   Kill both: `tool-handlers` exports a catalog *projection* derived from `ALL_TOOL_DEFINITIONS`;
   the composition roots (desktop, remote-server — they already import both layers) inject it into
   the settings service. Drift becomes impossible instead of tested-for.
   What breaks: one new constructor parameter on the settings service, one wiring line per app.

3. **The second way to define a tool.** The AD8b `AssistantToolShape`/`AssistantToolResult`/
   `wrapForRegistry` family exists so exactly **two** tools (`makeCreateBetTool`,
   `makeEditBetTool` in tool-definitions.ts) can return `{status: "ok"|"error"}` instead of
   `{success: boolean}` — and `wrapForRegistry` immediately converts it back to `ToolResult`.
   Two result grammars for one idea. Rewrite those two handlers as plain `ToolDefinition` + `ok`/
   `err` (mechanical, behavior-neutral — the wrapper already erased the difference on the wire)
   and delete all three exports.

4. **Centralized types nobody centralizes on.** `RegistrySessionWorkflow` was placed here to be
   shared — `run-orchestration/provisioner.ts:298` instead maintains its own structural copy
   (`SessionLifecycleRegistrySessionWorkflow`). The center bought nothing; the type goes to its
   one real importer, `tool-handlers`.

## Full export audit

Reach evidence: per-symbol `rg -a` over `layers framework applications tools` excluding tests;
graph blind spots re-checked for the three DEAD/TEST-ONLY rows (no dynamic dispatch on any of
these names — they are direct imports everywhere they appear; catalog is data, not dispatched).

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `ok` | fn | INTERNAL (tool-handlers bodies ×26 tools, harness-registry return-status-tool ×2) | MERGE → `harness-protocol` | 3-line constructor of `ToolResult`; rides with the type both layers consume. |
| 2 | `err` | fn | INTERNAL (tool-handlers bodies) | MERGE → `harness-protocol` | Same — the failure constructor lives next to the union it builds. |
| 3 | `toRegistered` | fn | INTERNAL (tool-definitions.ts only) | MERGE → `tool-handlers`, unexport | One production caller; boundary-erasure adapter for the registry builder — internal detail of building. |
| 4 | `wrapForRegistry` | fn | INTERNAL (tool-definitions.ts, 2 call sites) | DELETE | Exists to convert the second result grammar back to the first; dies with the AssistantTool family (kill #3). |
| 5 | `toClaudeToolSpec` | fn | INTERNAL (tool-registry.ts only + 1 test) | MERGE → `tool-handlers`, unexport | One production caller; the registry's `toClaudeToolSpecs()` face is the public thing, this helper is not. |
| 6 | `classifyReversibility` | fn | INTERNAL (tool-definitions.ts, tool-registry.ts) | MERGE → `tool-handlers` | Both callers in one package. 12 lines of if-chain is not a framework concern. |
| 7 | `canonicalJson` | fn | TEST-ONLY as export (only `identityHash` calls it in production; AL7-classifier.test imports it) | MERGE → into `identityHash` body | Sort-keys-then-stringify is an implementation detail of the hash; the export is dead. |
| 8 | `identityHash` | fn | INTERNAL (tool-registry.ts only; other `identityHash` hits are DB column/field names, not this function) | MERGE → `tool-handlers` | One production caller. The hash lands in `proposed_calls.identity_hash` as convenience metadata; the producer owns the producer function. |
| 9 | `composeWorkflowAllowDeny` | fn | TEST-ONLY (`AL7-classifier.test.ts`) | DELETE | Promised harness-carrier consumers never wired; the invoke-router does the real work. Delete function + its test cases (kill #1). |
| 10 | `ToolCatalogEntry` | interface | DEAD as import (zero external importers — settings uses the const, type inferred) | DELETE | Dies with the catalog; the projection's row type lives in `tool-handlers` (kill #2). |
| 11 | `ToolContext` | interface | Cross-layer: run-orchestration-composition, tool-handlers, harness-registry return-status-tool; ~25 test files | MERGE → `harness-protocol` | The genuine per-invocation seam contract every tool body receives; both layers need it, so it lives in the seam package. |
| 12 | `ToolResult` | type | Cross-layer: core-api/review, harness-registry mcp-bridge, tool-handlers | MERGE → `harness-protocol` | Three layers consume it; it is the wire shape of the seam. |
| 13 | `ToolHandler` | type | DEAD as export (zero external importers; only used as a member type inside this file) | DELETE export | Becomes an unexported alias next to `RegisteredTool`. Nobody names it. |
| 14 | `ToolDefinition` | interface | INTERNAL (tool-definitions.ts; return-status-tool hits are comments) | MERGE → `tool-handlers` | The authoring shape for tool bodies — lives with the 26 bodies and `toRegistered`. |
| 15 | `RegisteredTool` | interface | Cross-layer: agent-execution boot.ts (extraTools), harness-registry return-status-tool, tool-handlers | MERGE → `harness-protocol` | Execution injects extra tools of this shape into the registry — a real seam type. |
| 16 | `ClaudeToolSpec` | interface | INTERNAL by import (tool-registry.ts only; harness-registry consumes it structurally via `registry.toClaudeToolSpecs()` at builtin-harness-adapter.ts:1007) | MERGE → `harness-protocol` | Member of `ToolRegistry`'s face; rides with it. |
| 17 | `ToolRegistry` | interface | Cross-layer: boot.ts, harness-registry (mcp/index, mcp-bridge, builtin-harness-adapter), run-orchestration-composition; ~8 test files | MERGE → `harness-protocol` | **The** seam: orchestration builds it, execution invokes it. The one export that justifies any shared home at all. |
| 18 | `RegistrySessionWorkflow` | interface | INTERNAL (tool-registry.ts only; provisioner.ts keeps its own structural copy, harness-port.ts hit is a comment) | MERGE → `tool-handlers` | The one place that would share it already copied it instead (kill #4). Centralization proved worthless. |
| 19 | `BuildToolRegistryOptions` | interface | INTERNAL (tool-registry.ts only; composition infers it from `buildToolRegistry`'s signature) | MERGE → `tool-handlers`, unexport | A function's own options bag exported for uniformity — nobody imports it in production. |
| 20 | `ProposedCallWorkflowPort` | interface | INTERNAL to agent-orchestration (run-orchestration-composition.ts, tool-registry.ts; core-api/review implements it structurally without importing) | MERGE → `tool-handlers` | One implementation, but the seam is layer-real (orchestration cannot import review; composition wires it). Both importers are agent-orchestration — the port belongs to the layer that consumes it, not a framework package. |
| 21 | `AssistantToolResult` | type | DEAD as export (zero external importers; internal to the shape's handler signature) | DELETE | Second result grammar for two tools (kill #3). |
| 22 | `AssistantToolShape` | interface | INTERNAL (tool-definitions.ts, 2 factories: create_bet, edit_bet) | DELETE | Rewrite the two factories as plain `ToolDefinition`; the family dies (kill #3). |
| 23 | `BUILTIN_TOOL_CATALOG` | const | `UI:` indirectly — plugin-configuration.ts:761 seeds tool-capability defaults read by settings routes | DELETE | 127-line hand-kept mirror of `ALL_TOOL_DEFINITIONS` guarded by a drift test. Replace with a derived projection injected at the composition root; delete mirror + drift test (kill #2). |

Also dies with the package: `framework/tool-protocol/src/__tests__/tool.test.ts` (its surviving
cases move with the functions into `tool-handlers`), and the
`builtin-tool-catalog-consistency.integration.test.ts` drift test.

## Holes this leaves

1. **`harness-protocol` grows a `zod` type dependency** (`RegisteredTool.inputSchema: z.ZodType`).
   Type-only import; acceptable price for deleting a package.
2. **Settings service gains a constructor parameter** (`toolCatalog`); desktop and remote-server
   composition roots each add one wiring line from `tool-handlers`' derived projection. If a
   future third app forgets the wire, plugin defaults for builtin tools are empty — loud at first
   use, not silent.
3. **`create_bet`/`edit_bet` handlers get rewritten** from status-shape to `ToolResult`. Behavior
   is provably identical (the deleted wrapper already normalized them), but it touches two
   HIGH-RISK-labeled tool bodies; their existing integration tests must stay green unmodified.
4. **~30 test files churn an import path** (`@hyperidle/tool-protocol` → `@hyperidle/harness-protocol`
   for `ToolContext`/`ToolRegistry`). Mechanical, zero logic change.
5. **If AL7 native carriers are ever actually built**, `composeWorkflowAllowDeny` must be
   rewritten (~20 lines). It was never called; git history keeps it.
6. **Package count**: framework loses one package; the AU19 "Mechanism C" doc comments in
   `tool-handlers` need their pointers updated or they'll describe a package that no longer exists.
