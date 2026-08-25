# BA3 — Feasibility: per-model options across all five supported harnesses

**What this document answers.** The founder's amendment of 2026-08-25 raised the floor from *the first*
real declaration to **every** supported harness that genuinely exposes per-model options:

> *"Each of the five supported harnesses is investigated against its **real installed binary or API**,
> and every per-model option it genuinely exposes is declared. A harness that truly exposes none
> declares none — that is a finding, not a gap, and it must be recorded with the evidence that
> established it."*
> *"No option may be declared from memory or documentation alone."*

Every command below was run against the real installed binary or the vendor's live API on
**2026-08-25**, in this worktree's environment. Nothing here is from memory. Where something could only
be established from vendor documentation it is labelled **DOC-ONLY** and not treated as verified.

---

## Verdict table

| Harness | Binary / API + version | Verified 2026-08-25 | Declares |
|---|---|---|---|
| `claude-code` | `claude` **2.1.220** | `--effort <level>` — `low·medium·high·xhigh·max` | **1 option** (`effort`) |
| `codex` | `codex-cli` **0.146.1** | `-c model_reasoning_effort=<v>`; **per-model** levels, defaults and per-level descriptions published in `~/.codex/models_cache.json` | **1 option** (`reasoning_effort`) + **its model list**, both read from that file |
| `opencode` | `opencode` **1.18.16** | `--variant <v>` — **per-model** choice lists published in the harness's own catalogue | **1 option** (`variant`), per-model choices |
| `cursor-agent` | `cursor-agent` **2026.08.11-e8db854** | effort/fast are **model identity**, not options; bracket overrides are not enumerable and are rejected on the locked model | **none — a finding** |
| `builtin` | OpenRouter `/v1/models`, live HTTP 200, 418 models | `reasoning_effort`, with per-model `reasoning.supported_efforts` + `default_effort` | **1 option** (`reasoning_effort`), per-model choices |

Four of five declare. The one that does not is a recorded finding with its evidence, not a gap.

---

## Environment

```
$ claude --version        → 2.1.220 (Claude Code)
$ codex --version         → codex-cli 0.146.1
$ opencode --version      → 1.18.16
$ cursor-agent --version  → 2026.08.11-e8db854
```

**One environment limit, stated up front.** `OPENROUTER_API_KEY` is **absent** from this shell and the
repository has no `.env` (only `.env.example`). So for `builtin` I could verify the *declaration source*
live — OpenRouter's public `/v1/models` needs no auth — but **not** a live chat-completions round trip
carrying the parameter. That gap is named again in §5 and is exactly what the builder's
`requireHarness("builtin")` lane closes.

---

## 1. `claude-code` — `--effort`

**Method.** `claude --help`, then live runs with stdout and stderr separated and **stdin closed**,
because `CliHarnessAdapter` calls `child.stdin?.end()` immediately after spawn
(`cli-harness-adapter.ts:572`). This is not a detail: with stdin open, `claude` emits
`Warning: no stdin data received in 3s…` on stderr **even for a valid value**, which would surface as a
`CliStderr` event and break the positive lane.

```
$ claude --help | grep -A2 effort
  --effort <level>    Effort level for the current session
                      (low, medium, high, xhigh, max)

$ claude -p --model haiku --effort low       "say ok" </dev/null 2>&1 1>/dev/null → 0 bytes
$ claude -p --model haiku --effort ludicrous "say ok" </dev/null 2>&1 1>/dev/null →
  Warning: Unknown --effort value 'ludicrous' — ignoring it and using the default effort.
  Valid values: low, medium, high, xhigh, max.
```

**Facts established.** The flag exists with a closed five-value set that maps directly onto
`{kind:"select", choices}`. The binary parses it and knows its valid set — it names the flag and
enumerates the values, a string nothing in our plumbing knows, so only the real binary can produce it. A
valid value emits nothing. `CLAUDE_CLI_CONFIG` sets no `stderrIgnorePatterns` (`adapter-pool.ts:425-477`
— only codex `:344` and opencode `:402` do), so the warning reaches
`HarnessEvent{type:"error",code:"CliStderr"}` at `cli-harness-adapter.ts:721-731`.

