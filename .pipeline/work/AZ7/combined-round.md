# AZ7 — Close the visual system · combined refine + design + architecture round

Status: **awaiting founder approval.** No code written. Procedure per `.pipeline/work/AZ7/plan.md`
(founder decision, 2026-08-11): one combined artifact → founder approval → same-session build
(tests, then code) → one fresh review round.

Base: `origin/main` @ `a8ed3ad9`. Everything below was measured on that tree.

---

## 0. What changed versus the plan, in one paragraph

The plan's five counts are directionally right and one of them is wrong in a way that changes the work.
Button, input and surface sprawl are **worse** in source than the plan's rendered-DOM numbers say. The
"off-scale radius used 99 times" is **not** an off-scale radius: `3.35544e+07px` is what Chrome computes
for Tailwind v4's `rounded-full`, which is the pill. The real defect is the other half of that same
sentence — pill has two spellings — and genuinely off-scale radii number 21, not 99. Separately, the
plan's open question ("either the rules are not running on these files or the violations predate them")
has a definite answer: **the rules are not running.** Three independent causes, all proven below, and
the largest one is that `npm run lint` passes `--quiet`, which does not merely hide warnings — it does
not run warn-level rules at all.

---

## 1. Measurement

### 1.1 Method (reproducible)

Three instruments. All committed under `.pipeline/work/AZ7/measurement/`.

| # | Instrument | Command | What it answers |
|---|---|---|---|
| M1 | `scan.mjs` | `node .pipeline/work/AZ7/measurement/scan.mjs "$PWD" .pipeline/work/AZ7/measurement` | Distinct recipes and token populations per axis |
| M2 | `predicates.mjs` | `node .pipeline/work/AZ7/measurement/predicates.mjs "$PWD" .pipeline/work/AZ7/measurement` | Exact site count each proposed rule would flag |
| M3 | `measure.eslint.config.ts` | `npx eslint --no-config-lookup --config .pipeline/work/AZ7/measurement/measure.eslint.config.ts -f json -o /tmp/design-all.json 'layers/core-ui/src/**/*.tsx' 'framework/design-system/src/**/*.tsx'` | Every design rule at `error` — the population the repo's own config cannot see |

M1/M2 parse each file with the TypeScript compiler API (`ScriptKind.TSX`), walk every JSX opening
element, and reduce the `className` attribute to its literal text — string literals, template heads and
tails, both arms of a conditional, array elements, and call arguments (so `[...].join(" ")` is read).
Anything not statically resolvable becomes the marker `«dyn»`, so a dynamic recipe can never be
silently counted as a static one.

Scope: files are discovered by walking the role roots `layers/ framework/ applications/` — no package
path is hardcoded, and each scan **hard-fails** if it finds zero files or zero JSX elements. A file is
**production** per `CLAUDE.md`: under a shipping root, not `*.test|stories|spec.tsx`, and no path
segment starting `__`. Result: **164 production `.tsx` files, 3,444 JSX elements** (core-ui 395 files
and design-system 183 files total; the rest are stories/tests/preview).

**Limits, stated honestly.** This is a source measurement, not a computed-style measurement. It sees
every file, including routes the audit's twelve did not reach, and it cannot resolve a class chosen at
runtime. The audit's numbers are the effect; these are the cause. Where they disagree, both are right
about different things — noted per axis.

### 1.2 Buttons

| Measure | Value |
|---|---|
| Raw `<button>` elements in production | **167** |
| Distinct static recipes among them | **118** |
| Recipes used exactly once | **96** |
| Design-system `<Button>` uses | 74 |

A "recipe" here is the deduplicated, sorted set of chrome-bearing class tokens on the element
(fill, border, radius, height, padding, font size/weight, gap, shadow, ring, outline, casing, tracking,
plus DaisyUI component classes), with responsive/state prefixes collapsed.

By package: core-ui 88 hand-rolled + 18 DaisyUI; core-ui/shell 16 + 5; design-system 25 hand-rolled +
11 fully dynamic + 3 with no chrome.

**Versus the plan.** Plan says 47 by computed style across twelve routes. Source says 118 distinct
recipes, 96 of them one-offs. Both correct: the rendered app collapses recipes that differ only in ways
computed style does not distinguish, and it only saw twelve routes. **The plan's number understates the
problem by roughly 2.5×.** Nothing in the plan changes because of this — the direction is the same.

Three parallel button systems ship today, not one:
1. `framework/design-system/src/Button.tsx` — 5 variants × 2 sizes, 74 uses.
2. DaisyUI `btn btn-ghost btn-xs` etc. — 23 raw buttons in core-ui.
3. Hand-rolled Tailwind — 83 non-DaisyUI raw buttons carrying chrome, plus a **fourth vocabulary inside
   the design system itself**: `framework/design-system/src/RichMessageCard.tsx:78-100` declares its own
   `tone: "primary" | "ghost" | "danger"` with a private `toneClass()` and a `BUTTON_CLASS_BASE` that is
   not even a pill (`rounded-[var(--r-subtle)]`).

`variant="amber"` has **zero** production uses (measured across core-ui + design-system, excluding
stories/tests).

### 1.3 Inputs

| Measure | Value |
|---|---|
| Raw `<input>` / `<textarea>` / `<select>` in production | **42** |
| Distinct static recipes among them | **25** |
| Design-system input-like component uses | 59 |
| core-ui raw text controls carrying chrome | **28** — of which **25 are DaisyUI** (`input input-bordered input-sm`, `textarea textarea-bordered`) and 3 are hand-rolled |

