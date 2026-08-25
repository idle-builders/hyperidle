# BA1 — live proof against the running app

Run by the coordinator on 2026-08-25, after the review fixes, on branch `plan/BA1-refinement`.
Everything below was executed against the real server and a real database, not a fixture.

## The upgrade path that the review found broken

Built a genuine pre-BA1 database — every real journalled migration up to and including `0058`, nothing
hand-written — then seeded it the way a real deployment looks: two teams, one agent, and the per-team
builtin routines (`builtin:portfolio-retro:t1`/`:t2`, `knowledge-decay:t1`/`:t2`,
`knowledge-promotion:t1`/`:t2`, `post-bet-retro:t1`). Seven routine rows.

Ran the real migrations forward.

| | result |
|---|---|
| upgrade | `{"applied":2,"schemaVersion":61}` — no abort |
| routines after | 7 → 4 |
| the three global builtins | deduped to one row each, as D7 specifies |
| `post-bet-retro:t1` | still per-team, `event_type` backfilled to `bet_state_changed` |
| columns | `prompt` + `event_type` present; `description`, `skill_id`, `team_id` gone |

This is the case that aborted before the fix, and the case no automated gate exercised — a fresh database
has no builtin rows, so the failing INSERT was a no-op.

## The founder's ruling, proven on the running server

1. Started the server. Routine scheduler starts clean on the upgraded database.
2. **Created an event routine while the server was already running** — the thing that could not work under
   the boot-time subscription list.
3. Created a team, emitting `team_created`.
4. The routine fired: `lastRunAt` set, seconds after the event. No restart anywhere.

Then the other direction:

5. Paused the routine, emitted the same event again, and `lastRunAt` did **not** move. Pause takes effect on
   the very next event.

## The rest, live

- `GET /api/routines/event-types` returns **34** event types, including `bet_state_changed` and
  `team_created` — neither of which a trigger rule could ever name. The six-name vocabulary is gone.
- Posting a routine with the removed `doneCondition` field returns **400**, and with `teamId` returns **400**.
  `.strict()` rejects rather than silently stripping, which was the whole point of NB2.
- Registering a human scaffolds their assistant with `ownerUserId` set to that human's id and `teamId` null.
  The `ast-<user-id>` naming convention is no longer the only link — that was blocking finding B2, and it is
  closed.

## Paint check

`evidence/routine-detail-event.png` — the routine detail page for an event routine, rendered live.

Confirms in painted output: the field is labelled **PROMPT** and shows the prompt text (D1/D3);
**SCHEDULE** reads *"On bet state changed"*, not the bare string "On event" (D8's derived label, N9);
**TRIGGER TYPE** reads *Event* and **NEXT RUN** reads *"On next event"*; and **no cron picker is rendered**,
which was N7. The owning agent is *Belonging Proof's Assistant* — an individual, team-less agent owning a
routine, which is the D4/D5 nullable-team case working end to end.

`evidence/work-overview.png` — the work overview on the same running app.

## One documentation error found here

Architecture §9 and the review both cite the routine detail route as `/work/routines/<id>`. The real route is
singular — `/work/routine/:routineId` (`layers/core-ui/src/router.tsx:85`). The plural path renders the
"Page not found" card. Anyone following §9's screenshot step verbatim would have photographed a 404 and, if
they did not look at the image, called it done.

---

## Second pass: driven through the UI, not the API (2026-08-25)

The first pass used the HTTP API. Redone through the running app's own interface, because an API call is
not the product.

**Setup note.** The setup wizard requires a model credential before it will start a workspace, and no
credential was entered. The workspace and team were seeded through the API; everything BA1 changed —
creating routines and watching them fire — was done in the interface.

**Both routines were created through the "New routine" dialog.**

The dialog is the BA1 shape: a **Prompt** field labelled *"Instruction for the agent when this routine
fires"*, an owning-agent picker, and a **When** switch offering *On a schedule* or *On an event*. There is
no team picker — scope comes from the owning agent (D5). Choosing *On an event* swaps the schedule control
for an event picker (N7's fix), and that picker offers **34** events, `bet_state_changed` and
`team_created` among them.

| routine | created via | fires on | result |
|---|---|---|---|
| UI timer routine | the dialog, custom cron `* * * * *` | the clock | fired — *just now* |
| UI event routine | the dialog, event `knowledge_created` | creating a knowledge item in the UI | fired — *just now* |

Both were created while the server was already running, and both fired without a restart. The event one
fired seconds after a knowledge item was written through the Knowledge page.

Evidence: `evidence/ui-routines-fired.png`.

**Two label gaps this pass found, neither blocking:**

1. `Post-bet retro` renders as **"On event"** rather than "On bet state changed". Freshly provisioned
   builtins leave `event_type` null — the final review recorded that as untidy data on the grounds that
   the matcher excludes builtins anyway, which is true. But the label is derived from that column, so the
   consequence is user-visible: the one builtin that fires on an event is the one that cannot say which.
2. A **custom cron** renders as the bare word **"Calendar"**. The presets humanise ("Every day at 2:00 AM");
   a custom expression falls through to the trigger type.

**Not tested, and not testable here: installing and removing plugins.** That is BA9, not BA1 — no install
path exists yet, and nothing has ever written a `plugins` row. "Install a plugin and watch the agents work"
is BA9's proof to meet, and this work package cannot stand in for it.