**Accepted on the locked tiny model.** `HARNESS_TEST_MODELS.claude` is `haiku`; both runs above used it
and completed. No model bump is needed.

**Effect is statistical, and no assertion is built on it.** `--effort low` vs `max` on the same prompt
gave 125 vs 78 output tokens. `--output-format json` echoes **no** effort field anywhere in its result
object. So the positive lane can only assert an *absence* (zero `CliStderr`) — which would pass
identically if the carrier were deleted. **It is a smoke check; the tamper twin carries the whole
proof.**

**Scope.** `--effort` is a property of the CLI invocation, not of one model — it is declared for every
model the harness declares. Truthful, and §5 records the consequence.

---

## 2. `codex` — `model_reasoning_effort`, and the model-list problem

### 2.1 The option is real

`codex exec --help` shows no `--effort` flag; the surface is `-c key=value` config override. Two probes,
using `--strict-config` (which errors on any unrecognised field) to test the **key**, and a live run to
test the **value**:

```
$ codex exec --strict-config … -c model_reasoning_effortz="high" "…"
Error loading config.toml: unknown configuration field `model_reasoning_effortz` in -c/--config override

$ codex exec --strict-config … -c model_reasoning_effort="high" -m gpt-5.4-mini "…"
{"type":"item.completed","item":{"type":"agent_message","text":"391"}}
{"type":"turn.completed","usage":{…,"reasoning_output_tokens":11}}

$ codex exec --strict-config … -c model_reasoning_effort="ludicrous" -m gpt-5.4-mini "hi"
{"type":"error","message":"{… \"message\": \"[ReasoningEffortParam] [reasoning.effort]
 [invalid_enum_value] Invalid value: 'ludicrous'. Supported values are: 'none', 'minimal', 'low',
 'medium', 'high', 'xhigh', and 'max'.\", … \"status\": 400}"}
```

The bogus spelling is rejected by name; the real one is accepted; and the value is carried all the way
into `reasoning.effort` on the upstream request, where **the API itself enumerates the seven valid
values**. That enumeration is the choice list — derived from the vendor, not invented.

**Effect is statistical here too** (`reasoning_output_tokens` 10 at `low` vs 11 at `high` on a trivial
prompt). Recorded so nobody builds an assertion on it.

### 2.2 Codex *does* publish a model list — an earlier revision of this document was wrong

**Retraction.** This section previously claimed codex "publishes no model list — verified four ways"
and concluded a hardcoded constant was the only option. **That negative is false.**

```
$ ls -la ~/.codex/models_cache.json
-rw-r--r--@ 1 tg staff 194063 Aug 25 21:41 /Users/tg/.codex/models_cache.json

top-level keys: ['fetched_at', 'etag', 'client_version', 'models']
fetched_at:     2026-08-25T19:41:40.682370Z        ← today; codex refreshes it
client_version: 0.149.0                            ← note: installed CLI is 0.146.1
models:         8
```

**How the error was made, because the method is the lesson.** Three probes were sound — no `models`
subcommand, no ids in the 211 KB shell completions, no model check among `codex doctor --json`'s
eighteen. The fourth ran `ls -la ~/.codex/ | head -20` and then walked
`.codex-global-state.json` alone, and concluded about the whole directory. `models_cache.json` sorts
after `goals_1.sqlite-wal`, so `head -20` cut it off. **A truncated listing was read as an exhaustive
one, and a single-file negative was generalised to a directory.** The `codex doctor` line quoted as
corroboration — `failed to load models cache: missing field 'base_instructions'` — was misread as
"unreadable"; §2.4 shows what it actually means.

### 2.3 What the file contains

Verified first-hand, 2026-08-25:

