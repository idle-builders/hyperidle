# CONTINUE HERE — one user substrate

Read this first. Then `ACTIONS.md`. Everything else in this folder is evidence behind it.

Branch `feature/agent-human-parity-audit-c90fe1`, cut from `origin/main` @ `f88b71434`
(2026-09-10). Worktree `.claude/worktrees/pipeline-au3-cb22bc`. All artifacts committed and
pushed. **Rebase before trusting any code claim — main moves fast; 23 commits landed under
the first pass and invalidated half of it.**

## Where we are

The audit is done and the target surface is settled. What remains is the evolution path:
how the codebase gets from 126 routes / 20 tools / 31 events to 17 actions / 9 events,
in what order, and what has to be true before each step is safe. That is the next step.

## What's settled — do not reopen

**One user.** Agent and human are the same user; `kind` is representation only. The test:
you can't tell which is which without looking at `kind`.

**Tools first, UI follows.** Humans are more capable than agents. Design the agent's list;
build the UI to the same structure. Designing like a desktop app is how this fails.

**An action is a sentence a person would say.** Not a route (a fragment), not a god-tool (a
bundle). The list is what the agent reads. Readable names and descriptions are what make
tools separable — not fewer tools. Research: ~14 distinguishable tools is the ceiling;
overlap, not count, is the constraint; prose alone moves outcomes ~20%.

**Seventeen actions** (`ACTIONS.md`):

| task | search · open · edit |
|---|---|
| conversation | search · open · send a message · adjust |
| document | search · open · edit |
| person | search · open · edit |
| session | see what's running · watch · stop |
| platform | manage plugins |

Every edit is a whole-object upsert. Sending a message with an existing id overwrites it.

**Nine events:** `task/conversation/document/person` × `created`/`changed`, plus
`conversation.message`. No read events. Eight platform events stay on the bus, off the
surface. Eight are deleted.

**Rulings, each confirmed by the founder:**
- Team is an attribute on a person and a filter on the people list. Not an object.
- Routines are **subscriptions on a person**. An agent's subscription runs a document; a
  human's sends a notification. Same mechanism, same vocabulary. Mute = pause a subscription.
  "Run now" = send that person a message. No routine object.
- Setup dissolves. Connections, folders, backends, defaults are person attributes.
  Plugins are the only platform thing; the one surviving key (`shared_backend_key`) lives with them.
  Defaults are plugin contributions with user overrides — the config layer already models this.
- The attention mechanism is deleted entirely: routes, `score_attention` tool, engine.
  "What's proposed needs attention" — nothing is scored.
- `items` becomes a message kind. `GET /recipients` becomes search people.
- No "start a session." A person gives work — edit a task, send a message. We are a
  workspace tool, not a harness.
- Files are files. Agent: its filesystem. Human: git/S3/Drive/local. Never an object.
  Folders sit on the person as a placeholder until the folder/filesystem/workspace redesign.
- Default install ships with nothing: one agent, one subscription to everything, empty
  prompts. Every opinion (role catalog, prompt templates, team scaffolding) moves to a plugin.
- Scope is global > team > user. Within reach everything is on by default; you switch things
  off. Spam control and ownership, not security. **Never** an empty-by-default permission list.

**Validation becomes the key piece.** Today a check lives in whichever route touches it —
which is why Triage skips the conflict check the agent's route enforces. Under one edit per
object, validation is an invariant on the object's state after the patch. The same invariant
answers "may this happen" and "is this button enabled" — the UI's affordance logic and the
agent's valid-tool list are one function. Services collapse to one `edit` per object: apply,
check invariants, emit `<object>.changed`. Founder expects ~100% rewrite.

## Roadmap, as the founder states it (2026-09-11)

1. Service & layer split — done (AU track).
2. **Interface restructure — now.** Actions & events are the domain contract between the
   user (UI and MCP) and the backend. That contract is settled (`ACTIONS.md`). The open
   question is **the layer below it**: does the current route shape and service shape make
   sense as-is, or does another route shape or another interface technology (GraphQL, tRPC,
   MCP-as-API, …) fit better? What is the simplest setup that enables this interface?
   Simplification and destructive rework are in scope. Research first (`research/`), then decide.
3. UI rework, and possibly the whole "what is the agent's workspace" — after.

