# BA3 — Design critique

**Reviewed:** `.pipeline/work/BA3/design/approved.md`
**Against:** `.pipeline/work/BA3/plan.md`, `.claude/rules/frontend.md`, `.claude/rules/design-system.md`,
`.claude/rules/aesthetic-quality.md`, `.claude/rules/visual-regression.md`, `CLAUDE.md`, and the live
design system at `layers/core-ui/src/ds/`.
**Tree:** `claude/pipeline-ba3-bc1ba7` @ `dc8d1cbd7`. Every citation below was opened and read.

---

## 1. Claims re-tested

| Design claim | Verdict | What the code says |
|---|---|---|
| Option vocabulary complete, four control kinds | **True** | `framework/harness-capability/src/harness/harness-capability-descriptor.ts:54-77` — `select`/`boolean`/`number`/`text`, and `HarnessModelOptionDescriptor` carries `key`, `label`, `helpText?`, `control`, `required`, `scope`, `defaultValue?` exactly as described. |
| Options hang off a model, not a harness | **True** | `HarnessModelDescriptor.options`, same file, `:79-87`. |
| No production code has ever declared one | **True** | All five sites confirmed at the exact cited line numbers. *Path in the design is wrong* — they are `layers/agent-execution/harness-registry/src/harness-discovery.ts:100,140,692,731` and `.../harness-capability-descriptors.ts:45`, not under `framework/harness-capability`. |
| Switching harness already resets the model | **True** | `layers/core-ui/src/settings/AgentEditor.tsx:227-238` — `modelId: ""` plus `reconcileModelProvider`. |
| `Input` already owns a `hint` treatment; `Select` has neither hint nor description | **True** | `ds/Input.tsx:45,109-113`; `ds/Select.tsx:21-28` has `label`, `options`, `size`, `placeholder` and nothing else. The additive `hint` prop is the right call. |
| `Toggle` exists, `role="switch"` + `aria-checked` + `description` | **True** | `ds/Toggle.tsx:33,97-111`. |
| A boolean cannot carry a readable tri-state | **True as reasoning** | `ToggleProps.on` is `boolean` with default `false`; there is no indeterminate affordance in the primitive and nothing else in `ds/` provides one. |
| The per-message pill path is already gone | **True** | `HarnessOptionControlKind` exists nowhere on the tree. `deriveComposerPills` survives only in `docs/human-interface-layer/part-model.md` and a comment in `layers/core-ui/src/__tests__/AM3-session-view.test.tsx`. The surviving composer row (`layers/core-ui/src/components/SessionView.tsx:619-641`) renders a model-cycle button and the working/queue chips — no options. |
| `SessionView.stories.tsx` still declares `effort` + `mode` on a dead fixture | **True** | `layers/core-ui/src/components/SessionView.stories.tsx:274-312`. (Design gives no path; the file is under `components/`, not `pages/session/`.) |
| The agent editor is the run-configuration surface | **True** | `AgentEditor.tsx:189-289` is the five-field row; `agent_run_config` at `framework/db/src/schema.ts` holds harness/model/provider/tier/sessions. |
| The empty state produces DOM identical to today | **True by construction** | If nothing renders, nothing changes. Sound. |
| **"No harness-type branching is allowed in a rendered surface — ESLint-enforced"** | **FALSE as stated** | See **B3**. |

---

## BLOCKING

### B1 — The design gives three incompatible answers to "what is stored for an option the user never touched", and AC3 depends on which one is true

- §3 control table, "Value when untouched": `select` → *"`defaultValue` if declared"*; `number`/`text` → *"`defaultValue` if declared"*; `boolean` → *"`defaultValue === true`, else off"*.
- §3.3: *"`defaultValue` pre-fills the control; it is not a placeholder... It is indistinguishable from a value the user chose."*
- §5 "Saving prunes": *"The save writes exactly the option set the selected model declares."*
- §8, AC3 row: *"An untouched optional option contributes no value."*

