# Harness Capability Descriptor

AM2 is not complete until the descriptor is grounded in real harness behavior and proven against real harnesses. The first AM2 implementation attempt produced a useful draft contract, but human review rejected it because it was not based on deep `t3code` source research, did not verify Codex CLI / Claude Code / OpenCode surfaces, and did not prove existing HyperIdle harness interaction code against real installed harnesses or a real API-gateway path.

This document is therefore a concept target and review contract. It is now backed by:

- `plans/AM2/research/t3code-source-map.md` — exact source files/functions for t3code provider/harness discovery, auth, launch, status/version, events, and UI metadata.
- `plans/AM2/research/cli-harness-surface.md` — real CLI versions, auth behavior, and launch options for Codex, Claude Code, OpenCode, and the explicit absence of Cursor.
- `plans/AM2/architecture.md` — evidence-backed plan for the revised descriptor/discovery layer.

## Failed Attempt Notice

The previous AM2 branch must not be treated as merge-ready. It guessed too much:

- It used `t3code` as product inspiration but did not study the open-source integration code for provider discovery, auth, launch, status/version detection, or event handling.
- It listed `codex`, `claude-code`, `cursor-agent`, and `opencode` as known families without proving their actual CLI interaction surfaces.
- It emitted descriptors for missing/known CLIs but did not implement real binary/version/auth/readiness probes.
- It did not prove HyperIdle's own `builtin` API-gateway harness with a real gateway credential.
- It relied on stubs and shape tests for core claims that require real harness integration tests.

AM2 review must fail unless the next architecture and implementation include a traceable evidence chain: real research -> architecture decisions -> descriptor fields -> real integration tests.

## Definition

A **harness capability descriptor** is the Kernel-owned, queryable declaration of what one registered harness backend can run and how downstream consumers may configure and interpret it.

The descriptor extends the existing Harness Adapter contract. It does not replace `HarnessAdapter.startSession`, `SessionConfig`, the Model Gateway, or `HarnessEvent`; it makes the adapter's selectable models, generic options, runtime support, status, and normalization commitments explicit.

A **real harness capability** is a descriptor claim backed by source research, official/local CLI documentation, or a passing real-harness integration test. A desired or guessed capability is not a real capability and must not be reported as ready.

## Scope Decision

AM2 locks **extension-provided harnesses + autodiscovery** harness scope.

Descriptors must represent:

- HyperIdle's own `builtin` harness as a first-class bundled extension, not Kernel-core code and not a fallback. This is the API-gateway/direct-key access path for OpenRouter and similar OpenAI-compatible/provider gateways; users make it ready by entering a key into HyperIdle.
- Native installed harnesses such as `claude-code`.
- Known local coding-agent CLIs that should appear when installed/authenticated: `codex`, `claude-code`, `cursor-agent`, and `opencode`. These are provider-subscription/CLI-auth access paths; users make them ready through a standardized HyperIdle login action that delegates to each CLI's native login method.
- Additional external backends the user already has and HyperIdle can register through the adapter pool, such as local CLI tools (`aider`, `goose`) or remote workers.

Descriptors do not introduce an arbitrary third-party adapter marketplace. External BYO means "autodetected or registered through HyperIdle's adapter pool and normalized by an adapter," not "load unreviewed provider plugins."

<!-- @lore AM2: Harness scope is extension-provided harnesses + autodiscovery. Kernel core owns the contract/registry/admission/cost boundary; concrete harnesses, including HyperIdle's builtin runtime, are harness extensions. Strategy can read descriptor facts and express preferences, but never loads or runs harness extensions. -->

## Required Research Before Architecture

The AM2 architect must produce a research dossier before designing types or implementation tasks.

The dossier must cover:

- `t3code` source code, not just its README. It must identify the source files/functions that handle provider/harness discovery, auth/readiness, launch/session invocation, status/version checks, event/output handling, and UI-facing provider metadata for Codex, Claude, Cursor, and OpenCode.
- Codex CLI documentation and the installed local `codex` binary. It must record binary name, version command, login/readiness behavior, non-interactive launch feasibility, model/option surface, output/event format, and limitations.
- Claude Code documentation and the installed local `claude`/Claude Code surface. It must record version, login/readiness, SDK-vs-CLI boundaries, session launch, options, output/event format, and limitations.
- OpenCode documentation and the installed local `opencode` binary. It must record version, auth/readiness, launch, options, output/event format, and limitations.
- Cursor Agent through `t3code` and available documentation. If no usable local CLI/API surface exists, the dossier must say so explicitly and mark implementation as unavailable rather than guessed.
- HyperIdle's existing `builtin`, `claude-code`, and CLI harness code. The dossier must identify which paths are proven, which are unproven, and which have never worked against real harnesses.

