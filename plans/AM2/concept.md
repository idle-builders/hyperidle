# AM2 Concept — Harness Capability Descriptor

## Required Reading

Downstream `/architecture` and `/pipeline` phases must read:

- `.pipeline/work-packages/TRACK-AM.md` § AM2 — Harness capability descriptor & normalization.
- `docs/architecture/kernel-strategy-split.md` §§ 1, 2a, 6 — Kernel/Strategy boundary and locked harness vocabulary.
- `docs/architecture/components.md` § 2.7 — Harness Adapter boundary.
- `docs/architecture/key-interfaces-between-components.md` § 4.2 — Process Layer to Harness flow.
- `docs/agent-layer/model-routing-and-cost.md` § 6 — model routing, tier fallback, and closed tier vocabulary.
- `docs/process-layer/canonical-shapes.md` § Money and TokenUsage shapes — token tier accounting and unknown-tier coercion.
- `docs/agent-layer/harness-error-taxonomy.md` — canonical harness error names.
- `docs/agent-layer/harness-capability-descriptor.md` — ground truth for this concept.
- `packages/shared/src/harness/harness-adapter.ts` — current `HarnessAdapter`, `SessionConfig`, `HarnessCapabilities`, and `SessionResult` boundary.
- `packages/shared/src/harness/harness-events.ts` — current normalized runtime event union.
- `packages/shared/src/model-gateway.ts` — closed model catalog and provider vocabulary.
- `packages/shared/src/strategy-port.ts` — proof that model/harness mechanism is Kernel-owned, not Strategy-owned.
- `packages/server/src/harness/adapter-pool.ts` — current native and external BYO adapter registration shape.
- `packages/server/src/routes/harnesses.ts` — existing UI-queryable harness registry route.
- t3code reference (`https://github.com/pingdotgg/t3code`) — external inspiration: a minimal coding-agent GUI that currently supports Codex, Claude, Cursor, and OpenCode, with install/auth-first provider setup.

## Phase 0 — Nouns

| Noun | Working definition | Classification |
|---|---|---|
| **Harness** | The Kernel-owned runtime boundary that starts, streams, and stops agent sessions through a concrete backend. | Reshaped concept — already exists, but AM2 adds declarative capability disclosure as part of the contract. |
| **Harness capability descriptor** | A queryable declaration of one harness backend's models, options, runtime support, status, and event normalization commitments. | New primitive — no current descriptor is rich enough to render controls from. |
| **Model option descriptor** | A generic UI-renderable option declaration for one model on one harness. | New satellite concept. |
| **Normalized harness event** | A backend-native runtime event mapped into HyperIdle's closed downstream event model. | Reshaped concept — `HarnessEvent` already exists; AM2 makes the normalization boundary explicit. |
| **Harness autodiscovery** | Kernel detection of known local harness CLIs and auth/readiness state, producing descriptors and onboarding status without manual backend setup. | New satellite concept. |
| **Native HyperIdle harness** | HyperIdle's own built-in agent runtime, exposed through the same descriptor contract as external harnesses. | Reshaped concept — already exists as `builtin`, but AM2 makes it strategically visible instead of treating it as a fallback. |
| **Harness scope** | The strategic answer to which backends descriptors must represent. | New decision, locked here for AM3/AM4. |

## Harness Capability Descriptor Primitive

**Definition.** A harness capability descriptor is the Kernel-owned, queryable declaration of what one registered harness backend can run and how downstream consumers may configure and interpret it.

**Essential properties.**

- Declares a stable harness identity: `harnessType`, display name, backend kind, and availability/auth status.
- Declares available models for that harness, including provider, model id, label, context window when known, and whether the model is selectable or inherited from the gateway.
- Declares per-model options as generic control descriptors, not backend-specific UI code.
- Declares runtime capabilities already relevant to session behavior: MCP support, pre-compaction support, subagent support, file editing/tool support, supported providers, and concurrency/status signals.
- Declares discovery/readiness state for known backends: installed, missing, authenticated, unauthenticated, version when available, and why a backend is unavailable.
- Declares how backend-native events normalize into HyperIdle's downstream event model.
- Is readable by the UI and future onboarding flows without importing adapter-specific code.

**Harness-scope decision.** AM2 locks **native HyperIdle + external BYO with autodiscovery** scope. HyperIdle's own `builtin` harness remains first-class because it is strategically interesting: Strategy can reason about its read-only capabilities when selecting or shaping work, while the Kernel still owns harness execution. Descriptors must also represent native installed harnesses such as `claude-code` and autodetected external backends the user already has locally or remotely when they are registered through the adapter pool. The first-class autodiscovery set is `codex`, `claude-code`, `cursor-agent`, and `opencode`, matching the t3code-style "install/auth and it appears" flow. Existing/provisional local adapters such as `aider` and `goose` may still be represented when present, but they are not the founder-cited must-detect set. AM2 does not introduce an external-adapter marketplace or arbitrary third-party plugin protocol.

