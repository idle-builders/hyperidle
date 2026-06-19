# Harness Capability Descriptor

AM2 locks the concept that lets session dial-in, onboarding, and activity views understand harness differences without backend-specific UI branches.

## Definition

A **harness capability descriptor** is the Kernel-owned, queryable declaration of what one registered harness backend can run and how downstream consumers may configure and interpret it.

The descriptor extends the existing Harness Adapter contract. It does not replace `HarnessAdapter.startSession`, `SessionConfig`, the Model Gateway, or `HarnessEvent`; it makes the adapter's selectable models, generic options, runtime support, status, and normalization commitments explicit.

## Scope Decision

AM2 locks **native + external BYO** harness scope.

Descriptors must represent:

- Native HyperIdle harnesses such as `builtin` and `claude-code`.
- External backends the user already has and HyperIdle can register through the adapter pool, such as local CLI tools (`aider`, `goose`, `opencode`) or remote workers.

Descriptors do not introduce an arbitrary third-party adapter marketplace. External BYO means "registered through HyperIdle's adapter pool and normalized by an adapter," not "load unreviewed provider plugins."

<!-- @lore AM2: Harness scope is native + external BYO, not native-only and not an external-adapter marketplace. Existing adapter-pool behavior already detects/registers local CLI backends, so native-only would contradict shipped direction; a marketplace would overreach the AM2 substrate. -->

## Essential Properties

Every descriptor declares:

- Stable harness identity: `harnessType`, display name, backend kind, availability, and auth/status signals.
- Available models for the harness: provider, model id, label, context window when known, and whether the model is selectable or inherited from the gateway.
- Per-model options as generic control descriptors, not backend-specific UI code.
- Runtime capabilities relevant to sessions: MCP support, pre-compaction support, subagent support, file editing/tool support, supported providers, and concurrency/status signals.
- Event normalization commitments: how backend-native runtime events map to HyperIdle's downstream event model.

## What It Is Not

- Not a Model Gateway replacement. The gateway still owns model credential resolution and tier fallback.
- Not a session launch request. `SessionConfig` remains the concrete per-run input.
- Not backend-specific UI branching. A UI control renders from option descriptors, not `harnessType` checks.
- Not Strategy-owned knowledge. Harnesses, models, sessions, credentials, cost, and runtime capabilities are Kernel mechanism.
- Not a plugin marketplace.

## Composition

One descriptor attaches to one harness type. It contains zero or more model descriptors. Each model descriptor contains zero or more model option descriptors.

A **model option descriptor** is a declarative control specification for one configurable value on one model within a harness descriptor. AM2 closes the option control vocabulary to:

- `select`
- `boolean`
- `number`
- `text`

Adding another control kind requires a concept-doc update first.

Credential and secret entry are not model options. They belong to credential/onboarding flows; descriptors may report auth status but must not transport secrets.

## Lifecycle

Descriptors are live snapshots:

- Registered when an adapter enters the adapter pool.
- Reported when UI or services query harness capabilities.
- Changed when adapter availability, local binary detection, credentials, model catalog, or gateway config changes.
- Retired when the adapter is unregistered or unavailable.

Callers must not treat descriptor snapshots as durable historical records.

## Authority

- Kernel owns descriptor assembly and exposure.
- Harness adapters own backend-native normalization into the descriptor contract.
- Model Gateway owns model catalog and credential resolution data referenced by descriptors.
- UI consumes descriptors; it does not parse backend-native schemas.
- Strategy must not produce or mutate descriptor content.

This follows the Kernel/Strategy split: Strategy owns what agents know; Kernel owns running agents, harnesses, sessions, models, credentials, cost, and runtime mechanics.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Harness** | Kernel runtime boundary around a concrete agent backend. | provider as a synonym for harness, runner, agent runtime provider |
| **Harness adapter** | Implementation that maps HyperIdle session calls to one harness backend. | connector, plugin, provider adapter |
| **Harness capability descriptor** | Queryable declaration of a harness backend's models, options, runtime support, status, and event normalization commitments. | provider config, adapter manifest, backend schema |
| **Model option descriptor** | Generic UI-renderable option declaration for one model on one harness. | settings field, provider knob, custom form field |
| **Normalized harness event** | Backend-native runtime event mapped into HyperIdle's downstream event union. | raw event, provider event |
| **External BYO backend** | User-supplied local or remote backend registered through HyperIdle's adapter pool. | plugin marketplace backend, arbitrary external adapter |

## Contracts

- One descriptor describes exactly one harness type.
- A harness type may have many registered adapter instances; UI-facing capability is deduped by harness type unless a later architecture explicitly adds instance-level status.
- One descriptor has zero or more models; one model has zero or more option descriptors.
- Option control kinds are closed for AM2: `select`, `boolean`, `number`, `text`.
- Normalized runtime events use the existing `HarnessEvent` vocabulary until a future concept update widens it.
- Model tier vocabulary remains `reasoning | workhorse | fast`; backend-specific names are mapped/coerced at the adapter boundary.
- Descriptor identity is `harnessType`, not adapter instance id, display name, binary path, or provider.
- Agent-selected harness/model config is separate durable state and must validate against the current descriptor at edit or launch time.
- Native + external BYO backends are representable; arbitrary marketplace/plugin adapters are out of scope.
- No downstream UI may branch on backend name to render controls that should come from option descriptors.
- Strategy cannot own or mutate harness/model/cost fields.
- Adapters must map backend-native events into normalized events before downstream consumers see them.

## Normalized Harness Events

A **normalized harness event** is a backend runtime event expressed in HyperIdle's downstream event vocabulary before it reaches session activity, cost, or observability consumers.

The downstream event model is the `HarnessEvent` union:

- `tool_call`
- `completion`
- `error`
- `cost_update`
- `token_usage`
- `pre_compaction`

Two backends performing the same logical action must produce indistinguishable normalized event shapes for downstream consumers. Raw provider logs may exist for diagnostics, but UI/session activity code must consume normalized events.

## Rationale

The t3code reference exposes the decision pressure: users need a polished provider/settings surface and lower-level session controls, but HyperIdle cannot let backend differences leak into every UI branch. A declarative descriptor lets AM3 render dial-in controls generically and lets AM4 show detection/onboarding status while preserving the existing Kernel-owned Harness Adapter boundary.
