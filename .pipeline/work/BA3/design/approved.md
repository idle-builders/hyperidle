# BA3 — Approved design

**Work package:** `.pipeline/work/BA3/plan.md` — "How an agent's model runs is part of configuring that
agent". Tier: `mvp`. Pre-build note in the plan: *light design*.

**Scope of this document.** What a person sees and does in the agent editor. No production code, no
tests, no architecture. Storage shape, the adapter contract and the pass-through are architecture's —
but §3.3 and §5 below fix the *user-facing* contract those must implement, and architecture is bound
by it.

**Revision 2** — repairs the four blocking findings in `.pipeline/work/BA3/design-critique.md`
(B1 store-what, B2 save-time prune, B3 false lint claim, B4 hand-rolled section label) and the ten
non-blocking defects. The core decision in §2 is unchanged; the reviewer re-tested it against all
four and it survived. Every line citation below was re-opened and re-counted at
`claude/pipeline-ba3-bc1ba7` @ `dc8d1cbd7`.

---

## 1. What was verified before deciding

| Fact | Evidence |
|---|---|
| The option vocabulary already exists and is complete | `framework/harness-capability/src/harness/harness-capability-descriptor.ts:54-78` — `HarnessOptionChoice` (`:54`), `HarnessModelOptionControl` (`:59-68`: `select` / `boolean` / `number` / `text`), `HarnessModelOptionDescriptor` (`:70-78`: `key`, `label`, `helpText?`, `control`, `required`, `scope` at `:76`, `defaultValue?`) |
| Options hang off a **model**, not a harness | `HarnessModelDescriptor.options` — same file, `:80-88` (`:87`) |
| No production code has ever declared one | every construction writes `options: []` — `layers/agent-execution/harness-registry/src/harness-capability-descriptors.ts:45` and `layers/agent-execution/harness-registry/src/harness-discovery.ts:100,140,692,731` |
| The agent editor is the run-configuration surface | `layers/core-ui/src/settings/AgentEditor.tsx:189-289` — Name, Role, Harness, Model, Max Sessions in one wrapping row; System prompt from `:292`; Filesystems `:307-339`; inline 422 alert `:341-346`; actions `:348-356` |
| The descriptor lookup already exists in the component | `AgentEditor.tsx:138-144` — `selectedDescriptor = harnesses.find(h => h.type === draft.harnessType)`, then `modelOptionsForHarness` |
| Switching harness already resets the model | `AgentEditor.tsx:227-238` — `modelId: ""` at `:236`, plus `reconcileModelProvider` |
| A harness with no discovered models already renders prose, not an empty select | `AgentEditor.tsx:259-266` — "This harness manages its own model selection." |
| Run configuration persists per agent | `framework/db/src/schema.ts:115-125` — `agent_run_config` (`harness_type`, `model_id`, `model_provider`, `model_tier_preference`, `max_concurrent_sessions`) |
| **`descriptor.models` is a live probe result that degrades to `[]` on ordinary failure** | `harness-discovery.ts:672` and `:711` — `if (!resp.ok) return [];` on network fetches to `api.anthropic.com` / `openrouter.ai`; CLI list parsed from binary output at `:80-101`. And `layers/core-ui/src/settings/SettingsAgents.tsx:184` — `if (harnessesRes.ok)` swallows a failed `/api/harnesses`, leaving `harnesses` as `[]` while status still becomes ready. **This is the fact B2 turns on.** |
| The editor never renders while loading | `SettingsAgents.tsx:428` returns `SkeletonList` for `status === "loading"` — so there is no half-loaded editor, only a *failed*-fetch one |
| **The per-message option pill path is already gone** | `deriveComposerPills` and `HarnessOptionControlKind` have no definition anywhere on the tree. Deleted by AU44 B0; recorded at `layers/core-ui/src/__tests__/AM3-session-view.test.tsx:347-348`. The surviving composer pill row renders **only** a model-cycling button and the working/queue chips — `SessionView.tsx:619-641` |
| `Input` owns a `hint` treatment; `Select` has neither hint nor description | `ds/Input.tsx:45` (`hint?`), `:109-113` (hint span); `ds/Select.tsx:21-28` has `label`, `options`, `size`, `placeholder` and nothing else |
| `Toggle` exposes `role="switch"` + `aria-checked` + `description`, and accepts **no `id`** | `ds/Toggle.tsx:18-36` (props), `:59-61` (`role="switch"` + `aria-checked` + `aria-label`) |
| `SectionLabel` is the Tier-1 primitive that owns the uppercase section-heading treatment | `ds/SectionLabel.tsx:28-42` (props), `:44-70` (render); live at `AgentProfile.tsx:435,463,481,509,567`, `WorkBet.tsx:994,1350`, `WorkTeam.tsx:410,442,510`, `WorkTask.tsx:304,341`, `KnowledgeDetail.tsx:391,1086`, `SettingsConnections.tsx:334`. **This is the fact B4 turns on.** |
| Existing `Toggle` surfaces all stack vertically, never in a wrapping field row | `SettingsWorker.tsx:156-158` (`flex flex-col gap-[18px]`), `SettingsNotifications.tsx:52-58` (mapped column), `SettingsAgentBehavior.tsx:354-359`. **This is the fact N6 turns on.** |
| Live design system | `layers/core-ui/src/ds/` with tokens at `layers/core-ui/src/ds/tokens.css` (Crème Lemon on Hearth). `pipeline.config.yml` points `designSystem.path` at `framework/design-system`, **which does not exist** — see O-1 |
| **The no-harness-branching lint rule does NOT cover this surface** | `eslint.config.ts:744-772`. Its `files:` list is exactly `layers/core-ui/src/settings/harness-presentation.ts` and `layers/core-ui/src/settings/SettingsHarnesses.tsx`. `AgentEditor.tsx` is not in it. **Revision 1 claimed this rule was enforced here. It is not.** See §2.1. |

