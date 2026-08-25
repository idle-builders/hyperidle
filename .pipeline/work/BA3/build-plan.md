# BA3 — build plan

A setting on an agent, which we feed to the harness when it runs.

Line numbers are anchors from 2026-08-25 — re-find by symbol, they drift.

---

## 1. Store it

**`framework/db/src/schema.ts:115`** — `agentRunConfig` gains one column:

```ts
modelOptionsJson: text("model_options_json"),
```

Nullable, no default, no backfill. Every existing row stays NULL and behaves as today. Generate the
migration with `npm run db:generate` (lands as `framework/db/drizzle/0061_*.sql`, following
`0060_BA1_one_routine_primitive.sql`).

**`layers/agent-orchestration/run-orchestration/src/agent-run-config-store.ts`** — this file owns the
table; nothing else may read or write it. Thread the column through `readAgentRunConfig` (~:75),
`readAgentRunConfigs` (~:94), `writeAgentRunConfig` (~:121) and `DEFAULT_AGENT_RUN_CONFIG`. Parse to
`Record<string, string | number | boolean>`; a NULL or unparseable value reads as `{}`.

> `readAgentRunConfig` already treats an absent row as an all-null row (`@lore AU26 G1`). Keep that:
> no row and no options are the same thing.

**`layers/core-api/src/routes/agents.ts`** — the create and PATCH zod schemas (~:56, ~:68), the patch
builder (~:122), and the response (~:211). Follow exactly how `modelId` is handled at each site.

**Store only what the user set.** A control sitting at the harness's default writes no key. An absent
key means "whatever the harness does" — that is what keeps an untouched agent byte-identical to
today, and stops an agent being frozen to whatever the default was the day someone opened the editor.

---

## 2. Carry it

**`framework/harness-protocol/src/harness/harness-adapter.ts:65`** — `SessionConfig` gains:

```ts
readonly modelOptions?: Readonly<Record<string, string | number | boolean>>;
```

**`layers/agent-orchestration/run-orchestration/src/provisioner.ts`** — the run config is already
read at `:895` (`readAgentRunConfig(db, params.agentId)`) and `sessionStartConfig` is built at
`:1459`, in the same function. One spread, next to `resolvedModel`:

```ts
...(Object.keys(modelOptions).length > 0 ? { modelOptions } : {}),
```

Empty → the field is absent → every adapter builds exactly what it builds today.

---

## 3. Apply it

**New module `layers/agent-execution/harness-registry/src/model-options.ts`** — one place holding,
per harness, both *what it declares* and *how that reaches the binary*. Keep the two in one file with
the carrier's key set derived from the declared keys, so a declared option with no carrier fails
`npm run check`. That is the whole guard against rebuilding the write-but-never-read defect.

| Harness | Carrier |
|---|---|
| `claude-code` | argv `--effort <value>` |
| `codex` | argv `-c model_reasoning_effort=<value>` |
| `opencode` | argv `--variant <value>` |
| `builtin` | `reasoning_effort` on the request body |
| `cursor-agent` | — declares nothing |

**`cli-harness-adapter.ts:463`** (`startSession`) — the static arg templates live in
`adapter-pool.ts` (`:318` codex, `:359`, `:444`, `:489`). Append option args **after** template
resolution and after the existing empty-`--model` filtering (~:490-505), so the `@lore AR4 WARNING-D1`
behaviour is untouched.

**`cli-harness-adapter.ts:820-829`** — the re-engage path rebuilds argv from scratch and currently
re-adds only `--model`. Without a fix here options vanish mid-session. This is invisible from
`startSession`; it is the easiest thing in this plan to miss.

**Builtin** — `builtin-harness-adapter.ts` calls `llm-client.ts`. Add the field to `CallLlmOptions`
(`:33`) and onto the OpenAI-shaped body (`:606`, beside `max_tokens`). Anthropic (`:549`) has no
equivalent, so nothing is declared on that path.

---

## 4. Declare it

The descriptor types already exist (`HarnessModelOptionDescriptor`, four control shapes) in
`framework/harness-capability/src/harness/harness-capability-descriptor.ts`. Today **five sites write
`options: []`** — that is the entire reason the feature has never appeared:

- `harness-discovery.ts:100` (claude `claude models`), `:140` (opencode `models --verbose`),
  `:692` (Anthropic), `:731` (OpenRouter)
- `harness-capability-descriptors.ts:45` (builtin from `MODEL_CATALOG`)

Fill them in per model:

- **claude** — `--effort`: `low·medium·high·xhigh·max`, a compile-time constant. Claude's model probe
  does not publish them.
- **opencode** — `opencode models --verbose` already emits a per-model `variants` map; the parser at
  `parseOpencodeModelJson` (~:122) currently drops it. Read it.
- **builtin / OpenRouter** — `/v1/models` publishes `supported_parameters`, `reasoning.supported_efforts`
  and `reasoning.default_effort` per model. Use the model's own default as the descriptor's
  `defaultValue`.
- **codex** — has no model probe at all today; see below.
- **cursor-agent** — declares nothing.

