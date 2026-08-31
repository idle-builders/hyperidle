# BA3 — How an agent's model runs is part of configuring that agent

**Status: not done.** Built and reviewed; the review returned NOT DONE on one blocking defect.

## What we need

When someone configures an agent, they set the options that model should run with — the settings a harness
exposes for it — once, as part of that agent's configuration, and those options then apply to every run of
that agent. Nobody sets them per message.

Two things are wrong today. Harnesses expose real per-model options and there is no way to use any of
them, so agents always run on defaults. And the machinery that exists is built around the wrong idea:
options were designed as pills a human toggles before each message, putting a per-message decision in
front of someone who wanted to configure an agent once and let it work. A harness *can* declare per-model
options and the composer *can* render them, but no production code has ever declared one — every
construction writes an empty list, so the pill row filters a permanently empty array and has never
appeared. Agent run configuration already stores which harness, model, provider and tier an agent uses,
with a working write path from the editor and a read path at provisioning; the one genuinely missing
connection is the harness adapter contract, which has no options input at all.

Done means an agent's configuration can hold the options its harness declares for its model and they
persist; options set on an agent reach the harness when it runs; an agent with no options configured
behaves exactly as before; no surface offers per-message toggles; and a harness that declares no options
for a model presents no option controls at all.

**Amended at the concept gate (2026-08-25): every supported harness that genuinely exposes per-model
options declares them here, not in a later package.** The original floor — ship the pass-through together
with the first real declaration, so options are never stored that no harness receives — still stands, but
shipping with Claude alone would leave the feature visibly empty for the other four, which is this defect
merely narrowed rather than fixed. So each of `claude-code`, `codex`, `opencode`, `cursor-agent` and
`builtin` is investigated against its **real installed binary or API**, nothing is declared from memory or
documentation, and each is recorded with the version and date that established it. A harness that truly
exposes none declares none — a finding recorded with its evidence, not a gap.

Out of scope: per-message or per-run overrides, and inventing options for a harness that has none.
Changing which models an agent may use is also out of scope, with one narrow exception the amendment adds:
**codex publishes no model list today**, and options hang off a model, so its real reasoning-effort option
is unreachable without one. Adding that list is in scope — it adds a harness's own models where none were
published and changes no model choice a user already has.

## How it works

**Store it.** One nullable column on the agent run config, no default and no backfill, so every existing
row stays null and behaves as today. The run-config store owns that table and nothing else reads or writes
it; a null or unparseable value reads as an empty map, and an absent row and no options are the same
thing. **Only what the user set is stored** — a control sitting at the harness's default writes no key. An
absent key means "whatever the harness does," which keeps an untouched agent byte-identical and stops an
agent being frozen to whatever the default happened to be the day someone opened the editor.

**Carry it.** `SessionConfig` gains an optional `modelOptions` map, spread into the session start config
next to the resolved model only when non-empty — empty means the field is absent and every adapter builds
exactly what it builds today. **Apply it** in one module in the harness registry, which is also where
stale keys are dropped at run time, checked against the harness's own declaration.

**Declare it** per harness, from the harness itself: Claude's effort levels as a compile-time constant
because its model probe does not publish them; opencode's per-model variants, which its probe already
emits and the parser was discarding; OpenRouter's supported parameters and reasoning efforts from its
models endpoint, using each model's own default as the descriptor default; codex's models and their
per-model reasoning levels read from its on-disk cache; and nothing for cursor-agent. A hardcoded codex
list would be *wrong*, not merely brittle — it would offer an effort one model rejects and hide one
another accepts — so on any failure (missing, unreadable, bad JSON, torn mid-write, empty) codex declares
no models and no options, exactly today's behaviour. **No fallback constant**, because a fallback is how a
wrong list ships anyway; a single malformed row skips that model, not the file.

**Show it** in the agent editor, sourced purely from the selected model's declared options with no
harness-type branching, above the system prompt, with one helper line: *"Applied to every run of this
agent."* **The empty state renders nothing** — no heading, no box, no "this model has no options" line,
identical DOM to today — which covers the model declaring none, no model selected, and a failed probe
alike. A harness switch clears options; a model switch keeps only keys the new model declares whose value
is still valid.

**Two rules prevent the same real bug**, which is that an empty probe result means *"we could not ask,"*
not *"there is nothing."* Never drop a stored value because a list is missing — enforce a choice list only
when one was actually obtained. And only write keys the editor rendered, so saving an agent while a probe
is failing does not prune settings the editor could not display. A type-level guard ties the halves
together: a declared option key with no carrier fails to compile, and so does a carrier for an undeclared
key.

## How we work on this

**The one blocking defect: assistant agents silently drop their options.** The agents editor is shared by
normal and assistant agents, but an assistant saves through its own route whose schema does not list
`modelOptions`, so the value is stripped on parse, never written, never returned. Claude-code declares its
effort option for every model, so an assistant on claude-code renders the control, the user sets it,
saves, and on reload sees the default again — the exact defect this package exists to remove, reproduced
for a whole class of agents. The UI half is already wired; the fix is to accept, thread and return
`modelOptions` on that route the way the normal agent route does. Two small defects go with it: a
duplicated spread in the builtin tool loop, and a `@lore` comment left on the wrong import after a
reorder.

**One scope question for the founder:** a correct but unrelated repointing of the design-system config and
rule (the old path no longer exists) is riding this branch and should be split out or explicitly kept.

**Accepted risks, recorded rather than solved.** An old `claude` binary rejects the effort flag, exits
non-zero, and the adapter reports the session crashed — the control is offered unconditionally and this is
the only harness with that exposure, since the others take their choices from their own catalogues.
Codex's cache is another tool's private file with a version-dependent format, so a codex upgrade could
break the parse and silently return a configured agent to its default effort. An agent switched from
OpenRouter to Anthropic keeps a stored effort value that the Anthropic path ignores — acceptable, since no
control is offered there. And the OpenRouter branch's multi-turn tool loop is only asserted single-turn;
it delegates to the same wire existing harness tests exercise, so the gap is real but minor.