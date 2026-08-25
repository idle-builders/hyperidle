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