No architecture is acceptable if it starts from a preferred descriptor shape and backfills facts later.

## Essential Properties

Every descriptor declares:

- Stable harness identity: `harnessType`, display name, backend kind, availability, and auth/status signals.
- Available models for the harness: provider, model id, label, context window when known, and whether the model is selectable or inherited from the gateway.
- Access mode: API-gateway/direct-key access or provider-subscription/CLI-auth access.
- Auth/onboarding action: key entry for API-gateway harnesses or login delegation for CLI-backed harnesses.
- Per-model options as generic control descriptors, not backend-specific UI code.
- Runtime capabilities relevant to sessions: MCP support, pre-compaction support, subagent support, file editing/tool support, supported providers, and concurrency/status signals.
- Discovery/readiness state for known local harness families: installed, missing, authenticated, unauthenticated, version when available, and unavailable reason.
- Event normalization commitments: how backend-native runtime events map to HyperIdle's downstream event model.
- Evidence status for readiness/capability claims: ready claims require real proof; unproven claims must be omitted or marked unknown/unavailable.

## Draft Surface From The Failed Attempt

The first AM2 attempt added the following draft surface. It is useful as a starting point, but it is not sufficient for completion because the real harness evidence is missing:

| Surface | File | Responsibility |
|---|---|---|
| Shared descriptor types | `packages/shared/src/harness/harness-capability-descriptor.ts` | Closed control kinds, access modes, auth actions, discovery states, model descriptors, runtime flags. |
| Adapter capability extension | `packages/shared/src/harness/harness-adapter.ts` | Keeps existing required runtime flags and adds optional descriptor fields for richer harness extensions. |
| Descriptor builders | `packages/server/src/harness/harness-capability-descriptors.ts` | Maps registered adapters into descriptors and emits missing descriptors for `codex`, `claude-code`, `cursor-agent`, and `opencode`. |
| Registry query | `AdapterPool.listCapabilityDescriptors()` | Dedupes by harness type and combines registered adapters with known missing harness families. |
| UI-queryable route | `GET /api/harnesses` | Returns `HarnessCapabilityDescriptor[]` while preserving top-level `type`, `name`, and `modelProviders` for existing selectors. |

The draft `builtin` descriptor reports `accessMode: "api-gateway"` and an `enter_api_key` auth action for HyperIdle-managed API keys such as OpenRouter or OpenAI-compatible gateways. Known CLI harnesses report `accessMode: "provider-subscription-cli"` and a `native_cli_login` auth action that names the CLI login command without executing it.

The route exposes non-secret capability data only. It must not include API keys, base URLs, provider subscription tokens, or copied CLI credentials.

Before AM2 can merge, this surface must be revised or replaced based on the required research and real integration tests.

## What It Is Not

- Not a Model Gateway replacement. The gateway still owns model credential resolution and tier fallback.
- Not a session launch request. `SessionConfig` remains the concrete per-run input.
- Not backend-specific UI branching. A UI control renders from option descriptors, not `harnessType` checks.
- Not Kernel-core provider logic. Concrete harness implementations are provided by harness extensions.
- Not Strategy-owned knowledge. Harnesses, models, sessions, credentials, cost, and runtime capabilities are Kernel-governed mechanism.
- Not manual backend setup only. Known harnesses are autodetected and surfaced with readiness state; manual configuration is a fallback.
- Not a claim that all harnesses access models the same way. `builtin` uses HyperIdle-managed API credentials/gateways; autodiscovered CLIs use the provider's own subscription/auth layer.
- Not one universal credential backend. API keys are stored through HyperIdle's credential flow; provider subscription tokens remain owned by the native CLI.
- Not a plugin marketplace.

## Composition

One descriptor attaches to one harness type. It contains zero or more model descriptors. Each model descriptor contains zero or more model option descriptors.