```
slug                   visibility  supported_in_api  default   reasoning levels
gpt-5.6-sol            list        True              low       low medium high xhigh max ultra   (6)
gpt-5.6-terra          list        True              medium    low medium high xhigh max ultra   (6)
gpt-5.6-luna           list        True              medium    low medium high xhigh max         (5)
gpt-5.5                list        True              medium    low medium high xhigh             (4)
gpt-5.4                list        True              medium    low medium high xhigh             (4)
gpt-5.4-mini           list        True              medium    low medium high xhigh             (4)
gpt-5.3-codex-spark    list        False             high      low medium high xhigh             (4)
codex-auto-review      hide        True              medium    low medium high xhigh max         (5)
```

Each level is `{effort, description}`, and the descriptions are real prose:

```
low     — Fast responses with lighter reasoning
medium  — Balances speed and reasoning depth for everyday tasks
high    — Greater reasoning depth for complex problems
xhigh   — Extra high reasoning depth for complex problems
max     — Maximum reasoning depth for the hardest problems
ultra   — Maximum reasoning with automatic task delegation
```

**Four things this gives that a constant cannot:** a per-model level list; a per-model default
(`default_reasoning_level`); a real `helpText` per choice (`description`); and a selectable set defined
by the file's own two flags (`visibility === "list"` **and** `supported_in_api === true` → six models,
excluding the hidden auto-review model and the non-API spark model).

**It predicts this document's own live probes exactly.** `gpt-5.4` and `gpt-5.4-mini` are present —
both observed accepted (§2.5). `gpt-5.4-nano` and `gpt-5.4-codex` are absent — both observed rejected
400. Four independent confirmations that the file describes the account it sits in.

**And it retires the constant on correctness grounds alone.** A single seven-value list would offer
`max` on `gpt-5.4`, which does not take it, and hide `ultra` on `gpt-5.6-sol`, which does.

### 2.4 The version mismatch, read correctly

The file records `client_version: 0.149.0`; the installed CLI is `0.146.1`; and **no model in the file
carries `base_instructions`**, which 0.146.1 requires — which is exactly why `codex doctor` logs
`failed to load models cache: missing field 'base_instructions'`.

So the installed binary **cannot read this file**, and its schema has demonstrably changed between two
versions we can both observe. That is a genuine fragility and it is the central cost in the decision —
but it is a *format* fragility, not evidence the surface does not exist. `architecture.md` §3.7 weighs
it, and resolves it by making every read failure degrade to *no models and no options*, which is
byte-for-byte today's behaviour.

### 2.5 Model ids verified live against the running binary

```
$ codex exec … -m gpt-5.4       "reply with the single word ok" → {"type":"item.completed", … "ok"}  ACCEPTED
$ codex exec … -m gpt-5.4-mini  "…"                             → completes                          ACCEPTED
$ codex exec … -m gpt-5.4-nano  "…"                             → 400 "The 'gpt-5.4-nano' model is not
                                                                   supported when using Codex with a
                                                                   ChatGPT account."                 REJECTED
$ codex exec … -m gpt-5.4-codex "…"                             → 400, same shape                    REJECTED
```

Validation is server-side and account-scoped — the rejection names the account type. This matches the
repository's own recorded finding (`require-harness.ts`, AR7, verified live 2026-06-30) that
`gpt-5.4-mini` is the floor under a ChatGPT-account login. **Because the cache is written per account,
the list tracks the account rather than needing a constant to guess it** — which is why the earlier
claim that per-account staleness is *"not fixable by a better list; it is a property of codex"* is
withdrawn.

## 3. `opencode` — `--variant`, and a genuinely per-model choice list

`opencode run --help` (1.18.16):

```
--variant   model variant (provider-specific reasoning effort, e.g., high, max, minimal)   [string]
--thinking  show thinking blocks                                                          [boolean]
```

**`--variant` is the option, and unlike the other three its choices are published per model.**
`opencode models --verbose` emits one JSON blob per model, and each carries a `variants` map:

```
$ opencode models --verbose | (parse 363 model blocks)
models with non-empty variants: 146 / 363

openrouter/anthropic/claude-haiku-4.5 : ['high', 'max']
openrouter/anthropic/claude-opus-4.8  : ['low', 'medium', 'high', 'xhigh', 'max']
openrouter/~openai/gpt-latest         : ['none', 'low', 'medium', 'high', 'xhigh', 'max']
openrouter/z-ai/glm-4.7-flash         : {}          ← the locked test model
```