**What it is not.**

- Not a model gateway replacement. The gateway still resolves model credentials and tier fallback; the descriptor only declares selectable/runtime shape.
- Not a session launch request. It describes possible configuration; `SessionConfig` remains the concrete per-run input.
- Not backend-specific UI branching. A React control must render from option descriptors without checking `if harnessType === "claude-code"`.
- Not manual backend setup only. Known local harnesses must be autodetected and surfaced with readiness state; manual config is a fallback for unsupported or remote cases.
- Not an open plugin marketplace. External BYO means detected/registered local or remote backends normalized by adapters, not loading arbitrary unreviewed provider code.
- Not Strategy-owned knowledge. Harnesses, models, credentials, sessions, cost, and runtime capability disclosure are Kernel mechanism; Strategy may consume descriptor facts read-only but cannot produce or mutate them.

**Composition.**

- Attaches to exactly one registered harness type.
- Contains zero or more model descriptors.
- Each model descriptor contains zero or more model option descriptors.
- Contains autodiscovery status for known local harness families even when the backend is not yet usable, so onboarding can say "install", "login", or "ready" instead of hiding the backend.
- References model-provider vocabulary from `docs/agent-layer/model-routing-and-cost.md` and `packages/shared/src/model-gateway.ts`.
- References normalized event types from `packages/shared/src/harness/harness-events.ts`.
- Feeds AM3 session dial-in controls and AM4 detection/onboarding surfaces.
- Feeds Strategy as read-only runtime-capability context where the Strategy needs to choose which agent/work pattern fits a session, without making Strategy responsible for harness execution.

**Lifecycle.**

- **Discovered** when the Kernel probes known harness families (`codex`, `claude-code`, `cursor-agent`, `opencode`) for binary presence, version, and authentication/readiness.
- **Registered** when a discovered or configured adapter is usable enough to enter the adapter pool.
- **Reported** when a UI or service queries harness capabilities.
- **Changed** when an adapter reconnects, local binary availability changes, credentials/auth status changes, a user logs in/out of a harness CLI, or the server's model catalog/gateway config changes.
- **Retired** when the adapter is unregistered or unavailable.
- Descriptors are live snapshots, not durable historical records.

**Authority.**

- The Kernel owns descriptor assembly and exposure.
- Individual harness adapters own backend-specific normalization into the descriptor contract.
- The model gateway owns model catalog and credential resolution data that descriptors reference.
- The UI consumes descriptors; it does not interpret backend-native concepts directly.
- Strategy may read descriptor content as runtime-capability context for selection/planning.
- Strategy must not produce or mutate descriptor content.

**Vocabulary.**

| Term | Definition | Aliases not to use |
|---|---|---|
| **Harness** | Kernel runtime boundary around a concrete agent backend. | provider as a synonym for harness, runner, agent runtime provider |
| **Harness adapter** | The implementation that maps HyperIdle session calls to one harness backend. | connector, plugin, provider adapter |
| **Harness capability descriptor** | Queryable declaration of a harness backend's models, options, runtime support, status, and event normalization commitments. | provider config, adapter manifest, backend schema |
| **Model option descriptor** | Generic UI-renderable option declaration for one model on one harness. | settings field, provider knob, custom form field |
| **Normalized harness event** | Backend-native runtime event mapped into HyperIdle's downstream event union. | raw event, provider event |
| **External BYO backend** | User-supplied local or remote backend registered through HyperIdle's adapter pool. | plugin marketplace backend, arbitrary external adapter |
| **Harness autodiscovery** | Kernel probe that finds known local harness CLIs and reports install/auth/readiness state. | provider sync, marketplace scan, manual provider setup |
| **Native HyperIdle harness** | HyperIdle's own built-in runtime exposed through the descriptor contract. | fallback harness, internal-only runner |

**Contracts.**

