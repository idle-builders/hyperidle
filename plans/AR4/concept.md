# Concept — The assistant is a normal agent

**Workpackage:** AR4 · **Load-bearing noun reshaped:** the assistant ·
**Status:** concept (pre-design, pre-architecture). Source of truth: `.pipeline/work-packages/TRACK-AR.md` §AR4.

This concept does one thing: it dissolves the assistant's special status. After AR4 the assistant
is **the individual agent**, formed by the active strategy and run by the same harness + provisioning
machinery as every other agent. The doc locks four things: (1) the assistant's identity, (2) the
**strategy ↔ kernel formation boundary** (founder-locked — recorded, not re-litigated), (3) the
**formation seam** the assistant emits, and (4) whether the conversational turn is a *new mode on the
shared provisioning path* or *a new seam on the harness adapters* — it is the former.

---

## 1. Identity — what IS the assistant?

The assistant is **the individual agent: the one AI agent each human user owns, scoped to that user
rather than to a team.** It is a `users` row with `id = ast-${userId}`, `role = "assistant"`,
`agentCategory = "individual"`. It is created (today, two lazy-create sites) through the *same*
strategy formation call as every other agent (`getActiveStrategy().scaffoldAgents({trigger:"user_assistant"})`),
and after AR4 it is *run* through the same `provisionSession` path as every other agent.

The only things that make the assistant the assistant rather than a team agent:

- **Ownership / scope.** It belongs to a human user (`ast-${userId}`), not a team. `agentCategory:"individual"`.
- **Occasion.** It is invoked conversationally — a user posts a message in a thread and the assistant
  replies — rather than being dispatched onto a task off a bet. (After AR4 this *occasion* is the only
  difference; the *mechanism* that serves it is the shared one.)
- **Tool surface.** Its conversational form carries a narrow draft-shaping tool surface
  (`create_bet`, `edit_bet`) decided by the strategy at formation time — not the full team-agent role surface.

Everything else — harness, model, persona, the run path, the tool-delivery mechanism — is the agent
machinery, not assistant machinery.

### The reshape in one sentence

> Before AR4 the assistant was *a builtin-only in-process chat path that happened to be backed by a
> `users` row*. After AR4 the assistant is *a normal agent whose conversational occasion is served by a
> conversational mode of the shared provisioning path*.

---

## 2. Essential properties

1. **Harness-and-model-agnostic.** The assistant answers through whatever harness/model it is configured
   with — `builtin`, `claude`, `codex`, or `opencode`. A user who has only a CLI harness connected (no
   `OPENROUTER_API_KEY`) gets a working reply through that harness, never a `missing_key` notice.
2. **User-configurable (Settings, like every other agent).** Its `harnessType` / `modelId` /
   `modelProvider` are set by the user in Settings, validated against the same `(harness, provider, model)`
   compatibility rules team agents use (`validateHarnessModelTriple`, agents.ts).
3. **Strategy-formed.** Its persona and tools are decided by the **active strategy** at
   formation/turn time through the same formation seam every other agent uses — not read from a hardcoded
   constant. Switching the active strategy changes the assistant's form.
4. **Run through the shared machinery.** There is no assistant-only adapter branch and no builtin-only
   special-case (`setSessionToolRegistry` on the concrete class, the `config.messages` branch, the
   `sandboxPath:""` no-mode provisioning) that bypasses the harness/strategy seams.
5. **Never silent.** Every turn ends in a persisted reply *or* one of the existing notice classes
   (`missing_key` / `missing_harness` / `provider_error`); **no secret ever appears in a notice.**
6. **One per user.** Exactly one configurable assistant per human user. No multi-assistant, no per-thread
   override (out of scope).

---

## 3. What the assistant ISN'T (rejection list)

The rejection list is load-bearing — these are the silent assumptions AR4 kills.

- **NOT a builtin-only chat path.** It is not "the in-process OpenRouter chat loop." `runAssistantTurn`
  as a parallel, harness-blind reimplementation of provisioning **ceases to exist as a special path**.
- **NOT OpenRouter-coupled.** A user without an OpenRouter key is not blocked. `missing_key` is reserved
  for the case where the *configured* harness genuinely needs a credential the user hasn't supplied — it
  is no longer the default failure for "no OpenRouter key."
- **NOT a strategy that picks its own harness/model.** The strategy forms the assistant's **persona and
  tools** (the WHO); it does **NOT** write `harnessType`/`modelId`/`modelProvider`. That is Kernel/user
  config. (§4 — founder-locked.) A strategy that sets harness/model is doing Kernel work
  (`AgentScaffoldSpec` @lore, strategy-port.ts:153-166).
