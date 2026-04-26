# Journey Catalog (Wave 2)

Source: wave1-first-run.md, wave1-daily-loop.md, wave1-power-use.md, wave1-recovery-edge.md
Total candidates: 104 → kept: 73, pruned: 31

Tier definitions:
- **Major** — high frequency × core value, OR low frequency × extreme value (rare but mission-critical, e.g. recovery from runaway agent / rollback of irreversible action). These are the journeys whose failure either ruins the daily product feel or causes catastrophic loss.
- **Minor** — supporting journeys; users do them, failure isn't catastrophic.
- **Auxiliary** — polish, rare-and-low-stakes, edge configurations, second-order setup.

Ranking tie-break: (a) failure blast radius, (b) frequency, (c) JTBD distinctness.

## Major (rank 1–32)

| Rank | ID(s) | Actor | JTBD | Frequency | Value | Notes |
|---|---|---|---|---|---|---|
| 1 | DL-02 | Founder | Triage overnight blocking review threads so paused agents can keep moving | daily | core | The literal core loop. Without this, every other workflow stalls. |
| 2 | DL-09 | Founder | Notice an agent is genuinely stuck and unblock it | daily | core | The Rail→Conversations bridge; ambient awareness made actionable. |
| 3 | RE-02 | CPO | Stop a runaway agent mid-session before it burns more budget | weekly | core | Mission-critical safety affordance; failure = unbounded cost/blast radius. |
| 4 | RE-03 | CEO | Roll back a shipped action (deploy, pricing, email blast) that went wrong | rare | core | Extreme value despite rarity. Without rollback, irreversibility kills trust. |
| 5 | DL-01 | Founder | Get a 10-second read on whether anything is on fire before starting the day | daily | core | The opening glance; sets cadence for the entire day. |
| 6 | DL-05 | CEO | Approve a high-risk action_summary (deploy, pricing, email blast) with explicit risk confirmation | daily | core | Split from skill-change approval (now rank 11) — artifact renderer + impact-list affordances differ. → moved from merged rank 6. |
| 7 | DL-10 / DL-29 | Founder | Catch and respond to cost-burn anomalies (daily glance + sudden spike) | daily | core | Split from cap-hit recovery (now rank 24) — watching is not the same JTBD as deciding what to cut. → moved from merged rank 7. |
| 8 | DL-26 / DL-27 | Founder | Handle factory glance + one blocking review on phone in under 60s | daily | core | Mobile is load-bearing per Wave 1 (3 of daily-core JTBDs are phone-first); rank 12 under-counted morning/evening rhythm. → moved from rank 12. |
| 9 | DL-03 | Founder | Approve a low-risk text_diff in 15 seconds without leaving the keyboard | daily | core | The high-frequency happy path; defines whether the system feels fast. |
| 10 | DL-06 | Founder | Send "request changes" with a specific direction without rewriting the proposal | daily | core | The most-used non-approve verdict; inline anchor + summary is the trust mechanism. |
| 11 | DL-19 / PU-18 | CEO/CPO | Approve a skill change before it propagates to ALL agents | every few days / monthly | core | Highest blast-radius approval the founder can produce — splits from rank 6 because impact-list (which agents/teams) is unique. (adversary-add — split out from merged rank 6) |
| 12 | RE-01 | Founder | Reverse a verdict given by accident (fat-finger A) before the agent acts | weekly | core | Safety net for the highest-frequency action; missing undo erodes trust permanently. |
| 13 | DL-16 / PU-17 | Founder | Reply to / coach the Chief of Staff on cross-product patterns | daily / monthly | core | The pinned thread is the only systemic-improvement surface; load-bearing for trust compounding. |
| 14 | FR-01 / FR-03 | Founder | Bootstrap a new factory and seed the North Star (PRINCIPLES/FOCUS/PORTFOLIO) | once | core | Without this, no agent has direction; gates everything else. |
| 15 | FR-02 | Founder | Connect the model API key so any agent can run | once | core | Hard gate — no key, no factory. |
| 16 | FR-12 | Founder | Walk through the first verdict end-to-end and learn the A/R/X/S grammar | once | core | The verdict grammar is the product; if onboarding fails here, nothing else lands. |
| 17 | DL-14 / DL-15 | Founder | Course-correct a misbehaving agent and/or escalate a recurring issue to CoS | every few days | core | Mid-frequency repair loop; keeps agents trustworthy without firing them. |
| 18 | RE-05 | CPO | Resolve a file-lease conflict between two agents racing on the same artifact | weekly | core | If unresolved, work blocks; concurrent-agent system depends on this. |
| 19 | DL-17 / DL-18 / RE-15 | Founder | Notice trajectory drift on an active bet, drill into stuck task, decide pivot/kill/reshape | weekly | core | Bet-level course correction; the unit of value is the bet, not the task. |
| 20 | PU-14 / FR-15 | CEO | Run weekly bet selection from shaped pitches within capacity | weekly | core | The Shape-Up rhythm; if this fails, the factory has no direction. |
| 21 | RE-25 | CPO | Resolve a "permission denied" / autonomy-too-low blocked thread | weekly | core | The L1–L4 trust model only works if the upgrade-or-deny journey is fast and clear. |
| 22 | DL-21 / DL-22 | CEO/CPO | Triage items routed to my domain (CEO=market/growth/portfolio, CPO=product/design/tech/content) | daily | core | Per-founder routing is how the two-founder model scales. |
| 23 | RE-06 | CPO | Triage a session crash without losing work-in-progress | weekly | core | The system will fail; resume-from-notes vs restart-fresh decides whether work is lost. |
| 24 | RE-07 | CEO | Handle the factory hitting its daily/weekly cost cap mid-day (raise / defer / accept stop) | weekly | core | The decision flow is distinct from cost-watch (rank 7) — has paused-teams list and time-to-reset semantics. (adversary-add — split from merged rank 7) |
| 25 | FR-07 / FR-08 / FR-10 | Founder | Assemble first product team, author its brief, and configure its cycle | once per product | core | Team + brief + cycle is the irreducible "product is real" moment. |
| 26 | PU-10 | CEO | Adjust autonomy levels (L1–L4) per agent per skill as trust grows | monthly | core | The mechanism by which the founder hands more rope; trust compounding has no other dial. |
| 27 | PU-11 / FR-09 | Founder | Set or revise nested cost caps (factory > team > agent) | once / monthly | core | Without this, runaway costs are unrecoverable; pairs with RE-07. |
| 28 | RE-04 | CEO | Recover from approving a skill change that's now causing repeated bad behavior | rare | core | Skill changes propagate to all agents — the highest blast radius the founder can produce. |
| 29 | RE-13 | CPO | Resolve a knowledge edit colliding with an agent edit (version conflict) | monthly | core | Knowledge integrity is the substrate; silent loss here corrupts L2/L3/L4 forever. |
| 30 | FR-24 | Founder | Pause the entire factory (kill switch) so I can stop everything if something is wrong | rare | core | The ultimate safety affordance; users need to know it exists from day one. |
| 31 | PU-07 | CEO | Sunset a product gracefully (knowledge-archive plan + team dissolution + final retro) | rare | core | Multi-step irreversible action with knowledge-archive blast radius — Major because failure leaves orphan agents and lost L2 context. → moved from rank 31 Minor; (was Minor). |
| 32 | ADV-01 | Founder | Reassign a verdict / chat to my co-founder when CoS routed it to the wrong domain | every few days | core | Two-founder model in F-6.4 explicitly relies on routing; without an explicit reassign affordance the only fallback is "reply with @cofounder" which loses thread ownership. (adversary-add) |

