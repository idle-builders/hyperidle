# BA3 — Architecture critique

**Reviewed:** `.pipeline/work/BA3/architecture.md` + `.pipeline/work/BA3/feasibility.md`
**Against:** `plan.md` (binding), `design/approved.md`, `CLAUDE.md`, `.claude/rules/typescript.md`,
`.claude/rules/testing.md`, `tools/governance/README.md` + `tools/governance/src/rules/`.
**Method:** every `file:line` re-opened at `claude/pipeline-ba3-bc1ba7` @ `dc8d1cbd7`; the type-level
forcing function compiled in a scratch harness; the `claude` binary driven live under both open and
closed stdin. Same reviewer as the design critique, carrying that context forward.

**Verdict: one BLOCKING finding. Eight non-blocking defects. All six named residuals are genuinely
non-blocking, though R1 is understated. The cleanup list is real and complete.**

---

## BLOCKING

### B-A1 — The architecture silently drops both deliverables the approved design marks "explicit and in scope", and then re-asserts as true the very doc line the design proved false

Design `§2.1` closes with a heading that cannot be misread — ***"Two deliverables, explicit and in scope"*** — and names:

1. **Add `layers/core-ui/src/settings/AgentEditor.tsx` to the ESLint rule's `files:` list**
   (`eslint.config.ts:744-772`). The design's own AC-5 row says this *"is what makes AC 5 and the
   plan's 'Exposing options for harnesses that do not declare any' exclusion **provable rather than
   promised**."*
2. **Correct `docs/agent-layer/harness-capability-descriptor.md:227`**, whose parenthetical
   *"(ESLint-enforced, single `"builtin"` exception)"* is the overclaim that made design revision 1
   believe the enforcement already existed. The design is explicit about why quoting around it is not
   enough: *"Quoting the line with the parenthetical trimmed off fixes this document and leaves the
   source wrong, and the source is what the next agent will read... leaving it is how the same error
   happens again."*

**Neither appears anywhere in `architecture.md`.** I grepped the whole document for `eslint`, `lint
rule`, `files:` and `744`: the only two hits are §3.5 (*"not a test and not a lint rule"*, about the
type system) and §8's AC-4 row (*"No new ESLint rule"*, about a different question). §7's ordered
tasks have no step for the config change. §8's AC-5 row reads only *"pure descriptor sourcing, render
nothing | design §4; §7 step 7"*. No statement anywhere that either deliverable was dropped, deferred,
or judged out of scope.

**The second limb is worse than an omission.** §9 says:

> *"**Still true, and worth not breaking:** `docs/agent-layer/harness-capability-descriptor.md:227` —
> 'UI controls render from option descriptors — no `harnessType` checks'. That is exactly the design's
> sourcing rule and this plan preserves it."*

I opened the line. It reads in full:

> *"Not backend-specific UI branching. UI controls render from option descriptors — no `harnessType`
> checks **(ESLint-enforced, single `"builtin"` exception)**."*

**Verified: the parenthetical is false.** `eslint.config.ts:744-751`'s `files:` list is exactly
`layers/core-ui/src/settings/harness-presentation.ts` and
`layers/core-ui/src/settings/SettingsHarnesses.tsx`. It is not "UI controls" and it is not this
surface. The architecture reaches that false line, quotes it with the false clause cut off, and files
it under **"still true."** That is the precise failure mode design §2.1 deliverable 2 exists to stop,
performed on the same line, one document later.

**Why blocking, precisely.** Two grounds, either sufficient:
- *Approved in-scope work removed without a decision.* The design is the approved artifact and marks
  both items in scope. A cut needs to be stated and owned, not absorbed. Under-delivery against an
  approved scope is a plan violation regardless of how small the item is.
- *AC 5's stated proof mechanism is gone.* AC 5 survives for present behaviour — §8's component lane
  (design §4's four empty cases) is a real runtime assertion and I do not dispute it. What is lost is
  the standing property: with `AgentEditor.tsx` outside the rule, nothing mechanical prevents a future
  `harnessType === "claude-code"` branch in the option block, which is exactly what the plan's
  *"Exposing options for harnesses that do not declare any"* exclusion forbids. The design said so; the
  architecture neither carries it nor argues against it.

The fix is one config line and one doc line. The finding is not the size — it is that both vanished
without a word, and one of them was replaced with a re-assertion of the falsehood.

---

## The seven claims, re-tested

### Claim 1 — the declaration ⟺ carrier type coupling · **VERIFIED REAL, not decorative**

This is the plan's non-negotiable constraint, so I compiled it rather than reasoned about it. Four
variants through this repo's own `tsc` (`node_modules/.bin/tsc`, v6.0.3), `--strict`:

| Variant | Result |
|---|---|
| declaration + matching carrier | **green**, exit 0 |
| option declared, **no** carrier entry | **RED** — `TS2741: Property 'effort' is missing in type '{}' but required in type 'Record<"effort", string>'` |
| carrier entry for an **undeclared** option | **RED** — `TS2353: Object literal may only specify known properties, and 'mode' does not exist in type 'Record<"effort", string>'` |
| same undeclared-carrier error, but the declaration array annotated `as readonly Desc[]` instead of `as const satisfies readonly Desc[]` | **GREEN — the forcing function evaporates silently** |

So the coupling is genuinely expressible and genuinely fails `npm run check` in **both** directions.
The plan's constraint is mechanised, not conventional.

The fourth row is the caveat and it matters: the entire guarantee hinges on one spelling. Annotate the
descriptor list with `HarnessModelOptionDescriptor[]` — the obvious thing to reach for — and `key`
widens to `string`, the derived union becomes `string`, `Record<string, string>` accepts anything, and
**both checks pass vacuously with no error anywhere**. A guard that cannot go red is a passenger.

The architecture handles this correctly, and I want to record that it does: §3.5 says *"The exact type
spelling is the builder's; the two-directional RED is not"*, §7 step 2 requires **"Prove the forcing
function both ways by temporarily breaking each half and recording that `npm run check` goes RED"**,
and §8 carries it as its own evidence row. Making the red-proof the deliverable rather than the
spelling is what closes the hole. See **N-A2** for the one thing that would make it tighter.

### Claim 2 — `--effort` values and the stderr proof · **value set and mechanism VERIFIED; the green half asserts only an absence**

Run live in this environment:

```
$ claude --version → 2.1.220 (Claude Code)
$ claude --help | grep -A2 effort
  --effort <level>    Effort level for the current session
                      (low, medium, high, xhigh, max)
```

Five values, exactly as declared. ✓

The stderr mechanism needed care, and my first attempt **falsified** feasibility Q4 before production
conditions rescued it. With stdin left open:

```
$ claude -p --model haiku --effort low "say ok"   # stdin open
stderr (157 bytes): Warning: no stdin data received in 3s, proceeding without it…
```

A valid value produced a stderr line. Under the production adapter it does not, because
`cli-harness-adapter.ts:572` closes stdin immediately after spawn (`child.stdin?.end()`, `@lore
cli-adapter-stdin`). Re-run with `</dev/null` to match:

```
$ claude -p --model haiku --effort low       "say ok" </dev/null → stderr 0 bytes
$ claude -p --model haiku --effort ludicrous "say ok" </dev/null →
  stderr: Warning: Unknown --effort value 'ludicrous' — ignoring it and using the
          default effort. Valid values: low, medium, high, xhigh, max.
```

**Feasibility Q4's three facts hold under the conditions the adapter actually creates.** I also
confirmed `CLAUDE_CLI_CONFIG` (`adapter-pool.ts:425-477`) sets no `stderrIgnorePatterns` — only codex
(`:344`) and opencode (`:402`) set `[/.*/]` — so the line does reach
`HarnessEvent{type:"error",code:"CliStderr"}` at `cli-harness-adapter.ts:721-731`. ✓

**Is a stderr warning sound proof that argv reached the binary as that flag?** For the tamper lane,
yes, and strongly: the binary names `--effort` and enumerates its five values, a string nothing in our
plumbing knows. Only the real binary can produce it.

**Does the green half prove anything?** No — and this is the honest answer to the question asked.
"Zero `CliStderr` events" is an assertion of **absence**. It is satisfied identically by *"the flag
arrived and was valid"* and by *"the flag never left our plumbing"*. A positive lane that would still
pass if the carrier were deleted is not evidence for the carrier. Feasibility Q4 fact 3 — *"So 'zero
`CliStderr` events' is a clean positive assertion, and it is not vacuous"* — is the one overstatement
in that document. The entire load is carried by the tamper twin.

That is not a defect in the choice, because **no better signal exists** and both documents establish
that honestly: Q3 measured 125 vs 78 output tokens across `low`/`max` and correctly refuses to build an
assertion on it (*"a flake waiting to happen"*). `--output-format json` echoes no effort field. Given
no observable positive, a tamper twin is the right instrument. See **N-A1** for the residual gap in
what the twin covers.

### Claim 3 — storage, ownership, migration safety · **VERIFIED, with one precision correction**

- **Owner.** `tools/governance/table-owners.json:44` — `"agentRunConfig": "run-orchestration"`. ✓
  `tools/governance/README.md:128` — *"A new **table** → give it an owner… The build fails until you
  do"* — confirms a new **column** needs no registry edit, as §3.6 claims. ✓ There is no governance
  rule enforcing per-table *access*; the fifteen rules in `tools/governance/src/rules/` contain none,
  and `table-owners.json` is consumed only by `registries-honest.ts` and the governance model. So
  exclusivity here is a standing architectural rule, not a lint gate.
- **Exclusivity — the correction.** §3.1's *"the sole reader/writer… the only file that may touch this
  column"* is true **in production only**. I traced all twelve `agentRunConfig` references. Four
  production/framework hits (`assistant-turn-resolver.ts:63`, `work-intent.ts:122`,
  `start-runtime.ts:136`, `runtime.ts:135`) are **comments** naming the *port*, not table access — so
  production access genuinely is exclusive to `agent-run-config-store.ts`. But four **development-world**
  files write the table directly: `tools/eval/src/seeding.ts:125`, `tools/setup/src/demo-fixture.ts:79-85`,
  `tools/setup/src/demo-world/cast.ts:93,110`, `layers/core-ui/__scripts__/ah6-test-server.ts:253`.
  This is not a violation — `tools/` is outside the shipping roots and `__scripts__` starts with `__`,
  so both are development world — and it **strengthens** the nullable-no-default choice, since all four
  will simply leave the column `NULL`. But the claim needs the word "production" (**N-A3**).
- **Nullable, no backfill, populated DB.** `framework/db/src/schema.ts:115-125` verified — seven
  columns, `maxConcurrentSessions` the only `notNull`. Migration tail is `0060_BA1_one_routine_primitive.sql`,
  so `0061` is correct. A nullable `ADD COLUMN` with no default is a catalogue-only change; every
  existing row stays `NULL`, which §3.4 level 1 correctly calls "the schema-level statement of the plan's
  hard constraint". ✓
- **The migration-test trap — properly avoided.** §7 step 5 and §8 both name it, and the model they
  point at is right. `ba1-routine-and-belonging-migration.integration.test.ts` builds the pre-migration
  state by **replaying the real prior `.sql` files through `drizzle-orm/pglite/migrator`'s `migrate()`**
  from a truncated `meta/_journal.json` (`:87-105`), and its header records the exact prior failure:
  *"Every other column the hand-written script restored happened to match… A hand-written stand-in for
  the schema…"*. The architecture instructs the builder to follow that shape and not its predecessor's.
  Correctly handled. ✓

### Claim 4 — reconciliation location and the argv-identity proof · **reasoning SOUND; the identity claim is PROVABLE as written**

The argument is that a run-time filter must read the **static in-code declaration**, never the live
descriptor, because reading the descriptor would relocate the offline-wipe defect from the write path
to the run path. I verified the premise it rests on — that an empty list cannot be distinguished from a
failed probe — at all four sites feasibility Q6 cites:

- `harness-discovery.ts:673` and `:712` — `if (!resp.ok) return [];` on the Anthropic and OpenRouter
  model fetches;
- `:440-443` and `:494-497` — the claude and opencode catalogue probes `catch` and *"degraded gracefully
  — models stays []"*.

The premise holds. The conclusion follows, and it is the strongest single decision in this document: it
takes the defect I blocked the design on and makes it structurally unable to recur one layer down,
rather than promising not to reintroduce it.

**The character-for-character claim is provable, not asserted.** `cli-harness-adapter.ts:551` is today
`const finalArgs = [...resolvedArgs, ...extraArgs];`. §3.3d makes it
`[...resolvedArgs, ...extraArgs, ...optionArgs]`. With `optionArgs === []` the two expressions are
identical by spread semantics — and §3.4 level 5 gets it for free precisely because `optionArgs` is
built by walking **declarations**, never by iterating the stored map, so a non-empty-but-fully-stale map
still yields `[]`. §8's AC-3 row assembles the right proof: three cases (absent, `{}`, and
**non-empty-reconciling-to-empty**), each asserted *"against the config's own resolved args, never a
hardcoded literal."* That last clause is what makes it a real assertion instead of a snapshot that
drifts. Correct.