§3.3 + §5 say the harness's default is pre-filled and then written as an explicit stored value. §8 says an untouched option stores nothing. Both cannot hold. The difference is load-bearing:

- If defaults are written, then opening any agent and pressing Save pins every declared option to whatever the harness's default was at that moment. The agent stops tracking the harness default and silently diverges the next time the harness changes it. An agent the user considers "not configured" is now fully configured, and an option flag is now sent explicitly where today nothing is sent — some CLIs behave differently for an explicitly-passed flag than for an absent one.
- If defaults are not written, then §3.3's justification collapses: the pre-filled value is *not* "the truth of what will run", it is a guess that goes stale, and it is presented as indistinguishable from a chosen value with no way for the user to tell.

**Governing authority:** plan AC *"An agent with no options configured behaves as it did before this change"* and the plan constraint *"An agent with no options configured must run exactly as it does today."* The design cannot show either is satisfied because it has not decided what "no options configured" stores. §8's AC3 row asserts the conclusion rather than deriving it.

### B2 — "Saving prunes" destroys stored option values whenever harness discovery transiently returns less than usual

§5: *"A value stored by an older harness version for an option no longer declared is not shown and is not written back — opening and saving an agent cleans it."*

The design justifies this against a *version change*. But `descriptor.models` is not a stable declaration — it is the output of a live probe, and it degrades to empty on ordinary failure:

- `layers/agent-execution/harness-registry/src/harness-discovery.ts:670-673` and `:707-711` — builtin's model list is a network fetch to `api.anthropic.com` / `openrouter.ai`, and `if (!resp.ok) return [];`. Offline machine, rate limit, 500 → `models: []`.
- Claude-code's list is parsed from CLI output (`:80-101`); a missing or reshaped binary yields `[]`.
- `layers/core-ui/src/settings/SettingsAgents.tsx:184` — `if (harnessesRes.ok)` — a failed `/api/harnesses` leaves `harnesses` as `[]` and still flips status to `"ready"`, so the editor renders with no descriptors at all.

Under the prune rule, a user who is briefly offline, opens an agent to fix a typo in its **name**, and hits Save, silently destroys every stored option value for that agent. Nothing on screen ever mentioned them; §5 explicitly forbids any warning. There is no undo.

**Governing authority:** plan AC *"An agent's configuration can hold the options its harness declares for its model, and they persist."* Persistence that a transient probe result can wipe is not persistence. This is a concrete integrity risk introduced by the design, not a pre-existing one.

### B3 — The design's "binding" sourcing rule is presented as ESLint-enforced on this surface. It is not.

§1 evidence table: *"No harness-type branching is allowed in a rendered surface | `harness-presentation.ts:1-15` — ESLint-enforced, one `builtin` exception"*. §2 then makes the descriptor-only sourcing rule **binding** on the strength of it: *"This is the same rule `harness-presentation.ts` already enforces."*

The actual rule is at `eslint.config.ts:744-772`. Its `files:` list is exactly two entries:

```
"layers/core-ui/src/settings/harness-presentation.ts",
"layers/core-ui/src/settings/SettingsHarnesses.tsx",
```

`AgentEditor.tsx` — the surface this entire design governs — is not covered. Nothing mechanical stops a `harnessType === "claude-code"` special case in the option block. The evidence row generalises a two-file rule into "a rendered surface" and the design's only stated guarantee for AC5 and for the plan's *"Exposing options for harnesses that do not declare any"* exclusion rests on it.

The config block directly above the rule carries this `@lore`: *"A `files:` pattern that matches nothing is a silent no-op, so a dead entry reads as coverage the rule does not have."* The same failure mode applies to a pattern that matches the wrong files.

**Governing authority:** plan AC 5 is unproven by its own cited mechanism. The design *decision* (render purely from the descriptor) is correct and should stand; the claim of existing enforcement must be corrected, or the rule's `files:` list extended to the surface it is claimed to bind.

