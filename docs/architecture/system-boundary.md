# System Boundary — HyperIdle vs. git-host / CI / deploy

**What this answers:** where HyperIdle ends and GitHub / GitLab / CI / deploy platforms begin. HyperIdle is the **orchestration + review + governance + knowledge** layer for agent work. It does **not** host git, run CI, or operate deploy infrastructure. It **rides** the git substrate, **integrates** the heavy infra via API/MCP, and **replaces** the human-centric collaboration layer with an agent-first one.

Boundary settled by founder decision 2026-06-22, grounded in a code+docs inventory and a cited GitHub/GitLab surface inventory.

---

## The three verbs

- **RIDE** — use it as-is, never reimplement (the open, portable git substrate).
- **INTEGRATE** — trigger and observe via API/MCP, never host the compute (CI runners, registries, deploy targets, security scanning, SSO).
- **REPLACE** — supersede with an agent-first experience (review, planning, knowledge).

## The line, per cluster

| GitHub/GitLab cluster | Verdict | HyperIdle stance |
|---|---|---|
| Git hosting (repos, commits, protocol) | **RIDE** | code lives in a **local git repo, forge-optional**; we read diffs and sync provider PR/MR state — never host repos |
| Code review (PR/MR, approvals, comments) | **SYNC / INTEGRATE** | Provider-native PR/MR review remains source of truth for code; HyperIdle links it to work, agents, sessions, and AL7-gated actions |
| CI/CD (Actions, runners, pipelines) | **INTEGRATE** | trigger/observe via API/MCP; never host runners |
| Deploy / registries / environments | **INTEGRATE** | a deploy is a Proposed Call the agent runs with its own tools once approved; registries integrated |
| Project management (Issues, Projects, Epics) | **REPLACE** | bets/tasks supersede tickets |
| Knowledge (wikis, gists, Pages) | **REPLACE** | the knowledge fabric supersedes wikis |
| Code intelligence (search, scanning, AI) | **INTEGRATE** scanning · **REPLACE** AI review | scanning is a rules-DB investment; AI review is our differentiator |
| Identity / governance (SSO, audit, rulesets) | **INTEGRATE** SSO/audit · **OWN** merge-policy | the policy "can this agent change land" is ours; enforcement via the host's ruleset API is stated intent, not yet built |
| APIs / MCP | **INTEGRATE** | GitHub's GA MCP server (~23 toolsets incl. `pull_requests`, `actions`, `git` — count as of the 2026-06 inventory, will drift) is the door in |

## Code: where it lives, how it lands

- **The system needs no git.** Most agent work — a refund, an email, a metric, a doc — touches no git. Git is **one connected system**, not a foundation.
- **Code work uses a local git repo, forge-optional.** The agent edits a working copy that is a plain git repo (history + real diffs; `layers/agent-orchestration/filesystem-mounting/src/mounter-registry.ts`). A solo founder needs **no GitHub**. Connect a forge and agents use normal git/gh or provider MCP/API flows to push branches and open PRs; the forge owns code review, CI, branch protection, conflicts, and merge. HyperIdle syncs that provider-native PR/MR state back into Work/Conversations and may route consequential provider actions through AL7, but it does not replace the forge's merge semantics. Git is our working ground, never a product we host. The code artifact is **derived** from the repo / PR, never our store of record.
- **Consequential provider actions can sit behind a review.** The code diff / PR state is **descriptive** (approve = "this change is good"); **merge / deploy / mark-ready** can be an operative artifact carrying a Proposed Call — routed to a human as a collaboration checkpoint where a human chose it or a learning earned it. Approve lets the agent's own session run it through the provider/CI tool with its own creds, with the provider result returning. The checkpoint fades as trust grows. → mechanics in [Staged operation: the Proposed Call](../process-layer/staged-operation.md).

## The executes-nothing boundary

HyperIdle is the **gate + bookkeeper**; the connected system and the agent's own tools are the **executor**. HyperIdle never executes a side-effect of its own — a Proposed Call is approved in HyperIdle, then executed by the agent's session through the provider's tools, and the Outcome returns (`layers/core-api/review/src/proposed-call-workflow.ts`; `proposed_call` in `framework/db/src/schema.ts`). No CI runner, forge, or registry code exists anywhere in the repository.

## Hard rules

1. HyperIdle **never executes a side-effect itself** — it triggers a connected system, which executes and returns an Outcome.
2. **No connected system is a dependency** for the core product — git/forge/CI are optional; the system runs with none of them.
3. **We never reimplement a connected system's core** — no git forge, no CI runner, no registry. Integration only.
4. **Code is git-derived, never HyperIdle-stored-of-record.**

## Why this is the opportunity, not just a boundary

As of the mid-2026 inventory (point-in-time market claim, will drift): both GitHub Copilot's coding agent and GitLab Duo retrofit AI as a **PR-author inside a human workflow** — the agent opens a *draft PR a human must merge*. HyperIdle does not need to replace that provider-native code flow. It adds the operating layer around it: agents are first-class participants in HyperIdle work, PRs are synced artifacts of that work, humans can gate consequential provider actions through AL7, and "review for anything" still spans non-code work git hosts never touch.

See also: non-goals in [System Overview](./system-overview.md); how connections to external systems are held or inherited in [Connection Model](./connection-model.md).
