# event-bus — destroyer verdict (framework)

## Where does this package go?
**Verdict: STAYS SHARED — the one genuine case in this batch; but half its method surface dies**

What it does beyond an emitter: three real things Node's `EventEmitter` does not give —
typed subscriptions over the `DomainEvent` union, per-handler error isolation (one throwing
subscriber cannot break durability-critical subscribers registered after it — the I1 lesson), and
a `*` wildcard used by exactly one production consumer (the observability dispatcher,
`dispatcher.ts:471`). That is a justified ~100-line class, not ceremony.

Why it genuinely cannot dissolve:
- **Instantiated by four independent production composition points across two layers and two
  applications**: `applications/desktop/create-server.ts:162`, `applications/remote-server/
  create-server.ts:241`, `layers/core-api/src/app.ts`, `layers/agent-orchestration/src/services/
  run-orchestration-composition.ts:399,540` (+ `start-runtime.ts:55` fallback). No single consumer
  owns it.
- **Typed on by ~80 production files** across core-api, agent-orchestration, and two framework
  protocol packages (`harness-protocol`, `tool-protocol`) — type-only imports, but they name the
  class.
- **The one plausible dissolve target — `domain-model`, where its event types live — is blocked by
  a hard fact**: the bus imports `@hyperidle/diagnostics` for its handler-failure logger, and the
  universal type package must stay dependency-free. Moving the class there poisons every
  type-only consumer with a runtime dependency.

AU29 took framework packages off the bus — that shrank subscribers, not this package's
justification: the bus's consumers are layers and apps, and they remain plural. So: STAYS SHARED,
with every consumer named above. What each owning its own copy would break: two bus classes means
two event unions drifting and the cross-layer emit/subscribe seam (core-api emits, orchestration
subscribes and vice versa) stops type-checking as one system.

The garbage is inside the class, not around it: `once` has ZERO production callers (`rg -a "\.once\("`
finds only Node `process`/`child`/`httpServer` calls and the bus's own test), and `off` is never
called directly in production — it is reached only through the unsubscribe closures `on` returns
(`dispatcher.ts:471` `unsub`). And the lazy `getLogger()` dance exists, per its own comment, to
accommodate `vi.mock` hoisting — production code shaped by a test, which the founder has already
ruled against.

## Consumers (measured, not assumed)
| Consumer | What it imports | Could it own this? |
|---|---|---|
| `applications/desktop`, `applications/remote-server` | `EventBus` class (instantiate) | No — composition roots of a shared instance |
| `layers/core-api` (app.ts + ~60 files) | class + type | No — co-equal producer/subscriber with orchestration |
| `layers/agent-orchestration` (composition, start-runtime + ~20 files) | class + type | No — same |
| `framework/harness-protocol`, `framework/tool-protocol` | `type EventBus` only | They just name the seam type |
| `tools/eval` (dev world) | class | Dev-only, follows production |

## If written today, from scratch
The same class, minus `once`, with `off` private (the unsubscribe closure is the API), and a plain
module-level `createLogger` call with tests observing the real logger instead of mocking module
internals. `on` (typed + `*`), `emit`, done.

## Kill summary
| Verdict | Count |
|---|---|
| DELETE | 4 |
| MERGE | 1 |
| SIMPLIFY | 0 |
| KEEP | 3 |
Surface: 8 public method rows → 3 (on typed, on wildcard, emit) — 62% cut

## Feature-level kills
- **`once` semantics**: no production feature has ever wanted exactly-one delivery. Dies with its
  test block. Nothing breaks.
- **Public unsubscription by handler reference (`off`)**: dies as public API. The returned-closure
  pattern is the one way to unsubscribe (already the only way used). Internal removal logic
  survives as a private method.
- **Test-shaped lazy logger**: fold `getLogger()` into a module-level `const logger = createLogger(...)`
  and let the bus's tests assert on observable delivery, not on a mocked logger. (Noted here;
  belongs to whoever executes the kills.)

## Full method audit
| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `EventBus.on` (typed overload) | BOOTSTRAP — every subscriber wiring in core-api + agent-orchestration composition | KEEP | The subscription seam of the whole system; typed against the DomainEvent union, which is the package's core value. |
| 2 | `EventBus.on` (`"*"` overload) | BOOTSTRAP — one production consumer: observability `dispatcher.ts:471` | KEEP | The observability pipe is a wildcard by nature; one real consumer is enough for an overload that costs 4 lines. |
| 3 | `EventBus.on` (implementation signature) | INTERNAL | MERGE | Not a third method — the overloads' shared body. Counted once with rows 1–2. |
| 4 | `EventBus.off` (typed overload) | INTERNAL — only via the unsubscribe closure `on` returns | DELETE | Zero direct production callers. Make removal private; the closure is the API. |
| 5 | `EventBus.off` (`"*"` overload) | INTERNAL — same closure path | DELETE | Same. |
| 6 | `EventBus.off` (implementation signature) | INTERNAL | DELETE | Dies with rows 4–5; survives only as a private helper. |
| 7 | `EventBus.once` | TEST-ONLY (`event-bus.test.ts:165` is the only caller in the repo) | DELETE | Dead API plus the test that keeps it warm. |
| 8 | `EventBus.emit` | Every door — all UI routes, agent tools, and schedulers emit through it after DB durability | KEEP | The delivery mechanism; synchronous-after-durability is the at-least-once contract the system leans on. |

## Holes this leaves
- Any future subscriber wanting one-shot delivery writes the 3-line self-unsubscribing wrapper at
  its own call site. Priced at zero — nobody has wanted it yet.
- External code can no longer detach a handler it did not register (no public `off`). No production
  code ever did.