## Minor (rank 33–66)

| Rank | ID(s) | Actor | JTBD | Frequency | Value | Notes |
|---|---|---|---|---|---|---|
| 33 | PU-08 | CPO | Hire a new agent type onto an existing team with skills + autonomy | monthly | core | Roster evolution; lower frequency than other "core" so placed in Minor. |
| 34 | PU-16 | CPO | Deep-dive a struggling bet to decide kill/reshape/extend | monthly | core | Companion to RE-15; rank below because RE-15 covers the urgent case. |
| 35 | PU-06 | CEO | Re-rank the portfolio so a fading product gets less energy | monthly | core | Portfolio re-ranking; PU-07 sunset split out to Major rank 31. → moved from rank 31 (split). |
| 36 | PU-05 | CEO | Edit FOCUS.md / PRINCIPLES.md to redirect the factory's monthly target | monthly | core | L4 propagation; rank below FR-03 (which seeds it) because revisions are recoverable. |
| 37 | DL-04 | CPO | Review content_preview for tone and brand voice with paragraph-anchored comments | daily | core | High-frequency CPO loop; rank below text_diff because content review is more forgiving. |
| 38 | DL-07 | Founder | Reply to an agent's chat asking for clarification (credentials, brand judgment) | daily | core | Bidirectional chat is core, but blocking reviews dominate priority. |
| 39 | PU-01 | CPO | Prune stale knowledge so agents don't act on outdated facts | weekly | core | Knowledge hygiene; weekly cadence in Triage view. |
| 40 | PU-02 / PU-03 / RE-21 | CPO | Resolve knowledge conflicts and merge duplicates | weekly / monthly | core | Knowledge curation core; merged because conflict-vs-merge are the same mental model. |
| 41 | DL-11 / DL-28 | Founder | Process the daily digest of FYI items (desktop + mobile) | daily | supporting | Daily ritual; never demands a decision, but its absence creates dread. |
| 42 | DL-23 | Founder | Bulk-approve similar low-risk items in normal flow | every few days | supporting | Daily/weekly bulk action; split from RE-22 (vacation drain) → moved from merged rank 38. |
| 43 | RE-22 | CEO | Drain an inbox after vacation/absence (anxious state, prioritize blocking + risk) | rare | supporting | Distinct emotional context — needs blast-radius badge, blocking-first sort, snooze-all-from-agent. (was Minor, now own slot — split from rank 38) |
| 44 | FR-04 / FR-05 | Founder | Invite the CPO co-founder and accept the invite | once | core | Dropped to Minor because rare and recoverable; still core-value. |
| 45 | FR-06 | Founder | Create the first product (and subsequent products) | rare | core | Once per product; major moment but well-scaffolded. |
| 46 | FR-11 | Founder | Set up notifications (channel, quiet hours, per-product mute) | once | core | Without this, push either floods or never fires; foundational but one-time. |
| 47 | FR-14 | Founder | Install / approve the first skill | rare | core | Per-skill rare event; verdict grammar carries the weight. |
| 48 | DL-08 | Founder | Snooze a non-urgent review with default or custom timer | daily | supporting | High-frequency utility, low blast radius. |
| 49 | DL-13 | Founder | Nudge the order of items facilitators surfaced when priority is wrong | daily | supporting | Founder agency over the Rail. |
| 50 | DL-25 / PU-12 / RE-16 | Founder | Configure quiet hours, per-product mute, per-agent silence | weekly / rare | supporting | Notification discipline; merged because they share the Settings surface. |
| 51 | DL-31 | Founder | Pause an agent that's misbehaving until I can investigate (preserves context) | rare | supporting | Pause split from dismiss — preserves session context and routines. → moved from merged rank 46 (split). |
| 52 | PU-09 | CPO | Dismiss a noisy/low-value agent and reassign its routines | quarterly | supporting | Dismissal is destructive — routines must be reassigned, history archived. Distinct from pause. (adversary-add — split from rank 46) |
| 53 | DL-20 | Founder | Confirm overnight L3/L4 autonomous work didn't go sideways | daily | supporting | Trust compounding requires this spot-check loop. |
| 54 | DL-30 | Founder | Notice the system itself is unhealthy (failed sessions, conflicts) | every few days | supporting | System-stability line in Rail. |
| 55 | RE-08 | CPO | Recover when the model API is unavailable / rate-limited | rare | supporting | Provider degradation; queueing + tier fallback. |
| 56 | DL-12 | Founder | Acknowledge a Rail blocker so it stops blinking without resolving | daily | supporting | Ambient-not-interruptive policy; small but daily. |
| 57 | RE-19 | CPO | Handle quiet-hours-suppressed urgent items the next morning | weekly | supporting | Closes the loop on quiet-hours feedback to agent calibration. |
| 58 | RE-20 | CEO | Reactivate a paused agent and verify nothing was lost | rare | supporting | Companion to FR-24 / DL-31. |
| 59 | DL-24 / RE-16 | Founder | Mute a single noisy agent without going dark factory-wide | every few days / weekly | supporting | Per-agent dial; merged. |
| 60 | RE-17 | CPO | Reverse "approve with comments" once I see the agent ignored my comments | monthly | supporting | Re-open verdict on resolved thread; trust-repair affordance. |
| 61 | RE-09 | CEO | Reject a chat escalation that should never have reached me + tune escalation threshold | weekly | supporting | Calibration loop; agent-side learning. |
| 62 | RE-14 | CEO | Find why an agent did what it did weeks ago (audit trail recovery) | monthly | supporting | ⌘K across resolved threads + audit_trail. |
| 63 | RE-23 | CPO | Override a hard capacity cap when a critical bet must commit (with rationale) | rare | supporting | Shape-Up discipline + escape hatch. |
| 64 | RE-18 | CEO | Revert a Coach-proposed PRINCIPLES.md edit and explain why | rare | supporting | Coach learning loop. |
| 65 | ADV-02 | CEO/CPO | Resolve a founder-disagreement when CEO and CPO post conflicting verdicts on the same review thread | rare | core | Two-founder model has zero documented resolution path; without it the system silently picks one or stalls. (adversary-restored from pruned) |
| 66 | ADV-03 | Founder | Recover from connection loss mid-approve on mobile (optimistic vs hard-fail) | weekly | supporting | Mobile is rank-8 load-bearing; offline behavior cannot be left undefined. (adversary-restored from pruned) |
| 67 | ADV-04 | Founder | Verify an L2/L3/L4 knowledge edit propagated — that next session picked it up | weekly | supporting | The only feedback loop that closes the trust-compounding cycle for knowledge changes; PU-05 mentions a "propagation indicator" but no journey owns the verification. (adversary-restored from pruned) |
| 68 | ADV-05 | Founder | Advance the cycle phase (Shaping → Betting → Building → Cool-down) per product, with confirm | weekly / per cycle | core | UX-5.8 makes this a founder action; PU-13 is config, not the discrete advance. Without this, cycles stall silently. (adversary-restored from pruned) |

