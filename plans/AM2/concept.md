# AM2 Concept — Real Harness Capability Descriptor

## Human Review Verdict

AM2 failed human review. The previous concept and implementation are incomplete and must not merge as a finished workpackage.

The failure is conceptual, not only implementation detail: AM2 treated harness capability as a descriptor shape before proving what the real harnesses can do. The revised AM2 concept is that a harness capability descriptor is only valid when its claims are grounded in real harness research and proven by real harness integration tests.

## Required Reading

Downstream `/architecture`, `/architecture-critique`, `/write-tests`, `/write-code`, and `/review` must read:

- `.pipeline/work-packages/TRACK-AM.md` § AM2 — revised workpackage with failed-review notice and real-harness proof ACs.
- `docs/agent-layer/harness-capability-descriptor.md` — ground truth and failed-attempt notice.
- `docs/architecture/kernel-strategy-split.md` §§ 1, 2a, 6 — Kernel/Strategy boundary and harness vocabulary.
- `docs/architecture/components.md` § 2.7 — Harness Adapter boundary.
- `docs/agent-layer/model-routing-and-cost.md` § 6 — model routing and tier fallback.
- `docs/process-layer/canonical-shapes.md` Money and TokenUsage entries.
- `docs/agent-layer/harness-error-taxonomy.md` — canonical harness error names.
- `packages/shared/src/harness/harness-adapter.ts` — current adapter/session boundary.
- `packages/shared/src/harness/harness-events.ts` — current downstream event union.
- `packages/server/src/harness/adapter-pool.ts` — current adapter registration/discovery shape.
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` — existing Claude path, currently not enough proof by itself.
- `packages/server/src/harness/cli-harness-adapter.ts` — existing generic CLI path, currently not enough proof by itself.
- `packages/server/src/harness/builtin-harness-adapter.ts` — HyperIdle API-gateway path, currently must be proven against real gateway credentials.
- `https://github.com/pingdotgg/t3code` — source-code research target, not README-only inspiration.
- Official/local documentation and installed binaries for Codex CLI, Claude Code, and OpenCode.

## Phase 0 — Nouns

| Noun | Working definition | Classification |
|---|---|---|
| **Real harness capability** | A claim about what a harness can discover, authenticate, launch, configure, emit, or normalize, backed by source research or real integration proof. | New primitive — separates proven capability from desired descriptor shape. |
| **Harness capability descriptor** | Kernel-owned queryable declaration of one harness backend's proven capabilities, models, options, status, and event normalization commitments. | Reshaped concept — descriptor claims must now be evidence-backed. |
| **Harness research dossier** | Architecture artifact that records real `t3code` and CLI findings before implementation decisions. | New satellite concept. |
| **Real harness integration test** | Test that invokes an installed harness binary or configured API-gateway path and proves discovery/readiness/session/event behavior, with precise skips for absent prerequisites. | New satellite concept. |
| **Normalized harness event** | Backend-native runtime output mapped into HyperIdle's downstream event union using captured real outputs where possible. | Reshaped concept — fixtures must come from real harness output for supported claims. |

## Real Harness Capability

**Definition.** A real harness capability is a descriptor claim that has been proven by source research, official/local CLI documentation, or a real integration test against the harness.

**Essential properties.**

- Names the harness family and exact surface studied.
- Records whether the evidence is source-code research, CLI documentation, installed-binary observation, captured output, or a passing integration test.
- Distinguishes binary presence, authentication/readiness, launchability, model/options support, event output, file/tool support, and cost/token observability.
- Can be false or unavailable; unknown is better than a fake ready claim.

**What it is not.**

- Not a guessed descriptor field.
- Not a product aspiration copied from t3code screenshots.
- Not a stubbed unit test that proves only HyperIdle's desired shape.
- Not a PATH check pretending to prove login, launch, options, or event format.
- Not a claim that HyperIdle may read or copy provider subscription tokens from native CLI config.

**Composition.** Real capabilities feed the harness capability descriptor. They are recorded first in the research dossier, then encoded in architecture, implementation, and integration tests.

**Lifecycle.**

- Researched before architecture decisions.
- Proven or marked unavailable during test design.
- Reported through descriptors only when backed by evidence.
- Rechecked when CLI versions, docs, or adapter code change.

**Authority.** Kernel owns descriptor admission and readiness claims. Harness extensions own backend-specific probing and normalization. Strategy may read facts but cannot assert them.

## Harness Research Dossier

**Definition.** A harness research dossier is the architecture artifact that proves the architect studied the real systems before designing AM2.

**Essential properties.**

