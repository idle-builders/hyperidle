# Track BB: The harness runs the model you picked

HyperIdle ships its own agent loop — the `builtin` harness, an in-process adapter that calls a model
API directly through `callLlm`. It is the default for every agent, the always-available row in
onboarding, and the cheap path most tests take. It is also outclassed on every axis by the coding CLIs
people already have installed and signed into. **Founder decision, 2026-08-27: it goes. HyperIdle runs
agents only through installed harnesses.**

Removing it exposes the thing that has to be true first, and is not true today: **the model a person
picks for an agent must be the model that actually runs.** Investigating that turned up three defects
and one wrong assumption.

**The wrong assumption.** "A subscription-authenticated CLI cannot be told which model to use." False —
proven on this machine against all four installed binaries. Every one accepts a model and reports back
which one ran:

| harness | set the model | read back what ran |
|---|---|---|
| claude | `--model haiku` / `--model sonnet` | result JSON `modelUsage` → `claude-haiku-4-5-20251001` / `claude-sonnet-5` |
| codex | `--model gpt-5.4-mini` (ChatGPT login) | session rollout JSONL `turn_context.model` |
| opencode | `--model openrouter/z-ai/glm-4.7-flash` | `opencode export <sid>` → `providerID` + `modelID` |
| cursor-agent | `--model composer-2.5` / `gpt-5.2` | `--output-format stream-json` init event `model` (display label), `apiKeySource:"login"` |

**Defect 1 — the model never reaches the CLI.** All four adapter configs already pass `--model
{{model}}`. `{{model}}` resolves from `config.resolvedModel?.model`, and `resolveModel`
(`layers/core-api/credentials/src/resolve-model.ts:191`) requires a gateway API key and rejects
`openai-compatible` outright. With no key the error is swallowed
(`layers/agent-orchestration/run-orchestration/src/start-runtime.ts:154`), `{{model}}` becomes `""`,
and the strip-empty-flag branch (`layers/agent-execution/harness-registry/src/cli-harness-adapter.ts:511`)
removes `--model` entirely. On a subscription-only machine the choice is silently discarded and the CLI
runs its own default.

**Defect 2 — model discovery is missing or fake.** Every harness has a native listing surface; we use
one of them.

| harness | native listing (verified 2026-08-27) | what we do today |
|---|---|---|
| claude | `claude -p "/model" --output-format json` — **$0, 0 tokens, 0 api ms** | run `claude models` — **not a subcommand**, so it is a *prompt*; returns prose, parser wants a Markdown table → **zero models**, one paid call per probe |
| codex | app-server JSON-RPC `model/list` — 9 models with `supportedReasoningEfforts`, `serviceTiers`, `isDefault`, `hidden` | nothing |
| cursor-agent | `cursor-agent --list-models` — ~30 account-scoped `id - Label` rows | nothing |
| opencode | `opencode models --verbose` | correct — the only one right |

**Defect 3 — nothing checks what ran.** Every readback above exists. None is read. That is why defect 1
survived unnoticed.

**The consequence for testing.** `HARNESS_TEST_MODELS` is a hand-maintained constant nothing verifies
against a harness. It happens to be mostly current — but codex's default has moved to `gpt-5.6-sol`
while the matrix pins `gpt-5.4-mini`, and cursor's entry is `auto`, which by definition cannot prove
that a chosen model ran. Once discovery is live the matrix is derived from it and a vanished model
fails loudly instead of rotting.

**Founder rulings that shaped this track** (2026-08-27):

1. Onboarding with an API key stays possible — the key goes to **opencode**, which accepts any of them.
2. Model lists come **from the harness itself**, a million times preferred over a written-down list;
   web research only where no harness surface exists. (After investigation: none needed.)
3. The order is **agent → harness → model → that harness+model's extra settings.**
4. No hardcoded default harness. A user decides their default.
5. No harness discovered at all → **block setup** and say what to install.
6. No test may mock `callLlm`. Every model call goes through session provisioning.
7. Evals must run per CLI, and be able to compare CLIs.

**Sequencing rule.** The deletion lands *after* its replacements, never before: onboarding must already
work on a key, and real-harness test coverage must already exist, before the built-in harness is
removed. Deleting first would leave both a broken first run and a coverage hole.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| BB1 | Every harness offers its own models | backend | M | — | **planned — registered 2026-08-27.** Replace model discovery for claude, codex and cursor-agent with each harness's own listing surface, and take per-model options from the same call. See `work/BB1/plan.md`. |
| BB2 | The model you pick is the model that runs | backend | M | BB1 | **planned — registered 2026-08-27.** Deliver the chosen model id to the harness with no credential in the path, and prove per harness, from its own readback, that the session ran on it. See `work/BB2/plan.md`. |
| BB3 | An API key gets you a working workspace | full-stack | M | BB2 | **planned — registered 2026-08-27.** Onboarding with a key hands it to opencode; a machine with no harness is told what to install; the default harness is the one the person chose. See `work/BB3/plan.md`. |
| BB4 | Every model call goes through a real harness session | testing | L | BB2 | **planned — registered 2026-08-27.** No test fakes an LLM call; the browser lane drives a real CLI; evals run per harness and can compare them. See `work/BB4/plan.md`. |
| BB5 | The built-in harness is gone | backend | L | BB3, BB4 | **planned — registered 2026-08-27.** Delete the in-process adapter, its LLM client and every fork in the run path; migrate the rows that name it. See `work/BB5/plan.md`. |
| BB6 | Model settings belong to the harness | full-stack | M | BB5 | **planned — registered 2026-08-27.** Retire the three-tier model gateway; each harness's settings show its own models and whatever it needs to authenticate. See `work/BB6/plan.md`. |

## Dependency graph

- `BB2` → `BB1`: delivering the chosen model is only meaningful once there is a correct per-harness list
  to choose from. Built first, it would deliver ids from a list that is empty for three of four harnesses.
- `BB3` → `BB2`: onboarding hands opencode a key *and* a model. Without BB2 the model is still discarded
  before the spawn, so a key-based onboarding would produce an agent running an arbitrary default.
- `BB4` → `BB2`: a real-harness lane has to pin a model and assert the session ran on it. That assertion
  is BB2's readback; without it the lane can only prove a turn happened.
- `BB5` → `BB3`: removing the built-in harness removes the only key-based onboarding path. BB3 replaces
  it. Reversed, first run breaks on any machine without a signed-in CLI.
- `BB5` → `BB4`: the cassette seam and the `callLlm` mocks die with `llm-client`. BB4 builds the real
  coverage first so the deletion does not leave a hole.
- `BB6` → `BB5`: what remains dead in the credential and gateway code is only knowable once the built-in
  harness is actually gone. Swept earlier, it would be guesswork about which parts still have a consumer.
- `BB1` has no dependencies and can start immediately.

## Relationship to other tracks

`AY` owns what a *running* session can do (mid-run delivery, resumable sessions). This track owns which
harness and which model a session starts on. No overlap, and neither blocks the other.

`AR` established the real-binary harness lane and the locked test-model matrix this track's `BB4`
rebuilds. `BB4` does not retire that lane — it removes the fake paths beside it and derives the matrix
from live discovery instead of a hand-maintained constant.
