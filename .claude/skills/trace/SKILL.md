---
name: trace
description: "Answer 'what is actually used where' in this repo using the prebuilt code graph (tools/trace). Trace a feature from UI → API → service → DB, or cron → service → event → harness; find every door that reaches a table/event/method; see what an event triggers. Use BEFORE refactoring, scoping a work package, or reasoning about blast radius — it replaces dozens of grep/read hops with one query. Not a file reader: it serves a persisted graph built by parsing the repo as a whole."
argument-hint: "[<symbol> | doors | event <type> | build]"
user-invocable: true
min_tool_calls: 1
---

# Trace — the code graph

A persisted graph of the codebase (`tools/trace/graph.json`), built by parsing the repo **as a whole** and rebuilt automatically when `HEAD` changes. It answers reachability questions grep can't assemble: doors → cross-file calls → DI wiring → seam (port→route) crossings → event emit/subscribe chains.

Run everything from the repo root with `npx tsx`. The graph auto-rebuilds if stale; pass `--rebuild` to force.

## The commands

| Question | Command |
|---|---|
| What entry points exist at all? | `npx tsx tools/trace/trace-doors.ts` |
| Doors of one kind / matching a word | `npx tsx tools/trace/trace-doors.ts ui\|agent\|scheduler\|<keyword>` |
| **Who uses X?** (table, event, port method, any function) | `npx tsx tools/trace/trace-uses.ts <symbol>` |
| Who uses X, narrowed to one door kind | `npx tsx tools/trace/trace-uses.ts <symbol> --ui\|--agent\|--scheduler` |
| What emits / reacts to an event? | `npx tsx tools/trace/trace-events.ts <event_type>` |
| All events with emit/sub counts | `npx tsx tools/trace/trace-events.ts --list` |
| Force a graph rebuild | `npx tsx tools/trace/trace-build.ts --rebuild` |

## What `trace-uses` follows

For each door (and each event subscriber) it walks the handler body through:
- **same-file helpers** and **cross-file imports** (package entry, barrel re-exports, `import * as ns`, factory-returned closures),
- **entity→table** resolution (`work.create(db, "bet")` → `bets`),
- **seam crossings** (a `coreApi.<method>` port call → its backing HTTP route door),
- **DI wiring** (a `deps.X` / `ports.X` call → the concrete impl the composition root bound),
- **event chains** (a door that emits an event whose subscriber touches the symbol), fixpoint up to 4 hops.

Output lists each matching door/subscriber with the `via` reason (`seam …`, `emits <event> → subscriber …`, `di:<name>`, `touches table …`, `port …`).

## Typical questions → query

- **"Which UI surfaces write `bets`?"** → `trace-uses.ts bets --ui`
- **"Which agent tools touch tasks?"** → `trace-uses.ts task --agent`
- **"What can start an agent run?"** → `trace-uses.ts enqueueWorkIntent`
- **"What reacts when a session ends?"** → `trace-events.ts session_ended` (then `trace-uses.ts session_ended` for what the reactors do)
- **"Is `foo()` dead / who calls it?"** → `trace-uses.ts foo`
- **"What does feature X reach end-to-end?"** → forward direction: MCP `trace_door` with the door's name (CLI: `trace-doors.ts <keyword>` to find the door, then reason from its handler). Reverse direction (who reaches X): `trace-uses.ts <symbol>`.

## Caveats — read before trusting a negative

- **Absence of evidence ≠ evidence of absence.** A `no door references X` answer means the graph didn't find a path — reflection, string-built calls, and DB-config-driven dispatch are invisible.
- **DB-config event subscriptions are not traced.** Routines with `triggerType:"event"` subscribe to whatever their `triggerConfig.eventType` row says — that's runtime data, not code. The tick door is visible; the event it subscribes to is not.
- **Wildcard subscribers (`on("*")`) are listed but not expanded** through — they react to everything, so expanding them would match everything. (AU39 redesigns this.)
- **DI resolution is an over-approximation** — a deps-bag method name shared by several bags follows up to 3 bindings. Precise where names are specific (they mostly are); treat a surprising match as "verify the wiring," not proof.
- The graph reflects **production** files only (test/spec/`__` files excluded).

## When to rebuild

Automatic on `HEAD` change. Force `--rebuild` only if you just edited source in a way the graph should reflect *within the same commit session*, or if output looks stale.
