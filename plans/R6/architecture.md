# R6 Architecture Plan: Artifacts Pipeline

## Concept check (pass-through)

R6 does NOT introduce or reshape any primitive or domain concept. The Artifact primitive is fully documented in `docs/process-layer/artifact-primitive.md`, the canonical shape is implemented in `packages/shared/src/types/artifact.ts`, the DB table exists in `packages/db/src/schema.ts`, API routes exist in `packages/server/src/routes/artifacts.ts`, and all frontend components (ArtifactSection, ArtifactStackItem, ArtifactGalleryCard, ArtifactPreview, etc.) are built. No concept work is needed.

## Required reading

- `docs/process-layer/artifact-primitive.md` (canonical shape, view family, hard rules)
- `packages/shared/src/types/artifact.ts` (ArtifactKind, ArtifactPreview, CreateArtifactInput)
- `packages/server/src/routes/artifacts.ts` (existing POST/GET endpoints, validation schemas)
- `packages/server/src/skill-tools/tool-registry.ts` (ToolDefinition pattern, ToolContext, role-based authorization)
- `packages/server/src/services/session-provisioning.ts` (Phase 10 event loop, tool_call dispatch)
- `packages/server/src/skill-tools/create-item.ts` (reference pattern for a tool that creates DB rows + emits events)

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| "GET /api/artifacts/:id endpoint does not exist" | It **does** exist (artifacts.ts L266-276), fully functional with producingTaskTitle join | AC1 is already satisfied by existing code. Verify with a test. |
| "Artifacts created by agent sessions appear in WorkBet ArtifactSection" | ArtifactSection exists and fetches from `/api/artifacts?axis=bet&betId=X`. WorkBet.tsx L1095 renders it. **But no agent tool can create artifacts.** The `create_artifact` skill tool does not exist in `packages/server/src/skill-tools/`. | The gap is the missing `create_artifact` skill tool. |
| "Artifacts appear in WorkPortfolio artifact gallery" | WorkPortfolio.tsx L251 renders `<ArtifactSection filter={{axis:"portfolio"}} layout="gallery"/>`. This works if artifacts exist in the DB. | Same gap: no tool to create them. |
| "Artifact metadata (kind, cost, timestamp) renders correctly in ArtifactStackItem" | ArtifactStackItem exists in design-system. Cost is always `{money: null, tokens: null}` per O2 decision. Kind and timestamp render from the Artifact wire type. | Works once artifacts are created. Cost rendering shows null state (by design). |
| "Uses existing artifact schema -- no schema changes" | Confirmed. `artifacts` table has: id, producing_task_id, kind, preview_json, created_at. Sufficient. | No migration needed. |

**Core gap:** Agents have no way to create artifacts. The entire frontend and API pipeline exists. The missing piece is a `create_artifact` skill tool that agents invoke during sessions to record their output as artifacts.

## Interrogation (settled decisions)

**Q1: Where should artifact creation happen -- in the tool registry or as an automatic post-session step?**

Answer: **Tool registry.** Agents must decide what constitutes an artifact, choose the correct `kind`, and construct the `preview` payload. This is an active judgment call during execution, not something that can be automatically inferred from session output. The existing tool pattern (`create_item`, `log_task`, `write_memory`) establishes that agents create domain objects via explicit tool calls. Automatic creation would require parsing arbitrary agent output to determine artifact kind/preview, which is both unreliable and out of scope ("no new abstractions").

**Q2: Should we add an `artifact_created` event to the event bus?**

Answer: **Yes, minimal.** The WsBroadcaster forwards domain events to the frontend for real-time updates. Without an event, the frontend would only see new artifacts on page refresh. The event follows the established `ItemCreatedEvent` pattern -- `type`, `streamId`, `artifactId`, `taskId`, `kind`, `timestamp`. It broadcasts on the `"work"` topic (same as `task_state_changed`, `bet_state_changed`) so ArtifactSection can invalidate. Cost: adding one event type to the `KernelEvent` union + one broadcast line in `ws-broadcaster.ts`.