### B4 — §2 prescribes hand-rolling a section label that a design-system primitive already owns

§2 Copy: *"Section label: `Model options` (sentence-case text, `uppercase` applied in CSS — the treatment the `Filesystems` block already uses at `AgentEditor.tsx:288`)."*

That treatment in `AgentEditor.tsx:310` is a bare `<span className="type-label uppercase text-[var(--text-tertiary)]">`. `layers/core-ui/src/ds/SectionLabel.tsx` is the Tier-1 DS component that owns exactly this — `type-label`, `uppercase`, `text-[var(--text-tertiary)]`, plus a real heading element for the document outline. It is in live use at `AgentProfile.tsx:435,463,481,509,567`, `WorkBet.tsx:994,1350`, `RoutineDetailPane.tsx:407`.

`.claude/rules/frontend.md`: *"Design-system components first... never hand-roll an equivalent of an existing component."*

This also contradicts the design's own §3.1, which argues for the additive `Select` `hint` prop precisely because a hand-rolled copy of a treatment a primitive already owns *"is what the design-system rule calls a CRITICAL finding."* The same standard applied to the section label produces `SectionLabel`, not a copied span. Following the existing violation in `AgentEditor.tsx` propagates it rather than inheriting anything.

---

## NON-BLOCKING DEFECTS

**N1 — §5's justification for silence covers disappearance, not substitution.**
*"The controls are on screen; the user watches the block re-form in the same interaction that caused it."* True when a key vanishes — the control leaves the screen. Not true for the other branch §5 introduces: a key the new model *still declares* whose stored value is no longer valid (`select` value not in the new `choices`, `number` outside the new `min`/`max`) is *"dropped and replaced by that option's `defaultValue`"*. That control stays on screen with the same label and silently flips its value. In a row of several options this is easy to miss entirely. The reasoning does not reach the case.

**N2 — The required-and-empty state's only signal is not announced to screen readers.**
§3.2 makes `Input`'s `error` prop the sole indicator, and §3 routes `helpText` to `Input`'s `hint`. When both are set, `ds/Input.tsx:104` computes
`aria-describedby={hint ? \`${inputId}-hint\` : error ? \`${inputId}-error\` : undefined}`
while the hint span renders only under `hint && !error` (`:109`). So with a `helpText` present, `aria-describedby` points at an element that does not exist and the error span is never referenced. A screen-reader user gets a dead Save button and no announced reason. This is a pre-existing primitive defect, but §3.2 and the `RequiredOptions` story deliverable put it on a reachable path for the first time.

**N3 — Disabled Save carries no announced explanation.** §3.2 disables Save while any required option is empty. `AgentEditor.tsx:353` currently disables only on `saving`. A disabled button is not announced as "blocked because X"; combined with N2 the whole failure is silent on the keyboard/SR path.

**N4 — "identical treatment `Input` uses" needs to mean the aria wiring too.** `Input`'s hint treatment is a `<span id="${id}-hint">` *plus* `aria-describedby` on the control. `Select` has no `aria-describedby` today. If §3.1 is read as visual-only, the select-kind `helpText` will be invisible to screen readers. The design is the spec here and should say so.

**N5 — The stated id convention cannot apply to one of the four kinds.** §3 says *"Control ids follow the editor's existing convention... `edit-option-${agentId}-${key}`"* and that *"`Select` and `Input` already bind `<label htmlFor>` to the id."* `Toggle` (`ds/Toggle.tsx:18-36`) accepts no `id` and wraps its control in a `<label>` with no `htmlFor`. No collision results, but the convention as written is unachievable for boolean options.

