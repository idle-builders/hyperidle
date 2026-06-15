# Rejected directions (considered, not pursued)

**X — One unified placement component used in both surfaces (always a `Select`).**
Rejected: forces a team picker into the WorkTeam dialog, implying the agent can be assigned elsewhere from the team page — false (moving agents across teams is out of scope, no multi-team). Adds a choice the user doesn't have. The two surfaces have genuinely different semantics; collapsing them lies to the user.

**Y — A new `TeamPickerField` design-system primitive (Select + label + avatar + member count).**
Rejected: violates the component budget. The need is met by `Select` + an existing `.label`. A richer picker (avatars, counts) is decoration the task doesn't require — the founder is choosing among a handful of their own teams by name, not browsing. No 2+-context justification.

**Z — Defer placement to a post-create "assign to team" step / toast action.**
Rejected: contradicts the spec's core ("explicit in the API, not inferred after the fact") and the AC ("clear, before confirmation, which team"). Post-hoc assignment is exactly the orphan-then-repair pattern AH4 exists to kill.

**W — Inline new-team creation inside the add-agent Settings picker ("+ Create team").**
Rejected: scope creep. Team creation is its own flow (Setup) with its own roster/agent provisioning. A bare "create team" here would produce a team without the default roster the team-creation path builds. The zero-teams empty state points to Setup instead.
