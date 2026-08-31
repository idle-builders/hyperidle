# Remove the built-in harness. Make model selection real.

Working plan for this session. We build in batches. After each batch: review, verify, you test it by
hand, then the next one. No pipeline ceremony, no work packages.

## What we're doing

HyperIdle ships its own agent loop — the `builtin` harness, an in-process adapter calling a model API
through `callLlm`. It is the default for every agent, the always-available row in onboarding, and the
cheap path most tests take. It loses to the coding CLIs on every feature that matters. It goes.

Removing it forces the thing that has to be true anyway: **the model you pick for an agent is the model
that runs.** That is broken today on every CLI harness.

## What we proved on this machine, 2026-08-27

Not read from docs — run against the installed binaries.

**Every harness accepts a model on subscription auth, and reports back what it ran.**

| harness | set it | read it back |
|---|---|---|
| claude | `--model haiku` / `--model sonnet` | result JSON `modelUsage` → `claude-haiku-4-5-20251001` / `claude-sonnet-5` |
| codex | `--model gpt-5.4-mini`, ChatGPT login | session rollout JSONL `turn_context.model` (not in `--json` stdout) |
| opencode | `--model openrouter/z-ai/glm-4.7-flash` | `opencode export <sid>` → `providerID` + `modelID` |
| cursor-agent | `--model composer-2.5` / `gpt-5.2` | `--output-format stream-json` init event `model` — a **label**, `"Composer 2.5"`, not the id |

**Every harness can list its own models. We use one of the four.**

| harness | its own listing | what we do today |
|---|---|---|
| claude | `claude -p "/model" --output-format json` — **$0, 0 tokens, 0 api ms** | run `claude models`, which is **not a subcommand** — the binary treats it as a prompt, answers with a model turn, and the parser wants a Markdown table → **zero models**, money spent per probe, output depends on the cwd's CLAUDE.md |
| codex | `~/.codex/models_cache.json`, the account-scoped cache codex refreshes itself | **already correct** — reads that cache, filters on `visibility`/`supported_in_api`, and lifts each model's reasoning efforts. Its own lore rejects a hardcoded list for exactly the right reason. (An app-server JSON-RPC `model/list` also exists and returns the same set; no reason to switch.) |
| cursor-agent | `cursor-agent --list-models` — ~30 account-scoped `id - Label` rows, ignores `--output-format` | nothing |
| opencode | `opencode models --verbose` | correct |

**Measured baseline, running the real `discoverLocalHarnesses` against the installed binaries:**

| harness | state | models discovered |
|---|---|---|
| codex | ready | **6** — correct |
| opencode | ready | **362** — correct |
| claude-code | ready | **0** — broken |
| cursor-agent | ready | **0** — missing |

So Batch 1 is two harnesses, not three. I had claimed codex discovered nothing; that was wrong — I read
only part of its probe. Corrected here after running discovery for real.

**opencode takes any API key.** Isolated HOME, zero stored credentials:

| environment | models offered |
|---|---|
| nothing | 8 (free `opencode/*` tier) |
| `OPENROUTER_API_KEY` | + 339 `openrouter/*` |
| `ANTHROPIC_API_KEY` | + 15 `anthropic/*` |
| project `opencode.json` with an `@ai-sdk/openai-compatible` provider (baseURL + key) | that provider's models |

## The three defects

1. **The model never reaches the CLI.** All four configs pass `--model {{model}}`. `{{model}}` comes from
   `config.resolvedModel?.model` (`cli-harness-adapter.ts:494`); `resolvedModel` comes from `resolveModel`
   (`resolve-model.ts:191`) which demands a gateway API key and rejects `openai-compatible` on the
   per-agent path; the missing-credential error is swallowed (`start-runtime.ts:154`); `{{model}}` becomes
   `""` and the strip-empty-flag branch (`cli-harness-adapter.ts:511`) deletes the flag. On a
   subscription-only machine your choice is discarded in silence.
2. **Discovery is missing or fake** — see the table above.
3. **Nothing checks what ran.** Every readback exists. None is read. That is why 1 survived.

Consequence: `HARNESS_TEST_MODELS` is a hand-maintained constant nothing verifies. codex's default has
moved to `gpt-5.6-sol` while we pin `gpt-5.4-mini`; cursor's entry is `auto`, which by definition cannot
prove a model was selected.

## Rulings this plan follows

1. Onboarding with an API key stays. The key goes to opencode.
2. Model lists come from the harness itself. Web research only where no harness surface exists — after
   checking, none needed.
3. Order is agent → harness → model → that harness+model's extra settings.
4. No hardcoded default harness. The user decides.
5. No harness discovered → block setup, say what to install.
6. No test mocks `callLlm`. Every model call goes through session provisioning.
7. Evals run per CLI and can compare CLIs.