**N6 — §10's "visual judgement is inherited, not created" overstates the case.** The `flex gap-[9px] flex-wrap` / `flex-1 min-w-[140px]` idiom is inherited, but it has never carried a `Toggle`. `Select` and `Input` put the label *above* a ~32-36px control; `Toggle` puts the label *beside* a 24px track. Put them in one wrapping row (as the §2 mock does — `[ Effort ▾ ] [ ⬤ Web search ] [ Max thinking tokens ]`) and the labels sit at two different heights and the controls at two more. No existing surface composes them this way — the three files that use `Toggle` (`SettingsWorker.tsx`, `SettingsNotifications.tsx`, `SettingsAgentBehavior.tsx`) all stack toggles vertically. This is a novel composition and the one place a render would actually have settled something.

**N7 — Two words for one device, in the same eye-line.** The model select's empty choice reads **"System default"** (`model-options-for-harness.ts`, `defaultOption`). §3.2 proposes **"Harness default"** for the option selects directly beneath it. Same meaning, adjacent controls, different noun.

**N8 — §4's case list is incomplete and case 3 is mislabelled.** *"Harness declares no models at all (codex)"* is not the only way `models` is empty — see B2's evidence. In that state the editor already renders *"This harness manages its own model selection."*, which is false for builtin, and the option block adds a second thing that renders nothing. A fourth case belongs in §4: the harness list failed to load. (During genuine loading the editor is behind `SkeletonList` at `SettingsAgents.tsx:428`, so there is no half-loaded editor — the ambiguity is a *failed* fetch, not a slow one.)

**N9 — `NoModelOptions` is a deliverable that adds no state.** §9 concedes it: *"Today's `NormalAgent` already covers this; make one story name it."* A story that renders a tree identical to an existing story is a rename, not an artifact.

**N10 — Citation coordinates drift by 2-6 lines throughout.** The *content* of every citation checked out; the line numbers do not. Field row is `189-289` (cited 184-282); harness reset `227-238` (cited 225-240); model affordance prose `259-266` (cited 255-262); `edit-model-${agentId}` at `248` (cited 246); Filesystems label at `310` (cited 288); action row `349-356` (cited 340-350). Plus the wrong package path for the two harness-registry files (see §1 table). Downstream phases read these as addresses.

---

## Answers to the four questions asked

**Q1 — Does "render absolutely nothing" satisfy AC5?**
Yes. AC5 and validation scenario 3 both say it in as many words: *"they see no option controls rather than an empty one."* The three rejected alternatives (disabled section, "0 options" count, collapsed `Fold`, `EmptyState`) are correctly rejected, and the project rule against inventing empty states supports it. The "cannot tell not-yet-loaded from no-options" worry does **not** land as a design defect: the editor never renders during loading (`SettingsAgents.tsx:428` returns `SkeletonList`). It lands only for a *failed* harness fetch, and there the Model field already lies before BA3 touches anything (`SettingsAgents.tsx:184` swallows `!ok`). That is a pre-existing hole, reported as **N8** for §4's completeness, not as a reason to render something. Rendering nothing is right.

**Q2 — Is the silent drop on model switch defensible?**
Partly. Dropping a key that disappears from the screen in the same interaction is defensible and the "no banner about something you can see" argument is sound. Two things are not covered: the silent *value substitution* branch (**N1**), and the prune-on-save path, which loses work with no visual cue at all and on a trigger the user never connected to options (**B2**). The first is a gap in the reasoning; the second is blocking.

**Q3 — Does a required option with no default create an inescapable state?**
No — it is escapable. The user can type a value, pick a different model, or Cancel. But it is a *hijack*: an agent whose model later declares a required option with no default cannot have its **name** changed without first answering a question about an option the user never asked for. And on the keyboard/screen-reader path the block is effectively unexplained (**N2**, **N3**). Note that the design itself concedes in O-3 that this branch may be unreachable — no harness declares any option yet. Given a plan tier of `mvp` and a pre-build note of *"light design"*, the validation rule, the error string, the Save block and the third story deliverable are speculative machinery for a case nobody can show exists. I would not block on it, but it is the first thing to cut if architecture's first real declaration carries a default.

