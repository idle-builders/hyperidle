# AL6 — Concept: Harness review-return hooks

**Concept act.** AL6 introduces three load-bearing nouns into the agent-runtime/harness layer: the **accepted-return set**, the **return action**, and the **not-returned** turn outcome. This doc locks what each IS, what it is NOT, where the enforcement seam lives so it is harness-agnostic, and what "a turn cannot end without returning" means operationally. The architecture doc turns this into types + an enforcement hook + an ordered task list.

The thesis (Track AL): "review for anything / pull the human in where it matters" is only real if agent work actually reaches the review surface. Today an agent can finish a turn without surfacing its output to HyperIdle — its output is then invisible and ungoverned. AL6 makes returning to HyperIdle the **mandatory last step of any turn**, drawn from a **closed** set.

---

## 1. The load-bearing nouns

### 1.1 Turn

**A turn is one bounded run of an *agent acting on the user's behalf* through a harness, from start until its event stream exhausts.** The italicised qualifier is load-bearing — it carves out internal-extraction drains (§1.5).

In this codebase a turn maps to **one harness session run** — the span between `harness.startSession(config)` and the moment the adapter's `streamEvents` async-iterable is exhausted (the `for await` loop falls through). **Re-grepped (`for await … streamEvents`, non-test):** there are exactly **five** such loops; **three** are turn drains and **two** are forwarding relays. The three turn drains:

- **Task sessions** — `runSession` (Phase 10) in `packages/server/src/services/session-provisioning.ts:760`. The builtin adapter's internal plan→execute→reflect loop, or an external CLI/remote harness, runs many LLM round-trips and tool calls inside one session; the *whole* session is the turn. **Enforced.**
- **Conversational assistant turns** — `runTurnInternal` → `drainStreamEvents` in `packages/server/src/services/assistant-turn.ts:661`. One user message → one assistant reply. **Enforced.**
- **PM decomposition extraction** — `decompose` → `drainForCompletion` in `packages/server/src/services/bet-decomposition.ts:616`. A real PM agent turn (`startSession` → drain → `stopSession`, real model tier `workhorse`) that ends with raw JSON the caller parses, and **never invokes a return action**. This is a genuine session run but **NOT a turn under this concept's definition** — it is an internal-extraction drain, **exempt** (§1.5). Resolving it explicitly is the load-bearing correction of this revision.

The two forwarding relays are **not turns and not enforcement sites** (§1.6): `isolated-session-worker.ts:54` and `desktop-worker-client.ts:223` each re-emit every consumed event to a parent process / client (`process.send({type:"event"})`) where an *enforced* drain (site A, via the isolated/remote adapter) does the gating. Gating a relay would double-count the same turn.

A turn is **NOT**:
- A single LLM round-trip (the builtin loop has many per session).
- A single tool call (a turn invokes 0..N tools mid-flight).
- A task or a bet (those are work primitives a turn operates *on*; a task may span several turns via handoff/re-dispatch).
- A thread or a message (those are the review-loop substrate a return *writes into*).

**Why "until the stream exhausts" is the right boundary.** It is the one event that is structurally identical across *every* adapter — builtin, CLI, remote, isolated, mock — because every adapter implements `HarnessAdapter.streamEvents(): AsyncIterable<HarnessEvent>`. Picking any harness-internal notion of "turn" (the builtin's `runChatTurn`, the CLI's `result` line) would be adapter-specific and violate AC4. The stream boundary is the agnostic seam (see §3).

> **SHARED-contract note.** "Turn" is a runtime span, not a persisted entity. It needs no DB table. It is observed, not stored. This keeps the verdict grammar and thread model unchanged (an explicit constraint).

### 1.5 The exemption boundary — internal-extraction drains (NOT turns)

The return gate enforces "an agent that *acted on the user's behalf* must hand its work back for review." Some session runs are not that. They are **internal-extraction drains**: the platform drives a tool-less, deterministic structured-output completion whose result it parses programmatically — the agent is being used as a *function*, not as an actor whose output a human gates.

