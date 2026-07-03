# Track AN: External Tools

**What this track is.** The path from an agent to the outside world. A user has tools they already use — GitHub, Stripe, Figma, Gmail, their own MCP servers — and they want their agents to actually *use* them. This track builds that: connect a service once, and your agents can work in it.

**Reset (2026-06-25).** This track was rewritten from scratch. The previous version (the original AN1 "External Connections", AN2 "broker-gate", AN3 "sandbox provisioning", AN4 "ecosystem registry", and the `plans/AN/` concept) is gone — AN1's code is reverted from main, and the concept doc is deleted. The old design was built around preemptive security the ethos now rejects: a reversible/irreversible **broker-gate** in front of every external call, a "credential never reaches the agent" containment model, and `vetted`/`community` **trust tiers** with no learning behind them. `ETHOS.md` §2 makes the call: *security is never preemptive; "irreversible" is not a reason to gate; agents hold the credentials their tools need.* So we start clean.

**What this track is NOT.** No broker. No reversible/irreversible classifier. No trust-tier policy engine. No "the agent must never see the secret." No HyperIdle-registered OAuth app / "verified company" ceremony. Where a specific action genuinely warrants human review, that rides AL7's existing review→act loop — earned for that case, not built as a wall in front of everything.

**Scope rules.** External tool use only. Ride the MCP standard — a tool source is a standard MCP server; we never reimplement a service's API. `npm run verify` passes after each workpackage merges.

**Concept status.** The prior `plans/AN/requirements.md` was deleted as not worth keeping. Every workpackage below is marked **Concept: Required** — run `/pipeline:refine <id>` to lock its nouns fresh (there is no concept doc to lean on). Reference: `docs/architecture/credential-model.md`, `docs/agent-layer/harness-capability-descriptor.md`, `packages/server/src/mcp/mcp-bridge.ts`, AL7 (`plans/AL7/`).

---

### AN1 — Connect a service once

**Workpackage.** As a user, I want to make a service I already use — GitHub, Stripe, Figma, Gmail, an MCP server I run — available to my agents by authenticating it *once*: I paste a token, I point at an MCP server, or I just rely on the tools my harness is already logged into. Afterward I can see it in a list of my connected services and remove it when I want. I never hand a secret to an agent by hand; I set the service up once and it's available.

**Why this matters.** Agents reach zero external services today, and every other workpackage in this track has nothing to build on until "I connected GitHub" is a real, stored fact. The fast-moving founder benefits — set your stack up once. Riding the auth you already have (a token you generate, your harness's existing logins, or a service's own OAuth) is *why* HyperIdle is built on harnesses: it avoids HyperIdle ever registering a per-service OAuth app or becoming a "verified company." The cost of not building it: nothing downstream can exist.

**What exists today.** Nothing on main — this WP's predecessor was reverted. But the prior implementation is **recoverable in git history at PR #353 / commit `16c3fe62`**, and two parts of it are worth reusing rather than re-deriving (informational — the architect/designer decides how):
- **A founder-approved design.** The old AN1 went through `/design` + human-design-review and the founder approved the `VariantAInheritedDefault` layout — connections grouped by auth source, with the "Inherited from your environment" group first — in `packages/web/src/settings/SettingsConnections.tsx` + `.stories.tsx` (the `Populated` / "Inherited-default" story). That approved shape is the design starting point. **Strip from it:** the `vetted`/`community` trust-tier badge and any "secret unreadable by the agent" framing (both killed by the ethos).
- **Working plumbing.** A proven `ServiceConnectionResolver`, `/api/connections` routes, and a `service_connections` schema (minus the `trustTier` column) — recoverable from the same commit.

Also: the credential model (`docs/architecture/credential-model.md`, `packages/shared/src/credential.ts`) is a closed catalog of infra/LLM-provider keys with one encryption primitive and one resolver, per-user, AES-GCM at rest. The harness capability descriptor (AM2) knows what a harness is configured with.

**What's genuinely missing.** A per-(user × service) record of a connected service — whose auth is a token the user gives us (stored encrypted), the user's harness/environment, or the service's own MCP OAuth — plus the surface where a user connects, sees, and removes services.

**Depends on.** None — it is the foundation.

**Complexity.** L

**Pre-build gates.**
- **Concept:** Required — run `/concept AN1` first. Introduces/relocks **Connection** (the connected-service record). The prior concept doc was deleted; lock it fresh, ETHOS-aligned (no trust tier, no "secret unreadable by the agent" framing).
- **Design:** Light — the connect/manage surface's shape was already explored and **founder-approved** in #353 (the `VariantAInheritedDefault` grouped-by-source layout). Don't re-run a novel multi-variant pass. Single-variant `/design`: recover the approved design (see "What exists today"), strip the trust-tier badge, place it. The direction forks (MCP-server vs token vs inherited) were already decided by that rendered, reviewed variant.

