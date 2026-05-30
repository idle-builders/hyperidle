# Architecture Critique: R6

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:8 DM:9 N:9 MD:8 FMC:7 S:9 V:8

## Dimension Scores

### 1. Spec Alignment (9/10)

The plan correctly identifies the core gap: agents have no way to create artifacts. All frontend components, API routes, and DB schema already exist. The plan maps each AC to a verification method with concrete test descriptions.

One minor deduction: The plan mentions AC1 (GET /api/artifacts/:id) is "already satisfied by existing code" and proposes writing "one focused test confirming the response shape." This is honest spec reconciliation, not scope creep. The plan stays tightly scoped to the actual gap.

### 2. Layer Integrity (9/10)

The `create_artifact` skill tool lives in `packages/server/src/skill-tools/` which is Agent Runtime layer. It writes to DB via Drizzle (Meta Layer accessed downward) and emits events to the EventBus (Meta Layer). No upward reach. The frontend is untouched. The event type is defined in `packages/shared` (correct location for cross-cutting types). The Zod schema extraction stays within `packages/server` (correct -- validation schemas are server-side, not shared). No layer violations.

### 3. API Contracts (8/10)

The tool's input schema is fully specified with Zod types. The handler's return shape (`ok({ artifactId, kind })`) is documented. Error codes are enumerated (`INVALID_INPUT`, `KIND_MISMATCH`, `NOT_FOUND`). The `ArtifactCreatedEvent` interface is specified field-by-field with types.

Minor gap: the plan does not specify the return shape of the `err` cases as TypeScript types -- it relies on the existing `ToolResult` discriminated union, which is sufficient but implicit.

### 4. Data Model Alignment (9/10)

No schema changes needed. The plan correctly identifies the existing `artifacts` table columns (id, producing_task_id, kind, preview_json, created_at) and maps them to the insert. No migration required. The preview JSON structure matches the existing `artifactPreviewSchema` by reusing it.

### 5. Naming (9/10)

`create_artifact` follows the `create_item` naming convention. `ArtifactCreatedEvent` follows `ItemCreatedEvent`. `createArtifactTool` follows `createItemTool`. `artifactPreviewSchema` is already named. File name `create-artifact.ts` follows `create-item.ts`. All names are honest and consistent.

### 6. Module Depth (8/10)

The tool has a small interface (2 fields: kind, preview) hiding the complexity of validation, DB insertion, and event emission. The preview schema extraction creates a single shared module consumed by two callers (route and tool), which is the right threshold for extraction. No unnecessary abstractions.

### 7. Failure-Mode Coverage (7/10)

See CRITICAL and WARNING findings below. The security section is present and addresses the right concerns, but has gaps around string length bounds and the event union placement.

### 8. Simplicity / Over-Engineering Risk (9/10)

The plan is lean. No feature flags, no abstract base classes, no plugin points. The "alternative considered" for preview schema duplication vs extraction is a real decision, not theatre. The WsBroadcaster wiring is one subscription line. The tool follows existing patterns without inventing new abstractions.

### 9. Verifiability (8/10)

Every AC maps to a named test with concrete assertions. The test file locations are specified. The dependency ordering (tests after their implementation tasks) is explicit. The protected-tests list is populated.

Minor gap: Task 5 (integration test) lists assertions but does not specify how the test obtains a ToolContext with a "real DB + EventBus" that is also connected to the Hono app for the GET requests in the same test. The seeding and wiring pattern needs to be clear so the builder does not invent a fragile test harness.

---

## CRITICAL

None.

## WARNING

**W-1 [plan SS2, "Add `ArtifactCreatedEvent` to event system"]** The plan says "Add to `KernelEvent` union" but does not identify downstream exhaustive switches that will break.

Concrete finding: `packages/server/src/services/observability/dispatcher.ts` L326-468 has a `translateDomainEvent(event: DomainEvent)` function with an exhaustive switch over `event.type` ending in `default: { const Never: never = event; }`. Adding `"artifact_created"` to `KernelEvent` (and thus `DomainEvent`) will cause a compile error at L464 because the new event type is not handled by any case arm.

The builder must add a case for `"artifact_created"` in this switch -- either translating it to an observability entry or explicitly dropping it (like `"item_created"` at L453). Without this, `npm run check` will fail after Task 2.

Fix: Add a step to Task 2 (or create a sub-task of Task 3): update `packages/server/src/services/observability/dispatcher.ts` to handle `"artifact_created"` in its exhaustive switch. The simplest choice is to add it to the explicitly-dropped group at L453-460. Add this file to the "Files" list for the relevant task.

**W-2 [plan SS6, "Preview schema reuse"]** The plan says to extract `artifactPreviewSchema` to `packages/server/src/schemas/artifact-preview.ts` and import from both the route and the tool. However, the `schemas/` directory has a barrel file (`schemas/index.ts`) that re-exports all schemas. The plan does not mention updating this barrel. If the convention is to use the barrel for schema imports, the new file should be re-exported there. If direct imports are preferred, the plan should say so explicitly.

