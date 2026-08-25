# BA3 — Architecture

**Work package:** `.pipeline/work/BA3/plan.md`, **including the founder's Amendment of 2026-08-25** —
every supported harness that genuinely exposes per-model options declares them in this package, codex's
model list is in scope, and all four control shapes are built. **Tier:** `mvp`. **Approved design:**
`.pipeline/work/BA3/design/approved.md` **revision 2**
(the agent-editor surface; this document does not re-open it, and §3.3/§5 of that document bind this
one).

**Companion:** `.pipeline/work/BA3/feasibility.md` — the live evidence for the first real option
declaration.

Everything below was checked against the tree at `claude/pipeline-ba3-bc1ba7` in this worktree. A claim
without a `file:line` or a recorded command is marked `UNVERIFIED`.

---

## 0. Assumptions, stated up front

1. **A stored option set is the user's explicit choices only.** Design revision 2 §3.3 settled this;
   §3.1 below states the persistence contract that implements it.
2. **Nothing prunes at write time.** Design revision 2 §5.1 settled this; the stale-key filter is this
   document's, and it runs at session start (§3.3e).
3. **Absence never drops a value.** The reconciliation walk drops only on a *positive contradiction*.
   Where a choice list is a compile-time constant it is enforced; where it is probe-derived, an empty or
   missing list means "cannot verify" and the value passes. §3.3e — this is the decision that keeps a
   run-time filter from reintroducing the offline-wipe defect the design removed, now that two harnesses
   publish their choices through a probe.
4. **Four of the five harnesses declare, and three of the four publish their choices per model.**
   `claude-code` → `effort` (the only compile-time list); `codex` → `reasoning_effort` per model, read
   from its own `models_cache.json` along with the model list itself (§3.7); `opencode` → `variant` per
   model; `builtin` → `reasoning_effort` per model with a published default. **`cursor-agent` declares none — a recorded finding,
   not a gap.** All verified against the real binary or the vendor's live API on 2026-08-25; evidence
   and the two labelled `DOC-ONLY` gaps are in `feasibility.md`.
5. `pipeline.config.yml`'s `designSystem.path` (`framework/design-system`) does not exist; the live
   system is `layers/core-ui/src/ds/`. Verified. **Not BA3's to fix** — flagged, untouched.
6. No plan amendment is needed. Every obligation below traces to an AC, the plan's two constraints, or
   the BA track's cleanup rule.

---

## 1. Reconciliation — what the plan assumed vs. what is there

| Plan / registry statement | Reality | How this plan handles it |
|---|---|---|
| "A harness can declare per-model options" | True. `HarnessModelOptionControl` (`select`/`boolean`/`number`/`text`) and `HarnessModelOptionDescriptor` at `framework/harness-capability/src/harness/harness-capability-descriptor.ts:59-78`; options hang off a **model** (`HarnessModelDescriptor.options`, same file `:87`) | Unchanged. This is the vocabulary the whole package uses. |
| "the composer can render them as toggles" | **False, already.** `deriveComposerPills` and `HarnessOptionControlKind` exist nowhere on the tree (`rg -a` across all roots). Deleted by AU44 B0; only the record remains at `layers/core-ui/src/__tests__/AM3-session-view.test.tsx:349` | Plan AC 4 already holds. This package's job is to keep it holding and to remove the rubble the deletion left (§6). Nothing is rebuilt in order to be deleted. |
| "every construction writes an empty list" | True. `harness-capability-descriptors.ts:45`; `harness-discovery.ts:100,140,692,731` | One of them (`:100`, the claude-code catalog parser) becomes the first real declaration. |
| "Agent run configuration already stores harness, model, provider and tier with working read and write paths" | True. `agent_run_config` at `framework/db/src/schema.ts:115-125`; sole reader/writer `layers/agent-orchestration/run-orchestration/src/agent-run-config-store.ts`; seam at `framework/api-contract/src/agent-orchestration-port.ts:154-175`; write path `layers/core-api/src/routes/agents.ts:120-128`; live read at provisioning `layers/agent-orchestration/run-orchestration/src/provisioner.ts:895` | Extended by exactly one field, end to end. No new table, no new route, no new port. |
| "the missing connection is the harness adapter contract, which has no options input" | True. `SessionConfig` (`framework/harness-protocol/src/harness/harness-adapter.ts`) has no options field of any kind | §3.3. One optional field, one adapter change. |
| Design §6 item 1: `scope` is dead | Confirmed. `HarnessModelOptionDescriptor.scope` (`harness-capability-descriptor.ts:76`) is written by nothing in production and read only by its own test (`framework/harness-capability/src/harness/__tests__/harness-capability-descriptor.test.ts:22`) and the stale story fixture (`layers/core-ui/src/components/SessionView.stories.tsx:287,302`) | Deleted **before** the first real declaration is written, so the new declaration never has to state a field with one possible meaning (§6, §7 step 1). |

**Disagreements found that the plan did not name:**

- **`codex` declares no models today** (`CLI_PROBE_CONFIGS[0]`, `harness-discovery.ts:391-415`, never
  sets `models`), and **the amendment puts its list in scope** as the single narrow exception. An
  earlier revision of this document claimed codex "publishes no enumerable model surface anywhere,
  verified four ways". **That negative was wrong and is retracted.**
  `~/.codex/models_cache.json` is exactly that surface: 194 KB, refreshed today, carrying 8 models each
  with `slug`, `display_name`, `visibility`, `supported_in_api`, `default_reasoning_level` and a
  per-model `supported_reasoning_levels` array whose entries pair an `effort` with a human-readable
  `description`. Its data predicts all four of this package's own live probe results exactly.
  §3.7 designs against the file and records how the error happened.
- **Per-model divergence is real, and an earlier draft of this document said it was not.**
  `opencode models --verbose` publishes a `variants` map per model — 146 of 363 models declare one, and
  the lists genuinely differ (`claude-haiku-4.5` → `high·max`; `claude-opus-4.8` → five). OpenRouter's
  `/v1/models` does the same via `reasoning.supported_efforts`. §3.3e previously refused to thread a
  model parameter "for a distinction with no data behind it"; **there is now data behind it**, and the
  walk is model-keyed. This is the amendment's largest single consequence for the contracts.
- **The carrier is not uniformly "a CLI flag".** codex's option is a config override (`-c` plus a single
  `key=value` argv element), and builtin's is a request-body field, not argv at all. §3.3c replaces the
  flag-name map with three carrier spellings — exactly the three that have a real declaration behind
  them.
- **opencode's re-engage path would silently drop options.** `cli-harness-adapter.ts:820-829` rebuilds
  `runArgs` from scratch for the `process-reengage` channel — `["run", forceMsg, "--format", "json",
  "--pure"]` plus `--model` — so anything appended in `startSession` is lost on re-engagement. opencode
  is the only harness on that channel. §3.3e carries the option args on the session, as
  `reEngageResolvedModel` already is (`:611-612`).
- **`claude models` lists nine ids; `MODEL_CATALOG` has four.** `claude-opus-5`, `claude-mythos-5`,
  `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-5` are discoverable in the editor's model select
  but rejected 422 `UNKNOWN_MODEL` on save (`layers/core-api/src/routes/validate-agent-config.ts:76-84`
  vs `framework/domain-model/src/model-gateway.ts:81-90`). **Pre-existing, not BA3's.** It does not
  block this package: all four catalog ids (`claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`,
  `claude-fable-5`) do appear in `claude models`, so the option block is reachable on every model an
  agent can actually be saved with.
- **`AgentAddDialog`** (`layers/core-ui/src/pages/AgentAddDialog.tsx`) is a second create surface. It
  carries harness + model **tier**, never a `modelId` (`:38-49`, `:225-241`). No model ⇒ no declared
  options ⇒ nothing to render. **Deliberately untouched**, consistent with design §4 case 2.
- **`require-harness.ts:124-132` names a seam file that does not exist** (`provision-real-session.ts`),
  and a `honest-harness-guard` lint check that was deleted with `scripts/`. The harness lane's real
  entry idiom today is `new CliHarnessAdapter(<config>)` driven against the real binary
  (`layers/agent-execution/harness-registry/src/__tests__/cli-adapter-real-binary.integration.test.ts`).
  §8 uses that file. Do not chase the stale comment.
- **`.claude/rules/testing.md:73` names the same two non-existent seams** (`runThroughHarness` /
  `lockedHarnessAdapter`). The real export is `harnessTestResolvedModel`
  (`require-harness.ts:237`). So §8's `new CliHarnessAdapter(…)` idiom cannot violate a seam
  requirement that has no seam. **Not BA3's rubble** — a project rule file, not this feature's code —
  but surfaced here so the next agent stops being misled by a second stale pointer in the same area.

---

## 2. Obligation map — AC to implementation