---

## 2. The decision

**Per-model options are a section of the agent editor, placed directly beneath the control row that
produces them, rendered entirely from the descriptor, and absent when the descriptor is silent.**

```
┌─ agent editor card (AgentEditor.tsx:188) ──────────────────────────┐
│  Name        Role        Harness      Model       Max Sessions     │  ← unchanged (:189-289)
│                                                                    │
│  MODEL OPTIONS                                                     │  ← NEW — only when the selected model declares ≥1 option
│  Applied to every run of this agent.                               │
│  [ Effort ▾ ]        [ Max thinking tokens ]                       │  ← value controls, wrapping row
│  ⬤ Web search        Search the web during a run                   │  ← boolean options, stacked (§3.4)
│                                                                    │
│  System prompt                                                     │  ← unchanged (:292)
│  …                                                                 │
└────────────────────────────────────────────────────────────────────┘
```

Three reasons for this placement and no other:

1. **Adjacency is the explanation.** An option's whole meaning is "for the model above". Put a
   dependent control immediately under the control it depends on and no copy is needed to explain the
   dependency; when the Model select changes, the block visibly re-forms in the same eye-line.
2. **It cannot join the field row.** The row at `AgentEditor.tsx:189` is five equal-weight fields the
   user always sets. Options are conditional, variable in number, and belong to one of those five.
   Mixing them would make a `flex-wrap` row whose length changes with the harness, and the reader
   would lose which fields are always there.
3. **It must sit above System prompt, not below.** Everything above the prompt is *how this agent
   runs*; the prompt and below are *what it is and what it can reach*. Options are the first kind.

### Copy and the heading

- Section heading: **`<SectionLabel label="Model options" />`** — the DS primitive at
  `ds/SectionLabel.tsx`, at its default `h3` (the Settings page's group headings are `h2`,
  `SettingsPage.tsx:37`, so `h3` nests correctly). *Revision 1 told the builder to copy the bare
  `<span className="type-label uppercase text-[var(--text-tertiary)]">` that `AgentEditor.tsx:310`
  uses for Filesystems. That was wrong* — `.claude/rules/frontend.md` forbids hand-rolling an
  equivalent of an existing component, and `SectionLabel` owns exactly this treatment plus a real
  heading element for the document outline. Copying the span would have propagated an existing
  violation, and it contradicted this design's own §3.1 argument. The Filesystems span is a
  pre-existing violation and is **not** BA3's to fix — it is not this feature's rubble.
- One helper line under the heading, `type-metadata text-[var(--text-tertiary)]`:
  **"Applied to every run of this agent."**

That single line is the whole answer to *"how does the once-not-per-message story read?"* It is
stated where the setting is made, in the tense that makes the promise. Nothing anywhere else says
anything about per-message options, because after this package nothing anywhere else can.