**Human design review.** No — the connect/manage shape was approved by the founder in #353; adapting it (subtract the trust badge) does not re-open the decision. Re-trigger human review ONLY if the adaptation meaningfully changes the approved shape (a subtraction does not). This deliberately reuses the prior approval instead of re-deriving it.

**Acceptance criteria.**
- A user can make a service available — by pasting a token, pointing at an MCP server, or relying on their harness/environment's existing auth — and afterward see it listed among their connected services.
- A user can remove a connection, after which their agents no longer have access to that service.
- A connection records where its auth comes from and whether it currently works; auth that has stopped working (e.g. an expired token) shows as needing attention rather than failing silently.
- A secret a user pastes is stored encrypted and is never shown back in the management UI or written to logs. (It is used by the agent's tools to authenticate — that is the point; this AC is about not *displaying/logging* it, not about withholding it from the tools.)
- Connections are per user; one user's connection is never usable from another user's session.
- HyperIdle registers **no per-service OAuth app** and is **never** an OAuth provider — connecting a service never requires HyperIdle to appear on the service's consent screen or pass publisher verification.

**Validation scenarios.**
- Given a user with no connections, when they connect a service with a token, then it appears in their list and its auth source is recorded.
- Given a connected service, when the user removes it, then it is gone from their list and their agents lose access.
- Given a connection whose token has expired, when the user views their connections, then it shows as needing attention.
- Given two users connect the same service, then neither can act through the other's connection.

**Plan calls.** Run `/concept AN1` (lock **Connection** fresh, ETHOS-aligned). Then a single-variant `/design` that **recovers the founder-approved design from #353** (`SettingsConnections` `VariantAInheritedDefault`) and adapts it (strip the trust-tier badge) — not a fresh novel exploration. Then a standard architecture pass extending the credential store from the closed infra catalog to an open per-(user×service) connection set; the prior `ServiceConnectionResolver` / routes / schema (minus `trustTier`) at #353 are a recoverable reference. **No trust-tier column. No "secret unreadable by the agent" containment. No hosted OAuth-app flow.**

**Contracts / constraints.** A stored secret is resolved server-side and not shown in the management UI or logs — but it IS available to the agent's tools (a tool that can't authenticate is useless; ETHOS §2). Per-user isolation holds. The open connection set is distinct from the closed infra-secret catalog; the infra catalog stays closed. HyperIdle registers no per-service OAuth app and is never an OAuth provider — auth rides a user-supplied token, the user's harness/environment, or the service's own MCP OAuth.

**Out of scope.** Making connected tools work inside a session/sandbox (AN2). Showing harness-inherited tools live (AN3). Any trust tier, vetted/community distinction, or community registry.

**Effort.** L (~4d)

---

### AN2 — Authenticate once; connected tools work in every sandbox

