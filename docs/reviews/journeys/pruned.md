# Pruned Journeys (Wave 2)

Kept here for inspection — these are NOT in the audit scope but were considered.

| Source ID | JTBD | Reason for pruning |
|---|---|---|
| FR-?: Tutorial / sandbox factory (Wave 1 open question) | Practice the verdict grammar without spending tokens on a demo factory | Out of scope — not specified in REQUIREMENTS or HUMAN_INTERFACE_LAYER. Implied by ETHOS but not on roadmap. |
| FR-?: First-run sample data toggle (Wave 1 open question) | Seed Ambrovia/Nimmly/HyperIdle as fixtures on `bun dev` | Out of scope — unclear product intent; treat as deployer config, not founder journey. |
| FR-?: Privacy & data-residency consent (Wave 1 open question) | Explicit consent for "your data lives at this SQLite path" | Speculation — Tailscale-only default exists but no documented consent step. |
| FR-?: Mobile pairing / QR code (Wave 1 open question) | Pair phone to existing factory via QR | Speculation — no documented pairing flow; PWA install is browser-native. |
| FR-?: Founder profile / avatar setup (Wave 1 open question) | Upload avatar | Too granular — sub-step of identity setup, not a distinct journey. |
| FR-?: First-run telemetry opt-in (Wave 1 open question) | Opt into HyperIdle usage telemetry | Out of scope — no documented telemetry collection for the product itself. |
| FR-?: Skill marketplace browsing (Wave 1 open question) | Browse a skill catalogue surface | Out of scope — UI_DESIGN does not define a skill catalogue. Skills install via files today. |
| FR-?: First push notification permission grant (Wave 1 open question) | Grant browser-level web push permission | Too granular — sub-step of FR-11 notifications setup. |
| FR-?: Re-onboarding after multi-month absence (Wave 1 open question) | "What changed while I was away" digest for returning founder | RESTORED — see catalog.md ADV-08 (Aux rank 86). FR-18 is fresh-install re-onboarding; multi-week absence with active factory is distinct. |
| DL-? Self-routing / "send this to my partner founder" (Wave 1 open question) | Manually reassign a verdict to the co-founder | RESTORED — see catalog.md ADV-01 (Major rank 32). Two-founder routing per F-6.4 cannot work without a reassign affordance; CoS will mis-route. |
| DL-? Daily search across threads/artifacts (Wave 1 open question) | Mid-day search as a daily JTBD | Duplicate — covered by ⌘K affordance (FR-22) and audit recovery (RE-14); not a distinct daily journey. |
| DL-? Reading agent-to-agent threads I'm cc'd on (Wave 1 open question) | Proactively read cc threads | Speculation — product intent says humans only enter when escalated; cc-thread browsing isn't a journey. |
| DL-? Snoozed thread return notification (Wave 1 open question) | Notification when snooze fires | Too granular — sub-step of DL-08 (snooze). |
| DL-? Catching a deadline about to slip (Wave 1 open question) | Daily "what's about to slip" surface | Out of scope — F-2 has optional deadline; no current "about to slip" surface in the doc set. PM facilitator's job. |
| DL-? Manually triggering an L4 routine (Wave 1 open question) | "Run the cost retro now" | Too granular — covered by routine config (PU-19). |
| DL-? Verifying agents picked up a knowledge change (Wave 1 open question) | Confirm L2/L3/L4 propagation of an edit | RESTORED — see catalog.md ADV-04 (Minor rank 67). An indicator is an affordance; verifying-it-took is a journey with discrete steps and is the only feedback loop closing trust-compounding for knowledge edits. |
| PU-? Direct retro browsing (Wave 1 open question) | Founder browses past retros directly | Speculation — retros route to Practice + Coach; no founder-facing retro list documented. |
| PU-? Cycle phase advancement (Wave 1 open question) | Advance Shaping → Betting → Building → Cool-down | RESTORED — see catalog.md ADV-05 (Minor rank 68). Per UX-5.8 founder triggers phase advance — discrete decision, not config; PU-13/FR-10 set length, not advance. |
| PU-? Founder-to-founder handoff (Wave 1 open question) | Reassign review to co-founder | RESTORED — see catalog.md ADV-01 (Major rank 32). Same JTBD as DL-? self-routing. |
| PU-? Knowledge import as a journey (Wave 1 open question) | Seeding from prior tooling | Duplicate — covered by FR-19 (import from Git). |
| PU-? Skill authoring by founders (Wave 1 open question) | Founder hand-writes a SKILL.md | Out of scope — S-4.4 says humans approve, agents author. |
| PU-? Agent observation / debugging / session replay (Wave 1 open question) | Inspect/replay session as a developer surface | RESTORED — see catalog.md ADV-07 (Aux rank 85). Founder-facing read-only inspection of session_notes/audit_trail (per F-2 data model) when a thread alone isn't enough. Distinct from a developer's full replay UI. |
| PU-? Audit / compliance quarterly report (Wave 1 open question) | "Show every irreversible action approved this quarter" report | Out of scope — no documented compliance view. RE-14 covers individual audit recovery. |
| RE-? In-app help / `?` shortcut (Wave 1 open question) | Confused user gets help | RESTORED — see catalog.md ADV-06 (Aux rank 84). Pruning a missing-feature is wrong direction; first-run founders WILL get stuck on A/R/X/S without it. |
| RE-? Network loss / offline mobile (Wave 1 open question) | What user sees when connection drops mid-approve | RESTORED — see catalog.md ADV-03 (Minor rank 66). Mobile is rank-8 load-bearing; "online-first by decision" is a stance, not a journey — failure path must be defined. |
| RE-? Account recovery / lost device (Wave 1 open question) | Recover after losing Tailscale auth or device | Out of scope — Tailscale auth is deployer concern, not founder UI journey. |
| RE-? Agent rebellion / loop detection surface (Wave 1 open question) | Dedicated "agent health" view | Speculation — covered by Conversations + RE-02 today; dedicated surface not documented. |
| RE-? Knowledge import/export rollback (Wave 1 open question) | Restore knowledge store from snapshot | Speculation — no documented snapshot restore. |
| RE-? Cycle phase advance regret / undo (Wave 1 open question) | Undo a too-early phase advance | Out of scope — no undo journey defined in source docs. |
| RE-? Cross-team task gridlock escalation (Wave 1 open question) | Escalate gridlock when providing team is over-cap and refuses | Speculation — current docs assume goodwill; PU-23 covers structural rebalance. |
| RE-? Founder-disagreement recovery (Wave 1 open question) | CEO and CPO post conflicting verdicts on same thread | RESTORED — see catalog.md ADV-02 (Minor rank 65). Both founders are listed approvers; silent loss of one verdict is unacceptable. |