### 2.1 Sourcing rule — a convention this surface adopts, and a deliverable to make it enforced

The rendered block is a pure function of
`harnesses.find(h => h.type === draft.harnessType)?.models.find(m => m.id === draft.modelId)?.options`.
**No `harnessType` check, no per-model special case, no client-side catalog of known options.**

*Revision 1 said this was already ESLint-enforced and made the rule binding on that basis. That was
false.* The rule at `eslint.config.ts:744-772` names two files and `AgentEditor.tsx` is not one of
them; nothing mechanical stops a `harnessType === "claude-code"` special case in the option block
today. The config block's own `@lore` warns about exactly this class of error: *"a dead entry reads
as coverage the rule does not have."* A live entry pointed at the wrong files reads the same way.

What is actually true: the descriptor-only contract is **documented** at
`docs/agent-layer/harness-capability-descriptor.md:227` and **practised** in `harness-presentation.ts`,
but on this surface it is a design convention, not a guarantee.

**Two deliverables, explicit and in scope:**

1. **Add `layers/core-ui/src/settings/AgentEditor.tsx` to that rule's `files:` list.** A one-line
   config change; it is what `CLAUDE.md` asks for (a static codebase property is enforced by a lint
   rule, not a test); and it is what makes AC 5 and the plan's *"Exposing options for harnesses that
   do not declare any"* exclusion provable rather than promised. Builder note: the file contains one
   occurrence of the string `codex` today, at `AgentEditor.tsx:27`, **inside a docblock**. The rule
   matches `Literal` nodes, not comments, so the file is already clean — verify with a lint run
   rather than assuming either way.
2. **Correct `docs/agent-layer/harness-capability-descriptor.md:227`.** That line reads *"UI controls
   render from option descriptors — no `harnessType` checks (ESLint-enforced, single `"builtin"`
   exception)"*. The parenthetical is the same overclaim revision 1 made — the rule covers two files,
   not "UI controls" generally. Quoting the line with the parenthetical trimmed off fixes this
   document and leaves the source wrong, and the source is what the next agent will read. The line
   must name the files the rule actually covers (three, after deliverable 1). This is the doc that
   made revision 1 believe the enforcement existed, so leaving it is how the same error happens
   again.

---

## 3. Control shapes

One descriptor field → one control. All four use primitives that already exist in
`layers/core-ui/src/ds/`. Nothing new is invented.

| `control.kind` | Component | Label | Help | Zone (§3.4) |
|---|---|---|---|---|
| `select` | `Select` (`size="sm"`) — `ds/Select.tsx` | `label` | `helpText` → new `hint` prop (§3.1) | value row |
| `number` | `Input type="number"` with `min`/`max`/`step` from the control | `label` | `helpText` → existing `hint` prop | value row |
| `text` | `Input type="text"` | `label` | `helpText` → existing `hint` prop | value row |
| `boolean` | `Toggle` — `ds/Toggle.tsx` | `label` | `helpText` → existing `description` prop | stacked below |

Options render in descriptor declaration order **within each zone**.

Control ids follow the editor's existing convention so several open editors do not collide:
`edit-option-${agentId}-${key}` (compare `edit-model-${agentId}` at `AgentEditor.tsx:248`).
`Select` and `Input` bind `<label htmlFor>` to that id (`ds/Select.tsx:79-81`, `ds/Input.tsx:83`).

**`Toggle` is the exception and the convention does not apply to it** (N5). `ToggleProps`
(`ds/Toggle.tsx:18-36`) accepts no `id`, and the primitive wraps its control in a `<label>` with no
`htmlFor`. A boolean option is therefore identified by its accessible name — the `label` string,
which `Toggle` already exposes via `role="switch"` + the wrapping label. **Do not add an `id` prop to
`Toggle` for this.** The `key` still keys the React element and the draft entry; it is simply not an
`id` attribute.

### 3.1 One additive design-system change: `Select` gains `hint`

`Input` has `hint` (`ds/Input.tsx:45`) and `Toggle` has `description` (`ds/Toggle.tsx:32`). `Select`
has neither, so a select-kind option's `helpText` would have to be hand-rolled next to the control —
a parallel copy of a treatment two primitives already own, which the design-system rule calls a
CRITICAL finding.