### Claim 5 — the design's settled decisions survive · **YES; no pruning or default-resolution reintroduced at any layer**

I looked for a re-entry at every layer:

| Layer | Could it prune or resolve a default? | What it actually does |
|---|---|---|
| editor | design §5.1 | only rendered keys written; others carried through |
| API/validator | §3.2 | **prohibition 1: "It never prunes."** Stores exactly the map received. **Prohibition 2:** an unknown key is accepted, not rejected. **Prohibition 3:** descriptor unavailable ⇒ validate nothing, accept |
| store | §3.1 | `"key" in patch` semantics preserved — verified at `agent-run-config-store.ts:138-145`; an absent key is left alone |
| provisioner | §3.3b | *"threads it, unfiltered"*; explicitly does **not** reconcile |
| adapter | §3.3e | drops at **emit** time only; never writes back |

No default-resolution anywhere, and §3.5 removes the temptation at the source by declaring **no
`defaultValue`** for `effort` — so there is no default to resolve on this tree at all. The three
prohibitions in §3.2 are stated as load-bearing rather than left implicit, and prohibition 1 names the
exact harm (*"that is AC 1 broken in the most damaging possible way"*). Survives intact. ✓

### Claim 6 — evidence-plan honesty · **largely sound; three precision gaps**

- **`requireHarness` is a real hard-fail.** `require-harness.ts:94` `throw new Error(…)`, `:98` *"(AR1:
  never skipIf to green.)"*, `:78-84` binary-on-PATH for the four CLIs and `OPENROUTER_API_KEY` for
  builtin. No `skipIf` anywhere. ✓
- **No stubs.** `cli-adapter-real-binary.integration.test.ts` already drives
  `new CliHarnessAdapter(CLAUDE_CLI_CONFIG)` (`:234`) against the real binary, gated per-describe by
  `requireHarness` (`:199, :478, :500, :565`). §8 extends this file rather than inventing a lane. ✓
- **The stale-comment call is correct and I verified it.** `provision-real-session.ts` does not exist
  anywhere on the tree; `honest-harness-guard` survives only in comments and `plans/` history, and
  `scripts/` contains only `install-git-hooks.sh`. `.claude/rules/testing.md:77` independently confirms
  the deletion (*"The source-level gate is gone… Nothing checks at lint time"*). So §1's *"do not chase
  the stale comment"* is right. ✓ (But see **N-A4** — `testing.md`'s own seam names are stale too.)
- **Equal coverage is genuinely discharged.** `testing.md:67` demands *"all five — a `requireHarness(<name>)`
  lane… equal coverage, mechanically enforced"*. §8 names all five. The four no-option harnesses assert
  *"no options configured, real binary, turn completes"* — which is not filler, it is **literally AC 3**
  (*"an agent with no options configured behaves as it did before"*) evaluated on the four harnesses
  where that is the only statement available. That is the correct assertion, not a coverage fig leaf. ✓
  One placement problem: **N-A5**.
- **AC 4 is correctly handled.** Deletion + a **runtime** component assertion (render `SessionView` with
  a descriptor whose model *declares* options, assert no control appears), not a filesystem grep. §8 says
  so in as many words and cites `testing.md`. That component test is a real regression net — it can go
  red. ✓
