# System Boundary — HyperIdle vs. git-host / CI / deploy

**What this answers:** where HyperIdle ends and GitHub / GitLab / CI / deploy platforms begin. HyperIdle is the **orchestration + review + governance + knowledge** layer for agent work. It does **not** host git, run CI, or operate deploy infrastructure. It **rides** the git substrate, **integrates** the heavy infra via API/MCP, and **replaces** the human-centric collaboration layer with an agent-first one.

Source: founder boundary act 2026-06-22 (`plans/AN/boundary-concept.md`), grounded in a code+docs inventory and a cited GitHub/GitLab surface inventory.

---

## The three verbs

- **RIDE** — use it as-is, never reimplement (the open, portable git substrate).
- **INTEGRATE** — trigger and observe via API/MCP, never host the compute (CI runners, registries, deploy targets, security scanning, SSO).
- **REPLACE** — supersede with an agent-first experience (review, planning, knowledge).

## The line, per cluster

| GitHub/GitLab cluster | Verdict | HyperIdle stance |
|---|---|---|
| Git hosting (repos, commits, protocol) | **RIDE** | code lives in a **local git repo, forge-optional**; we read diffs, route landing — never host repos |
| Code review (PR/MR, approvals, comments) | **SYNC / INTEGRATE** | Provider-native PR/MR review remains source of truth for code; HyperIdle links it to work, agents, sessions, and AL7-gated actions |
| CI/CD (Actions, runners, pipelines) | **INTEGRATE** | trigger/observe via API/MCP; never host runners |
| Deploy / registries / environments | **INTEGRATE** | a deploy is a Proposed Call the agent runs with its own tools once approved; registries integrated |
| Project management (Issues, Projects, Epics) | **REPLACE** | bets/tasks supersede tickets |
| Knowledge (wikis, gists, Pages) | **REPLACE** | the knowledge fabric supersedes wikis |
| Code intelligence (search, scanning, AI) | **INTEGRATE** scanning · **REPLACE** AI review | scanning is a rules-DB investment; AI review is our differentiator |
| Identity / governance (SSO, audit, rulesets) | **INTEGRATE** SSO/audit · **OWN** merge-policy | the policy "can this agent change land" is ours, enforced via the host's ruleset API |
| APIs / MCP | **INTEGRATE** | GitHub's GA MCP server (~23 toolsets incl. `pull_requests`, `actions`, `git`) is the door in |

## Code: where it lives, how it lands

- **The system needs no git.** Most agent work — a refund, an email, a metric, a doc — touches no git. Git is **one connected system**, not a foundation.
- **Code work uses a local git repo, forge-optional.** The agent edits a working copy that is a plain git repo (history + real diffs). A solo founder needs **no GitHub**. Connect a forge and agents use normal git/gh or provider MCP/API flows to push branches and open PRs; the forge owns code review, CI, branch protection, conflicts, and merge. HyperIdle syncs that provider-native PR/MR state back into Work/Conversations and may route consequential provider actions through AL7, but it does not replace the forge's merge semantics. Git is our working ground, never a product we host. The code artifact is **derived** from the repo / PR, never our store of record.
- **Consequential provider actions can sit behind a review.** The code diff / PR state is **descriptive** (approve = "this change is good"); **merge / deploy / mark-ready** can be an operative artifact carrying a Proposed Call — the irreversible call the trusted agent attempted, routed to a human as a collaboration checkpoint. Approve lets the agent's own session run it through the provider/CI tool with its own creds, with the provider result returning. HyperIdle is the **gate + bookkeeper**; the provider and agent's own tools are the **executor** (HyperIdle executes nothing of its own). The checkpoint fades as trust grows. → see [Review-gated execution: the Proposed Call](../process-layer/staged-operation.md).

## Hard rules

1. HyperIdle **never executes a side-effect itself** — it triggers a connected system, which executes and returns an Outcome.
2. **No connected system is a dependency** for the core product — git/forge/CI are optional; the system runs with none of them.
3. **We never reimplement a connected system's core** — no git forge, no CI runner, no registry. Integration only.
4. **Code is git-derived, never HyperIdle-stored-of-record.**

## Why this is the opportunity, not just a boundary

Both GitHub Copilot's coding agent and GitLab Duo retrofit AI as a **PR-author inside a human workflow** — the agent opens a *draft PR a human must merge*. HyperIdle does not need to replace that provider-native code flow. It adds the operating layer around it: agents are first-class participants in HyperIdle work, PRs are synced artifacts of that work, humans can gate consequential provider actions through AL7, and "review for anything" still spans non-code work git hosts never touch.

See also: [What This Architecture Does Not Include](./what-this-architecture-does-not-include.md).