**Q4 — Is anything here per-message or per-run configuration in disguise?**
Nothing the design *adds*. The single surface is the agent editor, saved by the existing Save, and §7 provides no affordance that could grow into a per-run override. Two adjacent items are handled correctly rather than hidden:
- `HarnessModelOptionDescriptor.scope: "launch" | "durable"` (`harness-capability-descriptor.ts:75`) is genuinely per-run rubble. §6 refuses to group/sort/badge on it and recommends architecture delete it — right call.
- The composer model-cycle pill (`SessionView.tsx:621-628`) **is** the same "decide per message what you meant to configure once" shape, applied to the model. The plan puts model choice out of scope, so leaving it alone is correct, and raising it as founder question O-2 rather than settling it by inference is exactly right.

---

## What is right

The core decision is sound and I would not change it: options are a section of the agent editor, directly beneath the control row that produces them, above the System prompt, rendered as a pure function of the descriptor, absent when the descriptor is silent. The three-reason argument for the placement holds up against the file. The additive `Select` `hint` prop is correctly diagnosed and correctly scoped. The empty state is right and its rejected alternatives are the right rejections. The refusal to build reset-to-default, folding, search, badges or a required-marker convention is proportionate to an `mvp` tier. §6's separation of "already true" from "this package's cleanup" is honest, and the three stale doc statements it names all check out. O-1, O-2 and O-3 are each raised at the right altitude — as founder or architecture calls, not resolved by inference.

The blocking findings are four: an unresolved contradiction about what an untouched option stores (**B1**), a save-time prune that destroys user data on transient discovery failure (**B2**), a claimed lint enforcement that does not cover this surface (**B3**), and a prescribed hand-roll of an existing DS primitive (**B4**). None of them require rethinking the decision in §2.

---
---

# SECOND PASS — verification of revision 2

**Reviewed:** `.pipeline/work/BA3/design/approved.md` (revision 2), re-read in full.
**Method:** every changed claim re-tested against the tree at `claude/pipeline-ba3-bc1ba7` @ `dc8d1cbd7`.
The first pass above is left intact.

**Verdict: all four blockers RESOLVED. No new blocking defect. Six new non-blocking defects.**

---

## Per-blocker verdicts

### B1 — store-what contradiction · **RESOLVED**

§3.3 now states one rule and the doc holds it everywhere I checked:

> *"An option the user never touched stores nothing. `defaultValue` is displayed so the user can see what will happen if they leave it alone; it is never written into the agent's configuration."*

The source of the revision-1 contradiction is gone at the root: the §3 control table's **"Value when untouched" column has been deleted** and replaced with a "Zone" column, so the table no longer competes with §3.3. I traced every remaining place the doc says what Save writes:

| Location | Says | Consistent? |
|---|---|---|
| §3.2 | optional `number`/`text` empty "stores nothing"; required select "always stores" | yes |
| §3.3 | the rule + per-kind display/store split | yes |
| §4 | "the editor never writes a key it did not render" | yes |
| §5.1 | "added, changed, or cleared per §3.3" | yes |
| §5.3 | invalid value "clears to its unset state... an unset control stores nothing" | yes |
| §8 AC3 row | derives from §3.3, names the rejected alternative and why it fails the AC twice | yes |

The AC3 row is now a derivation, not an assertion — it walks from "every model declares `options: []` today" to "an unconfigured agent has an empty option set" to "the harness is handed nothing". The reasoning for choosing this branch is also correct on the facts: today nothing is sent, and storing a default would both send an explicit flag where none is sent and pin the agent to a stale default.

One imprecision survives inside §3.3 — see **P2-1**. It does not restore the contradiction; the per-kind bullets are unambiguous.

### B2 — save-time prune destroying values on a transient probe failure · **RESOLVED**

The prune is deleted. §5.1 replaces it with:

> *"The editor only writes keys it actually rendered. Values for keys it did not show — because the model declared none, because the probe came back empty, because the harness list failed to load — are carried through untouched."*

