# Track AK: Closing the Kernel Loop

Source: the kernel/strategy USP analysis of 2026-06-13 (`plans/AK/kernel-strategy-usp-analysis.md`, founder-annotated), the empirical verification of 2026-06-14 (worktree boot of `origin/main`, Playwright drive-through, full event-trace audit), and the locked boundary concept `docs/architecture/kernel-strategy-split.md`. The headline: the kernel work-loop's *plumbing* is built and verified — bet authoring is block editing (AG3), task→session dispatch fires end-to-end (AD2, only the live-LLM credential missing), review→verdict→resolve works live, bet completion compounds into a retro knowledge item (AC1/AC2). What is missing is (a) the **kernel/strategy separation** drawn cleanly so the Fabric is one swappable Strategy and a minimal strategy can prove the kernel in isolation, and (b) the **autonomy seams** that make the loop self-driving — committing a bet does not start work, the Assistant cannot draft a bet, knowledge cannot become a bet.

**The load-bearing finding.** Committing a bet is inert. `POST /api/bets/:id/commit` flips `draft→active` and emits `bet_state_changed`, but no subscriber acts on `toState=active` — `lifecycle-propagation` handles only `completed`/`killed`, and no decomposition code exists. Meanwhile the bet detail UI promises *"Your team will pick this up"* / *"Tasks will appear here once agents start work."* — never kept. This is the spine of the Plan→Interact→Review→Repeat wedge.

**Boundary is locked.** `docs/architecture/kernel-strategy-split.md` is the fixed input for this track. The cut is **functional, not stable/volatile** (that framing is rejected): **Kernel** = the application + the agent-running runtime (conversations, work plan/review, knowledge *editing*, users, and running agents — harness, sandbox, session, tools/Skills/hooks, cost). **Strategy** = the knowledge/context layer behind a port (context assembly in, learning ingestion out, and the background knowledge work). The **Fabric** is one Strategy implementation; its 4-layer knowledge-management design is **deeply researched and out of scope to change** — the only requirement on it is that it keeps working unchanged behind the shifted boundary.

**Dependency order (build top-to-bottom).** AK1 (rename) → AK2 (split) → AK3 (commit→work); AK4 and AK5 need only AK1 and can run in parallel once it lands.

```
AK1 rename ─┬─► AK2 split ─► AK3 commit→work
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