## Watch out: three unrelated things are also called "builtin"

`builtin:` routines (post-bet-retro, portfolio-retro, knowledge-decay, knowledge-promotion), the reserved
`builtin` plugin id, and the `builtin` behaviour-config origin. Most matches for the word in this repo are
one of those. **A sweep by name deletes working product.**

---

## How each batch closes

1. I build it.
2. `npm run verify` clean, plus the targeted real-harness tests for that batch.
3. I review the diff against this plan and report what I actually proved, not what I intended.
4. You test it by hand. I say exactly what to do and what you should see.
5. Next batch.

Nothing moves to the next batch on a claim. A batch is done when its proof ran.

---

## Batch 1 — Every harness lists its own models

**Change.** Two harnesses. **claude**: replace the `claude models` call and `parseClaudeCatalog`'s
Markdown-table path with `claude -p "/model" --output-format json`. **cursor-agent**: add
`cursor-agent --list-models`, which it has today and we never call. codex and opencode already discover
correctly and are not touched. Carry each harness's declared per-model options through in the same pass
where the harness publishes them.

The existing claude unit test feeds a hand-written Markdown table as if it were real output, so it is
green while production returns zero models. Captured fixtures replace it — the codex test already does
this correctly and is the pattern to follow.

Model ids stay in each harness's own vocabulary. No normalising, no common namespace.

**Done when.** For each of the four, the agent editor's model dropdown lists what that harness itself
reports for this machine's login. Discovery spends no money and needs no API key. A harness that can't be
asked reports zero models with a reason and doesn't break the others.

**Prove it.** Real-binary test per harness asserting the list is non-empty and comes from the harness;
a check that no discovery path issues a model turn.

**You test.** Open an agent, switch its harness through all four, watch the model list change to that
harness's real models each time.

---

## Batch 2 — The model you pick is the model that runs

**Change.** Take the chosen model id from the agent's config to the spawned process with no credential
resolution in the path. `resolveModel` stops being the source of `{{model}}`. Then read each harness's own
report of what ran and fail on a mismatch: claude `modelUsage`, codex `turn_context.model` from the
rollout, opencode `export`, cursor's stream-json init label mapped back to its id via `--list-models`.

Derive the test-model matrix from live discovery instead of the hand-written constant. Drop cursor's
`auto` — it can't prove selection.

**Done when.** A session runs on the chosen model on all four harnesses with no API key stored anywhere,
and a mismatch between requested and actual fails loudly.

**Prove it.** Per-harness real-binary test: pin a model, run a session, assert the harness's own report
names it. All four, no carve-out, no skip.

**You test.** Set an agent to a specific model, run it, and see that model named in the session — then set
a different one and see it change.

---

**DONE 2026-08-28.** `SessionConfig.selectedModel` carries the agent's own choice from
`agent_run_config.modelId` to the spawned process; the CLI adapter prefers it over the gateway's
`resolvedModel`. Proven on all four real binaries, each read back from the harness's own report
(claude `modelUsage`, cursor init line, codex rollout `turn_context.model`, `opencode export`).
Sanity-broken: reverting the one adapter line turns all four lanes red — opencode visibly ran
`openrouter/qwen/qwen3.8-max`, its own default, instead of the requested model. That is the
production defect, caught.

**Residual, deliberate:** `resolvedModel` is still the fallback when an agent has chosen no model,
so a workspace with a gateway credential still gets the tier model in that case. Batch 6 deletes that
fallback with the gateway. The chosen-model path itself is credential-free today.

**Not done here:** production records nothing about which model ran — the readback lives in the test.
Two of four harnesses report it in-stream (claude, cursor) and two only in their own session artifacts
(codex, opencode), so a uniform production signal is its own piece of work, not a line in this one.

---

## Batch 3 — Extra settings per harness and model

**Change.** Deliver the options each harness declares for the chosen model, in that harness's own form:
codex reasoning effort and service tier via its config overrides, claude's context and effort, opencode's
variants, cursor's bracket suffix on the model string. Options come from Batch 1's discovery; none are
invented for a harness that publishes none.

**Done when.** Picking an option changes the invocation, and the run reflects it.

**Prove it.** Per-harness test that the declared option reaches the process and the run reports it where
the harness reports it. Where a harness doesn't report it, prove the invocation carries it and say plainly
that's as far as the proof goes.

**You test.** Set an agent to codex with high reasoning effort, run it, and see the effort took.

---

**DONE 2026-08-28.** No production change was needed — `model-options.ts` already declared each
harness's keys and carriers with a compile-time coupling. What was missing was the same thing Batch 2
fixed for the model: proof the harness on the far end honoured the value.