I re-walked the exact path I found in pass 1. Offline → `harness-discovery.ts:672` and `:711` return `[]` on a non-ok fetch (**verified: both lines are `if (!resp.ok) return [];`**) → `models: []` → no option block renders → the stored keys are not in the rendered set → Save carries them through. The path is closed. Same for `SettingsAgents.tsx:184` (**verified: `if (harnessesRes.ok)`**), which leaves `harnesses` as `[]` while status still flips to ready.

**The handoff is real, not a gesture.** It is stated in two independent places with the reason attached:
- §5.1: *"That check belongs at run time, where the live declaration is actually known, not in a form that cannot tell silence from a failed request. Architecture owns it."*
- §7 out-of-scope: *"...and the run-time filter that drops keys the harness no longer declares (§5.1)."*

That is unambiguous, names the owner, and names the mechanism. I also checked the rule is implementable without new state: "rendered" is a pure function of the currently selected descriptor's `options`, and §5.2's "was on screen for the previous model" is available at the moment of the switch. No memory of rendered-ness is required.

Two consequences the design accepts explicitly and I agree are acceptable: stored keys can accumulate from harnesses an agent no longer uses (§5.1 calls them harmless and never-sent), and a user cannot clear a key they cannot see. Both are strictly better than losing a value the user set.

### B3 — false ESLint-enforcement claim · **RESOLVED, and the correction is true**

**Verified `eslint.config.ts:744-751` — the `files:` list is exactly:**
```
"layers/core-ui/src/settings/harness-presentation.ts",
"layers/core-ui/src/settings/SettingsHarnesses.tsx",
```
`AgentEditor.tsx` is not in it. The revision now says precisely this, in two places (§1 evidence row and §2.1), and explicitly marks the revision-1 claim as false.

The deliverable is stated as **work, not as an existing fact**: *"**Deliverable (explicit, in scope):** add `layers/core-ui/src/settings/AgentEditor.tsx` to that rule's `files:` list."* §8's AC5 row is consistent — *"§2.1's lint deliverable is what makes this provable rather than promised"*, future tense, conditional on the work landing.

The builder note also checks out: **`AgentEditor.tsx` contains exactly one occurrence of `codex`, at line 27, inside a docblock** (`* (e.g. codex) — the affordance text replaces the select in that case`). The rule's selector targets `Literal` nodes, so the file is clean today and adding it will not produce a pre-existing failure. The design correctly tells the builder to confirm by running lint rather than trusting the analysis.

One thing the design quotes selectively — see **P2-2**.

### B4 — hand-rolled section label · **RESOLVED, and the scope exclusion is defensible**

§2 now specifies `<SectionLabel label="Model options" />` at default `h3`, names the revision-1 instruction as wrong, and cites the rule it violated. **Verified `ds/SectionLabel.tsx:28-42`/`:44-70`** and the live usage — I spot-checked `WorkTeam.tsx:410,442,510`, `WorkTask.tsx:304,341`, `KnowledgeDetail.tsx:391,1086`, `SettingsConnections.tsx:334`; all are real `<SectionLabel` call sites.

The heading level is right. **Verified `SettingsPage.tsx:36-38`** — the Settings page's group headings are `<h2 className="type-label uppercase text-[var(--text-tertiary)]">`, so an `h3` inside an agent card nests correctly.

**The exclusion of the Filesystems span is defensible.** The BA track rule is that a package cleans up *its own feature's* rubble. `AgentEditor.tsx:310` belongs to the filesystem-injection feature, not to per-model options; fixing it is adjacent cleanup, which by my own standard in pass 1 cannot be required of this package. The design puts it in §7 with a stated reason rather than leaving it silent. Correct call.

---

## Non-blocking defects introduced or surviving in revision 2

