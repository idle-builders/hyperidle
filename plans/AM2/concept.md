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

## Phase 0 — Nouns

| Noun | Working definition | Classification |
|---|---|---|
| **Harness** | The Kernel-owned runtime boundary that starts, streams, and stops agent sessions through a concrete backend. | Reshaped concept — already exists, but AM2 adds declarative capability disclosure as part of the contract. |
| **Harness capability descriptor** | A queryable declaration of one harness backend's models, options, runtime support, status, and event normalization commitments. | New primitive — no current descriptor is rich enough to render controls from. |
| **Model option descriptor** | A generic UI-renderable option declaration for one model on one harness. | New satellite concept. |
| **Normalized harness event** | A backend-native runtime event mapped into HyperIdle's closed downstream event model. | Reshaped concept — `HarnessEvent` already exists; AM2 makes the normalization boundary explicit. |
| **Harness scope** | The strategic answer to which backends descriptors must represent. | New decision, locked here for AM3/AM4. |

## Harness Capability Descriptor Primitive

**Definition.** A harness capability descriptor is the Kernel-owned, queryable declaration of what one registered harness backend can run and how downstream consumers may configure and interpret it.

**Essential properties.**

- Declares a stable harness identity: `harnessType`, display name, backend kind, and availability/auth status.
- Declares available models for that harness, including provider, model id, label, context window when known, and whether the model is selectable or inherited from the gateway.
- Declares per-model options as generic control descriptors, not backend-specific UI code.
- Declares runtime capabilities already relevant to session behavior: MCP support, pre-compaction support, subagent support, file editing/tool support, supported providers, and concurrency/status signals.
- Declares how backend-native events normalize into HyperIdle's downstream event model.
- Is readable by the UI and future onboarding flows without importing adapter-specific code.

**Harness-scope decision.** AM2 locks **native + external BYO** scope. HyperIdle descriptors must represent native HyperIdle harnesses (`builtin`, `claude-code`) and external backends the user already has locally or remotely when they are registered through the adapter pool (`aider`, `goose`, `opencode`, remote workers). AM2 does not introduce an external-adapter marketplace or arbitrary third-party plugin protocol.

**What it is not.**

- Not a model gateway replacement. The gateway still resolves model credentials and tier fallback; the descriptor only declares selectable/runtime shape.
- Not a session launch request. It describes possible configuration; `SessionConfig` remains the concrete per-run input.
- Not backend-specific UI branching. A React control must render from option descriptors without checking `if harnessType === "claude-code"`.
- Not an open plugin marketplace. External BYO means detected/registered local or remote backends normalized by adapters, not loading arbitrary unreviewed provider code.
- Not Strategy-owned knowledge. Harnesses, models, credentials, sessions, cost, and runtime capability disclosure are Kernel mechanism.

**Composition.**

- Attaches to exactly one registered harness type.
- Contains zero or more model descriptors.
- Each model descriptor contains zero or more model option descriptors.
- References model-provider vocabulary from `docs/agent-layer/model-routing-and-cost.md` and `packages/shared/src/model-gateway.ts`.
- References normalized event types from `packages/shared/src/harness/harness-events.ts`.
- Feeds AM3 session dial-in controls and AM4 detection/onboarding surfaces.

**Lifecycle.**

- **Registered** when an adapter enters the adapter pool.
- **Reported** when a UI or service queries harness capabilities.
- **Changed** when an adapter reconnects, local binary availability changes, credentials/auth status changes, or the server's model catalog/gateway config changes.
- **Retired** when the adapter is unregistered or unavailable.
- Descriptors are live snapshots, not durable historical records.

**Authority.**

- The Kernel owns descriptor assembly and exposure.
- Individual harness adapters own backend-specific normalization into the descriptor contract.
- The model gateway owns model catalog and credential resolution data that descriptors reference.
- The UI consumes descriptors; it does not interpret backend-native concepts directly.
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

**Contracts.**

- Cardinality: one descriptor describes exactly one harness type; a harness type may have many registered adapter instances, but UI-facing capability is deduped by harness type unless architecture explicitly adds instance-level status.
- Cardinality: one descriptor has zero or more models; one model has zero or more option descriptors.
- Closure: option control kinds are closed for AM2 (`select`, `boolean`, `number`, `text`) so generic UI rendering stays exhaustive; adding a control kind requires a concept/doc update.
- Closure: normalized event types remain the existing `HarnessEvent` vocabulary until a future concept update widens it.
- Closure: model tier vocabulary remains `reasoning | workhorse | fast`; backend-specific names must be mapped/coerced at the adapter boundary.
- Mutability: descriptors are live snapshots; callers must not treat them as persisted config.
- Mutability: an agent's selected harness/model config is separate durable state and must validate against the current descriptor at edit or launch time.
- Identity: descriptor identity is `harnessType`, not adapter instance id, display name, binary path, or provider.
- Scope: native + external BYO backends are representable; arbitrary third-party marketplace/plugin adapters are out of scope.
- Hard rule: no downstream UI may branch on backend name to render controls that should come from option descriptors.
- Hard rule: Strategy cannot own or mutate harness/model/cost fields; descriptor production is Kernel mechanism.
- Hard rule: adapters must map backend-native events into normalized events before downstream consumers see them.

**Rationale.** The founder's t3code reference points at two different desires: a polished provider/settings surface and session controls that do not hard-code backend differences. HyperIdle already has live native and BYO-like adapter paths (`builtin`, `claude-code`, CLI tools, remote workers), so native-only would contradict the existing direction and external-adapter marketplace would overreach AM2. The right concept is a Kernel-owned descriptor that makes registered backends legible and configurable without leaking their native schemas into UI code.

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