**Definition (a property, not a file list).** A session run is an **internal-extraction drain — exempt from return enforcement — when ALL of the following hold:**

1. **No tools available** — `SessionConfig.tools` is empty (`[]`). With no tools the run *structurally cannot* invoke a return action; enforcing one is impossible, not merely skipped.
2. **Deterministic structured-output contract** — the caller consumes the completion text programmatically (parse/validate), not by surfacing it to a human. The output never claims to be "the agent's reviewed work."
3. **Not acting on the user's behalf** — the run is platform-internal extraction (decompose a bet into tasks, classify, summarise-for-machine), not an agent executing a user/task assignment. Its *downstream* product (e.g. the tasks `decompose` creates) re-enters the normal reviewed surface through the enforced sites; the extraction step itself is plumbing.

`bet-decomposition.ts`'s PM turn satisfies all three (`tools: []`, JSON parsed by `decompose`, platform-internal). It is therefore **exempt** — and any *future* internal-extraction turn that satisfies the same three properties is covered by the same rule, so the closed-set guarantee and AC1 stay precisely true without a hardcoded carve-out per call site.

**Why exempt rather than wire as a third return site (option b over option a).** Option (a) — make `drainForCompletion` an enforced return site — is incoherent: the turn has *no tools*, so there is no return action it could ever call; you would have to invent and inject a return tool into a turn whose entire contract is "emit JSON, caller parses," then have the gate fire `not-returned` on every run forever. Option (b) — the property-based exemption — matches what the run actually *is*: a deterministic extraction, not an agent surfacing reviewable work. The boundary is expressed as the **three-property predicate above**, evaluated at the drain, so it is not file-coupled.

**AC1 restated precisely under the exemption.** "Every agent turn, on every harness, ends by invoking a member of the accepted-return set" — where **turn** = a session run that is **not** an internal-extraction drain. A run that satisfies the §1.5 predicate is *not a turn*; AC1 makes no claim about it. Every run that IS a turn (sites A and B today) is gated at the agnostic seam (§3). This is the exact-truth wording the architecture's enforcement must implement: the gate is constructed at every drain, but `evaluateReturn` treats an extraction-drain end-reason as exempt (§3.3), so an extraction run is never `not_returned`.

### 1.6 Forwarding relays — NOT enforcement sites

A **forwarding relay** consumes a `streamEvents` iterable only to re-emit each event verbatim to another process/transport; it terminates no turn and parses no completion. `isolated-session-worker.ts:54` (`process.send({type:"event", event})` to the parent) and `desktop-worker-client.ts:223` are relays. The turn they carry is gated *once*, at the parent's enforced drain (site A), after the events arrive via the isolated/remote adapter's `streamEvents`. A relay must **not** thread the gate — doing so would evaluate the same turn twice and could (wrongly) flag a relay whose parent already passed. The §2.3 static guard must distinguish relays from turn drains (it does — see there).

### 1.2 Return action

**A return action is a tool invocation, from a fixed closed set, that hands the turn's work back to HyperIdle so a human can see and gate it.**

The defining property is not "writes to the DB" and not "is the last tool called" — it is **"surfaces this turn's output into a HyperIdle surface a human reviews (a thread/review/inbox/task-state a human attends)."** A return action is the bridge from agent-runtime back up to the human-interface layer.

A return action is **NOT**:
- Any tool that merely mutates state (`write_memory`, `create_artifact`, `edit_block`, `log_task`) — these produce work but do not *surface it for review*. An artifact written but never submitted is exactly the silent-escape failure AL6 closes.
- A read/query tool (`read_inbox`, `query_practice`, `score_attention`, `route_item`).
- A planning/bookkeeping tool (`write_session_notes`, `create_task`, `create_bet`).

This boundary is the heart of the concept. The closed set is defined in §2.

### 1.3 Accepted-return set

