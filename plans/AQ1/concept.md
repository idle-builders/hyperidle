# AQ1 — Concept: the run-unit (sandbox), and isolation vs inherited secrets

**Level:** Track-level central noun (Track AQ). This is the concept pass that **locks** the run-unit primitive the track declared UNLOCKED. It terminates at a locked doc + a recommendation; there is no design / architecture / build phase in this WP.

**Mode:** Autonomous (`PIPELINE_INTERACTIVE` ≠ `1`) — no recap gate.

**Fixed inputs (not reshaped here):** the **Connection** primitive (AN1, `docs/architecture/connection-model.md`) — held `token`/`mcp` vs `inherited`; the AN2 provisioning concept (`plans/AN2/concept.md`); the AK1 harness-vocabulary lock (`workspace → sandbox`, enforced by the `AK1-harness-vocab-guard` test). This concept *consumes* those; AN2/AO2 implementation decisions consume *this*.

---

## Required reading (for downstream planners of AN2 / AO2 and anyone reasoning about where agents run)

- `packages/server/src/harness/sandbox-adapter.ts` — the `SandboxAdapter` interface (`spawn`/`exec`/`destroy`) and `SandboxHandle { sandboxId, path }`. This is the **filesystem** job, not the run job.
- `packages/server/src/harness/local-sandbox-adapter.ts` — `spawn()` = bare `mkdir`; `exec()` = host `sh -c`; gated to the `laptop` profile in production.
- `packages/server/src/harness/docker-sandbox-adapter.ts` — `spawn()` = host dir + `node:20-slim` container (`-v hostPath:/workspace`, `sleep infinity`); `exec()` = `docker exec`. Used **only** by HyperIdle's own internal exec tool.
- `packages/server/src/harness/cli-harness-adapter.ts` — **the load-bearing file.** `startSession()` spawns `claude`/`codex`/`opencode` as a **host child process** (`cwd: config.sandboxPath`, `env` = allowlist + injected). `getCapabilities()` per CLI.
- `packages/server/src/harness/adapter-pool.ts` — `CLI_TOOL_CONFIGS` (codex, opencode) with `envAllowlist: ["PATH","HOME","LANG"]`; `createLocalAdapterPool()` shows which adapters are live (claude-code, builtin, codex/opencode-if-on-PATH) vs gated off (isolated, docker).
- `packages/server/src/harness/isolated-harness-adapter.ts` — `fork()` worker, env = caller-supplied `IsolationConfig.envAllowlist` + resolved `ANTHROPIC_API_KEY`. Gated behind `HYPERIDLE_ENABLE_ISOLATED`; **not wired** in the local pool.
- `packages/server/src/harness/remote-harness-adapter.ts` — WebSocket delegation to a remote worker; session executes on a different machine. Stubbed transport, no production worker.
- `docs/architecture/connection-model.md` — held vs inherited; hard-rule 4 (never extract inherited auth). **Fixed input.**
- `plans/AN2/concept.md` — provisioning of held connections; the "local-free vs remote-carry-in" split this concept anchors. **Fixed input.**

---

## Phase 0 — The nouns

The word "sandbox" in this codebase is two decoupled things wearing one name, and the name overclaims. This concept separates them and locks the run-unit.

| Noun | Class | One-line working definition |
|---|---|---|
| **Sandbox** (the run-unit) | **Reshaped** (central) | The place a single agent session executes — a working directory plus an isolation level. Canonical code noun `Sandbox*` (AK1). Today the name promises an isolation boundary the primary path does not deliver; this concept defines it honestly. |
| **Isolation level** | **New** (satellite) | The closed, spawn-fixed dimension of a sandbox stating *what the running harness can reach* — from "the user's whole machine" to "a remote box with nothing inherited." |
| **Workspace job** | **New** (satellite, prose-only role — no code identifier) | The "working directory" role a sandbox always fills: the filesystem the agent reads and writes (`SandboxHandle.path`). One of the two jobs "sandbox" conflated. AK1's vocab guard forbids `Workspace*` identifiers, so this stays a *role word*, never a new type. |
| Connection / held / inherited | Stable (AN1) | Durable per-(user × service) record + auth pointer. Fixed input. |
| Connection provisioning | Stable (AN2) | Spawn-time re-application of held connections into a sandbox. Consumes this concept's isolation level; not reshaped here. |
| Session / spawn | Stable (AM3) | One session runs in one sandbox; "spawn" = the per-session sandbox creation event. |