- Cardinality: one descriptor describes exactly one harness type; a harness type may have many registered adapter instances, but UI-facing capability is deduped by harness type unless architecture explicitly adds instance-level status.
- Cardinality: one descriptor has zero or more models; one model has zero or more option descriptors.
- Closure: option control kinds are closed for AM2 (`select`, `boolean`, `number`, `text`) so generic UI rendering stays exhaustive; adding a control kind requires a concept/doc update.
- Closure: normalized event types remain the existing `HarnessEvent` vocabulary until a future concept update widens it.
- Closure: model tier vocabulary remains `reasoning | workhorse | fast`; backend-specific names must be mapped/coerced at the adapter boundary.
- Mutability: descriptors are live snapshots; callers must not treat them as persisted config.
- Mutability: an agent's selected harness/model config is separate durable state and must validate against the current descriptor at edit or launch time.
- Identity: descriptor identity is `harnessType`, not adapter instance id, display name, binary path, or provider.
- Scope: native HyperIdle + external BYO with autodiscovery is required; `builtin` is first-class and `codex`, `claude-code`, `cursor-agent`, and `opencode` are the first-class known external harness families AM2 must be able to report.
- Scope: additional BYO backends may be representable when adapter support exists; arbitrary third-party marketplace/plugin adapters are out of scope.
- Autodiscovery: missing or unauthenticated known harnesses still produce descriptor/readiness entries for onboarding; they do not silently disappear.
- Autodiscovery: detection never shells out to run agent work; it may check binary presence/version and auth/readiness only.
- Hard rule: no downstream UI may branch on backend name to render controls that should come from option descriptors.
- Hard rule: Strategy can consume descriptors as read-only capability facts, but cannot own or mutate harness/model/cost fields; descriptor production is Kernel mechanism.
- Hard rule: adapters must map backend-native events into normalized events before downstream consumers see them.

**Rationale.** The founder's t3code reference points at two different desires: a polished provider/settings surface and session controls that do not hard-code backend differences. t3code's public README frames the product around Codex, Claude, Cursor, and OpenCode and tells users to install/auth at least one provider; the experience expectation is that common harnesses are found and become usable rather than manually redefined inside the app. HyperIdle also has a strategically important native harness: it is the only runtime whose capabilities HyperIdle can evolve in lockstep with Strategy, so it must not be demoted to fallback while external CLIs get the polished path. Native-only would contradict the existing BYO direction and external-adapter marketplace would overreach AM2. The right concept is a Kernel-owned descriptor plus autodiscovery pass that makes native and known external backends legible, ready-state-aware, and configurable without leaking native schemas into UI code.

## Harness Autodiscovery

**Definition.** Harness autodiscovery is the Kernel-owned probe that finds known local harness CLIs and reports their install, version, authentication, and readiness state as descriptor data.

**Essential properties.**

- Knows a closed first-class family set for AM2: `codex`, `claude-code`, `cursor-agent`, `opencode`.
- Checks binary presence and version where the CLI supports it.
- Checks authentication/readiness without starting a work session.
- Reports missing and unauthenticated harnesses as onboarding states, not only usable adapters.
- Produces enough descriptor data for AM4 to show "install", "login", "ready", or "unavailable with reason".

**What it is not.**

- Not a package manager. It may tell the user what to install; it does not silently install CLIs.
- Not a credential harvester. It reports auth readiness but does not read or store provider secrets from CLI config.
- Not a session smoke test. Launching real agent work belongs to explicit verification or session start, not discovery.
- Not an unbounded PATH scan. Only known harness families are probed unless architecture later adds a reviewed registry.

**Composition.** Autodiscovery feeds harness descriptors and AM4 onboarding. A discovered-ready backend may also register a runnable adapter in the adapter pool.

**Lifecycle.** Runs at server/desktop startup and on explicit refresh from onboarding/settings. Results are snapshots and can change when the user installs, upgrades, logs into, or removes a CLI.

**Authority.** Kernel owns the probe list and readiness semantics. Each adapter owns backend-specific details for its CLI family.

**Vocabulary.**

| Term | Definition | Aliases not to use |
|---|---|---|
| **Discovered harness** | Known harness family found on the local machine or reported by a remote worker. | installed provider, detected provider |
| **Readiness state** | Install/auth/usability status used by onboarding and descriptor consumers. | health as a synonym for readiness |

**Contracts.**

- Closure: AM2's first-class autodiscovery family set is closed: `codex`, `claude-code`, `cursor-agent`, `opencode`.
- Mutability: discovery results are live snapshots; durable user choices are stored separately.
- Identity: discovered harness identity uses canonical `harnessType`, not binary path.
- Hard rule: missing and unauthenticated first-class harnesses remain visible to onboarding with actionable status.
- Hard rule: discovery must not execute arbitrary provider code beyond bounded version/readiness probes.

**Rationale.** This is the exact t3code lesson the founder called out: common coding-agent harnesses should "just work" once installed and authenticated. HyperIdle should preserve user sovereignty by surfacing what is present and what needs login, while keeping actual install/auth choices explicit.

