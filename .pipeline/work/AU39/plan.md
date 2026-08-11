# AU39 — Remove the built-in routine feature; redesign wildcard event subscription

## Work package

**Outcome.** Two runtime-hygiene defects surfaced by the AU22-prep feature tracer are closed: the routine scheduler no longer dispatches hardcoded built-in routines, and the event bus no longer offers "listen to everything" as a capability any caller can take. Anyone reasoning about what the routine service or the event bus does gets an honest surface.

**Why this matters.** The routine service's invariant is "runtime-registered work only," but four hardcoded built-ins ride its cron/DB machinery, so the surface cannot be reasoned about and the scheduler is not what it claims to be. Separately, `eventBus.on("*")` couples any code to the entire event surface — a capability only two infra consumers legitimately need — and defeats exactly the reachability analysis the tracer exists to do. Cost of not doing it: both defects stay baked into every future trace, review, and refactor.

**What exists today.** Four built-ins in `routine-scheduler.ts`: `knowledge-decay` and `knowledge-promotion` (thin wrappers around `runStaleSweep` / `runAutoPromotionSweep`, which already live in the knowledge service and have **no other caller**) and `post-bet-retro` / `portfolio-retro` (coded retro generation: thread + item writes + emits). Three production wildcard subscribers: observability translate and runtime wake-hint (both legit infra), and the explicit-start re-check in `sessions-routes.ts` (not infra).

**Missing delta (candidate solution, non-binding).** Rehome the knowledge sweeps' trigger into the knowledge service (it owns the logic already; only the cron moves), then delete the built-in dispatch, `BUILTIN_ROUTINE_IDS`, and the seed rows. Decide the two retros' home — become runtime agent routines, relocate, or drop. On the bus, make the normal subscribe path take a concrete `EventType` only (wildcard does not compile for normal callers) and add an explicit infra-only observe-all for the two legit consumers; fix `sessions-routes` to subscribe to the specific events that change explicit-start status rather than exempting it.

**Depends on.** None.

**Complexity.** M (may split at architecture into the routine half and the bus half).

**Engineering tier.** production.

**Pre-build.** Refinement required — the two retros' destination is a product decision, and the two infra wildcard exemptions need a founder ruling. Design: not required (backend/framework contract, no rendered surface).

**Constraints.** Must not regress the autonomous backbone — knowledge decay and promotion must still fire after the built-in mechanism is removed.

**Out of scope.** The runtime (generic) routine path; new event types; notification/WS surfaces; the tracer itself.

## Acceptance criteria

- The routine scheduler dispatches no hardcoded built-in routine, and knowledge decay and promotion still fire on their schedules with the knowledge service owning the trigger.
- A normal caller cannot subscribe to all events — the wildcard is not available through the ordinary subscribe path.
- The exactly-two infra consumers that need every event use a dedicated, explicit observe-all capability and still receive every event type.
- The explicit-start wait in `sessions-routes` reacts only to the events that change explicit-start status, not to every event.

## Validation scenarios

- Given the knowledge built-ins are removed, when their schedule elapses, then the stale/promotion sweeps still run (fired by the knowledge service).
- Given a normal service tries to subscribe with a wildcard, when it compiles, then it is rejected.
- Given the observability dispatcher needs every event, when it registers via the observe-all capability, then it still receives every event type.