**The accepted-return set is the closed, enumerable set of tool names that count as a valid turn ending.** It is a single source-of-truth constant (a frozen set of tool names) that both the tool layer and the enforcement hook reference — no second list, no "any tool counts," no per-harness override.

Properties:
- **Closed** — membership is fixed in code, not derived from "tools that happen to write a message." Adding a member is a deliberate edit to one constant.
- **Enumerable** — HyperIdle can answer "which actions count as a valid turn ending?" by reading the constant (AC2).
- **Harness-agnostic** — the same set gates every adapter (AC4). It lives in `packages/shared` so server tools, all adapters, and the enforcement hook import one definition.
- **A property OF tools, surfaced as a set** — each return tool is tagged terminal at its definition; the set is the closure of those tags. This prevents drift between "the tool exists" and "the tool is in the set."

### 1.4 Not-returned (turn outcome)

**`not-returned` is the outcome of a turn whose event stream exhausted without any return action having been invoked.** It is the detection that AC3 demands: the turn does not *silently* complete.

Two response policies are possible on detection — the architecture picks one (see §4). The concept locks the *invariant*: a not-returned turn is **never accepted as a clean, complete, reviewed-loop turn.** It is either redirected (the agent is prompted/forced to return before the turn is allowed to settle) or **flagged** (the turn settles but is recorded/emitted as `not-returned` so it is visible as an escape, not silently green).

`not-returned` is **NOT**:
- A crash (`crashed`) — the harness errored; that is a different failure mode already handled.
- A `stopped`/aborted turn (handoff/PATCH cut it short) — abort is an intentional external interruption, not an agent forgetting to return. (See §3.3 — abort is exempt.)
- A `budget_exhausted` turn — the cap cut it; the agent did not get to finish. (See §3.3 — also exempt.)

---

## 2. The closed accepted-return set

A return action must **surface this turn's output into a human-attended HyperIdle surface.** Applying that test to the existing tool catalogue (`ALL_TOOL_DEFINITIONS` in `tool-registry.ts`):

| Tool | In set? | Why |
|---|---|---|
| `submit_review` | **YES** | The canonical return: posts a review-type (or plain) message to the bet's host thread for a verdict. This IS "submit for review." |
| `handoff_to` | **YES** | Hands the task to another agent / a role / **a human reviewer**; ends the session and transfers ownership. The work is explicitly returned (with status, artifacts, remaining-work) to a HyperIdle-managed inbox/escalation. "Close a task / hand back." |
| `send_message` | **YES** | Posts a message to a human-or-agent thread. The turn's output reaches a thread a human can read. This is the spec's named "send a message" return. |
| `update_task_status` | **YES (terminal states only)** | Transitioning a task to `done` / `cancelled` / `paused` is "close a task" — it returns the work item to a state a human sees on the work surface. **Non-terminal transitions** (`accepted`→`active`) are mid-turn bookkeeping, NOT returns. See §2.1. |

Everything else in `ALL_TOOL_DEFINITIONS` is **NOT** a return action: `read_inbox`, `query_practice`, `write_memory`, `create_item`, `write_session_notes`, `create_task`, `create_artifact`, `route_item`, `score_attention`, `promote_knowledge`, `create_conflict_review`, `create_team`, `add_agent`, `create_bet`, `edit_bet`, `create_routine`, `update_routine`. They are legitimate mid-turn tools; using them does not end the turn (AC5).

**The minimal lock for v1 is `{ submit_review, handoff_to, send_message }`.** These three exactly match the spec's named trio ("submit something for review, close a task, send a message" — where `handoff_to` is the "close a task / hand back" action that also ends the session). `update_task_status` is a strong candidate but introduces an argument-dependent membership (terminal state only) that complicates the "closed set of tool *names*" property — §2.1 resolves how to treat it; the architecture decides whether v1 includes it or defers it. **Recommendation: include the three name-level returns in v1; treat `update_task_status`→`done`/`cancelled` as an additive, argument-gated member the architecture may include or defer without reshaping the model.**