and the map's values are real provider config, not labels:

```json
"variants": { "high": { "reasoning": { "max_tokens": 16000 } },
              "max":  { "reasoning": { "max_tokens": 31999 } } }
```

**This is the finding that changes the architecture:** the choice list genuinely differs per model
(`claude-haiku-4.5` offers two, `claude-opus-4.8` offers five, `glm-4.7-flash` offers none). Per-model
divergence is no longer hypothetical, and `architecture.md` §3.3e is corrected accordingly.

**The effect is observable at a structural boundary, not as a token delta** — the best positive signal
found anywhere in this investigation:

```
$ opencode run "What is 17*23? number only" --pure --format json \
    --model openrouter/anthropic/claude-haiku-4.5 --variant max
  step_finish tokens: {"total":10095,"input":10,"output":35,"reasoning":67, …}

$ …same, no --variant
  step_finish tokens: {"total":9968,"input":3,"output":5,"reasoning":0, …}
```

Reasoning tokens go from **exactly 0** to non-zero. That is a zero/non-zero boundary, not a magnitude
comparison — the variant sets a `reasoning.max_tokens` budget where there was none.

**Two limits, both recorded rather than worked around:**

1. **A bogus variant is silently ignored.** `--variant ludicrous` on a model with variants completed
   normally, exit 0, no warning on stdout or stderr. **opencode has no tamper→red signal.** Its proof
   must be the zero/non-zero reasoning boundary, not an error string.
2. **The locked test model declares no variants.** `HARNESS_TEST_MODELS.opencode` is
   `openrouter/z-ai/glm-4.7-flash`, whose `variants` is `{}`. So a real `--variant` run cannot be proven
   on the founder-set model — and the rule is *never bump a test model to make a test pass*. The
   feature is not what is limited here; that model genuinely has nothing to set. The opencode harness
   lane therefore asserts the **no-options** path, which is the honest assertion for that model, and the
   per-model choice parsing is proven deterministically by a unit test over the real captured
   catalogue output.

**`--thinking` is deliberately not declared.** It is a boolean that controls whether the CLI *prints*
thinking blocks — it changes the harness's output stream, not how the model runs, and the session event
stream is BA4's package. Recorded as considered and excluded, not overlooked.

---

## 4. `cursor-agent` — exposes nothing declarable, and this is the finding

`cursor-agent --help` (2026.08.11-e8db854) advertises an option-like surface:

```
--model <model>   Model to use (e.g., gpt-5, sonnet-4-thinking). Parameterized models accept
                  quoted bracket overrides, e.g. 'claude-opus-4-8[context=1m,effort=high,fast=false]'
--list-models     List available models and exit
```

Three probes decide it:

1. **The axes are already model identity.** `--list-models` returns **204** flat ids, and the effort/fast
   dimensions are baked into them — `claude-opus-5-low`, `-medium`, `-high`, `-xhigh`, `-thinking-high`,
   `-high-fast`. Counting the suffixes: 29 `-high`, 25 `-low`, 22 `-medium`, 18 `-xhigh`, 15 `-fast`,
   plus the `-fast` combinations. **A user picks effort by picking a model.** Declaring an `effort`
   option on top would create two ways to say one thing.
2. **The bracket schema is not enumerable.** The word "Parameterized" appears exactly once in the whole
   `--list-models` output — in the trailing tip, as a single example string. **No entry is marked
   parameterized, and no surface lists the accepted keys or their values.** Declaring an option from that
   one example is precisely "declared from documentation alone", which the amendment forbids.
3. **The bracket form is rejected on the locked model.** `HARNESS_TEST_MODELS["cursor-agent"]` is `auto`:

```
$ cursor-agent -p --print --model 'auto[ludicrous=yes]' --trust "say ok"
Cannot use this model: auto[ludicrous=yes]. Available models: auto, gpt-5.3-codex-low, … (204 ids)
```

The whole bracketed string is treated as a model id and rejected against the flat list.

