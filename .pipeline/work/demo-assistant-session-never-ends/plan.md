# The demo assistant can never run a turn

## Seed

Found during the ship review of `knowledge-attachment-slot`.

`tools/setup/src/demo-world/activity.ts:133-145` seeds `demo-session-assistant-live`
with `state: 'active'` and `endedAt: null` for `ast-demo-founder`, and
`tools/setup/src/demo-fixture.ts:226` gives that agent
`maxConcurrentSessions: 1`.

Nothing ever ends that session — `recoverRunningRequests` only adopts requests in
`running`, and this session has no request. So the agent's only concurrency slot
is occupied forever and **every** assistant turn in the demo world fails admission
with `CONCURRENCY_LIMIT`, permanently.

## Why it matters more than it looks

This is the condition that triggers
`.pipeline/work/session-request-queue-starvation/`. Before the busy-loop fix it
pegged the app at 100% CPU and killed the health endpoint; after it, the demo
assistant simply never replies while the app looks healthy, and it blocks every
other agent's queue behind it.

## Scope

Demo mode only — `--demo` / `HYPERIDLE_DEMO=1`
(`tools/setup/src/setup-cli.ts:203`, `bootstrap-pg.ts:28`). A real install is
unaffected. Pre-existing.

## Not yet decided

Whether the seeded live session should end, whether the demo assistant should get
a higher concurrency limit, or whether seeding a live session for the agent a
human will immediately chat to is simply the wrong fixture.
