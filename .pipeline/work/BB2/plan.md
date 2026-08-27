# BB2 — The model you pick is the model that runs

## Work package

**Outcome.** A session runs on the model chosen for that agent, on every harness, with no API key
anywhere in the path — and the system can say, from the harness's own report, which model actually ran.

**Why this matters.** Today it does not. On a machine authenticated only by subscription — the normal
case for claude, codex and cursor-agent — the chosen model is silently discarded and the CLI runs
whatever default it likes. The person sees their choice saved in the editor and believes it. Nothing
anywhere notices the difference, which is exactly why the defect survived: there is no check, on any
harness, that the requested model is the one that ran. The cost of not fixing it is that every downstream
judgement — an eval comparing harnesses, a cost expectation, a "this needs the small model" decision — is
made about a model that may not have been used.

**What exists today.** The injection mechanism is already in place and already correct: all four CLI
configs pass `--model {{model}}`, and every harness accepts it under subscription auth (verified
2026-08-27: claude `--model haiku` → `sonnet`; codex `--model gpt-5.4-mini` on a ChatGPT login; opencode
`--model openrouter/z-ai/glm-4.7-flash`; cursor `--model composer-2.5` → `gpt-5.2`). What breaks is
upstream of it:

- `{{model}}` resolves from `config.resolvedModel?.model`
  (`layers/agent-execution/harness-registry/src/cli-harness-adapter.ts:494`).
- `resolvedModel` comes from `resolveModel` (`layers/core-api/credentials/src/resolve-model.ts:191`),
  which demands a gateway credential per provider and, on the per-agent path, **rejects
  `openai-compatible` outright** and accepts only `anthropic` and `openrouter`.
- With no credential the `MissingCredentialError` is deliberately swallowed
  (`layers/agent-orchestration/run-orchestration/src/start-runtime.ts:154`, whose comment states
  `resolvedModel` is "consumed ONLY by the builtin adapter" — no longer true since AR7 made all four
  harnesses argument-enforced on the model).
- `{{model}}` is then `""`, and the strip-empty-flag branch (`cli-harness-adapter.ts:511`) removes
  `--model` and its empty argument from the invocation entirely.

Each harness already reports what it ran; nothing reads any of it:

| harness | readback | form |
|---|---|---|
| claude | result JSON `modelUsage` | concrete id (`claude-haiku-4-5-20251001`), even when asked by alias |
| codex | session rollout JSONL `turn_context.model` | the id as requested (`gpt-5.4-mini`); absent from the `--json` stdout stream |
| opencode | `opencode export <sessionID>` | `providerID` + `modelID` |
| cursor-agent | `--output-format stream-json` init event | display **label** (`"Composer 2.5"`, `"GPT-5.2 Medium"`), not the id — needs mapping |

`HARNESS_TEST_MODELS` (`layers/agent-execution/harness-registry/src/__tests__/require-harness.ts`) is a
hand-maintained constant no mechanism checks against a harness. Its cursor entry is `auto`, which
delegates the choice to the harness and therefore can never prove selection.

**Missing delta.** A path from the agent's stored model to the spawned process that does not pass through
credential resolution, and a per-harness readback assertion that fails when the two differ. Plus the test
matrix ceasing to be a hand-written constant.

**Depends on.** BB1 — delivering a chosen model only means something once there is a correct per-harness
list to choose from; three of four harnesses currently offer none.

**Complexity.** M

**Engineering tier.** production — declared for this WP (per-plan convention; `pipeline.config.yml` has
no `engineering.tier` key). Every agent session goes through this path.

**Pre-build.** Not required. The defect, the four injection points and the four readbacks are all
identified and verified against real binaries. No user-facing surface changes.

**Constraints.**

- No gateway credential, provider union, or model-tier concept may sit between the stored choice and the
  harness invocation. A subscription-authenticated harness must reach its chosen model with no key stored
  anywhere.
- Each harness keeps its own id vocabulary — no cross-harness normalisation.
- The verification reads each harness's own report of what it ran. Asserting against our own request, or
  against the argv we built, proves nothing.
- Cursor's readback is a display label; map it to the id, and let the mapping fail loudly rather than
  pass a mismatch.

**Out of scope.** Where the model list comes from (BB1). Onboarding and defaults (BB3). Moving other
tests off fake LLM calls (BB4). Removing the built-in harness (BB5). Retiring the gateway itself (BB6) —
this WP takes it out of the model-delivery path but does not delete it.

## Acceptance criteria

1. On every supported harness, a session started for an agent with a chosen model runs on that model,
   with no gateway credential present anywhere on the machine.
2. An agent with no chosen model runs on the harness's own default, and that is a stated outcome rather
   than the accidental result of a stripped argument.
3. For every supported harness, the model a session actually ran on is obtained from that harness's own
   report, and a mismatch with the requested model is a failure, not a silent difference.
4. The per-harness verification covers all supported harnesses with no carve-out; a harness that cannot
   be verified fails rather than being skipped.
5. The models used to verify are derived from live discovery, not from a hand-maintained list, and no
   harness is verified against a model that delegates the choice back to the harness.
6. Choosing a model whose provider is not one the gateway ever supported still reaches the harness.

## Validation scenarios

- Given an agent set to `haiku` on claude and no API key stored, when a session runs, then claude reports
  a haiku model as the one used.
- Given an agent set to `gpt-5.4-mini` on codex authenticated by a ChatGPT account, when a session runs,
  then codex's own session record names that model.
- Given an agent set to a specific opencode model, when a session runs, then opencode's own session
  export names that provider and model.
- Given an agent set to a specific cursor-agent model, when a session runs, then cursor's own run report
  names that model.
- Given a harness whose requested and reported models differ, when the verification runs, then it fails
  and names both.
- Given a model that discovery no longer offers, when the verification runs, then it fails loudly instead
  of running on a fallback.