Additionally, the plan says the extraction covers the route and the tool (two consumers), but `artifacts.ts` uses `artifactPreviewSchema` in four places: (1) definition, (2) `createArtifactSchema`, (3) `patchPreviewSchema`, and (4) `rowToArtifact`'s at-rest validation. The extraction must handle all four references in the route file. The plan only mentions "import from new location" generically for the route -- the builder could miss the `rowToArtifact` usage if they only grep for `createArtifactSchema`.

Fix: Task 1 should explicitly list all four references in `artifacts.ts` that will change from local definition to import, and should state whether the barrel re-export is needed.

**W-3 [plan SS4, "Wire into WsBroadcaster"]** The plan specifies broadcasting `artifact_created` on the `"work"` topic. Then in SS5 it acknowledges "The frontend hooks use `useFetch` which does not auto-invalidate on WebSocket events today." This means the WsBroadcaster wiring is inert -- it sends events that no client acts on. This is not wrong (it is forward-compatible), but the plan should explicitly mark this as a non-functional wire for now to avoid the builder spending time debugging "why doesn't the UI update after artifact creation" during integration testing.

Fix: Add a note to Task 4 or the AC7 verification that the broadcast is wired for future real-time invalidation; current verification only proves the event reaches the WS topic, not that the UI reacts.

**W-4 [plan SS1, handler logic, step 3]** The plan specifies: "If `preview` is provided and `preview.kind !== kind`, return `err("KIND_MISMATCH", ...)`." But the Zod `artifactPreviewSchema` is a discriminated union on `preview.kind`. If `kind` is `"verification"` and `preview.kind` is `"deck"`, the Zod parse will succeed (it validates the preview's internal structure against the `deck` variant). The mismatch check is a separate business rule on top of Zod validation. This is correct and matches the HTTP route's behavior at artifacts.ts L286-288. The plan gets this right but should note it is a post-parse business rule, not a Zod-level constraint, so the builder doesn't try to encode it in the schema.

Fix: Minor clarification -- add a note that the kind/preview mismatch check is a post-Zod-parse business rule, performed after both `kind` and `preview` pass their individual schema validations.

## SUGGESTION

**S-1 [plan SS1, "Input schema"]** The plan mentions adding `.max()` constraints to string fields in the preview schema as a hardening step in Task 1 (security section, "Payload size"). Then the "Out of scope" section says "New preview schema for string length hardening beyond what exists (noted as hardening in security section -- implement if time permits, not blocking)." These two statements contradict each other. If string length bounds are in-scope for Task 1, they should be in the task steps. If they are out-of-scope, remove them from the security section's resolution.

Fix: Decide one way. Either add explicit `.max(4096)` steps to Task 1 (recommended -- it is a one-line change per field and eliminates a real abuse vector from agent-authored strings), or remove the hardening mention from the security section entirely. Do not leave it as "maybe."

**S-2 [plan SS3, "Wire into tool registry"]** The plan says "no `roles` restriction -- all agent roles can produce artifacts." This is a reasonable default. However, `ALL_TOOL_DEFINITIONS` is declared as `readonly ToolDefinition[]` and the existing lore comment (tool-registry.ts L106) specifically calls out which tools are restricted. The plan should add a brief lore comment explaining why `create_artifact` is unrestricted, consistent with the existing documentation pattern.

**S-3 [plan, "Ordered task list", Task 5]** The integration test needs a ToolContext with both a real DB and a connection to the Hono app for GET requests. The existing test patterns show two approaches: (1) skill tool tests use `makeContext()` + direct `handler()` calls (no HTTP), and (2) route tests use `createTestApp()` + `app.request()` (HTTP but no ToolContext). Task 5 bridges both. The plan should specify that the integration test seeds via the tool handler, then queries via `createTestApp()` using the same DB instance, to avoid the builder inventing a novel test harness.

**S-4 [plan, "Dependency graph"]** The graph shows Task 7 feeding into Task 3, but the text says Task 7 "Depends on: None (existing code)." The graph line "Task 7 (verify AC1) -----> [junction with Tasks 1,2]" is misleading -- Task 7 is independent and should not appear to feed into Task 3. This is a visual error in the ASCII graph.

Fix: Remove Task 7 from the dependency graph junction, or draw it as an independent node with no outgoing edges.

## What's Working Well

1. **Plan reconciliation table.** The spec-vs-reality table at the top is excellent. It catches that AC1 is already satisfied, identifies the exact gap (missing skill tool), and avoids building things that already exist. This is the most important section of the plan and it is thorough.

2. **Security constraints on `producingTaskId`.** The decision to read `taskId` from `ctx` rather than accepting it as tool input is correct and well-reasoned. The plan cites the existing pattern (`log_task`) and frames it as a "hard security constraint." This prevents artifact attribution spoofing, which would be the most serious vulnerability in this workpackage.

3. **Preview schema extraction decision.** The choice to extract rather than duplicate, with the alternative considered and rejected for a concrete reason (70-line schema drift risk), is a well-made design-it-twice decision. The schema staying in `packages/server` (not `packages/shared`) respects the boundary that Zod schemas are server-side validation, not wire types.