### 2.1 Argument-gated membership — the one wrinkle

`update_task_status` is terminal only for some arguments (`state: done|cancelled`, arguably `paused`). The accepted-return set is fundamentally a set of **tool names**, but one tool's return-ness depends on its args. Two clean ways to keep the set closed:

- **(A) Predicate-per-tool.** A terminal tool may carry a predicate `isReturn(args) => boolean` instead of an unconditional flag. `submit_review`/`handoff_to`/`send_message` always return `true`; `update_task_status` returns `true` only for terminal target states. The set stays closed (membership is still a fixed list of tools), and enumeration still works (the constant lists the tools; the predicate refines the per-invocation answer). **Preferred.**
- **(B) Name-only set, defer `update_task_status`.** v1 set is the three always-terminal tools; `update_task_status` is out of scope until a follow-up. Simpler, smaller v1.

The architecture chooses A or B. The concept locks: **whichever is chosen, the set is still a fixed enumerable list of tools; argument-gating is a per-tool refinement, never an open-ended "any tool with the right args."**

---

## 3. Enforcement — operational meaning of "a turn cannot end without returning"

### 3.1 The detection rule

> A turn's event stream carries `tool_call` events for every tool the agent invokes (every adapter emits them — see §3.2). **As the stream is consumed, the enforcement hook records whether any consumed `tool_call` named a member of the accepted-return set (passing its per-tool predicate). When the stream exhausts, if no return action was seen and the turn was not aborted/budget-cut/crashed, the turn is `not-returned`.**

This is pure observation over the existing event stream — it adds **no new event type the adapters must emit** and **no new method on `HarnessAdapter`**. It reuses the `ToolCallEvent` contract (`{ type: "tool_call", toolName, args }`) that already flows from every adapter.

### 3.2 Why the event stream is the one harness-agnostic seam (AC4)

I traced every adapter. All emit `tool_call` into their `streamEvents` iterable, and the drain loop already inspects it:

- **builtin** (`builtin-harness-adapter.ts:721-726`): `executeToolCalls` emits `{ type: "tool_call", toolName, args }` *before* executing each tool, internally. The provisioning loop reads these (session-provisioning.ts:817).
- **cli** (`cli-harness-adapter.ts`): parses ndjson stdout lines via `normalizeHarnessEvent` into `HarnessEvent`s including `tool_call`. (When MCP-backed, the actual invoke happens via the MCP bridge, but the adapter still surfaces the `tool_call` event for observability — session-provisioning.ts:817-829 emits `tool_call_recorded` regardless of MCP.)
- **remote** (`remote-harness-adapter.ts`): forwards worker `event` messages (incl. `tool_call`) into the stream.
- **isolated / mock**: same `streamEvents` contract.

