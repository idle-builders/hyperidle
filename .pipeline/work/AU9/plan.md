# AU9 — Hard agent handoff boundary

Shipped 2026-07-11 after a rebuild (Remediation-2). Behaviour is documented in
`docs/architecture/runtime-simplification.md` and `run-unit-model.md`, both verified accurate against
the shipped code.

## The shape that survived

- **One terminal writer.** `terminalizeAgentSessionRequest` is the only function that terminalizes a
  request. It handles both preconditions through mutually exclusive status CAS (`running` + session id,
  or `claimed` + claim token) and writes one inbox row each. `markRequestTerminal`, the weak `claim()`,
  and `handOffIntent` were deleted rather than kept alongside it.
- **Lifecycle disposition is re-read, not guessed.** `transitionAgentRunLifecycle` re-reads the durable
  `termination_reason` and lets it win over a natural-completion inference.
- **Boot reconciles before the first drain.** `recoverRunningAgentSessionRequests`,
  `recoverRequestedTerminations` and `reapTerminalAgentWorkIntents` are all awaited before draining, so
  a crash mid-run is adopted rather than raced.

## The coverage blind spot that hid a real bug

`admitSession`'s concurrency check counted the request's own session — already reserved by
`reserveOrAdoptSession` before `admitSession` runs — against its own agent's `maxConcurrentSessions`.
At the schema default of 1 this **permanently self-blocked every request-mediated admission**. Nothing
caught it because **the service-integration suites mock `admitSession` entirely**; it surfaced only on
a real builtin realbinary run. Any change near admission needs a real run, not a service-integration
pass.

## Gaps left open

- The broken-turn path has no realbinary case — forcing a real model to return invalid content
  deterministically was judged too fragile. Covered instead by `AH6-lane-gates-broken-turn` and AH3
  unit tests.
- Shutdown and cost-cap termination reasons are recovered-at-boot tested, but the live call sites that
  *store* them (server-factory `dispose()`, session-provisioning budget exhaustion) are not
  end-to-end tested.
