# AU34 — where each development file lands

Phase A step A10 output. Computed against `architecture.md` §3.6, not chosen:

> A development file lands in the package that owns its **subject** — the destination supplying the
> most **value** (non-`type`) bindings; ties broken by the destination of the first import statement.
> Every other destination it reaches becomes an `@hyperidle/<dest>` specifier.

Barrel imports are resolved **by symbol** through the same map an external consumer's
`@hyperidle/shared` import is resolved by. A namespace import of a barrel whose publications all land
in one destination contributes that destination; one spanning several decides nothing.

**86 development files, every one placed, none undecided.** 21 of them reach more than one
destination; the rest reach exactly one. Two needed a stated decision because their only import is a
namespace import of a barrel spanning several destinations — both are recorded below with the reason.

Measured after Phase A's deletions and folds, so this is the tree B1 will move, not the tree
`requirements.md` §6 measured. Two numbers therefore differ from `architecture.md` §3.6, which
counted the pre-A4 tree and did not resolve workspace `@hyperidle/shared` specifiers: 21 files span
more than one destination rather than 17, and three barrel-namespace constructs with no successor were
removed in A4 and A6 rather than the one §3.5 enumerated.


## framework/block-derivation — 10 file(s)

| file | other destinations it reaches |
|---|---|
| `__tests__/blocks/block-id.test.ts` | — |
| `__tests__/blocks/browser-safe.test.ts` | `domain-model` |
| `__tests__/blocks/derive-payloads.test.ts` | `domain-model` |
| `__tests__/blocks/edge-cases.test.ts` | `domain-model` |
| `__tests__/blocks/golden-ids.test.ts` | — |
| `__tests__/blocks/id-stability.test.ts` | `domain-model` |
| `__tests__/blocks/normalise.test.ts` | `domain-model` |
| `__tests__/blocks/purity.test.ts` | — |
| `__tests__/blocks/round-trip.test.ts` | — |
| `__tests__/blocks/slug.test.ts` | — |

> **`__tests__/blocks/browser-safe.test.ts` — stated, not computed.** its subject is that deriving blocks pulls in no node: built-in — the parser and the hash are what could, and both are here

Fixtures that move with these tests: `__tests__/blocks/golden-ids.json`, `__tests__/blocks/fixtures/golden-corpus/*.md (12 files)`.

## framework/conversation-parts — 3 file(s)

| file | other destinations it reaches |
|---|---|
| `__tests__/AM1-part.test.ts` | `domain-model` |
| `__tests__/AM1-source-agnostic.test.ts` | `domain-model` |
| `__tests__/AM3-session-adapter.test.ts` | `domain-model`, `harness-capability` |

## framework/credential-access — 4 file(s)

| file | other destinations it reaches |
|---|---|
| `__tests__/credential-cipher-format-vector.test.ts` | — |
| `__tests__/credential-encryption.ah1.test.ts` | — |
| `__tests__/credential-encryption.test.ts` | — |
| `__tests__/resolve-model.test.ts` | `domain-model` |

## framework/diagnostics — 2 file(s)

| file | other destinations it reaches |
|---|---|
| `__tests__/logger.test.ts` | — |
| `__tests__/observability-console-adapter.test.ts` | — |

## framework/domain-model — 38 file(s)