## Auxiliary (rank 69–84)

| Rank | ID(s) | Actor | JTBD | Frequency | Value | Notes |
|---|---|---|---|---|---|---|
| 69 | RE-10 / RE-11 / RE-12 | Founder | Recover from "no products / no conversations / no knowledge yet" empty states on first install | once | supporting | First-run empty states; merged because they share the same design problem. |
| 70 | FR-13 | Founder | Walk through guided tour of IconRail / Submenu / Main / Rail | once | supporting | One-time orientation. |
| 71 | FR-16 | Founder | Seed the practice layer (L3) with starter knowledge | once | supporting | Cold-start knowledge; can be skipped. |
| 72 | FR-23 | Founder | Have the first conversation with the Chief of Staff (pinned thread persistence) | once | supporting | Onboarding moment; covered by FR-12 + DL-16. |
| 73 | FR-22 | Founder | Discover global ⌘K search and learn keyboard navigation | once | polish | Power-user discoverability. |
| 74 | RE-24 | Founder | Recover from empty search result / detected knowledge gap | weekly | polish | Topic-gap CTA. |
| 75 | PU-04 | CPO | Split an overloaded knowledge topic into focused items | monthly | supporting | Triage refinement. |
| 76 | PU-21 | CPO | Detect and fill a knowledge gap before agents stumble on it | monthly | supporting | Companion to RE-24. |
| 77 | PU-15 | CEO | Author a new pitch in-app from a market signal | monthly | supporting | Pitch authoring path. |
| 78 | PU-13 | CEO | Configure cycle length and cool-down per product | quarterly | supporting | Cycles config; rare edits after first-run. |
| 79 | PU-19 | CPO | Add or modify a recurring routine (heartbeat task) | monthly | supporting | Routines surface; lower-frequency configuration. |
| 80 | FR-17 / FR-18 | Founder | Switch between factories or re-onboard after fresh install | rare | supporting | Multi-factory + returning-founder. |
| 81 | FR-19 / PU-20 | Founder | Import factory state from Git backup / export factory state | rare / quarterly | supporting+polish | Backup/restore symmetry. |
| 82 | FR-20 / FR-21 | Founder | Switch deployment profile (laptop→VPS) / configure observability backend | rare / once | supporting+polish | Deployer-flavored config. |
| 83 | PU-22 / PU-23 / PU-24 | Founder | Quarterly recalibration: appetite review, cross-team rate, knowledge auto-archive thresholds | quarterly / rare | supporting+polish | Quarterly retrospection cluster; merged because they share the "look back, tune defaults" pattern. |
| 84 | ADV-06 | Founder | Get help when confused about the verdict grammar or a UI element (`?` shortcut, in-app help) | rare | polish | First-run founders WILL get stuck on A/R/X/S; "no help mode" is a real failure path. (adversary-restored from pruned) |
| 85 | ADV-07 | Founder | Inspect what an agent did in a session (read session_notes / replay) when an audit thread isn't enough | rare | supporting | F-2 explicitly stores session_notes + audit_trail; founders need SOME founder-facing surface or RE-14 audit recovery becomes ⌘K-only. (adversary-restored from pruned) |
| 86 | ADV-08 | Founder | Re-onboarding digest after a multi-week absence — "what changed while I was away" | rare | supporting | FR-18 is fresh-install re-onboard; this is the active-factory-but-absent founder. Different content (factory ran without me) vs (factory is new). (adversary-restored from pruned) |

