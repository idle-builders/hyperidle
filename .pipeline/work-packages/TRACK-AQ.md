# Track AQ: The Run-Unit (Sandbox / Workspace) Model

**What this track is.** Every agent session runs *somewhere* — a directory, a container, a remote box. Today the codebase calls that place a "sandbox," but the name promises an isolation boundary the code does not actually deliver: the external CLI harnesses (claude / codex / opencode) run as **host child processes** cwd'd into a scratch directory, with `HOME` forwarded — not inside the Docker container that the `SandboxAdapter` spawns. This track exists to **sharpen what the run-unit actually is** before more workpackages build on the ambiguous version of it.

**The forcing question.** Can we gain real isolation from the user's computer **and** keep the user's inherited / OAuth tools working? Inherited OAuth "just works" today *precisely because* the run-unit isn't isolating anything (`HOME`/keychain are forwarded, so `claude` reads `~/.claude/` like normal). The moment the run-unit becomes a real boundary — harness inside a container, or on a remote machine — those inherited secrets vanish, and the ethos forbids the obvious fix (extracting the keychain token; AN1 hard-rule 4). That tension is the thing this track must resolve, or honestly bound.

**Why now.** Two live tracks already lean on an undefined run-unit. AN2 ("connected tools work in every sandbox") split its contract into "local sandbox inherits machine logins ≈ free" vs "remote sandbox must carry auth in" — which is really a statement about *how much of a boundary the sandbox is*, with no single definition to point at. AO2 ("materialize the substrate into the session sandbox") materializes an agent's working files into the same run-unit. Both inherit whatever ambiguity we leave here. Sharpen it once, centrally.

**Concept status — central noun deliberately UNLOCKED.** The run-unit primitive (whether the local/desktop unit is honestly a *workspace* or a *sandbox*, and where it sits on the isolation spectrum) is **not yet locked**. **AQ1 is the concept pass that locks it.** No build / implementation workpackages are registered in this track until AQ1's decision lands — the follow-up work is deliberately deferred and will be planned *from* the locked concept and from how workspaces actually work today.

**Scope rules.** Ground every claim in the real adapters in `packages/server/src/harness/` — never aspirational architecture. Reconcile vocabulary with the harness-vocabulary lock (the AK1 `workspace → sandbox` rename) and with AN1/AN2's Connection model (held vs inherited). ETHOS-aligned: isolation is **opt-in for genuine cases** (shared server, untrusted code), never a preemptive wall held down by default. `npm run verify` is not relevant to a concept-only WP.

**Reference.** `packages/server/src/harness/sandbox-adapter.ts`, `local-sandbox-adapter.ts`, `docker-sandbox-adapter.ts`, `cli-harness-adapter.ts`, `isolated-harness-adapter.ts`, `remote-harness-adapter.ts`, `adapter-pool.ts` (`CLI_TOOL_CONFIGS`, `envAllowlist`); `docs/architecture/connection-model.md` (held vs inherited); `plans/AN2/concept.md` (the local-free vs remote-carry-in split this sharpens); `ETHOS.md` §2 (trust; no preemptive gating).

---

### AQ1 — Define the run-unit: what a sandbox is, and isolation vs inherited secrets

**Workpackage.** As a builder planning AN2 / AO2 (and anyone reasoning about where agents run), I want a single locked definition of the **run-unit** an agent session executes in — what it actually is today, where the external CLI harness runs relative to it, and the spectrum from "scratch directory on the host" to "isolated container" to "remote machine" — so that downstream tracks point at one settled concept instead of each re-deriving it. The concept must answer the forcing question head-on: at each isolation level, what happens to the user's inherited / OAuth-backed tools, and is there an ethos-clean way to gain isolation from the user's computer while still keeping those secrets working — or is that an honest tradeoff we must name rather than a problem we can solve.

**Why this matters.** The word "sandbox" currently lies — it names an isolation boundary the primary (CLI) path walks around. A builder reading it forms a wrong mental model: they assume the agent is contained when it is running on the host with the user's full `HOME`. That wrong model is load-bearing — it silently drives whether inherited OAuth survives a spawn, whether a held connection is "set an env var" or "carry auth into a jail," and the whole trust posture. The cost of not locking this: AN2 and AO2 each bake in a different unstated assumption about the run-unit, and the "inherited tools vanish in a real sandbox" surprise ships as a latent bug nobody decided on. The founder benefits directly: one deliberate decision instead of three accidental ones.

**What exists today.** The run-unit is two decoupled things wearing one name. (1) `SandboxAdapter` is a *filesystem* namespace: `LocalSandboxAdapter.spawn()` is a bare `mkdir`; `DockerSandboxAdapter.spawn()` makes a host dir + a `node:20-slim` container with that dir bind-mounted (`sleep infinity`), whose `exec()` runs via `docker exec`. (2) The `HarnessAdapter` is the thing that runs the agent: for CLI harnesses (`cli-harness-adapter.ts`), the `claude`/`codex`/`opencode` binary is spawned as a **host child process** with `cwd = sandboxPath` and `env = allowlist(["PATH","HOME","LANG"]) + injected` — *not* inside the container. So the external CLI agent does its file edits and bash on the host (with real `HOME`), and the Docker container is used only by HyperIdle's own internal exec tool. `IsolatedHarnessAdapter` (forked worker, allowlisted env) and `RemoteHarnessAdapter` (WebSocket to a remote worker, stubbed) are the only paths that approach a real boundary. AN1's connection model already defines held vs inherited and forbids extracting inherited auth (hard-rule 4); AN2's concept names the local-free vs remote-carry-in split without a single definition to anchor it.

