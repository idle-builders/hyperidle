# tool-handlers — Product Re-Architecture (AU20, BOTH lenses)

Layer: agent-orchestration · Owned tables: **0** · Current (service-data-23): 26 methods / 18 types · Barrel today: 3 exports.

## 1. INSIDE-OUT — substrate, floor, owned capabilities

**Substrate = internal-logic (owned algorithm).** tool-handlers owns **no DB tables** and adapts **no
external system** (no harness/LLM/git/fs/auth/ws/mcp). It is NOT an adapter — it does not drive an
outside capability. It is the **DB-side agent-tool assembler**: it owns the built-in tool catalog
(22 tool bodies, one file each: zod schema + handler) and the algorithm that **DI-wires each tool to
the real domain services (through Mechanism-C ports) and emits a callable registry**, applying two
owned policies:
  - **role narrowing** (4 facilitator-only tools; `create_bet`/`edit_bet` assistant-scoped), and
  - **constraint injection** for the assistant draft loop (hard-inject `teamId`, force `betId` so the
    model cannot redirect the team or target another bet).

The tools themselves are internal **data**, not surface. The owned algorithm is: *catalog → wire →
filter/constrain → registry.*

**Floor (coherent op set) = 2.** Two genuinely distinct assembly occasions with different
authority semantics:
| Floor op | What it assembles | Why distinct |
|---|---|---|
| `buildToolDefinitions(ports, {role?})` | the full catalog, DI-wired, optionally role-filtered | the base agent tool surface; role is a *filter param* (omit → all) — `list(filter)` shape |
| `buildAssistantDraftRegistry(ctx, {userId, transcriptRows, assistantAgentId}, ports)` | the 2-tool `[create_bet, edit_bet]` registry with `teamId`/`betId` **hard-injected** | a different authority boundary — constraint-injected, not just filtered; can't be expressed as a role of op 1 |

**Genuine owned capabilities beyond the floor: none.** Role = a param. Constraint injection is
intrinsic to op 2. Adding a tool = one internal catalog entry, **zero** public methods. Everything
else the service exposes today is plumbing (per-tool factories + DI sub-types) leaking through the
barrel — not product.

## 2. OUTSIDE-IN — real consumer demand

From the data, exactly **two** demands:
- **Composition root / session-provisioning + harness path** → the wired tool set, role-filterable
  BEFORE a session is live (must decide which tool names to hand the harness). Served by
  `buildToolDefinitions`.
- **dispatch (assistant loop)** → the constrained bet-drafting registry for the conversational
  assistant. Served by `buildAssistantDraftRegistry` (the `buildAssistantDraftRegistry` request in
  the demand data). The other two logged requests — `ingestion`, `create` — are **method chains off
  returned values** (`SessionContext.ingestion`, `knowledge.create`), not calls on this service.

Both lenses converge on the **same 2 operations**. No per-caller method needed.

## 3. THE COHERENT PRODUCT API — 2 methods + 1 type

| # | Interface | Shape | Lens | Source |
|---|-----------|-------|------|--------|
| 1 | `buildToolDefinitions` | `(ports, opts?: { role?: UserRole }) => readonly RegisteredTool[]` | both | owned catalog-assembly algorithm + provisioning/harness demand |
| 2 | `buildAssistantDraftRegistry` | `(ctx, { userId, transcriptRows, assistantAgentId }, ports) => Promise<ToolRegistry>` | both | owned constraint-injection algorithm + assistant-loop demand |
| T | `ToolHandlersPorts<TDb>` | aggregate Mechanism-C DI contract | inside-out | the one type a composition root needs to wire the service |

`RegisteredTool` / `ToolRegistry` / `ToolContext` / `UserRole` are `@hyperidle/shared` leaf types
(not owned here). The 22 structural-mirror input types + 9 port sub-accessor interfaces stay
**module-internal**, reachable structurally through the `ToolHandlersPorts` aggregate.

**Completeness (not lossy):** every current user feature = every agent-invocable tool
(`create_bet`, `create_task`, `send_message`, `handoff_to`, `promote_knowledge`, `route_item`,
`create_team`, `add_agent`, routines, artifacts, …) is delivered as internal catalog data through
`buildToolDefinitions`; role/facilitator authorization survives as the `role` filter; the
assistant's team/bet-constrained drafting survives as op 2. A new tool, new filter dimension, or new
assistant surface extends **data / the opts param / op-2 inputs** — never a new method. Sub-linear.

## 4. TARGET NUMBERS

- **Floor:** 2 (internal-logic coherent op set).
- **targetMethods = 2** (= floor + 0 justified extras). **targetTypes = 1** (`ToolHandlersPorts`).
- Public barrel already at 3 exports (2 fn + 1 type) post-Am10 — both lenses independently confirm
  this is the right floor, not an under-collapse.

**DELETED (gone, not internalized):**
- The still-`export`ed draft helpers `resolveDraftTeamId`, `resolveCurrentDraftBetId`, and the
  `AssistantDraftRegistryParams` interface — fold fully inside `buildAssistantDraftRegistry`, drop
  the `export` keyword; tests drive the public function instead of importing the helpers.
- `parseCron` / `nextCronMatch` reliance — relocate these pure utilities to `@hyperidle/shared`,
  deleting 2 of the 3 dispatch back-edges (leaves one honest downward `provisionTeamRoutines` port).

**INTERNALIZED (kept, made private — already done at barrel):** 22 `createXTool` factories →
`TOOL_FACTORIES` catalog data; 13 port sub-type exports → structural-internal under
`ToolHandlersPorts`; `buildAllToolDefinitions` + `toolsForRoleFromPorts` → the single
`buildToolDefinitions(ports,{role?})`.