> **✅ UNBLOCKED (2026-06-28) — AQ1 merged (#371).** AQ1 locked the run-unit (`docs/architecture/run-unit-model.md`) and **removed isolation entirely**: the run-unit is a **per-session working directory on the host**; the harness runs as a host child process with the real `$HOME`. The AN2 concept was **re-locked against this** (`plans/AN2/concept.md` — AQ1 reconciliation, 2026-06-28): the central noun (Connection provisioning) and both satellites stand; the old "local-free vs remote-carry-in" materialization split is **deleted** (no isolation axis to provision across). AN2's architecture/build may now proceed against the host run-unit.
>
> **What AN2 targets now.** One provisioning target: the host working dir with the real `$HOME`. **Inherited** tools work for free (harness reads real `$HOME`) — zero provisioning work. **Held** connections are the entire job — provisioned into the working dir on every spawn (`token` → injected secret, `mcp` → outbound MCP pointer). **Remote** is distribution, not isolation — a joined desktop runs the task host-local with *its own* `$HOME`, so it inherits *that* machine's logins the same way; it is **not** a "carry auth into a jail" case. Provisioning *into an isolated run-unit* (opt-in isolation + credential doorway) is an **AQ2** concern — do **not** build it here.

**Workpackage.** As a user, I authenticate a service once (AN1), and from then on **every time a sandbox spawns** for one of my agents, those tools are already present and authenticated, so the agent just uses them. The connection is the durable thing; the sandbox is disposable; spawning one re-applies my connections so it works immediately. The agent reads my repo, queries my records, opens a branch — directly, the same way it uses any tool. There is no wall in front of each action.

**Why this matters.** This is what turns a connection from a settings bookmark into real capability — the actual bridge from "agent" to "external effect." Without it, a user can connect GitHub but a freshly-spawned sandbox doesn't have it, so nothing happens. The fast-moving founder benefits directly — connect once, and every agent in every session works across the stack at full speed with no re-login friction.

**What exists today.** Session provisioning already spawns a sandbox per session, and the inbound MCP bridge (`packages/server/src/mcp/mcp-bridge.ts`) already hands that sandbox a localhost endpoint with HyperIdle's internal tools. AL7 owns the review→act loop for the rare action a human *chose* to review — the earned gate, not a precondition for using a tool. AN1 (this track) supplies the durable connection record.

**What's genuinely missing.** Nothing re-applies a user's connections to a sandbox when it spawns. There is no step that, on session start, makes the user's connected tools present and authenticated inside the sandbox so the agent can call them — and no outbound path from HyperIdle to a connected service's MCP server.

**Depends on.**
- AN1 — the durable connection record is the thing re-applied on every spawn; it must exist first.
- **AQ1 (blocker)** — AQ1 locks the run-unit (sandbox vs workspace; isolation spectrum) that AN2 provisions into. AN2's materialization design (local-free vs remote-carry-in) and its answer to "do inherited/OAuth tools survive a spawn" both depend on AQ1's decision. AN2 cannot be architected or verified until AQ1 is `done`.

**Complexity.** L

**Pre-build gates.**
- **Concept:** Required — run `/concept AN2` first. Locks the nouns for *the materialization*: how a durable connection maps onto a disposable sandbox on spawn, ETHOS-aligned (no gate).
- **Design:** Not required — runtime/provisioning mechanism, no rendered surface.

**Human design review.** No — backend/runtime mechanism; no user-facing component.

**Acceptance criteria.**
- After a user authenticates a service once, every subsequently-spawned sandbox for their agents has that service's tools present and authenticated — the user never re-authenticates per session.
- An agent in a spawned sandbox can perform a real operation against at least one real connected service end-to-end (e.g. read a repo or create a record) and get the result, calling the tool directly with no gate.
- **Injection is proven per harness against a real deployed session.** Each carrier path is exercised end-to-end with the **real CLI** where it exists — **claude-code** (`.mcp.json` + Bearer header), **codex** (`config.toml` via `CODEX_HOME` + `bearer_token_env_var`), **opencode** (`opencode.json` inline header), the **CLI-key sub-case** (`GH_TOKEN` → real `gh`), and **builtin** (registry injection, or scoped out with a reason) — hitting a real MCP server / tool over a real transport (in-repo standard server acceptable; a stub of our own client is not). Local-lane integration/e2e, not a GitHub Actions job; a missing binary skips loudly and the WP is not `done` until every carrier has a real run where its binary exists. Matrix + mechanics: `plans/AN2/research-mcp-auth.md`.
- It survives respawns: destroy a sandbox, spawn a fresh one, and the same connected tools work again with no user action.
- It works for more than one service — proven against at least one real external MCP server, with a second reachable by configuration, not new per-service code.
- Connecting or disconnecting a service changes which tools the next spawned sandbox gets; after disconnect, the tool is gone.
- One user's connected tools are never present in another user's sandbox.

**Validation scenarios.**
- Given a user who authenticated a service once, when a sandbox spawns, then the service's tools are present and authenticated without the user doing anything.
- Given that sandbox is destroyed and a fresh one spawns, when the agent runs, then the same tools work again with no re-authentication.
- Given a connected service, when the agent reads data from it, then the read succeeds directly, with no human gate.
- Given a user disconnects a service, when the next sandbox spawns, then that service's tools are absent.

**Plan calls.** Run `/concept AN2`, then a standard architecture pass — re-applying a user's active connections into a session's sandbox on spawn (durable auth → disposable sandbox), the outbound reach to a connected MCP server, and per-user isolation. Account for **both deployment shapes**: a *local* sandbox can inherit the user's existing machine logins (harness-native ≈ free), while a *remote* sandbox must carry the durable auth in on every spawn — same model ("re-apply on spawn"), different materialization. Live-proof workpackage: it must call one real external MCP service end-to-end before it is `done` (an in-repo standard MCP server spawned over a real transport is acceptable; a stub of our own client is not).

**Contracts / constraints.** No preemptive gate — connected tools run directly; the agent is trusted to act. Where review is wanted it rides AL7 unchanged — never a reversible/irreversible classifier built into this WP. The credential **may** be present in the sandbox the agent controls (ETHOS §2); it is resolved from the durable store, never logged, never shown in a management surface. Per-user isolation: one user's connection never materializes into another user's sandbox. Ride the MCP standard.

**Out of scope.** The connect/manage surface (AN1). Showing inherited tools in the UI (AN3). Any review-gating mechanism (AL7's job, only where earned).

**Effort.** L (~4d)

---

### AN3 — See the tools your agents already inherit

**Workpackage.** As a user, I want to see — right where I manage my connections — the tools my agents already inherit from my environment: the MCP servers and logged-in CLIs my harness is already set up with. So I know what my agents can reach without connecting anything, and I only connect what's genuinely missing.

**Why this matters.** Riding the user's existing harness is the whole reason HyperIdle is built on harnesses — the logins and connectors already live there. But if a user can't *see* what they already inherit, they can't tell what their agents can reach, and they re-connect tools they already have. Showing it is honest and saves the fast-moving user time.

**What exists today.** AN1 (this track) supplies the connect/manage surface where inherited tools would be shown. AM2 (#339) shipped the harness capability descriptor, proven against real harness binaries (Claude Code, Codex, OpenCode) — it knows what a harness is configured with. Nothing reads that and shows the user their inherited tools.

**What's genuinely missing.** A read-only view of the MCP servers / tools the user's harness is already configured with, shown alongside their connected services, so the inherited set is visible rather than invisible.

**Depends on.**
- AN1 — provides the manage surface this visibility lives in.
- AM2 (`done`) — the harness capability descriptor is the source of what the harness is configured with.

**Complexity.** M

**Pre-build gates.**
- **Concept:** Required — run `/pipeline:refine AN3` first. Small, but lock how an *inherited* tool relates to a *connected* one (you see the former; you set up the latter) so the vocabulary is clean.
- **Design:** Light — extends AN1's manage surface with a read-only "inherited" view; single-variant `/pipeline:design` to place it, no human-review park.

**Human design review.** No — extends AN1's surface with a read-only group; introduces no new primitive.

**Acceptance criteria.**
- A user whose harness has MCP servers / logged-in tools configured sees those listed as inherited, identified by service, without connecting anything.
- A user whose harness has nothing extra configured sees an honest none-state, not a misleading placeholder.
- The inherited list reflects the real environment — change what the harness is configured with, refresh, and the list changes.
- No secret or token value is shown — only that the tool is available.

**Validation scenarios.**
- Given a user whose harness is configured with two MCP servers, when they open their connections, then both appear as inherited, identified by service.
- Given a user whose harness has nothing extra, when they open their connections, then the inherited view shows an honest none-state.
- Given an inherited tool, when it renders, then no credential or token value is present in the output.

**Plan calls.** Run `/pipeline:refine AN3`, then a single-variant `/pipeline:design` to place the inherited view, then a standard architecture pass reading the harness capability descriptor (AM2) and projecting the user's configured MCP servers / inherited tools into AN1's surface.

**Contracts / constraints.** Renders from the harness capability descriptor — no per-harness branching in the UI. The inherited view is read-only (you see what you inherit; you don't "connect" it). No secret values surfaced. Consistent with AN1's connection vocabulary and layout.

**Out of scope.** Using inherited tools in a session (AN2 / native harness use). Connecting new services (AN1).

**Effort.** M (~6h)

---

### AN4 — Sync provider-native code review flows

**Work package.** As a founder managing agent-built code work, I want HyperIdle to track the GitHub pull request an agent creates for a task — branch, PR URL, review state, checks, conflicts, and merge outcome — so that code work moves through the same provider-native review and merge flow the team already trusts. Agents still use their normal git/gh tools and credentials to create or update branches and PRs; HyperIdle links that external PR back to the task/session/agent and keeps its state visible in Work and Conversations. When an action is consequential, such as marking a PR ready or merging it, AL7 can route the agent's own provider action through approval, but GitHub remains the system that evaluates CI, branch protection, review requirements, conflict state, and merge. GitLab and other forges follow later behind the same provider-sync concept, not a custom HyperIdle merge engine.

**Why this matters.** The fast-moving founder benefits because agent code work becomes legible without leaving HyperIdle, while the actual code-review machinery stays where it belongs: GitHub/GitLab. The cost of not building this is either blind external drift (agents open PRs but HyperIdle has no idea) or the worse mistake AO3 exposed: HyperIdle reinvents direct landing and bypasses branch protection, CI, and provider review. This work keeps HyperIdle as the operating layer that coordinates agents and work, not a second forge.

**Type.** application

**What exists today.** AN1/AN2 define connected services and session provisioning for external tools; AN3 makes inherited tools visible. AO1/AO2 define authored filesystems and mount/capture code repos into session working directories. AL7 defines the Proposed Call / tailored grant / Outcome loop for consequential agent tool calls. The process docs already say agents work with their own credentials and write-back rides the host: git means commit → push/PR, not a custom sync engine. What does not exist is a first-class PR/MR artifact synced from the forge and attached to work.

**What's genuinely missing.** HyperIdle does not know when an agent opens or updates a GitHub PR for a task, does not show provider review/check/merge state on the task, and does not record the merge outcome as part of the work history. There is no provider-native sync loop that treats GitHub as source of truth for code review while HyperIdle remains the coordinator.

**Depends on.**
- AN1 — the GitHub account/connection must be represented before a provider sync can resolve auth and ownership.
- AN2 — sessions need connected tools/credentials so agents can use normal git/gh or MCP provider tools in their working directory.
- AO2 — agents need mounted code filesystems so a PR represents real code work produced in a session.
- AL7 — approval for consequential provider actions, such as merge, rides the existing review→act loop rather than a new gate.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Required — run `/refine` first (reshapes the code-output handoff around provider-native PR/MR sync and retires AO3's direct-land framing).
- **Design:** Light — extends existing Work/Conversations artifact and review surfaces with provider PR status; single-variant `/design`.

**Human concept review.** Yes — this changes the user-facing meaning of code review/landing and needs the founder-facing guide wording to be precise.

**Acceptance criteria.**
- A GitHub PR created or updated by an agent for a mounted code filesystem is linked to the producing task/session/agent and appears as the code-work artifact in HyperIdle.
- HyperIdle displays provider-native PR state from GitHub as source of truth: branch, PR URL, draft/ready state, review state, checks, conflict/mergeability state, and merged/closed outcome.
- HyperIdle never bypasses provider merge rules: branch protection, required checks, provider reviews, conflicts, and merge queues remain enforced by GitHub.
- If an agent attempts a consequential provider action that the founder has chosen to gate, such as merging a PR, the action routes through AL7 and the approved session executes the provider action with the agent's own credentials.
- When a PR changes outside HyperIdle, a refresh/sync updates the linked task/artifact state without overwriting provider data.
- The model is provider-extensible: GitHub ships first, while GitLab is deferred behind the same PR/MR sync boundary rather than baked into GitHub-only nouns.
- AO3-style direct push/merge is absent: HyperIdle does not implement a custom code merge, conflict resolver, or "land captured commit" executor.

**Validation scenarios.**
- Given an agent opens a GitHub PR for a task, when HyperIdle syncs provider state, then the task shows the PR URL, branch, checks, review state, and current mergeability.
- Given GitHub checks fail or the branch has conflicts, when the task is viewed in HyperIdle, then the provider state is visible and HyperIdle does not offer a fake successful landing.
- Given a gated merge action is approved through AL7, when the agent re-runs the provider merge action, then GitHub performs or rejects the merge according to its own rules and HyperIdle records that outcome.
- Given a PR is merged or closed directly on GitHub, when HyperIdle refreshes, then the linked task/artifact reflects the external outcome.

**Plan calls.** Run `/refine AN4` first to lock the provider-native review/merge vocabulary and explicitly retire AO3's direct-land semantics. Then a light `/design` pass for how PR status appears on task/session/review surfaces, followed by a standard architecture pass for provider sync contracts, persistence, refresh triggers, and AL7 integration for gated provider actions.

**Contracts / constraints.**
- GitHub/GitLab remain the source of truth for code review, CI, branch protection, conflict state, and merge.
- HyperIdle syncs, links, routes, and records; it does not host git, run CI, or implement merge/conflict semantics.
- Agents use their own configured tools/credentials (`git`, `gh`, provider MCP/API) rather than a HyperIdle broker-only path.
- Provider actions that require approval use AL7's existing Proposed Call / grant / Outcome loop; no new review gate.
- GitHub-first implementation must leave a clean PR/MR provider boundary for GitLab.

**Out of scope.**
- GitLab implementation (provider boundary only; GitLab follows later).
- Replacing GitHub/GitLab review UI or approval rules.
- Custom merge queues, conflict resolution, or CI orchestration.
- Non-code providers such as Figma, Drive, or Obsidian; those need their own provider-native sync packages.
- AO3 direct `land_change` push/merge semantics.

**Effort.** L (~4d)
