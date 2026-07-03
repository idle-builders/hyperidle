# Track AK: Closing the Kernel Loop

Source: the kernel/strategy USP analysis of 2026-06-13 (`plans/AK/kernel-strategy-usp-analysis.md`, founder-annotated), the empirical verification of 2026-06-14 (worktree boot of `origin/main`, Playwright drive-through, full event-trace audit), and the locked boundary concept `docs/architecture/kernel-strategy-split.md`. The headline: the kernel work-loop's *plumbing* is built and verified — bet authoring is block editing (AG3), task→session dispatch fires end-to-end (AD2, only the live-LLM credential missing), review→verdict→resolve works live, bet completion compounds into a retro knowledge item (AC1/AC2). What is missing is (a) the **kernel/strategy separation** drawn cleanly so the Fabric is one swappable Strategy and a minimal strategy can prove the kernel in isolation, and (b) the **autonomy seams** that make the loop self-driving — committing a bet does not start work, the Assistant cannot draft a bet, knowledge cannot become a bet.

**The load-bearing finding.** Committing a bet is inert. `POST /api/bets/:id/commit` flips `draft→active` and emits `bet_state_changed`, but no subscriber acts on `toState=active` — `lifecycle-propagation` handles only `completed`/`killed`, and no decomposition code exists. Meanwhile the bet detail UI promises *"Your team will pick this up"* / *"Tasks will appear here once agents start work."* — never kept. This is the spine of the Plan→Interact→Review→Repeat wedge.

**Boundary is locked (refined 2026-06-15).** `docs/architecture/kernel-strategy-split.md` is the fixed input for this track. The cut is **functional, not stable/volatile** (that framing is rejected): **Kernel** = the application + the agent-running runtime (conversations, work plan/review, knowledge *editing*, users — humans **and agents** are users — and running agents — harness, sandbox, session, tools/Skills/hooks, cost), plus the **interaction-surface events** it emits (`bet committed`, `work to decompose`). **Strategy** = the knowledge/context layer behind a port (context assembly in, learning ingestion out, the background knowledge work) **and — per the 2026-06-15 refinement (§2a) — agent identity as knowledge**: the AGENTS.md is a knowledge file, so the agent roster, team-scaffolding, and *which agent fills a session* (selection/assignment) are Strategy. The **Fabric** is one Strategy implementation; its 4-layer knowledge-management design is **deeply researched and out of scope to change** — the only requirement on it is that it keeps working unchanged behind the shifted boundary.

