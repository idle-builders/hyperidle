# AN2 — Concept: Connect once; tools work in every sandbox

**Level:** Per-workpackage. **Track concept inherited as fixed input:** the **Connection** primitive locked by AN1 (`docs/architecture/connection-model.md`). This doc does not reshape Connection — it locks the noun *downstream* of it: what re-applies a durable Connection onto a disposable sandbox at spawn.

**Mode:** Autonomous (`PIPELINE_INTERACTIVE` ≠ `1`) — no recap gate.

> **AQ1 reconciliation (re-locked 2026-06-28).** AQ1 shipped (#371, `docs/architecture/run-unit-model.md`) and **removed isolation entirely**: the run-unit is a **per-session working directory on the host**; the harness runs as a **host child process** with the real `$HOME`. `Sandbox*` is now the *working-directory* code noun, not an isolation boundary; `DockerSandboxAdapter`/`IsolatedHarnessAdapter` were deleted (only `LocalSandboxAdapter` + `DisabledSandboxAdapter` remain). This **does not reshape AN2** — AQ1's own lifecycle names AN2 (`spawn → mkdir → AN2 provisioning applies held connections into the dir → harness starts`). It **simplifies** AN2: the **central noun and both satellites stand**; the only change is the Phase 4 **deployment-shape contract**, whose "local-free vs remote-carry-in" split is **deleted** — there is no isolation axis to provision across. The provisioning target is *always* a host working dir with the real `$HOME`; inherited tools always survive a spawn; only **held** connections are provisioned. Provisioning *into an isolated run-unit* is an **AQ2** concern (opt-in isolation + credential doorway), explicitly out of AN2.

---

## Required reading (downstream `/architecture`, `/pipeline`)

- `docs/architecture/connection-model.md` — the **Connection** primitive (held `token`/`mcp` vs `inherited`), `ServiceConnectionResolver` (the sole plaintext seam), hard rules. **Fixed input.**
- `docs/architecture/run-unit-model.md` (AQ1, #371) — the run-unit AN2 provisions into: a **per-session host working directory**, no isolation, harness as host child process with real `$HOME`. Its lifecycle explicitly hosts the AN2 provisioning step. **Fixed input** — supersedes any local-vs-remote isolation assumption in this doc.
- `ETHOS.md` §2 (*Trust Agents and Humans; Earn Security from Learnings*) — "a tool that can't authenticate is useless"; no preemptive gate; the credential may live in the sandbox the agent controls.
- `packages/server/src/services/service-connection-resolver.ts` — AN1 shipped this; it is the AN2 injection seam (the only path returning a decrypted token).
- `packages/server/src/mcp/mcp-bridge.ts` + `mcp-bridge-registry.ts` — the **inbound** bridge (HyperIdle's own tools → harness). AN2 is the *opposite direction*; do not extend the inbound bridge to carry external tools.
- `packages/server/src/services/session-provisioning.ts` — **Phase 8b** (≈ lines 745–793) is the spawn seam: per-session MCP config files (`.mcp.json`, codex `config.toml`, `opencode.json`) are written here before `harness.startSession` (Phase 9). Connection provisioning hangs off this seam.
- `packages/server/src/harness/cli-mcp-config.ts` — per-harness MCP-config dialect writer (`codex-toml`, `opencode-json`). The carrier mechanism the outbound client config rides.
- `docs/architecture/what-this-architecture-does-not-include.md` §8 + `docs/architecture/system-boundary.md` — "Track AN adds an *outbound* MCP client … riding the MCP standard, not reimplementing each service."
- `packages/server/src/routes/connections.ts` (`:48`, `:355`) — AN1 left two explicit AN2 seams: DNS-rebinding SSRF hardening + the live MCP reachability probe in `/validate`.
- `docs/agent-layer/harness-capability-descriptor.md` (AM2) — what a harness is configured with; relevant for the local-vs-remote deployment split.

---

## Phase 0 — The nouns

AN2 introduces the bridge from "agent" to "external effect." Three new nouns; the rest are stable inputs.

| Noun | Class | One-line working definition |
|---|---|---|
| **Connection provisioning** | **New** (central) | The spawn-time act that re-applies a user's active **held** Connections into a freshly-spawned sandbox so the connected tools are present and authenticated before the agent runs. |
| **Provisioned connection** | **New** (satellite) | What a single held Connection *becomes* inside a sandbox: an ephemeral materialized form (an injected secret, or an outbound MCP-server pointer) that lives and dies with the sandbox. |
| **Outbound MCP client** | **New** (satellite) | HyperIdle acting as an MCP *client* reaching out to a connected service's own MCP server — the inverse of the existing inbound bridge. Does not exist today; AN2 introduces it. |
| Connection | Stable (AN1) | Per-(user × service) durable record + auth pointer. Fixed input — not reshaped here. |
| Sandbox (= run-unit / working dir) | Stable (AQ1) | The disposable per-session **working directory on the host** the agent runs in — `mkdir` at spawn, `rm -rf` at destroy. **Not** an isolation boundary (AQ1). Code noun: `SandboxAdapter` → `LocalSandboxAdapter` (host run path) \| `DisabledSandboxAdapter` (server-profile boot guard). "Run-unit" / "working directory" is the canonical term (`docs/architecture/run-unit-model.md`); "sandbox" survives only as the code noun. |
| Session / spawn | Stable (AM3) | A session runs in one run-unit; "spawn" = the per-session working-directory creation event. The harness starts as a **host child process** (cwd = working dir, real `$HOME`). |
| `ServiceConnectionResolver` | Stable (AN1) | The sole server-side path that decrypts a held `token`. AN2 consumes it; does not fork it. |

**Human design review forecast:** unchanged — **No.** Backend/runtime mechanism, no rendered surface (matches the WP field). No new primitive surfaces a UI component.

---

## Phase 1 — Essence (central noun: Connection provisioning)

1. **Identity.** Connection provisioning is an **act** (a step in session provisioning), not a stored entity. It is a pure projection: given the user's active held Connections + a fresh sandbox, it produces the in-sandbox materialized forms. It holds no durable state of its own.

2. **Essential properties.** Every instance of provisioning: (a) runs **at spawn**, before the harness starts (Phase 8b → Phase 9); (b) is **idempotent across respawns** — same active connections + fresh sandbox ⇒ same provisioned toolset; (c) reads the user's **active held** connections at spawn time (so disconnect is reflected on the *next* spawn, with no reach into a running sandbox); (d) is **per-user scoped** (only the spawning session's owner's connections); (e) installs tools **without interposing any gate** on their use.

3. **Rejection list** (see Phase 2).

4. **Composition.** Provisioning *consumes* held Connections (via `ServiceConnectionResolver` for `token`, via stored server URL for `mcp`); *produces* **provisioned connections** inside the sandbox; *uses* the **outbound MCP client** path for `mcp` connections; *attaches to* the Phase 8b spawn seam in `session-provisioning.ts`, parallel to (never inside) the inbound MCP bridge.

5. **Lifecycle.** `spawn → read active held connections → resolve each (token: decrypt; mcp: server URL) → write materialized form into sandbox config → harness starts with tools present → sandbox destroyed ⇒ provisioned connections vanish with it`. Respawn re-runs from scratch. There is no "deprovision" step distinct from sandbox teardown.

6. **Authority.** The **user** owns the Connection (AN1). The **server** (session-provisioning, Phase 8b) owns the provisioning act. `ServiceConnectionResolver` is the sole authority yielding a plaintext token. Source of truth = the durable `service_connections` rows; provisioning holds no independent state and is always re-derivable from them.

7. **Vocabulary collision.** "Provisioning" already names the whole session-provisioning flow — *Connection provisioning* is the **sub-step** within it that handles connections, distinct from inbound-bridge provisioning and prompt assembly. "Materialization" is **deliberately avoided** as a canonical term — it is a retired Fabric word (old `packages/fabric` workspace-materialization, per the locked harness vocabulary). We say *provisioning* (the act) and *provisioned connection* (the result).

### Satellite: Outbound MCP client
- **Identity.** A capability/path: HyperIdle (or the harness it configures) as an MCP **client** to an external server. **Inverse** of `mcp-bridge.ts` (HyperIdle as MCP server to the harness).
- **Essential properties.** Rides the MCP standard; service-agnostic (a new service is a new Connection row, never new per-service code); SSRF-guarded on every outbound reach (the AN1-deferred DNS-rebinding hardening lands here).
- **Rejection.** It is **not** HyperIdle reimplementing a service's REST API — the server is the *service's own* MCP server.

### Satellite: Provisioned connection
- **Identity.** The ephemeral in-sandbox form of one held Connection. Two shapes, a **closed set keyed by held auth source** (mirrors AN1's `HELD_AUTH_SOURCES`):
  - `token` → an **injected secret** placed where the agent's tools read it (env/config carrier; architecture picks the exact carrier per harness).
  - `mcp` → an **outbound MCP-server pointer** written into the harness's MCP config (the outbound-client path).
- **Essential property.** Ephemeral — created at spawn, destroyed with the sandbox; **never persisted** beyond the sandbox lifecycle, never written to a durable store of its own.

---

## Phase 2 — Rejection list (what these nouns are NOT)

1. **Provisioning is NOT a gate or broker.** It *installs* tools; it never interposes a review/approval/reversibility classifier on their use. The agent calls the tool directly. (ETHOS §2 — "a tool that can't authenticate is useless"; "irreversible" is not a reason to gate.) Where review is genuinely wanted it rides **AL7**, unchanged — never a new policy engine in this WP. *Why:* the whole Track AN reset killed the broker-gate; re-introducing one here would re-commit the rejected design.

2. **Provisioning is NOT a persistent grant or per-session re-auth.** It creates no new authority and asks the user for nothing at spawn. It re-applies the *already-authenticated* durable Connection. *Why:* "connect once" is the entire value proposition — re-auth per session breaks it.

3. **Provisioning is NOT the inbound MCP bridge.** The inbound bridge (`mcp-bridge.ts`) serves **HyperIdle's own** internal tools *to* the harness. Provisioning makes **external services** reachable *from* the sandbox — the opposite direction. *Why:* folding external tools into the inbound bridge would make HyperIdle a man-in-the-middle reimplementing each service; the outbound client rides each service's own MCP server instead.

4. **A provisioned connection is NOT durable sandbox state.** Nothing is copied into a persistent store; the materialized secret lives only in the disposable sandbox and is gone on destroy. *Why:* the Connection is the durable thing, the sandbox is disposable — the whole "durable → disposable, re-apply on spawn" model collapses if provisioning persists anything.

5. **Provisioning NEVER extracts an inherited connection's auth.** It carries **held** connections (`token`, `mcp`) only. `inherited` connections are present because the **harness reads the real `$HOME`** — the agent runs as a host child process (AQ1), so `~/.config/gh`, `~/.ssh`, keychain logins are already there with no per-session step. This holds for a *joined remote desktop* too: AQ1 "remote" is **distribution, not isolation** — the task runs host-local on that desktop with *its* `$HOME`, so its inherited tools work the same way. HyperIdle holds no auth material for inherited connections and never reaches into the keychain to copy them anywhere. *Why:* AN1 hard-rule 4 — copying an inherited token into a HyperIdle-controlled artifact is a defect; it also re-opens the OAuth-app ceremony the track rejects.

6. **The outbound MCP client is NOT a per-service integration.** No service-specific client code. *Why:* AC requires a second service reachable "by configuration, not new per-service code" — genericity is a hard contract, not a nicety.

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases not to use |
|---|---|---|
| **Connection provisioning** | The spawn-time sub-step of session provisioning that re-applies a user's active held Connections into a fresh sandbox. | materialization, injection (as the whole act), broker, sync, grant, mount, hydration |
| **Provisioned connection** | The ephemeral in-sandbox form of one held Connection (injected secret \| outbound MCP pointer). | materialized workspace, mounted credential, session credential |
| **Outbound MCP client** | HyperIdle/the harness reaching out to a connected service's own MCP server (inverse of the inbound bridge). | outbound bridge, proxy, connector, gateway |
| **Held connection** | AN1 auth source `token` or `mcp` — the only kinds provisioning carries. | (per AN1) |
| **Inherited connection** | AN1 auth source `inherited` — present via the harness; provisioning never carries its auth. | native tool (informal only) |

Authoritative direction words: **inbound** = HyperIdle-tools-to-harness (existing bridge); **outbound** = sandbox-to-external-service (new, AN2). Never reuse "bridge" for the outbound path.

---

## Phase 4 — Contracts

- **Cardinality.** Per spawn, provisioning materializes **0..N** held connections — *all* of the spawning user's active held connections. Each held Connection → **at most one** provisioned connection per sandbox. Scope is per-(user × sandbox).
- **Closure.** The set of materialization shapes is **closed**, keyed by `HELD_AUTH_SOURCES`: `token → injected secret`, `mcp → outbound MCP pointer`. Adding a third held auth source requires an AN1 concept-doc update first (it does not — `inherited` is not held). `inherited` has **no** materialization shape (it is never carried).
- **Mutability.** A provisioned connection is **immutable and ephemeral** — written once at spawn, never mutated in a running sandbox, destroyed with the sandbox. The durable Connection is the single source of truth; provisioning is a pure read-projection of it.
- **Identity.** Provisioning has **no durable identity** — it is a re-derivable function of `(user's active held connections, sandbox)`. Idempotent across respawns by construction.
- **Spawn-time read.** Active connections are read **at spawn**; connect/disconnect takes effect on the **next** spawn. Provisioning never reaches into a live sandbox to add/revoke a tool.
- **Run-unit contract (AQ1, supersedes the old deployment-shape split).** There is **one** provisioning target: a **host working directory with the real `$HOME`** (`LocalSandboxAdapter`). No isolation axis exists for AN2 to provision across — the old "local-free vs remote-carry-in" split is **deleted**. Consequences: (a) **inherited** connections need **zero** provisioning work — they are already present via `$HOME` on every spawn, local or on a joined remote desktop (AQ1 "remote" = distribution, runs host-local with its own `$HOME`); (b) **held** connections are the *entire* AN2 job — provisioned into the working dir on every spawn (`token` → injected secret, `mcp` → outbound pointer); (c) provisioning **into an isolated run-unit is out of scope** — opt-in isolation and its credential doorway are **AQ2**. When AQ2 lands, the held-connection projection here is the baseline it carries across an isolation boundary; AN2 builds nothing for that case now.

### Hard rules (a violation downstream means the concept is broken)
1. **No gate.** Provisioned tools run directly; provisioning never interposes approval/review/reversibility on their use. Review rides AL7 only where a human chose it or a learning earned it.
2. **Re-apply every spawn.** Nothing is assumed to survive a respawn; durable → disposable each time.
3. **Secret may live in the sandbox the agent controls, but never logged, never shown.** Resolved only via `ServiceConnectionResolver`; never echoed to a route response, UI field, or log line. (AN1 hard-rule 1.)
4. **Per-user isolation.** One user's connection never provisions into another user's sandbox. (AN1 hard-rule 3.)
5. **Never extract inherited auth.** Provisioning carries held connections only; inherited auth stays in the harness/keychain. (AN1 hard-rule 4.)
6. **Ride the MCP standard outbound.** No reimplementation of a service API; a new service is configuration (a Connection row), never new per-service client code.
7. **Live-proof.** AN2 is a live-proof WP: it must drive one real external MCP server end-to-end before `done` (an in-repo standard MCP server over a real transport is acceptable; a stub of our own client is not).

---

## Rationale

The Track AN reset (PR #364) killed the broker-gate, the trust tiers, and the "credential never reaches the agent" containment model. ETHOS §2 is explicit: *agents hold their own credentials and run their own tools — a tool that can't authenticate is useless.* AN1 made "I connected GitHub" a durable, encrypted, per-user fact. AN2 is the moment that fact becomes capability — and the temptation at exactly this seam is to re-introduce the rejected wall ("the agent is about to make an external call, so gate it"). The concept exists to foreclose that: provisioning **installs** tools and steps out of the way; it is a pure, idempotent, gate-free projection of a durable Connection onto a disposable sandbox, re-run on every spawn. The two satellite nouns pin the mechanism honestly — the **outbound MCP client** is genuinely new (today only the inbound bridge exists) and must ride the MCP standard, not reimplement services; the **provisioned connection** is deliberately ephemeral so the "durable thing = Connection, disposable thing = sandbox" model holds. Naming avoids "materialization" because that word is already spent on the retired Fabric workspace engine; we ride the codebase's live word, *provisioning* (Phase 8b).

---

## Phase 6 — Self-critique (resolved)

- *Is the rejection list distinct, not three flavors of one?* Yes — 1 (no gate), 3 (not the inbound bridge / direction), 5 (no inherited extraction) are orthogonal: a policy concern, a topology concern, a scope-boundary concern. 2/4 guard the durable↔disposable split from two sides.
- *Canonical-term collision?* Checked: `grep` shows "provisioning" is live (session-provisioning) and scoped here as a sub-step; "materialization" appears only in `docs/archive/*` (retired) and is explicitly rejected as a term; "outbound" is already the established word in `what-this-architecture-does-not-include.md` and `connections.ts`. No live collision.
- *Contracts complete?* Cardinality, closure, mutability, identity, spawn-time-read, deployment-shape, and 7 hard rules — closure is keyed to AN1's `HELD_AUTH_SOURCES` so it cannot silently drift.
- *Rationale concrete?* Cites the PR #364 reset, ETHOS §2 verbatim intent, and the specific "gate at this seam" temptation — not "for clarity."
- *Right files touched?* This concept lives in `plans/AN2/`. Ground truth (`docs/architecture/connection-model.md`) already forward-references AN2 in multiple places; it is intentionally **not** pre-edited with unbuilt provisioning mechanics — `/write-docs` retires this concept into it after build (avoids documenting behavior that does not yet exist).

### AQ1 re-lock self-critique (2026-06-28)

- *Did AQ1 reshape AN2 or just simplify it?* Simplify. The central noun (Connection provisioning) and both satellites (provisioned connection, outbound MCP client) are untouched — AQ1's lifecycle diagram *hosts* the AN2 step verbatim. Only the Phase 4 deployment-shape contract changed (split deleted). A reshape would have changed identity/composition/lifecycle; none moved.
- *Is the rejection list still distinct post-AQ1?* Yes. Rejection 5 (never extract inherited) is now *stronger*, not weaker — inherited works via real `$HOME` everywhere, so there is never a motive to extract; the "remote = isolated box that inherits nothing" premise that once made extraction tempting is gone.
- *Vocabulary collision with AQ1?* Checked `run-unit-model.md`: canonical term is **run-unit / working directory**; `Sandbox*` is explicitly the code noun. This doc now states that mapping (Phase 0) and stops treating "sandbox" as an isolation noun. No collision; aligned.
- *Anything still assuming isolation?* Swept — no remaining claim that a remote/isolated target "inherits nothing" or that auth is "carried across a boundary." The single isolation-bearing contract (Phase 4) is rewritten; isolation provisioning is deferred to AQ2 by name.
- *Does the WP spec agree?* Yes — `.pipeline/work-packages/TRACK-AN.md` AN2 banner already carries the founder's 2026-06-28 AQ1 direction (target host run-unit, collapse the split, defer isolation to AQ2). This doc now matches it.

**Concept RE-LOCKED (2026-06-28, post-AQ1).** Downstream `/architecture` consumes the run-unit contract above as fixed input: one host working-dir target, held-connection provisioning only, no isolation materialization.
