# Census — what the docs say we offer

**124 distinct offerings.** Work 31 · Knowledge 20 · Conversations 17 · Review 13 ·
Agents/Org 11 · Settings 14 · Notifications 10 · Shell 8.

## The important finding

Parts of the target model are **already written in the docs and simply not built**.

- `human-interface-layer/notification-primitive.md` hard rule 4 requires **per-user mute**.
  Built: a factory-wide `server_config` singleton.
- `human-interface-layer/thread-primitive.md`: "Agents and humans are equal participants:
  either can initiate a thread to the other." Built: humans via RecipientPicker →
  `POST /threads/direct`, agents via tools. Two paths.
- `policy/handoff-and-lifecycle-propagation.md` §1.4: "Handoff to a human is the same shape
  as handoff to an agent." Built: agents get `POST /tasks/:id/handoff` with structured
  metadata; the human side is "the human replies", no handoff record.

So this isn't only a build-out. It's also a **claims audit** — the docs assert parity the
code doesn't deliver.

## Described but not built (12)

`PATCH /artifacts/:id/preview` · enable/disable an agent backend · send mid-session /
queue / cancel / Stop · composer "+" actions (attach, insert block, mention, reference) ·
answer a quick question (questionnaire) · draft a bet from the assistant thread ·
remove a team member / dissolve a team · bet-level ship review gating · session cost filter ·
per-user notification mute · routine delegation when an owner is overloaded ·
git export of knowledge.

Route exists but no surface: quiet hours / digest / channels · knowledge merge and split ·
connection validate.

## Human and agent described asymmetrically for the same act (11)

| Act | Human | Agent |
|---|---|---|
| Author knowledge | lands `active` immediately | lands `captured`, needs promotion |
| Mint a draft bet | form-first `POST /bets` | `create_bet` that never commits |
| Change a task's state | *"Humans do not drag tasks between states — they request through the thread"* | transitions directly |
| Initiate a thread | RecipientPicker → `POST /threads/direct` | `reply` / item tools |
| Cast a verdict | the verdict route | policy engine writes `approve` as `policy_engine` |
| Hand off work | "the human replies", no record | structured route with metadata |
| Produce an artifact | cannot — ever | the sole producer |
| Promote knowledge | `v` in Triage, or scope change | repetition auto-promotion |
| Write a retro | outcome + AI draft on the bet page | `builtin:post-bet-retro` review item |
| Read a stream of parts | one shared `PartList`… | …but session activity may never render as Parts |
| Own a filesystem | founder registers, injects, ejects | a bot authors what is injected to it |

The task-state row is the one to note: a doc **states the asymmetry as the design**. Under
the new model that line is wrong and has to be rewritten, not just implemented around.

## Doc contradicts doc (13)

assistant thread pinned vs overlay · assistant bet drafting works vs non-functional ·
notification popover-only vs a top-level inbox destination · knowledge status vocabulary
(4-value vs 7-value, and `draft` exists in one) · knowledge scopes (three vs four pills) ·
bet appetite (mutable field vs rejected at the boundary with 400) · agent categories
(three vs two) · settings section count (11 vs 12 vs 13) · session dial-in tabs (Cost tab
vs "spend is not tracked anywhere") · does a session have a cost (yes vs no columns) ·
ArtifactView shapes (deleted vs closed at five) · adding a team member (review item vs a
direct button on an unmediated `POST /agents`) · is the trust gate reachable (presented as
a user-visible surface vs "no production caller").

## Likely superseded — flagged, not asserted

`process-layer/staged-operation.md` (repo-known-wrong) · `agent-model.md` §3.2 strategy
agents (category removed) · `facilitators.md` git-export sketch · `the-five-layers.md` L2
framing · `content-examples-for-design-reference.md` (retired shapes) ·
`human-interface-layer/decisions.md` (stale settings list).
