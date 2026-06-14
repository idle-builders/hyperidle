# Track AK: Closing the Kernel Loop

Source: the kernel/strategy USP analysis of 2026-06-13 (`plans/reviews/kernel-strategy-usp-analysis.md`, founder-annotated) and the empirical verification pass of 2026-06-14 (worktree boot of `origin/main`, Playwright drive-through, full event-trace audit). The headline: the kernel work-loop's *plumbing* is genuinely built and verified working — bet authoring is block editing (AG3), task→session dispatch fires end-to-end (AD2, only the live-LLM credential is missing), review→verdict→resolve works live, and bet completion compounds into a retro knowledge item (AC1/AC2). What is missing are the **autonomy seams** that make the loop self-driving: committing a bet does not start work, the Assistant cannot draft a bet, and a captured idea (knowledge) cannot become a bet. This track builds those seams.

**The load-bearing finding.** Committing a bet is inert. `POST /api/bets/:id/commit` flips `draft→active` and emits `bet_state_changed`, but no subscriber acts on `toState=active` — `lifecycle-propagation` handles only `completed`/`killed`, and no decomposition code exists anywhere in the tree. Meanwhile the bet detail UI promises *"Your team will pick this up"* and *"Tasks will appear here once agents start work."* The promise is never kept. This is the spine of the Plan→Interact→Review→Repeat wedge, and it does not exist.

**Scope rules.** The seams between a committed bet and running work, plus the two entry seams (Assistant-drafts-bet, knowledge→bet), plus making the kernel runnable through a defined strategy interface. The **kernel/strategy separation (O2) is sacred** — any code added here must respect it (and AK4 sharpens it). User Sovereignty is preserved: agents propose and draft, humans commit; no new irreversible action bypasses the existing review gates. `npm run verify` must pass after each workpackage merges (same rule as Tracks AD–AI).

**Boundary with concept work.** Two adjacent ideas from the analysis are deliberately NOT in this track because they reshape load-bearing nouns and need `/concept` first: (1) the **unified human-attention scoring** that decides which tasks/concepts pull the founder in (today knowledge uses an 8-signal attention score and reviews use `riskTier`, separately) — AK1 explicitly scopes its human-gate out, pending that concept; (2) **harness-engineering vocabulary** (soul→AGENTS.md, sandbox, hooks, memory) — AK4's naming should follow that concept once it lands.

**Reference docs:** `plans/reviews/kernel-strategy-usp-analysis.md`, `docs/process-layer/`, `docs/agent-layer/`, `docs/knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md`, `ETHOS.md` (User Sovereignty), `.pipeline/work-packages/TRACK-AD.md` (dispatch), `.pipeline/work-packages/TRACK-AG.md` (AG3 bet-as-block).

---

### AK1 — Committing a bet starts work

**Workpackage.** As a founder who has shaped and committed a bet, I want the team to break it into tasks and begin working automatically, so that committing means work starts — not that I hand-type every task afterward. Today committing a bet only flips its status; the bet then sits with zero tasks while the interface tells me my team will pick it up. This workpackage makes a committed bet produce a real task breakdown owned by team agents, which the existing dispatcher then runs.

**Why this matters.** This is the single most important gap in the product. The Plan→Interact→Review→Repeat loop is the wedge, and "Interact" never begins: empirically, a committed bet creates nothing and the UI actively promises work that never happens. The downstream machinery already works (task→session dispatch is verified live) — there is simply nothing bridging commit→tasks. The cost of not building this is fatal: HyperIdle is a bet tracker where the founder does all the decomposition by hand, which is the opposite of an agentic OS. The founder is the direct beneficiary; every demo and every real run depends on this seam.

**What exists today.** The bet state machine (`bet-state-machine.ts`) transitions `draft→active`, is capacity-gated, and emits `bet_state_changed`. The task→session dispatcher (`task-dispatcher.ts` → `provision-registry` → `session-provisioning.ts`) is verified to fire on `task_state_changed(accepted)` and provision a session (it failed only at the live-LLM credential step in verification, proving the chain is wired). Teams carry an agent roster including a PM/builder. The tasks API and task state machine exist. **What is absent:** any subscriber on `bet_state_changed(active)`; `lifecycle-propagation.ts` acts only on `completed`/`killed`; there is no decomposition/auto-task code anywhere in the tree.