**Decision:** add an optional `hint?: string` prop to `Select`, and a story for it.

**"Identical treatment" means the aria wiring, not only the pixels** (N4). `Input`'s hint is a
`<span id="${id}-hint">` *plus* an `aria-describedby` on the control. `Select` has no
`aria-describedby` today. A `hint` that is visible but unreferenced is invisible to a screen-reader
user, which is the opposite of what a help string is for. `Select`'s `hint` must render the span
**and** point `aria-describedby` at it.

### 3.2 Required vs optional, and how a required-and-empty field is announced

- **Optional `select`** gets a leading choice that names the default (§3.3). Choosing it means
  *store nothing; let the harness decide*.
- **Required `select`** gets no such choice. It resolves to `defaultValue`, or the first choice if
  the descriptor declares none. It therefore can never be empty, and it always stores.
- **`boolean`** has no third state — see §3.3 for what it stores.
- **Required `number` / `text` with no `defaultValue`** is the only case that can be left empty. It
  shows `Input`'s own error treatment reading **"Required by this model."**, and Save is blocked.
- **Optional `number` / `text`** left empty stores nothing.

**Announcing the blocked state** (N2, N3). Two defects made the block silent on the keyboard and
screen-reader path in revision 1:

- `ds/Input.tsx:104` computes `aria-describedby={hint ? \`${inputId}-hint\` : error ? \`${inputId}-error\` : undefined}`
  while the hint span renders only under `hint && !error` (`:109`). With a `helpText` *and* an error
  present — exactly the state §3.2 creates — `aria-describedby` points at an element that does not
  exist and the error is never referenced.
- A disabled Save button is not announced as "blocked because X"; `AgentEditor.tsx:353` disables only
  on `saving` today.

Two fixes, both small and both using what is already there:

1. **`Input`'s `aria-describedby` is corrected to match its own render order** —
   `error ? error-id : hint ? hint-id : undefined`. This is an additive one-line correctness fix to a
   primitive BA3 is already extending, and §3.2 is what puts the broken combination on a reachable
   path for the first time.
2. **The blocked reason is announced in the same alert region the inline 422 uses** —
   `AgentEditor.tsx:341-346`, a `<p role="alert">`. It reads **"Fill in the required model options
   before saving."** `role="alert"` announces it; the field error says which option.

   **Ownership and precedence.** The editor does *not* own that region's content today: it renders
   `{error && …}` where `error` is a **prop** from the parent (`AgentEditorProps.error`,
   `AgentEditor.tsx:80`; `SettingsAgents` supplies it from the save response). The blocked-Save reason
   is a *local* precondition the editor derives from its own draft, so the editor owns that one. The
   region shows **one line, never two**, and the parent's `error` wins: a 422 reports what the server
   actually said about a real attempt, while the blocked reason is a rule the user can see enforced on
   the offending control regardless — that control's own `Input` `error` is always rendered, so
   suppressing the region-level line costs no information. Do not merge, stack or alternate the two.

The reviewer is right that this whole branch may be unreachable (O-3) and is the first thing to cut
if architecture's first real declaration carries a default. It is kept because it is two conditions
and one string, not because elaborate validation was intended.

Deliberately **not** designed: an asterisk / "required" badge convention. This repo has none, three of
the four kinds cannot be left empty, and inventing a marker for the fourth is ceremony. The error text
is the signal, and it is text, not colour alone.

### 3.3 `defaultValue` is SHOWN, never STORED — and what an untouched option stores

*This is B1. Revision 1 gave two incompatible answers; here is the one answer.*

> **An option the user never touched stores nothing. `defaultValue` is displayed so the user can see
> what will happen if they leave it alone; it is never written into the agent's configuration.**

**Why this one and not the other.** The plan's constraint is *"An agent with no options configured
must run exactly as it does today."* Today nothing is sent. If an untouched option were stored at its
default and then passed through, the harness would receive an explicit flag it does not receive
today — and several CLIs behave differently for an explicitly-passed flag than for an absent one.
Storing defaults would also pin every agent to whatever the default was on the day someone last
opened the editor to fix a typo, so the agent silently stops tracking the harness. Both are the
literal opposite of the AC. So: **absent key means "the harness decides", and that is the state every
existing agent is in and stays in.**

How each control shows a default it does not store:

- **`select` (optional).** The leading choice is `Default` when no `defaultValue` is declared, and
  **`Default (Medium)`** when `defaultValue: "medium"` names a choice labelled "Medium". Its value is
  `""` and selecting it stores nothing. The named choice "Medium" remains in the list below and
  *does* store. Yes, there are two ways to end up on medium — and they mean different things: one
  tracks the harness, one pins medium even after the harness changes its default. The parenthetical
  is what says so. This is the familiar "Auto (…)" pattern from OS settings, not an accident.

  **It goes in `options`, not `placeholder`.** `Select` already has a `placeholder` prop, and it
  renders `<option value="" disabled>` (`ds/Select.tsx:85-89`) — using it for the leading choice would
  make the unset state visible and **unselectable**, so a user could leave the default but never
  return to it. The leading choice is the first entry of the `options` array, `{ value: "", label:
  "Default (Medium)" }`, exactly as `modelOptionsForHarness` builds the model select's own leading
  entry (`model-options-for-harness.ts:45`). Leave `placeholder` unset on these controls.

  **On the wording, against the model select's "System default"** (`model-options-for-harness.ts:45`,
  `AgentEditor.tsx:144`). The two deliberately differ, because they name different deciders: the model
  select's empty choice means *HyperIdle picks the model*; an option's leading choice means *this
  harness's own default for this option applies*. Calling both "System default" would assert the
  system decides an option it has no say in. Unifying in the other direction — restyling the model
  select's copy — is AV2's surface, is asserted by an existing test
  (`__tests__/modelOptionsForHarness.test.ts`), and is out of scope here. `Default (Medium)` is also
  the shorter and more informative of the two, since it names the value the user is deferring to.
- **`number` / `text` (optional).** Empty field. The default is shown as the **placeholder**.
  Precedence for the placeholder slot: `defaultValue` when declared, else `control.placeholder` when
  declared (text only), else nothing. Empty stores nothing.
- **`boolean` (optional).** A toggle has two positions and no unset, so "default position" has to be
  defined from the **descriptor alone**, never from what is stored: the default position is *on* when
  `defaultValue === true`, and *off* otherwise (including when `defaultValue` is absent — a harness
  that declares a boolean option without a default is declaring an opt-in). That is a fixed property
  of the option, not a function of the draft. The **rendered** position is then the stored value when
  a key exists, and the default position when none does. The **storing** rule: the key is written once
  the toggle sits away from the default position, and **moving it back to the default position clears
  the key again**. An untouched boolean therefore stores nothing, and a round trip leaves the
  configuration exactly as it found it.
- **Every `required` option always stores — booleans included.** For `select`, `number` and `text`
  there is no "let the harness decide" for something the model insists on, so there is no leading
  `Default` choice and no unset field. **A required `boolean` is the same:** it renders at its default
  position like any other, but it writes that position as an explicit value from the first save rather
  than staying absent. (Revision 1 said `required` "changes nothing for a boolean". That was written
  before §3.3 decided defaults are never stored, and it is now wrong: it would leave a required option
  unset, which is the one thing `required` forbids.)

The rule architecture should implement against, in one breath: **a *required* option always
contributes its value; an *optional* option contributes its value only when the control sits away
from its default, and contributes no key at all when it sits at it.**

### 3.4 Two zones, because a Toggle does not belong in a field row

*This is N6.* `Select` and `Input` put their label **above** a 32–36px control; `Toggle` puts its
label **beside** a 24px track. Put them in one `flex-wrap` row and the labels sit at two different
heights and the controls at two more. No surface in this repo composes them that way — all three
existing `Toggle` surfaces stack vertically (`SettingsWorker.tsx:156-158`,
`SettingsNotifications.tsx:52-58`, `SettingsAgentBehavior.tsx:354-359`).

**Decision:** the option block has two zones, in this order:

1. **Value controls** (`select`, `number`, `text`) in the same wrapping idiom as the field row above —
   `flex gap-[9px] flex-wrap`, each in a `flex-1 min-w-[140px]` cell (the idiom at
   `AgentEditor.tsx:189`).
2. **Boolean options** stacked in a `flex flex-col gap-[9px]` beneath them (the idiom the three
   Toggle surfaces already use).

