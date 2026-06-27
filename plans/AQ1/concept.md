# AQ1 — Concept: run on the computer (remove the sandbox)

**Level:** Track-level, but **narrowed** by founder decision (2026-06-27): Track AQ splits into **AQ1 — run on the computer (remove the sandbox illusion)** and **AQ2 — add an opt-in sandbox** (`plans/AQ2/concept.md`). This doc locks AQ1 only. The full isolation spectrum, the credential-proxy doorway, and the survey of sandboxing technologies move to AQ2 (`plans/AQ2/research-sandboxing.md` holds the cited research).

**Mode:** Autonomous (`PIPELINE_INTERACTIVE` ≠ `1`) — no recap gate.

**Fixed inputs:** Connection model (AN1, `docs/architecture/connection-model.md`) — held vs inherited; AN2 provisioning (`plans/AN2/concept.md`); AK1 harness-vocab lock (`workspace → sandbox`, guarded by `AK1-harness-vocab-guard`). ETHOS §1 (*Build for the Fast*) and §2 (*Trust; security earned, never preemptive*).

---

## The decision

**AQ1 removes the sandbox illusion and makes "run on the user's computer" the honest, only path — to get things actually running, simply.**

The word "sandbox" promised an isolation boundary the primary path never delivered: `CliHarnessAdapter.startSession()` spawns `claude`/`codex`/`opencode` as a **host child process** (`cwd = sandboxPath`, env allowlist `["PATH","HOME","LANG"]` → real `HOME` forwarded), *not* inside the Docker container the `SandboxAdapter` makes. So the agent already runs on the user's machine with their full environment. AQ1 stops pretending otherwise: the run-unit is **a working directory on the host**, nothing more. No isolation is built, claimed, or defaulted-to. That is the ETHOS posture — *don't build the wall first; the single user trusts their own machine and agents.*

Isolation is not abandoned — it is **deferred to AQ2** as an explicit, opt-in capability, designed from the research rather than from the half-built Docker/isolated machinery that exists today.

**Founder refinement (2026-06-28) — two corrections.**
1. **Sandboxing is a property of the *agent*, not the run-unit.** Whether a given agent runs isolated is attached to the agent and applied wherever it runs. AQ1 removes the run-unit-level isolation machinery; AQ2 reintroduces isolation as a per-agent property. The run-unit itself is just "where" — a working directory on whichever host executes.
2. **Remote ≠ sandbox; remote is distribution/scheduling.** Running a task on another desktop joined to this HyperIdle instance is a *scheduler* concern: that desktop runs the task **host-local**, exactly as the current desktop would. The remote-worker subsystem (`RemoteHarnessAdapter`, WS routes, `/worker-token`, desktop client, `SettingsWorker` UI) is therefore **kept** in AQ1 — it is not isolation. AQ1 deletes only the **isolation** adapters (Docker, Isolated) **and realigns** remote to the scheduler axis: strip the isolation/boundary framing, leave the seam coherent and the shared local path correct. The actual end-to-end remote transport (currently stubbed) is implemented in **AQ3**, not here.

---

## Phase 0 — The noun

| Noun | Class | One-line working definition |
|---|---|---|
| **Sandbox** (the run-unit, AQ1 sense) | **Reshaped** | A **working directory on the host** where one agent session runs, with the user's environment inherited. No isolation boundary. Canonical code noun stays `Sandbox*` (AK1 — no rename, no churn). |
| Isolation / isolation level | **Deferred to AQ2** | The opt-in boundary capability. Not part of AQ1. |
| Connection / held / inherited | Stable (AN1) | Durable per-(user × service) record + auth pointer. |
| Connection provisioning | Stable (AN2) | Spawn-time re-application of held connections into the working directory. |

**Human design review forecast:** **No** — concept/runtime, no rendered surface.

---

## Phase 1 — Essence