**The boundary refinement (AK6–AK8).** AK3 shipped under the original "decomposition is Kernel" framing. The founder refined the boundary: *who an agent is* is knowledge, so **agent selection/assignment and decomposition-policy are Strategy**, triggered by a **Kernel-owned event**; the Kernel keeps the mechanism (spawn sandbox, attach session to the agent's user-id, meter cost) and the trigger. AK6 moves the agent roster + AGENTS.md behind the Strategy; AK7 adds the Kernel event + the port's selection seam (Strategy picks an agent → resolves to a Kernel user-id); AK8 rewires decomposition as a Strategy response to that event, with AK3-as-built becoming the Minimal Strategy's default-PM fallback. See `docs/architecture/kernel-strategy-split.md` §2a.

**Dependency order (build top-to-bottom).** AK1 (rename) → AK2 (split) → AK3 (commit→work); AK4 and AK5 need only AK1. The boundary-refinement chain: AK2 → AK6 (roster-as-knowledge) → AK7 (selection seam + Kernel events) → AK8 (event-driven decomposition; also needs AK3).

```
AK1 rename ─┬─► AK2 split ─┬─► AK3 commit→work ───────────────────┐
            │              └─► AK6 roster-as-knowledge            │
            │                     └─► AK7 selection seam          │
            │                            └─► AK8 event decompose ◄┘
            ├─► AK4 assistant-drafts-bet
            └─► AK5 knowledge→bet
```

**Scope rules.** The kernel/strategy boundary (`docs/architecture/kernel-strategy-split.md`) governs every WP here. User Sovereignty is preserved: agents propose and draft, humans commit; no new irreversible action bypasses existing review gates. `npm run verify` must pass after each workpackage merges (same rule as Tracks AD–AI).

**Still needs its own concept (not in this track):** the **unified human-attention scoring** that decides which tasks/concepts pull the founder in (today knowledge uses an 8-signal attention score, reviews use `riskTier`, separately). AK3 scopes its human-gate out, pending that concept.

**Reference docs:** `docs/architecture/kernel-strategy-split.md` (the locked boundary + nouns), `plans/AK/kernel-strategy-usp-analysis.md`, `docs/process-layer/`, `docs/agent-layer/`, `ETHOS.md` (User Sovereignty), `.pipeline/work-packages/TRACK-AD.md` (dispatch), `.pipeline/work-packages/TRACK-AG.md` (AG3 bet-as-block).

---

### AK1 — Harness-vocabulary rename rollout

**Workpackage.** As a contributor and maintainer, I want the codebase, API, and UI to use the standard agent-harness vocabulary instead of homegrown terms, so that the system is legible to anyone working in the 2025–2026 agent-infra space and the kernel/strategy seam (AK2) can be cut in the final vocabulary rather than renamed afterward. The locked nouns are in `docs/architecture/kernel-strategy-split.md` §4: drop "soul", "workspace" (as the unit), "materialization"/"prompt composition", and the conflated "skill-tools"; keep "harness", "session", "Fabric", "Strategy".

**Why this matters.** The founder's blocker: "most of these terms have no meaning and we cannot structure along these." Homegrown "soul" and "materialization" carry zero industry meaning — they make the kernel/strategy seam impossible to draw cleanly and make contributor onboarding (the whole point of a swappable Strategy) opaque. Doing the rename *before* the split means AK2's port and minimal strategy land in the right words once, not twice. The cost of not building it: the split ships in throwaway vocabulary and no outside contributor can map our nouns to anything they know.

**What exists today.** `soulPrompt` (a `users` column) and "soul" usages; "workspace" naming the run unit (Local/Docker/E2B workspace adapters, `workspace` fields); `materialize`/`composePrompt` in `packages/fabric`; a conflated `skill-tools` registry; `session` and `harness` adapters (already industry-aligned — keep); `packages/fabric` and "Strategy" (kept per concept). The full mapping is locked in `docs/architecture/kernel-strategy-split.md` §4.

**What's genuinely missing.** The mechanical rename across schema, API/contract, fabric, web, and internal docs to the locked nouns — plus a static guard so the dropped terms cannot creep back.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- An agent's behaviour/instruction surface is expressed as a **system prompt** plus an **AGENTS.md** instruction file; "soul"/"soul prompt" no longer appears in API, UI, or code.
- The isolated environment an agent runs in is called a **sandbox** (working dir `/workspace`) throughout API, UI, and code; "workspace" no longer names that unit.
- **Skills**, **tools**, and **MCP** are distinct, separately-named concepts; the conflated "skill-tools" name is gone.
- The act of assembling knowledge into an agent's context is named **context assembly** (not "materialization"/"prompt composition") in code and internal docs.
- "harness", "session", "Fabric", and "Strategy" are retained unchanged.
- No dangling references to the dropped terms remain (enforced by a static check where feasible); the full verify suite passes — behaviour is unchanged (naming only).

**Validation scenarios.**
- Given the running app, when inspecting the agent-config API and UI, then it exposes a system prompt + AGENTS.md and exposes no "soul" field or label.
- Given the API/UI for an agent's run environment, then it is labelled "sandbox" with a `/workspace` working directory.
- Given a repository-wide search/lint, then the dropped terms (soul, workspace-as-unit, materialization, prompt composition, skill-tools) do not occur outside historical migrations/changelogs.

**Plan calls.** Standard architecture pass — this is a cross-cutting rename. Plan the forward-only schema migration(s) (e.g. `soulPrompt`), API/contract updates, fabric + web renames, the AGENTS.md file convention, and a lint/grep guard against the dropped terms. Nouns are fixed by `docs/architecture/kernel-strategy-split.md` §4 — do not re-litigate them. May split during `/architecture` if the migration surface is large.

**Contracts / constraints.**
- Nouns exactly per `docs/architecture/kernel-strategy-split.md` §4 (locked). Keep "harness", "session", "Fabric", "Strategy".
- DB renames are forward-only migrations.
- Behaviour-preserving — this workpackage changes names only, never logic.

**Out of scope.** The kernel/strategy split (AK2). Any behaviour change. Renaming the retained terms. The unified human-attention concept.

**Effort.** L (~3–5d)

---

### AK2 — Strategy port + minimal reference strategy (the split)

**Workpackage.** As a maintainer and a future third-party contributor, I want the Kernel to run a task through a clearly-defined Strategy port, with a minimal reference Strategy that does no knowledge injection, so the Kernel can be exercised and trusted in isolation and others can build alternative Strategies without forking — while the existing Fabric keeps working exactly as before behind the same port. Today the Fabric is the only Strategy and it is hard-wired into the run path.

**Why this matters.** The kernel/strategy split is HyperIdle's extensibility story, but verification shows it is only half-real: `provisionSession` is swappable through the registry, yet the production implementation hard-imports the Fabric (`materialize`/`composePrompt`/`checkCostCap` — note: cost is Kernel, context assembly is Strategy) and there is no kernel/strategy seam in fact. A minimal Strategy is the TDD harness that verifies the Kernel without the Fabric and the template a contributor copies. The cost of not building it: the Kernel can never be tested independently of the Fabric, the "swappable Strategy" promise is hollow, and the founder's plan to hone the Kernel while keeping Strategy complexity aside is blocked.

**What exists today.** `provision-registry.ts` (`setProvisionSessionFn`/`getProvisionSessionFn`) — a genuine seam the dispatcher calls through. The production `provisionSession` (`packages/server/services/session-provisioning.ts`) statically imports Fabric functions at dispatch time. O2 moved Strategy *fields* into extension tables (`knowledgeStrategyFabric`/`taskStrategyFabric`). The boundary is locked conceptually in `docs/architecture/kernel-strategy-split.md` but not yet real in code.

**What's genuinely missing.** An explicit Strategy port (what the Kernel asks a Strategy for at dispatch — context assembly in, learning ingestion out — with the background knowledge work running alongside), a minimal reference Strategy implementing it inert, and removal of the Kernel's hard dependency on the Fabric so the Fabric becomes one implementation of the port.

**Depends on.** AK1 — the port and minimal Strategy must be cut in the final vocabulary (system prompt/AGENTS.md, sandbox, context assembly), not renamed afterward.

**Complexity.** L

**Acceptance criteria.**
- A task can be dispatched and run end-to-end under a minimal Strategy that performs no context assembly, relevance, or attention work.
- The Kernel's dispatch-time contract with a Strategy is explicit and documented — a reader can state what the Kernel requires of any Strategy.
- The Fabric runs as one implementation of that contract with **no behaviour change** when it is the selected Strategy (verified against current behaviour).
- Selecting the minimal Strategy requires no modification to Kernel code — only registering a different Strategy; the Kernel imports no specific Strategy.

**Validation scenarios.**
- Given the minimal Strategy is active, when a task is dispatched (stub/echo harness), then a session runs to completion and no context assembly / Fabric work occurs (observable in logs/DB).
- Given the Fabric Strategy is active, when the same task runs, then knowledge is assembled and compounded exactly as today — no regression.
- Given a contributor implements the port in a new module and registers it, then it runs with zero changes to Kernel code.

**Plan calls.** The boundary + nouns are **locked** in `docs/architecture/kernel-strategy-split.md` (fixed input) — this is no longer concept work. Start with `/architecture` on the port shape; per the founder's sequence: build the minimal Strategy first (to TDD the Kernel) → add Kernel tests → reduce the Fabric coupling so the Fabric runs unchanged behind the port. Multi-version exploration on the port surface; design-it-twice. A `packages/kernel` extraction may split into its own workpackage during architecture — expected.

**Contracts / constraints.**
- The boundary is exactly `docs/architecture/kernel-strategy-split.md`; cost stays Kernel-side, context assembly moves behind the port.
- No behaviour change when the Fabric is selected — a port the Fabric cannot fully satisfy is the wrong port.
- The Kernel must not import any specific Strategy; exactly one Strategy is active at a time.
- The minimal Strategy ships as a real, documented reference implementation, not a test fixture.

**Out of scope.** Unified human-attention scoring (separate `/concept`). Redesigning the Fabric's knowledge management (out of scope — preserved). A recommended production Strategy beyond the Fabric — minimal is for verification and as a template.

**Effort.** L (~4–6d)

---

### AK3 — Committing a bet starts work

**Workpackage.** As a founder who has shaped and committed a bet, I want the team to break it into tasks and begin working automatically, so that committing means work starts — not that I hand-type every task. Today committing only flips status; the bet then sits with zero tasks while the UI claims the team will pick it up. This workpackage makes a committed bet produce a real task breakdown owned by team agents, which the existing dispatcher runs.

**Why this matters.** The single most important product gap. The Plan→Interact→Review→Repeat loop is the wedge and "Interact" never begins: empirically a committed bet creates nothing while the UI promises work that never happens. The downstream machinery already works (task→session dispatch verified live) — nothing bridges commit→tasks. The cost of not building it is fatal: HyperIdle becomes a bet tracker where the founder does all decomposition by hand. The founder is the direct beneficiary; every demo depends on this seam.

**What exists today.** The bet state machine transitions `draft→active`, is capacity-gated, emits `bet_state_changed`. The task→session dispatcher (`task-dispatcher.ts` → `provision-registry` → `session-provisioning.ts`) fires on `task_state_changed(accepted)` and provisions a session. Teams carry an agent roster. **Absent:** any subscriber on `bet_state_changed(active)`; `lifecycle-propagation.ts` acts only on `completed`/`killed`; no decomposition code anywhere.

**What's genuinely missing.** A step that, on commit, turns the bet's goal + concept into an accepted task breakdown owned by appropriate team agents — so the existing dispatch→session path takes over — and a UI that reflects real task state instead of a permanent false promise.

**Depends on.** AK2 — decomposition sits on the kernel/strategy seam (the PM agent's context comes from the active Strategy via the port); build it on the clean, split Kernel rather than the Fabric-coupled path.

**Complexity.** L

**Acceptance criteria.**
- Committing a bet results in a task breakdown for that bet without the founder manually entering tasks.
- The produced tasks are owned by eligible team agents and flow into the existing dispatch→session path (a session is provisioned, or provisioning is attempted, for a ready task).
- A committed bet never sits indefinitely with zero tasks beneath a "work will start" promise; the bet surface reflects the real state of its tasks.
- When the team has no eligible agent, the founder sees an explicit reason rather than a false promise.
- User Sovereignty preserved: nothing in this seam takes an irreversible external action without passing existing review gates.

**Validation scenarios.**
- Given a committed bet on a team with a builder agent, when commit completes, then ≥1 task exists owned by a team agent and a session is provisioned (or attempted, observable in logs/DB), with no manual task entry.
- Given a committed bet, when the founder views it, then the task section shows actual tasks (or an honest empty/blocked state) — never a permanent "tasks will appear" placeholder over a silently empty list.
- Given a team with no eligible agent, when a bet is committed, then the founder sees an explicit blocker explaining why work has not started.

**Plan calls.** Decomposition placement is **resolved** in `docs/architecture/kernel-strategy-split.md`: it is **Kernel** (work-planning + running a PM agent); the active Strategy only *feeds the PM agent context* via the port. Build the kernel-side commit trigger + decomposition; under the minimal Strategy the PM decomposes without injected knowledge. `/design` for how the breakdown and the no-eligible-agent state appear on the bet surface; then standard architecture for the event wiring and task creation.

**Contracts / constraints.**
- Honour the kernel/strategy boundary (`docs/architecture/kernel-strategy-split.md`) — decomposition is Kernel; knowledge to the PM agent comes via the Strategy port.
- The UI must never promise work it cannot start.
- Reuse the existing task→session dispatch path; do not fork a second provisioning route.

**Out of scope.** The high-impact **human-attention gate** (which tasks/concepts pull the founder in before work proceeds) — depends on the unified human-attention concept (separate `/concept`). Cross-team decomposition. The quality of the decomposition (which agent, how granular) is an architecture/eval concern, not an AC.

**Effort.** L (~3–5d)

---

### AK4 — The Assistant can draft and shape a bet

**Workpackage.** As a founder, I want to talk an idea through with my Assistant and have it draft and shape a bet I can refine and commit, so that starting work can begin in a conversation rather than from a blank form. Today the Assistant thread accepts my messages but never replies — the dispatcher only logs intent — so the "discuss → concept → bet" entry the product is built around does not exist.

**Why this matters.** A core entry to the kernel loop is entirely absent: verification confirmed the Assistant fires a dispatch log and then does nothing. The Assistant is currently decorative. The cost of not building it: the most natural on-ramp — describe what you want, get a shaped bet back — is missing, leaving only the blank-form path. The founder gains a real operator that turns conversation into committed work.

**What exists today.** The Assistant is a real per-user individual agent (AD8b) with an overlay and a persistent thread. `assistant-dispatcher.ts` subscribes to `thread_message_appended`, filters human→assistant-thread messages, and **only logs** — its docstring says full session provisioning is "deferred." The session-provisioning pipeline and the tool registry exist. Bet creation via `POST /bets` works; bet authoring is block editing (AG3). A `create_bet` capability is named in AD8b but not wired into the Assistant's tools.

**What's genuinely missing.** A real Assistant session that responds substantively in the thread and can produce a draft bet (goal + concept body) from the conversation, surfaced for the founder to edit and commit — with the human as the one who commits.

**Depends on.** AK1 — uses the final harness nouns (system prompt/AGENTS.md, tools/Skills). Does not require the split; an independent entry feature on the existing runtime.

**Complexity.** L

**Acceptance criteria.**
- The founder can hold a back-and-forth with the Assistant in its thread and receive substantive replies (not silence).
- The Assistant can produce a draft bet — a goal and a concept body — derived from the conversation.
- A bet the Assistant drafts lands as an editable draft the founder reviews before committing; the Assistant never commits a bet autonomously.
- The founder can iterate conversationally (e.g. narrow the scope, change the appetite) and the draft updates accordingly.

**Validation scenarios.**
- Given the founder describes an idea and asks for a bet, when the Assistant responds, then a draft bet is created/proposed with a concept body derived from the conversation, in `draft` status.
- Given an Assistant-drafted bet, when the founder edits and commits it, then the normal bet lifecycle applies.
- Given the Assistant proposes a bet, then it is presented for human approval and never auto-committed.

**Plan calls.** `/architecture` for the Assistant session lifecycle and tool wiring (reuse session-provisioning + the tool registry, no parallel runtime). `/design` for how a drafted bet is surfaced out of the thread into the bet authoring surface. Confirm the Assistant's authority boundary (draft-only, human commits) against ETHOS User Sovereignty.

**Contracts / constraints.**
- User Sovereignty: the Assistant proposes and drafts; the human commits. No irreversible action.
- Reuse the existing session-provisioning pipeline and tool registry — no second agent runtime.
- Bet drafting reuses the AG3 block authoring surface; no new content dialect.

**Out of scope.** Autonomy-level management UI. The Assistant editing arbitrary factory-level documents. Auto-decomposition of the drafted bet (that is AK3, on commit).

**Effort.** L (~3d)

---

### AK5 — Promote a knowledge item into a bet

**Workpackage.** As a founder, I want to turn a knowledge item into a bet, so that an idea I captured as knowledge can become committed work without retyping it. Today knowledge and bets are linked only in reverse — a finished bet's retro becomes knowledge — so an idea in the Knowledge view is a dead end with respect to starting work.

**Why this matters.** The founder explicitly asked whether a knowledge document could become a bet description. Because bet content is already blocks rendered through the same pipeline as knowledge (AG3), the transfer is natural and cheap, and it closes the missing edge of the capture→commit loop. The cost of not building it is small but real: captured ideas can't flow into work, so the Knowledge view accumulates intent that never converts.

**What exists today.** Knowledge items carry a block/markdown body; bets render through the same block pipeline (AG3); bet creation via `POST /bets` accepts markdown. `WorkBet` has an "Add knowledge" action that links a knowledge item *to* a bet (the reverse). Verification found **no** path from a knowledge item to a new bet.

**What's genuinely missing.** An action that seeds a new draft bet from a knowledge item's content, records a provenance link back to the source item, and drops the founder into the bet authoring surface to shape it before committing.

**Depends on.** AK1 — uses the final nouns. Independent of the split and of the other features.

**Complexity.** M

**Acceptance criteria.**
- From a knowledge item, the founder can create a draft bet pre-filled with that item's content.
- The new bet retains a link back to the source knowledge item (provenance is recoverable).
- After promotion the founder lands in the normal bet authoring/edit surface to refine the bet before committing.

**Validation scenarios.**
- Given a knowledge item, when the founder promotes it to a bet, then a `draft` bet exists containing the item's body and a provenance link, and the founder is taken to edit it.
- Given the promoted bet, when the founder commits it, then the normal bet lifecycle applies (including AK3 once that lands).

**Plan calls.** `/design` for the promote affordance and how provenance is shown; standard architecture pass. Bet is already a block host — reuse the AG3 authoring surface, do not rebuild an editor.

**Contracts / constraints.**
- Reuse the existing bet authoring surface and block pipeline; no new content dialect.
- Promotion creates a `draft` — the human commits.

**Out of scope.** Bidirectional sync between the knowledge item and the bet. Agent-initiated auto-promotion of knowledge into bets.

**Effort.** M (~1d)

---

### AK6 — Agent identity is Strategy-owned knowledge

**Workpackage.** As a maintainer and a future third-party contributor, I want which agents exist, who each one is (its AGENTS.md), and which agents are scaffolded into a team to be owned by the active Strategy rather than wired into the Kernel — so that swapping the Strategy swaps the company's agents and personas, a Minimal Strategy yields a single plain agent, and the Kernel still keeps a stable user identity for every agent so sessions attach exactly as today. This makes "personas are knowledge" (the 2026-06-15 boundary refinement, `docs/architecture/kernel-strategy-split.md` §2a) real in the system, not just on paper.

**Why this matters.** The maintainer and the founder both benefit: the whole "nail the Kernel in isolation" USP requires that a Kernel running the Minimal Strategy carries *no* hard-coded roster — today it still would, so the isolation is fake. A contributor cannot ship an alternative set of agents without forking the Kernel. The cost of not building it: the agent roster stays a Kernel concern, contradicting §2a, and the selection/decomposition seams (AK7/AK8) have nothing clean to select *from*.

**What exists today.** Agents are Kernel users (the users table includes AI-agent users with stable ids); teams carry an agent roster via membership groups; the AGENTS.md convention is established (AK1); the role catalog tags each role `category` (team/strategy/individual). The Strategy port (AK2) exposes only `assembleContext` + `beginLearningIngestion`. The Minimal Strategy (`packages/strategy-minimal`) does no knowledge work and inherits whatever roster the Kernel provides. The inventory `plans/AK/agent-decision-surfaces.md` (2026-06-15) shows agent **creation** is hard-coded Kernel-side across *every* surface — team scaffolding (`defaultRoster()` in `teams-routes.ts` + `create-team` tool), adding an agent (`add-agent` tool), Assistant creation at user registration (`BUILTIN_ASSISTANT_SYSTEM_PROMPT`, `users.ts`/`assistant.ts`), and factory bootstrap (system + facilitator/strategy agents, `factory-bootstrap.ts`) — and that **none of these emit a creation event**; creation happens inline in routes, so there is no seam for a Strategy to attach.

**What's genuinely missing.** An ownership seam where the active Strategy owns the agent roster, each agent's AGENTS.md (as a managed knowledge artifact), and which agents scaffold into a team — while the Kernel keeps the user-id for each agent. This spans **all** creation surfaces above, not just team rosters. **Creating the seam is this workpackage's job, and the events are part of it**: the Kernel must **emit the creation triggers as events** (`team_created` / `agent_added` / `user_created` — none exist today; creation is inline in routes). Those events *are* the surface the Strategy attaches to, so emitting them is in scope here, not a separate prerequisite.

**Depends on.** AK2 — the Strategy port and registry must exist before roster ownership can be attached to a Strategy.

**Complexity.** L

**Acceptance criteria.**
- The set of agents that exist and populate a team is determined by the active Strategy, not by Kernel code; selecting a different Strategy yields a different set with no change to Kernel code.
- Across every agent-creation surface (scaffolding a team, adding an agent, the per-user Assistant, factory bootstrap agents), the Kernel emits the creation trigger and the active Strategy decides *what* is created (persona / AGENTS.md / role); the Kernel hard-codes no persona or roster.
- Under the Minimal Strategy, a team is scaffolded with a single plain agent whose AGENTS.md carries no injected knowledge.
- Under the Fabric Strategy, the agents and personas present today are unchanged — no regression.
- Every agent the Strategy scaffolds resolves to a stable Kernel user-id, so a session attaches to it exactly as today.
- An agent's AGENTS.md is owned by the Strategy as a knowledge artifact (it can evolve through the Strategy's knowledge management), not held as a fixed Kernel asset.

**Validation scenarios.**
- Given the Minimal Strategy is active, when a team is scaffolded, then exactly one plain agent exists for it with an empty-knowledge AGENTS.md and a valid Kernel user-id.
- Given the Fabric Strategy is active, then the agents and personas present today exist unchanged.
- Given a contributor registers a Strategy defining a different roster, then those agents populate teams with zero Kernel code change.

**Plan calls.** Concept-introducing — run `/concept` first: it reshapes the ownership of the load-bearing nouns "agent roster" and "agent identity" (the noun is *agent-as-knowledge*). Read `plans/AK/agent-decision-surfaces.md` (the creation-surface + event inventory) as fixed input. Then standard architecture on the creation-event seam + roster-ownership + the Strategy↔user-id mapping; design-it-twice on where the roster lives, how the AGENTS.md is owned, and the creation-event shape. The creation events are this WP's seam — they are designed and emitted here, not deferred. Run `/design` (routine) only if the team-settings surface changes to reflect Strategy-owned agents.

**Contracts / constraints.**
- Honour `docs/architecture/kernel-strategy-split.md` §2a: Kernel keeps user-ids; Strategy owns roster + AGENTS.md + team-scaffolding; the Kernel hard-codes no agent definition.
- No behaviour change when the Fabric is the active Strategy (preservation).
- Forward-only migrations if ownership fields move.

**Out of scope.** The work-time selection/assignment seam (AK7). Event-driven decomposition (AK8). The unified human-attention concept. Redesigning the Fabric's knowledge management.

**Effort.** L (~4–6d)

---

### AK7 — The Strategy selects the agent for a unit of work

**Workpackage.** As a maintainer, I want the Kernel to emit an interaction-surface event when there is work needing an agent and have the active Strategy answer with *which* agent (and its context) should take it — resolving to a Kernel user-id the session attaches to — so that "who does this work, with what knowledge" is a Strategy decision while the Kernel keeps spawning and running the session. Today the Kernel both picks the agent (eligibility + round-robin) and assembles context; selection is hard-coded Kernel mechanics with no Strategy input.

**Why this matters.** The maintainer benefits directly: every flow that spawns an agent (decomposition today, the Assistant, future flows) currently re-implements Kernel-side selection — exactly the policy that should vary by Strategy per §2a. Without this seam the Fabric cannot apply knowledge-matched assignment and the Minimal Strategy cannot simply return its single agent. The cost of not building it: selection logic keeps multiplying Kernel-side and the boundary refinement stays half-real.

**What exists today.** Per `plans/AK/agent-decision-surfaces.md`, agent *selection* is pure Kernel mechanics with zero knowledge input across every surface: AK3 bet-decomposition assignment (`findEligibleTeamAgents` + round-robin, `bet-decomposition.ts`), task→session dispatch (loads a pre-set `ownerAgentId`, `session-provisioning.ts`), the Assistant turn (deterministic `ast-${userId}`), and routine owners (`ownerByRole` at seed time). The **only** knowledge/skill-aware selection anywhere is routine **delegation** (`findDelegate` over the `userSkills` table, `routine-scheduler.ts:245-263`) — the existing precedent to generalize. `getActiveStrategy()` is called only for `assembleContext` + `beginLearningIngestion`; the port has no `selectAgent`/`chooseOwner` seam. AK6 makes the roster Strategy-owned. The event bus carries `bet_state_changed`, `task_state_changed`, `thread_message_appended`.

**What's genuinely missing.** A Kernel-owned event signalling "there is work needing an agent" plus a single port seam where the active Strategy returns the chosen agent (→ user-id) and its context — generalizing the lone `findDelegate` skill-match so *every* selection point (decomposition, dispatch, routines) can consult the Strategy instead of round-robin. No selection seam exists on the port today.

**Depends on.** AK6 — the Strategy must own the roster before it can select from it. AK2 — the port.

**Complexity.** L

**Acceptance criteria.**
- When work needs an agent, the Kernel emits an interaction-surface event rather than choosing the agent itself.
- The active Strategy selects which agent takes the work; the Kernel attaches the resulting session to that agent's Kernel user-id without inspecting the agent's persona.
- Under the Minimal Strategy, selection returns the team's single plain agent; under the Fabric, selection reflects knowledge-matched assignment with no regression vs today's eligible-agent behaviour.
- A new flow can obtain "the right agent for this work" through the seam without re-implementing eligibility/selection in Kernel code.
- The existing task→session dispatch path is reused — no second provisioning route.

**Validation scenarios.**
- Given the Minimal Strategy, when the Kernel emits a work event for team T, then T's single plain agent is selected and a session attaches to its user-id.
- Given the Fabric Strategy, when the same event fires, then an eligible knowledge-matched agent is selected (no regression vs current assignment) and the session attaches correctly.
- Given a Strategy that selects an agent off the team, then the Kernel still resolves a valid user-id and attaches, or the seam rejects per contract — selection can never produce an unattachable session.

**Plan calls.** Concept-introducing — run `/concept` first: the "work event" and "selection seam" nouns plus the user-id resolution contract. Standard architecture on the port extension and event shape; multi-version exploration on the shape — Strategy *subscribes to a Kernel event* vs Kernel *calls a port method* — settled per §2a's event pattern. Skip `/design` (backend seam) unless a surface exposes selection.

**Contracts / constraints.**
- §2a: Kernel emits the event and owns user-ids; Strategy owns selection; the Kernel never inspects an AGENTS.md.
- Exactly one active Strategy; the Kernel imports no concrete Strategy.
- Reuse the existing dispatch→session path; no fork.
- The Minimal Strategy must satisfy the seam trivially; no regression when the Fabric is active.

**Out of scope.** Rewiring decomposition onto the event (AK8). The unified human-attention gate. Cross-team selection.

**Effort.** L (~4–6d)

---

### AK8 — Decomposition becomes a Strategy response to a Kernel event

**Workpackage.** As a founder, I want committing a bet to emit a Kernel "work to decompose" event that the active Strategy handles — the Fabric breaking the bet down with a knowledge-matched PM and assignment, the Minimal Strategy doing the trivial single-agent breakdown — so that *how* work is decomposed and *who* takes it is a Strategy decision, not a Kernel-hardcoded PM. AK3's kernel-side PM path becomes the Minimal Strategy's default fallback rather than the permanent decomposition route.

**Why this matters.** This is the step that makes the commit→work seam — the spine of the Plan→Interact→Review→Repeat wedge — honour the refined boundary (§2a). AK3's fixed PM can't vary by Strategy, so the Fabric can't bring knowledge to decomposition and a contributor can't swap the decomposition policy. The founder benefits: decomposition quality becomes a Strategy concern that can improve monthly without touching the Kernel. The cost of not building it: decomposition stays frozen at the Minimal-fallback behaviour for every Strategy.

**What exists today.** AK3's full commit→decomposition path: the `bet_state_changed(active)` subscriber, `runBetDecomposition`, the kernel-side PM turn, round-robin assignment, the four-state bet surface, crash recovery, and CAS idempotency. AK6 (Strategy-owned roster) and AK7 (Kernel work event + selection seam). The Fabric and Minimal Strategies.

**What's genuinely missing.** The trigger is still a Kernel subscriber running a Kernel PM. It must become a Kernel-emitted event the active Strategy handles, with AK3's path demoted to the Minimal Strategy's default response.

**Depends on.** AK7 — the work event and selection seam must exist. AK3 — its as-built path becomes the Minimal fallback.

**Complexity.** L

**Acceptance criteria.**
- Committing a bet emits a Kernel-owned "work to decompose" event; the Kernel does not itself decide the decomposition.
- The active Strategy produces the task breakdown in response: under the Minimal Strategy this is AK3's default/trivial breakdown; under the Fabric it is a knowledge-matched decomposition with no regression vs AK3's observable outcome (tasks created, owned by eligible agents, flowing into dispatch).
- Every AK3 guarantee holds regardless of active Strategy: a committed bet never sits indefinitely at zero tasks under a false promise; no-eligible-agent yields an explicit blocker; the bet surface reflects real task state; User Sovereignty preserved (no irreversible external action bypassing review gates).
- Selecting a different Strategy changes the decomposition behaviour with no Kernel code change.

**Validation scenarios.**
- Given the Minimal Strategy, when a bet is committed, then AK3's default breakdown runs — ≥1 task owned by the team's single agent, flowing into dispatch.
- Given the Fabric Strategy, when a bet is committed, then a knowledge-matched breakdown runs with no regression vs AK3's observable outcome.
- Given any active Strategy, when the team has no eligible agent, then the founder sees an explicit blocker rather than a false promise.

**Plan calls.** Run `/concept` first only if AK6/AK7 shifted the nouns; otherwise standard architecture on moving the AK3 subscriber behind the Kernel event + Strategy handler and demoting AK3's path to the Minimal default. Reuse AK7's selection seam and the existing dispatch path. Skip `/design` — AK3's four-state surface is reused unchanged unless the blocked/decomposing states change.

**Contracts / constraints.**
- §2a: the Kernel emits the event; the Strategy decomposes and assigns. Reuse AK3's UI and dispatch path; no fork.
- Preserve every AK3 acceptance guarantee under both Strategies; no regression when the Fabric is active.
- AK3's kernel-side path is retained as the Minimal Strategy's fallback, not deleted.

**Out of scope.** The unified human-attention gate (separate concept). Cross-team decomposition. Decomposition quality (an eval concern, not an AC).

**Effort.** L (~3–5d)

---

### AK9 — Kernel package extraction (the deferred AK2b): Kernel infra leaves the Strategy package

**Workpackage.** As a maintainer and a future third-party Strategy contributor, I want every Kernel-governance and infrastructure service — cost enforcement, task/assistant dispatch, sandbox-lifecycle cleanup, notification delivery, session-review creation, attention/silence routing — to live outside the Strategy package, so the Kernel builds and runs a task end-to-end against the minimal reference Strategy with **zero dependency on the Fabric package**. Today these Kernel concerns are physically housed in `packages/fabric` and imported directly by the Kernel, so the kernel-first / swappable-Strategy promise is only runtime-deep (AK2) and not true at the package level — the Kernel cannot be built, shipped, or reasoned about without the Fabric.

**Why this matters.** AK2 made the Strategy port runtime-swappable but explicitly deferred the physical packaging ("What AK2 does NOT move (deferred to AK2b)" in `docs/architecture/kernel-strategy-split.md`). An audit of `packages/fabric` found it is ~15.5k prod LOC but only ~39% is knowledge/Strategy work — ~46% is Kernel-governance services and ~15% is an entire notifications subsystem, none of which is knowledge management. Until they move: the Kernel can never be built or tested independently of the Fabric (the central USP stays hollow at the package boundary), the Fabric package stays incohesive (lowest test ratio of any core package, ~38%, because timer/event services are harder to unit-test than the pure scoring functions and drag the number down), and a contributor inspecting "the Strategy" wades through thousands of lines of Kernel plumbing unrelated to knowledge. The person who benefits: the maintainer (a Kernel that can be honed in isolation, which the founder explicitly wants) and any third-party Strategy author (a Strategy package that contains only Strategy concerns). Cost of not building: the kernel-first architecture remains aspirational and the Strategy package keeps accreting unrelated services.

**What exists today.** The Strategy port (`packages/shared/src/strategy-port.ts`), the registry (`packages/server/src/services/strategy-registry.ts`), the Fabric adapter (`packages/fabric/src/fabric-strategy.ts`), and the minimal reference Strategy (`packages/strategy-minimal`) all exist and are wired end-to-end as of AK2/AK6/AK7/AK8. An ESLint `no-restricted-imports` guard already bans the Kernel from importing concrete Strategy symbols behind the port. The deferral is documented: `kernel-strategy-split.md` §"What AK2 does NOT move" names `cost-cap.ts`, `context-assembly-prompt.ts`, `session-context.ts`. The audit found the real mislocated Kernel set is larger — including `services/{cost-cap, cost-sentinel, task-dispatcher, assistant-dispatcher, sandbox-reaper, session-review-creator, silence-policy, org-routing}`, the whole `services/notifications/` subtree, and `fts.ts`. The knowledge/Strategy core (context assembly, relevance/attention scoring, ingestion/writeback, knowledge store) also lives in `packages/fabric` and stays there.

**What's genuinely missing.** The physical relocation of Kernel-concern services out of `packages/fabric` (into `packages/server` or a new `packages/kernel`), the removal of `@hyperidle/server`'s package dependency on `@hyperidle/fabric`, and a mechanically-enforced guarantee that the Kernel package never depends on the Fabric package.

**Depends on.** AK2 — the port, registry, Fabric adapter, and minimal Strategy must exist; AK9 relocates implementations around the already-shipped seam, it does not create the seam. (Not blocked on the Strategy-contract concept flag below: the services AK9 moves are Kernel under every resolution of "what is a Strategy".)

**Complexity.** L

**Pre-build gates.**
- **Concept:** Not required — the Kernel/Strategy boundary is locked in `docs/architecture/kernel-strategy-split.md`; this WP only relocates services already classified Kernel (cost is a hard-rule Kernel concern). The Strategy *content* reorganization (responsibility-3 services) is concept-blocked and explicitly out of scope — see the separate concept flag.
- **Design:** Not required — backend/packaging only, no rendered surface; `/architecture` then build.

**Human design review.** No — backend packaging change, no UI surface.

**Acceptance criteria.**
- A task dispatches and runs end-to-end to session completion with the minimal reference Strategy active while the Kernel package has **no dependency on the Fabric package** (`@hyperidle/server` does not depend on `@hyperidle/fabric`).
- Kernel-governance and infrastructure behaviour — cost enforcement, task and assistant dispatch, sandbox-lifecycle cleanup, notification delivery, session-review creation, and attention/silence routing — runs from the Kernel without importing the Fabric package.
- With the Fabric selected as the active Strategy, knowledge is assembled and compounded exactly as today — no behaviour regression.
- The "Kernel package does not depend on the Strategy/Fabric package" invariant is enforced mechanically — a check fails if a Kernel module imports the Fabric package.
- Knowledge/Strategy concerns (context assembly, relevance/attention scoring, ingestion/writeback, the knowledge store) remain in the Strategy layer; the extraction removes only Kernel concerns.

**Validation scenarios.**
- Given the minimal Strategy is active and the Fabric package is absent from the Kernel's dependency graph, when a task is dispatched, then a session runs to completion (cost metered, dispatched, sandbox reaped) with no Fabric import observable.
- Given the Fabric Strategy is active, when the same task runs, then knowledge is assembled and compounded exactly as before — no regression in the knowledge path.
- Given a Kernel module attempts to import the Fabric package, when the build/lint check runs, then it fails.

**Plan calls.** Backend/packaging only — skip `/design`. Standard `/architecture` pass to decide the destination (relocate into `packages/server` vs. stand up a new `packages/kernel`) and to resolve exact service membership against the locked boundary doc; expect a large mechanical move plus test relocation and dependency-graph rewiring. The responsibility-3 Strategy services (routines, schedulers, promotion-pipeline, practice-meeting, git-export, builtin-routines) are NOT in scope and stay in place pending the Strategy-contract concept.

**Contracts / constraints.**
- The boundary is exactly `docs/architecture/kernel-strategy-split.md`; cost enforcement stays Kernel-side; one Strategy active at a time (unchanged).
- Pure relocation — no new behaviour, no schema change, no API change, no knowledge-management semantics change.
- No behaviour change when the Fabric is the selected Strategy — verified against current behaviour.
- After this WP the Kernel package must not depend on the Fabric package; the invariant is guarded, not just documented.

**Out of scope.** Reorganizing the Strategy's own content — the responsibility-3 "autonomous background knowledge work" services (routines, schedulers, promotion-pipeline, practice-meeting, git-export, builtin-routines) — which is blocked on the Strategy-contract `/concept` (flagged separately). Redefining the Strategy port surface. The notifications feature itself (only its physical location moves).

**Effort.** L (~3–5d)


---

### AK10 — Final kernel/strategy de-roling sweep: no hardcoded personas in any seam; all integration tests on minimal

**Workpackage.** As a contributor building a Strategy on top of the Kernel, I want a **final hygiene sweep** that guarantees no Kernel seam hard-codes a persona/role and that every harness integration test runs against the real minimal strategy — so the kernel/strategy boundary is *actually* clean, not just clean at the seams we happened to notice. The concrete known leak is the bet-decomposition turn (the Kernel injects `"You are a product manager. Break down the provided bet into a task list."` and names its turn `runRealPmTurn`/`pmAgentId`); this WP de-roles it by moving the decomposer's instruction to the Strategy (minimal supplies the simplest fallback, fabric the knowledge-enriched one). But the WP's defining job is the **sweep**: actively search every Kernel seam for further such leaks and fix them, and audit every harness integration test so they all run on the minimal strategy. This runs **late** — after the per-WP reworks (which each already target minimal) have landed — so by the time it runs most of the surface should already be clean; **discovering exactly what remains is this WP's task**, not something pre-enumerated here.

**Why this matters.** The kernel/strategy boundary (`docs/architecture/kernel-strategy-split.md`) is explicit: "the Kernel hard-codes no persona" (AK6 hard-rule #1) and "Decomposition is a Strategy response to a Kernel event, not a Kernel-hardcoded PM" (:55). The doc itself flags the `bet_decomposer` surface "now dead at production" (:340) — the Strategy picks *who* decomposes but never supplies *what they're told*, so the Kernel fills the gap with its own PM persona literal. That is a live contract violation: every Strategy silently inherits a Kernel-imposed PM role, and the Minimal Strategy (the contributor template) teaches the violation by example. AR5 demonstrated the leak is real and spreading (it propagated the literal into per-harness context files). The beneficiary is every contributor authoring a Strategy and the integrity of the boundary itself; the cost of not doing it is a permanent lie in the one doc that defines the split.

**What exists today.** AK6/AK7/AK8 (all shipped) established the Strategy port (`assembleContext` / `selectAgent` / `decomposeBet`) and made decomposition event-driven: `runBetDecomposition` (`packages/server/src/services/bet-decomposition.ts`) emits `work_decompose_requested` and calls `getActiveStrategy().decomposeBet()`; when the Strategy returns `{ decomposerAgentId, tasks: [] }` the Kernel runs its own turn (currently `runRealPmTurn`, with `pmAgentId` naming and the hardcoded `"You are a product manager…"` default prompt). Both `minimalStrategy` (`packages/strategy-minimal`) and `fabricStrategy` (`packages/fabric`) return `{ decomposerAgentId: PM-match-else-first-candidate, tasks: [] }` — they pick the agent but supply no instruction. The `decomposeBet` contract returns only *who*, not *what they're told*. AK6 already ships a persona-in-Kernel lint guard, but it is scoped to creation surfaces, not the decomposition path.

**What's genuinely missing.** Three things: (1) a seam by which the active Strategy supplies the decomposer's instruction/role (not just the agent id) for the decomposition turn, plus removal of the Kernel-hardcoded persona literal and PM-flavoured naming; (2) a **completed search of the whole Kernel surface** for any other seam that hard-codes a persona, role, or strategy decision — and the fix for each one found; (3) a **completed audit of every harness integration test** confirming they all run against the real minimal strategy (no fabric, no bespoke test-local strategy). The persona guard (AK6) must be extended so the cleaned state is mechanically held. The set of "further leaks" and "non-minimal tests" is deliberately not enumerated here — the WP discovers it against the real codebase at the time it runs.

**Depends on.** AK8 (`done`) — established the `decomposeBet` seam and the retained Kernel turn this WP de-roles; the seam must exist before it can be reshaped. (Already `done`, so not a scheduling blocker — listed for lineage.)

**Complexity.** M

**Pre-build gates.**
- **Concept:** Not required — reuses nouns already locked in `docs/architecture/kernel-strategy-split.md` (Kernel, Strategy, decompose, persona); no new or reshaped load-bearing noun.
- **Design:** Not required — backend / contract change with no rendered surface; skip `/design`.

**Human design review.** No — backend de-roling, no user-facing surface.

**Acceptance criteria.**
- The Kernel's decomposition turn contains no hardcoded persona or role text; the decomposer's instruction originates from the active Strategy.
- Running decomposition under two different active Strategies yields two different decomposer instructions with no Kernel code change (the instruction is Strategy-supplied, observable in the turn).
- Under the minimal strategy, committing a bet with an eligible agent still produces a valid task breakdown — the minimal strategy supplies the simplest decomposer instruction as its fallback.
- Under the fabric strategy, decomposition behaves as before (knowledge-enriched), with no regression in the produced breakdown.
- A lint/architecture guard fails the build if Kernel decomposition code reintroduces a hardcoded persona/role string (the AK6 persona guard now covers the decomposition path).
- No role-specific ("PM" / "product manager") identifiers remain in the Kernel decomposition path; the turn is named for its function, not a role.
- The whole Kernel surface has been searched for further persona/role/strategy-decision leaks; every genuine leak found is fixed (or, if any is deliberately deferred, it is named with a reason). At the end, no Kernel seam hard-codes a persona/role.
- Every harness integration test runs against the real minimal strategy — none uses fabric or a bespoke test-local strategy. Any test that genuinely needs fabric behaviour has been moved to an eval, not left as a test.
- Kernel-feature tests for decomposition run against the real minimal strategy (no bespoke test-local strategy, no fabric); fabric-strategy decomposition correctness is exercised by evals, not tests.

**Validation scenarios.**
- Given the minimal strategy active and a bet with one eligible agent, when decomposition runs, then a valid task breakdown is produced and no "product manager" persona string originates from Kernel source.
- Given a strategy that supplies a distinct decomposer instruction, when decomposition runs, then the decomposer turn uses that strategy-supplied instruction (a different instruction produces an observably different turn) with no Kernel change.
- Given Kernel decomposition code containing a hardcoded persona string, when the guard runs, then the build fails.
- Given the fabric strategy active, when decomposition runs, then the breakdown matches the pre-WP knowledge-enriched behaviour.
- Given the completed sweep, when the Kernel surface is searched for hardcoded persona/role strings, then none is found (or any deferred one is explicitly named with a reason), and when every harness integration test's active strategy is listed, then all are the real minimal strategy.

**Plan calls.** Standard backend `/architecture` pass — skip `/design`. The plan **begins with a discovery sweep**: search the whole Kernel surface for persona/role/strategy-decision leaks and audit every harness integration test's active strategy, producing the concrete worklist (this is the WP's job, run against the real codebase at execution time, not pre-enumerated). Then plan: the decomposition de-roling seam (the "dead at production" `bet_decomposer` surface is the natural carrier for the Strategy-supplied instruction; expect the `decomposeBet`/`DecompositionPlan` contract to change across the port + both shipped strategies), role-agnostic renaming, the fix for each further leak found, the switch of each non-minimal test to the minimal strategy (or relocation to an eval), and the extension of the AK6 persona guard to cover the swept surface. Because it is a sweep, size is discovery-driven — re-confirm S/M/L after the sweep and split if the worklist is large.

**Contracts / constraints.**
- The Kernel hard-codes no persona/role — the invariant from `docs/architecture/kernel-strategy-split.md` (AK6 hard-rule #1); guarded mechanically, not just documented.
- Decomposition behaviour is unchanged for a given active Strategy (no regression); only the *source* of the decomposer's instruction moves from Kernel to Strategy.
- The minimal strategy remains the simplest working baseline — it must keep producing a valid breakdown and stays the contributor template.
- Kernel-feature tests run against the real minimal strategy; fabric correctness is exercised by evals (per `.claude/rules/testing.md`).
- Any contract change to the `decompose` seam is forward-only and updates both shipped strategies (minimal, fabric) in lockstep.

**Out of scope.**
- The physical Kernel package extraction (AK9).
- Redoing the per-WP reworks (AR3–AR6 etc.) that each already target the minimal strategy — this WP is the *final net* that catches what they missed, not a re-run of their conversions.
- Reworking the Strategy port beyond what the decompose-instruction seam + the found leaks require.

**Sequencing.** Runs late — after the per-WP reworks that target minimal have landed — so the residual surface is small. It is the closing sweep of the kernel/strategy de-roling effort; the proportion already clean is itself an output of the WP's discovery step.

**Effort.** M (~1d) — discovery-driven; re-confirm and split after the sweep if the worklist is large.