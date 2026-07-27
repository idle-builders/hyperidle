# lifecycle-projection — Service-as-Product Audit (AU20)

**Layer:** agent-orchestration (infrastructure / platform)
**Current public exports:** 14
**Owned tables:** `agentLifecycleInbox`
**Production service consumers:** 0 (only the composition root boot-wires the drain; `session-requests` reaches it via the bindings layer)
**Verdict: DISSOLVE into `session-requests`.**

---

## 1. Existence / Consolidation Verdict

### What it actually is
`lifecycle-projection` is the **read/drain half of one durable transactional-inbox**. The write half lives in `session-requests`: when an agent session-request reaches a terminal state, `session-requests`' `terminalizeAgentSessionRequestInTx` appends exactly one fact into `agentLifecycleInbox` (via this service's `insertLifecycleInboxFactIfAbsent`), in the same transaction as the terminalization. This service's drain loop then claims each fact and projects it back into the **originating domain's** terminal state (routine run outcome, bet decomposition status, explicit-session-start outcome, task-dispatch-attempt status). Retention (`list…Before` + `delete…ByRequestIds`) is driven by `session-requests`' reaper sweep.

The inbox exists purely to **decouple** terminalization from the fan-out, so the terminalize path doesn't synchronously import every downstream domain. That is an *internal implementation mechanism of the session-request lifecycle*, not a product with its own consumers.

### Why the "separate Service" claim fails
AU19's justification is verbatim table-ownership-as-boundary: *"one of only two agent-orchestration Services that genuinely own a SQL table."* The frame explicitly rejects this. Owning `agentLifecycleInbox` is not a product boundary — the table is already **co-managed** by `session-requests` (it is the sole writer via the enqueue port AND the sole reaper via the retention ports). The only thing `lifecycle-projection` uniquely holds is the drain-and-project loop — which is the *completion of terminalization*, i.e. squarely part of the `session-requests` product ("admit a request → run it → terminalize → durably propagate the outcome to the origin").

### The bidirectional-cycle tell
The split manufactured a cycle: `session-requests → lifecycle-projection` (inbox writer + reaper ports) **and** `lifecycle-projection → session-requests` (`projectExplicitStart` → `projectTerminalState` on `explicit_session_starts`, which `session-requests` owns). Two sibling agent-orchestration services depending on each other in both directions is the signature of one product cut in half along a table line. Dissolving collapses the cycle to internal method calls.

### Candidate-cluster evaluation
The landscape's `durable-agent-queue` hypothesis (merge `session-requests` + `trigger-resolution` + `lifecycle-projection`) is **correct in direction** and the steer ("strong dissolve-into-session-requests candidate") is right. `lifecycle-projection` is a satellite of `session-requests`, split only because it owns `agentLifecycleInbox`. Absorbing it loses **zero** capability, removes a bidirectional cycle, and turns a public 14-export surface into ~2 internal modules of the merged service. (Whether `trigger-resolution` also folds in is that planner's call; this service's dissolve into `session-requests` stands independently.)

### Merged product
**`session-requests`** = *the durable agent session-request lifecycle*: admit intents/requests (from routine/work/explicit-start/task) → provision/start → terminalize → **durably project the terminal outcome back to the originating domain** → reap. `agentLifecycleInbox` becomes a private table of that service, not a cross-service seam.

**Infra note:** this IS a platform/framework product — its "customers" are other services (`session-requests`, the boot root), never end users. Held to the same bar, it delivers no *distinct* platform value on its own: it is one stage of the durable-handoff pipeline `session-requests` already owns.

---

## 2. The Deliberate Target Public API

The current 14 exports are dominated by **internal machinery leaked into the barrel**. Grep confirms `AGENT_LIFECYCLE_PROJECTORS`, `drainAgentLifecycleInbox`, `AGENT_LIFECYCLE_SOURCE_KINDS`, `AGENT_LIFECYCLE_TERMINAL_STATES`, and `AgentLifecycleFact` have **no production consumer** — only the internal drain and tests touch them. Real external demand is exactly three capabilities. Collapse 14 → **3 interfaces**:

### I1 — `enqueueLifecycleFact(exec, fact)`
Idempotent durable append (`onConflictDoNothing` on `requestId`). The one write into the seam.
- **Subsumes:** `insertLifecycleInboxFactIfAbsent`, `AgentLifecycleInboxFact` (type stays as the fact contract).
- **Shared capability:** the single enqueue point for any terminal fact, parameterized by `fact.sourceKind` — not a method per source.
- **After dissolve:** internal to `session-requests` (called from its terminalize-in-tx path).