**The single seam is therefore: the consumption of `harness.streamEvents()`.** The two enforced turn drains (`runSession` Phase 10 and `assistant-turn`'s `drainStreamEvents`) already loop over this exact iterable and already branch on `event.type === "tool_call"`. The enforcement hook is a small pure observer threaded into both loops — **not** a per-adapter change.

> **Critical AC4 risk + its closure (corrected).** The failure mode is enforcing in some drain sites and missing another. **Re-grepped `for await … streamEvents` (non-test):** five loops — **three turn drains** (`session-provisioning.ts:760`, `assistant-turn.ts:661`, `bet-decomposition.ts:616`) and **two forwarding relays** (`isolated-session-worker.ts:54`, `desktop-worker-client.ts:223`). Of the three turn drains, two are **enforced** (A, B) and one — `bet-decomposition`'s PM extraction — is an **internal-extraction drain, exempt** by the §1.5 predicate (`tools: []`, deterministic JSON parse, platform-internal). The two relays are **not enforcement sites** (§1.6). I re-grepped specifically for any *other* unexempted turn drain and found none: every remaining `streamEvents` reference is an adapter *method definition* (cli/builtin/remote/isolated/mock), not a `for await` consumption. The architecture must wire the observer into the two enforced sites and add a static guard that makes a *future* unexempted turn drain impossible-to-forget **while not firing on relays or on exemption-declared extraction drains** — see §2.3. This is the load-bearing architectural decision; it is detailed in the architecture pass. (The earlier "exactly two, verified" claim was wrong — it missed the third turn drain; this revision replaces the unverified count with the re-grepped five-loop enumeration above.)

### 3.3 What counts as "the turn ending" — and the exemptions

A turn "ends" when its `streamEvents` iterable exhausts on the **normal** path. The gate is evaluated **only** on that normal completion. Exempt (the gate does not fire `not-returned`):

- **crashed** — an `error` event broke the loop, or `startSession` threw. Already a failure outcome; not a missing-return.
- **aborted/stopped** — `aborted` flag set by handoff/PATCH (`sessionRunRegistry.abort`). The turn was cut short intentionally; the agent never reached its ending. (Note: a `handoff_to` *is itself* a return — if the agent called it, the gate is already satisfied before abort.)
- **budget_exhausted** — per-run cap broke the loop. The agent did not get to finish.
- **internal-extraction drain** — the run satisfies the §1.5 three-property predicate (no tools, deterministic structured-output, platform-internal). This is **not a turn**; the gate must never fire `not-returned` for it. Unlike crashed/aborted/budget (run-time end-reasons), this exemption is a *property of the run's configuration*, known at drain construction — the enforced sites (A, B) are never extraction drains; `bet-decomposition` is, and stays exempt-by-construction without per-site wiring.

Rationale: AL6 governs an agent that *chose to stop* without returning, not an agent that was *prevented* from finishing (crashed/aborted/budget) and not a tool-less deterministic extraction the platform runs as a function (internal-extraction drain). Conflating any of these with a missing-return would produce spurious `not-returned` flags.

### 3.4 What happens on a not-returned turn — redirect vs flag

The concept permits two policies; the architecture picks (and may stage):

- **Redirect (active).** On stream-exhaust-without-return, inject a final forced step: the harness is re-prompted ("you must return your work via submit_review / handoff_to / send_message before finishing") and the turn is not allowed to settle until a return lands or a bounded retry budget is spent. Strongest guarantee; most invasive (needs a re-prompt round-trip the builtin can do natively but CLI/remote cannot uniformly). **Likely not uniformly achievable across CLI/remote in v1.**
- **Flag (detect + surface).** On stream-exhaust-without-return, the turn settles but is recorded as `not-returned`: a distinct session outcome / an emitted event (e.g. `session_not_returned`) / a derived inbox item so the escape is **visible and attributable**, never silently green. Uniformly achievable across all adapters because it sits at the agnostic drain seam, not inside any harness.

**Recommendation:** v1 ships **flag** (uniform, AC3/AC4-satisfying, zero per-adapter work), with **redirect** available where the harness supports a forced final step (builtin) as an additive enhancement. AC3's wording ("redirected to return, **or** surfaced as not-yet-returned") explicitly blesses the flag path. The architecture decides; the concept's invariant holds either way: **never silently complete.**

### 3.5 AC5 — mid-turn non-terminal tool use is unaffected

The gate constrains only the *ending*. Mid-turn an agent may call `read_inbox`, `write_memory`, `create_artifact`, etc., freely — none is blocked, none ends the turn. The observer only *reads* the tool_call stream; it never intercepts or rejects a mid-turn invoke. The single bit it computes ("was a return seen by stream-end?") is evaluated **at exhaust**, not per-call. A turn that calls ten non-terminal tools and then `submit_review` passes; a turn that calls ten non-terminal tools and stops fails. This is exactly AC5.

---

## 4. Silent assumptions probed

1. **"One turn = one session run."** Assumed and verified — every drain (the two enforced turn drains *and* the exempt extraction drain) runs exactly one stream per session run. If a future harness multiplexed several logical turns over one stream, the gate would need a per-turn delimiter. v1 scope (one stream = one turn) is correct for every current adapter; flagged for the architecture as the boundary condition.
2. **"Every adapter emits `tool_call` for return tools."** Verified for builtin (internal emit before execute). For MCP-backed CLI/remote, the *invoke* goes through the bridge but the adapter still surfaces a `tool_call` event into the stream (the provisioning loop emits `tool_call_recorded` for it). **The architecture must confirm the MCP-bridge path also surfaces a stream `tool_call` for the return tool** — if an MCP tool call could be invisible to the stream, the gate would have a hole on CLI/remote. This is the one place the agnostic claim could break; it is the architecture's top verification item. (Mitigation if it breaks: observe returns at the registry/bridge invoke boundary keyed by sessionId, which is also harness-agnostic — both `runSession` and the MCP bridge funnel through `registry.invoke`.)
3. **"`send_message` to an agent is a real return."** Yes — it surfaces output into a thread a human (or an agent who will surface it onward) reads. The spec names it explicitly. We do not require the recipient to be human; requiring that would over-constrain agent↔agent collaboration. The guarantee is "output reached a HyperIdle thread," not "a human read it this instant."
4. **"Conversational assistant turns must also return."** The assistant turn *always* ends by persisting a plain reply to the thread (`assistant-turn.ts` "NEVER silent" invariant) — that persisted reply IS a return-equivalent (it surfaces into a human-attended thread). So the assistant path is *already* compliant by construction; AL6's job there is to make that guarantee **explicit and checked at the same seam**, not to add a new requirement. The architecture should confirm the assistant reply persistence is recognised as a return (either it counts the completion-persist as a return, or the gate is satisfied because the assistant's draft tools are out of the enforced set and the reply-persist is the structural return).