**What's genuinely missing.** A locked concept of the run-unit: its honest identity (workspace vs sandbox), the isolation spectrum enumerated with what each level does to inherited/OAuth secrets and to held connections, and a reasoned answer (or honest bound) to "isolation-from-host while preserving inherited secrets." Nothing today states this in one place; every consumer re-derives a partial, often wrong, version.

**Depends on.** None — it is grounded entirely in existing code and shipped concepts (AN1, AN2). It is upstream *of* the eventual AN2/AO2 implementation decisions, not blocked by them.

**Complexity.** M

**Pre-build gates.**
- **Concept:** Required — **this WP *is* the concept pass.** Run `/concept AQ1` (track-level central noun: the **run-unit** — sandbox vs workspace, the isolation spectrum). It locks the noun and terminates; there is no architecture/build phase in this WP.
- **Design:** Not required — concept/research only; no rendered surface.

**Human design review.** No — concept/research deliverable; introduces no user-facing component.

**Acceptance criteria.**
- A reader of the locked concept can correctly state where the external CLI harness runs relative to the run-unit today (host process vs container) and why that is why inherited OAuth currently works without any per-session step.
- The concept distinguishes the two jobs the word "sandbox" conflates — a *workspace* (working directory) and an *isolation boundary* (what the agent can reach) — and states which the run-unit actually delivers today.
- The concept enumerates the isolation spectrum (from host-process-with-real-`HOME` through containerized-harness to remote-machine) and, for each level, states what happens to the user's inherited / OAuth-backed tools and to held connections.
- The concept answers the forcing question with a clear recommendation: whether (and by what mechanism) the system can gain isolation from the user's computer while keeping inherited tools working — or an explicit, reasoned statement that beyond a named level it is a tradeoff, with what the user does instead (e.g. connect a held token).
- The run-unit vocabulary is locked — one canonical term for the local/desktop unit with a rejection list — consistent with the AK1 sandbox rename and AN1/AN2's held/inherited vocabulary.
- The concept names which existing workpackages depend on this decision (at least AN2 and AO2) and what each needs from it, so the follow-up implementation work can be planned from the locked concept.

**Validation scenarios.**
- Given the locked concept, when a builder new to the codebase reads it, then they can describe — and point at the adapter code for — where `claude`/`codex`/`opencode` runs relative to the run-unit and why inherited OAuth survives a spawn today.
- Given the forcing question, when the concept is read, then for each isolation level it states whether inherited OAuth survives and, where it does not, what the user must do instead — with no level left ambiguous.
- Given AN2's local-free-vs-remote-carry-in split, when this concept lands, then AN2 can reference a single run-unit definition rather than restating the boundary in its own terms.

**Plan calls.** This is a **concept/research workpackage** — run `/concept AQ1` and stop. The deliverable is a locked concept doc (`plans/AQ1/concept.md`, retired into a `docs/architecture/` ground-truth file at `/write-docs`) plus a recommended decision on the isolation-vs-inherited-secrets question. No `/design`, no `/write-tests`, no `/write-code`. The concept must be grounded in the named adapters and must explicitly enumerate the consumers (AN2, AO2) and the follow-up implementation WPs it unblocks — those follow-up WPs are **deferred** and planned separately once the decision lands and against how workspaces actually work today.

**Contracts / constraints.**
- Concept-only — terminates at a locked doc + recommendation; no code, schema, or build.
- Every claim grounded in the real adapters (`Local`/`Docker` `SandboxAdapter`, `Cli`/`Isolated`/`Remote` `HarnessAdapter`, `CLI_TOOL_CONFIGS.envAllowlist`); no aspirational architecture stated as fact.
- ETHOS §2-aligned: isolation is opt-in for genuine cases (shared server, untrusted code), never a preemptive default wall; never design against a hypothetical rogue agent. Inherited auth is never extracted from the keychain (AN1 hard-rule 4 holds).
- Vocabulary reconciles with the harness-vocabulary lock (AK1 `workspace → sandbox`) and AN1/AN2 (Connection, held, inherited) — one coherent run-unit term, not a fourth synonym.
- Does not commit an implementation or reshape AN2's provisioning design; it supplies the definition those decisions consume.

**Out of scope.**
- Building any new isolation mechanism (containerizing the CLI harness, remote-sandbox implementation) — deferred follow-up WPs, planned from the locked concept.
- Changing AN2's or AO2's shipped/locked concepts — this informs their *implementation* decisions; it does not re-open their concept docs.
- Implementing `RemoteHarnessAdapter` (stubbed today).

**Effort.** M (~6h)