- **NOT a new harness adapter capability.** The conversational turn is **not** a new method or branch on
  the `HarnessAdapter` interface. We do not widen `ConversationMessage`/the `messages` seam into the CLI
  adapters (harness-adapter.ts @lore: "ConversationMessage is NOT widened — no message-seed path").
  The transcript reaches the model through the *shared provisioning prompt-assembly path*, not a new
  adapter contract.
- **NOT a second tool-delivery mechanism.** The assistant's draft tools (`create_bet`, `edit_bet`) flow
  to the model through the **same** registry → (builtin in-process | CLI-via-MCP-bridge) split that
  `provisionSession` already implements — not a private `setSessionToolRegistry` call against the
  concrete builtin class.
- **NOT a team agent.** It is scoped to a user, invoked conversationally, and carries a narrow draft tool
  surface. We are not reworking team-agent config or the strategy port's other methods.
- **NOT t3 / a session dial-in.** The conversational turn is the deliberate, threaded reply occasion
  (MEMORY: conversation ≠ session). The *mode* we add to provisioning serves that occasion; it is not a
  general session-reuse mechanism.

---

## 4. The strategy ↔ kernel formation boundary (FOUNDER-LOCKED — recorded, not decided here)

The WP spec flags a tension: the existing split puts **persona/tools in the Strategy** and
**harness/model in the Kernel/user-config**, while one founder framing reads "the strategy decides what
the assistant is formed like (persona, tools, model, harness)." **The founder has locked the boundary.**
This concept records it; it does not re-open it.

> **LOCKED:** Settings/Kernel owns **harness + model** (user config, exactly like every other agent).
> The **strategy** owns **persona + tools** and emits the **formation event**. A strategy MUST NOT set
> `harnessType`/`modelId`/`modelProvider` (existing `@lore` on `AgentScaffoldSpec`, strategy-port.ts).

Rationale (for the next agent, so nobody re-litigates):

- It preserves the existing, verified `@lore` invariant on `AgentScaffoldSpec` (no harness/model field
  on the spec) — the whole roster (team agents *and* the assistant) gets harness/model from the Kernel
  default + the user's Settings config, not from the strategy. The assistant is treated **identically**
  to a team agent here, which is the entire point of "the assistant is a normal agent."
- It matches the user-facing model: a user who runs Codex configures *their* harness in Settings; the
  strategy shaping the persona shouldn't override that choice.
- Moving harness/model into the strategy would (a) invert the locked boundary, (b) make the assistant
  *less* like a normal agent, and (c) break the agents.ts triple-validation contract. Rejected.

**The formation event (the genuinely-missing seam).** Today the strategy formation call
(`scaffoldAgents`) runs only at **creation** (lazy-create in `assistant.ts` / `users.ts`), and
`runAssistantTurn` **never calls `getActiveStrategy()` at turn time** — it reads persona/harness/model
straight off the `users` row and hardcodes the 2 tools inline (`assistant-turn.ts`). That is the gap:
the assistant's *form* (persona + tools) is frozen at the row, not strategy-decided at the turn.

AR4 introduces a **formation seam** the assistant turn consults so the strategy shapes the turn:

- **What it is:** at turn time the assistant emits a formation request and the active strategy answers
  with the assistant's **persona + tool surface** for this turn. Concretely this is *the same
  `scaffoldAgents`-shaped contract already in the Strategy Port* applied at the turn, not a brand-new
  port method — the assistant turn asks the active strategy "what is the assistant's form?" and gets back
  persona (already the `systemPrompt` field) + the tool surface (the draft tool set), rather than reading
  the hardcoded persona + the inline 2-tool builder. (The architecture phase decides whether this reuses
  `scaffoldAgents` directly, adds a thin `formAssistant`-style method, or threads a `trigger:"user_assistant"`
  formation through the existing port — that's a port-shape decision, not a concept decision. The
  **concept lock** is: *the turn consults the active strategy for persona + tools; harness/model come from
  the row, which came from the user's Settings config.*)
- **Why "event/seam" and not just a function call:** the founder's framing is that the assistant *emits
  a formation request* and the strategy *shapes* the result. Whether the mechanism is a synchronous port
  call (like `scaffoldAgents`/`selectAgent` today — both are synchronous-within-flow) or an eventBus
  emission is an architecture decision. The **concept requirement** is only: the assistant's persona +
  tools at turn time are **produced by the active strategy**, reproducibly, such that *switching the
  active strategy changes the assistant's form* (AC3 + validation scenario 3). The existing port methods
  are all synchronous-within-flow; matching that is the boring default unless architecture finds a reason
  to make formation an event.

**Boundary table (the one-glance contract):**

| Aspect | Owner | Source at turn time |
|---|---|---|
| Persona (`systemPrompt`) | **Strategy** | active strategy's formation answer |
| Tool surface (draft tools) | **Strategy** | active strategy's formation answer |
| `harnessType` | **Kernel/User** | `users` row (set via Settings) |
| `modelId` / `modelProvider` | **Kernel/User** | `users` row (set via Settings) |
| Run mechanism | **Kernel** | shared `provisionSession` (conversational mode) |

---

## 5. The conversational turn: a mode of the shared provisioning path (NOT an adapter seam)

This is the central composition decision. **Decision: the conversational turn becomes a conversational
mode of the shared `provisionSession` path.** It is NOT a new conversational seam on the harness adapters.

### Why this is the only coherent answer (grounded in the audit)

`provisionSession` (session-provisioning.ts) **already** implements every piece the harness-agnostic
turn needs, and **already** runs all four harnesses:

- **Harness-agnostic tool delivery.** Phase 8 builds the registry via `buildToolRegistry(ctx,…)`; Phase
  8.5a injects it into the builtin harness in-process; Phase 8b creates the **MCP bridge** and writes the
  per-harness MCP config (`.mcp.json` for claude, `writeCliMcpConfig` for codex/opencode) so CLI harnesses
  call the *same* registry through MCP. This is exactly the split AR4 needs — the assistant's draft tools
  ride it instead of `setSessionToolRegistry`-on-the-concrete-class.
- **Harness-agnostic prompt delivery.** Phase 8.5 assembles the prompt and writes AGENTS.md/CLAUDE.md
  into the sandbox; the CLI adapter seeds an initial user message + the binary reads AGENTS.md. The
  builtin adapter reads `assembledPrompt`. One assembly, four harnesses.
- **A real sandbox + MCP bridge.** The carve-out's own `@lore AR4` reason for builtin-only
  (`honest-harness-predicate.ts:64-68`) is *"`runAssistantTurn` builds `sandboxPath:""` … no `.mcp.json`
  bridge … forcing CLI lanes would test a path that does not exist."* Routing the turn through
  `provisionSession` gives it a real sandbox cwd **and** the MCP bridge — which is exactly what makes the
  CLI lanes real, which is what lets the carve-out be removed.

By contrast, "a conversational seam on the harness adapters" would mean teaching every CLI adapter to read
`config.messages` and run a chat completion — duplicating prompt assembly, tool delivery, and the MCP
bridge per adapter, and widening the shared `HarnessAdapter` interface that the @lore explicitly says
**not** to widen. It would also re-create the very builtin-only divergence AR4 exists to delete. Rejected.

### What "conversational mode" means concretely (concept-level; architecture details the shape)

The shared path is **task-oriented** today: `ProvisionSessionParams` requires a `taskId`, and assembly
reads task/bet context. The conversational mode is the **third assembly branch** alongside the existing
task branch and the already-existing **routine branch** (`params.routineId` → routine context, no
task/bet — session-provisioning.ts:751). The routine mode is the precedent: it already proves the shared
path can serve a non-task occasion (a stub `taskId` satisfies the FK; context assembly switches on a
mode flag). The conversational mode is the same move:

- A conversational mode flag (mirroring `routineId`) tells provisioning to assemble **conversational
  context** — the thread transcript — instead of task/bet or routine context.
- The **transcript reaches the model through the assembled prompt**, not through `config.messages` into
  a CLI adapter. (Audit fact: the CLI adapter ignores `messages` and only gets a 200-char prompt seed +
  AGENTS.md — `cli-harness-adapter.ts:360`. So the transcript must be carried by the assembled-prompt /
  AGENTS.md channel that *every* harness reads. The builtin adapter can still consume `messages` for a
  cleaner chat shape, but the **contract** is "transcript is delivered via the shared assembly," so the
  CLI path is real, not a silently-dropped `messages`.)
- The assistant's **draft tool surface** (strategy-formed) is the registry the shared path builds and
  delivers (in-process for builtin, via MCP bridge for CLI).

The **never-silent** contract maps cleanly onto the shared path's existing outcomes: a completed turn →
persisted reply; a `MissingCredentialError` / no-eligible-harness / provider-timeout → the existing
notice classes.

**Reply-return reconciliation (resolved — was deferred, now designed in `architecture.md` §4a).** One
gap had to be closed before the conversational mode is real: the shared path **drains the harness stream
internally and returns a cost/verdict struct** (`ProvisionSessionResult` = `{sessionId, outcome,
totalCostCents, taskId, returnVerdict?, forceReturnCount}`), and the agent's `completion` text is observed
by the return gate then **discarded** — the task path never needs it (deliverables land as sandbox files
read back via `onBeforeTeardown`; a chat reply writes no file). So the conversational mode **adds a
reply-return channel**: an optional `conversationalReply?: string` on `ProvisionSessionResult` (present
only in conversational mode, absent for task/routine — mirroring the existing `returnVerdict?`
optionality), populated by a new guarded `completion` branch in `runSession`'s drain loop
(session-provisioning.ts:1054-1108) that accumulates the text and threads it onto the normal-completion
return. The task/routine result contract is byte-for-byte unchanged. The architecture plan specifies the
exact field, drain edit, and the four-harness reply-row test that proves it (see `architecture.md` §4a /
§5 AR4a).

---

## 6. Lifecycle

```
CREATION (unchanged in shape, already strategy-routed)
  POST /api/users  (or lazy-create on first GET/PATCH of the assistant)
    → getActiveStrategy().scaffoldAgents({trigger:"user_assistant", ownerUserId, ownerUserName})
    → persistScaffoldedAgents(...)  [Kernel attaches harness/model defaults]
    → users row ast-${userId}  (persona from strategy; harness/model = Kernel default, user-overridable)

CONFIGURATION (NEW surface — §Design)
  Settings → the assistant is no longer excluded from agent config
    → user sets harnessType / modelId / modelProvider
    → validated via the SAME (harness, provider, model) triple rules as team agents
    → persisted on the ast-${userId} users row

TURN (RESHAPED — the heart of AR4)
  User posts a thread message  (threads.ts ~:1362, fire-and-forget today)
    → load assistant row (persona, harness, model)
    → FORMATION SEAM: active strategy shapes persona + tool surface for this turn
    → CONVERSATIONAL MODE of provisionSession:
        real sandbox + assembled prompt (carries transcript) + registry (draft tools)
        + MCP bridge (CLI) / in-process registry (builtin)
    → harness runs (builtin | claude | codex | opencode)
    → NEVER SILENT: persisted reply OR persisted notice (no secret leaked)
```

---

## 7. Vocabulary

- **The assistant** — the individual agent; one per human user; `ast-${userId}`. After AR4, a normal
  agent that happens to be user-scoped and conversationally invoked.
- **Formation seam** — the turn-time consultation of the active strategy that yields the assistant's
  **persona + tool surface**. The genuinely-missing piece: today the turn never calls the strategy.
- **Conversational mode** — the third assembly branch of the shared `provisionSession` path (alongside
  task and routine), assembling thread-transcript context instead of task/bet context. The mechanism by
  which a conversational occasion is served by the same machinery as task work.
- **Draft tool surface** — the narrow strategy-formed tool set the assistant carries conversationally
  (`create_bet`, `edit_bet`), delivered through the shared registry → (in-process | MCP) split.
- **Never-silent** — every turn ends in a persisted reply or a persisted notice
  (`missing_key`/`missing_harness`/`provider_error`); no secret in a notice. (Existing contract, preserved.)
- **Builtin-only carve-out** — the `BUILTIN_ONLY_INTEGRATION` allowlist
  (`honest-harness-predicate.ts:70`) exempting the assistant tests from the four-harness floor. AR4
  **removes the assistant entries** because the conversational turn now runs a real sandbox + MCP bridge
  on every harness.

### Vocabulary collisions checked

- **"conversation" vs "session":** kept distinct (MEMORY). The conversational *occasion* is the threaded
  reply; the conversational *mode* is a provisioning assembly branch serving it. We do not call the turn
  "a session dial-in"; it is one provisioned run per turn.
- **"formation" vs "scaffolding":** `scaffoldAgents` is creation-time roster formation. The turn-time
  "formation seam" reuses that vocabulary deliberately — same act (strategy decides the WHO), different
  occasion (per turn, not at creation). Architecture decides whether it reuses the method or adds a thin one.
- **"messages" (`ConversationMessage`):** retained as the builtin-adapter convenience, **not** promoted to
  a cross-harness contract. The transcript's harness-agnostic delivery channel is the assembled prompt.

---

## 8. Concept self-critique

- *Over-reach risk:* turning the turn into "just provisionSession" could drag in task-session machinery
  (return gates, cost accumulation onto a bet, `returnVerdict`). Mitigation: the conversational mode is a
  **lean branch** — the routine mode is the precedent for a non-task branch that skips task/bet coupling.
  Architecture must enumerate which provisioning phases the conversational mode skips (return gate is
  "compliant-by-construction" per the existing AL6 @lore; cost-onto-bet does not apply). Flagged for
  architecture.
- *Boundary-creep risk:* someone could read "strategy shapes the assistant" and move harness/model into
  the strategy. §4 locks this hard with rationale so it is not reopened.
- *Carve-out honesty:* removing the assistant from `BUILTIN_ONLY_INTEGRATION` is only honest if the
  production path genuinely gives the turn a sandbox + MCP bridge on every harness. The carve-out's own
  @lore states the exact precondition; the concept's §5 decision satisfies it. The architecture must
  prove the four-harness turn is real (transcript reaches the model; draft tools work) before the
  carve-out comes off — not merely delete the allowlist entry.
- *Scope discipline:* team-agent config, the other strategy-port methods, and multi-assistant are
  explicitly out of scope (§AR4 Out of scope). The concept stays on the assistant.