- **claude** `--effort` — verified through the adapter. `/model` reports the effort in force and costs
  nothing, so the proof is free. Asking `low` then `max` gives two different answers.
- **codex** `model_reasoning_effort` — verified. Its rollout records `effort` beside `model`.
- **cursor-agent** declares no options, and the reason is now pinned by a test rather than a comment:
  its own `--list-models` tip advertises `--model 'id[context=1m,effort=high]'`, and the binary
  **rejects** that form. Effort is part of model identity there (~200 flat ids ending `-low`/`-high`/
  `-max`/`-fast`).
- **opencode** `--variant` — carried, deliberately NOT verified. opencode publishes no statement of
  the variant a session ran with and silently ignores an unknown one, so a lane asserting only that
  the turn completed would prove the flag is tolerated, not applied. Recorded in the test file.

**The sanity break earned its keep.** The first codex lane asked for `high` and passed with the option
carrier broken — because the machine's own `config.toml` sets `model_reasoning_effort = "high"` and
`provisionCodexHome` copies it into the session. Rewritten to ask for two efforts, neither of them the
one already in play; a broken carrier now fails with `codex ran at high, not the requested low`.

**Local snag, not a product finding:** opencode is currently wedged on this machine — every run hangs,
including ones that worked earlier today. Its global `~/.local/share/opencode/opencode.db` is 2.9 GB,
which is the documented lock-contention failure mode, and killing probe runs mid-flight is what
provoked it. Nothing in the tree changed. It needs the DB cleared before opencode lanes run again.

---

## Batch 4 — An API key gets you a working workspace

**Change.** Onboarding with a key hands the key to opencode under the env var matching its provider —
today `envMap` hardcodes `ANTHROPIC_API_KEY` (`adapter-pool.ts:370`) whatever the key is for. A custom
OpenAI-compatible endpoint goes into the sandbox `opencode.json` provider block, the same file we already
write for MCP. Setup blocks when nothing is installed or signed in, naming each harness and its install or
login command. The chosen harness becomes the workspace default; `DEFAULT_AGENT_HARNESS` and the two
`?? "builtin"` literals go.

**Open before this ships:** a first `opencode run` in a cold isolated HOME didn't finish in four minutes
and was killed; the same command in an established HOME returns in seconds. A first run after onboarding is
exactly the cold case. Measure it. If it's real, show progress rather than looking frozen.

**Done when.** A fresh workspace, one API key, no CLI login: the first agent replies. A machine with no
harness: setup won't complete and tells you what to install.

**Prove it.** Live run per provider shape (OpenRouter key, Anthropic key, custom endpoint) ending in a
real reply.

**You test.** Fresh workspace, paste a key, ask the assistant something, get an answer.

---

**IN PROGRESS 2026-08-28. First piece done: the key reaches the harness under its own provider's name.**

opencode's adapter injected `{{apiKey}}` into `ANTHROPIC_API_KEY` **whatever provider the key was for**.
Onboarding offers three providers, so the common case — an OpenRouter key — was stored, carried into
the subprocess, and unreadable by the provider it belonged to. With no key at all it set
`ANTHROPIC_API_KEY=""`, and an empty-but-set variable is not nothing: a harness that reads it can
prefer it over a working login.

Replaced with `credentialEnvByProvider` on the harness config: anthropic → `ANTHROPIC_API_KEY`,
openrouter → `OPENROUTER_API_KEY`, and nothing for a provider with no entry. `openai-compatible` has
no fixed host, so no variable can mean "this endpoint" — it needs a provider block carrying its base
URL in the sandbox `opencode.json`, and until that exists its key is deliberately not smuggled into
another vendor's variable. Only opencode declares the map; the other three authenticate through their
own login and are handed nothing, deliberately.

**Second piece done: a model the harness offers can actually be saved.** Batch 1 changed where the
model list comes from and left the save path behind. `validateAgentConfig` checked an
anthropic-provider model against `MODEL_CATALOG` — four static gateway ids containing none of the
names claude accepts — so the editor offered `haiku` and the API answered `UNKNOWN_MODEL`. Step C of
agent → harness → model was a dropdown that threw.

The check now asks the harness's own descriptor. A list the harness STATED is authoritative; an
`inheritedFromGateway` list is the model-gateway catalog standing in for a harness that published
none, so it is judged only per-provider (an OpenRouter id is not wrong because an Anthropic catalog
never heard of it). That second clause exists for the built-in harness alone and goes when it does.
`isCatalogModel` is deleted — it had no other caller.