**P2-1 — §3.3's "unifying sentence" contradicts its own required-option bullet, and it is the sentence architecture is told to implement against.**
The bullet reads *"`select` / `number` / `text` (required). Always stores"*, and §3.2 adds that a required select *"resolves to `defaultValue`... and it always stores."* Two lines later:
> *"The unifying sentence, which architecture should implement against: **a control sitting at its default state contributes no key**; a control away from its default contributes its value."*
A required select sitting at its `defaultValue` is a control at its default state that **does** contribute a key. A builder who lifts the designated sentence gets required options wrong. The bullets are unambiguous and win on specificity, so this is precision, not a restored contradiction — but the sentence needs the required carve-out it currently omits.

**P2-2 — §2.1 quotes the doc line with the false part trimmed off.**
`docs/agent-layer/harness-capability-descriptor.md:227` reads in full: *"Not backend-specific UI branching. UI controls render from option descriptors — no `harnessType` checks **(ESLint-enforced, single `"builtin"` exception)**."* §2.1 quotes only the first clause and calls the contract *"documented"*. The parenthetical it drops is the same false enforcement claim B3 existed to remove — the doc asserts it repo-wide, and §6 already treats stale doc statements as this package's cleanup. Either the doc line joins §6's list or §2.1 should say the doc overstates it too.

**P2-3 — the `Default (Medium)` leading choice can be built as an unselectable option.**
`ds/Select.tsx:26-27` already has a `placeholder` prop, and `:85-89` renders it as `<option value="" **disabled**>`. §3.2/§3.3 ask for a leading `value=""` choice the user must be able to *select back to* in order to unset an option. A builder reaching for `placeholder` gets a disabled option and the unset state becomes unreachable. The design should say the leading choice is a real entry in the `options` array, the way `model-options-for-harness.ts` does it.

