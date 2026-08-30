# Track AN: External Tools

**What this track is.** The path from an agent to the outside world. A user has tools they already use — GitHub, Stripe, Figma, Gmail, their own MCP servers — and they want their agents to actually use them. Connect a service once, and your agents can work in it.

**Constraint — what this track is NOT.** No broker. No reversible/irreversible classifier. No "the agent must never see the secret." No trust-tier policy engine. No HyperIdle-registered OAuth app or "verified company" ceremony. The track was rewritten from scratch on 2026-06-25 because its first version was built around preemptive security the ethos rejects; `ETHOS.md` §2 makes the call — *security is never preemptive; "irreversible" is not a reason to gate; agents hold the credentials their tools need.* Where a specific action genuinely warrants human review, it rides AL7's existing review→act loop, earned for that case, not built as a wall in front of everything.

**Constraint.** Ride the MCP standard — a tool source is a standard MCP server; never reimplement a service's API.

**Concept status.** There is no concept doc to lean on — the prior `plans/AN/requirements.md` was deleted as not worth keeping. Every package below is **Concept: Required** — run `/pipeline:refine <id>` to lock its nouns fresh before building.

**Shipped foundation.** AN1 (connect a service once) and AN2 (authenticate once; connected tools work in every sandbox) are merged.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| AN3 | See the tools your agents already inherit: show the MCP servers and logged-in CLIs the harness is already set up with, on the connection-management surface | frontend | M | AN1 (shipped), AM2 (shipped) | unbuilt — carried from the legacy track file. Riding the user's existing harness is the whole reason HyperIdle is built on harnesses — the logins and connectors already live there. If a user cannot see what they inherit, they cannot tell what their agents can reach, and they re-connect tools they already have. **Constraints:** renders from the harness capability descriptor, with no per-harness branching in the UI; the inherited view is read-only (you see what you inherit, you do not "connect" it); no secret values surfaced. |
| AN4 | Sync provider-native code review flows: track the GitHub pull request an agent creates for a task — branch, PR URL, review state, checks, conflicts, merge outcome — and link it back to the task/session/agent in Work and Conversations | application | L | AN1 (shipped), AN2 (shipped), AO2 (shipped), AL7 (shipped) | unbuilt — carried from the legacy track file. **This is the replacement scope for AO3, which the founder rejected (2026-07-03).** AO3's `land_change` concept tried to push a git ref after a HyperIdle review, duplicating and bypassing the provider-native flow that already owns code review, CI, branch protection, conflict handling and merge. **The load-bearing constraint: GitHub/GitLab remain the system that evaluates CI, branch protection, review requirements, conflict state and merge — HyperIdle syncs and coordinates, it does not host git, run CI, resolve conflicts, bypass branch protection, or merge through a custom executor.** Agents use their normal git/gh tools and credentials; AL7 can route a consequential provider action (mark ready, merge) through approval. GitLab and other forges follow behind the same provider-sync concept. |

## Dependency graph

- `AN3` → `AN1` (shipped): the manage surface this visibility lives in. → `AM2` (track AM, shipped): the harness capability descriptor is the source of what the harness is configured with.
- `AN4` → `AN1` (shipped): the GitHub connection must be represented before a provider sync can resolve auth and ownership. → `AN2` (shipped): sessions need connected tools/credentials so agents can use normal git/gh or MCP provider tools. → `AO2` (track AO, shipped): agents need mounted code filesystems so a PR represents real code work produced in a session. → `AL7` (track AL, shipped): approval for consequential provider actions rides the existing review→act loop rather than a new gate.
- `AN3` and `AN4` are independent of each other.
