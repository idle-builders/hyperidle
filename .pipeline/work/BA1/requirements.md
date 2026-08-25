# BA1 — Requirements

Refined 2026-08-24/25 with the founder, in the same pass as BA9. Checked against `main` at `115c54764`.

**DOC-CLASS: update** — `docs/process-layer/routines-and-retros.md` describes routines as a thing with a
skill and a done-condition, and `docs/agent-layer/agent-model.md` describes an agent's scope as a team or
nothing. Both become false here.

## What this is worth

Someone writes down "when this happens, run that agent with this prompt" and it happens. That sentence is
how the product is extended without changing it, and it is the sentence a plugin speaks. Today the
product accepts the sentence, saves it, shows it back, and never acts on it.

The impact is not only the missing behaviour. It is that the product offers a working-looking control
surface that does nothing, so someone configures a trigger and waits for an agent that will never run.

## The decision this refinement made

**There is one primitive, not two: a routine. A routine fires on a clock or on an event.**

The product has two ways to say the same sentence. One is the trigger rule: a Settings tab, a validated
entity, six event names — and no reader anywhere, confirmed by git archaeology recorded in
`layers/agent-orchestration/session-requests/src/service.ts:1094`. The other is a routine with an event
trigger, which subscribes to any of the 33 event types and actually fires.

Rather than build a read path for the dead one, the live one absorbs it. Founder ruling: *"a routine is
the umbrella noun, and a routine fires either on a clock or on an event"* and, on the choice between
them, *"I think in the past we had routine and trigger rule separate, but maybe combining it is UX-wise
easier — since in both cases you have a trigger (time or event) + agent + prompt."*

### Why the merge is the cheaper side, in evidence

| | Routine — works today | Trigger rule — no reader |
|---|---|---|
| Fires on | a clock, or any of the **33** event types | one of **6** event names |
| Which agent | `ownerAgentId` | `agentId` |
| What to do | `skillId` + `doneCondition` | free-text `prompt` (≤12k) |
| Scope | one team, required | optional team / user / source |
| Several match | each row fires on its own | a `priority` field |
| Did it fire? | `routine_runs`, `lastRunAt`, `lastRunSummary` | nothing recorded |
| Controls | pause, delegation, human review, silent | none |
| Where edited | Routines pages + detail pane | the Triggers tab |

Three of this work package's five acceptance criteria are satisfied by the merge itself rather than by
new code: several matches are defined and repeatable because each routine is its own row and fires on its
own; a missing agent is a visible failure because a routine's `state` goes to `error`; and "has it ever
fired" is already answered by `routine_runs`.

## The three changes that follow

### 1. A routine carries a prompt, not a skill

`skillId` is written by the four built-in specs and **read by nothing** — no code anywhere uses it to
decide what a routine does. So this is not a swap of one field for another; it removes a column that never
worked and puts a real instruction where it was pretending to be.

Founder, on the loss: *"the prompt can anyway reference a skill and the agent will be able to access that
skill, so nothing is lost with this swap."*

### 2. Scope comes from the agent, never from the routine

An agent already carries most of its scope: `users.teamId` is set for a team agent and null for a
factory-wide one. `routines.teamId` duplicates that — and the duplicate is what causes a live defect. A
routine that is global in intent is seeded once per team, so a daily global sweep runs once per team.
That defect is recorded in BA9 and is fixed here, at its cause, rather than there.

What the agent does **not** carry is a person. Every human gets their own assistant at registration
(`layers/core-api/src/routes/users.ts:130`), but the only thing tying that agent to that human is the id
string `ast-<user-id>`. A naming convention is doing a foreign key's job, so "when *my* task is accepted,
run *my* agent" cannot be expressed.

**Decision: an agent belongs to a team, to a person, or to neither, and that belonging is a real field on
the agent row.** A routine then declares no scope at all and inherits its owner's. `routines.teamId` goes.

### 3. The belonging lives on the agent row, not in the org map

The org map already models the same three targets — an edge is `direct` (a person), `function` (a role) or
`team` (`ORG_EDGE_MECHANISMS`). The founder's original intent for it was exactly this. But what it holds
today is the founder's own connections: team creation writes one founder→team edge, best-effort, with the
failure swallowed so team creation still succeeds.

