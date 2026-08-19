# AU20 destroyer pass — founder rulings

These override the first-wave verdicts wherever they conflict. Read this before acting on any
verdict file. Rulings 1–3 are premise corrections: they change how a whole class of row should have
been judged, not just the rows named here.

---

## Ruling 1 — This product runs as a SHARED backend. Stop judging it as single-user.

The intended deployment is a shared backend serving a team, and an organisation of several teams.
That deployment surface already exists. Conversation is the core primitive of the product, and
conversation between humans only means anything when there is more than one human.

The first wave repeatedly reasoned from the opposite premise — "no client implements this", "the only
notification surface is a popover in the same window", "a solo founder's agents hammering their own
API is the product working". Those arguments are **void**. Any verdict that rests on the system
having one user must be re-reached.

**What does NOT change:** dead is still dead. A route with no caller, a table with no writer, a
projector that is a no-op — those die regardless of how many humans use the product. The correction
is to the premise, not a grant of mercy. Re-judge; do not spare.

**Access control — the one thing that genuinely dies.** Multi-user access does NOT arrive by
invitation. Identity comes from an **OIDC provider**. So invite-code minting, invite claiming, and
the home-grown login-session/logout machinery are correctly deleted — but they are deleted because
OIDC replaces them, not because the product is single-user. Anything that a shared backend still
needs (identity of the acting human, which team they belong to, what they can see) survives and gets
its identity from OIDC instead.

## Ruling 2 — Events are an extension surface. "No subscriber" is not evidence of death.

A core aspect of this product: **everything that happens emits an event**, and plugins or users
attach their own triggers and actions to those events. Who listens is therefore not knowable from
this repository — an external plugin may.

Consequences:
- **Never delete an event type for lack of an internal subscriber.** That reasoning is invalid here.
- The five event types the first wave killed as "defined, dispatcher-cased, never emitted"
  (`dependency_met`, `bet_revised`, `thread_archived`, `work_selection_requested`,
  `proposed_call_executed`) are **KEEP**. The defect they expose is the opposite of what was
  reported: the event vocabulary is right and the **emission is missing**. The fact happens; nothing
  announces it. Closing that gap is work to schedule, not code to delete.
- The same applies to any other event the wave marked dead on subscriber count. Re-check them.
- This does not protect event *plumbing* that is provably unreachable for other reasons, nor does it
  protect a payload field nothing ever sets.

## Ruling 3 — Knowledge-management ritual leaves the core and becomes a plugin.

Practice meetings, retros, and the rest of the knowledge-management ceremony wired into the system
should not live in core at all. They are exactly what the plugin surface is for: they preconfigure
agents, skills, routines and triggers, and they should ship as a plugin rather than as core tables,
services and routes.

So for anything of that shape the verdict is not plain DELETE but **DELETE FROM CORE → RE-PROVIDE AS
PLUGIN**, and the row must say which it is. Identify every such feature; the boundary question to ask
is "is this the machinery of working, or is it a ritual *about* the work?"

**No work package exists for this yet.** A search of every track registry found none — the nearest
neighbours are a knowledge-navigator item and one about re-providing auto-decompose as a default
trigger. One needs writing.

---

## Per-feature rulings on the half-wired list

| # | Feature | Ruling |
|---|---|---|
| A1 | Approve an agent's risky action, then let it act | **FINISH.** Wire the approval so it actually mints the one-time permission. Everything the first wave listed for deletion under this feature is now KEEP. |
| A2 | Automatic review after risky work | **DELETE.** Confirmed. The risk-tier reader, the table, the port member and the gate all go. |
| A3 | Per-model options | **RESHAPE.** Per-model options belong in the **agent's configuration**, where they are valuable. As per-message composer pills they are not valuable. Delete the pill path; keep the option concept and move it into agent config. |
| A4 | Rich conversation content | **RESHAPE — and this is a product gap, not a deletion.** There should be a **live session surface you can dial into** and watch an agent work as it happens. That surface is valuable. The renderers the first wave called Storybook fiction are the *right* half; the missing half is a producer that emits real reasoning/streaming/tool-status content, and a place to watch it. Today `SessionView` and `SessionActivityPanel` exist as components but there is no session page. Do not delete the renderers. |
| A5 | Filesystems that need credentials | **FINISH.** Make the resolvers real so an authenticated mount works. |
| A6 | Task dependencies | **FINISH.** Bet decomposition was the wrong shape, but tasks genuinely should carry a dependency tree: finishing a task unblocks its dependents **and moves them into progress** automatically. Rebuild with a real writer. |
| A7 | Shared backend | **FINISH, reshaped.** See Ruling 1. Shared backend is needed; access is via OIDC; invites are not the mechanism. |
| B | Everything else on the half-wired list | **DELETE**, except the declared events — see Ruling 2. |

---

## What the re-audit must produce

For every package whose first-wave verdict leaned on a voided premise, a revised verdict file that:

1. States which rows changed and why, naming the ruling.
2. Keeps the same no-sampling standard — every export still carries a verdict.
3. Uses the extra verdict value **`PLUGIN`** where Ruling 3 applies (delete from core, re-provide as
   a plugin), so those are countable separately from plain DELETE.
4. Uses **`FINISH`** where a ruling says the feature is to be completed rather than removed, so the
   work is countable and cannot be mistaken for a survivor that needs nothing.

The "if written today, from scratch" section stays — the founder called it out as the most useful
part of the first wave. Keep writing it, and write it against the corrected premise: a shared
backend, used by a team, with OIDC identity and an event stream plugins hang off.