## Open questions for adversary review

These are journeys whose tier or score is genuinely contested. Adversary should challenge:

1. **Rank 6 merges three distinct artifact-kind approvals (action_summary, skill change diff, pricing change).** Should `DL-19 / PU-18` (skill changes) be split out as its own Major journey because skill changes have unique blast radius (propagates to ALL agents, not one product)? Currently merged on grounds that the verdict grammar is identical; counter-argument is that the artifact renderer + impact-list affordances differ.

2. **Rank 7 merges daily cost glance + anomaly spike + cap-hit recovery.** These differ in time pressure (glance = seconds, spike = minutes, cap-hit = decision). Splitting would push three Major slots; merging risks under-designing the cap-hit recovery flow which has the highest blast radius of the three.

3. **DL-26/DL-27 (mobile) at rank 12 — should mobile be a higher tier?** Product intent says mobile is load-bearing for morning/evening rhythm. Counter: desktop is where verdicts get read carefully, and mobile is a constrained subset. Currently Major but not top 5.

4. **FR-13 (guided tour) placed in Auxiliary.** It's once-per-founder but the welcome moment shapes everything downstream. Could be argued into Minor; left in Auxiliary because it can be skipped without breaking any other journey.

5. **PU-09 (dismiss noisy agent) merged with DL-31 (pause agent) at rank 46.** Pause and dismiss are semantically different (pause preserves context, dismiss reassigns routines). If the adversary thinks dismissal is a distinct journey worth its own slot, split.