**Third piece done: nothing is chosen on anyone's behalf.** `DEFAULT_AGENT_HARNESS` is deleted, and
the `builtin` + `claude-sonnet-4-6` + `anthropic` triple no longer gets written by the agents route,
team scaffolding, or the assistant stub. An agent created with no harness stores none, and the run
resolves it — the pool takes an available harness, that harness runs its own default model. Two
existing tests stated the old rule and now state the new one; a migration test that compared
migration 0032's backfill against the live constant now asserts the literal that migration actually
wrote, since a past migration's behaviour must not be tied to a value the product is free to change.

**Fourth piece done: setup will not finish on a machine that cannot run an agent.** When discovery
returns harnesses and none is choosable, Start is disabled and the screen names each one, what state
it is in, and the command that fixes it — copy taken from discovery's own reason and login command,
not invented. Discovery also now preselects the first harness this machine can actually run instead
of opening on a hardcoded name.

The distinction that took two attempts: an **empty** descriptor list is discovery telling us nothing
— it failed, or answered with something that was not a list — and blocking on that would strand
someone over a probe error rather than a real absence. Only a populated list with nothing choosable
counts. Same rule the model checks follow: an absent list never rejects. `installed` and
`unauthenticated` are both "not ready", because neither can run a turn.

While the built-in harness still exists it is always choosable, so this panel cannot appear in
production yet. It starts working the moment Batch 5 lands, and the component tests exercise it now.

**Fifth piece done: the live proof.** opencode completes a real turn on a key HyperIdle holds, with
`OPENROUTER_API_KEY` deleted from the process environment for the duration — so the adapter's own
injection is the only path a key could have taken. The lane captures the child's environment and
asserts the key arrived there and that no other vendor's variable did. Breaking the injection turns it
red: the variable disappears and opencode gets nothing.

Credential assertions compare **booleans, never values** — a failing assertion prints what it
received, and the received value here is a live key. The first version printed one into the test
output.

**Sixth piece done — Batch 4 closed: a brought OpenAI-compatible endpoint reaches opencode.** The one
provider onboarding offers that no environment variable can carry: it has no fixed host, so the key
alone says nothing about where to send it. The adapter declares it as a provider in the session
`opencode.json` (base URL + key, `@ai-sdk/openai-compatible`) and addresses the model as
`<provider>/<model>` so the id names who serves it. The file is MERGED — the MCP server is already
there and clobbering it would take the agent's tools away to give it a model. Proven live end to end
against a real endpoint with a real key.

**It broke a lane, and the break was informative.** `openai-compatible` was being used in two
incompatible senses. In the product it means "an endpoint the person typed in". In the harness tests
it was the label on an **OpenRouter** route whose model id was already prefixed `openrouter/…` — so
the new rule double-prefixed it and the turn failed. Both labels are corrected to `openrouter`, which
is what those routes actually are: `HARNESS_TEST_MODELS.opencode` and the opencode case in
`cli-adapter-real-binary`. **The founder-set MODEL values are untouched** — only the provider label,
which was wrong before this change and merely harmless. This was flagged twice as cosmetic before it
became load-bearing.

---



**The opencode "hang" was mine, not the machine's.** `opencode run` waits on stdin when stdin is
neither a TTY nor closed. Every manual run from a non-interactive shell hung; every adapter-driven run
succeeded, because `CliHarnessAdapter` calls `child.stdin?.end()`. Adding `< /dev/null` answers in
seconds. The 2.9 GB database and the "second worktree" were both wrong theories, and killing opencode
processes over them accomplished nothing. **The same failure mode was already solved for codex** in
this session ("Reading additional input from stdin…") — a driven CLI gets closed stdin, always.

---

## Batch 5 — Every model call goes through a real harness session

**Change.** Delete the cassette seam (`__testing__/llm-cassette.ts`, `setLlmInterceptor`, the AH6
Playwright lane and its committed cassettes). Move the browser lane onto a real CLI. Give evals a
harness selector and make a result name its harness and model, replacing the `DirectHarnessAdapter`
that is registered as type `"builtin"` and has never run a real CLI despite its own comment claiming
it does.

**CORRECTED 2026-08-28.** This batch used to say "re-establish the two `af7` proofs through real
harness sessions". That was wrong, and reading them settled it: both are regression tests for the
**built-in adapter's own internals** — `af7-session-isolation` guards a session-map scan in
`setSessionToolRegistry` that could bind one session's registry to another, and
`af7-handoff-revokes-tools` guards an abort check inside builtin's `executeToolCalls`. Neither
mechanism exists for a CLI harness, which reaches its tools through the MCP bridge in a separate
process. They are not general proofs to port; they die with the code they guard, in Batch 6.