**What's genuinely missing.** A step that, when a bet is committed, turns its goal + concept into an accepted task breakdown owned by appropriate team agents — so the existing dispatch→session path takes over — and a UI that reflects real task state instead of a permanent false promise.

**Depends on.** None. (The decomposition's *human-attention gate* — which tasks/concepts to escalate to the founder — depends on the unified-attention concept and is scoped out below, not a blocker for the base loop.)

**Complexity.** L

**Acceptance criteria.**
- Committing a bet results in a task breakdown for that bet without the founder manually entering tasks.
- The produced tasks are owned by eligible team agents and flow into the existing dispatch→session path (a session is provisioned, or provisioning is attempted, for a ready task).
- A committed bet never sits indefinitely with zero tasks beneath a "work will start" promise; the bet surface reflects the real state of its tasks.
- When the team has no agent eligible to own the work, the founder is shown an explicit reason rather than a false promise.
- Human Sovereignty is preserved: nothing in this seam takes an irreversible external action without passing the existing review gates.

**Validation scenarios.**
- Given a committed bet on a team that includes a builder agent, when the commit completes, then at least one task exists owned by a team agent and a session is provisioned (or provisioning is attempted, observable in logs/DB), with no manual task entry.
- Given a committed bet, when the founder views it, then the task section shows actual tasks (or an honest empty/blocked state) — never a permanent "tasks will appear" placeholder over a silently empty list.
- Given a team with no eligible agent for the work, when a bet is committed, then the founder sees an explicit blocker explaining why work has not started.

**Plan calls.** Concept-sensitive at the seam: **whether decomposition is a kernel primitive or a strategy behavior is an open kernel/strategy question** — resolve it in `/concept` (kernel-vs-strategy boundary) before architecture, or scope this WP to a kernel-side commit trigger plus a default decomposer the strategy provides. `/design` for how the breakdown and the no-eligible-agent state appear on the bet surface. Then standard architecture pass for the event wiring and task creation.

**Contracts / constraints.**
- The kernel/strategy separation (O2) is preserved wherever the decomposition logic lives.
- The UI must never promise work it cannot start — the current "Your team will pick this up" copy is only valid when work actually starts.
- Reuse the existing task→session dispatch path; do not fork a second provisioning route.

**Out of scope.** The high-impact **human-attention gate** (which tasks or concepts pull the founder in for a check before work proceeds) — depends on the unified human-attention concept (separate `/concept`); for now the breakdown flows without per-task escalation. Cross-team decomposition. The quality of the decomposition itself (which agent, how granular) is an architecture/eval concern, not an AC here.

**Effort.** L (~3–5d)

---

### AK2 — The Assistant can draft and shape a bet

**Workpackage.** As a founder, I want to talk an idea through with my Assistant and have it draft and shape a bet that I can refine and commit, so that starting work can begin in a conversation rather than from a blank form. Today the Assistant thread accepts my messages but never replies — the dispatcher only logs intent — so the "discuss → concept → bet" entry that the product is built around does not exist.

**Why this matters.** Concept step A ("discuss with the Assistant who writes the concept") is a core entry to the kernel loop and is entirely absent: verification confirmed the Assistant fires a dispatch log and then does nothing. The Assistant is currently decorative. The cost of not building this is that the most natural on-ramp — describe what you want, get a shaped bet back — is missing, and the founder is left with only the blank-form path. The founder gains a real operator that turns conversation into committed work.

**What exists today.** The Assistant is a real per-user individual agent (AD8b) with an overlay and a persistent thread. `assistant-dispatcher.ts` subscribes to `thread_message_appended`, filters human→assistant-thread messages, and **only logs** — its own docstring says full session provisioning is "deferred to a future story." The session-provisioning pipeline and the skill-tools registry exist and work. Bet creation via `POST /bets` works, and bet authoring is block editing (AG3). A `create_bet` capability is named in AD8b but is not wired into the Assistant's tool surface.

**What's genuinely missing.** A real Assistant session that responds substantively in the thread and can produce a draft bet (goal + concept body) from the conversation, surfaced for the founder to edit and commit — with the human as the one who commits.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- The founder can hold a back-and-forth with the Assistant in its thread and receive substantive replies (not silence).
- The Assistant can produce a draft bet — a goal and a concept body — derived from the conversation.
- A bet the Assistant drafts lands as an editable draft that the founder reviews before committing; the Assistant never commits a bet autonomously.
- The founder can iterate conversationally (e.g. narrow the scope, change the appetite) and the draft updates accordingly.

**Validation scenarios.**
- Given the founder describes an idea to the Assistant and asks for a bet, when the Assistant responds, then a draft bet is created or proposed with a concept body derived from the conversation, in `draft` status.
- Given an Assistant-drafted bet, when the founder edits and commits it, then the normal bet lifecycle applies.
- Given the Assistant proposes a bet, then it is presented for human approval and is never auto-committed.

**Plan calls.** `/architecture` for the Assistant session lifecycle and tool wiring (reuse session-provisioning + skill-tools, do not fork a parallel runtime). `/design` for how a drafted bet is surfaced out of the thread into the bet authoring surface. Concept check: confirm the Assistant's authority boundary (draft-only, human commits) against ETHOS User Sovereignty.

**Contracts / constraints.**
- User Sovereignty: the Assistant proposes and drafts; the human commits. No irreversible action.
- Reuse the existing session-provisioning pipeline and skill-tools registry — no second agent runtime.
- Bet drafting reuses the AG3 block authoring surface; no new content dialect.

**Out of scope.** Autonomy-level management UI for the Assistant. The Assistant editing arbitrary factory-level documents. Auto-decomposition of the drafted bet (that is AK1, triggered on commit).

**Effort.** L (~3d)

---

### AK3 — Promote a knowledge item into a bet

**Workpackage.** As a founder, I want to turn a knowledge item into a bet, so that an idea I captured as knowledge can become committed work without my retyping it. Today knowledge and bets are linked only in reverse — a finished bet's retro becomes knowledge — so an idea that lives in the Knowledge view is a dead end with respect to starting work.

**Why this matters.** The founder explicitly asked whether a knowledge document could become a bet description. Because bet content is already blocks rendered through the same pipeline as knowledge (AG3), the transfer is natural and cheap to build, and it closes the missing edge of the capture→commit loop. The cost of not building it is small but real: captured ideas can't flow into work, so the Knowledge view accumulates intent that never converts. Modest scope, clear benefit, low risk.

**What exists today.** Knowledge items carry a block/markdown body; bets render through the same block pipeline (AG3); bet creation via `POST /bets` accepts free-text/markdown. `WorkBet` has an "Add knowledge" action that links a knowledge item *to* a bet (the reverse direction). Verification found **no** path from a knowledge item to a new bet.

**What's genuinely missing.** An action that seeds a new draft bet from a knowledge item's content, records a provenance link back to the source item, and drops the founder into the bet authoring surface to shape it before committing.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- From a knowledge item, the founder can create a draft bet pre-filled with that item's content.
- The new bet retains a link back to the source knowledge item (provenance is recoverable).
- After promotion the founder lands in the normal bet authoring/edit surface to refine the bet before committing.

**Validation scenarios.**
- Given a knowledge item, when the founder promotes it to a bet, then a `draft` bet exists containing the item's body and a provenance link, and the founder is taken to edit it.
- Given the promoted bet, when the founder commits it, then the normal bet lifecycle applies (including AK1 once that lands).

**Plan calls.** `/design` for the promote affordance and how provenance is shown; standard architecture pass. Bet is already a block host — reuse the AG3 authoring surface, do not rebuild an editor.

**Contracts / constraints.**
- Reuse the existing bet authoring surface and block pipeline; no new content dialect.
- Promotion creates a `draft` — the human commits.

**Out of scope.** Bidirectional sync between the knowledge item and the bet. Agent-initiated auto-promotion of knowledge into bets.

**Effort.** M (~1d)

---

### AK4 — Kernel runs a task through a swappable strategy, proven by a minimal reference strategy

**Workpackage.** As a maintainer and as a future third-party contributor, I want the kernel to run a task through a clearly-defined strategy interface, with a minimal reference strategy that simply deploys the task to a harness and does no knowledge injection, so that the kernel can be exercised and trusted in isolation and others can build alternative strategies without forking the system. Today the full knowledge fabric is the only strategy and it is hard-wired into the run path.

**Why this matters.** The kernel/strategy split is HyperIdle's stated extensibility story (O2; documented in TRACK-Z as "kernel is stable, strategy is replaceable"), but verification shows it is only half-real: `provisionSession` is swappable through the registry, yet the production implementation hard-imports the fabric (`materialize`, `composePrompt`, `checkCostCap`) and there is no kernel package boundary. A minimal strategy is the TDD harness that lets us verify the kernel without the fabric, and the reference template a contributor copies. The cost of not building it: the kernel can never be tested independently of the fabric, the "replaceable strategy" promise is hollow, and the founder's plan to "hone the kernel while keeping strategy complexity to the side" is blocked.

**What exists today.** `provision-registry.ts` exposes `setProvisionSessionFn`/`getProvisionSessionFn` — a genuine seam the dispatcher calls through. The production `provisionSession` (`packages/server/services/session-provisioning.ts`) statically imports fabric functions and uses them at dispatch time. O2 moved strategy *fields* into extension tables (`knowledgeStrategyFabric`, `taskStrategyFabric`). There is **no** `packages/kernel`; "kernel" today means the bet/task state machines in the server, "strategy" means the fabric, and the run path couples them.

**What's genuinely missing.** An explicit strategy port (what the kernel asks a strategy to provide at dispatch time), a minimal reference strategy implementing it with no materialization/relevance/attention, and a reduction of the kernel's hard dependency on the fabric so the fabric becomes one implementation of the port rather than a baked-in requirement.

**Depends on.** None. (But see Plan calls — this is concept-first.)

**Complexity.** L

**Acceptance criteria.**
- A task can be dispatched and run end-to-end under a minimal strategy that performs no knowledge materialization, relevance, or attention work.
- The kernel's dispatch-time contract with a strategy is explicit and documented (a reader can state what the kernel requires of any strategy).
- The full knowledge fabric runs as one implementation of that contract, with no behavior change when it is the selected strategy.
- Selecting the minimal strategy requires no modification to kernel code — only registering a different strategy.

**Validation scenarios.**
- Given the minimal strategy is active, when a task is dispatched (with a stub/echo harness), then a session runs to completion and no fabric materialization occurs (observable in logs/DB).
- Given the fabric strategy is active, when the same task runs, then knowledge is materialized exactly as today — no regression against current behavior.
- Given a contributor implements the strategy port in a new module, when they register it, then it runs without any change to kernel code.

**Plan calls.** **Concept-introducing — do not start with architecture.** Begin with `/concept` on the kernel↔strategy boundary (what is kernel, what is strategy, what the dispatch-time port is) and the harness vocabulary, per the founder's stated sequence: understand the nouns → refine the interface → build the minimal strategy first (to TDD the kernel) → add kernel tests → reduce the fabric coupling / extract the kernel runtime. Multi-version exploration on the port shape; design-it-twice. A full `packages/kernel` extraction may be split into its own workpackage during architecture — that is expected.

**Contracts / constraints.**
- The O2 separation is preserved and sharpened; no behavior change when the fabric strategy is selected.
- The kernel must not import any specific strategy.
- The minimal strategy ships as a real, documented reference implementation, not a test fixture.

**Out of scope.** Unified human-attention scoring (separate `/concept`). Harness-engineering vocabulary rename (separate `/concept`, though it informs naming here). A recommended-to-users production strategy beyond the existing fabric — the minimal strategy is for verification and as a contributor template, not the default user experience.

**Effort.** L (~4–6d)