**Q3: What artifact kinds will agents actually produce?**

Answer: The 13 kinds are defined in `ARTIFACT_KINDS`. In practice, the first agents will likely produce `code_diff`, `verification`, `decision`, and `data_analysis`. The tool accepts any valid kind (excluding `unknown_kind`, matching the existing POST validation). The agent's soul prompt guides what kinds to use. This is not an R6 decision -- R6 wires the tool, agents choose the kind.

## Architecture

### 1. New skill tool: `create_artifact`

**File:** `packages/server/src/skill-tools/create-artifact.ts`

The tool follows the exact pattern of `create-item.ts`:
- Zod input schema validates kind (from `ARTIFACT_KINDS`, excluding `unknown_kind`), preview (nullable, discriminated union matching `artifactPreviewSchema` from the route), and an optional description field
- Handler inserts into the `artifacts` table via Drizzle
- Handler emits an `artifact_created` event on the event bus
- Returns `{ artifactId, kind }` on success

**Input schema:**

```typescript
const createArtifactInputSchema = z.object({
  kind: z.enum(ARTIFACT_KINDS).refine((k) => k !== "unknown_kind", {
    message: "unknown_kind is not allowed",
  }),
  preview: artifactPreviewSchema.nullable(),
});
```

The tool does NOT accept `producingTaskId` -- it reads `ctx.taskId` from the ToolContext. This is a hard security constraint: an agent must not be able to attribute artifacts to tasks it is not executing. Same pattern as `log_task` (reads `ctx.taskId`, not from input).

**Handler logic:**

1. Validate input via Zod schema
2. Verify `ctx.taskId` exists in the tasks table (defensive, matches create-item pattern)
3. If `preview` is provided and `preview.kind !== kind`, return `err("KIND_MISMATCH", ...)` (matches route validation)
4. Insert row: `{ id: randomUUID(), producingTaskId: ctx.taskId, kind, previewJson: preview ? JSON.stringify(preview) : null, createdAt: new Date().toISOString() }`
5. Emit `artifact_created` event
6. Return `ok({ artifactId: id, kind })`

### 2. New event type: `ArtifactCreatedEvent`

**File:** `packages/shared/src/events.ts`

```typescript
export interface ArtifactCreatedEvent {
  readonly type: "artifact_created";
  readonly streamId: string;
  readonly artifactId: string;
  readonly taskId: string;
  readonly kind: string;
  readonly timestamp: number;
}
```

Add to `KernelEvent` union. This follows the exact shape of `ItemCreatedEvent`.

### 3. Wire into tool registry

**File:** `packages/server/src/skill-tools/tool-registry.ts`

- Import `createArtifactTool` from `./create-artifact.js`
- Add to `ALL_TOOL_DEFINITIONS` array (no `roles` restriction -- all agent roles can produce artifacts)

**File:** `packages/server/src/skill-tools/index.ts`

- Export `createArtifactTool`

### 4. Wire into WsBroadcaster

**File:** `packages/server/src/services/ws-broadcaster.ts`

Add one subscription forwarding `artifact_created` to the `"work"` topic:

```typescript
const unsub16 = this.eventBus.on("artifact_created", (event) => {
  this.broadcast("work", JSON.stringify(event));
});
```

This lets the frontend invalidate artifact queries when a new artifact is created during a live session.

### 5. No frontend changes

All frontend components already exist and work:
- `useArtifacts` hook fetches from `/api/artifacts?axis=...`
- `ArtifactSection` renders gallery/stack/single layouts with loading/error/empty/populated states
- `ArtifactStackItem` renders kind badge, timestamp, and cost (null cost shows placeholder per O2)
- `ArtifactGalleryCard` renders in gallery layout
- `WorkBet.tsx` L1095 has `<ArtifactSection filter={{axis:"bet", betId:bet.id}} layout="stack" heading="Artifacts"/>`
- `WorkPortfolio.tsx` L251 has `<ArtifactSection filter={{axis:"portfolio"}} layout="gallery" limit={12} heading="Artifacts"/>`
- `GET /api/artifacts/:id` route exists at artifacts.ts L266-276

