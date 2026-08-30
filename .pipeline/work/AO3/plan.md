# AO3 — Agent output becomes reviewable and landable — WONT DO

**Closed by founder decision, 2026-07-03.** Registered 2026-07-01, depended on AO2 and AL7.

**Why it was dropped.** The `land_change` concept AO3 was built around duplicated and bypassed the
things a forge already does well: provider-native PR/MR review, CI, branch protection, conflict
handling, and merge. Building a second, weaker version of that inside HyperIdle would have to be
maintained against every provider forever, and would be the path agents took instead of the real one.

**Replacement scope.** AN4 — sync provider-native code review flows. Track the PR the agent creates
(branch, URL, review state, checks, conflicts, merge outcome) and let the team's existing forge flow
do the reviewing and landing.

**Do not build AO3's direct push/merge semantics.** If the requirement resurfaces, it is AN4's shape,
not this one.

**Remnants worth keeping.** AO2's capture-back is still valuable as provenance and recovery evidence;
AL7 stands on its own as the generic review → grant → agent-act loop; review canvases remain the
proof-of-output surface. None of those depended on direct landing.
