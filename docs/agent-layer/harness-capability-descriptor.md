# Harness Capability Descriptor

AM2 locks the concept that lets session dial-in, onboarding, and activity views understand harness differences without backend-specific UI branches.

## Definition

A **harness capability descriptor** is the Kernel-owned, queryable declaration of what one registered harness backend can run and how downstream consumers may configure and interpret it.

The descriptor extends the existing Harness Adapter contract. It does not replace `HarnessAdapter.startSession`, `SessionConfig`, the Model Gateway, or `HarnessEvent`; it makes the adapter's selectable models, generic options, runtime support, status, and normalization commitments explicit.

## Scope Decision

AM2 locks **native HyperIdle + external BYO with autodiscovery** harness scope.

Descriptors must represent:

- HyperIdle's own `builtin` harness as a first-class native runtime, not a fallback.
- Native installed harnesses such as `claude-code`.
- Known local coding-agent CLIs that should appear when installed/authenticated: `codex`, `claude-code`, `cursor-agent`, and `opencode`.
- Additional external backends the user already has and HyperIdle can register through the adapter pool, such as local CLI tools (`aider`, `goose`) or remote workers.

Descriptors do not introduce an arbitrary third-party adapter marketplace. External BYO means "autodetected or registered through HyperIdle's adapter pool and normalized by an adapter," not "load unreviewed provider plugins."

<!-- @lore AM2: Harness scope is native HyperIdle + external BYO with autodiscovery, not native-only and not an external-adapter marketplace. The founder explicitly wants the t3code-style "Codex/Claude/Cursor/OpenCode appear once installed/authenticated" flow, while keeping HyperIdle's builtin harness first-class because Strategy can reason about its read-only capabilities. -->

## Essential Properties

Every descriptor declares:

- Stable harness identity: `harnessType`, display name, backend kind, availability, and auth/status signals.
- Available models for the harness: provider, model id, label, context window when known, and whether the model is selectable or inherited from the gateway.
- Per-model options as generic control descriptors, not backend-specific UI code.
- Runtime capabilities relevant to sessions: MCP support, pre-compaction support, subagent support, file editing/tool support, supported providers, and concurrency/status signals.
- Discovery/readiness state for known local harness families: installed, missing, authenticated, unauthenticated, version when available, and unavailable reason.
- Event normalization commitments: how backend-native runtime events map to HyperIdle's downstream event model.

## What It Is Not

- Not a Model Gateway replacement. The gateway still owns model credential resolution and tier fallback.
- Not a session launch request. `SessionConfig` remains the concrete per-run input.
- Not backend-specific UI branching. A UI control renders from option descriptors, not `harnessType` checks.
- Not Strategy-owned knowledge. Harnesses, models, sessions, credentials, cost, and runtime capabilities are Kernel mechanism.
- Not manual backend setup only. Known harnesses are autodetected and surfaced with readiness state; manual configuration is a fallback.
- Not a plugin marketplace.

## Composition

One descriptor attaches to one harness type. It contains zero or more model descriptors. Each model descriptor contains zero or more model option descriptors.

The descriptor also carries autodiscovery state for known local harnesses even when they are not usable yet. AM4 can therefore render "install Codex", "run Claude login", "OpenCode ready", or "Cursor unavailable" from the same contract.

A **model option descriptor** is a declarative control specification for one configurable value on one model within a harness descriptor. AM2 closes the option control vocabulary to:

- `select`
- `boolean`
- `number`
- `text`

Adding another control kind requires a concept-doc update first.

Credential and secret entry are not model options. They belong to credential/onboarding flows; descriptors may report auth status but must not transport secrets.

## Lifecycle

Descriptors and discovery results are live snapshots:

- Discovered when the Kernel probes known harness families (`codex`, `claude-code`, `cursor-agent`, `opencode`) for binary presence, version, and auth/readiness.
- Registered when a discovered or configured adapter is usable enough to enter the adapter pool.
- Reported when UI or services query harness capabilities.
- Changed when adapter availability, local binary detection, CLI auth state, credentials, model catalog, or gateway config changes.
- Retired when the adapter is unregistered or unavailable.

Callers must not treat descriptor snapshots as durable historical records.

## Authority

- Kernel owns descriptor assembly and exposure.
- Harness adapters own backend-native normalization into the descriptor contract.
- Model Gateway owns model catalog and credential resolution data referenced by descriptors.
- UI consumes descriptors; it does not parse backend-native schemas.
- Strategy may consume descriptors as read-only runtime-capability context.
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
| **Harness autodiscovery** | Kernel probe that finds known local harness CLIs and reports install/auth/readiness state. | provider sync, marketplace scan, manual provider setup |
| **Native HyperIdle harness** | HyperIdle's own built-in runtime exposed through the descriptor contract. | fallback harness, internal-only runner |

## Contracts

- One descriptor describes exactly one harness type.
- A harness type may have many registered adapter instances; UI-facing capability is deduped by harness type unless a later architecture explicitly adds instance-level status.
- One descriptor has zero or more models; one model has zero or more option descriptors.
- Option control kinds are closed for AM2: `select`, `boolean`, `number`, `text`.
- Normalized runtime events use the existing `HarnessEvent` vocabulary until a future concept update widens it.
- Model tier vocabulary remains `reasoning | workhorse | fast`; backend-specific names are mapped/coerced at the adapter boundary.
- Descriptor identity is `harnessType`, not adapter instance id, display name, binary path, or provider.
- Agent-selected harness/model config is separate durable state and must validate against the current descriptor at edit or launch time.
- Native HyperIdle + external BYO with autodiscovery is required; `builtin` is first-class, and `codex`, `claude-code`, `cursor-agent`, and `opencode` are AM2's first-class known external harness families.
- Missing or unauthenticated known harnesses still produce descriptor/readiness entries for onboarding; they do not silently disappear.
- Discovery may check binary presence/version and auth/readiness only; it must not start agent work.
- Additional BYO backends may be representable when adapter support exists; arbitrary marketplace/plugin adapters are out of scope.
- No downstream UI may branch on backend name to render controls that should come from option descriptors.
- Strategy can consume descriptors as read-only capability facts, but cannot own or mutate harness/model/cost fields.
- Adapters must map backend-native events into normalized events before downstream consumers see them.

## Harness Autodiscovery

Harness autodiscovery is the Kernel-owned probe that finds known local harness CLIs and reports their install, version, authentication, and readiness state as descriptor data.

AM2's first-class autodiscovery set is closed:

- `codex`
- `claude-code`
- `cursor-agent`
- `opencode`

The probe runs at server/desktop startup and on explicit refresh from onboarding/settings. It may report:

- `missing` — known CLI is not installed or not on PATH.
- `installed` — binary exists, but auth/readiness is unknown or not yet checked.
- `unauthenticated` — binary exists but the user must run the provider login flow.
- `ready` — binary exists and the adapter can start sessions.
- `unavailable` — binary exists but cannot be used, with a reason.

Autodiscovery is not a package manager and not a credential harvester. It may tell the user what to install or which login command to run, but it must not silently install CLIs or copy provider secrets out of their native config.

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

The t3code reference exposes the decision pressure: users need a polished provider/settings surface and lower-level session controls, but HyperIdle cannot let backend differences leak into every UI branch. t3code's README frames the product around Codex, Claude, Cursor, and OpenCode and asks users to install/auth at least one provider; the product expectation is that common harnesses appear once the user has done that. HyperIdle's own `builtin` harness remains equally visible because Strategy can use its read-only capabilities when choosing how work should run. A declarative descriptor plus autodiscovery lets AM3 render dial-in controls generically and lets AM4 show detection/onboarding status while preserving the existing Kernel-owned Harness Adapter boundary.