| AC | Obligation | Where |
|---|---|---|
| 1. configuration can hold the declared options, and they persist | new nullable column + store field + seam field + API field + editor draft field; **nothing prunes on write** | §3.1, §3.2, §7 steps 2-3, 6-7 |
| 2. options reach the harness when the agent runs | `SessionConfig.modelOptions` + provisioner pass-through + run-time reconciliation + CLI carrier | §3.3, §7 steps 4-5 |
| 3. an agent with no options behaves as before | nullable column, no backfill; empty **or reconciling-to-empty** ⇒ zero extra argv | §3.4 |
| 4. no surface offers per-message option toggles | already true; keep it true; remove the rubble | §6 |
| 5. a model that declares no options presents no controls | pure descriptor sourcing, render nothing — **plus** the ESLint rule extended to cover the new surface, which is what makes the plan's *"Exposing options for harnesses that do not declare any"* exclusion mechanical rather than promised | design §4; §6 items 6-7; §7 steps 7-8 |
| plan constraint: pass-through ships with the first real declaration | one module owns declaration + carrier, bound by the type system | §3.5 |
| **A1.** every harness that genuinely exposes options declares them, and a run carries them through | four harnesses declare (`claude-code`, `codex`, `opencode`, `builtin`); three carrier spellings; per-model choice lists | §3.3c, §3.3e, §3.5 |
| **A2.** a harness that exposes none is recorded as such with its evidence | `cursor-agent` — 204 flat model ids where effort is model identity, a non-enumerable bracket schema, and the bracket form rejected on the locked model | `feasibility.md` §4; §3.5 |
| **A3.** codex publishes its model list, and its option is reachable and carried through | read `~/.codex/models_cache.json` — per-model levels, defaults and per-level `helpText`; any read or parse failure degrades to no models and no options, never a fallback constant | §3.7 |

---

## 3. The contracts

### 3.1 Storage — what an agent's configuration holds

**Column.** `agent_run_config` gains one nullable column:

```
model_options_json  text   -- nullable, no default, no backfill
```

`text("*_json")` is this schema's established spelling for a structured column — `tokens_actual_json`,
`payload_json`, `baked_request_json`, `default_value_json`, `user_value_json`
(`framework/db/src/schema.ts:161,301,381,1165,1193`). Do not introduce `jsonb`; a second spelling for
the same idea is the drift this repo already pays for elsewhere.

**Migration.** `framework/db/drizzle/0061_BA3_agent_model_options.sql` (0060 is the current tail), a
single `ALTER TABLE … ADD COLUMN`. **No backfill, no default, no constraint.** Every existing row keeps
`NULL`, which is the schema-level statement of the plan's hard constraint.

**Store type** (`layers/agent-orchestration/run-orchestration/src/agent-run-config-store.ts` — the sole
**production** reader/writer, and the only production file that may touch this column):

```
AgentRunConfig.modelOptions: Readonly<Record<string, string | number | boolean>> | null
DEFAULT_AGENT_RUN_CONFIG.modelOptions = null
```

`null` and `{}` mean the same thing everywhere downstream. `null` is the spelling because every other
nullable field in this record is `null` and the module's own `absent row ≡ all-null row` invariant
(its header `@lore`) must keep holding.

**Name the world, because it is not literally the only writer.** Four **development**-world files
insert into `agent_run_config` directly — `tools/eval/src/seeding.ts:125`,
`tools/setup/src/demo-fixture.ts:79`, `tools/setup/src/demo-world/cast.ts:93,110`,
`layers/core-ui/__scripts__/ah6-test-server.ts:253`. That is not a violation (`tools/` is outside the
shipping roots and `__scripts__` starts with `__`, so both are development world), and it is one more
argument for nullable-with-no-default: all four simply leave the column `NULL` and need no edit. A
builder must not read "sole writer" as "nothing else inserts rows" and skip checking them.

Serialisation lives in this module and nowhere else: `JSON.stringify` on write, `JSON.parse` on read,
added to `CONFIG_COLUMNS` and to both branches of `writeAgentRunConfig` (insert values + `updateSet`),
preserving the existing `"key" in patch` semantics — **an absent key is left alone; a present key
(including explicit `null`) is written.** That semantic is what lets the editor save a name-only edit
without touching options at all.

**No `try`/`catch` around the parse.** `.claude/rules/typescript.md` forbids swallowing, and this column
has exactly one writer which always writes `JSON.stringify` of a validated object. A malformed value
means something outside the application wrote the row, and a throw is the honest signal. Named residual
(§10.3).

**What the stored map contains** — design revision 2 §3.3, restated as the persistence contract the
builder implements:

> **A *required* option always contributes its value; an *optional* option contributes its value only
> when the control sits away from its default, and contributes no key at all when it sits at it.**

*(This is the design's current sentence. Revision 2's earlier one-breath rule — "a control sitting at
its default contributes no key" — was replaced because it is wrong for a required option: a required
select sitting at its `defaultValue` **does** contribute a key. Do not lift the old sentence.)*

- An untouched optional `select`/`number`/`text` stores nothing; `defaultValue` is displayed, never
  written.
- A `boolean` stores a key once the user moves it away from its default position, and **moving it back
  clears the key again**. An untouched boolean stores nothing; a round-trip leaves the configuration
  exactly as it found it.
- A **required** option always stores — there is no "let the harness decide" for something the model
  insists on.
- **Absence means "the harness decides"**, not "unset". That is the state every existing agent is in,
  and stays in.

This is what makes the sparse map safe and is why §3.4's proof of the hard constraint works.

**Seam and wire.** `AgentOrchestrationRunConfigView` / `AgentOrchestrationRunConfigPatch`
(`framework/api-contract/src/agent-orchestration-port.ts:154-166`) gain `modelOptions` with the same
type; the patch type is derived from the view so it follows for free. The three intake routes
(`layers/agent-orchestration/src/routes/agent-orchestration-intake.ts:190-215`) carry it because they
serialise the view — verify, do not assume.

`AgentConfig` (`layers/core-ui/src/settings/settings-types.ts:83-95`) and the `GET`/`PATCH`/`POST`
`/api/agents` payloads (`layers/core-api/src/routes/agents.ts:56-79, 211-214, 412-415, 482-485`) and
`patchSoulPromptSchema` (`layers/core-api/src/routes/assistant.ts:54-61`) gain `modelOptions`. Zod
shape: `z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullable().optional()`.

### 3.2 Write-time validation — and the three things it must never do

**Where.** Extend the existing `validateAgentConfig`
(`layers/core-api/src/routes/validate-agent-config.ts:50-110`) with a fifth check,
`INVALID_MODEL_OPTION`. It already receives the `HarnessCapabilityReader` pool at all three call sites
(`agents.ts:248, 380, 449`) and `assistant.ts:412`, and that reader's `describe()` returns the full
descriptor including `models[].options` (`layers/core-api/src/services/harness-capability-reader.ts:33`,
serialised whole at `layers/core-api/src/routes/harnesses.ts:124-130`). Nothing new is introduced.

**Rules, applied only to keys the effective `(harnessType, modelId)` descriptor actually declares:** a
`select` value not among `choices` rejects; a `number` value that is not a number or falls outside
`min`/`max` rejects; a `boolean` value that is not a boolean rejects; a `text` value that is not a
string rejects.

**Scope: only values this request changes.** A key whose value is identical to what is already stored
is not re-validated. Without this, a stored value that a later harness version drops from `choices`
would 422 **every** save — including a name-only edit — until the user happened to touch that control,
because the editor carries stored keys through (design §5.1) and only clears an invalid value on a
model switch (§5.3). Meanwhile §3.3e handles that same value at run time by simply dropping it. Optional
machinery must not create a failure mode the mandatory layer does not have.

**Where "already stored" comes from — and it is not a read.** `validateAgentConfig` takes the prior
options map as an **argument** and performs no database access of its own. It stays the pure function
its header describes (*"pure computation… no database, no service call, no `await`"*). Both
`/api/agents` PATCH handlers already load it one line above their own validate call —
`const existingRunConfig = await agentOrchestration.runConfig.read(id)` at `agents.ts:372` and `:441`,
whose `harnessType`/`modelProvider`/`modelId` fields already feed the same call — so the argument is
free at both sites and no new round trip is added.

**A builder must not reach for a DB read inside the validator.** `agent_run_config` is
`run-orchestration`'s owned table; core-api reaches it only through
`AgentOrchestrationPort.runConfig`, and a direct read from a route helper would put core-api on another
service's table and break an enforced boundary. The seam call already happened — use its result.

**The argument is optional, and absent at two sites.** `POST /api/agents` (`:248`) is a creation: there
is no prior config, every value is new, and all are validated — correct by construction. The assistant
`PATCH` (`assistant.ts:412`) deliberately validates **before** loading anything (`@lore AR4c: We
validate BEFORE creating/loading the agent row to ensure a bad triple never contaminates the row`), so
it has no prior config in scope and validates every present key. That reintroduces the lockout above on
the assistant path only, in the same unreachable-today scenario (it needs a future harness version to
remove a choice). Naming it is the right trade: forcing a read into a handler that is deliberately
read-free would cost more than the case is worth. Do not "fix" it by adding one.

**Three prohibitions, all load-bearing:**

1. **It never prunes.** The write path stores exactly the map it received. Design revision 2 §5.1 makes
   the editor carry unrendered keys through untouched; the server must not then delete them. A save
   arriving while a probe is failing must not wipe an agent's stored options — that is AC 1 broken in
   the most damaging possible way.
2. **It never rejects an unknown key.** "We could not ask the harness" is not "you sent something
   invalid", and a stored key for a *different* model or a *different* harness is now legitimate by
   design (§5.1 of the design). An unknown key is accepted, stored, and filtered at run time (§3.3e).
3. **When the descriptor, the harness or the model is not found, it validates nothing and accepts.**
   Same posture the existing `UNKNOWN_HARNESS` check already takes when `pool` is null
   (`validate-agent-config.ts:66`), and forced by a verified property:

> An empty `models` list does not mean "this harness declares no models". It also means "the probe
> failed." `fetchAnthropicModels` and `fetchOpenRouterModels` return `[]` on any non-ok response
> (`harness-discovery.ts:673`, `:712`); the claude and opencode catalog probes degrade to `models = []`
> on any throw (`:440-443`, `:494-497`). Nothing anywhere distinguishes the two.

So write-time validation is a **convenience that improves the error message when the descriptor happens
to be available** — never the thing the system's correctness rests on. What correctness rests on is
§3.3e, which is offline and deterministic.

### 3.3 Pass-through — how a configured option reaches the harness

Five parts. (a)–(d) are plumbing; (e) is the contract that carries the weight.

**(a) `SessionConfig` gains one optional field** —
`framework/harness-protocol/src/harness/harness-adapter.ts`:

```ts
/**
 * The agent's stored per-model options, verbatim. May contain keys the current
 * harness/model does not declare — the adapter reconciles (BA3 §3.3e).
 */
readonly modelOptions?: Readonly<Record<string, string | number | boolean>>;
```

Optional, additive, breaking nothing. It carries **semantic values, not argv** — argv is the adapter's
business, and a future non-CLI adapter must be able to read the same field differently.

**(b) The provisioner threads it, unfiltered.** `provisioner.ts` already reads the live run config at
`:895` and builds `sessionStartConfig` at `:1459` in the same scope. One spread, in the established
idiom of the lines around it:

```ts
...(modelOptions && Object.keys(modelOptions).length > 0 ? { modelOptions } : {}),
```

The provisioner deliberately does **not** reconcile. It sits in `agent-orchestration` and the
declaration lives in `agent-execution`; reaching across for it would be a cross-layer import bought for
nothing, since the adapter is where the declaration already is.

**(c) `CliAdapterConfig` gains the declaration and the carrier, together** —
`layers/agent-execution/harness-registry/src/cli-harness-adapter.ts:87`:

```ts
/** What this binary declares. Both fields come from `harness-model-options.ts` (§3.5). */
readonly declaredModelOptions?: readonly HarnessModelOptionDescriptor[];
/** Option key → how it is spelled on the wire for this binary. */
readonly modelOptionCarriers?: Readonly<Record<string, ModelOptionCarrier>>;
```

**Three carrier spellings, because the four declaring harnesses genuinely need three** — and no fourth
is defined, because no fourth has a declaration behind it:

| Spelling | Emits | Used by |
|---|---|---|
| `{ kind: "flag", flag }` | `[flag, String(value)]` — two argv elements; a bare `flag` for `boolean true` | `claude-code` (`--effort`), `opencode` (`--variant`) |
| `{ kind: "config-override", flag, key }` | `[flag, \`${key}=${value}\`]` — two argv elements, the second a single `key=value` token | `codex` (`-c model_reasoning_effort=high`) |
| `{ kind: "request-field", field }` | a key on the outgoing request body; **not argv** | `builtin` (`reasoning_effort` on the openai-compatible path, `llm-client.ts:603-608`) |

`request-field` is consumed by `BuiltinHarnessAdapter`, not `CliHarnessAdapter`; the two adapters share
the declaration and the walk (§3.3e) and differ only in what the walk emits into. That is why the walk
returns a neutral list of resolved `(carrier, value)` pairs and each adapter renders them, rather than
the walk returning argv.

The name is `declaredModelOptions`, not `modelOptions`: `SessionConfig.modelOptions` is *the agent's
stored values* and both are in scope inside `startSession`. Two different things must not share a name
one line apart.

The declaration travels **on the config**, not read from a module-level global inside the adapter. Two
reasons, both load-bearing: the reconciliation in (e) stays a pure function of `(config, sessionConfig)`,
which is what makes it unit-testable without stubbing anything; and the harness lane can construct a
deliberately widened config to force the tamper case against the real binary (§8). Both fields are set
on `CLAUDE_CLI_CONFIG` from the single module in §3.5, so there is still exactly one source of truth.

**(d) `CliHarnessAdapter.startSession` appends.** The single insertion point is
`cli-harness-adapter.ts:551`:

```ts
const finalArgs = [...resolvedArgs, ...extraArgs, ...optionArgs];
```

**(e) The run-time reconciliation — the contract.**