The only frontend gap is real-time invalidation (addressed by the WsBroadcaster wiring above). The frontend hooks use `useFetch` which does not auto-invalidate on WebSocket events today. This is a pre-existing limitation across all data hooks, not specific to R6. The artifact data will appear on page load/navigation. Real-time push invalidation is a follow-up concern (noted but not in scope).

### 6. Preview schema reuse

The `artifactPreviewSchema` Zod schema is currently defined inline in `packages/server/src/routes/artifacts.ts` (L33-102). The `create_artifact` tool needs the same schema for input validation.

**Decision: extract to shared location.**

Move the Zod preview schema to a new file `packages/server/src/schemas/artifact-preview.ts` and import it from both the route and the tool. This avoids duplicating a 70-line Zod schema. The schema stays in `packages/server` (not `packages/shared`) because it is a server-side validation concern -- the shared package exports TypeScript types, not Zod schemas.

Alternative considered: duplicate the schema in the tool file. Rejected because maintenance drift between two copies of a 70-line discriminated union is a real risk, and the existing codebase has no precedent for duplicating validation schemas.

## Acceptance criteria + verification

| # | Criterion | Verification |
|---|-----------|-------------|
| AC1 | GET /api/artifacts/:id returns artifact data | Integration test: seed a task + artifact row, GET /api/artifacts/:id, assert 200 + correct shape (id, kind, preview, producingTaskTitle, createdAt). **Note:** This endpoint already exists and is tested in `artifacts-route.test.ts`. Write one focused test confirming the response shape matches the Artifact wire type. |
| AC2 | Artifacts created by agent sessions appear in WorkBet ArtifactSection | Integration test: create a ToolContext with a real taskId, invoke `createArtifactTool.handler()` with kind=`verification` and a preview, then GET `/api/artifacts?axis=bet&betId=X`, assert the artifact appears in the response. |
| AC3 | Artifacts appear in WorkPortfolio artifact gallery | Integration test: same as AC2 but with GET `/api/artifacts?axis=portfolio`, assert the artifact appears. |
| AC4 | Artifact metadata (kind, cost, timestamp) renders correctly | Integration test: invoke `createArtifactTool.handler()`, then GET the artifact, assert `kind` matches input, `createdAt` is a valid ISO string, `cost` is `{money: null, tokens: null}` (O2 decision). |
| AC5 | `create_artifact` tool is available to all agent roles | Unit test: call `toolsForRole("builder")`, `toolsForRole("practice_facilitator")`, etc., assert `create_artifact` appears in all results. |
| AC6 | `artifact_created` event is emitted on creation | Unit test: create a ToolContext with an EventBus, invoke the tool, assert the bus received an event with `type: "artifact_created"`, correct `artifactId`, `taskId`, `kind`. |
| AC7 | `artifact_created` event broadcasts on the `"work"` WS topic | Unit test: wire a WsBroadcaster, emit `artifact_created`, assert the `"work"` topic client receives the event. |
| AC8 | Input validation rejects invalid kind, mismatched preview, missing fields | Unit test: invoke with `kind: "unknown_kind"` -> err. Invoke with `kind: "code_diff"` but `preview.kind: "deck"` -> err. Invoke with missing kind -> err. |
| AC9 | Tool reads taskId from context, not from input | Type-level: input schema has no `producingTaskId` field. Unit test: verify the inserted artifact row has `producing_task_id === ctx.taskId`. |

## Ordered task list

### Task 1: Extract preview schema (prerequisite)

**Files:**
- Create `packages/server/src/schemas/artifact-preview.ts`
- Edit `packages/server/src/routes/artifacts.ts` (import from new location)