| file | other destinations it reaches |
|---|---|
| `__tests__/AC1-outcome-types.test.ts` | — |
| `__tests__/AD8b-assistant-roles.test.ts` | — |
| `__tests__/AE6-kind-registry.test.ts` | — |
| `__tests__/AF8-notification-types.test.ts` | — |
| `__tests__/AH2-errors.test.ts` | — |
| `__tests__/AH2-model-catalog.test.ts` | — |
| `__tests__/AH3-plain-payload-notice.test.ts` | — |
| `__tests__/AI4-notification-short-label.test.ts` | — |
| `__tests__/AI4-status-labels.test.ts` | — |
| `__tests__/AN1-connection-types.test.ts` | — |
| `__tests__/AN1-descriptor-inherited-tools.test.ts` | `harness-capability` |
| `__tests__/agent-roles.test.ts` | — |
| `__tests__/agent-work-intent-recorder.test.ts` | `work-intent-port` |
| `__tests__/artifact-types.test.ts` | — |
| `__tests__/blocks/assert-version-bumped.test.ts` | `block-derivation` |
| `__tests__/blocks/derive-blocks.test.ts` | `block-derivation` |
| `__tests__/blocks/fuzz.test.ts` | `block-derivation` |
| `__tests__/blocks/types.test.ts` | — |
| `__tests__/credential.test.ts` | — |
| `__tests__/credentials.catalog.test.ts` | — |
| `__tests__/health-signals.test.ts` | — |
| `__tests__/hint.test.ts` | — |
| `__tests__/mention.test.ts` | — |
| `__tests__/message-types.test.ts` | — |
| `__tests__/money.test.ts` | — |
| `__tests__/o1-event-split.test.ts` | — |
| `__tests__/o1-type-split.test.ts` | `block-derivation`, `conversation-parts`, `cron`, `diagnostics`, `event-bus`, `factory-defaults`, `filesystem-contract`, `harness-capability`, `harness-protocol`, `host-process`, `presentation-format`, `query-escaping`, `tool-protocol`, `toon-codec`, `work-intent-port` |
| `__tests__/scope-kinds.test.ts` | — |
| `__tests__/session-ended-event-tokens-by-tier-payload.test.ts` | — |
| `__tests__/session-request-contract.test.ts` | — |
| `__tests__/task-transition.test.ts` | — |
| `__tests__/thread-block-ref.test.ts` | — |
| `__tests__/thread-blocking.test.ts` | — |
| `__tests__/thread-mention-ref.test.ts` | — |
| `__tests__/thread-payload.test.ts` | — |
| `__tests__/thread.test.ts` | — |
| `__tests__/types.test.ts` | — |
| `http/__tests__/rate-limit.test.ts` | `http-middleware` |

> **`__tests__/o1-type-split.test.ts` — stated, not computed.** every name it asserts on the barrel is a domain-model name, so  becomes that package's own barrel and every assertion survives verbatim

## framework/event-bus — 3 file(s)

| file | other destinations it reaches |
|---|---|
| `__tests__/AL7-proposed-call-types.test.ts` | `domain-model`, `harness-protocol` |
| `__tests__/event-bus.test.ts` | `domain-model` |
| `__tests__/thread-events.test.ts` | `domain-model` |

## framework/factory-defaults — 3 file(s)

| file | other destinations it reaches |
|---|---|
| `__tests__/X3-templates.test.ts` | — |
| `__tests__/agent-scaffold.test.ts` | — |
| `__tests__/system-prompt-template-resolution.test.ts` | — |

## framework/harness-capability — 2 file(s)

| file | other destinations it reaches |
|---|---|
| `__tests__/derive-primary-harness.test.ts` | — |
| `harness/__tests__/harness-capability-descriptor.test.ts` | — |

## framework/harness-protocol — 8 file(s)

| file | other destinations it reaches |
|---|---|
| `__tests__/harness-adapter.test.ts` | — |
| `__tests__/money-harness.test.ts` | `domain-model` |
| `harness/__testing__/mock-harness-adapter.ts` | `harness-capability` |
| `harness/__tests__/harness-capabilities.test.ts` | — |
| `harness/__tests__/harness-event-normalization-codex.test.ts` | — |
| `harness/__tests__/harness-event-normalization.test.ts` | — |
| `harness/__tests__/return-actions-required-subset.test.ts` | — |
| `harness/__tests__/worker-protocol.test.ts` | — |

Fixtures that move with these tests: `harness/__tests__/fixtures/claude-stream.jsonl`, `harness/__tests__/fixtures/codex-exec.jsonl`.

## framework/host-process — 4 file(s)

| file | other destinations it reaches |
|---|---|
| `__tests__/git-runner.integration.test.ts` | — |
| `__tests__/profiles.test.ts` | — |
| `__tests__/ssrf.test.ts` | — |
| `__tests__/validate-env.test.ts` | — |

## framework/http-middleware — 6 file(s)

| file | other destinations it reaches |
|---|---|
| `__tests__/explicit-start-projection.test.ts` | — |
| `__tests__/http-access-boundary.test.ts` | — |
| `__tests__/http-timing-safe.test.ts` | — |
| `http/__tests__/validate-wrapped.test.ts` | — |
| `http/__tests__/validate.route-boundary.test.ts` | — |
| `http/__tests__/validate.test.ts` | — |

## framework/presentation-format — 1 file(s)

| file | other destinations it reaches |
|---|---|
| `__tests__/time.test.ts` | — |

## framework/tool-protocol — 1 file(s)

| file | other destinations it reaches |
|---|---|
| `__tests__/tool.test.ts` | — |

## framework/toon-codec — 1 file(s)

| file | other destinations it reaches |
|---|---|
| `__tests__/toon-codec.test.ts` | — |
