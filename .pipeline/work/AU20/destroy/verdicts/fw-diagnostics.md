# diagnostics — destroyer verdict (framework)

## Where does this package go?

**Verdict: SPLIT — delete the observability third outright, keep a 2-file shared core (logger + secret-scrub), inline `redactDbUrl` into its two dev-world users.**

The package is three unrelated things stapled together:

1. **`logger.ts`** — the process-wide stdout sink. Genuinely shared: 6 independent consumer groups across all three shipping roots (framework/event-bus, framework/host-process, framework/http-middleware, layers/core-api + 6 subpackages, layers/agent-orchestration, applications/remote-server). ~30 production files import `createLogger`. No single owner exists; copying a logger into 6 packages is worse than the package. **STAYS SHARED.**
2. **`redact.ts`** — secret-scrub regexes with exactly two independent production consumers: `layers/agent-orchestration` (`summarizeToolArgs` → the live session-activity feed the user watches in the UI) and `layers/core-api/notifications` (`ERROR_TOKEN_PATTERNS` + `REDACTED_TAG` → scrubbing error text before it becomes a user-visible notification). The pattern list is one security artifact; two diverging copies is how a new secret shape gets scrubbed on one path and leaked on the other — and the H3 lore records exactly that burn ("previous coverage missed common credential shapes"). **STAYS SHARED**, but 13 of its 17 exports are un-exported (zero external readers) and `redactDbUrl` leaves entirely.
3. **`observability/`** (3 files, 3 of 5 functions' worth of surface: 1 function + 6 types) — **DELETE the entire pipeline**, including its sole consumer in core-api. Evidence below.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/diagnostics" layers framework applications tools` → 27 production files + tests. What each actually imports:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| layers/core-api (16 prod files incl. conversation, knowledge, notifications, routine, work subpackages) | `createLogger`, `Logger`; notifications also `ERROR_TOKEN_PATTERNS` + `REDACTED_TAG`; observability-runtime + dispatcher also the observability exports | No — logger shared with 5 other groups; observability part dies instead of moving |
| layers/agent-orchestration (3 prod files) | `createLogger`; composition injects `summarizeToolArgs` into the provisioner port | No — scrub list must stay identical to the notifications copy |
| applications/remote-server | `createLogger` | No |
| framework/event-bus | `createLogger`, `Logger` | No |
| framework/host-process | `createLogger`, `Logger` | No |
| framework/http-middleware | `createLogger` | No |
| tools/setup (tooling world) | `redactDbUrl` | **Yes — move it there** |
| framework/db `__testing__/pg-test-runner.ts` (dev world) | `redactDbUrl` | **Yes — own 20-line copy** |

Zero consumers anywhere for: the 12 individual regex consts, `scrubInlineTokens`, `ObservabilityEvent`/`ObservabilityAdapter`/`ObservabilityChannel`/`ObservabilityDispatcher`/`ObservabilityDispatcherStatus`/`FlushOutcome` outside core-api's dispatcher, and `createConsoleObservabilityAdapter` outside core-api's observability-runtime. Confirmed per-symbol with `rg -a` across all four roots (trace graph returns false negatives here — it misses this package's DI wiring; rg found the callers the graph missed, and rg's zeroes are the ones reported).

## The observability pipeline is machinery nobody reads — kill it end to end

The chain: EventBus → `registerObservabilityDispatcher` (core-api `dispatcher.ts`, ~480 lines of ring buffer, batching, drop accounting) → `createConsoleObservabilityAdapter` → the same `createLogger` → stdout. Its entire output is duplicate log lines of domain events (`session_started`, `task_state_changed`, `bet_state_changed`, `knowledge_write`…) that the emitting services already log. Who reads it, and what decision changes:

- **No operator surface.** AU26 already deleted all four `/api/observability*` routes because they had *zero requesters repo-wide*. `status()` survives, by its own `@lore` admission, only as a test seam.
- **No off switch anyone can reach.** `updateObservabilityConfig` has zero production callers — no route, no UI. The config is default-on and write-dead.
- **No decision branches on any event.** Nothing parses these stdout lines; the UI's live session-activity feed comes from `session-activity-buffer` → WebSocket, not from this dispatcher.
- **The batching exists for an adapter that doesn't exist.** `ObservabilityAdapter.record()` takes a batch "so network adapters can amortise per-request overhead" — the only adapters are `console` and `noop`. Ring buffer + flush timer + drop stats feeding `console.log` is anticipatory abstraction, verbatim the framework-brief garbage list.

Per the brief: diagnostics survive only where someone reads the output to make a decision. Nobody reads this. DELETE: `observability/events.ts`, `observability/types.ts`, `observability/console-adapter.ts` here, plus (outside this package, named as required) `layers/core-api/src/observability/dispatcher.ts`, `layers/core-api/src/observability-runtime.ts`, its wiring in `service-bootstrap.ts`, the `ObservabilitySchema` block + `read/updateObservabilityConfig` in `layers/core-api/settings/src/server-config.ts`, and the three dispatcher/adapter test files.

## If written today, from scratch

One small package, two files, five exports:

- `createLogger` / `Logger` — stdout sink with `info`/`warn`/`error`. No `minLevel` (no caller ever passes it), no `debug` (with the default floor at `info`, both production `.debug()` calls in the repo have never printed a line).
- `summarizeToolArgs` — scrub + 512-char cap for the tool-call preview the user watches in `SessionActivityPanel`. `scrubInlineTokens` folded in as a private helper.
- `ERROR_TOKEN_PATTERNS`, `REDACTED_TAG` — the shared pattern list + sentinel for notifications' user-visible error scrubbing. All 12 individual regexes private.

`redactDbUrl` lives in `tools/setup`; `pg-test-runner` keeps its own copy (dev world can't import from tools, and 20 lines does not justify a framework export with zero production callers).

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 20 |
| MERGE | 1 |
| SIMPLIFY | 2 |
| KEEP | 3 |

Surface: 26 exports → 5 exports (81% cut)

## Feature-level kills

- **The observability event pipeline** (this package's `observability/` + core-api's dispatcher, runtime, config schema, ~700 lines total across packages). Breaks: no batched telemetry lines on stdout, no `ObservabilityConfig` settings key. Acceptable because: zero readers, zero operator surface (already deleted in AU26 for zero requesters), zero config writers, and every event it mirrors is already logged by its source service. When someone actually wants a trace line, they add one `logger.info` at the source — that is the whole feature.
- **`redactDbUrl` as framework surface.** Breaks: nothing in production — its only users are a setup CLI (tooling) and a test runner (dev world). Both get local copies.
- **Public regex à-la-carte surface** (12 consts). Breaks: nothing — no file outside this package references any of them. The barrel exporting 12 regexes nobody imports is uniformity theater.

## Full export audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `createLogger` | function | BOOTSTRAP + INTERNAL — imported by 22 prod files across 6 consumer groups, all three shipping roots | SIMPLIFY | Shared stdout sink, earns its keep; drop `minLevel` (never passed by any caller) and the `debug` level (unprintable at the default floor — both prod `.debug()` calls die too). |
| 2 | `createConsoleObservabilityAdapter` | function | BOOTSTRAP — sole caller `core-api/observability-runtime.ts`, itself part of the dead pipeline | DELETE | Sink of a telemetry pipeline with no reader, no operator route (AU26 deleted them for zero requesters), no reachable off switch; dies with the whole pipeline. |
| 3 | `scrubInlineTokens` | function | INTERNAL — zero external references (`rg -a` all roots); only `summarizeToolArgs` calls it | MERGE | Fold into `summarizeToolArgs` as a private helper; the export is dead. |
| 4 | `summarizeToolArgs` | function | UI:SessionActivityPanel — provisioner (via agent-orchestration composition port) → `tool_call_recorded` → session-activity-buffer → WS → `useSessionActivity` | KEEP | Core value: the live "what is my agent doing" feed users watch, with secrets scrubbed before they hit the wire; the H3 learning that earned this scrubbing is real. |
| 5 | `redactDbUrl` | function | TEST/TOOLING-ONLY — `tools/setup/setup-cli.ts` (tooling world) + `framework/db/__testing__/pg-test-runner.ts` (dev world); zero production callers | DELETE | No production reach; move into `tools/setup`, give the test runner its own 20-line copy, delete from framework. |
| 6 | `Logger` | interface | Same reach as `createLogger` — also a DI type in event-bus, host-process, notifications, routes | SIMPLIFY | Survives with `createLogger`; loses the `debug` member. |
| 7 | `ObservabilityEvent` | type | INTERNAL to dead pipeline — outside this package only core-api `dispatcher.ts` + its tests | DELETE | Six-way discriminated union describing telemetry records nobody reads; dies with the pipeline. |
| 8 | `ObservabilityChannel` | type | core-api `dispatcher.ts` + tests only | DELETE | A `"console" \| "noop"` enum — an off switch spelled as a channel; dies with the pipeline. |
| 9 | `ObservabilityAdapter` | interface | core-api `dispatcher.ts`, `observability-runtime.ts` + tests | DELETE | One real implementation (console) — not an abstraction, indirection; batch signature serves a network adapter that was never built. |
| 10 | `ObservabilityDispatcherStatus` | interface | core-api `dispatcher.ts` only; sole production reader of `status()` deleted in AU26 (its own @lore says so) | DELETE | Operator snapshot with no operator; test-only seam = dead code plus tests that die with it. |
| 11 | `FlushOutcome` | interface | core-api `dispatcher.ts` only | DELETE | Partial-drain accounting for flushes to `console.log`; nobody branches on it. |
| 12 | `ObservabilityDispatcher` | interface | core-api `dispatcher.ts` + tests | DELETE | Port with one implementation, wired at one site, feeding one unread sink. |
| 13 | `REDACTED_TAG` | const | INTERNAL to notifications' scrub path — prod: `notifications/install.ts`; output is user-visible notification text | KEEP | The sentinel users actually see in scrubbed notification errors; shared with `ERROR_TOKEN_PATTERNS` consumer. |
| 14 | `GITHUB_TOKEN_RE` | const | DEAD as export — zero external references; used inside redact.ts only | DELETE | Un-export; private detail of the scrub functions. |
| 15 | `BEARER_TOKEN_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 16 | `SK_TOKEN_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 17 | `PK_TOKEN_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 18 | `TK_TOKEN_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 19 | `HEX_TOKEN_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 20 | `AWS_AKIA_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 21 | `SLACK_TOKEN_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 22 | `GOOGLE_API_KEY_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 23 | `JWT_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 24 | `STRIPE_TOKEN_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 25 | `PEM_BLOCK_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 26 | `ERROR_TOKEN_PATTERNS` | const | Prod: `notifications/install.ts` `scrubErrorMessage` — output lands in user-visible notification text | KEEP | The one shared consumer of the pattern list besides `summarizeToolArgs`; the reason the list stays centralized instead of forking. |

Rows 14–25 are one declaration family (the secret-shape regex set) but are listed individually per the no-sampling rule; all twelve verdicts confirmed independently with `rg -a`.

## Holes this leaves

- **No telemetry event stream at all.** If the founder ever wants machine-readable session/task/bet traces shipped somewhere, the pipeline must be rebuilt — but it comes back *with a reader*, which is the correct order. Today's version would be deleted output either way.
- **No `debug` log level.** Anyone wanting verbose diagnostics adds `info` lines temporarily. Given zero `debug` lines have ever printed in production, this hole is theoretical.
- **`redactDbUrl` duplicated** (tools/setup + pg-test-runner). Two 20-line copies of URL-password masking can drift; neither is production, so drift costs a log line in a test runner, not a leak.
- **`observability` settings key becomes unknown.** Any DB row holding old `observability` config is ignored after the schema block is deleted; no migration needed, but a leftover row is inert.