**But the properties they assert do generalise, and one has no CLI proof at all.** Counting the
`[harness:<name>]` lanes: `AL7-two-session-trust` and `assistant-reply-live-harness` cover all five,
`real-harness-return-enforcement` covers several — and **`AU9-assistant-handoff-realbinary` is
`builtin` only**. So when builtin goes, both the unit test and the only handoff lane go with it, and
"handing a task off stops the prior session's tool access" becomes unproven on every harness that is
left. That gap has to be closed here, before Batch 6, not discovered after it.

**Founder rulings, 2026-08-28/29, which settle this batch's shape.**

- **The browser is not a harness surface at all.** The web version exists to command remote workers;
  it does not run local harnesses and is not supposed to. So the cassette lane is **not** replaced by
  a real-CLI browser lane — it is deleted, and browser tests stop making model calls, because in the
  web version there is no model call to make. `topology: "disabled"` was never the bug it looked like.
- **The eval harness is one setting for the run** — whatever is simplest. Run-scoped state the runner
  sets once, not a codemod over 77 call sites.
- **Any harness test runs against every harness. Anything that existed purely for the built-in one
  goes out.** That decides both `af7` tests (deleted, not ported) and `AU9-assistant-handoff`, which is
  `builtin`-only today: handoff becomes a lane across all four, or it is not a harness test.

This lands **before** the deletion, so the removal subtracts code and not coverage.

**Done when.** Nothing in the repo intercepts a model call. Browser lane drives a real CLI. Evals run per
harness and two harnesses can be compared on the same scenario.

**Prove it.** The lanes run. A missing harness fails the run naming it — never skips.

**You test.** Run an eval on two different CLIs and compare the results.

---

**Progress 2026-08-30. The cassette seam is deleted and no test intercepts a model call.**
`llm-cassette`, `setLlmInterceptor`, the AH6 Playwright lane, its server, its committed cassettes and
its scripts are gone, along with the two `af7` tests that guarded the built-in adapter's own internals.
`core-ui`'s dependency on `harness-registry` existed only for that test server and went with it; the
misplacement ledger loses its `llm-client` entry and ratchets 4 → 3. One `callLlm` mock remains, in
`builtin-harness-adapter.test.ts`, and it is builtin's own unit test — it goes with builtin in Batch 6,
not before, or the harness ships untested while it still ships.

**The handoff lane across all harnesses is NOT done, and here is exactly where it got to.** The rewrite
(shared proof body + five `requireHarness` lanes, mirroring `assistant-reply-live-harness`) works for
`builtin` (13s) and `claude` (51s) when each lane runs alone. Run all five in one file and three time
out. It is reverted rather than committed red. Three things it turned up, all of which a redo needs:

1. **`HARNESS_TEST_MODELS.builtin` is mislabelled**, exactly like `opencode` was. It says
   `openai-compatible` while its own `baseUrl` is `openrouter.ai` and its key is `OPENROUTER_API_KEY`.
   Taking that label at face value sends the resolver hunting for an `openai_compatible_api_key`
   nobody seeded, so no model resolves and the turn never starts. It was invisible because the old
   lane hardcoded `"openrouter"` instead of reading the map.
2. **`createServer(port, …)` composes the MCP base URL from the port it is HANDED, before binding.**
   Pass `0` and every spawned harness is told to dial `http://localhost:0` — a bridge address that
   cannot be reached, so the agent has no tools and can never call `reply()`. The built-in harness
   never noticed, because it calls tools in-process; this is the single sharpest illustration of what
   the built-in harness has been hiding. Bind a real free port first.
3. **codex does not complete a turn on this machine, and that is not this lane's doing.** With the two
   fixes above applied, `builtin` (13s) and `claude` (51s) pass alone; `codex` produces no assistant
   message at all inside 240s. The `real-harness-return-enforcement` codex lane **already fails on
   `origin/main`** in the same way (its binary never reaches `turn.completed`), verified by restoring
   main's production files and re-running. So codex is red in two independent lanes for a reason that
   predates this work — and "every harness" coverage cannot be honestly claimed until that is
   understood. `cursor-agent` is the other harness already red on main.
4. **Five full servers, each with its own durable poller, do not coexist in one file** against a
   fixture DB that truncates between tests — the leftovers surface as
   `Unknown agent request <id>` unhandled rejections. `assistant-reply-live-harness` avoids this by
   driving `composition.runSession` directly instead of booting a server per lane; the handoff proof
   cannot, because the HTTP → poller chain IS what it proves. Either the lanes get one file each, or
   disposal has to be provably complete between them.