**Conclusion: `cursor-agent` declares no per-model options.** Not because we could not find one, but
because its per-model settings are expressed as model identity and its one alternative spelling has no
enumerable schema. That is a finding with evidence. Under the plan's hard constraint an agent on
cursor-agent therefore passes nothing and runs character-for-character as it does today, which
`architecture.md` §8 asserts on the real binary.

*(Not in scope and not proposed: publishing cursor-agent's 204-model list. The amendment named codex's
list as the single narrow exception, and unlike codex, cursor-agent has no option that a model list
would make reachable — its options **are** the models. Raised here only so the asymmetry is visible.)*

---

## 5. `builtin` — `reasoning_effort`, from OpenRouter's own catalogue

The builtin adapter makes direct provider calls. Its openai-compatible path posts to
`${baseUrl}/v1/chat/completions` with `{model, messages, max_tokens, tools?}`
(`llm-client.ts:589-608`), and `HARNESS_TEST_MODELS.builtin` routes through OpenRouter with
provider `openai-compatible`.

**OpenRouter's model catalogue is public, needs no auth, and publishes supported parameters per model.**
Fetched live:

```
$ curl -sS https://openrouter.ai/api/v1/models   → http=200  bytes=688668  models=418

supported_parameters frequency: max_tokens 407 · temperature 331 · reasoning 285 ·
                                reasoning_effort 143 · verbosity 22 · …
```

and per model:

```json
"deepseek/deepseek-v4-flash": {
  "supported_parameters": [… "reasoning", "reasoning_effort", "temperature", …],
  "reasoning": { "mandatory": false, "supported_efforts": ["xhigh","high"], "default_effort": "high" }
}
```

**Three things this gives, all machine-derived, none invented:**

1. `reasoning_effort` is a genuine per-model parameter, present on 143 of 418 models.
2. The **choice list is published per model** (`reasoning.supported_efforts`).
3. The **default is published** (`reasoning.default_effort`) — the only harness of the five that tells us
   its own default rather than leaving us to guess.

**And it lands on the locked tiny model.** `HARNESS_TEST_MODELS.builtin` is
`deepseek/deepseek-v4-flash`, which supports `reasoning_effort` with `["xhigh","high"]`. So unlike
opencode, the builtin harness lane **can** prove a real option on the founder-set model with no bump.

**Deliberately declaring one parameter, not twenty-five.** The catalogue's most common entries, with
their model counts out of 418: `max_tokens` 407, `response_format` 361, `tools` 348, `tool_choice` 342,
`structured_outputs` 332, **`temperature` 331**, `seed` 318, `top_p` 315, `stop` 286,
`include_reasoning` 285, `reasoning` 285, `frequency_penalty` 221, `presence_penalty` 215, `top_k` 200,
`logprobs` 145, **`reasoning_effort` 143**, `repetition_penalty` 137, `logit_bias` 131, `min_p` 101,
`verbosity` 22.

**`temperature` is the most significant exclusion and it is named first**, because it is on 331 models —
more than twice as many as `reasoning_effort` — and it is the parameter a reader would most expect to
see declared. It is excluded for the same reason as the rest: it is a model-tuning knob, not "the
settings this agent runs with". Others in that class: `seed`, `top_p`, `top_k`, `min_p`,
`repetition_penalty`, `frequency_penalty`, `presence_penalty`, `logit_bias`, `stop`, `logprobs`.
Excluded for a different reason — they are the harness's own plumbing, not a user setting —
`max_tokens`, `tools`, `tool_choice`, `response_format`, `structured_outputs`, `include_reasoning`. Declaring twenty-five controls per model would flood the agent editor and is not what the plan
describes. `reasoning_effort` is declared because it is the same concept the other three
harnesses expose (`--effort`, `model_reasoning_effort`, `--variant`) — one coherent idea, spelled four
ways. **This is a judgement about which parameters are agent configuration, and it is the founder's to
overturn**; the remaining catalogue entries are recorded here so the choice is visible rather than
silently narrowed.

