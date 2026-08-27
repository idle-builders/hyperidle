# BB1 — Every harness offers its own models

## Work package

**Outcome.** When someone picks a harness for an agent, the model list they see comes from that harness
itself — current, account-scoped, and named in that harness's own vocabulary — together with the extra
settings that harness supports for the chosen model. Three of the four harnesses show a real list where
today they show nothing or a wrong one.

**Why this matters.** Model choice is a dead control for three of four harnesses. `AgentEditor` already
renders a model dropdown from `descriptor.models`, but codex and cursor-agent discover no models at all,
and claude's discovery returns none. So the person configuring an agent either sees an empty dropdown or
a stale idea of what their subscription offers, and picks nothing. The cost of not fixing it: the whole
agent → harness → model → settings order the product presents is a facade at step C, and step D (per-model
options) has nothing real to hang off. It also gets worse over time on its own — a hand-maintained model
list decays every time a vendor ships, silently.

Claude's case is actively harmful, not merely absent: `claude models` is **not a subcommand** (the CLI's
own `Commands:` list has agents, auth, auto-mode, doctor, gateway, import, install, mcp, plugin, project,
setup-token, ultrareview, update — no `models`). The binary therefore treats `models` as a **prompt** and
answers it with a model turn. Every discovery probe spends money, returns prose whose content depends on
whatever `CLAUDE.md` sits in the working directory, and yields zero parsed models because
`parseClaudeCatalog` looks for a Markdown table that is not there.

**What exists today.** The probe and descriptor machinery is sound and the consumer is already correct.
`discoverLocalHarnesses` runs per-CLI probes concurrently; each probe's `interpretAuth` may attach
`models`; `describeHarnessCapability` prefers discovered models over any static fallback ("discovered
wins", AV2); `AgentEditor` reads `descriptor.models` and explicitly not the static catalogue, resets the
model and its options when the harness changes, and renders per-model options from
`model-options-for-harness.ts`. **opencode is already right** — `opencode models --verbose` emits one
`provider/id` header line per model followed by a JSON body, which is what `parseOpenCodeCatalog` expects,
confirmed against the installed binary. Everything missing is a per-harness listing source.

**Missing delta.** Three listing sources, and the per-model options carried in the same responses. Each
one was verified against the installed binary on 2026-08-27:

- **claude** — `claude -p "/model" --output-format json`. Costs **$0**, `duration_api_ms: 0`, zero
  tokens, `is_error: false`; it is handled locally, not by the model. Returns the current model with its
  effort, and the available names: `sonnet, opus, haiku, fable, best, opusplan`, plus `[1m]` context
  variants. The bracket form and the effort are claude's per-model options.
- **codex** — JSON-RPC `model/list` over `codex app-server` (schema self-published via
  `codex app-server generate-json-schema --out <dir>` → `v2/ModelListResponse.json`). Returns 9 models
  with `id`, `displayName`, `description`, `supportedReasoningEfforts` (`low`…`ultra`),
  `defaultReasoningEffort`, `serviceTiers`, `inputModalities`, `isDefault`, `hidden`. The efforts and
  tiers are codex's per-model options. Current default is `gpt-5.6-sol`.
- **cursor-agent** — `cursor-agent --list-models`. Returns ~30 account-scoped rows as `id - Label`
  (`auto - Auto (default)`, `composer-2.5 - Composer 2.5 (current)`, …). It **ignores** `--output-format`
  and always prints text. Cursor expresses per-model options inside the model string
  (`claude-opus-4-8[context=1m,effort=high,fast=false]`) and does not list them; this WP does not invent
  them.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** production — declared for this WP. `pipeline.config.yml` still has no
`engineering.tier` key, so this follows the per-plan convention established by AU20/AU21. This is a live
path in a shipped system: it runs on every harness probe and it currently spends money on every one.

**Pre-build.** Not required. The surfaces are verified, the consumer already exists, and the shape of a
`HarnessModelDescriptor` is settled. No user-facing surface changes — the dropdown that is empty today
fills up.

**Constraints.**

- Model ids stay in each harness's own vocabulary. No normalisation to a common namespace, no provider
  union imposed across harnesses: `haiku`, `gpt-5.6-sol`, `composer-2.5` and
  `openrouter/z-ai/glm-4.7-flash` are all correct as-is for their own harness.
- Discovery may not spend money and may not depend on a gateway API key. A listing that costs a model
  call is not a listing.
- A harness that cannot be asked degrades to no models rather than to a guess, and says so.

**Out of scope.** Delivering the selected model to the running harness, and proving it ran — that is BB2.
Removing the built-in harness or its own model list (BB5). What the settings screens look like (BB6).
Inventing options a harness does not publish.

## Acceptance criteria

1. For each of claude, codex, cursor-agent and opencode, the models offered for an agent come from that
   harness's own listing surface, reflecting the machine's actual login.
2. No discovery probe makes a model inference call or spends money, on any harness.
3. Discovery never requires a gateway API key.
4. Where a harness publishes per-model options, those options are what the agent editor offers for that
   model; where it publishes none, none are invented.
5. A harness that is installed but cannot list its models reports zero models with a stated reason, and
   the rest of discovery still completes.
6. Nothing in the shipped tree parses a model list out of prose produced by a model.

## Validation scenarios

- Given claude is installed and logged in, when harness discovery runs, then its offered models are the
  names claude itself reports, and the run costs nothing.
- Given codex is installed and logged in to a ChatGPT account, when harness discovery runs, then the
  offered models are the ones codex lists for that account, each carrying the reasoning efforts codex
  publishes for it.
- Given cursor-agent is installed and logged in, when harness discovery runs, then the offered models
  are the ones cursor lists for that account.
- Given no gateway API key is stored anywhere, when harness discovery runs for every installed harness,
  then every harness still reports its own models.
- Given a harness is installed but its listing command fails, when discovery runs, then that harness
  reports zero models with a reason and the other harnesses are unaffected.