Trade, stated plainly: this groups by control shape rather than following pure declaration order
across the whole block. Order is preserved *within* each zone. The alternative — honouring one flat
order at the cost of four misaligned baselines in one row — is worse, and grouping controls by shape
is what every existing settings surface here already does.

---

## 4. The empty state: nothing

**A model that declares no options produces no DOM.** No section heading. No helper line. No box. No
"This model has no options" sentence. The agent editor's rendered tree is identical to today's.

Four cases collapse to the same nothing:

1. The selected model declares `options: []` — every model on the tree today.
2. No model is selected (`draft.modelId === ""`, "System default"). Options are declared *per model*;
   with no model there is no declaration to read.
3. The harness's `models` list is empty. *Revision 1 attributed this to codex. That was too narrow* —
   `models` is a live probe and `harness-discovery.ts:672,711` return `[]` on any non-ok response, so
   an offline machine or a rate limit produces the same empty list as a harness that genuinely has
   none. Either way the existing prose at `AgentEditor.tsx:259-266` renders and no option block
   appears beneath it.
4. **The harness list itself failed to load.** `SettingsAgents.tsx:184` swallows a non-ok
   `/api/harnesses` and the editor renders with `harnesses: []`. There is no descriptor at all, so
   nothing renders.

Cases 3 and 4 mean the surface cannot distinguish *"this model declares no options"* from *"we could
not ask"*. That is a real limitation and §5 is where it is made harmless: because the editor never
writes a key it did not render, an unaskable harness costs the user nothing. Note the Model field
already lies in case 3 for builtin ("This harness manages its own model selection." when in fact the
fetch failed) — a pre-existing hole that predates BA3 and belongs to whoever owns the fetch error
path, not to this package. The option block adds nothing to it. The editor never renders during
*loading* (`SettingsAgents.tsx:428` returns `SkeletonList`), so the ambiguity is a failed fetch, never
a slow one.