**Human design review forecast:** **No** — concept/research deliverable, no rendered surface (matches the WP field).

---

## Phase 1 — Essence

### Central noun: Sandbox (the run-unit)

1. **Identity.** A sandbox is a **place an agent session runs**, not an isolation guarantee. Concretely it is a pair: a **working directory** (the `SandboxHandle.path`, created by a `SandboxAdapter`) and an **isolation level** (which `HarnessAdapter` runs the agent, and with what environment). The two are decoupled in code today: `SandboxAdapter` makes the directory; the `HarnessAdapter` runs the agent — and on the primary (CLI) path the harness runs *outside* whatever container the `SandboxAdapter` made.

2. **Essential properties.** Every sandbox: (a) has exactly one **working directory** the agent operates in; (b) has exactly one **isolation level**, fixed at spawn; (c) is **disposable** — created per session, destroyed after, holds no durable identity (`sandboxId` is opaque and ephemeral); (d) is **per-(user × session)** scoped.

3. **Rejection list** (see Phase 2).

4. **Composition.** A sandbox *hosts* one session; *carries* a working directory (filesystem); *is provisioned with* the user's active held connections (AN2); *exposes* HyperIdle's own tools via the inbound MCP bridge. It does **not** carry the user's inherited auth as data — that rides the environment the harness inherits (or doesn't), per isolation level.

5. **Lifecycle.** `spawn (SandboxAdapter creates working dir) → provision (held connections + MCP config written in) → harness starts at the sandbox's isolation level → session runs → destroy (working dir + any container/worker torn down)`. Nothing survives teardown; respawn re-derives from durable state.

6. **Authority.** The **server** (session-provisioning) owns sandbox creation and chooses the isolation level. The **user** owns the durable inputs (their machine login, their Connections). No sandbox has a durable source of truth of its own.

7. **Vocabulary collision.** "Sandbox" already names the code type (AK1). The collision this concept resolves is *semantic*, not lexical: "sandbox" reads as "isolated jail," but the default local sandbox isolates nothing. We keep the name (AK1, no churn; the vocab guard forbids reverting to `Workspace*`) and pin the meaning: **sandbox = run-unit = working directory + isolation level**, where the default level is honestly *not* a boundary — and that is intended, not a bug.

### Satellite: Isolation level

- **Identity.** The dimension of a sandbox that answers "what can the running harness reach?" It is realized by *which* `HarnessAdapter` runs the agent and with what environment allowlist — not by the `SandboxAdapter`.
- **Essential properties.** Fixed at spawn; immutable for the session's life; a **closed set** (below); orthogonal to the working-directory job (you can have the same working dir at any level).
- **Rejection.** It is **not** delivered by the Docker `SandboxAdapter` for the CLI path — that container only contains HyperIdle's *own* exec tool, never the external harness.

### The four isolation levels (closed set)

Grounded in the real adapters. The middle column is the *harness* execution path; the Docker `SandboxAdapter` is a **filesystem** detail that does not, today, contain the CLI harness.