**Steps:**
1. Create `artifact-preview.ts` exporting `artifactPreviewSchema` (the Zod discriminated union currently at artifacts.ts L33-102)
2. Update `artifacts.ts` to import `artifactPreviewSchema` from `../schemas/artifact-preview.js`
3. Run `npm run check` to confirm no type errors

**Test:** Existing `artifacts-route.test.ts` passes unchanged (proves the extraction is behavior-preserving).

**Protected tests:** `packages/server/src/__tests__/artifacts-route.test.ts`

### Task 2: Add `ArtifactCreatedEvent` to event system

**Files:**
- Edit `packages/shared/src/events.ts`

**Steps:**
1. Add `ArtifactCreatedEvent` interface (type, streamId, artifactId, taskId, kind, timestamp)
2. Add to `KernelEvent` union
3. Run `npm run check` in `packages/shared`

**Test:** Type compilation passes. Event type is in the `EventType` discriminated union.

### Task 3: Create `create_artifact` skill tool

**Files:**
- Create `packages/server/src/skill-tools/create-artifact.ts`
- Edit `packages/server/src/skill-tools/tool-registry.ts` (add to ALL_TOOL_DEFINITIONS)
- Edit `packages/server/src/skill-tools/index.ts` (add export)

**Steps:**
1. Create the tool file following the `create-item.ts` pattern
2. Import `artifactPreviewSchema` from `../schemas/artifact-preview.js`
3. Import `artifacts, tasks` from `@hyperidle/db` and `ARTIFACT_KINDS` from `@hyperidle/shared`
4. Define `createArtifactInputSchema` with `kind` and `preview` fields
5. Implement handler: validate, check task exists, check kind/preview match, insert, emit event, return ok
6. Add to `ALL_TOOL_DEFINITIONS` in tool-registry.ts (no `roles` restriction)
7. Add export to index.ts

**Depends on:** Task 1 (preview schema), Task 2 (event type)

**Test file:** `packages/server/src/skill-tools/__tests__/create-artifact.test.ts`

Tests:
- Happy path: kind=verification with preview -> artifact row inserted, event emitted, returns artifactId
- Happy path: kind=decision with null preview -> artifact row inserted with null previewJson
- Validation: kind=unknown_kind -> INVALID_INPUT error
- Validation: kind/preview mismatch -> KIND_MISMATCH error
- Validation: missing kind field -> INVALID_INPUT error
- Security: producingTaskId comes from ctx.taskId, not from input
- Task not found: ctx.taskId points to nonexistent task -> NOT_FOUND error

### Task 4: Wire `artifact_created` into WsBroadcaster

**Files:**
- Edit `packages/server/src/services/ws-broadcaster.ts`

**Steps:**
1. Add `artifact_created` event subscription forwarding to `"work"` topic
2. Add the unsubscriber to the cleanup array

**Depends on:** Task 2 (event type)

**Test file:** `packages/server/src/services/__tests__/ws-broadcaster.test.ts` (if exists, add a case; otherwise create)

Test: emit `artifact_created` on EventBus -> assert `"work"` topic client received the JSON payload.

### Task 5: Integration test -- end-to-end artifact flow

**File:** `packages/server/src/skill-tools/__tests__/create-artifact.integration.test.ts`

**Steps:**
1. Seed: product, team, bet, task, agent user
2. Build a ToolContext with real DB + EventBus
3. Invoke `createArtifactTool.handler()` with kind=verification and a preview
4. GET `/api/artifacts?axis=bet&betId=X` via test app -> assert artifact appears
5. GET `/api/artifacts?axis=portfolio` via test app -> assert artifact appears
6. GET `/api/artifacts/:id` via test app -> assert full artifact shape (kind, preview, producingTaskTitle, cost=null, threadCount=0)

**Depends on:** Task 3

### Task 6: Tool availability test

**File:** `packages/server/src/skill-tools/__tests__/tool-registry-role.test.ts` (extend existing)

**Steps:**
1. Assert `create_artifact` appears in `toolsForRole("builder")`
2. Assert `create_artifact` appears in `toolsForRole("practice_facilitator")`
3. Assert `create_artifact` appears in `toolsForRole("growth")`