6. **RE-22 (drain inbox after vacation) merged with DL-23 (bulk approve) at rank 38.** "After vacation" is a different emotional state — users are anxious, want to clear quickly. Could justify its own Minor slot.

7. **PU-07 (sunset product) at rank 31.** Rare but extreme blast-radius (knowledge archive + team dissolution). Could arguably be Major (similar to RE-04). Placed in Minor because it's a controlled, multi-step founder-initiated flow rather than recovery.

8. **No journey for "founder-to-founder handoff / reassign verdict to my co-founder."** PU-23, DL-21/DL-22 hint at it, but the explicit reassign action has no source-ID. If adversary believes this is a real Major journey, it needs to be added (currently in pruned.md as needing product confirmation).

9. **DL-19 / PU-18 (skill change approval) frequency.** DL-19 says "every few days," PU-18 says "monthly." These conflict. Current merge uses "monthly" as the conservative figure; if skill changes are actually every-few-days, this journey becomes higher rank.

## Adversary review log

- ADDED: ADV-01 Founder-to-founder reassign verdict/chat (Major rank 32) — load-bearing for two-founder routing; CoS will mis-route and there must be a fix path.
- ADDED: ADV-02 (was speculation) Founder-disagreement recovery when CEO and CPO post conflicting verdicts on same thread (Minor rank 65) — both are listed approvers; spec is silent on resolution.
- ADDED: ADV-03 Mobile connection-loss mid-approve recovery (Minor rank 66) — mobile is rank-8 load-bearing; offline-first decision means the failure path needs a journey.
- ADDED: ADV-04 Verify knowledge edit propagated to next session (Minor rank 67) — the only feedback loop closing the L2/L3/L4 trust-compounding cycle for founder-driven edits.
- ADDED: ADV-05 Cycle phase advancement per product (Minor rank 68) — UX-5.8 makes founder advance Shaping→Betting→Building→Cool-down a discrete action, not config.
- ADDED: ADV-06 In-app help / `?` shortcut (Aux rank 84) — first-run founders will need it; absence is a real failure mode in FR-12.
- ADDED: ADV-07 Founder-facing session inspection (Aux rank 85) — F-2 stores session_notes; without a founder surface, audit-trail recovery (RE-14) is ⌘K-only.
- ADDED: ADV-08 Multi-month absence re-onboarding digest (Aux rank 86) — distinct from FR-18 (fresh-install); content is "what changed while I was away," not "this is your factory."