A **harness extension** is the registered package/module that supplies a concrete harness implementation and descriptor mapper. The first-party `builtin` runtime is a bundled API-gateway/direct-key harness extension. External CLI-backed harnesses are provider-subscription/CLI-auth extensions once registered.

A **harness auth action** is the generic onboarding action exposed to UI. For `builtin` and similar API-gateway harnesses, it is key entry/storage. For CLI-backed harnesses, it invokes the adapter's native login delegation, such as that CLI's own login command or browser flow.

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
- Registered when a discovered or configured harness extension is usable enough to enter the adapter pool.
- Reported when UI or services query harness capabilities.
- Changed when adapter availability, local binary detection, CLI auth state, credentials, model catalog, or gateway config changes.
- Retired when the adapter is unregistered or unavailable.

Callers must not treat descriptor snapshots as durable historical records.

## Authority

- Kernel core owns descriptor aggregation, exposure, registry policy, session admission, sandbox boundaries, and cost enforcement.
- Harness extensions own concrete backend implementation and backend-native normalization into the descriptor contract.
- Model Gateway owns model catalog and credential resolution data referenced by descriptors.
- UI consumes descriptors; it does not parse backend-native schemas.
- Strategy may consume descriptors as read-only runtime-capability context.
- Strategy may express harness capability requirements or preferences when selecting an agent/session path.
- Strategy must not install extensions, produce descriptors, mutate descriptor content, or bypass Kernel admission.

This follows the Kernel/Strategy split: Strategy owns what agents know; Kernel owns running agents, harnesses, sessions, models, credentials, cost, and runtime mechanics.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Harness** | Kernel runtime boundary around a concrete agent backend. | provider as a synonym for harness, runner, agent runtime provider |
| **Harness adapter** | Implementation that maps HyperIdle session calls to one harness backend. | connector, plugin, provider adapter |
| **Harness extension** | Registered package/module that supplies a concrete harness adapter and descriptor mapper. | Kernel harness, Strategy harness |
| **Harness capability descriptor** | Queryable declaration of a harness backend's models, options, runtime support, status, and event normalization commitments. | provider config, adapter manifest, backend schema |
| **Model option descriptor** | Generic UI-renderable option declaration for one model on one harness. | settings field, provider knob, custom form field |
| **Normalized harness event** | Backend-native runtime event mapped into HyperIdle's downstream event union. | raw event, provider event |
| **External BYO backend** | User-supplied local or remote backend registered through HyperIdle's adapter pool. | plugin marketplace backend, arbitrary external adapter |
| **Harness autodiscovery** | Kernel probe that finds known local harness CLIs and reports install/auth/readiness state. | provider sync, marketplace scan, manual provider setup |
| **First-party HyperIdle harness extension** | HyperIdle's own API-gateway/direct-key runtime shipped as a bundled harness extension. | fallback harness, internal-only runner, Kernel harness |
| **Harness access mode** | How a harness obtains model access: API gateway/direct credentials or provider subscription/CLI auth. | billing mode, provider type |
| **Harness auth action** | Generic onboarding action for making a harness usable: enter/store a key or invoke native CLI login. | provider login button, credential form |

## Contracts