- **The no-CI-job reality is acknowledged, twice.** §10.6 (*"the only thing that makes AC 2's end-to-end
  proof real"*) and §7 step 8 (*"Run… and get it green before shipping — nothing downstream runs this
  lane"*). That matches `testing.md:71`'s obligation verbatim. ✓

### Claim 7 — proportionality at tier `mvp` · **tight in the plumbing; one large soft spot**

The discipline is real where it counts: no new package, route, port or event; §5's explicit
*"deliberately not added"* list (rollback, shim, dual-write, counter, retry, feature flag); §3.3e's
refusal to thread a model parameter for a per-model distinction with no data behind it (*"Building the
lookup now would be a mechanism with no AC and no caller"*). That is the right instinct applied
consistently.

The soft spot is **N-A7** — the four control kinds — and it is not small.

---

## Non-blocking defects

**N-A1 — the tamper twin does not exercise the branch production uses.** §8 widens
`declaredModelOptions` to `{kind:"text"}` so `"ludicrous"` survives the walk. The walk then takes its
**text** branch; production `effort` is a **select**. So the twin proves *carrier → argv → binary* but
through a different arm of §3.3e than the shipped option travels, and the select arm's argv is proven
only by unit tests with an injected `spawnFn`. The chain is covered in two overlapping pieces, which is
adequate — but §8's *"Together the two lanes prove the value genuinely reached the binary as that flag"*
claims one continuous proof, and there isn't one.

**N-A2 — the forcing function's spelling is load-bearing and unstated.** Per Claim 1's fourth variant,
`as readonly HarnessModelOptionDescriptor[]` instead of `as const satisfies …` makes both directions
compile green with no diagnostic. §3.5 leaves the spelling to the builder and relies on the recorded
two-way RED to catch a wrong choice. That works, but the *degradation is silent* and the note costs one
sentence. Worth naming in the document a builder reads before writing the file, not only in the proof
step afterwards.

**N-A3 — "sole reader/writer" needs the word "production."** Four development-world files write
`agent_run_config` directly (listed under Claim 3). Nothing breaks — a nullable column with no default
is exactly right for them — but §3.1's *"the only file that may touch this column"* is not literally
true, and a builder who believes it may not check them.

**N-A4 — `.claude/rules/testing.md:73` names two seams that do not exist.** It says a test *"obtains
[a model] through the seam (`runThroughHarness` / `lockedHarnessAdapter`, same file)"*. Neither symbol
exists in `require-harness.ts`; the actual export is `harnessTestResolvedModel` (`:237`). So §8's
`new CliHarnessAdapter(…)` idiom cannot violate a seam requirement that has no seam — the architecture's
position is right — but this is a second stale pointer in the same area as the one §1 flagged, and
nobody owns it. Not BA3's rubble; worth surfacing so it stops misleading.

**N-A5 — the builtin lane cannot live where §8 implies.** §8's AC-3 row puts *"one `requireHarness`
lane each for `codex`, `opencode`, `cursor-agent`, `builtin`"* alongside an AC-2 row that names
`cli-adapter-real-binary.integration.test.ts`. That file has exactly four describes, all CLI adapters;
`builtin` is `BuiltinHarnessAdapter` and cannot be hosted there. Existing builtin lanes live elsewhere
(e.g. `AM2-builtin-gateway.integration.test.ts:173`). The obligation is right; the address is missing.

**N-A6 — §3.1 quotes the design sentence the design has since replaced.** The block-quote reads *"A
control sitting at its default state contributes no key; a control away from its default contributes
its value."* The approved design now reads *"a **required** option always contributes its value; an
**optional** option contributes its value only when the control sits away from its default."* The
change was made because the old sentence is wrong for required options — a required select sitting at
its `defaultValue` **does** contribute a key. §3.1's own next-but-two bullet says so correctly
(*"A **required** option always stores"*), so the contract is fully expressed and no contradiction
survives into the substance — but the highlighted pull-quote a builder will lift is the superseded,
incorrect one, and it contradicts a bullet three lines below it. Related staleness in the same seam:
§7 step 7 says *"the three stories"* where the approved design §9 says **two** and explicitly drops
`NoModelOptions`. (The design file still self-labels "Revision 2" in its header despite carrying the
later edits, which is how this drift got in.)

**N-A7 — three of the four control kinds ship with no production data behind them.** §3.5 declares
exactly one option on the whole tree: `effort`, a `select`, `required: false`, **no `defaultValue`**,
and — searching both documents — **no `helpText`**. So on this tree nothing exercises: the `number`,
`text` and `boolean` renderers; §3.4's two-zone layout (there is no boolean to stack); the
`Default (…)` parenthetical device (no `defaultValue` to name); the placeholder-precedence rule; the
boolean move-back-clears-the-key storing rule; the new `Select` `hint` prop and its story (no
`helpText` to render); design §3.2's `Input` `aria-describedby` fix and blocked-Save alert line (both
need a required option, and none exists). Every one of them will be reachable only from a story
fixture. For a `mvp` tier whose pre-build note reads *"light design"*, that is the largest block of
work in the package with nothing behind it. I am not calling it blocking — the four kinds are in the
approved design and in the existing descriptor vocabulary, and proportionality is not a blocking ground
— but if anything here should be cut or staged, it is this, and the architecture does not weigh it at
all.

**N-A8 — §3.2's rejection can lock a user out of saving, in a state §3.3e already tolerates.** §3.2
rejects a value that is invalid for a **currently declared** key. Design §5.1 carries stored keys
through, and design §5.3 clears an invalid value only on a **model switch** — not on plain editor load.
So a stored `effort` value that a later harness version removes from `choices` would render as
`Default`, still sit in the draft, and 422 every save including a name-only edit, until the user
happens to touch that select. Meanwhile §3.3e handles the identical value at run time by simply
dropping it. Trigger requires a future version to remove a choice, so it is unreachable today — but
§3.2 is optional machinery (§3.2 itself calls it *"a convenience that improves the error message"*, and
no AC asks for it) that creates a failure mode the mandatory layer does not have.

---

## The six named residuals — judged

| # | Residual | Verdict |
|---|---|---|
| **1** | `--effort` not version-gated | **Non-blocking, but understated — the strongest of the six.** The containment argument is sound: an agent with no option stores nothing, so an old CLI is untouched unless a user deliberately set the option. Two things the write-up softens. First, the failure is not *"that user's own binary telling them"* — I verified 2.1.220 *warns and continues* on a bad **value**, but an older binary receiving an **unknown flag** exits non-zero, which the adapter turns into `outcome:"crashed"`: the whole session dies, not just the option. Second, because the declaration is static and unconditional in `parseClaudeCatalog`, a user on an old CLI is **actively offered** the control in the editor. So the honest sentence is "a user on an old CLI can be invited to set an option that crashes their sessions." Still bounded, still a defensible `mvp` trade, still correctly rejected as too expensive to gate — but it should be stated at that sharpness. |
| **2** | Session-level flag on a per-model slot | **Non-blocking.** Truthful reading, argued rather than hidden (feasibility Q5), and §3.3e refuses to build per-model machinery for a distinction with no data. Correct. |
| **3** | Malformed JSON throws | **Non-blocking.** Single production writer, always `JSON.stringify`; `.claude/rules/typescript.md` forbids the swallow that would be the alternative. A throw is the honest signal. |
| **4** | Design O-3 required-and-empty may be unreachable | **Non-blocking**, and correctly named so no reviewer mistakes it for intended validation. Feeds N-A7. |
| **5** | Stale option drops silently at run time | **Non-blocking, and I checked the mitigation rather than taking it.** The claim is that a dropped key is also not rendered, so the user's view and the invocation agree. It holds: a stored value no longer among `choices` renders on a `Select` whose first entry is the `Default` leading choice (design §3.3), so the control reads *not set* — which is exactly how it now behaves. The views genuinely agree. No AC asks for a signal and `ETHOS.md` forbids preemptive mechanism. Not a blocker in disguise. |
| **6** | Harness lane has no CI job | **Non-blocking and correctly handled.** Named in §10.6, converted into an obligation in §7 step 8, and matching `testing.md:71` exactly. Nothing is claimed to be gated that isn't. |

---

## Cleanup list — real and complete for this feature

Every item opened:

| Item | Verified |
|---|---|
| `scope` field | `harness-capability-descriptor.ts:76` (definition) + exactly three mentions: `__tests__/harness-capability-descriptor.test.ts:22`, `SessionView.stories.tsx:287`, `:302`. No production writer, no production reader. ✓ Deleting it in **step 1, before** the first declaration is written is the right order — the new declaration is never asked to state a field with one meaning. |
| Stale option arrays in `SessionView.stories.tsx` | `:266-315` — two full descriptors (`effort`, `mode`) on a fixture whose component renders no option control. ✓ |
| Three doc statements | `part-model.md:69-71` (a whole `## Composer pills (deriveComposerPills)` section for a deleted function), `part-model.md:96`, `three-core-views.md:27`. All three read exactly as quoted and all three are false. ✓ |
| Four stale comments | `SessionView.tsx:27` ("Adds descriptor pills…") ✓ stale; `:747` ("+ descriptor pills") ✓ stale; `SessionView.stories.tsx:326` ("queued message · descriptor pills…") ✓ stale. `SessionView.tsx:619` reads *"descriptor pill row — model · working state"*, which is already accurate — a harmless over-inclusion, not a defect. |
| `require-harness.ts:124-132` (marked optional) | Both referents confirmed absent. Correctly marked optional with the reason (step 8 makes a builder read those exact lines). ✓ |

Correctly **excluded** with reasons: `pipeline.config.yml`'s dead `designSystem.path`, the
`claude models`/`MODEL_CATALOG` divergence, and the composer's model-cycling pill (design O-2, founder
call). None is this feature's rubble. The one thing that *is* arguably in this feature's blast radius
and is missing is `docs/agent-layer/harness-capability-descriptor.md:227` — see **B-A1**.

---

## What is right

The reconciliation-location decision (§3.3e / assumption 3) is the best thing in this document. It
takes the defect I blocked the design on, and instead of promising not to reintroduce it one layer
down, makes it structurally impossible: the filter reads a compile-time constant with no failure mode,
and the premise — that an empty model list cannot be distinguished from a failed probe — is verified at
all four discovery sites rather than asserted. §3.2's three prohibitions are stated as load-bearing
with the harm named. §3.4 discharges the plan's hard constraint at five independent levels and then
separately isolates the one case that does not come for free. The feasibility work is genuinely live —
real binaries, real output, a recorded refusal to build an assertion on token counts, and codex
correctly ruled out for a structural reason (no declared models) rather than a convenient one, with the
finding recorded rather than lost. §1's four "disagreements the plan did not name" are all real and all
verified. The boundary work checks out end to end: `framework/harness-protocol` already depends on
`@hyperidle/harness-capability` (`package.json:18`), `cli-harness-adapter.ts:21` already imports from
it, the port's patch type is genuinely derived from the view (`agent-orchestration-port.ts:163-166`),
and no new package, route, port or event is introduced.

The blocking finding is narrow and cheap: one ESLint config line and one documentation line, both named
by the approved design as in scope, both absent here, and one of them replaced by a re-assertion of the
falsehood the design existed to correct.

---
---

# SECOND PASS — verification of the architecture revision

**Reviewed:** revised `architecture.md` (555 → 685 lines) and `feasibility.md` (258 → 281).
**Method:** every changed claim re-opened against code; the `outcome:"crashed"` path traced; the
governance break-test discipline read at source; the §11 independence claim walked row by row against
§8. First pass above left intact.

**Verdict: B-A1 RESOLVED, both limbs. No new blocker. The one new behaviour (narrowed write-time
validation) is clean and I verified it introduces no new read or seam crossing. §11's independence
claim is substantially true with exactly one exception, named below.**

---

## The blocker — RESOLVED

### Limb 1 — the ESLint `files:` deliverable

Now present in **three** places, each as work rather than fact:

- **§6 item 6** — under a retitled §6 (*"Cleanup and the design's two deliverables"*) which explains
  why the two sit beside the rubble: *"they are not rubble, they are the standing property that makes
  AC 5 provable rather than promised."*
- **§7 step 8** — a real ordered task, its own commit, positioned after the editor exists *"rather than
  before"*, with the harness lane correctly renumbered to step 9 (and §6 item 5's cross-reference
  updated from "step 8" to "step 9" — the kind of detail that usually gets missed).
- **§8** — an AC-5 evidence row (`lint rule` lane).

The citation also tightened from `744-772` to `eslint.config.ts:748-751`. **Verified exact** — those
four lines are the `files: [` array and its two entries. More precise than the original.

### Limb 2 — the doc line

- **§6 item 7**, with the coupling stated: *"it ships in the same commit as item 6 or it is false again
  the moment it is written."*
- **§8** — a second AC-5 row.
- **§9** — a full retraction. The line is now quoted **in full with the parenthetical intact**, labelled
  *"**The parenthetical is false**, verified"*, and the earlier draft's move is named and withdrawn:
  *"An earlier draft of this section quoted the line with the parenthetical trimmed off and filed it
  under 'still true'. That is the precise move design §2.1 warned about by name… and it is retracted
  here."*

**I re-scanned the whole document for any surviving false assertion.** Three hits for
`ESLint-enforced` / `still true` remain (`:485`, `:594`, `:601`) — all three are quotations of the false
line or of the retracted draft, each explicitly labelled as false or as withdrawn. **Nothing in the
document now asserts the enforcement exists on this surface.** ✓

### Is "review check, not a lane" honest, or a dodge? — **Honest.**

It is a sentence in a `.md` file. This repo has no mechanical checker for prose, and inventing one
would be exactly the ceremony §8's AC-4 row correctly refuses two rows earlier (*"a bespoke rule for a
one-off deletion is ceremony no AC asks for"*). Claiming a lane it does not have would be the dodge;
naming the absence is not.

What lifts it above a shrug is the **commit coupling**. §6 item 7 and §7 step 8 both bind the doc line
to the config line in one commit, so the diff that makes the sentence true and the sentence itself
arrive as a single reviewable unit. A reviewer cannot approve one without seeing the other. That is the
right structural answer to an item that cannot be mechanized — the truth of the prose is gated on a
change that *is* gated.

### Does the break-test genuinely reflect how this repo proves a rule fires? — **Yes, verified.**

`tools/governance/README.md:107-122`, heading: *"Every rule is break-tested, and that is a gate."*
`npm run lint` runs `governance-lint --attacks` with four anti-rot properties, including property 4:
*"a registered rule with no attack case fails the build."* And `governance-attacks.ts:1-8` records where
it came from:

> *Founder: "We should always check if the linter works by manually adjusting some things and trying to
> break it." That had happened exactly once, by hand, in a review — and it found six working bypasses.*

So §7 step 8's *"show the rule red by temporarily putting a `harnessType === "claude-code"` literal in
the option block"* is the house discipline, not an invention. ✓

**One precision worth stating** (**N-B4**): governance's version is a *standing mechanized gate* — a
table of attacks re-run on every lint, where a rule without a case fails the build. Step 8's is a
*one-time manual demonstration recorded in the PR*. The harness-type rule lives in `eslint.config.ts`,
not in the governance rule set, so it never joins the attacks table and never acquires the standing
gate. Same discipline; different durability. The document says *"the same break-test discipline"*,
which is accurate — but a reader could infer the new coverage inherits the gate, and it does not.