- RESTORED: Founder-disagreement recovery (was: Speculation — no defined resolution) — system explicitly allows both founders to verdict; the silent loss case is unacceptable.
- RESTORED: Network loss / offline mobile (was: Speculation — mobile is online-first by decision) — "online-first" is a stance, not a journey; behavior under loss is mandatory if mobile is core.
- RESTORED: Verify L2/L3/L4 propagation of edit (was: Duplicate — covered by PU-05 propagation indicator) — an indicator is an affordance; verifying-it-actually-took is a journey with its own steps.
- RESTORED: Cycle phase advancement (was: Granular — covered by PU-13/FR-10 cycle config) — config sets cycle length; advancing the phase mid-cycle is a separate decision.
- RESTORED: In-app help / `?` shortcut (was: Speculation — no documented help mode) — pruning a missing-feature is the wrong direction; if the feature isn't documented, the journey audit is the place to surface it.
- RESTORED: Agent observation / session inspection (was: Out of scope — developer surface) — F-2 puts session_notes/audit_trail in the data model; non-developer founders need read-only access to those when an agent goes sideways.
- RESTORED: Re-onboarding after multi-month absence (was: Duplicate — covered by FR-18) — FR-18 is "I reinstalled," this is "factory ran while I was gone." Different content, different surface.

- RE-RANKED: DL-26 / DL-27 (mobile) from 12 to 8 — Wave 1 explicitly says mobile is load-bearing (3 of daily-core JTBDs phone-first). Architect's own open question 3 conceded the doubt; the evidence supports the bump.
- RE-RANKED: DL-19 / PU-18 (skill change approval) from merged-with-rank-6 to its own Major rank 11 — open question 1: artifact_renderer + agent-impact-list are uniquely different. Skill change is the highest blast radius approval (propagates to ALL agents). Verdict grammar reuses the keyboard but the surface is different.
- RE-RANKED: RE-07 (cap-hit recovery) from merged-with-rank-7 to its own Major rank 24 — open question 2: glance/spike/decision are different time pressures. Cap-hit has paused-team list, time-to-reset, raise-by-$X-today — none of which apply to a glance.
- RE-RANKED: PU-06 (re-rank portfolio) split from PU-07 (sunset) — they share a view but are different decisions; PU-07 has the destructive multi-step.
- RE-RANKED: DL-23 / RE-22 split — DL-23 stays at rank 42 (normal bulk), RE-22 promoted to rank 43 (vacation drain). Architect's own open question 6 conceded emotional-state difference. Toolset overlaps but priorities (blocking-first sort) differ.
- RE-RANKED: DL-31 / PU-09 split — DL-31 (pause, preserves context) at rank 51, PU-09 (dismiss, reassigns routines) at rank 52. Open question 5: semantically distinct.

- RE-TIERED: PU-07 (sunset product) from Minor rank 31 to Major rank 31 — open question 7. The knowledge-archive plan + team-dissolution + final retro is a multi-step IRREVERSIBLE flow with blast radius equal to or exceeding RE-04 (skill rollback). Rare ≠ Minor when failure leaks lost L2 context.

### Defended (architect was right)
- FR-13 guided tour (Aux rank 70) — considered promoting to Minor on grounds that the welcome moment shapes everything; defended as Aux because it's skippable, FR-12 carries the verdict-grammar weight, and forcing a tour into Minor would imply it's load-bearing which it isn't.
- DL-04 (content_preview review) at rank 37 — considered promoting to Major because it's a CPO-daily-core JTBD; defended as Minor because content review is more forgiving (lower blast radius than action_summary), and CPO has DL-22 routing as the Major slot.
- DL-20 (overnight L4 spot-check) at rank 53 — considered promoting because trust compounding fails without it; defended as Minor because it's a feed-scan, not a decision flow; the load-bearing piece is the feed existing, which is captured in DL-23/RE-22 and DL-11.
- FR-22 (⌘K discovery) at Aux rank 73 — considered promoting on grounds that without ⌘K, audit recovery (RE-14, Minor) breaks; defended as Aux because RE-14 carries the recovery JTBD; ⌘K-discovery is the once-per-founder learning moment.
- PU-23 (cross-team rate quarterly) at Aux rank 83 — considered promoting because cross-team gridlock is a real failure mode; defended as Aux because the gridlock-escalation case (which was pruned as speculation) is the urgent journey; PU-23 is the calm recalibration.

Evidence that would change my mind on the defended items:
- If user research showed first-run founders stall at FR-13 (vs FR-12), promote FR-13 to Minor.
- If actual cap-hit data shows daily-frequency, promote PU-23 / cross-team gridlock to Minor and add a gridlock-escalation Major journey.