- One descriptor describes exactly one harness type.
- A harness type may have many registered adapter instances; UI-facing capability is deduped by harness type unless a later architecture explicitly adds instance-level status.
- One descriptor has zero or more models; one model has zero or more option descriptors.
- Option control kinds are closed for AM2: `select`, `boolean`, `number`, `text`.
- Normalized runtime events use the existing `HarnessEvent` vocabulary until a future concept update widens it.
- Model tier vocabulary remains `reasoning | workhorse | fast`; backend-specific names are mapped/coerced at the adapter boundary.
- Descriptor identity is `harnessType`, not adapter instance id, display name, binary path, or provider.
- Agent-selected harness/model config is separate durable state and must validate against the current descriptor at edit or launch time.
- All concrete harnesses are extension-provided; `builtin` is a first-party bundled extension, not Kernel-core implementation.
- `builtin` is the first-party API-gateway/direct-key harness for OpenRouter and similar model gateways; autodiscovered CLIs are provider-subscription/CLI-auth harnesses.
- `codex`, `claude-code`, `cursor-agent`, and `opencode` are AM2's first-class known external harness families.
- Missing or unauthenticated known harnesses still produce descriptor/readiness entries for onboarding; they do not silently disappear.
- Discovery may check binary presence/version and auth/readiness only; it must not start agent work.
- API-gateway harnesses authenticate through HyperIdle credential entry/storage; CLI-backed harnesses authenticate through a standardized HyperIdle action that invokes the CLI's native login method.
- HyperIdle must not copy subscription tokens out of provider CLI config; readiness is observed, not re-owned.
- Additional BYO backends may be representable when adapter support exists; arbitrary marketplace/plugin adapters are out of scope.
- No downstream UI may branch on backend name to render controls that should come from option descriptors.
- Strategy can consume descriptors as read-only capability facts and express capability preferences, but cannot install harness extensions, own/mutate harness/model/cost fields, or run harnesses directly.
- Adding a specific new harness is extension work; Kernel-core changes are limited to contract evolution, registry policy, or security/admission rules.
- Adapters must map backend-native events into normalized events before downstream consumers see them.
- A descriptor field may only claim `ready` or claim support for a concrete runtime capability when the AM2 evidence chain proves it through research or real integration tests.
- Stub-only tests cannot prove AM2's core harness claims. Real binary/gateway integration tests are required, with precise skips only when a binary, login, or credential is absent.
- Captured real output fixtures must back event normalization for each supported real harness family.
- Existing HyperIdle harness code is presumed unproven until AM2 validates it against real installed harnesses or a real configured gateway.
- The reviewer must reject AM2 if the research dossier is missing, if descriptor claims cannot be traced to the dossier, or if real integration tests are replaced by stubs.

## Harness Extensions

A **harness extension** is a registered package/module that supplies a concrete harness implementation plus descriptor and event-normalization mapping to the Kernel harness registry.

Extensions may be:

- **First-party bundled** — shipped with HyperIdle, such as the `builtin` API-gateway/direct-key runtime.
- **External BYO** — deployment-configured or autodetected adapters around local CLIs / remote workers, typically using provider subscriptions through native CLI auth.

Kernel core hosts and gates extensions. It owns the registry, admission checks, sandbox/cost boundaries, and extension trust policy. Extensions own backend-specific behavior. Strategy can ask for capabilities and rank choices, but it never loads or invokes extension code directly.

AM2's extension trust/loading policy is closed: first-party bundled and deployment-configured BYO only. A public marketplace or arbitrary plugin loading requires a later concept update.

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

For CLI-backed harnesses, the descriptor exposes one standardized login action; the adapter maps that action to the CLI's native login method. For API-gateway harnesses, onboarding is key entry into HyperIdle's credential store.

Autodiscovery is not a package manager and not a credential harvester. It may tell the user what to install or which login command to run, but it must not silently install CLIs or copy provider secrets out of their native config.

Autodiscovery is also not a guess. Each probe must be designed from real CLI behavior observed in the research dossier. A generic `which`/PATH check is only binary presence; it does not prove auth, readiness, supported options, launchability, or event shape.

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

AM2 adds `normalizeHarnessEvent(input)` in `packages/shared/src/harness/harness-event-normalization.ts`. The CLI harness adapter uses it when parsing NDJSON event lines, so backend-specific payloads are reduced to the existing event union before downstream consumers see them. Unknown event types become a normalized `error` event with code `UnknownHarnessEvent`; completion events preserve captured `toolCalls` when present.

## Rationale

The t3code reference exposes the decision pressure: users need a polished provider/settings surface and lower-level session controls, but HyperIdle cannot let backend differences leak into every UI branch. The initial AM2 mistake was treating that product-level insight as enough. It is not enough. HyperIdle must study how t3code actually integrates harnesses and must study/prove the real CLIs before claiming support. HyperIdle's own first-party harness remains equally visible because it opens a different access path: OpenRouter and similar API gateways through HyperIdle-managed credentials/model routing, instead of a provider subscription exposed through a native CLI. The onboarding shape follows from that split only after proof: for `builtin`, paste a gateway key into HyperIdle and prove a real gateway call; for CLI harnesses, expose one consistent login/readiness action only after verifying the CLI's native method. A declarative descriptor plus autodiscovery lets AM3 render dial-in controls generically and lets AM4 show detection/onboarding status, but only if descriptor facts are real.