---

## 5. What's settled vs. left to the architecture

**Settled (this concept):**
- The closed accepted-return set: `{ submit_review, handoff_to, send_message }` (+ optionally `update_task_status`→terminal via per-tool predicate).
- "Turn" = one harness session run **that is not an internal-extraction drain (§1.5)**; "turn ends" = `streamEvents` exhausts on the normal path.
- Enforced turn drains = **two**: `session-provisioning.ts:760` (A) and `assistant-turn.ts:661` (B). Re-grepped, five `for await … streamEvents` loops total: A, B, the exempt extraction drain (`bet-decomposition.ts:616`, §1.5), and two forwarding relays (§1.6). No other unexempted turn drain exists.
- The exemption boundary (§1.5) is a **three-property predicate** (no tools, deterministic structured-output, platform-internal), not a file list — future extraction turns are covered automatically.
- The agnostic seam = consumption of `harness.streamEvents()`, observed via the existing `tool_call` event contract — no new adapter method, no new event the adapters must emit.
- Exemptions: crashed / aborted / budget_exhausted **and internal-extraction drains** are not `not-returned`.
- Invariant on violation: never silently complete (flag at minimum).
- AC5: observation-only, evaluated at exhaust, never blocks mid-turn tools.

**Left to the architecture:**
- (a) The exact TS construct for the closed set + per-tool terminal tag/predicate, and where in `packages/shared` it lives.
- (b) The shared return-gate observer and how it threads into the **two** enforced drain sites + the §1.5 extraction exemption (how an extraction drain declares itself exempt at construction) + the §2.3 static guard that distinguishes turn drains from relays so it neither misses a future drain nor fires on a relay.
- (c) **Verify** the MCP-bridge (CLI/remote) path surfaces a stream `tool_call` for return tools, or fall back to observing at `registry.invoke` (also agnostic).
- (d) Policy: flag (v1) vs redirect (additive), the `not-returned` outcome/event shape, and whether it persists.
- (e) Whether v1 includes `update_task_status` (predicate path) or defers it.
- (f) Per-AC verification methods (closed-set = type/lint; detection + exemptions + agnostic-across-two-harnesses = runtime tests importing the observer).