**The honest gap.** With no `OPENROUTER_API_KEY` in this environment I could not run a live
chat-completions request carrying `reasoning_effort`. **DOC-ONLY / UNVERIFIED-END-TO-END:** that
OpenRouter accepts the parameter in a request body is inferred from its own catalogue declaring it
supported, not from a round trip I made. The declaration source is verified live; the acceptance is not.
The builder's `requireHarness("builtin")` lane — which gates on exactly that key — is what closes it,
and `architecture.md` §8 makes that lane's job explicit.

**Anthropic-direct is not declared.** The builtin adapter's other path posts Anthropic Messages format
to `api.anthropic.com`. `/v1/models` there needs an API key, absent here, and the effort parameter
(`output_config.effort`) is **DOC-ONLY** — from the bundled reference `claude models` prints, not from a
call I made. So no option is declared for builtin models that come from `fetchAnthropicModels` or
`MODEL_CATALOG`. That is a recorded gap, not a silent omission, and it costs nothing: those models
render no option block, exactly as AC 5 requires.

---

## 6. Old-CLI / old-catalogue risk, per harness

The amendment asks whether each newly declared option carries the same risk shape as claude's.
**It does not — and the difference is structural.**

| Harness | Behaviour on a binary that predates the option | Self-gating? |
|---|---|---|
| `claude-code` | Unknown **flag** → non-zero exit → adapter reports `outcome:"crashed"` (`cli-harness-adapter.ts:1087-1094`). **The whole session dies.** | **No.** The declaration is a compile-time constant, so an old binary is still offered the control. |
| `codex` | **Verified:** without `--strict-config` — which production args do not use — an unknown `-c` key is **silently ignored** and the turn completes normally. Only `--strict-config` turns it into an error. | **Yes, twice over.** The no-op above, *and* the declaration is read from that machine's own `models_cache.json` (§2.3), so a codex with no cache declares nothing at all. |
| `opencode` | Unknown flag would fail the same way as claude — **but** the declaration is derived from that binary's own `opencode models --verbose` output. An opencode too old to have `--variant` has no `variants` in its catalogue, so nothing is declared. | **Yes, structurally.** |
| `cursor-agent` | Declares nothing. | n/a |
| `builtin` | Declaration is derived from OpenRouter's live per-model `supported_parameters`. A model that does not list `reasoning_effort` declares none. | **Yes, structurally.** |

**So claude is the single harness whose declaration is not self-gating, and the only one whose old-CLI
failure is a crashed session.** That sharpens the residual rather than spreading it: the risk did not
multiply by four, it stayed exactly where it was. `architecture.md` §10.1 states it at that severity.

---

## 7. Summary of what is verified, and the two things that are not

**Verified live against the real binary or API, 2026-08-25:** every option key and its value set for
`claude-code`, `codex` and `opencode`; opencode's per-model variant maps and their `reasoning.max_tokens`
payloads; the builtin declaration source and the locked builtin model's supported efforts and default;
**codex's `models_cache.json` — its eight models, per-model reasoning levels, defaults, per-level
descriptions and its two selectability flags — plus the version mismatch that stops the installed binary
reading it**, and the accept/reject shape of four specific model ids that the file predicts exactly; cursor-agent's 204 flat model ids, its non-enumerable bracket schema and its
rejection of the bracket form on the locked model; and the old-CLI behaviour of claude and codex.

**Not verified, and labelled as such:**

1. **A live OpenRouter chat-completions round trip carrying `reasoning_effort`** — no
   `OPENROUTER_API_KEY` in this environment. Source verified; acceptance inferred. Closed by the
   builder's `requireHarness("builtin")` lane.
2. **Anthropic-direct `output_config.effort`** — DOC-ONLY, from the reference `claude models` prints.
   **No option is declared on that path because of it.**

No option anywhere in this package is declared on the strength of either.

**One correction of method, recorded so it is not repeated.** An earlier revision of this document
asserted a four-way negative about codex's model surface. Three probes were sound; the fourth read a
`head -20` truncation of a directory listing as exhaustive and generalised a single-file result to the
whole directory. `~/.codex/models_cache.json` was sitting just below the cut. **A negative is only as
strong as the completeness of the search that produced it**, and a truncated listing cannot produce one.