## Model Option Descriptor

**Definition.** A model option descriptor is a declarative control specification for one configurable value on one model within a harness descriptor.

**Essential properties.**

- Has a stable option key unique within the model.
- Declares a generic control kind (`select`, `boolean`, `number`, `text`).
- Declares label/help text suitable for UI display.
- Declares default/current value semantics, valid choices/ranges where applicable, and whether the option is required.
- Declares whether the value is launch-time only or durable agent configuration.

**What it is not.**

- Not arbitrary JSON Schema; AM2 needs a small exhaustive control vocabulary, not a full form language.
- Not a secret transport; credential entry/status belongs to credential/onboarding flows.
- Not model routing logic; it does not choose a model for a session.

**Composition.** It belongs to one model descriptor and may reference closed vocabularies such as reasoning effort, permission mode, or session mode when the harness supports them.

**Lifecycle.** Created and changed with the parent descriptor snapshot.

**Authority.** The adapter maps backend-native knobs into generic descriptors; the UI renders them.

**Vocabulary.**

| Term | Definition | Aliases not to use |
|---|---|---|
| **Control kind** | Closed UI-rendering kind for an option descriptor. | component type, widget class |
| **Choice** | One selectable value in a `select` option. | enum member when displayed to users |

**Contracts.**

- Cardinality: an option descriptor belongs to exactly one model descriptor.
- Closure: control kinds are closed; choice values for a `select` are closed within that descriptor snapshot.
- Mutability: option descriptors are immutable within a returned snapshot.
- Identity: option key is stable within a model; consumers persist values by key, not label.
- Hard rule: credentials and secrets are not model option values.

**Rationale.** AM3 needs controls generated from capability data. A small closed control vocabulary gives architecture enough room for reasoning effort, permission, and mode without turning the descriptor into an unbounded dynamic-form platform.

## Normalized Harness Event

**Definition.** A normalized harness event is a backend runtime event expressed in HyperIdle's closed downstream event vocabulary before it reaches session activity, cost, or observability consumers.

**Essential properties.**

- Uses the `HarnessEvent` union as the downstream shape.
- Represents the same logical action identically across backends.
- Carries backend-specific detail only where the normalized event type allows it.
- Preserves cost and token accounting semantics, including tier coercion rules.

**What it is not.**

- Not a raw provider log. Raw logs may exist for diagnostics, but downstream session activity consumes normalized events.
- Not a UI view model. AM3 may project events for display, but the normalization model is lower-level.
- Not a lossless archive of every backend detail. Normalization intentionally hides differences that should not matter downstream.

**Composition.** Normalized events attach to a session stream and are consumed by provisioning, activity, cost, and observability code.

**Lifecycle.** Emitted during an active session; completion/error/cost events may be terminal or summary events depending on adapter behavior.

**Authority.** Harness adapters own native-to-normalized mapping; downstream consumers must not parse backend-native streams.

**Vocabulary.**

| Term | Definition | Aliases not to use |
|---|---|---|
| **Normalized harness event** | Backend runtime event mapped into HyperIdle's downstream event model. | native event, provider log |
| **Native event** | Backend-specific runtime signal before adapter mapping. | normalized event |

**Contracts.**

- Cardinality: every downstream-visible runtime action from a harness is represented as zero or one normalized event; adapter-only diagnostics may stay out of band.
- Closure: downstream event types are closed by `HarnessEvent`; adding a type requires concept and architecture updates.
- Mutability: emitted events are append-only observations.
- Identity: event identity is stream position plus session id unless architecture adds explicit ids.
- Hard rule: two backends performing the same logical action must produce indistinguishable normalized event shapes for downstream consumers.

**Rationale.** AM1/AM3 need a uniform "what happened" view. That view cannot be uniform if downstream code learns each backend's native event vocabulary.

## Concept Self-Critique

- Rejection list covers distinct risks: model-gateway replacement, session config confusion, UI branching, plugin marketplace overreach, and Strategy ownership leakage.
- Vocabulary collision checked against docs and code: "harness", "session", "Strategy", "model tier", and "adapter" already exist; the chosen terms extend those instead of renaming them.
- Contracts specify cardinality, closure, mutability, identity, and hard rules for all New/Reshaped nouns.
- Ground-truth update belongs in `docs/agent-layer/harness-capability-descriptor.md` because this is an agent-runtime/harness concept, with architecture docs referenced rather than duplicated.
- No UI design forecast change: AM2 remains backend/contract substrate and has no rendered component.