`optionArgs` is produced by walking **the harness's declared option set**, not the stored map. For each
declared option, in declaration order (so argv is deterministic and §8's assertion is stable):

| Condition on the stored map | Result |
|---|---|
| key absent | nothing emitted — the harness's own default applies, which is what absence means (§3.1) |
| key present, value satisfies the declared control | `[flag, String(value)]`, or the bare flag for `boolean true`; `boolean false` emits nothing |
| key present, value's **type** contradicts the control kind | **dropped**, exactly as if absent |
| key present, choice list is a **compile-time constant** and excludes the value | **dropped** — a contradiction we can always see |
| key present, choice list is **probe-derived, non-empty**, and excludes the value | **dropped** — the probe answered, and it contradicts the value. Reachable today on `opencode` (a variant removed from a model's `variants` map) and on `codex` (an effort removed from a model's `supported_reasoning_levels`) |
| key present, choice list is **probe-derived and empty or missing** | **passed** — the probe did not answer. See the absence rule below |

A stored key that is **not declared at all** — for another harness, another model, or an option this
repository has since removed — is never visited by the walk and therefore never emitted. It costs
nothing and is not an error.

**The absence rule: cannot-verify never drops.** Two of the four declaring harnesses publish their
choice lists through a **probe** — opencode's `variants` map and OpenRouter's `reasoning.supported_efforts`
— and a probe returns `[]` on any failure (`harness-discovery.ts:673, 712, 440-443, 494-497`), which is
indistinguishable from "genuinely none". So the walk splits what it enforces by what it can know:

- **Option identity, control kind and carrier are compile-time constants** for all four harnesses. The
  walk always knows which keys exist and how to spell them, with no network and no failure mode.
- **A choice list is enforced whenever it exists** — whether compile-time (`claude-code`'s five
  `--effort` values, the only one) or probe-derived and non-empty (`codex`, `opencode`, `builtin`). A
  present list that excludes a value is a contradiction, and the walk drops on contradictions.
- **A probe-derived choice list that is empty or missing means "cannot verify", and a value passes.**
  Dropping on absence is what would relocate the offline-wipe defect from the write path to the run
  path; passing is strictly safer, because the harness validates it anyway and does so benignly
  (opencode ignores an unknown variant silently — verified; OpenRouter rejects one at the first turn,
  loudly and immediately). **Absence never destroys a configured value.**

An earlier draft asserted the whole declaration was a static constant. That was true when only
`claude-code` declared; the amendment's four-harness scope makes it false, and this rule replaces it.

**The walk is model-keyed, because per-model divergence is now real.** `declaredModelOptions` resolves
for the session's model, not merely for the harness:

- `claude-code` declares **per harness** — `--effort` is a property of the invocation, so every model
  that harness declares carries the same set. It is now the only one.
- `opencode`, `builtin` and `codex` declare **per model** — 146 of opencode's 363 models publish a
  `variants` map and the lists differ (`claude-haiku-4.5` → two values, `claude-opus-4.8` → five);
  OpenRouter publishes `reasoning.supported_efforts` and `reasoning.default_effort` per model, and 143
  of its 418 models carry `reasoning_effort` at all; codex's own cache gives `gpt-5.4` four levels and
  `gpt-5.6-sol` six, including an `ultra` no other model has.

So a model that declares nothing on a harness that declares something is an ordinary case, not a
contradiction — the locked opencode test model `z-ai/glm-4.7-flash` is exactly it (`variants: {}`), and
an agent on it passes nothing and runs as it does today.

**Dropped silently, not surfaced.** No AC asks for a signal, the plan forbids adding mechanism without
one, and there is no surface a run-time notice could land on that the plan puts in scope. The
mitigation that makes this acceptable rather than merely cheap: a dropped key is *also* not rendered in
the editor, so the user's view of their agent and the agent's actual invocation agree — the
configuration reads as "not set", which is exactly what it now behaves as. **Residual, named for the
founder (§10.5):** a user whose stored option stopped applying because the harness changed its choice
list gets no notification. Surfacing it is a separate package with a real surface behind it.

**opencode's re-engage path must carry the options too.** `cli-harness-adapter.ts:820-829` rebuilds the
re-engage invocation from scratch for the `process-reengage` channel — `["run", forceMsg, "--format",
"json", "--pure"]` plus `--model` — so anything appended in `startSession` is **lost the moment a turn is
re-engaged**, and a forced opencode turn would silently run without its configured variant. Store the
resolved option args on the session exactly as `reEngageResolvedModel` already is (`:611-612`) and push
them into `runArgs`. opencode is the only harness on this channel (`adapter-pool.ts:402`), so this is one
site, but it is invisible from the `startSession` code and will be missed if it is not named.

`declaredModelOptions` and `modelOptionCarriers` are set on `CLAUDE_CLI_CONFIG` (`adapter-pool.ts:425`),
`CLI_TOOL_CONFIGS.codex` (`:285`) and `CLI_TOOL_CONFIGS.opencode`, all sourced from the single module in
§3.5. `CURSOR_AGENT_CLI_CONFIG` (`:487`) leaves both undefined and is behaviourally untouched — an
adapter whose config declares no options runs the walk over an empty list and emits nothing.

`BuiltinHarnessAdapter` now consumes `modelOptions` through the **`request-field`** carrier: the walk
resolves `reasoning_effort` for the session's model and the adapter adds it to the
`/v1/chat/completions` body it already builds (`llm-client.ts:603-608`). It is declared **only** for
models discovered from OpenRouter, whose catalogue publishes the supported efforts per model; models
from `fetchAnthropicModels` or `MODEL_CATALOG` declare none, because the Anthropic-direct effort
parameter is `DOC-ONLY` on this tree and the amendment forbids declaring from documentation
(`feasibility.md` §5). `RemoteHarnessAdapter` ignores `modelOptions` — it declares none.

### 3.4 The hard constraint — "an agent with no options runs exactly as it does today"

Discharged structurally at five levels, so it does not depend on anyone remembering it:

1. **Schema:** the column is nullable with no default and no backfill. Every pre-existing row is `NULL`.
2. **Store:** `DEFAULT_AGENT_RUN_CONFIG.modelOptions = null`, so an agent with no row and an agent with
   an all-null row resolve identically — the module's existing invariant, extended, not bent.
3. **Editor:** an untouched control contributes no key (§3.1), so opening and saving an agent to fix a
   typo adds nothing.
4. **Provisioner:** empty or `null` ⇒ the `SessionConfig` key is **absent**, not present-and-empty.
5. **Adapter:** `optionArgs` is `[]` ⇒ `finalArgs` is `[...resolvedArgs, ...extraArgs]`, which is the
   current expression character for character.

**The case worth spelling out:** a stored set that is non-empty but **reconciles to empty** — every key
stale, or every value now invalid — must produce *exactly* today's invocation. No empty options object,
no placeholder flag, no marker argument. Level 5 gives this for free because `optionArgs` is built by
walking declarations, not by iterating the stored map; but it is a distinct assertion from "the field
was absent", and §8 asserts it separately.

### 3.5 The declarations — four harnesses, one module

Every value below was verified against the real binary or the vendor's live API on **2026-08-25**;
`feasibility.md` carries the commands and their output.

| Harness | Key | Control | Choices | Scope | Carrier |
|---|---|---|---|---|---|
| `claude-code` | `effort` | `select` | `low·medium·high·xhigh·max` — **compile-time**, from `claude --help` | per harness | `{kind:"flag", flag:"--effort"}` |
| `codex` | `reasoning_effort` | `select` | **per model, probe-derived** from `supported_reasoning_levels` in `~/.codex/models_cache.json`; each level's `description` is a real `helpText`, `default_reasoning_level` a real `defaultValue` | per model | `{kind:"config-override", flag:"-c", key:"model_reasoning_effort"}` |
| `opencode` | `variant` | `select` | **per model, probe-derived** from each model's `variants` map in `opencode models --verbose` | per model | `{kind:"flag", flag:"--variant"}` |
| `builtin` | `reasoning_effort` | `select` | **per model, probe-derived** from OpenRouter's `reasoning.supported_efforts`; `reasoning.default_effort` supplies a real `defaultValue` | per model, OpenRouter-discovered models only | `{kind:"request-field", field:"reasoning_effort"}` |
| `cursor-agent` | — | — | — | — | **declares none** |

**`cursor-agent` declares nothing, and that is AC A2's deliverable, not an omission.** Its effort and
fast axes are expressed as **model identity** — `--list-models` returns 204 flat ids including
`claude-opus-5-low/-medium/-high/-xhigh` and their `-fast` twins — and its one alternative spelling, the
bracket override, has no enumerable schema anywhere in the binary (the word "Parameterized" appears once,
in a tip, as a single example) and is **rejected on the locked model**: `--model 'auto[ludicrous=yes]'`
returns `Cannot use this model` and lists the 204 ids. Declaring an option from that one example string
would be declaring from documentation, which the amendment forbids. The finding and its three probes are
recorded in `feasibility.md` §4.

**`defaultValue` is declared only where the vendor publishes one.** Only `builtin` does
(`reasoning.default_effort`). `claude-code`, `codex` and `opencode` publish no default, so none is
declared — an undeclared default costs nothing under §3.1 (the leading choice reads `Default`, an
untouched select stores no key, nothing is sent) and a guessed one would be a falsehood in the
descriptor.

**Declaration sites.** `claude-code` → `parseClaudeCatalog` (`harness-discovery.ts:93-100`); `codex` →
the new model list (§3.7); `opencode` → `parseOpencodeModelJson` (`:123-140`), which already parses the
JSON blob that carries `variants` and today throws it away; `builtin` → `fetchOpenRouterModels`
(`:700-735`), which already parses the entry that carries `supported_parameters` and `reasoning`.
**Every declaration site is a parser that already reads the field it needs and currently writes
`options: []`.** No new probe, no new network call, no new command is added anywhere.

**One module owns identity, control, carrier and `claude-code`'s choice list; two places read it** —
the descriptor builders (so the editor can render) and the adapter configs (so the walk can reconcile
and emit). New file `layers/agent-execution/harness-registry/src/harness-model-options.ts`, with each
harness's carrier map keyed by **that harness's** declared option keys, so the coupling holds **per
harness**:

- an option declared for a harness with no carrier entry ⇒ `npm run check` RED;
- a carrier entry for an option that harness does not declare ⇒ `npm run check` RED.

This is the mechanical form of the plan's non-negotiable constraint, now applied four times: **it is not
possible to add a declared option for any harness without also declaring how it reaches that harness.**
It is the type system, not a test and not a lint rule, because it is a static property of the code
(`.claude/rules/testing.md` §Standards). The exact spelling is the builder's; the two-directional RED,
**recorded once per declaring harness**, is not.

**One trap, because its failure is silent.** The coupling only exists if each declaration array keeps its
literal key types. Annotate one `as readonly HarnessModelOptionDescriptor[]` — the obvious thing to reach
for — and `key` widens to `string`, that harness's carrier type becomes `Record<string, …>`, and **both
directions compile green with no diagnostic anywhere**. `as const satisfies readonly
HarnessModelOptionDescriptor[]` is the shape that holds. This is why the recorded two-way RED is a
deliverable and not a formality: a guard that cannot be shown red is a passenger — and with four
declarations there are four chances to spell it wrong.

### 3.6 Ownership and boundaries

| Concern | Owner | Note |
|---|---|---|
| `agent_run_config` incl. the new column | `run-orchestration` | already its table (`tools/governance/table-owners.json`); no registry change — a new **column** does not change the owner, only a new table would |
| option declarations (4 harnesses) + carriers + reconciliation + codex's model list | `harness-registry` (`layers/agent-execution`) | one source (`harness-model-options.ts`), two readers (the descriptor builders and the adapter configs); same package as `CLI_TOOL_CONFIGS` and the probe table; nothing crosses a layer |
| the option **vocabulary** type | `framework/harness-capability` | unchanged except the `scope` deletion |
| `SessionConfig.modelOptions` | `framework/harness-protocol` | already imports `harness-capability` types |
| write-time validation | `layers/core-api` `validate-agent-config.ts` | already holds the pool at every call site |
| the rendered control | `layers/core-ui` `AgentEditor.tsx` | pure descriptor function; no `harnessType` literal |

No new package. No new route. No new port. No new event. No governance registry edit.

---

### 3.7 Codex's model list — decided against the file, not against a negative

**Retraction first.** An earlier revision of this section asserted that codex "publishes no enumerable
model surface, verified four ways", and built a hardcoded list on that negative. **The negative is
false.** `~/.codex/models_cache.json` exists — 194,063 bytes, refreshed `2026-08-25T19:41:40Z`, parsing
immediately — with `fetched_at`, `etag`, `client_version` and 8 models.

**How the error was made, because the method matters more than the miss.** Three of the four probes
were sound (no subcommand; no ids in the 211 KB completions; no model check in `codex doctor --json`).
The fourth ran `ls -la ~/.codex/ | head -20` and then a key-walk over `.codex-global-state.json` alone
— and concluded about the whole directory. `models_cache.json` sorts alphabetically after
`goals_1.sqlite-wal`, so `head -20` cut it off. **A truncated listing was read as an exhaustive one.**
The `codex doctor` line quoted as corroboration — `failed to load models cache: missing field
'base_instructions'` — is not "unreadable", it is a **version complaint**, and §3.7.2 shows it is a
real and useful signal rather than the one that was claimed.

#### 3.7.1 What the file actually gives

Verified first-hand, 2026-08-25:

| Field | Value |
|---|---|
| `slug` | 8 models: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex-spark`, `codex-auto-review` |
| `display_name` | real labels — `GPT-5.4-Mini`, `GPT-5.6-Sol` … |
| `visibility` | `list` for seven, **`hide`** for `codex-auto-review` |
| `supported_in_api` | `true` for seven, **`false`** for `gpt-5.3-codex-spark` |
| `supported_reasoning_levels` | **per model**, each entry `{effort, description}` |
| `default_reasoning_level` | per model — `low` on `gpt-5.6-sol`, `medium` on most |

The lists genuinely differ: `gpt-5.4` → 4 (`low·medium·high·xhigh`); `gpt-5.6-luna` → 5 (`+max`);
`gpt-5.6-sol` → **6** (`+ultra`, *"Maximum reasoning with automatic task delegation"*).

**It predicts this package's own live probes exactly.** `gpt-5.4` and `gpt-5.4-mini` are present — both
observed accepted. `gpt-5.4-nano` and `gpt-5.4-codex` are absent — both observed rejected 400. Four
independent confirmations that the file describes the account it sits in.

**And it makes the earlier plan's compile-time list demonstrably wrong.** A single seven-value constant
would offer `max` on `gpt-5.4`, which does not take it, and hide `ultra` on `gpt-5.6-sol`, which does —
an editor that both offers values a model rejects and conceals ones it accepts. That alone retires the
constant, independently of the coupling question.

#### 3.7.2 The decision: read the file, and declare nothing when it does not parse

**Chosen.** `CLI_PROBE_CONFIGS[0].interpretAuth` (`harness-discovery.ts:396-414`) reads
`~/.codex/models_cache.json` (honouring `CODEX_HOME` when set, as the adapter already does) and
publishes:

- **models** — those with `visibility === "list"` **and** `supported_in_api === true` (six today; the
  hidden auto-review model and the non-API model are excluded by the file's own two flags, not by a
  judgement of ours), `slug` → `id`, `display_name` → `label`, `selectable: true`,
  `inheritedFromGateway: false` — the same shape `parseClaudeCatalog` produces;
- **one option per model** — `reasoning_effort`, `select`, choices from that model's
  `supported_reasoning_levels` (`effort` → value, `effort` title-cased → label, **`description` →
  `helpText`**), `defaultValue` from `default_reasoning_level`.

**Failure is silence, not a guess.** Missing file, unreadable file, bad JSON, or a top-level shape
without a `models` array ⇒ codex declares **no models and no options** — byte-for-byte today's
behaviour, already handled by the editor's existing "This harness manages its own model selection."
prose (`AgentEditor.tsx:259-266`) and already what AC 5 requires. No fallback constant, because a
fallback is how a wrong list ships anyway.

**A malformed *row* skips that model; it does not reject the file.** A model entry missing `slug`,
missing `supported_reasoning_levels`, or carrying a levels array that is empty or not an array is
dropped from the published list and the remaining models are published normally. Both outcomes would be
safe, so this is a choice, not a correctness question — and it is stated here so it is made
deliberately rather than by accident. Per-row skipping wins because the two failure modes are not
symmetric: one unrecognised field in one model would otherwise take away every codex model on the
machine, which is a much larger regression than losing the one model we genuinely cannot describe. It
is also the idiom already used beside it — `parseOpencodeModelJson` returns `null` for an unparseable
blob and `fetchOpenRouterModels` uses `flatMap` to drop a bad entry (`harness-discovery.ts:123-140`,
`:700-735`), both skipping the row and keeping the rest. A model that survives with a valid `slug` but
no usable levels is published **with no option**, which is the ordinary "this model declares nothing"
case (§3.3e), not an error.

**The trade-offs, stated as trade-offs.**

*What reading it costs:*
- **Real coupling to another tool's private cache directory.** It is not a documented interface and
  nothing obliges codex to keep it.
- **The schema is provably version-dependent, and we have the proof in hand.** The file records
  `client_version: 0.149.0`; the installed CLI is `0.146.1`; **no model in the file carries
  `base_instructions`, which 0.146.1 requires** — which is why `codex doctor` logs
  `failed to load models cache`. The installed binary cannot read this file. We would be reading a
  format that has already broken once across two versions we can both observe.
- **It is absent on a fresh machine and before first login**, so a new user sees no codex models until
  codex has run once.

*What it buys:*
- **Correct per-model choice lists** — the thing the constant provably gets wrong.
- **Real `helpText` and a real `defaultValue`**, published by the vendor rather than invented.
- **Self-gating.** A codex too old to know the option, or a model without a level list, declares
  nothing — which moves codex from the claude-shaped risk to the opencode/builtin-shaped one (§10.1).
- **No staleness invention.** The file carries an `etag` and a `fetched_at` and is refreshed by codex
  itself, so the list tracks the account it belongs to instead of a constant that is simultaneously too
  small for one user and too large for another.

*Why not the hardcoded constant:* it is wrong per model (proven above), it cannot carry `helpText` or a
per-model default, and it is not self-gating. The earlier section's claim that per-account staleness is
*"not fixable by a better list; it is a property of codex"* **no longer follows** — the file is
account-scoped, so it is fixable, and that sentence is withdrawn.

*Why the version fragility is acceptable:* it degrades to exactly today's behaviour. The worst case of
a schema change is that codex stops offering models and options — the state the product is in right now
— not a wrong list, not a crash, and not a silent misconfiguration. **A brittle source whose failure
mode is silence is safer than a stable source that is wrong**, and the constant is wrong today, not
hypothetically.

*What it still does not do:* it publishes a harness's own models where none were published, and changes
no model choice any user already has — the boundary the founder drew.

*Security:* it is a read of a well-known path in the user's own home directory, parsed as JSON, never
executed. The values reach argv only through the `config-override` carrier's single `key=value` token
(§4). Anyone able to write that file already controls the codex binary this harness runs, so it adds no
attack surface — and no validation theatre is added for that case.

**A deliberate asymmetry, surfaced rather than acted on.** `cursor-agent` also declares no models and
has a genuine `--list-models`. It stays out of scope: the amendment named codex's list as the single
exception, and unlike codex, cursor-agent has no option a model list would make reachable — its options
*are* its models (§3.5). Raised so the asymmetry is visible; not a decision this document takes.

## 4. Security

The surfaces this change actually reaches, and the reasoning for each:

- **An option value becomes a subprocess argument.** This is the one real surface. It is closed by
  three properties: `spawn` is called with the **array** form and never `shell: true`
  (`cli-harness-adapter.ts:557` and its `@lore X5 W1`); the carrier emits **exactly one argv element
  per value** (§3.3e); and a `select` value is checked against a closed choice list at run time, in
  code, before it is emitted at all — so a smuggled string never reaches argv in the first place. A
  value can therefore never become a second flag, a shell metacharacter, or a command. This is the same
  trust level `modelId` has carried into `--model` since AR7; BA3 adds no new class of exposure.
- **Two carrier spellings widen that surface slightly, and both stay closed.** `codex`'s
  `config-override` emits a **single** argv token `model_reasoning_effort=<value>`; because it is one
  token built by concatenation, a value cannot introduce a second `-c` key or a second flag, and codex
  parses the right-hand side as TOML — a value the model's own published level list excludes never
  reaches it, because a present list is enforced in the walk (§3.3e). `builtin`'s `request-field` puts the value on a
  **JSON body key**, not argv at all: `JSON.stringify` escapes it, so it cannot alter the request
  shape, and the worst case is OpenRouter rejecting it at the first turn. Neither introduces a shell,
  an interpolation, or a second parameter.
- **A state-changing endpoint takes untrusted input.** `PATCH`/`POST /api/agents/:id` and the assistant
  route already do, already run behind the app's auth middleware, and already validate a
  `(harness, provider, model)` triple. `modelOptions` is validated by the same function at the same
  point (§3.2) with a bounded value type (`string | number | boolean`). That validation is honest about
  its own limits — when the descriptor is unavailable it accepts — and §3.3e, not the validator, is
  what makes acceptance safe. Storing a value the harness will never emit is inert.
- **Not touched:** no credential is read, written or forwarded (`resolvedModel.apiKey` handling is
  unchanged); no outbound request is made from this code; no path is constructed from an option value;
  no agent-authored field feeds this — options are set by a human in the agent editor, never by an
  agent; no filesystem mount, no MCP token, no return-hook artifact changes.

`{{rules.security}}` is undeclared in `pipeline.config.yml`; the above is reasoned from the surfaces
themselves per the skill's own instruction, and per `ETHOS.md` adds no preemptive mechanism.

---

## 5. Changed failure behaviour (tier: mvp)

| New failure | Behaviour | Why acceptable here |
|---|---|---|
| A value the CLI rejects reaches a real run | Reachable only by writing the store directly and defeating §3.3e's choice check — the editor renders a closed select and the walk drops an invalid value. If it did: the `claude` binary warns on stderr, uses its default, and the adapter surfaces the line as `HarnessEvent{type:"error", code:"CliStderr"}` (`cli-harness-adapter.ts:721-731`); the turn still completes. | Benign and observable. It is also the tamper→red signal §8 uses to prove the wire. |
| A stale key sits in the row — one the harness does not declare at all | Never rendered; never sent, because the walk iterates declarations (§3.3e) | Indistinguishable from no key for every observable purpose. |
| A key is declared but its value contradicts a **present** choice list | **Dropped** at emit (§3.3e) | The list answered and it excludes the value. Reachable on `opencode`, `codex` and `builtin` when a vendor removes a level. Residual §10.5. |
| A key is declared but the choice list is **empty or missing** (probe failed) | **Passed** — the value is sent unverified | The absence rule. Dropping here would destroy a good value on a network blip; the harness validates instead, benignly on `opencode`, loudly on `codex`/`builtin`. |
| The descriptor probe fails while someone saves | Options are accepted and stored unvalidated; nothing is cleared | The alternative — pruning — silently destroys configuration and breaks AC 1. |
| The descriptor probe fails while an agent runs | **No effect at all** — §3.3e never consults it | This is the whole point of assumption 3. |
| A probe-derived choice list is empty when a run starts | The configured value **passes** unverified | §3.3e's absence rule. The harness validates it anyway: opencode ignores an unknown variant silently (verified); OpenRouter rejects one at the first turn, loudly. Passing is strictly safer than dropping a good value. |
| `~/.codex/models_cache.json` is missing, unparseable, or schema-shifted | codex declares **no models and no options** | §3.7.2. Byte-for-byte today's behaviour, already handled by the editor's existing "This harness manages its own model selection." prose. Silence, never a guessed list. |
| A codex model from the cache is not permitted on the user's account | The first turn fails with codex's own 400 naming the model and the account type | Much less likely now the list is read from the account's own cache rather than hardcoded, but still possible if the cache is stale. Immediate and self-explaining. |
| An opencode turn is re-engaged | Options are re-emitted, because they are carried on the session | §3.3e. Without that they would be silently dropped mid-session — the defect this document names at `cli-harness-adapter.ts:820-829`. |
| The column holds malformed JSON | The read throws | Only the store writes this column, always via `JSON.stringify`. Residual §10.3. |

Deliberately **not** added: a rollback path, a compatibility shim, a dual-write, an observability
counter, a retry, or a feature flag. No AC, no configured rule, and no plausible change-caused risk
calls for any of them.

---

## 6. Cleanup and the design's two deliverables

Items 1-5 are this feature's rubble, which the BA track's ownership rule makes this package's to
remove. Items 6-7 are the two changes design §2.1 marks **"explicit and in scope"** — they are not
rubble, they are the standing property that makes AC 5 provable rather than promised, and they are
listed here because they are the same kind of small, exact, easily-dropped edit.

Each item verified on this tree. All seven are part of the package, not a follow-up.

1. **`HarnessModelOptionDescriptor.scope: "launch" | "durable"`** —
   `framework/harness-capability/src/harness/harness-capability-descriptor.ts:76`. Written by nothing in
   production; read only by its own test (`.../__tests__/harness-capability-descriptor.test.ts:22`) and
   the stale story fixture below. After this package every option is agent configuration applied to
   every run, so the field has one possible meaning and no reader. **Delete the field and its two
   remaining mentions — in step 1, before the first real declaration is written**, so the new
   declaration is never asked to state it.
2. **`layers/core-ui/src/components/SessionView.stories.tsx:266-315`** — a fixture declaring two full
   option descriptors (`effort`, `mode`) for a component that has rendered no option control since
   AU44 B0. A story is this repo's design artifact; a design artifact describing a deleted feature is a
   lie the next agent will believe. **Remove the two `options` arrays** (keep the models, keep the
   descriptor — only the option payload is false).
3. **Three documentation statements describing per-message option pills as live** — listed in §9 with
   the substance they must become.
4. **Three stale code comments** saying "descriptor pills" for a row that now renders only a
   model-cycling button and the working/queue state: `SessionView.tsx:27` ("Adds descriptor pills…"),
   `SessionView.tsx:747` ("+ descriptor pills") and `SessionView.stories.tsx:326`. Cheap, in-file, same
   package as item 2. **Not** `SessionView.tsx:619` — it reads "descriptor pill row — model · working
   state", which is already accurate; leave it.
5. **Two stale comments in `require-harness.ts:124-132`** naming a seam file (`provision-real-session.ts`)
   and a lint check (`honest-harness-guard`) that no longer exist — both confirmed absent (`scripts/`
   contains only `install-git-hooks.sh`). **Optional**, and only because step 9 makes a builder read
   exactly those lines and be misled by them. If it is left, say so; do not silently skip it.

6. **`eslint.config.ts:748-751` — add `layers/core-ui/src/settings/AgentEditor.tsx` to the harness-type
   rule's `files:` list.** Design §2.1 deliverable 1, marked *"explicit and in scope"*. The list is
   today exactly `harness-presentation.ts` and `SettingsHarnesses.tsx`; this package adds a third
   rendered surface that must obey the same descriptor-driven contract, and a static codebase property
   is a lint rule, not a test (`CLAUDE.md`). Builder note from the design: the file's only `codex`
   occurrence is in a docblock at `AgentEditor.tsx:27`, and the rule matches `Literal` nodes, not
   comments — verify with a lint run rather than assuming either way.
7. **`docs/agent-layer/harness-capability-descriptor.md:227` — correct the parenthetical.** Design §2.1
   deliverable 2. The line reads *"UI controls render from option descriptors — no `harnessType` checks
   **(ESLint-enforced, single `"builtin"` exception)**"*. Verified: the parenthetical is **false** — the
   rule covers two files, not "UI controls" generally. The line must name the files the rule actually
   covers (three, after item 6). **This is the doc that made an earlier design revision believe the
   enforcement already existed**, so it ships in the same commit as item 6 or it is false again the
   moment it is written.

Not on this list, deliberately: `pipeline.config.yml`'s dead `designSystem.path`, the
`claude models` / `MODEL_CATALOG` divergence, and the composer's model-cycling pill (design O-2, a
founder call). None is this feature's rubble.

---

## 7. Ordered tasks

**One technical task, one builder, strict internal order.** The chain is a single vertical slice —
declaration → carrier → adapter → contract → provisioner → store → route → editor — with no safe
parallel split; every later step consumes the shape the earlier one fixes. Red-phase tests come before
each implementation step per `CLAUDE.md`'s First Principle.

1. **Clear the rubble first.** Delete `scope` (§6.1) and the stale story option arrays (§6.2). This
   makes the tree unable to express the old idea before the new one is written. `npm run check` green.
2. **Declare and carry, together — all four harnesses.** New `harness-model-options.ts` (§3.5): the
   four declarations, the three carrier spellings, and `claude-code`'s compile-time choice list (the
   only one — the other three are read per model from their harness's own catalogue), bound by the
   per-harness type constraint. Wire each into the parser that already reads
   the field — `parseClaudeCatalog` (`harness-discovery.ts:93-100`), `parseOpencodeModelJson`
   (`:123-140`, read its `variants`), `fetchOpenRouterModels` (`:700-735`, read `supported_parameters`
   and `reasoning`) — and into `CLAUDE_CLI_CONFIG`, `CLI_TOOL_CONFIGS.codex` and
   `CLI_TOOL_CONFIGS.opencode`. **Prove the forcing function both ways, once per declaring harness**,
   by temporarily breaking each half and recording `npm run check` RED (§8, type-system lane) — four
   declarations means four chances to spell the coupling away (§3.5's trap).
2b. **Codex's model list** (§3.7). Read `~/.codex/models_cache.json` (honouring `CODEX_HOME`) in
   `CLI_PROBE_CONFIGS[0].interpretAuth`; publish the models with `visibility === "list"` **and**
   `supported_in_api === true`, each declaring `reasoning_effort` from its own
   `supported_reasoning_levels` (`description` → `helpText`, `default_reasoning_level` → `defaultValue`).
   **Any read or parse failure ⇒ no models, no options** — today's behaviour, never a fallback constant.
   Commit a real captured copy of the file as the parser's fixture; do not hand-write one.
3. **`SessionConfig.modelOptions`** (§3.3a) + `CliAdapterConfig.declaredModelOptions`/`.modelOptionCarriers`
   (§3.3c) + the model-keyed reconciliation walk, the three carrier renderings, the `finalArgs` append
   (§3.3d-e), **the opencode re-engage carry at `cli-harness-adapter.ts:820-829`**, and the builtin
   `request-field` consumer in `llm-client.ts:603-608`. Unit tests first, and they are the bulk of this
   step: with options, without options, stale key, type mismatch, a value contradicting a **present**
   choice list, compile-time or probe-derived (dropped), a value with an **empty probe-derived** list
   (passed — the absence rule),
   reconciles-to-empty, each of the three carrier spellings, and a re-engage that re-emits.
4. **Provisioner pass-through** (§3.3b) — unfiltered, one spread.
5. **Column + migration + store** (§3.1). Migration test against a populated pre-migration database —
   and heed BA1's recorded lesson: **do not hand-write the pre-migration schema in the test**, or the
   test passes while every real upgrade aborts.
6. **Seam + API + write-time validation** (§3.1 wire, §3.2), including a test that a save does **not**
   prune an unknown key. Service-integration round trip first.
7. **Editor** — the approved design revision 2: the `SectionLabel`-headed `Model options` section, the
   two zones (§3.4 of the design), the four control kinds, the `Select` `hint` prop, the two stories
   (design §9 — `AllControlKinds` and `RequiredOptions`; it explicitly drops `NoModelOptions`),
   the switch-harness and switch-model rules (§5.2-5.3), and the write rule from §5.1 — **only rendered
   keys are written; every other stored key is carried through untouched.** Component tests first.
8. **Close the standing property — the approved design's two deliverables** (§6 items 6-7), together in
   one commit. Add `AgentEditor.tsx` to the ESLint rule's `files:` list, run `npm run lint` green, then
   **show the rule red** by temporarily putting a `harnessType === "claude-code"` literal in the option
   block — the same break-test discipline `tools/governance` already applies to its own rules. Then
   correct the doc line to name the three files the rule now covers. This is what makes AC 5 and the
   plan's *"Exposing options for harnesses that do not declare any"* exclusion **provable rather than
   promised**, and it is why the step sits after the editor exists rather than before.
9. **Harness lane.** Extend
   `layers/agent-execution/harness-registry/src/__tests__/cli-adapter-real-binary.integration.test.ts`
   per §8. **Run `npm run test:integration:harness` and get it green before shipping** — nothing
   downstream runs this lane (`.claude/rules/testing.md`), and this package changes harness plumbing.

Ownership is named only where §3.6 needs it. Everything else — helper layout, local names, file
splitting inside a package — is the builder's.

---

## 8. Evidence plan

Lane per AC. Every runtime assertion imports code and asserts on behaviour; every static property is the
type system or a deletion, never a test that reads files.

| AC | Lane | The evidence |
|---|---|---|
| **1** — configuration holds declared options, and they persist | **service integration** | `layers/core-api/src/routes/__tests__/` with the `{db, app}` fixtures: `PATCH /api/agents/:id` with `modelOptions: {effort:"low"}` → 200; `GET /api/agents` echoes it; a second PATCH of `name` only leaves it untouched (the `"key" in patch` semantic). |
| **1** | **service integration** | **The no-prune proof:** PATCH with a map containing a key the descriptor does not declare → 200, and a read-back shows the key still there. This is the assertion that would have caught the offline-wipe defect. |
| **1** | **service integration** | `layers/agent-orchestration/run-orchestration/src/__tests__/agent-run-config-store.integration.test.ts` (exists): write → read round trip, `null` ↔ `{}` equivalence, absent-key patch. |
| **1** | **service integration** | `framework/db/src/__tests__/`: the migration applied to a **populated** pre-migration database leaves every existing row `NULL` and the app reads them as no options. Follow `ba1-routine-and-belonging-migration.integration.test.ts`'s shape, not its predecessor's mistake. |
| **1** | **component** | `AgentEditor.test.tsx`: an untouched control writes no key; a moved control writes its value; a boolean moved back clears its key; a stored key the editor did not render survives the save payload. |
| **2** — options reach the harness | **unit** | `harness-registry/src/__tests__/`: `CliHarnessAdapter` from `CLAUDE_CLI_CONFIG` with an injected `spawnFn` and `modelOptions={effort:"low"}` → argv contains `["--effort","low"]` exactly once, appended after the base args. |
| **2** | **unit** *(the reconciliation table, §3.3e — one case per row, and the two absence rows are the point)* | An undeclared key emits nothing. A type mismatch emits nothing. A value excluded by a **compile-time** list emits nothing. A value excluded by a **probe-derived, non-empty** list emits nothing. **A value whose probe-derived list is empty or missing emits its pair** — the absence rule, and the one case a naive implementation gets backwards. A valid value emits its pair. Declaration order is the argv order. |
| **2** | **service integration** | `provisionSession` for an agent whose stored `modelOptions` is `{effort:"low"}` → the `onBeforeHarnessStart` hook's `sessionConfig.modelOptions` carries it verbatim (`provisioner.ts:1481-1484` already exposes the real config to that hook; the DB and the store are real, nothing is stubbed). |
| **2** | **harness integration** *(the end-to-end proof)* | `cli-adapter-real-binary.integration.test.ts`, `requireHarness("claude")`, model from `HARNESS_TEST_MODELS.claude`. **Positive:** real `claude` binary with `modelOptions={effort:"low"}` → the turn completes and **zero** `CliStderr` error events are emitted. **Tamper→red twin, and it must travel the production branch:** the same real binary through the same adapter, with the declared **choice list** widened by one entry — `{...CLAUDE_CLI_CONFIG, declaredModelOptions: [{...effort, control: {kind:"select", choices: [...effort.choices, {value:"ludicrous", label:"Ludicrous"}]}}]}` — so `"ludicrous"` survives reconciliation **through the same `select` arm the shipped option travels** and reaches the binary as `--effort ludicrous`. The real `claude` then emits a `CliStderr` event whose message names `--effort` and enumerates its five valid values — a string nothing in our plumbing knows, so only the real binary can have produced it. Widening the control *kind* to `text` instead would prove the wire through an arm production never uses; do not do that. **Where the load actually sits:** the positive lane asserts an *absence* (zero `CliStderr`) and would pass identically if the carrier were deleted — it is a smoke check, not evidence for the carrier. The tamper twin carries the whole proof. Both behaviours verified live under closed stdin, which is what the adapter creates (`cli-harness-adapter.ts:572`); see `feasibility.md` Q3/Q4. |
| **3** — no options ⇒ unchanged | **unit** | Adapter argv with `modelOptions` absent, with `{}`, **and with a non-empty map that reconciles to empty**, all strictly equal to the argv the same config produces with the field removed — asserted against the config's own resolved args, never a hardcoded literal. The third case is §3.4's distinct assertion. |
| **3** | **service integration** | Provisioning an agent with no `agent_run_config` row, and one with an all-null row, both omit the `modelOptions` key from `SessionConfig` entirely. |
| **3** | **harness integration** | `cursor-agent` (declares nothing) and `opencode` on its locked model `z-ai/glm-4.7-flash` (`variants: {}`, so nothing to set) — no options configured, real binary / real model, turn completes and the invocation is today's. These two are where "a harness that declares nothing produces character-for-character today's argv" is proven on real binaries. |
| **4** — no per-message option toggles | **deletion + type system** | Already true (`rg -a`: `deriveComposerPills` and `HarnessOptionControlKind` are absent). §6 removes the last two artifacts that said otherwise. There is no code to test, and a test that greps is a lint rule (`.claude/rules/testing.md`). No new ESLint rule: a bespoke rule for a one-off deletion is ceremony no AC asks for. |
| **4** | **component** | Extend `layers/core-ui/src/__tests__/AM3-session-view.test.tsx` (the file that already records the removal at `:349`): render `SessionView` with a descriptor whose selected model **declares** options, assert no option control appears. A runtime assertion and a real regression net. |
| **5** — no options ⇒ no controls | **component** | `AgentEditor.test.tsx`, design §4's four cases: model with `options: []`; no model selected; harness with an empty `models` list; the harness list itself empty. In all four, no section heading, no helper line, no container, no control — the rendered tree matches today's. |
| **5** | **lint rule** | `eslint.config.ts`'s harness-type `no-restricted-syntax` rule with `AgentEditor.tsx` added to `files:` (§6 item 6). `npm run lint` green with the option block in place; and the rule **shown red** by temporarily adding a `harnessType === "claude-code"` literal to that block. This is the standing property AC 5's component tests cannot give: they prove today's tree renders nothing, the rule prevents tomorrow's per-harness branch. A static codebase property — a lint rule, never a test (`CLAUDE.md`). |
| **5** | **review check, not a lane** | `docs/agent-layer/harness-capability-descriptor.md:227` names the three files the rule actually covers (§6 item 7). There is no mechanical check for prose and none is invented; it is a diff-review item, and it ships in the same commit as the config line so the two cannot disagree. |
| **A1** — every declaring harness carries its option through | **harness integration**, one lane per declaring harness | **`claude-code`**: the red/green pair above. **`codex`**: `-c model_reasoning_effort=high` on the locked `gpt-5.4-mini` → turn completes; **tamper twin** with a value outside that model's `supported_reasoning_levels` forced past the walk → the API's own 400 naming `[reasoning.effort] [invalid_enum_value]` and enumerating its valid values — the strongest tamper signal of the four. Note `max` is a valid tamper value here precisely *because* `gpt-5.4-mini` does not support it while other codex models do. **`opencode`**: no tamper signal exists (a bogus variant is silently ignored — verified), so the lane asserts the **zero/non-zero reasoning boundary** instead: `--variant max` on a model whose catalogue declares variants yields `reasoning > 0` where no variant yields exactly `0`. **`builtin`**: `reasoning_effort` on the locked `deepseek/deepseek-v4-flash` (whose catalogue publishes `supported_efforts: ["xhigh","high"]`) → turn completes; a value outside that list → OpenRouter's own 400. |
| **A1** | **unit** | The declaration parsers, against **real captured** harness output committed as fixtures: `opencode models --verbose` (a model with variants, a model without) and OpenRouter `/v1/models` (a model with `reasoning_effort`, one without). Deterministic, offline, and it is where per-model choice-list parsing is actually proven — not in the harness lane. |
| **A2** — a harness exposing none is recorded with evidence | **document + harness integration** | `feasibility.md` §4 carries the three probes for `cursor-agent`; the AC-3 lane above proves on the real binary that it runs unchanged. Nothing is declared for it, so there is nothing else to assert. |
| **A3** — codex publishes its model list and its option is reachable | **unit + service integration + harness integration** | **Unit:** the cache parser against a **real captured** `models_cache.json` committed as a fixture — asserts six selectable models (the `visibility:"hide"` and `supported_in_api:false` entries excluded), `gpt-5.4` → four levels, `gpt-5.6-sol` → six including `ultra`, `description` carried into `helpText`, `default_reasoning_level` into `defaultValue`; **and the degradation cases** — file missing, bad JSON, and a shape without `supported_reasoning_levels` — each yielding **no models and no options**, never a fallback. **Service:** `GET /api/harnesses` returns a codex descriptor whose `models` is non-empty and whose models declare `reasoning_effort`. **Harness:** the codex A1 lane above. |
| plan constraint (declaration ⟺ carrier), **per harness** | **type system** | Break each half in turn for **each declaring harness**, record `npm run check` RED both ways in the PR — four pairs, not one. Not a test file; a static property. |
| design §9 | **stories** | `AgentEditor.stories.tsx`: the states design revision 2 names. Design artifacts, not evidence. |

**What equal coverage means now that harnesses declare different things.** `.claude/rules/testing.md`
demands a `requireHarness(<name>)` lane for **all five** — that is unchanged, and all five are above.
What differs is each lane's *assertion*, and it is set by what that harness genuinely exposes, not by
author preference: a harness that declares an option proves **carry-through** (A1); a harness that
declares none proves **unchanged invocation** (AC 3). Both are real assertions that can fail; neither is
a coverage fig leaf. Two lanes are limited by their founder-set model rather than by the feature, and
the limit is recorded rather than routed around: **opencode**'s locked model publishes `variants: {}`,
so its lane can only be the unchanged-invocation assertion — the model has nothing to set, and the rule
is *never bump a test model*. **`builtin`**'s locked model does support the option, so it is a full A1
lane.

**No screenshots**, per `.claude/rules/visual-regression.md` and the project rule.

**The one piece of end-to-end evidence** that shows the change working through its real consuming path
in production conditions is the AC 2 harness lane: production `CliHarnessAdapter` → production
`CLAUDE_CLI_CONFIG` → real `claude` binary → real model, with a tamper twin that can be shown red. It is
the cheapest form that would actually catch a broken wire; no new harness or lane is created for it.

---

## 9. Documentation made false by this change

- `docs/human-interface-layer/part-model.md:69-71` — an entire `## Composer pills (deriveComposerPills)`
  section for a function that does not exist.
- `docs/human-interface-layer/part-model.md:96` — "adds a descriptor pill strip (model · effort · mode)".
- `docs/guides/user/three-core-views.md:27` — "The Session view composer shows model and option pills".

The substance all three must become: **the composer shows which model is running; the options that model
runs with are set once, in the agent's configuration, and apply to every run.** Wording is
`/pipeline:write-docs`' job.

**And a fourth, which an earlier draft of this document got wrong.**
`docs/agent-layer/harness-capability-descriptor.md:227` reads in full:

> *"Not backend-specific UI branching. UI controls render from option descriptors — no `harnessType`
> checks **(ESLint-enforced, single `"builtin"` exception)**."*

The first clause is the design's sourcing rule and this plan preserves it. **The parenthetical is
false**, verified: `eslint.config.ts:748-751`'s `files:` list is exactly `harness-presentation.ts` and
`SettingsHarnesses.tsx` — not "UI controls", and not the surface this package adds.

An earlier draft of this section quoted the line with the parenthetical trimmed off and filed it under
*"still true"*. That is the precise move design §2.1 warned about by name — *"Quoting the line with the
parenthetical trimmed off fixes this document and leaves the source wrong, and the source is what the
next agent will read"* — and it is retracted here. The line is **false today** and is corrected by §6
item 7, in the same commit as the config change (§6 item 6) that makes the corrected wording true.
Unlike the three above, this one is not `/pipeline:write-docs`' to reword later: a doc line whose truth
depends on a config line must ship with it.

---

## 10. Residuals a reviewer should see named

1. **`--effort` presence is not version-gated, and the failure is a crashed session, not a warning.**
   Stated at its real sharpness, because an earlier draft softened it. 2.1.220 *warns and continues* on
   a bad **value** — but an older binary that does not know the flag at all treats `--effort` as an
   **unknown option and exits non-zero**, which the adapter turns into `outcome: "crashed"`. The whole
   session dies, not just the option. And because the declaration is static and unconditional in
   `parseClaudeCatalog`, a user on an old CLI is **actively offered a control that will crash their
   runs**. The honest sentence is that one, not "their own binary tells them."
   **Still a defensible `mvp` trade, and here is the whole of the containment:** the plan's hard
   constraint means an agent nobody configured passes nothing, so every existing agent and every user
   who leaves the control alone is untouched; the blast radius is exactly "a user on an old CLI who
   deliberately sets this option", and the failure is immediate and loud rather than silent. Gating
   would mean parsing `claude --help` on every discovery run. Rejected at this tier — but this is the
   sharpest of the residuals and the one most worth a founder's eye.
   **The amendment did not multiply this risk by four — it isolated it.** Per harness
   (`feasibility.md` §6): **`codex`** is safe twice over — production args carry no `--strict-config`, so an unknown `-c` key is
   **silently ignored** and the turn completes (verified); and since §3.7 reads its declaration from the
   account's own `models_cache.json`, a codex with no such cache declares nothing at all.
   **`opencode`** and **`builtin`** are **structurally self-gating**: their declarations are derived from
   that binary's own catalogue and from OpenRouter's per-model `supported_parameters`, so a harness or
   model that lacks the option declares nothing and offers nothing. **`cursor-agent`** declares nothing
   at all. **`claude-code` is the only harness whose declaration is a compile-time constant untied to any
   probe, and therefore the only one that can offer a control an old binary will crash on** — and the
   codex decision in §3.7 narrowed the field to it rather than widening it. The risk stayed exactly where
   it already was.
2. **The stored value is a session-level CLI flag hung off a per-model slot.** The descriptor's only
   slot for an option is per model. `--effort` genuinely applies to any run of any model the CLI will
   run, so declaring it on each is truthful — but it is not "this model supports effort and that one
   does not". Recorded so nobody later reads the descriptor as a per-model capability claim.
   (`feasibility.md` Q5.)
3. **Malformed JSON in `model_options_json` throws** (§3.1). Single writer; not reachable through the
   app. A hand-edited row would fail the agents list read as well as that agent's own read.
4. **Design O-3's required-and-empty rule may be unreachable** — the first real option is optional with
   no default, so the Save-disabled branch never fires on any harness on this tree today. Kept because
   it is cheap; named so no reviewer reads it as evidence that elaborate validation was intended.
5. **A stale option is handled silently at run time** (§3.3e) — and the amendment split this in two.
   **One route to that silence is worth naming on its own, because someone will have to debug it:** a
   codex upgrade that changes the cache schema makes the file unparseable, codex then declares no models
   and no options (§3.7.2), and an agent configured with `reasoning_effort` **quietly reverts to the
   model's default effort on its next run** — no error, no notice, and the trigger is an unrelated tool
   upgrade the user may not connect to it. This is the same accepted-at-mvp silence recorded below,
   reached by a different path, and the degradation is deliberately the safe direction (default
   behaviour, not a crash). Recorded so the eventual "why did my agent get less thorough?" has an
   answer already written down.
   Where a choice list is **present** — compile-time on `claude-code`, probe-derived on the other three
   — a contradicting value is **dropped**, and no signal reaches the user. Where the probe returned
   **nothing**, the value is **passed** and the harness answers: opencode ignores an unknown variant
   silently, codex and OpenRouter reject one loudly at the first turn. So a codex or builtin user gets a
   visible failure and an opencode user gets none. Accepted at mvp because there is no in-scope surface for a
   notice and no AC asks; named as a founder-visible trade rather than buried.
6. **The harness lane has no CI job.** Step 9's obligation to run it locally is the only thing that
   makes AC 2's end-to-end proof real.

---

## 11. Which control shapes have a live declaration on day one

**Settled by the founder with the amendment: all four control shapes are built.** Which settings exist
is the harness's business, so a harness may expose a boolean or a number tomorrow and the screen must
render it. The narrowing option an earlier revision of this section offered is withdrawn — it is decided,
not a choice. What follows is the plain record the founder asked for.

**Every declaration on this tree is a `select`:**

| Shape | Live declaration on day one | Reachable from |
|---|---|---|
| `select` | **Four** — `claude-code.effort`, `codex.reasoning_effort`, `opencode.variant`, `builtin.reasoning_effort`; two of them carry a real `defaultValue` and one a real `helpText` | production, on four harnesses |
| `number` | none | story fixtures |
| `text` | none | story fixtures |
| `boolean` | none | story fixtures |

**Design features that therefore have no production consumer yet:** the `number`, `text` and `boolean`
renderers; §3.4's two-zone layout (the second zone stacks booleans, and there are none); the
placeholder-precedence rule; the boolean move-back-clears-the-key storing rule; and design §3.2's
`Input` `aria-describedby` fix and blocked-Save alert line (both need a **required** option, and all
four declarations are optional).

**Two things that *did* gain a production consumer through the amendment, and are worth recording
because an earlier revision listed them as unexercised:**

- **The `Default (…)` device now renders for real.** `builtin` is the one harness that publishes its own
  default (`reasoning.default_effort`, e.g. `"high"` on the locked model), so an agent on a builtin
  OpenRouter model genuinely sees `Default (High)` in its leading choice. That is no longer a
  story-only device.
- **Per-model choice lists are live**, on `opencode`, `builtin` **and `codex`**. The editor genuinely
  renders different choices for different models of the same harness — two values on
  `claude-haiku-4.5`, five on `claude-opus-4.8`, four on `gpt-5.4` and six on `gpt-5.6-sol`.
- **`Select.hint` now has a production consumer.** codex's cache publishes a `description` per reasoning
  level (*"Maximum reasoning with automatic task delegation"* for `ultra`), which is a real `helpText` on
  a real declaration. An earlier revision listed the prop as story-only; it is not.

**The four-arm reconciliation walk stays whole regardless**, and §8 tests all of its arms with
fabricated declarations. The walk is the safety layer: it must handle whatever a future harness
declares, and its `boolean`/`number`/`text` arms are what make an unrenderable option harmless rather
than a crash. Nothing here proposes narrowing it.

**Nothing is cut.** This section is a record of coverage, not a proposal.