Explicitly rejected: a disabled/greyed section; a "0 options" count; a collapsed `Fold`; an
`EmptyState`; a "could not load options" notice for cases 3–4 (the Model field's own failure is the
place that belongs, and it is not this package's).

---

## 5. Switching, and what Save writes

### 5.1 The rule that makes options survive

*This is B2. Revision 1 said "the save writes exactly the option set the selected model declares", so
opening an agent while offline to fix its name and pressing Save would have silently destroyed every
stored option value, with no warning and no undo.*

> **The editor only writes keys it actually rendered.** Values for keys it did not show — because the
> model declared none, because the probe came back empty, because the harness list failed to load —
> are carried through untouched.

So Save writes: everything that was already stored, with the rendered options' keys updated to what
their controls now say (added, changed, or cleared per §3.3). Nothing else is added and nothing else
is removed. A user who never saw an option cannot lose it.

**There is no save-time prune, and stale keys are not the editor's problem.** If a harness genuinely
drops an option, the orphaned value sits harmlessly in storage and is simply never sent — because the
pass-through sends only what the harness currently declares. That check belongs at run time, where the
live declaration is actually known, not in a form that cannot tell silence from a failed request.
Architecture owns it.

This is what makes the plan AC *"they persist"* true rather than conditional on the network.

### 5.2 Switching harness

The harness switch already resets `modelId` to `""` (`AgentEditor.tsx:227-238`), so there is no model
and no declared options. Every option that **was on screen** for the previous model clears from the
draft. Keys that were never rendered are untouched, per §5.1.

### 5.3 Switching model

For each **rendered** option value, keep it when the new model declares that key **and** the value is
still valid for the new control: `select` → the value is among the new `choices`; `number` → a number
within `min`/`max`; `boolean` → a boolean; `text` → always. Otherwise the key is dropped.

**A key that survives but whose value is now invalid clears to its unset state** — the `Default (…)`
choice, or an empty field — rather than being silently replaced by the new default (N1). This matters:
that control stays on screen with the same label, so a silent flip to a different concrete value is
easy to miss in a row of several options, whereas a control that has visibly gone back to "Default"
reads as *not set* at a glance. It also keeps §3.3 consistent — an unset control stores nothing.

**No warning, no banner, no confirm.** The controls are on screen; the user watches the block re-form
in the same interaction that caused it, and both branches (a key that disappears, a key that empties)
are visible in place. Explicitly rejected: a "these options were cleared" strip; a confirm dialog
before switching; keeping orphaned rendered values invisibly in case the user switches back.

---

## 6. Per-message: nothing to remove from the screen, something to remove from the story

The per-message option pills **were already deleted** by AU44 B0. `deriveComposerPills` and
`HarnessOptionControlKind` are not on the tree. The surviving composer pill row
(`SessionView.tsx:619-641`) renders a model-cycling button and the working/queue chips — no options.
So AC *"No surface offers per-message option toggles"* is true today and this design keeps it true by
never adding one.

What is *not* clean, and what the BA track's ownership rule makes this package's job:

1. **`HarnessModelOptionDescriptor.scope: "launch" | "durable"`**
   (`harness-capability-descriptor.ts:76`). That field existed to say *set at launch* vs *persisted*.
   After this package every option is agent configuration applied to every run, so the field has one
   possible meaning and zero readers. **Design consequence: the editor does not group, sort, badge or
   otherwise show `scope`.** Recommend architecture delete the field.
2. **`SessionView.stories.tsx:274-312`** still declares two full option descriptors (`effort`, `mode`)
   on a fixture whose component no longer renders them. A story is this repo's design artifact; a
   design artifact describing a deleted feature is a lie the next agent will believe. Remove the
   `options` arrays from that fixture.
3. **Three documentation statements still describe per-message option pills as live:**
   - `docs/human-interface-layer/part-model.md:69-71` — a whole `## Composer pills (deriveComposerPills)` section for a deleted function.
   - `docs/human-interface-layer/part-model.md:96` — "adds a descriptor pill strip (model · effort · mode)".
   - `docs/guides/user/three-core-views.md:27` — "The Session view composer shows model and option pills".

   The user-facing story these must become: **the composer shows which model is running; the options
   that model runs with are set once, in the agent's configuration.** Wording is `/pipeline:write-docs`'
   job; the substance is fixed here.

---

## 7. Out of scope (design will not resolve these)

- Per-message or per-run overrides of any kind — the plan forbids them and this design provides no
  surface that could grow into one.
- The composer's **model**-cycling pill (`SessionView.tsx:621-628`). It changes the model, not an
  option; the plan puts "changing which models an agent may use" out of scope; and the session view's
  reachability is BA4's package. Untouched. See O-2.
- Which harness declares the first real option, and what that option is. Architecture's call, bound by
  the plan's constraint that the declaration and the pass-through ship together.
- Storage shape, migration, API payload, server-side validation, and the run-time filter that drops
  keys the harness no longer declares (§5.1).
- The Filesystems block's hand-rolled section label at `AgentEditor.tsx:310`, and the Model field's
  wrong prose on a failed probe (§4 case 3). Both pre-date BA3 and are not this feature's rubble.
- Model tier (`model_tier_preference`, `schema.ts:121`) — persisted but not exposed by this editor
  today. This package does not add it.
- Per-option reset-to-default affordance, bulk reset, "show advanced" folding, search across options.
  Not required by any AC. If a harness ever declares more than roughly six options for one model, the
  two-zone block will need revisiting — a future package, not a hedge to build now.

---

## 8. AC coverage (the surface half)

| Acceptance criterion | How this design satisfies it |
|---|---|
| An agent's configuration can hold the options its harness declares for its model, **and they persist** | The option block is part of the editor's draft, written by the same Save that writes harness/model/provider/sessions (`AgentEditor.tsx:348-356`). §5.1 is what makes *persist* hold: the editor only ever writes keys it rendered, so no probe failure, offline moment or unrelated edit can remove a value the user set. There is no save-time prune. |
| Options set on an agent reach the harness when that agent runs | Architecture's. Design's contribution: the block's copy ("Applied to every run of this agent.") is the promise the pass-through must keep, no per-run surface exists to contradict it, and §3.3 fixes exactly which keys the pass-through will be handed. |
| An agent with no options configured **behaves as it did before this change** | Derived, not asserted. §3.3 decides that an untouched option stores **nothing** — a control at its default contributes no key. So: every model on the tree today declares `options: []`, renders no controls, and contributes no keys; and even once a harness declares options, an agent nobody has configured has an empty option set, so the harness is handed nothing and receives exactly what it receives today. The rejected alternative — pre-filling and storing defaults — would have failed this AC twice over: it sends an explicit flag where today nothing is sent, and it pins the agent to a stale default. |
| No surface offers per-message option toggles | Already true (§6). This design adds exactly one surface and it is in the agent editor. The stale fixture, the dead `scope` field and the three doc statements are named as this package's cleanup. |
| A harness that declares no options for a model presents no option controls when configuring an agent that uses it | §4 — nothing renders, in all four empty cases. No heading, no container, no explanatory sentence. §2.1's lint deliverable is what makes this provable rather than promised: with `AgentEditor.tsx` in the rule's `files:` list, a per-harness special case that rendered something for a silent descriptor cannot be written. |

## 9. Story states to render (the design artifact)

`AgentEditor.stories.tsx` gains **two** stories. Per the repo rule the story *is* the artifact, so
these are deliverables.

1. **`AllControlKinds`** — one model declaring one option of each kind: an optional `select` with a
   `defaultValue` (showing the `Default (…)` leading choice), an optional `number` with
   `min`/`max`/`step` and its default as placeholder, an optional `text` with `control.placeholder`,
   and a `boolean` with `helpText`. This is the story that shows the §3.4 two-zone composition — the
   one thing here that is a genuinely novel arrangement.
2. **`RequiredOptions`** — a required `select` (no `Default` choice) and a required `text` with no
   `defaultValue` left empty, showing the field error, the blocked-Save alert line, and both together
   (the aria case §3.2 fixes).

**No `NoModelOptions` story** (N9). The existing `NormalAgent` story already renders a model with
`options: []` and therefore already *is* the empty-state artifact; a second story rendering an
identical tree is a rename, not an artifact. No skeleton or loading story either: the descriptors
arrive with the harness list the editor already has, and the editor does not render while loading
(`SettingsAgents.tsx:428`).

## 10. Rendering evidence, and the one thing that is genuinely new

Most of this design is inherited. The four control primitives ship
(`ds/Select.tsx`, `ds/Input.tsx`, `ds/Toggle.tsx`), the section heading is a DS primitive in live use
in seven files (`ds/SectionLabel.tsx`), the value-control row copies `AgentEditor.tsx:189`, and the
boolean stack copies `SettingsWorker.tsx:156`. Every spacing value used — `3 / 6 / 9 / 12` px — is on
the Hearth grid (AQ-001); every colour is a token; no new token, radius, shadow or motion profile is
introduced.

*Revision 1 claimed on that basis that "visual judgement is inherited, not created". That overstated
it* (N6). One thing here has no precedent: **a `Toggle` and a `Select` in the same block.** §3.4
resolves it by not composing them in one row at all — value controls wrap, booleans stack — which is
what turns the novel arrangement back into two inherited ones. That is a composition decision made
from the file rather than from a render, and it is the honest description of what happened. If the
founder reviews this surface live, the two-zone block under `AllControlKinds` is the frame to look at,
because it is the only frame where a render could still change something.

No screenshot is attached: this repo forbids screenshots as evidence
(`.claude/rules/visual-regression.md`).

---

## 11. Open questions

- **O-1 — `pipeline.config.yml` points at a design system that does not exist.** It declares
  `designSystem.path: framework/design-system` and `tokens: framework/design-system/src/tokens.css`;
  neither exists on this tree. The live system is `layers/core-ui/src/ds/` with tokens at
  `layers/core-ui/src/ds/tokens.css`. `.claude/rules/design-system.md` carries the same stale paths.
  This design was made against the live system. Fixing the config is not BA3's work — flagged so the
  next design phase is not misled.
- **O-2 — the composer's model-cycling pill is a per-message run decision.** `SessionView.tsx:621-628`
  lets a person cycle the model mid-session, one message at a time. That is the same "decide per
  message what you meant to configure once" shape this package exists to remove, applied to the model
  instead of its options. The plan puts model choice out of scope and the session view is reachable
  only through BA4, so this design leaves it alone. **Whether it should survive BA3's own reasoning is
  a founder call**, not a thing to settle by inference.
- **O-3 — the required-and-empty case may be unreachable.** No harness has ever declared any option,
  so whether a real one will ever declare a *required* option with *no default* is unknown. If
  architecture's first real declaration carries a default, §3.2's validation rule, error string,
  blocked-Save alert and the `RequiredOptions` story never fire. It is two conditions and one string,
  kept because it is cheap and named because a reviewer should not read it as evidence that elaborate
  validation was intended. It is the first thing to cut.
