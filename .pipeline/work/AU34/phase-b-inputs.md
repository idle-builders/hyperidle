# AU34 — the inputs Phase B consumes, settled in Phase A

Phase A leaves three things for the atomic window that are decisions rather than code: the in-package
file layout, the module → package map as it stands **after** Phase A's deletions and folds, and the
floor baseline the raise is measured against. They are here so B contains no judgement.

`development-file-placement.md` beside this file carries the fourth: where each of the 86 development
files lands.

---

## 1. The layout: every module keeps its path relative to `src/`

Settled in `architecture.md` §3.2 and unchanged by Phase A.

> `harness/harness-adapter.ts` becomes `framework/harness-protocol/src/harness/harness-adapter.ts`.
> `blocks/derive-blocks.ts` becomes `framework/block-derivation/src/blocks/derive-blocks.ts`.
> `types.ts` and `types/money.ts` land side by side in `domain-model/src/` exactly as they sit today.

Why it is not a style preference: preserving the `src/`-relative path makes every *same-package*
relative import **byte-identical after the move**, so the codemod's second pass only has to rewrite
the imports that genuinely cross a destination. Flattening would require re-deriving all of them, and
would collide three ways in `domain-model` alone (`types.ts`, `blocks/types.ts`, `types/money.ts`,
`types/artifact.ts`).

The cost is accepted deliberately: `block-derivation/src/blocks/…` and `harness-protocol/src/harness/…`
carry a redundant directory segment.

**One rename, and it is a decided rename rather than a layout choice.**
`agent-run-admission.ts` → `agent-work-intent-kinds.ts`, landing at
`domain-model/src/agent-work-intent-kinds.ts`. The old name describes admission, which the module does
not do. No other module is renamed.

---

## 2. The map — 80 production modules, six barrels dissolved

Measured against the live tree after A4's deletion and A5's folds: every module below exists, and
every production module under `framework/shared/src` that is not a barrel appears exactly once.

| package | modules |
|---|---|
| `framework/domain-model` | `types.ts` · `knowledge.ts` · `team.ts` · `routine.ts` · `notifications.ts` · `connection.ts` · `credential.ts` · `configuration.ts` · `hint.ts` · `proposed-call.ts` · `trigger.ts` · `auth.ts` · `api-types.ts` · `errors.ts` · `agent-roles.ts` · `agent-profile.ts` · `agent-behavior-config.ts` · `agent-run-view.ts` · `session-activity.ts` · `session-request.ts` · `task-transition.ts` · `thread.ts` · `mention.ts` · `blocks/types.ts` · `types/money.ts` · `types/artifact.ts` · `kinds/registry.ts` · `kinds/old-kind-map.ts` · `artifact-preview.ts` · `model-gateway.ts` · `events.ts` · `agent-run-admission.ts` → `agent-work-intent-kinds.ts` |
| `framework/presentation-format` | `format/bet.ts` · `format/time.ts` · `initials.ts` · `scope-labels.ts` |
| `framework/harness-capability` | `harness/harness-capability-descriptor.ts` · `harness/derive-primary-harness.ts` |
| `framework/harness-protocol` | `harness/harness-adapter.ts` · `harness/harness-events.ts` · `harness/harness-event-normalization.ts` · `harness/return-actions.ts` · `harness/enforcement-registry.ts` · `harness/worker-protocol.ts` · `harness/harness-capability-read-model.ts` · `harness-port.ts` |
| `framework/tool-protocol` | `tool.ts` · `builtin-tool-catalog.ts` |
| `framework/work-intent-port` | `agent-work-intent-recorder.ts` |
| `framework/filesystem-contract` | `filesystem.ts` |
| `framework/conversation-parts` | `part.ts` |
| `framework/block-derivation` | `blocks/block-id.ts` · `blocks/derive-blocks.ts` · `blocks/derive-payloads.ts` · `blocks/normalise.ts` |
| `framework/event-bus` | `event-bus.ts` |
| `framework/http-middleware` | `http/access-boundary.ts` · `http/body-limit.ts` · `http/env.ts` · `http/explicit-start-projection.ts` · `http/rate-limit.ts` · `http/timing-safe.ts` · `http/validate.ts` |
| `framework/diagnostics` | `logger.ts` · `redact.ts` · `observability/events.ts` · `observability/types.ts` · `observability/console-adapter.ts` |
| `framework/host-process` | `git/git-runner.ts` · `net/ssrf.ts` · `validate-env.ts` · `profiles.ts` |
| `framework/factory-defaults` | `system-prompt-templates.ts` · `agent-scaffold.ts` · `factory-roster.ts` |
| `framework/credential-access` | `crypto/credential-encryption.ts` · `resolve-model.ts` |
| `framework/cron` | `cron.ts` |
| `framework/toon-codec` | `toon-codec.ts` |
| `framework/query-escaping` | `like-escape.ts` |

**80, not `requirements.md` §4.9's 79.** A9 split `model-gateway.ts` into two modules — the catalog
half stayed and the resolver half became `resolve-model.ts` — so `credential-access` holds two source
modules where §4.3 counted one source module that divides. Nothing is misplaced and nothing is
double-counted; the difference is entirely that the split has already happened.

**The six barrels dissolve:** `index.ts`, `blocks/index.ts`, `crypto/index.ts`, `harness/index.ts`,
`http/index.ts`, `observability/index.ts`. Each package gets one derived `src/index.ts` instead.

**Symbol relocations are already done.** `ReturnEnforcementChannel` sits in
`harness/harness-capability-descriptor.ts` (A7); `CredentialResolver`, `resolveModel`,
`resolveProvider`, `resolveModelTier` and `UnsupportedAgentProviderError` sit in `resolve-model.ts`
(A9). Nothing crosses a package boundary independently of its module any more — the codemod resolves
every name by the module that declares it.

---

## 3. The floor baseline the raise is measured against

`npm run governance:floors`, on this tree, at the end of Phase A. **Twenty floors, zero drift, every
magnitude floor inside its band.**

| floor | live | declared | slack | allowed | verdict |
|---|---|---|---|---|---|
| `detector:import` | 3770 | 3307 | 463 | 754 | ok |
| `detector:manifest` | 131 | 111 | 20 | 27 | ok |

Every other floor is `ok` with room to spare and is expected to stay there.

**What B7 does, and what it may not do.** One package with 30 declarers becomes eighteen with the same
consumers declaring a subset each, so `detector:manifest` lands well above its floor and
`detector:import` moves too. The floor raise is honest because the population grew and no violation
was absorbed: floors are magnitude trackers, and violations are reported separately by the
`crossing-<kind>` rules, so raising a floor cannot hide one.

- **Write the value the tool prints in its `write` column** — `suggestedFloor`, the middle of the
  band. Not the live count: a floor at the edge is one removed crossing from red, which is how the
  whole floor set came to sit on the edge at once.
- **Raise only the floors that argument covers.** Any other floor going red is a finding, not a bump.
