# AU26 — Challenge every agent/agent-environment domain sitting in core: relocate what core only administers but never itself works with

## What we need

Every domain in `core-api` that is about an agent or an agent's execution environment had to be challenged
with one precise test, and anything that failed it relocated into `agent-orchestration`:

> Does the core app ever actually use this itself, for its own purposes — or does it only let a human
> configure it and then hand it to an agent?

One real use and it stays. AU21 had shipped an "orchestration reads zero core-api state" boundary, but the
domain model underneath was never challenged systematically. `service_connections` still lived in the wrong
layer, forcing Decision K1's bake-at-emit patch — a real staleness cost and knowingly throwaway engineering.
And `agent-orchestration` hosted no routes of its own, so every agent-domain HTTP/WS concern defaulted into
`core-api` by omission rather than by a domain decision.

The founder set the unit of challenge: whole service first — all 15 Service packages under
`packages/core-api/*/` — then parts inside the services that stay. The 19 units under `src/services/` are
wiring, not services, and each follows the verdict of the domain it wires. The charter-fixed domains (Work,
Conversation, Knowledge, Users identity, Settings) are a strong prior, not an exemption: the "stays" still has
to be reached on evidence, and a charter-fixed "moves" would escalate as a track-level finding rather than be
built here.

The dividing line, restated by the founder after one round cut too much: **AU26 moves code that is in the
wrong place; AU28 writes the rules** — boundary definitions, owners for unmoved tables, guard scan scopes,
linters, censuses. A move that incidentally clears an ACL violation is still a move. Destinations are
`agent-orchestration` only, never `agent-execution` (no DB credentials, may run elsewhere); table definitions
stay in `packages/db/src/schema.ts` and only the owning package changes; `AgentOrchestrationPort` stays
read-only, so anything relocated needing a mutation door gets an orchestration route; a helper with no table,
lifecycle or domain of its own dissolves rather than becoming a Service; and every move deletes the hack it
replaces.

Acceptance, in prose: a whole-service verdict for all 15 with `file:line` evidence; the part-level test
applied at minimum to the mounting engine, `users`' agent-execution columns and `WsConnectionHub`; every
"relocate" or "delete" executed here, never parked; guard-enforced ACL on the tables this package moves; and
orchestration hosting its own session/harness route.

## How it works

The evidence bar is what makes the test reusable later. A real use writes a core table, gates a core
operation, emits or consumes an event, or enqueues work. Rendering a value into a `core-api` response is
**not** a use — every core route renders in core, so counting that makes everything stay by construction. Call
sites are the evidence; a doc or `@lore` comment is a lead. When every call site is composition-root wiring
the sites carry no signal — name the domain the unit wires and take that domain's answer.

`conversation`, `knowledge`, `notifications`, `routine` and `settings` stay outright. `connections` moved
whole into a new SQL-owning orchestration Service, the core half renamed `@hyperidle/credentials` and K1's
bake deleted. `filesystems` was verdicted stays-plus-three-parts, then superseded by a founder ruling that
moved the whole domain — record, injections, probe, engine, captures — and dropped the `filesystem` knowledge
scope. `git-export` split: its export feature was confirmed dead (off by default, no web references in any
history, no restore path, no non-test callers) and was **deleted**, while its general-purpose git subprocess
runner relocated to `@hyperidle/shared/git`. `observability` dissolved into `@hyperidle/shared` plus
`settings`, and `realtime` with it: `WsConnectionHub` is transport with no domain, no tables and no consumers
outside `core-api/src`, so it became a primitive inside `packages/core-api/src` rather than a package
pretending to be a Service. `org`, `users`, `policy`, `work` and `review` each stayed but held something that
moved: three `teams` agent-config columns into `team_run_config_defaults`; six `users` run-config columns into
`agent_run_config` (migration `0055` with backfill, plus two dead column drops); policy's direct agent-run
write inside its own transaction; `work`'s bet-kill session stop and its `latestSessionOutcome` decoration
subquery; and `review`'s redundant re-read of fields `SessionEndedEvent` already carries.

The API split settled as: each Layer owns and exports its own Hono app, and neither imports the other's
routes. `createCoreApiApp()` and a net-new `createAgentOrchestrationApp()` are mounted by the Application tier
(`remote-server`, `desktop`) onto one Hono instance behind one listener; composition — DB connection,
`EventBus`, every cross-domain reactor, `WsConnectionHub`, the MCP bridge, `serve()` — moved out of core-api's
`server-factory` into that tier. Never a second server or port: orchestration is always colocated in the same
process. Probed first — two Hono apps do mount on one instance sharing middleware, the root `notFound` branch
being the carry-forward trap.

Rejected: relocating `observability` into `agent-orchestration` (three of the six event kinds it translates
are pure core-domain, which inverts AU21's boundary); moving `WsConnectionHub` there; anything going to
`agent-execution`; and the repo-wide table-ownership programme architecture rounds 2 and 3 grew — census,
violation countdown, guard scan scope, owners for unmoved tables, eval routing, db seeders — cut to AU28.
Mid-build the J4 ruling changed the UI half: core-api stopped composing agent-run state onto its responses, so
that composition moved into the browser.

## How we work on this

Shipped and founder-approved. Review round 1 came back NOT DONE (3 CRITICAL, 12 WARNING); all three criticals
and nine warnings were fixed. What outlives the run:

- **AC7 is not met as literally written**, and the record says so rather than letting it look satisfied. J4
  supersedes it in substance: what the user sees is unchanged, *when* they see it is not — the run-state hooks
  report loading/ready/error and render "unknown" rather than a confident idle/healthy/0 while a read is in
  flight or has failed. Accepted residue: two round-trips where there was one.
- The new run reads are **deliberately uncapped** — a cap cannot be behaviour-preserving, because
  `totalSessions` counts every run and `idleDurationMs` reads the newest ended run of any age. Narrowing them
  is a product decision.
- Session-stream authorization is **widened for task-free runs** (assistant, routine, knowledge),
  founder-accepted. It contradicts core's own socket, which still enforces thread participation for
  `thread:<id>`: a user refused the thread can watch that thread's assistant run. Tightening is a founder
  call.
- `packages/agent-orchestration/src/` has no `package.json` and no guard widening, so the table-ownership
  guard does not scan it, and the anti-regrowth guard's route-import scan is one-directional — AU28's work.
- One documented read survives the sweep: the roster's `sessions` read in `teams-routes.ts`, kept because it
  also feeds `maybeNotifyAgentError`. Scoped to three columns, reported as a blocker awaiting the founder.
- The dropped `filesystem` knowledge scope has no CHECK constraint and no migration, so the "no production
  data" claim is not verifiable from code; a surviving row silently reclassifies to Shared.
- Deleting the git export leaves doc claims stale (`system-requirements` S-2.2, `the-canonical-store`,
  `facilitators`) — a `/write-docs` reconciliation. Whether knowledge belongs in git is a future question.
