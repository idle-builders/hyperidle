# cron — destroyer verdict (framework)

## Where does this package go?
**Verdict: DISSOLVE → `layers/core-api/routine`**

Is this a cron-expression parser nobody needs? No — calendar routines are product-real:
`RoutineCreateDialog.tsx` creates `triggerType: "calendar"` routines from the UI, the
`create_routine` agent tool requires a cron expression, and the routine scheduler computes next-run
times from it. The parser earns its life. What does NOT earn its life is the package boundary, and
the reason is that two of the three consumers should not be doing cron work at all:

1. `routine-scheduler.ts` (core-api/routine) — the owner. Parses cron, computes `nextRunAt` on
   tick, reschedule, and run-completion. This is the concept's home.
2. `routines-routes.ts` (core-api root) — computes `nextRunAt` BEFORE inserting a routine
   (lines 144–159). Owner-derived state computed outside the owner.
3. `tool-definitions.ts` (agent-orchestration/tool-handlers) — the `create_routine` tool parses the
   cron, computes `nextRunAt` itself, then hands the finished value to
   `ports.coreApi.insertRoutine(...)` (lines 1316–1338). Same duplication, worse: the orchestration
   layer computing routine-domain state and pushing it through a port, when the founder's standing
   ruling is that orchestration is a blind executor and service ownership covers writes.

`nextRunAt` on create is computed in THREE places for one insert path. Move the computation behind
`insertRoutine` (the routine service computes it from `triggerType`/`triggerConfig` on insert, and
returns it), and consumers 2 and 3 drop their cron imports entirely — validation of the expression
happens where the row is written, throwing `INVALID_INPUT` back through the same port/route. At
that point the package has exactly one consumer, the routine service, and the cross-layer
justification for a framework package evaporates. The 8 in-process timer doors do not need a shared
cron library — 7 of them run plain `setInterval`; only the routine scheduler speaks cron, and it
should own its own parser.

## Consumers (measured, not assumed)
| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api/routine/src/routine-scheduler.ts` | `parseCron`, `nextCronMatch`, `computeNextRunAt` | Yes — it is the owner; code moves in |
| `layers/core-api/src/routes/routines-routes.ts` | `parseCron`, `nextCronMatch` | Should not need it — `insertRoutine`/update computes `nextRunAt` owner-side |
| `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts` | `parseCron`, `nextCronMatch`, `CronFields` | Should not need it — the tool forwards `triggerConfig` raw; owner validates and computes |

## If written today, from scratch
`layers/core-api/routine/src/cron.ts` — a private module of the routine package: `parseCron` +
`nextCronMatch` (+ private `parseField`/`fieldMatches`), and `computeNextRunAt` folded into the
scheduler. Nothing exported outside `@hyperidle/routine`. No framework package.

## Kill summary
| Verdict | Count |
|---|---|
| DELETE | 0 |
| MERGE | 1 |
| SIMPLIFY | 1 |
| KEEP | 2 |
Surface: 4 exports → 0 framework exports (100% package cut; 2 functions survive as routine-internal)

## Feature-level kills
- **Pre-insert `nextRunAt` computation at non-owner call sites** (routes + agent tool): dies. The
  routine service computes it on insert/update. What breaks: the `create_routine` tool currently
  returns `nextRunAt` in its result — the port/route returns the owner-computed value instead. One
  computation, one owner, same observable behavior.
- **AU20 Stage 2's own rationale** ("shared by dispatch, API validation, and tool handlers without
  service-layer back-edges") is dissolved by construction: after the move nobody but the service
  needs cron, so there is no back-edge to avoid.

## Full export audit
| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `parseCron` | function | UI:`POST /api/routines` + AGENT:`create_routine` + SCHED:routine-scheduler | KEEP | Calendar routines are real product (UI dialog, agent tool, scheduler). Moves into `routine` as a private module; stops being a package export. |
| 2 | `nextCronMatch` | function | same three doors as `parseCron` | KEEP | The actual next-fire computation the scheduler needs. Moves into `routine` with `parseCron`. |
| 3 | `computeNextRunAt` | function | SCHED:routine-scheduler (sole caller, 3 sites) | MERGE | Routine-domain logic (`triggerType` heartbeat/continuous/calendar, `TriggerConfig` JSON) masquerading as "pure cron" — its input type IS a routine row. Fold into `routine-scheduler.ts`. |
| 4 | `CronFields` | interface | INTERNAL (return type of `parseCron`; only external annotation is `tool-definitions.ts:1316`, which dies with the tool's cron work) | SIMPLIFY | Becomes a non-exported type inside the routine package once the two non-owner consumers stop parsing cron. |

## Holes this leaves
- The `create_routine` tool and the routines route lose their local early-validation of the cron
  string; a bad expression is now rejected by the routine service at insert. Same error surface
  (`INVALID_INPUT`), one round-trip deeper for the tool. Acceptable — that is what owning a table
  means.
- `insertRoutine`'s port signature changes (stops accepting caller-supplied `nextRunAt`, returns
  it). One port touched, three duplicated computations deleted.