**Depends on:** Task 3

### Task 7: Verify AC1 (existing endpoint)

**File:** `packages/server/src/__tests__/artifacts-route.test.ts` (verify existing coverage)

**Steps:**
1. Review existing test coverage for GET /api/artifacts/:id
2. If the existing test doesn't assert the full Artifact wire type shape (producingTaskTitle, cost, threadCount), add an assertion
3. Otherwise, mark AC1 as covered by existing tests

**Depends on:** None (existing code)

## Security and abuse cases

| Concern | Applicable? | Resolution |
|---------|-------------|-----------|
| Rate-limit on POST | N/A | `create_artifact` is a skill tool invoked within an agent session, not an HTTP endpoint. The session itself is rate-limited by concurrency controls and cost caps. The POST /api/artifacts route already has body-limit middleware (64KB). |
| Input-trust boundary for agent-authored fields | Yes | `kind` is validated against the closed `ARTIFACT_KINDS` enum. `preview` is validated against the discriminated union Zod schema (same as the HTTP route). No arbitrary strings pass through to the DB unvalidated. |
| Task ID attribution | Yes | `producingTaskId` comes from `ctx.taskId` (set by session-provisioning), NOT from agent input. An agent cannot attribute artifacts to tasks it is not executing. |
| Path traversal | N/A | No file paths in the artifact creation flow. Preview contains structured data only. `imageUrl` in screenshot/design previews is a string field, not a file read -- it is stored as-is and rendered by the frontend. |
| SSRF | N/A | No outbound requests made during artifact creation. |
| Payload size | Yes | The `artifactPreviewSchema` constrains the shape. The route's body-limit middleware (64KB) applies to HTTP callers. The tool invocation path does not have a body limit, but the Zod schema constrains the shape to structured data with bounded fields (string arrays, numbers, short strings). A malicious agent could attempt very long strings in preview fields. Mitigation: add `.max()` constraints to string fields in the preview schema where absent (file, subject, claim, rationale, etc.) -- max 4096 chars per string field. This is a hardening step in Task 1. |

## Protected tests

```
packages/server/src/__tests__/artifacts-route.test.ts
packages/server/src/skill-tools/__tests__/tool-registry.test.ts
packages/server/src/skill-tools/__tests__/tool-registry-role.test.ts
```

These test files' existing assertions must not change. New assertions may be added.

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Preview schema drift between route and tool | Eliminated | High | Task 1 extracts to shared location |
| Agent produces invalid preview JSON | Low | Low | Zod validation in tool rejects invalid shapes; same schema as HTTP route |
| Frontend does not refresh after artifact creation | Expected | Medium | WsBroadcaster wiring (Task 4) sends the event. Frontend `useFetch` does not auto-invalidate on WS events (pre-existing limitation). Artifacts appear on navigation. Real-time invalidation is a follow-up. |
| Tool registry exceeds test expectations | Low | Low | Task 6 extends existing role tests, does not break them |

## Out of scope (confirmed)

- Artifact diffing, versioning, inline preview in thread messages (per spec)
- Automatic artifact creation from session output (requires output parsing, unreliable)
- Real-time frontend cache invalidation on WebSocket events (pre-existing gap across all hooks)
- New preview schema for string length hardening beyond what exists (noted as hardening in security section -- implement if time permits, not blocking)

## Dependency graph

```
Task 1 (extract preview schema)  ──┐
Task 2 (event type)  ──────────────┤
                                    ├── Task 3 (create_artifact tool) ──┬── Task 5 (integration test)
                                    │                                   └── Task 6 (role availability test)
Task 7 (verify AC1) ───────────────┘
Task 2 ─── Task 4 (WsBroadcaster wiring)
```

Tasks 1, 2, and 7 are independent and can run in parallel.
Tasks 3 depends on 1 and 2.
Tasks 4 depends on 2.
Tasks 5 and 6 depend on 3.