- Dated.
- Names exact `t3code` source files/functions for provider/harness discovery, auth/readiness, launch/session invocation, status/version detection, event/output handling, and UI-facing provider metadata.
- Names exact CLI docs/commands used for Codex CLI, Claude Code, and OpenCode.
- Records installed binary versions or precise absence.
- Records real commands attempted and observed outputs, with secrets redacted.
- Maps each HyperIdle descriptor field to evidence or marks it unknown/unavailable.

**What it is not.**

- Not a README summary.
- Not a speculative architecture note.
- Not optional background reading.

**Contracts.**

- Missing dossier means AM2 fails architecture review.
- Descriptor claims not traceable to the dossier fail code review.
- Cursor must still be researched through `t3code` and documentation; if no usable local CLI/API surface exists, mark Cursor unavailable rather than inventing support.

## Harness Capability Descriptor

**Definition.** A harness capability descriptor is the Kernel-owned, queryable declaration of one harness backend's proven models, options, runtime support, discovery/readiness, auth action, and event normalization commitments.

**Essential properties.**

- Stable harness identity: type, name, backend kind.
- Access mode: API-gateway/direct-key or provider-subscription/CLI-auth.
- Discovery/readiness state proven from real probes: missing, installed, unauthenticated, ready, unavailable, or unknown.
- Version and auth/readiness metadata when the real harness exposes it.
- Models/options only when proven by docs, CLI output, source code, or real tests.
- Runtime capabilities only when proven.
- Event normalization commitments backed by captured real outputs for supported harnesses.

**What it is not.**

- Not a wishlist.
- Not a model gateway replacement.
- Not a session launch request.
- Not a backend-specific UI branch table.
- Not a plugin marketplace.
- Not a promise that Codex/Claude/OpenCode/Cursor all expose the same capabilities.

**Composition.** One descriptor attaches to one harness type. It contains zero or more model descriptors and zero or more option descriptors. It carries readiness and evidence-aware capability state.

**Lifecycle.** Descriptors are live snapshots. Discovery can update binary/version/auth/readiness. Session execution can update proven event/cost/token behavior. Unsupported or unproven claims remain absent or unavailable.

**Authority.** Kernel aggregates and exposes descriptors. Harness extensions probe and normalize backend-specific behavior. UI consumes descriptors. Review verifies the evidence chain.

## Real Harness Integration Test

**Definition.** A real harness integration test invokes an actual installed harness binary or configured API-gateway path to prove discovery, readiness, launch, output, or normalization behavior.

**Essential properties.**

- Calls the real binary or real gateway path.
- Uses harmless probes where possible: version, status, dry-run, auth check, or minimal session.
- Skips only with a precise missing prerequisite such as `codex binary not found`, `opencode not authenticated`, or `OPENROUTER_API_KEY absent`.
- Captures or references real output fixtures for normalization.
- Does not use provider secrets unsafely and never copies CLI-owned subscription tokens.

**What it is not.**

- Not a stub adapter test.
- Not a fake process output test standing in for all proof.
- Not a network-heavy or destructive agent task.

**Contracts.**

- AM2 must include real integration tests for HyperIdle `builtin` and each supported installed harness family.
- Stub tests may supplement edge cases but cannot satisfy core AM2 acceptance criteria.
- If a binary or credential is absent, skipped tests must make the absence visible and exact.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Real harness capability** | Evidence-backed claim about what a harness can do. | guessed capability, desired capability |
| **Harness capability descriptor** | Queryable declaration of proven harness capabilities and status. | provider config, adapter manifest |
| **Harness research dossier** | Architecture evidence artifact for `t3code` and real CLI research. | notes, optional research |
| **Real harness integration test** | Test that invokes installed binaries or real gateway path. | stub test, mocked proof |
| **Readiness** | Proven state that a harness can be used or why it cannot. | availability when only PATH presence is known |

## Contracts

- A ready descriptor claim requires evidence.
- Unknown/unavailable is preferred over a guessed ready claim.
- `t3code` research must inspect source paths, not only README/screenshots.
- Codex CLI, Claude Code, and OpenCode research must use official/local docs and installed binaries on this computer.
- HyperIdle `builtin` is unproven until a real API-gateway integration test validates it, or a precise missing-key skip is recorded.
- Existing HyperIdle harness code is unproven until tested against real harnesses.
- The reviewer must check research, architecture traceability, implementation traceability, and real integration tests.
- AM2 cannot be marked complete with stub-only verification.

## Rationale

The founder asked for the t3.codes approach because it makes common harnesses feel discoverable and usable. The previous AM2 attempt copied the shape of that idea without proving the real interaction surfaces. That is not acceptable for a harness layer: users only care that the harness actually logs in, launches, reports status, and emits usable events. AM2 therefore becomes a proof-first harness contract: study what is real, design from those facts, and only report capabilities that pass real proof.