The three hand-rolled ones: `pages/SetupFlow.tsx:837`, `shell/HostThreadSection.tsx:333`,
`components/RecipientPicker.tsx:239`. The remaining raw inputs in core-ui are
`type="checkbox" | "radio" | "range"` (form-control chrome, AQ-011-exempt) and one `type="search"`
(`pages/KnowledgeList.tsx:1009`, which is `SearchField`'s job).

**Versus the plan.** Plan says 6 recipes / four fills / six heights. Source says 25 recipes. More
importantly the plan describes six hand-tunings, when the cause is **a second control system**: DaisyUI
supplies the fill, height and radius for 25 of the 28. That reframes the fix from "harmonise six
recipes" to "delete a control system".

### 1.4 Radii — the plan's one wrong number

Radius class occurrences in production `.tsx`:

| Spelling | Count | On the Hearth scale? |
|---|---|---|
| `rounded-[var(--r-subtle)]` | 120 | yes (10px) |
| `rounded-[var(--r-pill)]` | 87 | yes (9999px) |
| `rounded-full` | **69** | yes in value, **second spelling of pill** |
| `rounded-[var(--r-default)]` | 64 | yes (16px) |
| `rounded` (4px) | 8 | **no** |
| `rounded-[4px]` | 5 | **no** |
| `rounded-[6px]` | 4 | **no** |
| `rounded-[8px]` | 2 | **no** |
| `rounded-t-[var(--r-default)]` | 2 | yes |
| `rounded-lg` (8px) | 1 | **no** |
| `rounded-[2px]` | 1 | **no** |
| `rounded-none` | 1 | yes (0) |

Genuinely off-scale: **21 occurrences.** Non-token spellings of an on-scale value: **69**
(`rounded-full`). Plus 7 `border-radius` declarations in CSS files.

**The plan (and the audit at `plans/reviews/ui-audit-consolidated.md:136`) says the most-used radius in
the app is an off-scale computed value, `3.35544e+07px`, 99 times. That reading is wrong.** In Tailwind
CSS v4, `rounded-full` compiles to `border-radius: calc(infinity * 1px)`; the string
`calc(infinity * 1px)` is present in the installed `node_modules/tailwindcss/dist/lib.js`, and
33,554,432 = 2^25 is the browser's clamp of that value. So the "off-scale" radius **is the pill** — the
same visual result as `--r-pill: 9999px`, reached by the other spelling. `.claude/rules/aesthetic-quality.md`
AQ-101 even permits `rounded-full` explicitly while AQ-011 names `--r-pill` as the scale member, so the
two spellings are both blessed by the rules.

What survives from the plan's sentence, and is the real defect: **"pill" is spelled two ways** — 69
`rounded-full` and 87 `rounded-[var(--r-pill)]`, including **inside the design system itself**
(`StatusChip.tsx:109` uses `rounded-full`, `Tag.tsx:31` uses `rounded-[var(--r-pill)]`, for two chips
that sit next to each other). The consequence is exactly what the audit hit: any computed-style
measurement of this app reports an off-scale radius as its most common value.

Correction to record in the plan: *"the single most-used radius in the app is an off-scale computed
value (99 occurrences)"* → *"the most common radius is the pill, spelled two different ways (156
occurrences across two spellings), one of which computes to a value that reads as off-scale; 21
occurrences are genuinely off-scale."*

### 1.5 Filled surfaces

| Fill token | Production uses | of which core-ui | with a border |
|---|---|---|---|
| `--surface-elevated` | 82 | 57 | 60 |
| `--surface-container` | **79** | 62 | 32 |
| `--surface-page` | 43 | 30 | 19 |
| `--accent-primary-dim` | 15 | 9 | 7 |
| `--surface-overlay` | 1 | 1 | 1 |

`--surface-container` appears in **27 distinct radius/border combinations** across those 79 sites —
17× subtle-radius/no-border, 9× subtle-radius/subtle-border, 8× pill, 7× default-radius, 6× no-radius,
5× a 4px `<kbd>`, and 21 further one-off combinations. It is the fill of a code block, a search input,
a `<kbd>` key cap, a banner, an embedded reference card, an aside, a progress track, an avatar circle, a
tab-bar trough and a toast.

**Versus the plan.** Plan says 13 distinct uses of one fill. Source says 79 uses in 27 shapes. Plan
understates; the character of the finding is identical.

The documentation contradicts itself on this axis, which is part of why: `framework/design-system/DESIGN.md:29`
says cards are `--surface-elevated`, and `DESIGN.md:67` says *"Flat cards use `--border-default` +
`--surface-container` background"*. Two rules for one job, both written down.

### 1.6 Status

| Channel | Production uses | What it is |
|---|---|---|
| `StatusChip` | **37** across 27 files (imported in 34) | tinted pill + dot + word |
| `RowDot` | 3 | bare 6px tone dot |
| `LiveDot` | 6 | pulsing accent dot (activity, not status) |
| `Tag` | 18 | what an object *is* |
| `ReferenceChip` | 11 | a reference to an object |
| `ArtifactKindBadge` | 4 | an artifact's kind |
| `RowCell.tone` | **1** (`layers/core-ui/src/pages/WorkTeam.tsx:598`) | a status shown as coloured text in a list column |

**Versus the plan.** The plan says *"`StatusChip` and `status-mapping.ts` exist and are bypassed."*
That is half wrong: `StatusChip` is used in 34 files and is the dominant treatment. It is **forked in
five named places**, and those are the whole finding:

1. `layers/core-ui/src/pages/WorkTeam.tsx:598` — the agent's operational status rendered as the raw
   lowercase domain string in a `Row` cell with `tone`, ten rows from a `StatusChip` reading `ACTIVE`.
   This is the audit's "same page, 10 rows apart".
2. `layers/core-ui/src/pages/WorkTeam.tsx:333` — a `StatTile` whose value is `"Attention"` / `"Healthy"`,
   words that exist nowhere in `status-mapping.ts`, sitting on the page whose header chip says `BLOCKED`.
   This is validation scenario 3's failure, and it is a *word* fork, not a treatment fork.
3. `layers/core-ui/src/settings/harness-presentation.ts:19-20` — a private
   `type Status = "healthy" | "behind" | ...` redeclared "to avoid coupling", plus a tone→colour ladder
   at `SettingsHarnesses.tsx:298-305` that duplicates `RowDot`'s `TONE_COLOR`. Note the file extension:
   `.ts`, which no design lint rule looks at.
4. `layers/core-ui/src/pages/review/ReviewComposition.tsx:84` — a local `StatusDot` component, a fork of
   `RowDot`.
5. `framework/design-system/src/RichMessageCard.tsx:78-100` — the verdict-button tone vocabulary (a
   button fork, listed here because it is the same "local tone ladder" shape).

`status-mapping.ts` is not bypassed: it is imported and exhaustive over eight domain unions. Nothing
about it needs to change.

### 1.7 What the lint rules see today

Every design rule run at `error` over both packages (instrument M3), production world only:

| Findings | Rule | Severity in `eslint.config.ts` for core-ui |
|---|---|---|
| 108 | `design/no-off-grid-spacing` | warn — *and out of AZ7's scope (AZ15)* |
| 48 | `design/no-hardcoded-color` | warn — 8 files |
| 31 | `design/no-hardcoded-tracking` | not wired for core-ui at all |
| 18 | `design/no-off-scale-radius` | warn |
| 8 | `design/no-ai-aesthetic` | warn |
| 6 | `design/require-stories-sibling` | warn |
| 4 | `design/no-op-button` | error on pages/components |
| 2 | `design/require-focus-on-interactive` | warn |
| 1 | `design/no-local-status-builder` | **registered nowhere** |

Development-world files (stories, tests, `__preview__`) add a further 108 findings, led by 40
`no-op-button` and 34 `no-hardcoded-color`.

---

## 2. The decided closed sets

Decided from what already ships. One addition (`Button size="icon"`) and three deletions. No new
component: the constraint in the plan and in `.claude/rules/design-system.md` §"Reuse before build" is
satisfied by extending `Button` and by making `StatusChip` + `RowDot` *the* set rather than building a
replacement.

### Set 1 — Button: 4 variants × 3 sizes

| Member | Its job |
|---|---|
| `variant="primary"` | The one action that completes the surface's purpose. At most one per surface. |
| `variant="secondary"` | An equal-standing alternative to the primary — *Cancel* beside *Save*. |
| `variant="ghost"` | An action that must not compete with the content it sits in: row actions, toolbars, dialog dismiss. |
| `variant="destructive"` | An action that ends or removes something. |
| `size="default"` | Page-level and dialog-level actions. |
| `size="sm"` | Inside a row, a toolbar, or a dense panel. |
| `size="icon"` | **New.** A square control whose entire label is its icon; carries an accessible name. |

**Deleted:** `variant="amber"` — zero production uses.

**Why `size="icon"` is added rather than enumerated away.** **20** shipped hand-rolled buttons in core-ui
are measurably square — 16px ×1, 18px ×1, 20px ×1, 24px ×6, 28px ×3, 32px ×8, across 11 files
(`ConversationSurface.tsx:207,300,356`, `KnowledgeList.tsx:526,549,572`, `SessionView.tsx:591,617,626`,
`WorkBet.tsx:821`, `KnowledgeDetail.tsx:455`, …) — plus a handful more that are icon buttons shaped by
padding alone (`SessionView.tsx:159`, `Conversations.tsx:213`). That job exists in the
product and no design-system export does it, so leaving it out of the set would make every one of them a
permanent violation with nowhere to go. Adding a size to an existing component is extension, not a new
component. It renders at 32×32 on desktop with the same `min-h-[44px]` touch floor `Button` already
carries below `lg` (AQ-015), per AQ-003 "one size per component" — **this means the 20/24/28px hand-rolled
icon buttons get visually larger when they migrate. That is a real visual change and the founder should
say yes to it explicitly** (see §6, Trade-off 3).

**Not a button.** A full-width clickable list row is `Row`. A segmented switch is `TabBar`. A link is a
link (the audit's separate finding that the app has zero `<a href>` is bug-list work, not AZ7).

### Set 2 — Input: 6 members

| Member | Its job |
|---|---|
| `Input` | A single-line value the user types. `textarea` is the same field when the value is long. |
| `SearchField` | A query that filters what is already on screen. |
| `Select` | One value chosen from a closed list. |
| `Composer` | A message sent into a conversation. |
| `Checkbox` | A boolean the user sets in place. |
| `Toggle` | A setting that takes effect the moment it changes. |

`RoleCombobox` stays as a `Select` specialised to the role catalogue — it has its own data source, and
folding it would be a new abstraction, not a smaller one.

A raw `<input type="checkbox" | "radio" | "range">` carrying the DaisyUI form-control class stays
permitted — AQ-011 exempts form-control chrome and `Checkbox`/`Toggle` wrap exactly those classes.
Nothing else is an input.

### Set 3 — Filled surfaces: 4 fills + 2 tints

| Member | Its one job |
|---|---|
| `--surface-page` | The canvas the application is drawn on. Nothing that is not the page background uses it as a fill. |
| `--surface-elevated` | Anything that floats on the canvas and holds content: cards, panels, list containers, text inputs. |
| `--surface-container` | A region recessed *inside* an elevated surface: code block, table header, quote, empty state, embedded reference, progress track. A recessed surface is recessed by its fill; it carries no outline. |
| `--surface-overlay` | A surface drawn above the page: modal, popover, toast. |
| `--accent-primary-dim` | The hover / selected tint on an interactive row or a ghost control. |
| `color-mix(in oklab, var(--status-*) 14%, transparent)` | The fill of a status chip, and nothing else. |

Two consequences, both documentation fixes with code behind them:
- `DESIGN.md:67` ("flat cards use `--surface-container`") is retired. Cards are `--surface-elevated`
  (`DESIGN.md:29`). One rule survives.
- `--surface-page` is currently also used as a hover tint (e.g. `Button.tsx:30`
  `hover:bg-[var(--surface-page)]`). That is its second job and it goes to `--accent-primary-dim`.

### Set 4 — Radius: 4 values, one spelling each

| Spelling | Value | Its job |
|---|---|---|
| no radius class, or `rounded-none` | 0 | Full-bleed regions, table cells, edges that meet another edge. |
| `rounded-[var(--r-subtle)]` | 10px | A region inside a card; a menu item; an icon button. |
| `rounded-[var(--r-default)]` | 16px | Cards, dialogs, panels, text inputs. |
| `rounded-[var(--r-pill)]` | 9999px | Buttons, chips, avatars, toggles, tabs, progress tracks. |

**The only permitted spelling of a non-zero radius is a `--r-*` token.** `rounded-full`, named Tailwind
radii and arbitrary pixel radii are all retired. This is what makes a computed-style measurement of the
app return four values instead of six, and it is the single change that closes AC3.

### Set 5 — Status presentation: 2 members

| Member | Its job |
|---|---|
| `StatusChip` | The object's state, said in a word. Whenever a state is named on screen, this is its shape. |
| `RowDot` | The same state reduced to a dot, where the row has no room for the word and the word is available on hover and to a screen reader. |

**Deleted:** `RowCell.tone` — a third status channel with one call site.

**Not status, unchanged:** `Tag`, `ReferenceChip`, `ArtifactKindBadge` (what an object *is*), `LiveDot`
(something is happening right now), `Progress` (how much). The audit's five "status vocabularies"
conflated kind labels with state; naming that split is part of closing the set.

**Words.** A state's word comes from `status-mapping.ts` and the `@hyperidle/domain-model` label
registries. A surface may not invent one — no "Attention" beside a chip that says `BLOCKED`.

---

## 3. Enforcement (AC5)

### 3.1 Why the existing rules do not bite — the diagnosis the plan asked for

The plan offers two hypotheses ("either the rules are not running on these files or the violations
predate them"). Neither is quite it, and the truth is worse. **The rules are not running.** Four
independent causes, each proven:

**D1 — `--quiet` does not run warn-level rules.** `npm run lint` is
`biome check . && npx eslint . --quiet && …` (`package.json`). ESLint's own documentation for `--quiet`:
*"This option allows you to disable reporting on warnings **and running of rules set to warn**. If you
enable this option, only errors are reported by ESLint and only rules set to error will be run."*
(<https://eslint.org/docs/latest/use/command-line-interface>, accessed 2026-08-12.) Every design rule
for `layers/core-ui/src/**` is wired at `warn` (`eslint.config.ts:104-117`). They do not fire, they do
not print, they do not execute.

  Local proof, two commands:
  ```
  npx eslint layers/core-ui/src/__preview__/MockProviders.tsx
    → Error: Error while loading rule '@typescript-eslint/no-unsafe-assignment':
      You have used a rule which requires type information …
  npx eslint layers/core-ui/src/__preview__/MockProviders.tsx --quiet
    → (clean)
  ```
  The warn-level rule cannot even be *loaded*, and `--quiet` makes that invisible.

**D2 — three rules are registered nowhere.** `tools/eslint-plugin-design/src/index.ts` exports 25 rules.
`eslint.config.ts` names 22 of them. `no-local-status-builder`, `no-handrolled-select` and
`no-raw-settings-textarea` appear in no config block at any severity. All three have passing unit tests,
and the plugin's own `recommendedRules` sets two of them to `error` — but nothing in the repo spreads
`recommended`. A rule outside the config runs on zero files and reads as healthy forever. This is the
same failure shape `tools/governance/README.md` names for a scan that matches nothing.

**D3 — the one command that would show design findings is broken.** `npm run lint:design`
(`npx eslint '<two globs>'`, no `--quiet`) exits with `Oops! Something went wrong!` and a stack trace,
for the same reason as D1's first command: without `--quiet` ESLint loads the warn-level type-aware
`@typescript-eslint` rules, which have no `parserOptions.project`. It is not part of `verify`, so
nothing notices. Verified on `a8ed3ad9`.

**D4 — scope and domain holes.** Design rules run on `*.tsx` under two globs only. `.ts` files are
excluded, which is why the forked `Status` type in `settings/harness-presentation.ts` was never seen.
And more fundamentally: **not one of the 25 rules expresses "this control must be the design-system
component" or "this fill has one job".** Every one of the 118 button recipes can be spelled entirely in
on-scale tokens. Even a perfectly enforced AQ-011 leaves all 118 standing. The population the plan cares
about was never in any rule's domain, at any severity.

**"The violations predate the rules" is not the cause.** The rules that *are* at `error` — the whole
design block for `framework/design-system/src/**` (`eslint.config.ts:284-297`) — have zero survivors.
The population lives exactly where the rules are at `warn` or absent.

### 3.2 How AZ7's enforcement avoids the same fate

1. **Every AZ7 rule lands at `error`, cleared to zero survivors in the same pull request.** That is the
   repo's stated policy (`tools/governance/README.md`: *"a new rule now lands at `error` directly, with
   its violations fixed in the same pull request"*), and `error` is the only severity `--quiet` still
   runs. No baseline, no severity dial, no per-file allowance — AU31 and AU32 removed those and AZ7 does
   not reintroduce them.
2. **Wiring becomes structural.** The plugin gains one exported flat-config block built from a single
   severity table that is **total over `rules`**, and a unit test asserts the totality. A rule can no
   longer exist and be wired nowhere; the author must choose a severity in the same file. This is
   deliberately the same property `tools/governance` holds with "a registered rule with no attack case
   fails the build".
3. **The rules name the offence, not a value scale.** "A radius not spelled as a token", "a control that
   repaints a design-system component's chrome" — predicates that match the population the plan is
   about.
4. **Each rule is break-tested.** A `RuleTester` invalid/valid pair per rule (the plugin's existing
   pattern, `tools/eslint-plugin-design/src/rules/__tests__/`), plus one live demonstration during the
   build that `npm run lint` goes red on an injected violation and green when it is removed.

### 3.3 Mechanism per axis

Project rule (`CLAUDE.md`): a **static codebase property** is enforced by the type system or a lint
rule; only **runtime behaviour** is enforced by a test. Every row below is justified against that.

| # | What must fail verification | Mechanism | Why this mechanism and not another |
|---|---|---|---|
| E1 | A 5th `Button` variant or a 4th size | **Type** — the union in `ButtonProps`, plus a `@ts-expect-error` guard line in `Button`'s test | The set *is* a type. Widening it is a type change and `npm run check` is already the gate. The `@ts-expect-error` fails if someone widens the union, so the guard cannot rot. |
| E2 | A raw `<button>/<input>/<textarea>/<select>` in `layers/core-ui/src/**` that repaints a design-system control — a DaisyUI `btn*`/`input*`/`textarea*`/`select*` class, or an accent/status fill | **Lint** — new `design/no-handrolled-control`, `error` | Static property of source text. A test cannot see it without reading files, which `CLAUDE.md` says is a lint rule, not a test. Scoped to core-ui because the design system is where controls are *built* and core-ui is where they are *used* — a principled scope, not a file allowance. |
| E3 | A 7th input member | Covered by E2 + the design-system export list | A seventh input can only reach a page as a raw element or a new component; E2 catches the first and `.claude/rules/design-system.md` review catches the second. |
| E4 | A fill that is not one of the tokens | **Lint** — promote `design/no-hardcoded-color` from `warn` to `error` for core-ui (48 findings in 8 files) | The fill vocabulary is closed by `tokens.css`; the only way to add a fifth is a literal colour. Static → lint. |
| E5 | A recessed fill drawn with an outline (`--surface-container` + a full border) | **Lint** — new `design/recessed-surface-has-no-border`, `error`. **Optional, see §6** | The only part of "one meaning per fill" that is statically distinguishable. 25–32 sites. |
| E6 | Any radius not spelled as a `--r-*` token | **Lint** — new `design/radius-token-only`, `error`, replacing `design/no-off-scale-radius` | Static. Replaces rather than extends, because the old rule's allowlist (`rounded-full` permitted) is the defect. |
| E7 | A status presented outside `StatusChip`/`RowDot`; a local status→colour or status→label builder | **Lint** (`design/no-local-status-builder`, wired at `error`, extended to `.ts` files) **+ Type** (deleting `RowCell.tone` makes every remaining use a `npm run check` failure) | Static for the builder shape; a type for the channel. Deleting the prop is stronger than any rule could be. |
| E8 | A plugin rule that is registered nowhere | **Test** — totality assertion in `tools/eslint-plugin-design` | This is the one legitimate test: it imports two module exports (`rules` and the severity table) and asserts a relation between their values. No filesystem read, no grep. |

Two things AC5 cannot have, said plainly:
- **A word collision cannot be linted.** `"Attention"` is a string literal. E7 catches a *builder*; it
  cannot catch a hand-typed word. Scenario 3 is closed by fixing the one measured site and by the rule
  that status words come from the registry — a review property, not a machine one.
- **"Adding a 48th button recipe" only fails where E2 reaches.** A hand-rolled `<button>` with a
  token-legal fill in a page still passes E2 unless it uses an accent/status fill or a DaisyUI class.
  That is the honest boundary, and §4 is where it is priced.

---

## 4. The scope line — AC2 versus "out of scope" (read this before approving)

**The tension is real and it is not resolvable by interpretation.**

- AC2 says *"every value in use resolves to a member of its set; the counts above are reduced to the
  decided set."*
- Validation scenario 1 says *"when button and input recipes are counted by computed style, then each
  count equals the size of its decided set."*
- Out of scope says *"the migration of every call site, which becomes bug-list work once the set is
  decided and enforced."*
- AC6 asks only that the remaining migration be **enumerated**.

Read literally, AC2 + scenario 1 require the migration that "out of scope" excludes. Measured, that
literal reading is: **137 control sites + 62 hand-rolled chip sites + 90 radius spellings + 48 colour
literals**, i.e. essentially the whole bug list. I am not going to pick one reading silently.

### 4.1 What I recommend, with the numbers

| Axis | Closes fully in AZ7 | Sites | Enumerated as bug-list |
|---|---|---|---|
| **Radii** | **Yes.** Every radius in production `.tsx` becomes a token spelling; `design/radius-token-only` at `error` with zero survivors. AC3 fully met. | **90 occurrences / 44 files** (61 core-ui, 29 design-system) | Stories and tests: 13 occurrences. 7 CSS `border-radius` declarations. |
| **Inputs** | **Yes, in core-ui.** All 28 chrome-carrying raw text controls become `Input` / `Composer` / `SearchField` / `Select`. | 28 sites / ~14 files | none of substance |
| **Buttons** | **Partly.** DaisyUI buttons and raw buttons painting an accent/status fill are migrated; `Button` gains `size="icon"` and loses `amber`. | union **63 sites / 28 files** (48 DaisyUI + 16 accent-filled, overlapping) | ~74 further hand-rolled buttons — mostly the icon-button population and full-width row buttons that belong to `Row`. |
| **Fills** | **Vocabulary yes, meanings partly.** The fill↔job table is written and `DESIGN.md`'s contradiction is fixed; `no-hardcoded-color` goes to `error`. | 48 findings / 8 files | The 27 `--surface-container` shapes reduce over time; the outlined-recess rule (E5) is the optional extra that would close ~25 of them now. |
| **Status** | **Yes.** All five named forks are removed; `RowCell.tone` deleted; `no-local-status-builder` wired at `error`. | ~6 sites | The audit's "chip on 100% of rows carries no information — delete it" observation stays bug-list. |

**Total in-scope population: roughly 240 edited sites.**

### 4.2 How the enumeration is produced (AC6)

Not by hand. `predicates.mjs` (committed, above) emits `predicate-sites.json` — every site with file,
line, tag and the exact class string that made it a violation. The build step renders it to
`.pipeline/work/AZ7/migration-backlog.md`, grouped by axis and then by file, each line a bug-list item
in the shape the track already uses. Re-running the scanner after the migration regenerates it, so the
list cannot drift from the code.

**Blocker found while checking where it should go:** `.pipeline/AZ.md:23,57` links to
`.pipeline/AZ-bugs.md` as *"the main artifact of this track"*, and **that file does not exist** — not in
the worktree and not in git history. The ~110 bug-list items the track was split around are currently
unregistered anywhere. AZ7 will write its own backlog into `.pipeline/work/AZ7/migration-backlog.md`
and link it from `AZ.md`; recreating the track bug list is not AZ7's job. Founder should know.

### 4.3 If the founder wants the literal reading instead

Then AZ7 additionally migrates ~74 hand-rolled buttons, ~62 hand-rolled chips and ~25 outlined recesses,
`design/no-handrolled-control` widens from "DaisyUI or accent fill" to "any chrome", and the work roughly
doubles. That is a legitimate choice — it would make validation scenario 1 literally true — but it is a
different work package size than the plan implies, and it should be an explicit amendment rather than
something I assume.

---

## 5. Technical plan

### 5.1 Files and ownership

**New (3 files):**
- `tools/eslint-plugin-design/src/rules/radius-token-only.ts` + `__tests__/radius-token-only.test.ts`
- `tools/eslint-plugin-design/src/rules/no-handrolled-control.ts` + `__tests__/no-handrolled-control.test.ts`
- `tools/eslint-plugin-design/src/hearth-config.ts` — the total severity table and the two flat-config blocks
  + `src/__tests__/hearth-config.test.ts` (totality)

**Deleted:**
- `tools/eslint-plugin-design/src/rules/no-off-scale-radius.ts` (+ its test) — superseded by
  `radius-token-only`. Its allowlist permitting `rounded-full` is the defect.
- `Button`'s `amber` variant; `RowCell.tone` + `Row.toneColor`.

**Changed (design system):**
- `framework/design-system/src/Button.tsx` — drop `amber`; add `size="icon"`; hover tint
  `--surface-page` → `--accent-primary-dim`; pill spelled as the token.
- `framework/design-system/src/Row.tsx` — remove `tone` from `RowCell` and `toneColor`.
- `framework/design-system/src/StatusChip.tsx`, `Tag.tsx`, `Progress.tsx`, `TabBar.tsx`, `Toggle.tsx`,
  `BetCard.tsx`, `ThreadRow.tsx`, `ThreadHostBanner.tsx`, `SearchField.tsx`, `RichMessageCard.tsx`,
  `ErrorState.tsx`, `Composer.tsx`, `block/*` — radius spellings; `SearchField` fill
  `--surface-container` → `--surface-elevated`; `RichMessageCard`'s verdict buttons become `Button`.
- `framework/design-system/src/*.stories.tsx` — stories for the new `size="icon"` and the reduced
  variant set (a story is a required deliverable, `.claude/rules/design-system.md`).
- `framework/design-system/DESIGN.md` + `AESTHETICS.md` — the five tables from §2; retire `DESIGN.md:67`;
  AQ-011 gains "one spelling per radius" and AQ-101's `rounded-full` allowance is removed.

**Changed (app):** 28 files for the control migration, 44 for radius, 8 for colour literals, 4 for
status — overlapping; roughly **60 distinct files** under `layers/core-ui/src/`.

**Changed (config):** `eslint.config.ts` — the K6 and K8 blocks are replaced by spreading
`design.configs.hearth`; ignores preserved verbatim. `package.json` — `lint:design` gains `--quiet`'s
absence fix by scoping to the design plugin config (D3).

**Changed (rules files):** `.claude/rules/aesthetic-quality.md` AQ-011/AQ-101 as above. Also
`.claude/rules/frontend.md` still says "forest green accent" — already tracked as `UI-171`, not AZ7's.

### 5.2 Contracts

```
// Button — the closed set, enforced by the type checker
variant: "primary" | "secondary" | "ghost" | "destructive"
size:    "default" | "sm" | "icon"

// Row — status is no longer a cell property
interface RowCell { content; width?; align?; numeric?; hideBelow?; "data-testid"? }

// eslint-plugin-design — wiring is total by construction
export const RULE_SEVERITY: Record<keyof typeof rules, { coreUi: Severity; designSystem: Severity }>
export const configs: { hearth: Linter.Config[] }
```

Rule predicates, stated exactly so a reviewer can re-derive the populations:

- `radius-token-only` — on a `className` attribute, any token matching
  `^rounded(-side)?(-named)?(-\[…\])?$` that is not `rounded-none` and not
  `^rounded(-side)?-\[var\(--r-(none|subtle|default|pill)\)\]$` is a violation.
- `no-handrolled-control` — on `<button>|<input>|<textarea>|<select>` under `layers/core-ui/src/**`:
  a class matching `^(btn|input|textarea|select)(-[a-z0-9]+)*$`, **or** a `bg-[var(--accent-*)]` /
  `bg-[var(--status-*)]`, is a violation. `checkbox|toggle|radio|range` classes are not matched
  (AQ-011 form-control exemption).
- `no-local-status-builder` — unchanged predicate; wired at `error` and extended to `.ts`.

### 5.3 Ordered tasks

Red before green throughout (`CLAUDE.md` First Principle). Each rule's `RuleTester` test is written and
failing before the rule exists; each migration is verified by running the rule.

1. **Write the rule tests** — `radius-token-only`, `no-handrolled-control`, `hearth-config` totality.
   All red.
2. **Write the rules + the config block.** Wire `design.configs.hearth` in `eslint.config.ts` with every
   AZ7 rule at `error`, everything else at its current severity. Rule tests green; `npm run lint` now
   **red** with the full violating population — this is the moment the enforcement is proven to bite.
3. **Design-system set changes** — `Button` (drop `amber`, add `size="icon"`, hover tint), `Row`
   (delete `tone`), stories, `@ts-expect-error` guards. `npm run check` red at the one `RowCell.tone`
   call site, then green.
4. **Radius sweep** — 90 occurrences → token spellings, design-system first, then core-ui.
5. **Control migration** — 63 sites: DaisyUI buttons/inputs → `Button`/`Input`/`Composer`/`SearchField`/
   `Select`; accent-filled raw buttons → `Button`; `RichMessageCard` verdict buttons → `Button`.
6. **Status forks** — the five sites in §1.6; `SearchField` fill; the `"Attention"`/`BLOCKED` word.
7. **Colour literals** — 48 findings in 8 files → tokens; promote the rule.
8. **Docs** — `DESIGN.md`, `AESTHETICS.md`, `.claude/rules/aesthetic-quality.md`.
9. **Enumerate** — regenerate the scan, render `migration-backlog.md`, link it from `.pipeline/AZ.md`.
10. **Prove** — §5.4.

### 5.4 Evidence plan — what proves each AC, by what command

| AC | Proof | Command |
|---|---|---|
| AC1 (a written closed set per axis, each entry stating its job) | §2 of this artifact, transcribed into `framework/design-system/DESIGN.md` | review |
| AC2 (values resolve to a set member; counts reduced) | Scanner re-run: radius spellings = 4; core-ui raw chrome-carrying text controls = 0; DaisyUI control classes = 0 | `node .pipeline/work/AZ7/measurement/scan.mjs "$PWD" /tmp/az7-after` |
| AC3 (one pill spelling; every radius on scale) | `radius-token-only` at `error` with zero findings | `npm run lint` |
| AC4 (one meaning per fill) | The fill↔job table; `no-hardcoded-color` at `error` with zero findings; `SearchField` on `--surface-elevated` | `npm run lint` + review |
| AC5 (adding a variant outside a set fails verification) | (a) rule tests; (b) **live break-test**: add a 5th `Button` variant → `npm run check` fails; add `rounded-lg` to a page → `npm run lint` fails; add `btn btn-primary` to a page → `npm run lint` fails; revert each and both go green | `npm run check`, `npm run lint` |
| AC6 (remaining migration enumerated) | `.pipeline/work/AZ7/migration-backlog.md`, generated from `predicate-sites.json` | `node .pipeline/work/AZ7/measurement/predicates.mjs "$PWD" …` |
| Scenario 2 (verification fails and names the offence) | Same live break-test; the message names the rule and the offending class | `npm run lint` |
| Scenario 3 (same status, same word and treatment) | The team page shows one word for one state; existing `AI4-status-language.spec.ts` still green | `npm run test:e2e` (local) |
| Whole package | `npm run verify` green; affected unit/component tests green; the painted result looked at in the browser before "done" | `npm run verify`, `npm run test` |

**Scenario 1 needs a decision.** As written it wants a computed-style count in the running app equal to
the set size. After the recommended scope that will be true for **radii** and for **input recipes on the
routes reachable with the existing e2e fixtures**, and **not** true for buttons (~74 hand-rolled buttons
remain, enumerated). Options: (a) accept the static scan as AC2's evidence and treat scenario 1 as the
bug-list exit criterion — recommended; (b) add one Playwright spec that counts computed recipes and
asserts only on the axes that fully close — there is precedent (`__e2e__/AI1-token-visual-proof.spec.ts`,
`AI4-status-language.spec.ts` mock the API with `page.route()`, so no server or database is needed);
(c) take the literal reading from §4.3. I recommend (a), with (b) as a cheap add if the founder wants a
number from the running app.

### 5.5 Size, and the assumption that makes it big

Estimated diff: **roughly 1,100 lines**, of which about 800 are one-line-per-site substitutions
(90 radius tokens, 63 control migrations, 48 colour literals) and about 300 are new rule code and tests.

`CLAUDE.md` says to stop at 1,000 lines and name the assumption. **The assumption is that every new rule
is cleared to zero survivors in the same pull request.** That is the repo's stated policy and the
alternative — a baseline or a per-file ledger — was deliberately removed in AU31/AU32, so I am not
proposing to bring it back. Two cuts are available if the founder wants it smaller:

- **Cut A (−~110 lines):** drop the `no-hardcoded-color` promotion (48 findings / 8 files, mostly
  `ReviewBrowserPreview.tsx`). Cost: the fill *vocabulary* is closed by convention rather than by lint.
- **Cut B (−~80 lines):** drop the accent/status-fill arm of `no-handrolled-control`, leaving only the
  DaisyUI arm (48 sites instead of 63). Cost: a hand-rolled button that paints an accent fill still
  passes.

Neither cut touches radii, inputs or status. With both, the package lands around 900 lines.

---

## 6. Blockers and trade-offs for the gate

**Blocker 1 — the scope line (§4).** Approve the recommended reading (close radii, inputs and status
fully; close buttons partly; enumerate the rest), or ask for the literal reading (§4.3), which roughly
doubles the work. Nothing is built until this is answered.

**Blocker 2 — `.pipeline/AZ-bugs.md` does not exist.** The track file calls it "the main artifact of
this track" and links to it twice. It is not in the worktree and not in git history, so the ~110
bug-list items are currently written down nowhere. AZ7 will write its own backlog file; recreating the
track's bug list is a separate decision.

**Trade-off 1 — which spelling of "pill" wins.** I chose `rounded-[var(--r-pill)]` over `rounded-full`.
Both render identically. The token spelling means every radius in the app computes to a value on the
documented scale, so any future computed-style measurement reads clean — which is exactly the mistake
that produced the "99 off-scale radii" finding. The cost is that 69 sites change and Tailwind's most
familiar radius class becomes a lint error in this repo.

**Trade-off 2 — `variant="amber"` is deleted.** Zero production uses. If it is being held for something
planned, say so and it stays.

**Trade-off 3 — icon buttons get bigger.** The shipped hand-rolled icon buttons measure 16, 18, 20, 24,
28 and 32px.
`Button size="icon"` is one size (32px desktop, 44px touch floor below `lg`), per AQ-003 "one size per
component". Migrating them makes the small ones visibly larger. This is a visible change to dense
surfaces (`ConversationSurface`, `KnowledgeList` triage rows, `SessionView`). The alternative is two
icon sizes, which reopens the density argument AQ-003 closed. I recommend one size and will show the
painted result before calling it done.

**Trade-off 4 — `no-handrolled-control` is scoped to `layers/core-ui/src/**`.** The design system is
where controls are built, so its own internals (`Toggle`'s accent-filled button, `Composer`'s textarea)
must be allowed to paint chrome. That scope is a boundary, not a file allowance — but it does mean a
fork inside the design system is caught by review rather than by lint, as `RichMessageCard` was.

**Trade-off 5 — E5 (recessed surfaces carry no outline) is optional.** It is the only statically
checkable part of "one meaning per fill" and it would close ~25 of the 27 `--surface-container` shapes.
It also has genuine design risk: it forces `SearchField`, `BlockRefEmbed`, the `<kbd>` key caps and the
toast onto either a fill without an outline or an elevated fill with one. Include it and AC4 has teeth;
leave it out and AC4 is a written table plus a vocabulary lock. **My recommendation: leave it out of
AZ7** — outlines and elevation are AZ15's axis, and closing them here would decide AZ15's question
early.

**Not a blocker, worth knowing.** `npm run lint:design` is broken on `main` today (§3.1 D3), and the
whole warn tier of design lint — 108 off-grid spacing findings among them — is invisible in `verify`.
AZ7 fixes the command and moves its own five axes to `error`. Spacing stays at `warn` because it is
explicitly AZ15's package; that means 108 findings remain unenforced after AZ7, by design.