### I2 — `reapProjectedLifecycle(exec, { before, batchSize }): Promise<number>`
One parameterized retention op: deletes a batch of already-projected rows older than `before`, returns the count. Caller loops until it returns 0.
- **Subsumes:** `listProjectedLifecycleInboxBefore` **and** `deleteLifecycleInboxByRequestIds` — the two-phase list→delete becomes one call, hiding the `{requestId}` PK leak.
- **Shared capability:** retention is a single filter-parameterized sweep (`before`, `batchSize`), not an exposed list/delete pair the caller must orchestrate.
- **After dissolve:** internal to `session-requests`' reaper.

### I3 — `startLifecycleProjectionDrain(db, deps, options): () => void`
The boot-wired durable drain+project loop. Deps-injected fan-out to the owning domains.
- **Subsumes:** `startAgentLifecycleProjectionDrain`, `drainAgentLifecycleInbox` (internal loop body), `AGENT_LIFECYCLE_PROJECTORS` (private registry), `AGENT_LIFECYCLE_SOURCE_KINDS` / `AGENT_LIFECYCLE_TERMINAL_STATES` (private vocab), `AgentLifecycleFact` (private), `AgentLifecycleProjectionDeps` (kept as the deps contract), and `LifecycleProjectionRoutineWriter` / `LifecycleProjectionWorkWriter` / `LifecycleProjectionExplicitSessionStartWriter` (fold into the deps bundle; the explicit-start writer **vanishes entirely** after dissolve — it becomes an internal call).
- **Shared capability:** one boot handle for the whole projection subsystem; the registry and vocabulary are its private internals.

**Target export count:** **3** interfaces total. After dissolve into `session-requests`, only **I3 + its `AgentLifecycleProjectionDeps` type** remain public (the boot root wires them); I1 and I2 become internal calls. Net public surface contributed to the merged service: **~2** (down from 14).

---

## 3. Inside Lens

- **One barrel, three verbs, private machinery.** The projector registry, the claim/project/ack loop, the source-kind/terminal-state vocabulary, and the drained-fact type are all *implementation* of I3 — none belong in the public surface. Keeping them private means changing the claim strategy, lease timing, or fact shape never breaks a consumer.
- **Exhaustive projector registry stays.** The `Record<SourceKind, Projector>` with explicit `observeOnly` no-ops (AU9 lore) is a good internal contract: adding a source kind cannot silently skip cancellation/failure handling. It just stops being *public*.
- **Deps bundle absorbs the port types.** Three separate exported `Writer` interfaces collapse into fields of `AgentLifecycleProjectionDeps`; after dissolve the explicit-start field disappears (internal method), leaving only the genuinely-downward `routine`/`work` DI ports.

---

## 4. Scaling Argument (sub-linear)

Apply the test — *add dozens more services and hundreds more calls; do we grow methods?*

- **New agent-run source kind** (e.g. a new origin that terminates): add one projector entry to the **private** registry + one downward DI field to the deps bundle. The public API (I3) is **unchanged**. Contrast the method-per-intent path this avoids: no `projectFooTerminal` export per source.
- **New retention policy** (different cutoff / cadence): a parameter on I2 (`before`, `batchSize`), never a new method.
- **New producer wanting to enqueue** a terminal fact: reuse I1 unchanged, parameterized by `fact.sourceKind` — not a bespoke `insertFooFact`.

So N source kinds × M producers → still **3 interfaces**. The sprawl vector (a `project<X>` + a `Writer<X>` type per source) is contained entirely behind I3's private registry. This is the parameterized-by-intent shape (`enqueue(fact)`, `reap(filter)`, `startDrain(deps)`) beating a method-per-source surface.

---

## 5. Key Collapses

1. **7 internal-machinery exports → private.** `AGENT_LIFECYCLE_PROJECTORS`, `drainAgentLifecycleInbox`, `AGENT_LIFECYCLE_SOURCE_KINDS`, `AGENT_LIFECYCLE_TERMINAL_STATES`, `AgentLifecycleFact`, and the two remaining `Writer` port types have **no production consumer** (grep-verified) — they leaked into the barrel and should never have been public.
2. **Reaper list+delete → one `reapProjectedLifecycle(before, batchSize)→count`.** Removes the `{requestId}` PK leak and the caller-orchestrated two-phase sweep.
3. **9 projection-subsystem exports → 1 boot handle (I3) + 1 deps type.** The entire drain/registry/vocab/fact/port surface collapses behind `startLifecycleProjectionDrain`.
4. **Dissolve collapses the bidirectional cycle.** `LifecycleProjectionExplicitSessionStartWriter` (and the `lifecycle-projection ⇄ session-requests` edge) **disappears** — it becomes an internal method call once the projection lives inside `session-requests`.
5. **Net: 14 public exports → ~2** (`startLifecycleProjectionDrain` + `AgentLifecycleProjectionDeps`), with enqueue/reap internalized into the owning `session-requests` service.
