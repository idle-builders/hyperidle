# Track AQ: The Run-Unit — Scheduling (where) × Sandbox (how isolated)

**Two orthogonal axes (founder, 2026-06-28).** Where an agent runs (the **scheduler/distribution** axis — local desktop or a joined remote desktop, which runs the task **host-local**) is independent of how isolated it runs (the **sandbox** axis — a per-**agent** property). The word "sandbox" used to conflate them. This track separates them: AQ1 strips sandbox to nothing (run host-local) and realigns the remote system to the scheduler axis; AQ2 adds the per-agent sandbox; AQ3 makes remote scheduling work end-to-end.

**What this track is.** Every agent session runs *somewhere* — a directory, a container, a remote box. Today the codebase calls that place a "sandbox," but the name promises an isolation boundary the code does not actually deliver: the external CLI harnesses (claude / codex / opencode) run as **host child processes** cwd'd into a scratch directory, with `HOME` forwarded — not inside the Docker container that the `SandboxAdapter` spawns. This track exists to **sharpen what the run-unit actually is** before more workpackages build on the ambiguous version of it.

**The forcing question.** Can we gain real isolation from the user's computer **and** keep the user's inherited / OAuth tools working? Inherited OAuth "just works" today *precisely because* the run-unit isn't isolating anything (`HOME`/keychain are forwarded, so `claude` reads `~/.claude/` like normal). The moment the run-unit becomes a real boundary — harness inside a container, or on a remote machine — those inherited secrets vanish, and the ethos forbids the obvious fix (extracting the keychain token; AN1 hard-rule 4). That tension is the thing this track must resolve, or honestly bound.

**Why now.** Two live tracks already lean on an undefined run-unit. AN2 ("connected tools work in every sandbox") split its contract into "local sandbox inherits machine logins ≈ free" vs "remote sandbox must carry auth in" — which is really a statement about *how much of a boundary the sandbox is*, with no single definition to point at. AO2 ("materialize the substrate into the session sandbox") materializes an agent's working files into the same run-unit. Both inherit whatever ambiguity we leave here. Sharpen it once, centrally.

**Concept status — split decided (2026-06-27).** Research into the sandboxing landscape (OS-native harness sandboxes, Apple `container` microVMs, Firecracker, the credential-proxy doorway — see `plans/AQ2/research-sandboxing.md`) reshaped the original single-WP plan. The founder split the track:

- **AQ1 — run on the computer (remove the sandbox).** The word "sandbox" lied: the agent already runs as a host process with the user's environment. AQ1 makes that the honest, only path — a working directory on the host, no isolation built or claimed — to get things running simply. **Concept LOCKED** (`plans/AQ1/requirements.md`).
- **AQ2 — add an opt-in sandbox (per-agent).** Real isolation as a property of the agent, designed from the research: lean on the harness's own OS sandbox / Apple `container` locally, Firecracker remotely, and the **credential doorway** (egress injection proxy / outside tool-server) so tools keep working under isolation without the secret entering the box. This **dissolves** the "isolation vs inherited OAuth" tradeoff. **Concept SEED** (`plans/AQ2/requirements.md`); run `/pipeline:refine AQ2` to lock before any build.
- **AQ3 — make remote scheduling work end-to-end.** The distribution axis: run a task on a desktop joined to this instance, which executes it **host-local** (the implemented transport behind today's stub). AQ1 realigns the remote subsystem to this model and leaves the seam coherent; AQ3 makes it actually run across machines, live-proven. Not started.

The original "isolation and inherited OAuth are mutually exclusive past L1" framing is **superseded** — it only holds if the credential must live with the agent; the doorway keeps it out.

**Scope rules.** Ground every claim in the real adapters in `packages/server/src/harness/` — never aspirational architecture. Reconcile vocabulary with the harness-vocabulary lock (the AK1 `workspace → sandbox` rename) and with AN1/AN2's Connection model (held vs inherited). ETHOS-aligned: isolation is **opt-in for genuine cases** (shared server, untrusted code), never a preemptive wall held down by default. `npm run verify` is not relevant to a concept-only WP.

**Reference.** `packages/server/src/harness/sandbox-adapter.ts`, `local-sandbox-adapter.ts`, `docker-sandbox-adapter.ts`, `cli-harness-adapter.ts`, `isolated-harness-adapter.ts`, `remote-harness-adapter.ts`, `adapter-pool.ts` (`CLI_TOOL_CONFIGS`, `envAllowlist`); `docs/architecture/connection-model.md` (held vs inherited); `plans/AN2/requirements.md` (the local-free vs remote-carry-in split this sharpens); `ETHOS.md` §2 (trust; no preemptive gating).

---

### AQ1 — Run on the computer (remove the sandbox)

**Concept:** LOCKED — `plans/AQ1/concept.md`. The run-unit is a **per-session working directory on the host**; the agent runs as a host process with the user's environment. No isolation is built, claimed, or defaulted-to.

**Workpackage.** As a user (and the builders of AN2 / AO2), I want agent sessions to run honestly **on my computer** — in a plain working directory, with my environment and logins inherited — so that things actually run, simply, without a half-built "sandbox" that pretends to isolate while the CLI harness already runs on the host. AQ1 removes the isolation illusion from the default path and makes host execution the explicit, only path.

**Why this matters.** The word "sandbox" lies today: `CliHarnessAdapter` spawns `claude`/`codex`/`opencode` as a **host child process** (`cwd = sandboxPath`, env `["PATH","HOME","LANG"]`) — not inside the `DockerSandboxAdapter` container, which only wraps HyperIdle's own internal exec tool. Builders form a wrong mental model (agent contained) that drives AN2/AO2 assumptions wrongly. AQ1 makes the reality the design: run on the host, inherited tools work for free, held connections (AN2) are provisioned in. ETHOS: don't build the wall first.

**Scope of "remove" — HARD DELETE (isolation only).** Delete the **isolation** machinery outright; AQ2 will engineer isolation cleanly from scratch (and as a **per-agent property**, not a run-unit one), not from this code. Remove `DockerSandboxAdapter` and `IsolatedHarnessAdapter` (+ `isolated-session-worker`/`isolated-session-protocol`), their gates (`HYPERIDLE_ENABLE_ISOLATED`; `HYPERIDLE_ENABLE_DOCKER` is comment-only/never read — scrub it), registration, and tests. Reduce the run path to host execution in a working directory (`LocalSandboxAdapter` is the only general `SandboxAdapter`; `DisabledSandboxAdapter` is a boot guard, not isolation — keep it; the CLI/SDK/builtin harnesses run as host processes — already the reality). Keep the code noun `Sandbox*` (AK1 guard forbids reverting to `Workspace*`); the run-unit is honestly a working directory. Do **not** build any new isolation — that is AQ2.

**KEEP and REALIGN the remote-worker subsystem (founder, 2026-06-28).** `RemoteHarnessAdapter` + the WS worker routes + `/worker-token` + desktop worker client + web `SettingsWorker` UI are **not** isolation — they are **distribution/scheduling**: run a task on another desktop joined to this HyperIdle instance, which runs it **host-local** there exactly as it would on the current desktop. Remote ≠ sandbox. AQ1 **does not delete** them — it **realigns** them to the scheduler axis as the natural place to fix the misalignment the sandbox dissection exposes:
- Strip any isolation/sandbox-boundary framing or coupling from the remote path (`RemoteHarnessAdapter.getCapabilities`, comments, types). A remote run is "execute host-local on the joined desktop," not "run in a jail."
- Make the seam **coherent and correct** in the no-sandbox world: it compiles, the local path it shares works correctly, and the subsystem's tests pass at the seam.
- **Do NOT** implement the stubbed end-to-end transport here — that is **AQ3**. AQ1 leaves remote correct-by-construction and clearly bounded; AQ3 makes it actually run across machines, live-proven.

`CredentialResolver`/`DbCredentialResolver` is the production resolver wired everywhere — **keep it**; only the isolated adapter's *use* of it is removed.

**Depends on.** None (concept locked). Unblocks AN2 (held provisioning + inherited tools on the host) and AO2 (substrate into the host working dir).

**Complexity.** M

**Pre-build gates.**
- **Concept:** Done (LOCKED, this pass).
- **Design:** Not required — runtime/no rendered surface.

**Human design review.** No.

**Acceptance criteria.**
- An agent session runs in a per-session working directory on the host with the user's environment inherited; a live run proves a CLI harness (claude/codex/opencode) executes and inherited tools work without any per-session auth step.
- The default and only **local** run path is host execution; no code path claims or defaults to isolation. `DockerSandboxAdapter` and `IsolatedHarnessAdapter` (+ their workers/gates/registration/tests) are **deleted** (not gated, not stubbed); `knip`/`npm run lint`/`npm run check` confirm no dead references remain.
- The remote-worker subsystem is **kept and realigned** to the scheduler axis: no isolation/sandbox-boundary framing or coupling remains on the remote path; the subsystem compiles and its tests pass at the seam. The end-to-end transport is **not** implemented here (that is AQ3) — but what remains is coherent, not broken.
- A live run proves the local host path works correctly end-to-end (a real CLI harness executes in a host working directory and an inherited tool works with no per-session login).
- Held connections (AN2) provision into the host working directory; inherited connections are present via the host environment (AN1 hard-rule 4 holds — nothing extracted).
- `npm run verify` green.

**Validation scenarios.**
- Given a clean spawn, when a session starts, then a real CLI harness runs in the host working directory and an inherited tool (e.g. `gh`) works with no per-session login.
- Given the codebase post-AQ1, when a builder reads the run path, then it honestly describes host execution with no isolation claim.

**Plan calls.** `/architecture AQ1` (small — it removes/retires machinery and confirms the host path) → `/write-tests` → `/write-code` → `/review` → `/ship`. Live-proof required (a real session running on the host).

**Out of scope.**
- Any isolation mechanism (OS-native sandbox, Apple `container`, Firecracker, remote) — **AQ2**.
- The credential doorway (proxy / outside tool-server) — **AQ2**.
- Reshaping AN1/AN2/AO2 concepts.

**Effort.** M

---

### AQ2 — Add an opt-in sandbox

**Refinement:** SEED — `plans/AQ2/requirements.md` + research `plans/AQ2/research-sandboxing.md`. Run `/pipeline:refine AQ2` to lock before architecture.

**Workpackage.** As a user with a genuine isolation need (shared server, running untrusted code), I want to **opt into a real sandbox** for an agent session — layered on the AQ1 host run-unit — while my connected tools keep working, so that I gain isolation from my computer without losing my tools and without the secret ever entering the box.

**Why this matters.** AQ1 ships the honest no-boundary default. The genuine-isolation case still needs a real answer, and the research shows there *is* one that dissolves the old "isolation vs inherited OAuth" tradeoff: keep the credential outside the box and mediate the agent's authenticated effect via a **credential doorway** (egress injection proxy / outside-the-sandbox tool-server). Designed from the research, not from today's half-built machinery.

**Direction (from `plans/AQ2/research-sandboxing.md`).**
- Lean on the **harness's own OS-native sandbox** (Seatbelt / Landlock+bubblewrap) where it already isolates files while keeping logins via allowlist; offer **Apple `container`** (per-container microVM) on Apple-Silicon + macOS 26 (Lima/Colima fallback); **Firecracker** for remote/multi-tenant (build-or-buy: E2B/Fly). A plain container is not a boundary for untrusted code.
- **Credential doorway** — the load-bearing new noun: the agent only ever sees a placeholder; the secret stays on the host/outside. Reject the fragile "let the command escape to the host" model as the boundary. Honors AN1 hard-rule 4 (no keychain extraction; used in place).

**Depends on.** AQ1 (the host run-unit it layers on); consumes AN1/AN2 (Connection, held/inherited).

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Required — run `/pipeline:refine AQ2` (nouns to lock: **isolation level** as an opt-in dimension; **credential doorway**).
- **Design:** Likely — any user-facing opt-in surface (choosing isolation for a session/team).

**Human concept review.** Forecast: maybe (new opt-in surface) — `/pipeline:design` `DESIGN-CLASS` decides.

**Acceptance criteria (provisional — refine at `/pipeline:refine AQ2`).**
- A user can opt a session into a real isolation level; the agent is isolated from the rest of the host yet a connected tool still works via the credential doorway, proven by a live run.
- The secret never enters the sandbox (proven: placeholder visible inside, real value only outside); no keychain extraction (AN1 hard-rule 4).
- Isolation is opt-in only — never imposed by default (ETHOS §2).
- `npm run verify` green; live-proof of one isolated session with a working connected tool.

**Out of scope.**
- Multi-tenant remote operation as a product (Firecracker hosting) beyond proving the model — separate track if pursued.
- Reshaping AN1/AN2/AO2 concepts.

**Effort.** L

---

### AQ3 — Make remote scheduling work end-to-end

**Workpackage.** As a user with more than one machine joined to my HyperIdle instance, I want to run a task on another desktop and have it **execute host-local there** — exactly as it would on the current desktop — so that "where it runs" is a real scheduling choice, not a stub. This implements the transport behind today's stubbed `RemoteHarnessAdapter` and proves a task dispatched to a joined desktop runs and returns results across machines.

**Why this matters.** AQ1 realigns the remote subsystem to the scheduler axis (remote = run host-local elsewhere, decoupled from sandbox) but deliberately leaves the actual cross-machine transport unimplemented. AQ3 closes that gap: the distribution axis becomes real. Without it, the remote UI/routes exist but no task can actually run remotely.

**What exists today (after AQ1).** `RemoteHarnessAdapter` + WS worker routes + `/worker-token` + desktop worker client + web `SettingsWorker` UI, realigned to the scheduler model and coherent at the seam, but the execution transport is a stub — no real end-to-end remote run.

**Depends on.** AQ1 (the realigned, coherent remote seam + host-local run path). Orthogonal to AQ2 (per-agent sandbox) — a remotely-scheduled task is still subject to the agent's own sandbox property once AQ2 lands.

**Complexity.** L

**Pre-build gates.** Concept: likely a short `/pipeline:refine AQ3` (the scheduler nouns: joined desktop / worker, dispatch, host-local run). Design: the `SettingsWorker` surface may need work — `/pipeline:design` decides.

**Acceptance criteria (provisional).**
- A task dispatched to a joined desktop runs **host-local** on that desktop and returns results to the originating instance — **live-proven across two machines** (per the e2e-is-local-only rule, a local two-process/two-host proof).
- Remote carries no sandbox/isolation semantics — isolation, if any, is the agent's AQ2 property applied on whichever desktop executes.
- `npm run verify` green.

**Out of scope.** Per-agent sandbox (AQ2). Multi-tenant/hosted remote as a product.

**Effort.** L
