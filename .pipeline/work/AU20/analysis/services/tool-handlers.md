# tool-handlers — Service-as-Product Audit (AU20)

Layer: agent-orchestration · Owned tables: 0 · Current public exports: 42

## 1. Existence / Consolidation Verdict — STANDALONE

**Product:** the DB-side agent tool library. It implements the domain-touching body of every
agent-invocable tool (21 tools + `write_session_notes` + `commit_file`) and assembles them into a
role-filterable registry, wiring each tool to the real domain services (`work`/`org`/`knowledge`/
`routine`/`users`/`conversation`/`policy`/`agent-selection`) through its own DI ports. Its OUTSIDE
surface is: "hand me a `ports` bundle and I give you the set of tools an agent (or the assistant
loop) may invoke, already wired to do real work."

**To whom (platform-product framing):** its consumers are other services, so this is a
platform/framework product. Real consumers (from the data package, tests excluded):
- **composition root** (`core-api/tool-handlers-bindings.ts`) — calls `buildAllToolDefinitions(ports)`
  to produce the `RegisteredTool[]` it hands to `tool-provider.buildToolRegistry` (the harness tool
  surface, across the Mechanism-B boundary) and to the session-provisioning role filter.
- **dispatch** (assistant loop) — calls the 3 assistant-draft helpers to build the constrained
  bet-drafting registry for the conversational assistant.

That is exactly **two** capabilities demanded. Everything else in the 42 is internal plumbing
(22 per-tool factory exports + 14 DI port-type exports) leaking through the barrel.

**Why it earns its own boundary (layer reasoning):** it is the DB-half of the §7.5 C1 split. Its
natural sibling is `tool-provider` (agent-execution), which is the *DB-less* half of the same tool
pathway. They are split by a **hard security seam** (Mechanism B: agent-execution holds zero DB /
zero service references so it can run on an untrusted `remote-worker`). `tool-handlers` therefore
**cannot** merge into `tool-provider` — it needs `HyperIdleDb` and reaches 9 services. It is the
coherent "tool bodies + registry assembly" product on the DB side of that seam.

**Candidate-cluster evaluation:**
- **`dispatch-and-tool-bodies` (dispatch + tool-handlers) — REJECT.** The bidirectional coupling is
  real but narrow, and merging is the wrong direction. `dispatch` already bundles ~5 jobs (task
  dispatch, assistant dispatch, routine scheduling, builtin handlers); folding a clean
  single-responsibility service into an already-overloaded god-service *worsens* coherence. The
  back-edge is thin: `nextCronMatch`/`parseCron` are **pure cron utilities that belong in
  `@hyperidle/shared`, not dispatch** (moving them removes 2 of the 3 back-edges); only
  `provisionTeamRoutines` (used by the `create_team`/`create_routine` tool bodies) is a genuine
  same-layer call — one downward DI edge, not a shared product. Different products: dispatch decides
  *when agents run*; tool-handlers defines *what a tool does*.
- **`harness-execution-platform` (with tool-provider) — REJECT (structurally impossible).**
  tool-handlers is the DB-side sibling of that Mechanism-B platform and cannot cross the zero-DB
  seam. Correctly noted in the landscape pass.

The 42-export sprawl is a **barrel over-export smell, not a boundary problem.** The service is one
coherent job; collapse the API, keep the service.

## 2. Deliberate Target Public API — 42 → 4