1. **Identity.** The run-unit is a **per-session working directory on the host machine**. It is the place the harness does its file edits and bash. It is honestly *not* a jail.
2. **Essential properties.** (a) one working directory per session (`SandboxHandle.path`); (b) the harness runs as a **host process** with the user's environment inherited (PATH/HOME/LANG); (c) disposable — created at spawn, removed after; (d) per-(user × session).
3. **What it is NOT** (see Phase 2).
4. **Composition.** Hosts one session; carries the working directory; is provisioned with the user's active held connections (AN2); inherited tools are present for free because the harness reads the real `HOME`.
5. **Lifecycle.** `spawn (mkdir working dir) → provision held connections → harness starts as a host process → session runs → destroy (rm working dir)`.
6. **Authority.** Server owns creation; user owns the machine and their Connections; no durable run-unit identity.

---

## Phase 2 — Rejection list

1. **The run-unit is NOT an isolation boundary.** At AQ1 it isolates nothing; the agent can reach the user's machine. *Why:* it's the code reality, and ETHOS §2 wants it for the trusted single-user case. Pretending otherwise is the lie AQ1 kills.
2. **AQ1 is NOT "build a better sandbox."** It removes the half-built isolation pretense (Docker container that only wraps HyperIdle's own exec tool; gated-off isolated/remote) from the default path. Real isolation is AQ2's job, designed fresh. *Why:* shipping the ambiguous version blocks AN2/AO2 on a wrong mental model.
3. **"Workspace" is NOT reintroduced as a noun.** The run-unit is a working directory in *role*, but the code term stays `Sandbox*` (AK1 guard forbids `Workspace*`). *Why:* don't re-open a closed, guarded decision.
4. **Inherited auth is NOT extracted.** Inherited tools work because the harness reads the real environment on the host — nothing is copied. *Why:* AN1 hard-rule 4.

---

## Phase 3 — Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Sandbox** | The run-unit: a per-session working directory on the host. No isolation at AQ1. Code noun `Sandbox*`. | jail, container, VM, **workspace** (as a unit name) |
| **Run-unit** | Prose synonym for "the sandbox a session runs in." Not a code identifier. | — |
| **Isolation** | The opt-in boundary capability — **AQ2**, not AQ1. | sandbox mode, trust tier (retired) |

---

## Phase 4 — Contracts

- **Cardinality.** One session ↔ one run-unit ↔ one working directory. One run-unit → 0..N provisioned held connections (AN2).
- **No-isolation contract (AQ1).** The default and only path runs the harness on the host with the user's environment. AQ1 introduces no isolation level; `isolation` is undefined until AQ2.
- **Mutability / identity.** Working-dir contents mutate; the unit is disposable, opaque `sandboxId`, no durable identity.
- **Inherited free, held provisioned.** Inherited tools present via the host environment; held connections carried in by provisioning (AN2) — both work because execution is on the host.

### Hard rules
1. **Run on the host, honestly.** Never label the AQ1 run-unit "isolated"/"contained." It is a working directory on the user's machine.
2. **Never extract inherited auth** (AN1 hard-rule 4).
3. **No preemptive wall.** AQ1 ships zero isolation by default; isolation is AQ2, opt-in (ETHOS §2).

---

## Consumers

- **AN2** — held provisioning and inherited tools both work because execution is on the host; AN2 can assume the AQ1 run-unit (no boundary) as its default target.
- **AO2** — materializes substrate (repo checkout + writeback) into the host working directory; no isolation layer to cross at AQ1.
- **AQ2** — consumes this as the baseline it adds an opt-in boundary *on top of*, using the credential-proxy doorway so tools keep working under isolation.

---

## Rationale

The founder's call (2026-06-27): *start by removing the sandbox.* The word lied — the agent already runs on the host — so the honest, fast move is to make "run on the computer" the explicit, only path and get things working, then add real isolation as a deliberate, research-backed, opt-in capability (AQ2) rather than inheriting today's half-built Docker/isolated ambiguity. This is *Build for the Fast* and *no preemptive wall* applied literally: the wall is not built first; the trusted single-user case is served directly, and isolation is earned when a genuine case (shared server, untrusted code) calls for it.

**Concept LOCKED.**