Answered 2026-09-11: `LAYER-BELOW.md` (the shape, the evidence, the decisions) and
`EVOLUTION-PATH.md` (seven steps, rewritten against it). Founder: technology is not their
decision; robust and simple; deleting down through the services is success.

## What's next — the evolution path

**Produce:** an ordered list of changes. For each: what it deletes, what it builds, what must
already be true, how it's verified, and what it unblocks. Not a design of the actions — that's
done. The order and the safety of each step.

**Constraints from the repo:** migrations are full and destructive, no compat layer, no
dual-write, no dead code left behind (CLAUDE.md rule 2). Validation before implementation.
Under 1,000 lines per change or stop and ask. Deletions never count.

**Candidate order — a draft to test with the founder, not a plan:**

1. **Delete first.** 22 routes, 8 events, 14 dead UI controls, the attention engine,
   `framework/domain-model/src/events.ts` (stale fork), the `items` reasoning-marker path.
   Pure reduction. Lands alone, verifiable by the suite going green with less in it.
2. **The declaration.** How an action is declared once and projected to a route, a tool, a UI
   affordance, and a lint check. This is the foundation everything else is built on and the
   thing that has never existed. Small, but every later step depends on its shape.
3. **One object end to end — task.** Three actions, one service `edit` with invariants, one
   tool each, UI following. Proves the pattern on the simplest object before touching the
   others. Task already has the fewest legacy shapes (bets are gone).
4. **Conversation**, including `items` → message kind and the message-overwrite rule.
5. **Document**, including the rename from knowledge item, the tree, and merge/split/status as
   edit fields. Biggest object; most legacy routes.
6. **Person**, including subscriptions (which kills routines and notifications as separate
   systems — needs a recipient on the queue and per-user mute), the setup attributes, and
   the plugin-contribution defaults.
7. **Session and plugins** — small.
8. **Move the opinions out** — role catalog, prompt templates, team scaffolding → a plugin.
   Can go anywhere after 2; listed last because nothing depends on it.

Open questions the path must answer: does the rename (knowledge → document) go first or with
step 5; does the UI rebuild per object or after all four; what the lint rule actually checks
and where it runs; what happens to `context assembly` (a real construct, keep it) when the
objects it bakes change shape.

## How the founder works — read before the first message

- **Plain language, extremely concise.** No preamble. Drop filler. They interrupt long messages.
- **One question at a time** in chat. Never a batched picker.
- **Do not argue from invented concepts.** The service structure is the only thought-out part
  of this system; everything else is accumulated invention. Either research it on the web
  (recent, cited, tiered by evidence) or interview them about what they consider valid.
- **They edit the files directly.** Check for edits before overwriting. Read, don't assume.
- **They want the surface reduced.** When in doubt, delete.
- **Verify against code, not docs.** Docs contradict each other in 13 places (see
  `census/docs-intent.md`). Never trust a repo note; test it.
- Context assembly is deliberate and stays. Do not call it sprawl.

## Not yet touched

- The UI side of every action — what "search tasks" looks like on screen. Not designed.
- The folder / filesystem / workspace redesign. Placeholder only.
- Whether `GET /search` is one cross-object search or four.
- Notification read/seen — person attribute or UI-only state.
- What the lint rule concretely enforces.
- The identity literature (`research/dual-surface-patterns.md` §4) argues agents should be
  principals, not user rows. Founder's model says one row. Not resolved; noted, not blocking.

## Files

| File | What |
|---|---|
| `ACTIONS.md` | **The reference.** 17 actions, 9 events, all 126 routes mapped. Founder-edited. |
| `one-user-substrate-concept.md` | The model in full, with the default-install section. |
| `target-surface-merge.md` | The 79 capabilities tested against the surface. |
| `target-interface-surface.md` | Founder's original draft and the corrections to my framing. |
| `CULL-LIST.md` | Keep/fold/delete per capability, rebased. |
| `agent-human-reach-parity-audit.md` | The first pass. Partly superseded; the *why* still holds. |
| `census/` | UI actions, events, notifications, docs-intent — the raw sweeps. |
| `research/` | Two web-research reports, tiered by evidence, with sources and dates. |

Memory: `project_one_user_substrate_target_surface.md` holds the settled model.