---

## The other re-tested claims

### R1 — crashed-session severity · **VERIFIED in code and in both documents**

`cli-harness-adapter.ts:1087-1094`:

```
if (signal !== null)      outcome = "stopped";
else if (code === 0)      outcome = "completed";
else                      outcome = "crashed";
```

A non-zero exit is `outcome: "crashed"`. An older `claude` receiving an unknown option exits non-zero,
so the whole session dies. **Claim verified.** ✓

Stated at that severity in **both** documents — `architecture.md` §10.1 (*"the failure is a crashed
session, not a warning… a user on an old CLI is actively offered a control that will crash their runs.
The honest sentence is that one, not 'their own binary tells them.'"*) and `feasibility.md:219-231`,
which additionally warns *"That is a different severity from the bad value case measured in Q4… do not
let the two blur."* Both keep the containment argument, which remains sound. ✓

### The green lane · **no longer overstates**

§8's AC-2 row now says it itself: *"the positive lane asserts an **absence** (zero `CliStderr`) and
would pass identically if the carrier were deleted — it is a smoke check, not evidence for the carrier.
The tamper twin carries the whole proof."* That is the finding, adopted rather than argued with. Stdin
closure recorded at `cli-harness-adapter.ts:572`. ✓ Feasibility Q4's *"it is not vacuous"* overstatement
is gone.

### The tamper twin now travels the production branch · **VERIFIED, both halves**

The twin now widens the declared **choice list** by one entry while keeping `kind: "select"`:
`{...effort, control: {kind:"select", choices: [...effort.choices, {value:"ludicrous", …}]}}`.

- **Does it exercise the shipped path?** Yes. §3.3e's table emits a value when it *"satisfies the
  declared control"*, which for a `select` means *"the value is among the new `choices`"*. Adding
  `ludicrous` to `choices` makes it satisfy, so it is emitted through the **same `select` arm** the
  shipped option travels — not the `text` arm the old twin used. §8 also tells the builder why the old
  form was wrong and forbids it: *"Widening the control kind to `text` instead would prove the wire
  through an arm production never uses; do not do that."* ✓ **N-A1 closed.**
- **Does the invalid value still produce the flag-naming stderr?** Yes — I re-reproduced it under the
  adapter's own conditions (stdin closed):
  ```
  $ claude -p --model haiku --effort ludicrous "say ok" </dev/null
  stderr: Warning: Unknown --effort value 'ludicrous' — ignoring it and using the
          default effort. Valid values: low, medium, high, xhigh, max.
  exit=0
  ```
  The binary's own valid set is unaffected by what our descriptor declares, which is the whole point. ✓
  Note the exit code is **0** — the turn completes — so the assertion must sit on the `CliStderr` event
  and not on `outcome`. §8 asserts exactly that (*"emits a `CliStderr` event whose message names
  `--effort`"*). Correct as written.

The twin now needs `effort.choices` importable to spread it; §3.5 already has the module exporting the
descriptor list, so that follows.

### Ownership named by world · **matches my own trace exactly**

§3.1 now reads *"the sole **production** reader/writer"* and adds a paragraph naming all four
development-world writers at the lines I found — `tools/eval/src/seeding.ts:125`,
`tools/setup/src/demo-fixture.ts:79`, `tools/setup/src/demo-world/cast.ts:93,110`,
`layers/core-ui/__scripts__/ah6-test-server.ts:253` — with the world rule that makes them legal, and
turns it into an argument rather than an apology: *"one more argument for nullable-with-no-default: all
four simply leave the column `NULL` and need no edit. A builder must not read 'sole writer' as 'nothing
else inserts rows' and skip checking them."* ✓ **N-A3 closed.**

### The narrowed write-time validation (NEW behaviour) · **clean — checked against all three risks**

§3.2 gains: *"**Scope: only values this request changes.** A key whose value is identical to what is
already stored is not re-validated."*

| Risk the coordinator named | Finding |
|---|---|
| Conflicts with **sparse storage**? | No. Validation decides whether a request is *rejected*; it never decides what is stored. Orthogonal. |
| Conflicts with **no-prune**? | No — and it moves in the safe direction. Narrowing makes rejection rarer; it can never delete a key. Prohibition 1 is untouched and still reads *"It never prunes."* |
| Opens a path to **storing something the run path silently discards, invisibly to the user**? | No, and I checked the visibility rather than taking it. A stored value that a later harness drops from `choices` now survives the save. At run time §3.3e drops it. In the editor, a `Select` whose `value` matches no option falls to its first entry — the `Default` leading choice (design §3.3) — so the control reads *not set*, which is exactly how it now behaves. **The two views agree**, the same mitigation I verified for residual 5. No new invisible-discard path. |

**The one thing §3.2 does not say, and should** (**N-B1**): where the "already stored" value comes
from. I checked, and the answer is good — both PATCH call sites already load it immediately before the
call: `agents.ts:372` and `:441`, `const existingRunConfig = await agentOrchestration.runConfig.read(id)`.
So `existingRunConfig.modelOptions` (added to the view by §3.1) is a free fifth argument and
`validateAgentConfig` stays the pure function it is today. **No new read, no new seam crossing, no
ownership violation.** The POST site (`:248`) has no existing config, so every key is "changed" and gets
validated — correct by construction. But because the document leaves it unstated, a builder could
instead reach for a DB read *inside* the validator, which would put `layers/core-api` directly on
`run-orchestration`'s owned table. One sentence naming the two call sites removes the risk.

### Everything else claimed fixed · **all verified**

| Item | Status |
|---|---|
| §3.1 superseded pull-quote | **Fixed.** Now the design's current sentence, plus an explicit *"Do not lift the old sentence"* note explaining why the old one is wrong for required options. |
| "three stories" → two | **Fixed.** §7 step 7 now names both (`AllControlKinds`, `RequiredOptions`) and records that design §9 drops `NoModelOptions`. |
| builtin lane address | **Fixed.** §8's AC-3 row explains why it cannot live in `cli-adapter-real-binary.integration.test.ts` (four `CliHarnessAdapter` describes; builtin is `BuiltinHarnessAdapter`) and routes it to `AM2-builtin-gateway.integration.test.ts` — verified, `requireHarness("builtin")` at `:173`. |
| `testing.md:73` stale seams | **Surfaced**, §1 lines 67-68, correctly as not-BA3's. |
| `SessionView.tsx:619` | **Dropped**, with the reason (*"already accurate; leave it"*). Item 4 is now "Three stale code comments". |
| `as const satisfies` trap | **Fixed.** §3.5 has it, names the exact wrong spelling, states that both directions compile green with no diagnostic, and closes with *"a guard that cannot be shown red is a passenger."* **N-A2 closed.** |

### Confined-scope check

I re-read the sections that were not to be touched. §0, §3.3a-e (including the reconciliation table),
§3.4, §3.6, §4, §5, §10.2-10.6, and the migration/store/seam citations are unchanged and still correct.
§1 gained one bullet and is otherwise intact. Nothing I deep-tested in the first pass was disturbed.

One carry-over, unchanged and still minor: the header says *"Approved design… **revision 2**"*, which
matches the design file's own header label even though that file carries later edits. Consistent, not
wrong — the drift is the design's label, not this document's citation.

---

## §11 — the independence claim, walked row by row

**Verdict: substantially true. One exception, and one thing a founder should be told about pricing.**

I checked every element §11 names as independent:

| Element | Independent of renderer count? |
|---|---|
| Storage (§3.1 column, type, migration, `"key" in patch`) | **Yes** — the value type is the descriptor vocabulary's, not the renderer's |
| Seam + wire (§3.1) | **Yes** |
| Pass-through (§3.3a-d) | **Yes** |
| §3.3e reconciliation | **Yes** — see the pricing note below |
| Type coupling (§3.5) | **Yes** — `effort` is a `select` either way |
| Cleanup items 1-5 | **Yes** |
| **Design deliverables, §6 items 6-7** | **Yes** — and step 8's break-test still works, because a select-only option block is still an option block to put the literal into |
| AC 2 lanes (unit ×2, service, harness incl. tamper twin) | **Yes** |
| AC 3 lanes (unit, service, harness ×4) | **Yes** |
| AC 4 lanes (deletion, component) | **Yes** |
| AC 5 lanes (component ×4 cases, lint rule, review check) | **Yes** |
| plan-constraint type-system lane | **Yes** |
| Stories | **Affected, and §11 says so** — two collapse to one |
| **AC 1 component lane** | **NO — see the exception** |

### The exception (**N-B2**)

§8's AC-1 **component** row reads:

> *"`AgentEditor.test.tsx`: an untouched control writes no key; a moved control writes its value; **a
> boolean moved back clears its key**; a stored key the editor did not render survives the save
> payload."*

Under a `select`-only narrowing **there is no boolean renderer**, so that clause cannot be written. §11
says *"every AC's evidence lane [is] independent of how many control kinds render"* without
qualification, and that is not true of this one.

It is one clause in one row, not a lane — the other three assertions in that row are all satisfiable
with a `select`, and the boolean storing rule it proves is itself one of the things §11 proposes to
drop, so the repair is a deletion rather than a rewrite. But the coordinator is presenting this to the
founder as *"nothing else changes"*, and this is the one place where something does.

### The pricing note (**N-B3**)

§11 scopes the narrowing to the **renderer**: *"the renderer handles `select` and treats any other kind
as not-yet-rendered — one branch, not four."* It does **not** narrow §3.3e's reconciliation walk, which
keeps its `boolean` / `number` / `text` arms, nor §8's AC-2 reconciliation-table row, which tests those
arms with fabricated declarations.

That is internally consistent — §11's table is careful to say *renderers* every time — and it is the
right call, since the walk is the safety layer and should handle the whole vocabulary. But a founder
reading *"the smallest honest build"* could reasonably expect the four-kind surface to go away, and it
does not: **four arms of the walk survive, exercised only by fabricated unit fixtures.** What narrowing
actually buys is three renderers, the two-zone layout, the `Select.hint` prop, the `Default (…)` device,
the placeholder-precedence rule and two a11y paths — not the walk. Worth saying plainly so the choice is
priced on what it really removes.

### On §11 as a whole

Raising this was right and the handling is right. It states the cost of narrowing fairly against itself
(*"the second harness to declare an option is likely to want a `boolean` or a `number`, and that package
would then pay for the renderer plus the two-zone layout — work that is designed and reviewed now, at
its cheapest"*), and it refuses to act: *"Not cut on my authority. The four kinds are in the approved
design… proportionality is not grounds for architecture to narrow approved scope."* That is the correct
boundary. Narrowing would reverse approved decisions in design §3, §3.1, §3.2, §3.4 and §9, and it needs
a founder, not an architect. §11 asks for one and costs the question honestly.

---

## Second-pass conclusion

The blocker is closed properly rather than papered over: both deliverables are ordered tasks with
evidence rows and a commit that couples them, the break-test is the house discipline verified at source,
and §9 retracts the false assertion by name instead of quietly editing around it. R1's crashed-session
severity is confirmed in code and now stated at that severity in both documents. The tamper twin
travels the production `select` arm and I re-reproduced the binary's response against it. The one new
behaviour is clean, and the two call sites it depends on already hold what it needs.

Three non-blocking notes carry forward — **N-B1** (say where "already stored" comes from, or a builder
may reach across the ownership seam for it), **N-B2** (the AC-1 component row's boolean clause is the
one exception to §11's independence claim), and **N-B4** (the break-test is a one-time demonstration,
not the standing gate governance rules get) — plus **N-B3** for the founder's pricing of §11. None
changes the verdict.

---
---

# THIRD PASS — the amendment extension (all five harnesses)

**Reviewed:** `architecture.md` (685 → 873 lines) and `feasibility.md` (281 → 379) against the plan's
**Amendment — 2026-08-25** and its three added ACs (A1, A2, A3).
**Method:** I re-ran the per-harness probes myself against the same installed binaries and live APIs
rather than reading the transcripts. Every negative was confirmed by reading the artifact, not by a
"no matches". The type coupling was re-compiled across all three carrier spellings.

**Verdict: ONE BLOCKING finding — codex's "no enumerable model surface, verified four ways" is false;
the file that falsifies it sits in `~/.codex` and predicts all four of the architect's own probe
results. Everything else in the extension verifies, and two findings are stronger than claimed.**

---

## BLOCKING

### B-C1 — `~/.codex/models_cache.json` is an enumerable, account-correct model list. The four-way negative that justifies the hardcoded constant does not hold.

`architecture.md` §3.7 opens with the claim the whole codex decision rests on:

> *"**There is no enumerable surface. Verified four ways** … nothing model-shaped anywhere in
> `~/.codex`, including its 165 KB global-state file … **So a hardcoded list is genuinely the only
> option**."*

and `feasibility.md` §2.2 dismisses the one lead it found:

> *"there is a models manager, and **its cache is not readable as a list**."*

I read the directory rather than grepping one file in it:

```
$ ls -la ~/.codex/models_cache.json
-rw-r--r--  194063  Aug 25 21:35  /Users/tg/.codex/models_cache.json
```

It parses cleanly with `json.load` on the first attempt, and it is exactly a model list:

```
fetched_at: 2026-08-25T19:37:56Z   client_version: 0.149.0   models: 8

  gpt-5.6-sol          vis=list  api=True  default=low     levels=[low medium high xhigh max ultra]
  gpt-5.6-terra        vis=list  api=True  default=medium  levels=[low medium high xhigh max ultra]
  gpt-5.6-luna         vis=list  api=True  default=medium  levels=[low medium high xhigh max]
  gpt-5.5              vis=list  api=True  default=medium  levels=[low medium high xhigh]
  gpt-5.4              vis=list  api=True  default=medium  levels=[low medium high xhigh]
  gpt-5.4-mini         vis=list  api=True  default=medium  levels=[low medium high xhigh]
  gpt-5.3-codex-spark  vis=list  api=False default=high     levels=[low medium high xhigh]
  codex-auto-review    vis=hide  api=True  default=medium  levels=[low medium high xhigh max]
```

**It predicts all four of the architect's own live probe results, exactly.** §2.3 records one real API
call per id: `gpt-5.4` accepted, `gpt-5.4-mini` accepted, `gpt-5.4-nano` rejected 400, `gpt-5.4-codex`
rejected 400. I grepped the cache for each:

```
gpt-5.4          1        gpt-5.4-nano     0
gpt-5.4-mini     1        gpt-5.4-codex    0
```

Present ⇔ accepted. Absent ⇔ rejected. Four for four.

**Three separate claims fall:**

1. *"nothing model-shaped anywhere in `~/.codex`"* — the probe examined `.codex-global-state.json` and
   generalised to the directory. A file named `models_cache.json` sits beside it. This is precisely the
   "a no-match is not proof of absent" failure the plan amendment legislates against.
2. *"its cache is not readable as a list"* — it is. The `codex doctor` error the document cites
   (`missing field 'base_instructions'`) is a **schema-version** complaint: the file records
   `client_version: 0.149.0` while the installed binary is `0.146.1`. An older client failing to
   deserialise a newer file is not evidence the file has no list in it. Nobody opened it.
3. *"a hardcoded list is genuinely the only option"* — this follows from (1) and (2) and falls with them.

**Why this is blocking rather than a citation error.** It changes what the package should build, on
three axes the architecture itself calls decisive:

- **The account-staleness the document calls unfixable.** §3.7: *"the same constant is simultaneously
  too small for one user and too large for another. **This is not fixable by a better list; it is a
  property of codex**."* The cache is fetched per install with an `etag` — `codex doctor` reports
  `"models etag present": "true"` — and it demonstrably reflects *this* account's permissions. That is
  the exact fix the document declares impossible.
- **It would make codex self-gating.** §10.1's containment argument turns on claude-code being *"the
  only harness whose declaration is a compile-time constant untied to any probe."* Sourced from this
  cache, codex would join opencode and builtin as structurally self-gating.
- **The compile-time choice list is wrong per model.** §3.5 declares codex's seven values
  (`none·minimal·low·medium·high·xhigh·max`) for **every** codex model. The cache publishes
  `supported_reasoning_levels` **per model**, and they disagree: `gpt-5.4` supports four
  (`low·medium·high·xhigh`) — not `none`, not `minimal`, not `max` — while `gpt-5.6-sol` supports six
  including `ultra`, which appears in neither list. So the shipped editor would offer a user `max` on
  `gpt-5.4`, which that model does not list, and would hide `ultra` where it exists. The cache also
  publishes `default_reasoning_level`, which §3.5 says codex does not have.

**In fairness, three things that may still favour a constant** — but they have to be the *stated
reason*, weighed against the file:

- The cache was written by client `0.149.0`, not the installed `0.146.1`; its format is not a contract.
- On a fresh machine it may not exist until codex has run once. That argues for self-gating (absent
  cache ⇒ no models ⇒ no option), which is the pattern already used for opencode and builtin.
- Reading another tool's private cache is a coupling with real drift risk, and `visibility`/
  `supported_in_api` would need filtering (7 of 8 are `list`; `codex-auto-review` is `hide`).

I am not prescribing the answer. The finding is that the negative is false, and AC A3 currently rests
on it. The investigation has to be redone against the file; the conclusion may or may not survive.

**What did hold:** three of the four probes are accurate — no `models` subcommand (`-m, --model` only);
`codex completion zsh` is 211,118 bytes with zero `gpt-5` ids; and `codex doctor --json` reports
`"models etag present": "true"`, `"server model present": "false"` verbatim. (It also reports
`"model": "gpt-5.6-sol"` — the cache's first slug — so even that probe surfaced a live model id.)

---

## Per-harness evidence — re-run, not read

I executed the probes myself. Versions confirmed identical: `claude` 2.1.220, `codex-cli` 0.146.1,
`opencode` 1.18.16, `cursor-agent` 2026.08.11-e8db854.

### `claude-code` — **unchanged and still verified**

`claude --help` shows `--effort <level>` with exactly `(low, medium, high, xhigh, max)`. Under closed
stdin — what the adapter creates — a valid value emits 0 bytes of stderr and `ludicrous` emits the
flag-naming warning enumerating all five. Identical to pass 2. ✓

### `codex` — the option is real; the model list is B-C1

`codex exec --help` has no `--effort`; the surface is `-c key=value`. The option itself is not in
dispute and the API's `invalid_enum_value` enumeration is a legitimate vendor-derived choice list. The
model-list half is B-C1.

### `opencode` — **fully verified, numbers exact**

I parsed `opencode models --verbose` (409,398 bytes) myself:

```
model blobs: 363                with non-empty variants: 146
anthropic/claude-haiku-4.5 : ['high', 'max']                          (2)
anthropic/claude-opus-4.8  : ['low','medium','high','xhigh','max']    (5)
z-ai/glm-4.7-flash         : []                                       (0 — the locked test model)
~openai/gpt-latest         : ['none','low','medium','high','xhigh','max']
```

363 and 146 are exact. Per-model divergence is real, and the locked model genuinely publishes nothing —
so that lane's limitation is a property of the founder-set model, not a dodge. `--variant` and
`--thinking` exist as quoted. ✓

*(One immaterial drift: the doc's sample variant payload shows `{"reasoning":{"max_tokens":16000}}`; the
blob I sampled shows `{"reasoningEffort":"low"}`. Both are real provider config, which is the claim.
Provider-specific shape, not an error.)*

**Is a harness with no tamper signal honestly handled, or quietly weaker?** Honestly handled, and
labelled as weaker where it is. §8's A1 row states it plainly — *"no tamper signal exists (a bogus
variant is silently ignored — verified), so the lane asserts the zero/non-zero reasoning boundary
instead"* — and feasibility §3 records the negative probe rather than omitting it. The substitute
assertion is genuinely different in kind: `reasoning: 67` vs **exactly `0`** is a structural boundary,
not a magnitude comparison, and the same document explicitly refuses token-delta assertions for claude
and codex on flakiness grounds. So the weaker signal is named, the substitute is a real red/green, and
the limitation is attributed to opencode rather than to the design. That is the right handling.

### `cursor-agent` — **the "declares nothing" finding is genuinely established, and understated**

This was the one flagged as most worth attacking. It survives, and my probes are harder than the
document's.

- `--list-models` → **204 ids**, exact. Effort and speed are baked into identity:
  `claude-opus-4-8-low/-medium/-high/-xhigh/-max` and `-fast` twins, `claude-opus-5-thinking-high`, etc.
- The word **"Parameterized" appears exactly once** in the whole output — in the trailing tip, as one
  example string. Confirmed by count. No entry is marked parameterized; no schema is published.
- **The decisive probe, which the document does not make:** I ran the tip's *own advertised example*,
  verbatim.

```
$ cursor-agent -p --print --model 'claude-opus-4-8[context=1m,effort=high,fast=false]' --trust "say ok"
Cannot use this model: claude-opus-4-8[context=1m,effort=high,fast=false]. Available models: auto, …

$ cursor-agent -p --print --model 'claude-opus-4-8' --trust "say ok"
ok
```

The binary rejects the exact string its own help text advertises, while the bare base id works. So the
bracket-override surface is not merely non-enumerable and not merely rejected on the locked model — **it
is non-functional on this binary**. The architecture's probe A (`auto[ludicrous=yes]`) reproduces
exactly as recorded.

**Under-investigation dressed as a finding? No — the opposite.** The three recorded probes are real, and
a fourth that nobody ran makes the conclusion stronger. AC A2 is satisfied with evidence. ✓

*(Two asides. The doc's suffix counts — 29 `-high`, 25 `-low` — do not reproduce under a substring count
(47/39/36/30/70); the counting method is unstated. The claim they support, that effort is model
identity, is verified either way. And §3.7's aside that cursor-agent's `--list-models` *"would be a
better source than codex's hardcoded constant"* is itself imprecise: `claude-opus-4-8` is accepted but
is **not** in `--list-models`, so that list is incomplete too. Out of scope, but the aside overstates.)*

### `builtin` — **verified live, byte-for-byte**

```
$ curl -sS https://openrouter.ai/api/v1/models   → http=200  bytes=688668  models=418
reasoning_effort: 143     max_tokens: 407     temperature: 331

deepseek/deepseek-v4-flash (the locked model):
  supported_parameters: [… "reasoning", "reasoning_effort", …]   (22 total)
  reasoning: {"mandatory": false, "supported_efforts": ["xhigh","high"], "default_effort": "high"}
```

**688668 bytes is byte-identical to the transcript** — strong evidence this probe was genuinely run and
not reconstructed. 418 models, 143 with `reasoning_effort`, and the locked model's block matches the
quotation exactly, including `default_effort: "high"`. 140 models publish `supported_efforts`. ✓

**Is "one parameter of ~25" a coherent line?** Yes, and it is applied consistently rather than ad hoc.
The declared parameter is the one concept all four harnesses independently expose — `--effort`,
`model_reasoning_effort`, `--variant`, `reasoning_effort` — *how hard the model thinks*. What is
excluded falls into three coherent buckets: sampling knobs (`seed`, `top_k`, `min_p`,
`repetition_penalty`, `logit_bias`), protocol fields (`tools`, `tool_choice`, `response_format`,
`structured_outputs`, `max_tokens` — already owned by `llm-client`'s own body), and display toggles
(`include_reasoning`). The last bucket is the test of consistency: opencode's `--thinking` was excluded
on exactly the same "changes output, not how it runs" ground. Same rule, both harnesses.

**Does anything excluded obviously belong?** One candidate: **`temperature`**, on 331 models — more than
twice as common as `reasoning_effort`. A founder could reasonably want it, and it is arguably "the
settings this agent runs with" rather than a tuning knob. It is defensible to exclude (sampling
randomness is a different category from reasoning depth, and no other harness exposes it) — but
`feasibility.md` §5's list of what was set aside names `seed, logit_bias, min_p, top_k,
repetition_penalty, stop` and **not `temperature`**, which is the omission a founder is most likely to
ask about. Small completeness gap in the very list that exists for visibility (**N-C4**).

The judgement is flagged as the founder's to overturn, in both documents. Correct handling.

---

## The three contract changes

### 1. The walk became model-keyed · **sound, and the data is real**

The earlier document refused to thread a model parameter *"for a distinction with no data behind it"*.
That refusal was right **when only `claude-code` declared** — `--effort` is per-invocation. The
amendment created the data, and I measured it: opencode's lists genuinely differ per model (2 / 5 / 0
across three models I checked), and OpenRouter publishes `supported_efforts` per model on 140 models.
The reversal is explicit rather than quiet — *"An earlier draft asserted the whole declaration was a
static constant. That was true when only `claude-code` declared; the amendment's four-harness scope
makes it false, and this rule replaces it."* Reversing a documented refusal when the facts change, and
saying so, is the right behaviour. ✓

### 2. Three carrier spellings · **coupling re-compiled RED across all three**

I rebuilt the pass-2 experiment with the `ModelOptionCarrier` discriminated union and one declaration
per harness, through this repo's `tsc`:

| Case | Result |
|---|---|
| all three carriers correct | **GREEN** |
| `flag` harness: declared option, no carrier entry | **RED** `TS2741` |
| `config-override` harness: carrier for an undeclared key | **RED** `TS2353` |
| `request-field` harness: declared option, no carrier entry | **RED** `TS2741` |
| `config-override` carrier missing its `key` field | **RED** `TS2322` |

Both directions still fire, per harness, across all three spellings. The union also buys a **third**
guarantee the document does not claim: a carrier whose shape does not match its own `kind` is a compile
error. §3.5's warning that four declarations means four chances to spell the coupling away, and §7 step
2's requirement to record RED *once per declaring harness*, are the right response. ✓

### 3. The absence rule · **it does close the offline-wipe class at the run path, and introduces no third variant — but the table and the prose disagree on one case**

The rule is binary and that is what makes it safe: **option identity, control kind and carrier are
compile-time for all four harnesses; a choice list is enforced only when it is itself compile-time; a
probe-derived list is not enforced.** Under that reading no probe outcome — failed, empty, missing, or
shrunken — can ever drop a configured value. The class of defect I originally caught at the write path
is closed at the run path, not relocated. There is no third mode. ✓

The premise is the one I verified in pass 1 and re-verified here: `harness-discovery.ts:673, 712` return
`[]` on any non-ok response and `:440-443, :494-497` degrade to `models = []` on any throw, so an empty
list is indistinguishable from "genuinely none".

**The gap (N-C1).** §3.3e's table enumerates five conditions. A `select` whose choice list is
**probe-derived, non-empty, and does not contain the stored value** matches none of them: row 4 requires
compile-time, row 5 requires empty-or-missing. The prose answers it (*"enforced only when it is itself a
compile-time constant"* ⇒ pass), and that answer is the safe and consistent one — but row 5's wording
(*"probe-derived and empty or missing"*) implies non-empty probe lists **are** enforced, which is the
opposite. The case is reachable: opencode's `claude-haiku-4.5` publishes `['high','max']` today; if it
later publishes `['high']`, a stored `max` lands exactly here. A builder needs one answer, and the two
sources give different ones.

**Two downstream statements are stale against the new rule (N-C2).** §8's AC-2 reconciliation row still
reads *"a `select` value not among `choices` emits nothing"*, unqualified — true only for compile-time
lists now. §5's failure table row 1 says *"the walk drops an invalid value"*, same problem. §7 step 3
states it correctly (*"a value contradicting a **compile-time** choice list (dropped), a value with an
**empty probe-derived** list (passed — the absence rule)"*), so the ordered task is right and the
evidence row contradicts it.

---

## The opencode re-engage catch · **verified, and it is a genuinely good find**

`cli-harness-adapter.ts:825-829`:

```ts
const runArgs: string[] = ["run", forceMsg, "--format", "json", "--pure"];
if (session.reEngageResolvedModel) { runArgs.push("--model", session.reEngageResolvedModel); }
finalReEngageArgs = runArgs;
```

Built from scratch, exactly as claimed. Anything appended to `finalArgs` in `startSession` is lost on
re-engage, so a forced opencode turn would silently run without its configured variant. opencode is the
only harness on this channel (`:345`, `if (binary === "opencode") return "process-reengage"`). The
proposed fix follows an idiom already in the file — `reEngageResolvedModel` is stashed on the session at
`:612` for exactly this reason. This is a real defect, invisible from the `startSession` code, that
would have shipped silently. ✓

## The old-CLI risk did not multiply · **verified, including the live half**

- **codex is safe by a verified property.** `rg -a "strict-config"` across `layers/` and `framework/`
  production code returns **zero hits** — production args genuinely do not use it. And live:
  ```
  $ codex exec --skip-git-repo-check --json -c model_reasoning_effortz="high" -m gpt-5.4-mini "…"
  {"type":"item.completed","item":{"type":"agent_message","text":"ok"}}
  {"type":"turn.completed", …}
  ```
  An unknown `-c` key with no `--strict-config` is silently ignored and the turn completes. ✓
- **opencode and builtin self-gate structurally** — I confirmed both declaration sources are the
  harness's own catalogue (`opencode models --verbose`'s `variants`, OpenRouter's
  `supported_parameters`), so a binary or model lacking the option declares nothing.
- **cursor-agent declares nothing.**
- **`claude-code` is the only compile-time, probe-untied declaration**, so it remains the only harness
  that can offer a control an old binary crashes on (`cli-harness-adapter.ts:1087-1094`).

The claim that the amendment *isolated* rather than multiplied this risk is correct. **Caveat:** if
B-C1 is resolved by sourcing codex from its cache, codex joins the self-gating group and this residual
narrows further — another reason B-C1 matters.

## Other citations spot-checked

`llm-client.ts:603-608` — `const body: Record<string, unknown> = { model, messages, max_tokens }` then
`body.tools = …`; adding `body.reasoning_effort` is a one-line additive change at exactly that spot ✓.
`parseOpencodeModelJson` (`harness-discovery.ts:123-140`) does hold the parsed blob and write
`options: []`, so reading `parsed.variants` is free ✓. `HARNESS_TEST_MODELS.opencode` is
`openrouter/z-ai/glm-4.7-flash` and `["cursor-agent"]` is `auto` ✓ — both match what the lanes assume.

## Confined-scope check

Everything confirmed in passes 1-2 is intact: §3.1's sole-**production**-writer wording and the four
development-world writers; §3.2's three prohibitions and the narrowed "only values this request
changes"; §3.4's five levels and the reconciles-to-empty assertion; §6's seven items including both
design deliverables; §7 step 8's break-test; §8's AC 1-5 rows; §9's retraction quoting the false
parenthetical in full. §7 gained a step **2b** rather than renumbering — harmless, slightly awkward.
§11 is rewritten from a narrowing proposal into a coverage record, correctly, since the founder settled
it; I verified its central claim that **all four live declarations are `select`**, and that the
`Default (…)` device now has a real production consumer via builtin's `default_effort` (present on the
locked model, verified above).

---

## The two stated gaps — sufficient, and neither undermines an AC

**1. No live OpenRouter round trip carrying `reasoning_effort`** (`OPENROUTER_API_KEY` absent).
**Sufficient.** The *declaration source* is what this package derives from, and I verified it live at
HTTP 200. Acceptance is inferred from OpenRouter publishing the parameter as supported — labelled
`DOC-ONLY / UNVERIFIED-END-TO-END` in both documents rather than blurred. AC A1 for builtin is
discharged by the `requireHarness("builtin")` lane, which gates on exactly that key and hard-fails
without it (`require-harness.ts:78-84, :94`) — so the gap is closed by a lane that cannot skip to green,
not by a promise. No AC is undermined.

**2. Anthropic-direct `output_config.effort` is DOC-ONLY.** **Sufficient, and handled the strongest
possible way: nothing is declared on that path.** The amendment forbids declaring from documentation;
the response was to decline rather than to declare-and-caveat. Models from `fetchAnthropicModels` or
`MODEL_CATALOG` render no option block, which is exactly AC 5's required behaviour. A gap that produces
correct behaviour is not a gap in an AC.

## Equal coverage and the local-only lane

**Equal coverage holds.** `.claude/rules/testing.md:67` demands a `requireHarness(<name>)` lane for all
five; §8 has all five. What differs is each lane's *assertion*, and §8 states the principle rather than
leaving it implicit: a harness that declares an option proves **carry-through** (A1); one that declares
none proves **unchanged invocation** (AC 3). Both can fail. Neither is a fig leaf — and critically, the
assertion is set by what the harness genuinely exposes, which the feasibility evidence now establishes
independently, not by author convenience. The two model-limited lanes (opencode's `variants: {}`) are
attributed to the founder-set model with the *never bump a test model* rule cited, not routed around. ✓

**Local-only status still honestly acknowledged** — §10.6 (*"the harness lane has no CI job. Step 9's
obligation to run it locally is the only thing that makes AC 2's end-to-end proof real"*) and §7 step 9,
matching `testing.md:71`. Nothing is claimed to be gated that is not. ✓ Note this now carries more
weight: four A1 lanes and the codex/cursor-agent findings all live in a lane no CI job runs.

---

## Non-blocking notes

**N-C1** — §3.3e's table has no row for a probe-derived, non-empty choice list that excludes the stored
value; the prose says *pass*, row 5's wording implies *enforce*. Reachable on opencode. One answer needed.

**N-C2** — §8's AC-2 reconciliation row and §5's failure-table row 1 still describe unconditional
dropping on a bad `select` value, contradicting §3.3e's new rule. §7 step 3 has it right.

**N-C3** — feasibility §2.2's probe row states *"zero keys containing 'model'"* for `~/.codex`; a
case-insensitive `rg -a` finds one in `.codex-global-state.json` itself and twenty in
`models_cache.json`. Subsumed by B-C1 but worth separating: the probe as written was narrower than the
claim it supports.

**N-C4** — `temperature` (331 models, more common than `reasoning_effort`'s 143) is absent from
feasibility §5's list of consciously-excluded parameters. It is the exclusion a founder is most likely
to question, and the list exists precisely to make exclusions visible.

**N-C5** — cursor-agent suffix counts (29/25/22/18/15) do not reproduce under a substring count
(47/39/36/30/70) and no counting method is stated. The claim they support is verified independently.

**N-C6** — §3.7's aside that cursor-agent's `--list-models` *"would be a better source"* overstates:
`claude-opus-4-8` is accepted by the binary but absent from that list, so it is incomplete too. Out of
scope; the aside should not imply otherwise.

---

## Third-pass conclusion

The extension is substantially strong work. Four of five harnesses were investigated against real
binaries with numbers I could reproduce exactly — 363/146 for opencode, 418/143 and a byte-identical
688,668-byte response for OpenRouter, 204 ids for cursor-agent. The cursor-agent "declares nothing"
finding survives an attack harder than the one the document ran. The opencode re-engage catch is a real
defect found by reading code nobody had to read. The absence rule is the right answer to a defect class
this package has now been bitten by twice, and it closes it without a third variant. The type coupling
still fires RED in both directions across all three carrier spellings.

The blocker is single and specific: codex's model-list decision rests on a negative that a 194 KB file
in the expected directory falsifies — a file that predicts all four of the architect's own probe
results, publishes the per-model reasoning levels §3.5 says codex does not have, and addresses the
account-staleness §3.7 calls unfixable. Three of the four probes were real; the fourth looked in one
file and concluded about a directory. The investigation needs redoing against that file. The conclusion
may still be a constant — but it has to be chosen, not inherited from a negative that does not hold.

---
---

# FOURTH PASS — closing verification

**Reviewed:** `architecture.md` (873 → 960) and `feasibility.md` (379 → 436) after the codex reversal.
**Method:** I re-ran the file inspection, re-compiled nothing (unchanged since pass 3), re-counted all
twenty OpenRouter parameter frequencies against the live catalogue, and ran my own independent grep for
stale reclassification rather than trusting the producer's self-check.

**Verdict: B-C1 RESOLVED. No open blocker. One stale line the self-check missed — one row in a summary
table, no architectural consequence, but it should be fixed before this reaches the founder. The
evidence plan would prove all five original ACs and all three amendment ACs.**

---

## B-C1 — RESOLVED

The decision is reversed on the merits, not patched. §3.7 is retitled *"decided against the file, not
against a negative"*, opens with the retraction, and — the part that matters most — records **how** the
error was made:

> *"The fourth ran `ls -la ~/.codex/ | head -20` and then a key-walk over `.codex-global-state.json`
> alone — and concluded about the whole directory. `models_cache.json` sorts alphabetically after
> `goals_1.sqlite-wal`, so `head -20` cut it off. **A truncated listing was read as an exhaustive
> one.**"*

That is the actual mechanism, and it generalises — which is why recording it is worth more than the
correction. `feasibility.md` §2.2 carries the same retraction under its own heading (*"Codex **does**
publish a model list — an earlier revision of this document was wrong"*). The `codex doctor` line
previously quoted as corroboration is reclassified from "unreadable" to "version complaint", which is
what it is.

I re-verified the file facts first-hand:

```
selectable (visibility=="list" && supported_in_api==true): 6
  gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.4, gpt-5.4-mini
base_instructions present on any of the 8 models: 0
gpt-5.6-sol: default=low   levels=low medium high xhigh max ultra   (6)
gpt-5.4:     default=medium levels=low medium high xhigh            (4)
  ultra → "Maximum reasoning with automatic task delegation"
```

Six selectable, zero `base_instructions`, the per-model divergence and the verbatim `ultra` description
all confirmed. ✓

**The stated driver (a) is the strongest one and it is correct.** The constant would offer `max` on
`gpt-5.4` (which lists four levels, without it) and hide `ultra` on `gpt-5.6-sol` (which lists it). An
editor that both offers values a model rejects and conceals ones it accepts is wrong on correctness
alone, independently of coupling or staleness. Retiring it on that ground rather than on my finding is
the right basis.

The withdrawal of the old sentence is also explicit: *"The earlier section's claim that per-account
staleness is 'not fixable by a better list; it is a property of codex' **no longer follows** … and that
sentence is withdrawn."*

---

## 1. Is the degradation rule airtight? — **Yes in the sense that matters, with one unspecified case**

**No fallback constant survives anywhere.** I grepped both documents for `hardcoded|hard-coded|fallback|
constant list|readonly constant`. Every hit is either a retraction, an explicit rejection, or an
assertion of absence:

- `§3.7.2` — *"No fallback constant, because a fallback is how a wrong list ships anyway."*
- `§7 step 2b` — *"**Any read or parse failure ⇒ no models, no options** — today's behaviour, never a fallback constant."*
- `§8 A3` — *"each yielding **no models and no options**, never a fallback."*

None crept in. ✓

Walking the half-success paths the coordinator named:

| Path | Outcome | Covered? |
|---|---|---|
| file missing / permissions error | no models, no options | ✓ *"Missing file, unreadable file"*, and an §8 test case |
| bad JSON (incl. a partially-written file mid-refresh) | no models, no options | ✓ *"bad JSON"*, and an §8 test case. Codex writes `.bak` and `.tmp-<uuid>` siblings — I saw both in the directory — so a torn read is unlikely anyway, and the JSON guard catches it regardless |
| parses, but unexpected top-level shape | no models, no options | ✓ *"a shape without the fields above"*, and an §8 test case |
| `models: []` | the two-flag filter yields zero ⇒ no models ⇒ no options | ✓ falls out of the filter; not separately enumerated but cannot half-succeed |
| **one model row missing `supported_reasoning_levels`** | **unspecified** — see N-D2 | ~ |

The last one is the only gap, and it is a gap in the *specification*, not in the safety property: either
the whole file is rejected (silence) or that model publishes with no option while others publish with
theirs. **Both outcomes are safe** — neither invents a value, neither ships a wrong list, and the second
is exactly what AC 5 requires for a model with nothing to configure. But §8's A3 row tests *"a shape
without `supported_reasoning_levels`"* without saying whether that means whole-file or per-row, and a
builder will have to pick. Worth one clause.

**So: silence is genuinely the only failure mode, and no path yields a wrong or invented list.** ✓

## 2. The version-dependence cost — **honestly stated cost, not a reason against**

The producer sharpened this past my finding and the proof holds: the file records
`client_version: 0.149.0`, **zero of the eight models carry `base_instructions`**, and `0.146.1`
requires it — which is exactly why `codex doctor` logs `failed to load models cache`. The installed
binary cannot read its own cache. That is a real and unusually concrete demonstration that the schema
moves.

**It does not undermine reading the file, for a reason the documents could state more directly:** our
parse and codex's parse need *different fields*. We read `slug`, `display_name`, `visibility`,
`supported_in_api`, `supported_reasoning_levels`, `default_reasoning_level`. Codex 0.146.1 fails on
`base_instructions` — a prompt-template field we never touch. "The installed binary cannot read it" is
therefore evidence the schema drifts, not evidence *we* cannot parse it; I parsed it on the first
attempt with a stock JSON loader.

And the asymmetry §3.7.2 rests on is sound: **"A brittle source whose failure mode is silence is safer
than a stable source that is wrong."** I verified both halves independently — the failure mode is
silence (no fallback anywhere, above), and the constant is wrong today, not hypothetically (verified
per-model level lists). A codex upgrade or a fresh login that rewrites the file in a new shape costs the
feature, not correctness: codex stops offering models and options, which is the state the product is in
right now.

**One consequence worth naming for the founder (N-D3):** if a codex upgrade breaks our parse, an agent
that *already has* `reasoning_effort` configured keeps the stored value (nothing prunes), but the
declaration disappears, so the walk never visits the key and nothing is emitted — the agent silently
reverts to codex's default effort. That is the same accepted-at-mvp silence as residual §10.5, reached
by a different route (the declaration vanishing rather than a choice list shrinking). Not a new risk
class; worth being in the residual rather than inferred.

## 3. Reclassification to probe-derived — **complete and consistent, with one exception my grep found**

I grepped both documents for every `compile-time` mention independently. Thirteen hits. Twelve are
correct:

- `§3.5` declarations table — codex now reads *"**per model, probe-derived** from
  `supported_reasoning_levels` in `~/.codex/models_cache.json`"* ✓
- `§3.3e` prose, `§7` steps 2 and 3, `§8` AC-2 row, `§10.1`, `§10.5`, `feasibility` §6 — all correctly
  scope "compile-time" to `claude-code` alone ✓
- `feasibility.md:400`'s `claude-code` row still says "compile-time constant" — **correct**, that is
  still true of claude-code ✓

**The exception — N-D1, and it is the one thing the self-check missed.** `architecture.md:114`, the §2
obligation map, still states AC A3's obligation as:

> *"A3. codex publishes its model list, and its option is reachable and carried through | **a
> verified-ids-only hardcoded list, with its staleness and who-notices stated** | §3.7"*

That is the retired decision, in the one table that exists to say what each AC requires. §3.7 rejects a
hardcoded list explicitly; §7 step 2b and §8's A3 row both carry the new decision correctly, so no
builder following the ordered tasks would build a constant. It is a stale summary row with no
architectural consequence — **but the obligation map is a table a founder is likely to read, and it
currently advertises the decision that was just reversed.** Non-blocking; fix before it ships.

**`claude-code` confirmed as the only one of both kinds.** §10.1 and `feasibility` §6 both now record
codex as self-gating *"twice over"* — the verified `-c` no-op, plus a codex with no cache declaring
nothing — leaving claude-code as the sole compile-time, probe-untied declaration and therefore the sole
harness that can offer a control an old binary crashes on. §10.1 states the direction correctly: *"the
codex decision in §3.7 narrowed the field to it rather than widening it."* ✓

## 4. The §3.3e table — **six rows, complete partition, no gap and no contradiction**

The table now has **six** rows, not four (the two absence rows were split from one). I enumerated the
reachable state space for a key present in the stored map:

| State | Row | Result |
|---|---|---|
| type contradicts the control kind | 3 | dropped |
| control has no choice list (`boolean`/`number`/`text`), value satisfies | 2 | emitted |
| `select`, compile-time list, contains the value | 2 | emitted |
| `select`, compile-time list, excludes the value | 4 | dropped |
| `select`, probe-derived non-empty, contains the value | 2 | emitted |
| `select`, probe-derived non-empty, **excludes** the value | **5** | **dropped** |
| `select`, probe-derived, empty or missing | 6 | passed |

Every reachable state has exactly one row. No gap, no overlap, no contradiction. ✓

**N-C1 is fixed, and fixed in the safer direction than I predicted.** The prose now reads *"A choice
list is enforced **whenever it exists** — whether compile-time … or probe-derived and non-empty. A
present list that excludes a value is a contradiction, and the walk drops on contradictions."* Table and
prose now give the same answer, and the rule is a clean binary: **a positive answer is enforced; absence
never drops.** The offline-wipe property still holds exactly — a probe failure yields `[]`, which is row
6, which passes. No third variant.

**N-C2 is fixed in both places.** §8's AC-2 row now enumerates all six cases explicitly, including *"A
value excluded by a **probe-derived, non-empty** list emits nothing"* and *"**A value whose
probe-derived list is empty or missing emits its pair** — the absence rule, and the one case a naive
implementation gets backwards."* §5's failure table now carries the matching split pair (*"contradicts a
**present** choice list → Dropped"* / *"**empty or missing** (probe failed) → Passed"*). Both agree with
§3.3e. ✓

*(§5's first row still says "the walk drops an invalid value" unqualified, but that row is explicitly
about the `claude` binary, whose list is compile-time and always present — true as written.)*

## 5. `temperature` — **all twenty counts verified exactly, zero mismatches**

I recounted every figure in the excluded-parameters list against the live catalogue I fetched:

```
max_tokens 407 · response_format 361 · tools 348 · tool_choice 342 · structured_outputs 332 ·
temperature 331 · seed 318 · top_p 315 · stop 286 · include_reasoning 285 · reasoning 285 ·
frequency_penalty 221 · presence_penalty 215 · top_k 200 · logprobs 145 · reasoning_effort 143 ·
repetition_penalty 137 · logit_bias 131 · min_p 101 · verbosity 22          → 20/20 exact, 418 models
```

**Does the rationale read coherently to a founder deciding where the line sits?** Yes. It now leads with
the strongest objection instead of burying it — *"`temperature` is the most significant exclusion and it
is named first, because it is on 331 models — more than twice as many as `reasoning_effort` — and it is
the parameter a reader would most expect to see declared"* — and then sorts the exclusions into two
named classes rather than one bucket: model-tuning knobs (`temperature`, `seed`, `top_p`, `top_k`,
`min_p`, penalties, `stop`, `logprobs`) and harness plumbing (`max_tokens`, `tools`, `tool_choice`,
`response_format`, `structured_outputs`, `include_reasoning`). A founder can disagree with where that
line sits, which is the point — the counts are there, the alternative is named first, and the judgement
is flagged as theirs to overturn. **N-C4 closed.** ✓

The positive case is unchanged and still the right one: `reasoning_effort` is declared because it is the
single concept all four harnesses independently expose.

## 6. `Select.hint` — **verified; here is the accurate final list**

Confirmed against the file: every entry in `supported_reasoning_levels` carries a real `description`
(`ultra` → *"Maximum reasoning with automatic task delegation"*, `low` → *"Fast responses with lighter
reasoning"*). §3.5 routes `description` → `helpText` and §3.7.2 repeats it. So `Select.hint` has a
genuine production consumer on codex. ✓

**What genuinely remains unexercised on day one** — the founder's accurate list:

| Still story-only | Why |
|---|---|
| the `number` renderer | no declared `number` option |
| the `text` renderer | no declared `text` option |
| the `boolean` renderer | no declared `boolean` option |
| design §3.4's **two-zone layout** | zone 2 stacks booleans; there are none, so every option lands in zone 1 |
| the boolean **move-back-clears-the-key** storing rule | no declared boolean |
| the **placeholder-precedence** rule | needs a `number`/`text` option |
| design §3.2's `Input` `aria-describedby` fix | needs a **required** option; all four declarations are optional |
| design §3.2's **blocked-Save alert line** | same |

**Now live in production, and correctly moved out of that list:** `Select.hint` (codex `description`),
the `Default (…)` device (codex `default_reasoning_level` **and** builtin `reasoning.default_effort` —
two harnesses, not one), and per-model choice lists (opencode, builtin **and** codex — 2 values on
`claude-haiku-4.5`, 5 on `claude-opus-4.8`, 4 on `gpt-5.4`, 6 on `gpt-5.6-sol`). §11 records all three.

The `boolean`/`number`/`text` **arms of the reconciliation walk** stay whole and are tested with
fabricated declarations — correctly, since the walk is the safety layer that makes an unrenderable
future option harmless. That is not the same thing as the renderers, and §11 keeps the distinction.

---

## Closing verdict on both documents

**No open blocker.**

**Would the evidence plan prove the acceptance criteria?** Taking all eight in turn:

| AC | Proven by | Sound? |
|---|---|---|
| 1 — options persist | 4 service-integration lanes (round trip, **no-prune**, store, populated-DB migration) + component | **Yes.** The no-prune lane is the assertion that would have caught the defect this package was originally bitten by. |
| 2 — options reach the harness | unit (argv) + service (`provisionSession`) + harness red/green | **Yes**, on the tamper twin. The green half is correctly labelled a smoke check that would pass with the carrier deleted. |
| 3 — no options ⇒ unchanged | unit ×3 incl. **reconciles-to-empty**, asserted against the config's own resolved args + service + two real-binary lanes | **Yes**, and it is provable rather than asserted. |
| 4 — no per-message toggles | deletion + a component regression test that renders a descriptor **declaring** options and asserts nothing appears | **Yes.** A runtime assertion that can go red, not a grep. |
| 5 — no options ⇒ no controls | component ×4 empty cases + the ESLint rule extended to `AgentEditor.tsx` and **shown red** | **Yes**, and the lint half turns a present-tense property into a standing one. |
| **A1** — every declaring harness carries through | one harness lane per declaring harness + unit parsers over **real captured** fixtures | **Yes.** Four lanes, each with the strongest signal that harness actually offers — and where none exists (opencode) the substitute is named as weaker rather than dressed up. The codex tamper value (`max` on `gpt-5.4-mini`) is well chosen: real on other codex models, invalid on the locked one, and it travels the production `select` arm. |
| **A2** — a harness exposing none is recorded with evidence | `feasibility.md` §4's three probes + the real-binary unchanged-invocation lane | **Yes** — and stronger than written. My own fourth probe (the tip's own advertised example, rejected verbatim) makes the finding harder than the document claims. |
| **A3** — codex publishes its list, option reachable | unit over a **real captured** `models_cache.json` fixture asserting six selectable models, per-model level counts, `description`→`helpText`, `default_reasoning_level`→`defaultValue`, **plus three degradation cases** + service + harness | **Yes.** The degradation cases are the right half to insist on, and committing a real captured file rather than a hand-written one is the correct instruction — it is the same lesson as the BA1 migration test. |

Both plan constraints are discharged: the declaration⟺carrier coupling is a type-level property I
compiled RED in both directions across all three carrier spellings, now required **once per declaring
harness**; and the unconfigured-agent constraint is structural at five levels with a distinct
reconciles-to-empty assertion.

**The one standing caveat, honestly carried:** four A1 lanes, AC 2's end-to-end proof and AC 3's
real-binary half all live in a lane with **no CI job, by design**. §10.6 and §7 step 9 say so in as many
words, matching `.claude/rules/testing.md:71`. Nothing is claimed to be gated that is not.

**Remaining non-blocking items, all small:** **N-D1** the stale §2 obligation-map row for A3 (fix before
the founder reads it); **N-D2** whether a per-row missing `supported_reasoning_levels` rejects the file
or just that model; **N-D3** the silent revert-to-default when a codex upgrade breaks the parse, worth a
line in §10.5. From the prior passes, **N-C5** (unreproducible cursor-agent suffix counts) and **N-C6**
(the `--list-models`-is-a-better-source aside, which overstates since `claude-opus-4-8` is accepted but
absent from that list) still stand.

**Plainly: this is clean.** The codex reversal was made on the merits, the method error was recorded
rather than quietly corrected, the reclassification is complete bar one summary row, the reconciliation
table now partitions its state space exactly, and every number I could check — twenty OpenRouter
parameter counts, six selectable codex models, zero `base_instructions`, 363/146 opencode, 204
cursor-agent ids, a byte-identical 688,668-byte catalogue response — reproduced first-hand. I have
nothing further to raise.