| # | Interface | Shape | Subsumes | Why a meaningful shared capability |
|---|-----------|-------|----------|-----------------------------------|
| 1 | `buildToolDefinitions` | `(ports, opts?: { role?: UserRole }) => readonly RegisteredTool[]` | `buildAllToolDefinitions` + `toolsForRoleFromPorts` + **all 22 `createXTool` factory exports** | The one product surface: "the tool set, wired." Role is a filter parameter (omit → all). The tool set is internal **data** (a `TOOL_FACTORIES` list), not 22 named exports. |
| 2 | `buildAssistantDraftRegistry` | `(ctx, { userId, transcriptRows, assistantAgentId }, ports) => ToolRegistry` | `buildAssistantDraftRegistry` + `resolveDraftTeamId` + `resolveCurrentDraftBetId` + `AssistantDraftRegistryParams` | One occasion — the assistant's constrained draft loop. Resolve-team and resolve-current-draft are internal steps of *building the registry*, not separate products; fold the resolution inside. |
| 3 | `ToolHandlersPorts<TDb>` | aggregate DI contract | itself + the 13 sub-accessor / handoff / session-context type exports | The one type a composition root needs to wire the service. Sub-accessors (`...WorkAccessor`, `...KnowledgeAccessor`, handoff/session types) are reachable structurally through the aggregate; they need not be individually exported. |
| 4 | `ToolHandlersSessionContext` | struct | itself | Retained only if the assistant/harness caller constructs a `SessionContext` value directly. If it flows through `ToolContext`, drop it → target = 3. |

**Target export count: 4** (2 functions + 1–2 types), down from 42. The 22 per-tool factories and
13 port-type exports leave the public surface entirely.

## 3. Inside Lens (clean / evolvable)

- **Tools stay one-file-each** (zod schema + handler colocated — good cohesion) but are assembled
  through an **internal registry data structure** (`TOOL_FACTORIES: readonly ToolFactory[]` with
  `{ factory, roles? }`), not 22 named barrel exports. Role-narrowing (the 4 facilitator-only tools,
  the `assistant`-only `create_bet`/`edit_bet`) becomes a field in that data, filtered in one place.
- **`ports.ts` stays the Mechanism-C DI seam** — never import a sibling service; keep the
  structural-mirror input types (`CreateTeamInput`, `CreateKnowledgeItemInput`, …) module-internal,
  export only the aggregate `ToolHandlersPorts`.
- **Adding a tool = add file + one line in `TOOL_FACTORIES`.** Public surface untouched.
- **Tests drive the assembled registry** (`buildToolDefinitions(ports).find(t => t.name === …)` or a
  by-name helper) instead of importing 22 factory symbols — this tests the wiring too, strictly
  better coverage, and removes the only reason the factories are barrel-exported today.
- **Reduce the dispatch back-edge:** move `parseCron`/`nextCronMatch` to `@hyperidle/shared` (pure
  functions), leaving one honest downward port (`provisionTeamRoutines`).

## 4. Scaling Argument (sub-linear)

- **Today (fails):** adding a tool touches 3 places *and grows the public API by 1* (new factory
  export). N more tools → N more exports. The 22 `createXTool` exports ARE the method-per-intent
  anti-pattern, one export per tool.
- **Target (passes):** adding a tool adds one internal `TOOL_FACTORIES` entry → **public API
  unchanged.** Dozens more tools add **zero** public exports (constant).
- **New consumer** (e.g. a new provisioning path needing role-scoped tools) **composes**
  `buildToolDefinitions(ports, { role })` — no new method.
- **New filter dimension** (filter by capability / topology / harness family) **extends the `opts`
  param** — still one method (`list(filter)` north-star), never a `toolsForCapability` /
  `toolsForTopology` proliferation.
- **New assistant surface** parameterizes `buildAssistantDraftRegistry`'s input rather than adding a
  `resolveX` helper per field.

## 5. Key Collapses

1. **22 `createXTool` factory exports → 0 public** (internal `TOOL_FACTORIES` data; assembled by
   `buildToolDefinitions`). Biggest single reduction; kills the export-per-tool anti-pattern.
2. **`buildAllToolDefinitions` + `toolsForRoleFromPorts` → 1** `buildToolDefinitions(ports, {role?})`
   (role becomes a filter param).
3. **3 assistant-draft helpers + 1 params type → 1** `buildAssistantDraftRegistry` (team + draft-bet
   resolution folded inside).
4. **14 port-type exports → 1** `ToolHandlersPorts` aggregate (sub-accessors structural/internal).
5. **Bidirectional dispatch coupling → one honest downward edge** by relocating the two pure cron
   utilities to `@hyperidle/shared`.