**P2-4 — N7 is only half fixed; two spellings of "let it decide" still sit in the same eye-line.**
The model select's empty choice reads **"System default"** (`model-options-for-harness.ts`, `defaultOption`). The option selects directly beneath now read **"Default"** / **"Default (Medium)"**. Revision 2 removed "Harness default" but did not converge on the neighbour's wording. The `Default (…)` parenthetical is itself a new copy pattern in this repo — no existing surface uses it. It is well argued (§3.3's two-ways-to-medium paragraph is honest about the ambiguity it creates and why the parenthetical resolves it), so this is a consistency note, not an objection to the pattern.

**P2-5 — §3.2's blocked-Save message is routed into a region the editor does not own.**
*"The blocked reason goes in the alert region that already exists. `AgentEditor.tsx:341-346` is a `<p role="alert">`."* That region renders `{error && ...}` where `error` is a **prop** (`AgentEditorProps.error`, `:80` — *"Inline error (from 422 or save failure)"*) supplied by `SettingsAgents`. The editor cannot write into it without either OR-ing a locally computed message with the prop — which changes what the region means — or gaining a new prop. The design presents this as free reuse of what is already there. It also leaves precedence unspecified: what shows when a 422 error and a blocked-required state coexist.

**P2-6 — §3.3's boolean bullet defines "default position" circularly, and drops revision 1's explicit answer on required booleans.**
The bullet says the displayed position is *"stored value if present, else `defaultValue`, else off"*, then says the key is written *"once the user moves the toggle away from **that** default position"*. Read literally, the position is derived from the stored value, so the toggle is always at its position and never stores. The intended anchor is plainly `defaultValue ?? false`, but the sentence does not say so. Separately, revision 1 stated *"`required` changes nothing for a boolean"*; that line is gone, §3.3's required bullet lists only `select`/`number`/`text`, and §3.2 now redirects to §3.3 for what a boolean stores. The answer is recoverable from §3.2's *"Required `number`/`text` with no `defaultValue` is the only case that can be left empty"*, but only indirectly. One clause restores it.

**P2-7 (cosmetic) — two section headings in the same card will now have different spacing beneath them.**
`SectionLabel` bakes in `mb-[9px]` (`ds/SectionLabel.tsx:53`); the Filesystems block, excluded from scope per B4, uses `flex flex-col gap-[6px]` (`AgentEditor.tsx:309`). Both values are on the Hearth grid, so no rule is broken — the two headings will simply not match. A direct consequence of the (correct) decision not to touch the neighbour.

---

## Non-blocking items from pass 1: status

| Pass-1 item | Status |
|---|---|
| N1 silent value substitution on model switch | **Fixed.** §5.3 now clears to unset rather than substituting, with the reason stated (*"a control that has visibly gone back to 'Default' reads as not set at a glance"*), and it makes the behaviour consistent with §3.3. |
| N2 `Input` `aria-describedby` dead id | **Fixed as a named deliverable.** §3.2 quotes `ds/Input.tsx:104` and `:109` correctly and specifies the reorder `error ? error-id : hint ? hint-id : undefined`. **Verified: `:104` is `aria-describedby={hint ? ... : error ? ... : undefined}` and `:109` is `{hint && !error && (`.** |
| N3 blocked Save unannounced | **Addressed**, with the caveat at P2-5. |
| N4 `Select` `hint` must carry the aria wiring | **Fixed.** §3.1 says so explicitly and gives the reason. |
| N5 `Toggle` id convention | **Fixed.** §3 exempts it and instructs the builder not to add an `id` prop. **Verified `ds/Toggle.tsx:18-36`** — no `id` in `ToggleProps`; **`:59-61`** — `role="switch"` / `aria-checked` / `aria-label`. |
| N6 Toggle-in-a-field-row alignment | **Fixed by §3.4's two zones**, with the trade stated plainly. **Verified all three cited stacking precedents**: `SettingsWorker.tsx:156` (`flex flex-col gap-[18px]`), `SettingsNotifications.tsx:52-58` (mapped column), `SettingsAgentBehavior.tsx:354-359`. |
| N7 "Harness default" wording | **Partially** — see P2-4. |
| N8 §4 case list | **Fixed.** Four cases; case 3 corrected off codex and onto the live probe; case 4 added; the *"cannot distinguish 'no options' from 'we could not ask'"* limitation is named and correctly shown to be harmless under §5.1. |
| N9 `NoModelOptions` story | **Fixed.** Dropped, with the reason. **Verified: `AgentEditor.stories.tsx:163` `export const NormalAgent`, whose builtin descriptor's two models both carry `options: []` (`:40`, `:49`)** — so the claim that it already is the empty-state artifact is true. |
| N10 citation drift | **Fixed.** I re-opened every `AgentEditor.tsx` cite in revision 2 — `188`, `189-289`, `138-144`, `227-238`, `236`, `248`, `259-266`, `292`, `307-339`, `310`, `341-346`, `348-356`, `353` — all land on what the doc says they land on. Both harness-registry paths are corrected to `layers/agent-execution/harness-registry/src/`. Descriptor cites `:54`, `:59-68`, `:70-78`, `:76`, `:80-88` all verified. `ds/Select.tsx:79-81`, `ds/Input.tsx:83`, `ds/Toggle.tsx:59-61` all verified. |

§10's "inherited" claim is also corrected: it now names the two-zone Toggle/Select block as the one genuinely novel composition, says the decision was made from the file rather than from a render, and points the founder review at the `AllControlKinds` frame as the only place a render could still change something. That is the honest description.

## Second-pass conclusion

The four blockers are genuinely closed against the code, not just re-worded. B2's fix is the strongest of the four — it converts a data-loss path into a carry-through rule and hands the residual problem to the layer that can actually solve it, in writing. B3's correction is now true and its deliverable is stated as work. B1's single rule holds across all six places the doc talks about storage. B4 uses the right primitive and declines the neighbour's rubble for the right reason.

Nothing here should block the next phase. P2-1 and P2-6 are the two worth fixing before a builder reads this, because both are sentences a builder will implement literally.