| Level | What runs the harness (code) | Inherited OAuth (`~/.claude`, OS keychain, `gh` login) | Held connections (AN2 `token`/`mcp`) |
|---|---|---|---|
| **L0 · host-inherited** *(default local / desktop)* | `CliHarnessAdapter` / `ClaudeAgentSdkAdapter` as a **host child process**, `cwd = sandboxPath`, `env` allowlist `["PATH","HOME","LANG"]` → **real `HOME` forwarded**. Working dir = `LocalSandboxAdapter` `mkdir`. | ✅ **Just works, no per-session step** — the harness reads the user's real `~/.claude`, keychain, and `gh` login because `HOME` is forwarded. *This is exactly why inherited OAuth works today.* | ✅ Provisioned into the sandbox config files at spawn (AN2). |
| **L1 · docker-fs** *(opt-in, `HYPERIDLE_ENABLE_DOCKER`)* | Same host-process harness as L0; the `DockerSandboxAdapter` container holds only **HyperIdle's own exec tool**, not the agent's harness. | ✅ Still works (harness still on host with `HOME`). ⚠️ The container gives the *harness* **no** isolation — naming it a "sandbox boundary" for the agent is the lie this concept names. | ✅ Same as L0. |
| **L2 · isolated worker** *(opt-in, `HYPERIDLE_ENABLE_ISOLATED`; not wired in the local pool)* | `IsolatedHarnessAdapter` `fork()`s a worker; env = caller-supplied `IsolationConfig.envAllowlist` + resolved `ANTHROPIC_API_KEY`. | ⚠️→❌ Only what the allowlist forwards. **`HOME` is not forwarded unless explicitly allowlisted**, so inherited OAuth **breaks by default**. The API key works because it is *resolved and injected*, not inherited. | ✅ Held still injectable (resolved server-side, written into the worker's config). |
| **L3 · remote machine** *(`RemoteHarnessAdapter`; stubbed, no production worker)* | Session executes on a **different box**; the server forwards `SessionConfig` over WebSocket. | ❌ **Inherited vanishes** — the remote box has none of the user's `~/.claude`/keychain, and AN1 hard-rule 4 forbids extracting the keychain token to ship it there. | ✅ Held connections carried in on every spawn via `SessionConfig` (AN2 "remote-carry-in"). |

---

## Phase 2 — Rejection list (what the run-unit is NOT)

1. **A sandbox is NOT an isolation boundary by default.** At L0/L1 the harness runs on the host with the user's full `HOME`; the agent can reach the user's machine. *Why:* the code proves it (`CliHarnessAdapter` spawns on the host), and ETHOS §2 *wants* it this way for the trusted single-user case — isolation is opt-in for genuine cases (shared server, untrusted code), never a preemptive wall. Reading "sandbox" as "jail" is the wrong mental model the track exists to kill.

2. **The Docker `SandboxAdapter` is NOT the agent's jail.** Its container runs HyperIdle's *own* internal exec tool; the external CLI harness still runs on the host. *Why:* folding the two would require containerizing the harness (an unbuilt L-level, out of scope) — pretending the container isolates the agent today is precisely the lie.

3. **"Workspace" is NOT a competing primitive name for the unit.** It is the **role** the sandbox's working directory fills (one of the two jobs the word conflated). *Why:* AK1 renamed `workspace → sandbox` and a vocab-guard test forbids `Workspace*` identifiers — reintroducing it as a noun would re-open a closed decision and fail the guard.

4. **Inherited auth is NOT data the sandbox carries.** Inherited tools are present *because the harness inherits the environment*, not because HyperIdle copied a token in. *Why:* AN1 hard-rule 4 — copying a keychain/OAuth token into a HyperIdle-controlled artifact is a defect and re-opens the OAuth-app ceremony the track rejects.

5. **Isolation is NOT free of cost to inherited tools.** Gaining a real boundary (L2/L3) is *defined* to drop inherited OAuth — it is a tradeoff, not a bug to be fixed later. *Why:* the forcing question's honest answer (below). Treating "inherited still works at L3" as a missing feature would drive someone to extract the keychain token, violating rule 4.

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases not to use |
|---|---|---|
| **Sandbox** | The run-unit: the place one agent session executes = a working directory + an isolation level. Canonical code noun `Sandbox*` (AK1). | jail, container (as a synonym for the unit), VM, environment, **workspace** (as a unit name) |
| **Run-unit** | Acceptable *prose* synonym for "the sandbox a session runs in." Not a code identifier. | — |
| **Isolation level** | The closed, spawn-fixed dimension stating what the running harness can reach: `host-inherited \| docker-fs \| isolated-worker \| remote`. | sandbox mode, security level, trust tier (retired — Track AN reset) |
| **Workspace (job)** | Prose-only role word for the working-directory job a sandbox always fills (`SandboxHandle.path`). Maps to **no** new code identifier. | `Workspace*` types (forbidden by AK1 guard) |
| **Held connection** | AN1 `token`/`mcp` — carried into the sandbox by provisioning at every level. | (per AN1) |
| **Inherited connection** | AN1 `inherited` — present only where the environment is inherited (L0/L1); never carried as data. | native tool (informal only) |

---

## Phase 4 — Contracts

- **Cardinality.** One session ↔ exactly one sandbox. One sandbox → exactly one working directory **and** exactly one isolation level. One sandbox → 0..N provisioned held connections (all of the spawning user's active held connections, per AN2).
- **Closure.** Isolation levels are a **closed set** `{host-inherited, docker-fs, isolated-worker, remote}`. Adding a level (e.g. a future *containerized-harness* L) requires updating this concept doc first. The per-level inherited/held behaviour table is part of the closed contract.
- **Mutability.** A sandbox's isolation level is **fixed at spawn** and immutable for the session's life. The working directory's *contents* mutate; the unit itself is disposable. No deprovision step distinct from teardown.
- **Identity.** `sandboxId` is opaque and ephemeral; a sandbox has no durable identity and is re-derivable from nothing (its inputs — held connections, substrate — are the durable things).
- **Inherited-survives-only-without-a-boundary.** Inherited OAuth is available **iff** the harness inherits the environment (L0/L1). At L2/L3 it is, by contract, unavailable; the user re-connects the tool as a **held** Connection.
- **Deployment-shape contract (anchors AN2).** Held-connection provisioning is **identical at every level**. Only *inherited availability* differs: free at L0/L1 (harness-native), absent at L2/L3. AN2's "local-free vs remote-carry-in" split **is** the L0/L1-vs-L2/L3 split named here.

### Hard rules (a violation downstream means the concept is broken)

1. **L0/L1 is honestly host-resident.** Documenting, logging, or UI-labelling the default local sandbox as "isolated" / "contained" is a defect. The CLI harness runs on the host with the user's `HOME`.
2. **Never extract inherited auth to cross a boundary.** No code path copies a keychain/OAuth token into a `SessionConfig`, sandbox file, or remote dispatch to make inherited tools "work" at L2/L3. (AN1 hard-rule 4.)
3. **Isolation is opt-in, never a preemptive default wall.** L2/L3 exist for genuine cases (shared server, untrusted code); they are never imposed by default on the trusted single-user desktop. (ETHOS §2.)
4. **Held connections are carried at every level; inherited are not.** Provisioning carries held identically L0→L3; inherited survive only where the environment is inherited.

---

## The forcing question — recommendation

> *Can we gain isolation from the user's computer **and** keep the user's inherited / OAuth tools working?*

**No — not by an ethos-clean mechanism. Name it as a tradeoff, do not "solve" it.**

Inherited OAuth works today **precisely because the run-unit isolates nothing**: the harness runs on the host and `HOME` is forwarded, so `claude`/`gh`/the keychain are read as normal. The instant a real boundary is imposed (L2 isolated worker, L3 remote machine), the inherited environment is gone, and the only way to "restore" it would be to extract the keychain/OAuth token and carry it across — which AN1 hard-rule 4 forbids and which re-opens the OAuth-app ceremony the whole track rejects.

**Recommendation:**

1. **Default desktop stays L0 (host-inherited).** No preemptive wall; the single user trusts their own machine and agents (ETHOS §2). This is the intended posture, not a gap.
2. **Isolation (L2/L3) is opt-in for genuine cases** — a shared/multi-tenant server, or running untrusted code. When chosen, **inherited tools are explicitly out of scope** at that level.
3. **The user's path to "my tools work under isolation" is to convert the inherited tool into a held Connection** (an AN1 `token` or `mcp` Connection). Provisioning (AN2) then carries it into any sandbox, L0→L3, identically. This is the one mechanism that is both ethos-clean (no keychain extraction) and boundary-crossing.
4. **Do not build a "containerized CLI harness" L just to look isolated.** It is the worst of both: the complexity of a boundary without preserving inherited tools, while L0 already serves the trust-the-user case and held connections already serve the carry-into-isolation case.

So: the run-unit spans a real spectrum, but "isolation from the host" and "inherited OAuth survives" are mutually exclusive past L1. We name that honestly and give the user a clean alternative (held connections) rather than a leaky hack.

---

## Consumers — what each dependent WP needs from this concept

- **AN2 (Connect once; tools work in every sandbox).** Needs the **isolation level** closed set and the deployment-shape contract: held provisioning is identical at every level; inherited is free at L0/L1 and absent at L2/L3. AN2's "local-free vs remote-carry-in" can now reference *this* single definition (the L0/L1-vs-L2/L3 split) instead of restating the boundary in its own terms.
- **AO2 (Materialize the substrate into the session sandbox).** Needs the **workspace-job** definition: substrate (repo checkout + writeback capture) targets the *working-directory* dimension, independent of isolation level. AO2 must also account for L3: at remote, the working directory lives on the remote box, so writeback capture crosses the WS transport — a constraint that follows directly from the isolation level, not a new AO2 invention.
- **Follow-up isolation WPs (deferred).** Any future "containerize the harness" / "implement RemoteHarnessAdapter" work is planned **from** this locked concept and from how sandboxes actually work today — explicitly out of scope here.

---

## Rationale

The track's framing is exact: *the word "sandbox" currently lies.* AK1 unified the vocabulary (`workspace → sandbox`) but did not decide the isolation semantics, leaving a name that promises a boundary the primary CLI path walks straight around. A builder who reads "sandbox" assumes containment; the code spawns `claude` on the host with the user's full `HOME`. That wrong model is load-bearing — it silently drives whether inherited OAuth survives a spawn and whether a held connection is "set an env var" or "carry auth into a jail." Left unlocked, AN2 and AO2 would each bake a different unstated assumption, and the "inherited tools vanish in a real sandbox" surprise would ship as a latent bug nobody decided on.

The resolution is not to rename (that would churn AK1 and fail its vocab guard) but to **pin the meaning**: a sandbox is a run-unit = working directory + isolation level, the default level is honestly *not* a boundary, and that is the intended ETHOS posture for a trusted single user. The forcing question then has a clean, honest answer — isolation-from-host and inherited-OAuth-survival are mutually exclusive past L1, so we name the tradeoff and route the user to held connections rather than to a keychain-extraction hack that AN1 hard-rule 4 already forbids.

---

## Phase 6 — Self-critique (resolved)

- *Is the rejection list distinct, not flavours of one?* Yes — (1) default-not-a-boundary is a *semantics* concern; (2) the-Docker-container-isn't-the-jail is a *topology* concern; (3) workspace-isn't-a-unit-name is a *vocabulary* concern; (4) inherited-isn't-carried-data and (5) isolation-costs-inherited are the two *directions* of the durable-vs-environment split. Orthogonal.
- *Canonical-term collision?* Checked by grep: `Workspace*` survives only in the AK1 vocab-guard test (which *forbids* it) and in `@lore` history; "isolation level" / "run-unit" have no existing code identifier, so both are free to lock as new (one prose, one closed-set dimension). No live collision; "sandbox" is retained to honour AK1.
- *Are the levels grounded in real adapters, not aspiration?* Yes — each level cites the exact file and mechanism (`cli-harness-adapter` host spawn + `["PATH","HOME","LANG"]`; `docker-sandbox-adapter` container scope; `isolated-harness-adapter` fork+allowlist; `remote-harness-adapter` WS). L2/L3 are explicitly marked gated-off / stubbed so no unbuilt path is stated as fact.
- *Does the forcing-question answer take a clear position?* Yes — an explicit "No, it's a tradeoff," per-level inherited verdict, and a concrete user alternative (convert to held). No level left ambiguous (AC + validation scenario 2).
- *Contracts complete?* Cardinality, closure (closed level set + the behaviour table), mutability (level fixed at spawn), identity, inherited-survives-only-without-boundary, deployment-shape, and 4 hard rules.
- *Right files touched?* This concept lives in `plans/AQ1/`. Per the WP it is **retired into `docs/architecture/` ground truth at `/write-docs`**, not pre-edited now (mirrors AN2's choice — avoids documenting per-level behaviour before the dependent implementation lands). Ground-truth update deliberately deferred.

**Concept LOCKED.**