**The lane was applied, and the draft that carried it is deleted.**
`AU9-assistant-handoff-realbinary.integration.test.ts` now runs four lanes — claude, codex, opencode,
cursor-agent — with the fixes above. The `builtin` lane went with the harness, and with it the
`RUN_CONFIG_PROVIDER` override and the mislabelled `openai-compatible` entry that only ever existed
to work around it. The draft file itself was a copy of the pre-Batch-6 test, built around
`BuiltinHarnessAdapter`; keeping it after that class was deleted would have left dead code with a
stale import, which is exactly what the destructive-migration rule forbids.

Findings 3 and 4 are recorded above as the reasons this took the shape it did, not as open work.

---

## Batch 6 — The built-in harness is gone

**Change.** Delete `builtin-harness-adapter.ts` (1,034 lines), `llm-client.ts` (818) and `llm-types.ts`,
the request-fields half of `model-options.ts` (`modelOptionArgv` stays — it serves the CLIs), the five
forks in `provisioner.ts` (`:1105`, `:1366`, `:1481`, `:1579`, `:1719`), the `builtin` branch of the
capability descriptor, `probeBuiltinGateway`, the never-disableable carve-outs in `routes/harnesses.ts` and
`harness-presentation.ts`, the setup row and `BuiltinDetail`, the name from `HarnessAdapterType` and the
supported list. Migrate every agent row that names it.

Full and destructive — no shim, no alias, no adapter left registered. The three unrelated `builtin` nouns
are untouched.

One thing to decide, not assume: four of the five provisioner forks read "not built-in ⇒ do the MCP
thing", so they become unconditional. The fifth is the resolved-model guard, which has no meaning without
the built-in harness — its removal must not quietly drop a check a CLI session still needs. State what's
still true.

**Done when.** A session can only run through an installed harness, provisioning has one path, no agent is
stranded and the row count is unchanged.

**Prove it.** Upgrade a populated database and check every affected row. Run a session on each harness
after the deletion.

**You test.** Use the app end to end — the built-in harness appears nowhere, and `builtin:` routines still
fire.

---

## Batch 7 — Model settings belong to the harness

**Change.** Replace the three-tier gateway screen (`SettingsModels.tsx`, 381 lines — reasoning / workhorse
/ fast) with per-harness settings: this harness's models, and what it needs from you — a key for the ones
that take a key, its own sign-in for the ones that don't. Then delete whatever credential and gateway code
has no consumer left: `ModelGatewayConfig`, `BUILT_IN_GATEWAY_CONFIG`, `MODEL_CATALOG`, `resolveModel`, and
any credential name nothing reads.

Every credential that survives must have a named consumer. A key someone already entered for a harness
that still uses it keeps working — nobody re-enters a key.

**Done when.** No product-wide model configuration exists anywhere, and every stored credential has a
reader.

**Prove it.** Trace every credential to its consumer. Upgrade a workspace that had a stored key and see
agents keep running.

**You test.** Open settings — each harness shows its own models and its own auth, and there's no tier
screen left.

---

## Open questions

1. **Existing agents on the built-in harness.** When we migrate `harness_type = 'builtin'` rows, what do
   they become? The workspace's chosen default is the obvious answer — but if several harnesses are
   installed and no default was ever set (workspaces created before Batch 4), we need a rule. Simplest:
   the first ready harness in discovery order, and say so in the release note.
2. **opencode's free tier.** With zero credentials it still offers 8 free `opencode/*` models. That makes
   a no-key, no-login first run technically possible. You ruled "block at setup" — I'm flagging this
   because it's new information, not to reopen it.
3. **cursor-agent's readback is a label, not an id.** `"Composer 2.5"` for `composer-2.5`. Mapping via
   `--list-models` is straightforward and fails loudly if a label stops matching. Good enough, or do you
   want something stronger for cursor?
4. **Eval breadth.** Every scenario on every harness by default is expensive. Default to one harness with
   an explicit flag to fan out, or always fan out?

---

## Not doing

Bundling or auto-installing a CLI. A model list written down anywhere. Reworking what evals measure.
Touching `builtin:` routines, the reserved `builtin` plugin id, or the `builtin` behaviour-config origin.
Keeping any compatibility path for anything removed.

---

# DONE — the removal, and what it cost

The built-in harness is gone from discovery, settings, setup, the provisioner, the eval, and the
database. Typecheck, lint, 5775 unit tests and 2427 service-integration tests are green, and the
live reply proof passes on **all four harnesses** (claude, codex, opencode, cursor-agent).

## What removal actually took out

Each of these existed for the built-in harness alone and had said so in its own comments:

- **Discovery's odd probe** — the one that answered a credential question instead of an
  installed-binary one, and fetched its model list off the network (Anthropic + OpenRouter
  `/models`). 223 lines.
- **The two exemptions.** It was the one harness that could not be disabled, and the one
  harness-type literal the descriptor-driven lint rule allowed. The rule now bans every harness-type
  literal in presentation files — the surface is finally what it always claimed to be.