Founder: *"let's start with the agent row, we can always get more complex later."* Belonging is exactly one
answer per agent and is read on the hot path; the org map is many edges per person and is decorative today.
The org map draws from the belonging rather than storing it.

## What is in scope, and what is not

**In scope.** One routine primitive that fires on a clock or an event; a prompt on a routine; retirement of
the trigger-rule entity, its schema, its six-name vocabulary and its Settings tab; belonging on the agent
row; removal of `routines.teamId`; and a global routine running once rather than once per team.

**Not in scope.** New event types — that is BA8. Emitting facts that do not announce themselves — BA8.
Conditional or chained routines. A plugin distribution mechanism. Signing humans in, which is BA7, even
though it shares the belonging field. Anything about facilitators: **do not design for them** — founder,
*"facilitators are being killed as part of the BA work package, those are a bug in their existence."*

## Load-bearing nouns

**Routine.** The one thing that says "when X, run agent Y with prompt Z". X is a clock or an event. It
belongs to whoever owns it and inherits that owner's scope. It records every firing. Rejected reading: a
routine is time-based and a trigger is event-based — the founder considered and dropped that split, because
both carry the same three parts.

**Trigger.** Not a noun in its own right after this. It is the event-fired case of a routine, and the word
survives only as the name of the condition, never as a separate entity a person configures.

**Belonging.** One answer per agent: a team, a person, or neither. Not a permission, not a category, not a
membership list. `agentCategory` stays what it is and does not become this — refer to BA9, which is
removing a category that quietly grew into a permission.

## Success, mapped to the acceptance criteria

| AC | How it is met |
|---|---|
| A configured rule causes the named agent to run with the given prompt | The routine path already runs the owner agent; the prompt becomes the instruction it bakes. |
| Several matches are defined and repeatable | Each routine is its own row; each fires and records its own run. No priority field, no arbitration. |
| No match leaves today's behaviour unchanged | The default eligible agent still runs with no event-specific prompt. The existing fallback entry stays. |
| A missing agent fails visibly to whoever configured it | The routine's `state` goes to `error`; it is visible on the routine's own page. |
| A person can tell whether it has ever fired | `routine_runs`, `lastRunAt` and `lastRunSummary` already record it. |

## What a plugin contributes, and why this matters to BA9

Plugin configuration already accepts a `routine` kind — `CONFIGURATION_KINDS` is `agent`, `skill`,
`routine`, `trigger`, `tool`, `mcp_server`, `harness_descriptor`. So a plugin contributes **routines**, and
the `trigger` kind retires with the entity. BA9's knowledge-management plugin therefore ships routines
against the real event union rather than against a six-name list, and BA9's open question about which
vocabulary survives is answered here: the six-name list dies with the entity it validated.

## Questions raised, and the founder's answers (2026-08-25)

1. **Existing saved trigger rules.** *Answered: delete them.* Founder: *"we can delete all trigger data, no
   relevant instances exist."* So no migration path, no notice, no compatibility window — the configuration
   overrides of kind `trigger` are dropped along with the entity, and the `trigger` member of
   `CONFIGURATION_KINDS` and its check constraint go with them.

2. **A routine added while the app is running.** *Answered: a restart is fine for now.* At boot the app
   reads the routines in the database and subscribes each event-fired one to its event; that list is built
   once. A routine added afterwards — by a person, or by installing a plugin — does not listen until the
   next start. Founder: *"yeah for now that's fine."* This is a **known, accepted limitation**, not an
   oversight: state it wherever a plugin is installed, so nobody waits for a routine that is not yet
   listening. Making it live is a later work package, not this one.

3. **Which agents belong to nobody.** *Answered: not ours to decide.* Founder: *"no clue which global
   agents exist, but that's something that users and plugins will define for themselves."* So "belongs to
   neither" is a supported value that this work package must allow and must not populate. Do not seed a
   global agent, and do not reason from the facilitators — they are a bug in their own existence and BA9
   removes them.

## Proposed plan amendment

`plan.md` describes this work as building the missing read path for the trigger entity. After refinement it
is the opposite: the entity retires and the live path absorbs it. Everything above was decided with the
founder in session, so the plan should be re-read as a merge rather than a build. Recorded here rather than
silently rewritten; see the note at the top of `plan.md`.