**Codex needs a model list before it can have options**, because options hang off a model. Read
`~/.codex/models_cache.json`: 8 models, account-scoped, each with `slug`, `visibility`,
`supported_in_api`, `default_reasoning_level` and its own `supported_reasoning_levels` (each entry
carries an `effort` and a human-readable `description` → the descriptor's `helpText`). Selectable set
is `visibility === "list" && supported_in_api === true` — six of the eight today.

A hardcoded list is **wrong**, not merely brittle: it would offer `max` on `gpt-5.4`, which rejects
it, and hide `ultra` on `gpt-5.6-sol`, which takes it. So read the file, and on any failure — missing,
unreadable, bad JSON, torn mid-write, empty `models` — codex declares no models and no options, which
is exactly today's behaviour. **No fallback constant**; a fallback is how a wrong list ships anyway. A
single malformed model row skips that model, not the file.

Commit a real captured cache as the test fixture. Do not hand-write one.

---

## 5. Show it

**`layers/core-ui/src/settings/AgentEditor.tsx`** — `AgentEditorDraft` (`:49`) gains
`modelOptions: Record<string, string | number | boolean>`. Add a section after the harness/model/max-
sessions field row (ends ~`:287`) and before the system prompt, sourced purely from
`descriptor.models.find(m => m.id === draft.modelId)?.options` — no harness-type branching.

Use the existing primitives in `layers/core-ui/src/ds/`: `SectionLabel` for the heading, `Select`,
`Toggle`, `Input`. One helper line carries the whole idea: **"Applied to every run of this agent."**

- select → `Select`. An optional one gets a leading `Default (<value>)` choice with `value=""`,
  placed **in `options`, never in `placeholder`** — `Select.placeholder` renders a *disabled*
  `value=""` option (`Select.tsx:27`), which would make the unset state unreachable.
- boolean → `Toggle`. Default position comes from the descriptor: on when `defaultValue === true`,
  off otherwise. Moving it back to its default clears the key.
- number/text → `Input`, with `defaultValue` shown as a **placeholder**, so typing nothing stores nothing.

**Empty state: render nothing.** No heading, no box, no "this model has no options" line — identical
DOM to today. That covers all of: the model declares none, no model selected, and the harness fetch
failed.

**Switching.** Harness switch clears options (it already resets `modelId` at `:236`). Model switch
keeps only keys the new model declares whose value is still valid.

---

## 6. Two rules that prevent real bugs

Both are the same trap: an empty probe result means *"we could not ask"*, not *"there is nothing"*.

- **Never drop a stored value because a list is missing.** Enforce a choice list only when we actually
  have one. `harness-discovery.ts:673` and `:712` return `[]` on a failed fetch.
- **Only write keys the editor rendered.** Saving an agent while a probe is failing must not prune
  settings the editor could not display. Carry unrendered stored keys through untouched.

Stale keys are dropped at run time instead, in `model-options.ts`, against the harness's declaration.

---

## 7. Order

1. Schema + migration + store (+ the migration test against a **populated** database — replay the real
   `.sql` files through `migrate()`; do not hand-write a pre-migration schema).
2. `SessionConfig` field + provisioner spread. Prove an agent with no options produces
   character-for-character today's invocation.
3. `model-options.ts` with claude's `--effort` + the CLI adapter argv, including the re-engage path.
4. The remaining declarations: opencode variants, OpenRouter efforts, codex cache reader.
5. Editor UI.
6. Cleanup (§9).
7. Add `AgentEditor.tsx` to the no-harness-branching ESLint rule (`eslint.config.ts:748-751`, which
   today lists only `harness-presentation.ts` and `SettingsHarnesses.tsx`) — prove it fires by
   temporarily adding a `harnessType === "claude-code"` literal. Ship in the same commit as the
   correction to `docs/agent-layer/harness-capability-descriptor.md:227`, which currently claims that
   rule is enforced where it is not.

---

## 8. How we know it works

- **Set an option, run the agent, see it in the invocation.** For claude, prove the failure direction
  too: send a value the binary rejects and it names the flag back on stderr, enumerating the valid
  values. Widen the declared `select`'s own choice list to smuggle the bad value through the shipped
  code path — do not widen the control kind, or the check stops travelling the production branch.
- **An agent with nothing set produces character-for-character today's invocation.** This is the hard
  constraint; assert it per harness.
- **Codex degradation**: missing file, bad JSON, empty `models` → no models, no options, today's
  behaviour.
- `opencode` silently ignores bad values, so it has no failure signal — its check can only prove the
  unchanged path. Label it weaker; do not dress it up.
- Harness checks use the real installed binary via `requireHarness(...)`, and hard-fail when it is
  absent. That lane has **no CI job by design** — it runs locally, in the release checklist.
- Builtin's lane needs `OPENROUTER_API_KEY`, which is not in this environment. Provision `.env` by
  copying it; never inline the key.

---

## 9. Cleanup this package owes

- The dead `scope: "launch" | "durable"` field —
  `harness-capability-descriptor.ts:76` and its only reader, that file's own test at `:22`.
- Stale option fixtures in `SessionView.stories.tsx:266-315`, for a feature that no longer renders.
- Doc statements still describing per-message option pills as live. The pills themselves are already
  gone (removed by an earlier package); only a lore comment records them, at
  `layers/core-ui/src/__tests__/AM3-session-view.test.tsx:349`.

---

## 10. Known, accepted

- **An old `claude` crashes on `--effort`** — unknown flag → non-zero exit → the adapter reports the
  session crashed. The control is offered unconditionally, and this is the **only** harness with that
  exposure; the others take their choices from their own catalogues, so they cannot offer something
  their binary rejects.
- **Codex's cache is another tool's private file**, whose format is version-dependent — it records
  `client_version: 0.149.0` while the installed CLI is `0.146.1`, and no model in it carries
  `base_instructions`, which `0.146.1` requires. We need different fields than codex does, so our
  parse works; but a codex upgrade could break it, silently returning a configured agent to its
  default effort.