- **The gateway-catalog UNKNOWN_MODEL clause**, which judged a model id against a static list of four
  gateway ids.
- **`inheritedFromGateway`** on the model descriptor — every producer had been setting it `false`
  since discovery started reading each harness's own list.
- **`SessionConfig.messages`**, which delivered the calling thread's transcript a second time. Only
  the built-in adapter read it; every CLI harness takes the same transcript from the prompt's
  `## Conversation` section.
- **The `builtin-loop` enforcement channel**, which no adapter declares.
- **The resolvedModel-presence guard** in admission, and **`enforceResolvedModelGuard`** threaded
  through contracts and runtime to reach it.

## Two fabricated defaults, deleted

`derivePrimaryHarness` returned `claude-sonnet-4-6` / `anthropic` whenever a descriptor named no
selectable model, and `scaffold-agents` did the same for a team with no stored model. That pair was
invented, not chosen — it named an Anthropic model on harnesses that may not serve one, and was
written onto every scaffolded agent as though a user had picked it. Absence is now carried as
absence, and the harness runs its own default.

## Answers to the open questions above

1. **Existing builtin agents → codex** (your ruling), with `model_id`, `model_provider` and
   `model_options_json` cleared. A builtin agent's model id is a gateway id codex cannot serve;
   passing it as `--model` would fail every run in a way that looks like the agent is broken. NULL
   means "the harness's own default", which is the honest answer — only the person who configured
   that agent can pick its replacement. Migration `0065`, with a test that goes red when the model
   is not cleared. An agent that stored NO harness is deliberately untouched: it never chose one.
4. **Eval breadth: one harness per run.** `--harness` picks it, `--model` picks what it runs, and the
   report records which harness produced the score. A report that mixed harnesses would not be
   readable. `--judge-model` is a separate axis so a harness comparison is not also a judge
   comparison.

## The eval was measuring the wrong thing

It assembled its own two-adapter pool: an in-process `BuiltinHarnessAdapter` by default, and a direct
single-call LLM adapter under `harnessKind:"external"`. Both were model calls wearing the adapter
interface, so a score said something about the model and almost nothing about HyperIdle — no MCP
bridge, no `.mcp.json` dialect, no return hook was ever exercised. Eval now builds the same pool
production builds.

It also stopped passing a gateway credential into sessions. A CLI adapter forwards
`resolvedModel.apiKey` to its subprocess under its provider's variable name, so handing codex an
OpenRouter key as `OPENAI_API_KEY` would shadow the ChatGPT login it actually authenticates with.

## Bring-your-own-key still works, on opencode

A harness declares `acceptsApiKey` when it can run on a key HyperIdle stores — derived from the
`credentialEnvByProvider` mapping that actually hands the key to the subprocess, not a per-binary
list. opencode declares it; nothing else does, which is what stops an unrelated key being injected
over another CLI's own login. The key fields render under that harness's row in setup, and the
provider + model the user picks land on the team's `primaryHarness`.

**`openai-compatible` is no longer offered at setup.** The key used to go to the gateway's tiers,
which could store an arbitrary endpoint. Setup now writes the provider onto every scaffolded agent,
and per-agent `openai-compatible` is rejected by `validateAgentConfig` (422 UNSUPPORTED_PROVIDER) and
by the model resolver alike — a decision that predates this work. Offering it would have built a team
the API refuses. **This is the one capability the removal narrowed**, and it needs your call — see
below.

---

# DONE — why cursor never worked

Every cursor session ran with **no HyperIdle tools at all**. The agent said so in its own transcript:

> "there's no `hyperidle` MCP server registered" — so it answered in plain text, which never calls
> `reply()`, so the lane read `not_returned` every time.

**cursor-agent resolves `.cursor/mcp.json` against the root of the enclosing git repository, not its
working directory.** A session sandbox is `<base>/local-sb-N-<ts>/`, and `<base>` is a git repo — so
cursor looked in the base, found no `.cursor/`, and started with nothing. The config file had been
written correctly the whole time, into a directory cursor never reads.

Pinned by reproducing it three ways against the real binary: the same sandbox one directory up (a
repo root) connects; as a plain subdirectory it does not; `git init` inside it connects again.

Two things I checked and ruled out before finding it, both worth recording because both looked
guilty:

- **The literal tool name.** `literalToolNamerForAdapterType` maps cursor to `mcp__hyperidle__reply`,
  but cursor's real name is `hyperidle-reply` — the comment claiming all three CLIs share the `mcp__`
  convention is wrong about cursor. It changes nothing: cursor resolves either form through a
  `getMcpTools` lookup first, and both succeed. A real inaccuracy, not the bug.
- **The stateful MCP transport.** The bridge mints an `mcp-session-id` and validates it on requests
  2+. Cursor echoes it correctly.

`--workspace <sandbox>` does **not** fix it — cursor takes the workspace from the repo root
regardless. Writing `.cursor/mcp.json` at the real repo root was rejected: that root can be the
user's own checkout, and a per-session bridge token has no business being written into it.

---

# Still open — needs your call

1. **The model gateway is half-retired.** `SettingsModels.tsx` (the three tier rows) is now reachable
   only from its own story — dead production code by the repo's own rule. But `modelGateway` still
   drives `resolveModel({kind:"tier"})` at runtime, so deleting the screen alone would leave a
   setting nobody can see or change. Retiring it properly is its own piece of work.
2. **Bringing an arbitrary OpenAI-compatible endpoint.** Blocked end-to-end today: per-agent
   `openai-compatible` is refused in three places. Batch 3 built `customEndpointProvider` so opencode
   could carry a brought endpoint — that plumbing is currently unreachable for the same reason. Do
   you want that path opened (it needs somewhere to store the base URL), or is
   anthropic + openrouter the whole supported set?
3. **The AU9 all-harness handoff lane** is red on lanes other than the reply proof. It is new — I
   wrote it in this session — so it is as likely to be wrong as the code. Worth a pass once you have
   ruled on the two above.


---

# DONE — the model gateway, fully removed

You asked whether it could go entirely. It could, and it has.

**Why it was half-retired:** the tier screen had lost its only entry point, but the config behind it
still ran at session start. Every session resolved a `ResolvedModel` — provider, model, apiKey,
baseUrl — and three things still read it in the CLI adapter: the `{{model}}` fallback, the key
injection into opencode, and the brought-endpoint block. Deleting the screen alone would have left a
setting nobody could see that still ran.

Your ruling on keys killed all three, so the whole thing went:

- `ModelGatewayConfig` / `ModelTierConfig` in server config, with its per-tier merge
- `BUILT_IN_GATEWAY_CONFIG`, `PATCH /api/model-gateway`, the `SettingsModels` tier screen
- `resolveModel` and `resolve-model.ts`; the `resolveModel` port threaded through contracts,
  runtime, both boots and both applications; the drain-time resolution in `start-runtime`
- `MODEL_CATALOG` with `catalogEntry`/`isCatalogModel` and `DEFAULT_AGENT_MODEL_ID`
- `context-window.ts`, which sized a context window for the harness that made the call
- `ResolvedModel` off the session path entirely

`model-gateway.ts` is now `model-provider.ts`, holding the provider names an agent's
`model_provider` and an adapter's `modelProviders` still speak.

**The credential catalog went from four names to one.** The three model-provider keys existed so
HyperIdle could call a provider, and later so a key could be injected into a harness. Neither
happens. `shared_backend_key` stays — the key a remote worker presents to reach this server, and the
only secret genuinely ours to hold. With the three went the boot env-seed, the desktop app's
read-key-into-`ANTHROPIC_API_KEY` step, its worker provider detection, and the two API-pinging
validators. `CredentialResolver` survived the file it lived in: the port outlives the resolution,
because that one key still has to be fetched.

**Bring-your-own-key is out of setup entirely** — no provider picker, no key field, no OpenRouter
catalogue fetch, no credential write. A harness arrives logged in or it is not choosable. This also
retires the open question above about arbitrary OpenAI-compatible endpoints: not supported, by
decision rather than by omission.

The eval's judge keeps working — it resolves its own model straight from the environment, which is
all it ever needed for one SDK call.

---

# DONE — the harness lane

Three things kept it red, and none of them was a harness being broken:

1. **`opencode-runs-on-a-brought-key`** proved opencode answered on an injected key. That capability
   is gone, so the lane went with it.
2. **`adapter-pool-real-discovery`** asserted "always-present local adapters are registered" and
   expected at least two — from when the built-in adapter was unconditional. It now asserts what
   `requireHarness` guarantees, plus the inverse: no adapter is registered that is not a real CLI.
3. **A detached failure path could throw into the void.** `runSession`'s `.catch()` ends with
   `transitionAgentRunLifecycle`, which throws "Unknown agent request" when the CAS matches no row —
   usually because the request already reached a terminal state. Nothing catches it, so it became an
   unhandled rejection. That is why AU9 reported as a failed file while all four of its harness lanes
   passed. It is caught and reported now, not swallowed.

**codex was never broken.** I probed the real binary directly: its `Stop` hook fires reliably with
`CODEX_HOME`, with the copied `config.toml`, and with the exact argv the test uses. The
return-enforcement lane passes.
