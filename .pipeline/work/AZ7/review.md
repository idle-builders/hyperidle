# AZ7 review — Close the visual system

**Reviewer:** fresh independent evaluator, read-only. **Evaluation 1.**
**Verdict: NOT-DONE.**

The enforcement half is real — every lint rule was shown going red by the reviewer's own probes.
The migration half is over-claimed: one new set member does not render at all in the running app,
the input axis did not close, one named deliverable was never made, and validation scenario 3 still
fails on the exact page it was written for.

## Verified by running

| Command | Result |
|---|---|
| `npm run lint` | green (biome + eslint + 3 governance passes) |
| `npm run check` | green — 54/54 packages |
| `npm run test:full` | green — 570 files / 6181 tests |
| `npx eslint --config eslint.design.config.ts` (core-ui + design-system) | zero design-rule errors; remaining are warn-level and outside AZ7's axes |
| `scan.mjs` re-run | radius: `--r-pill` 153, `--r-subtle` 127, `--r-default` 67, `rounded-none` 1, `rounded-[6px]` 1 (Checkbox exemption). No `rounded-full` anywhere |
| `predicates.mjs` re-run | reproduced committed `predicate-summary.json` byte-for-byte |
| Lint break-test (own probe files, both packages) | 14 errors, correct rules and messages, under `--quiet`. Reverted |
| Type break-test — re-add `amber` | 2 errors. Reverted |
| Type break-test — add a *new* 5th variant properly | **green** — see B5 |
| `hearth-config` totality break-test | genuinely red at `hearth-config.test.ts:18`. Reverted |
| App in browser, demo world seeded | screenshots + computed style of composer, knowledge triage, team roster |

Worktree clean; every probe reverted.

## Acceptance criteria

| AC | Verdict | Evidence |
|---|---|---|
| AC1 written closed set per axis, each stating its job | PASS | `DESIGN.md` §Closed Sets — five tables. Two sentences factually wrong (B1, B5) |
| AC2 every value resolves to a set member | **FAIL** | Radius pass, status pass. Inputs: 3 of 28 never migrated (B2). Buttons: 8 of the approved 63-site union survive behind inline disables (N1) |
| AC3 one pill spelling, every radius on scale | PASS | Scanner + browser confirm `rounded-full` is no longer emitted into CSS. One documented `rounded-[6px]` exemption |
| AC4 each fill has exactly one meaning | **FAIL as product property** | `--surface-page` still fills cards, empty states, error states, code blocks, avatars, inputs, hover tints, chips, tab troughs — 47 uses, ~10 jobs. AC4's named evidence (`SearchField` → `--surface-elevated`) was not made (B3). Approved as "meanings partly" → read as deferred, not delivered |
| AC5 outside-set variant fails verification | **PARTIAL** | Lint arms proven red. Button type arm only fails for the one removed spelling (B5) |
| AC6 remaining migration enumerated | PASS | `migration-backlog.md` — 45 items in AZ-bugs shape, generated from `predicate-sites.json`, six items defer to existing Batch D ids. Generator re-run, inputs match |
| Scenario 1 counts equal set size | Radius yes; buttons no (99 recipes remain) — the founder-approved reading |
| Scenario 2 verification names the offence | PASS — verified, messages name rule and offending class |
| Scenario 3 same status → same word and treatment | **FAIL** (B4) |

## BLOCKING

### B1 — `Button size="icon"` has no size in the running app; conversation Send is a 17px sliver
`framework/design-system/src/Button.tsx:63-68` · `layers/core-ui/src/components/ConversationSurface.tsx:390`

Measured at 1440px: `button[aria-label="Send message"]` → **width 17px**, height 44px, radius 9999px.

Cause: Tailwind does not scan `framework/design-system/src`. Utilities existing only there are never
generated. Live stylesheet probe: `w-[44px]`, `h-[44px]`, `lg:w-[32px]`, `lg:h-[32px]`, `lg:min-h-[36px]`
all absent; `min-h-[44px]` and `w-[32px]`/`h-[32px]` present only because core-ui also uses them.

`size="icon"`'s entire geometry is dead CSS. **This is a regression the change caused**: before AZ7 the
same control was `h-[32px] w-[32px] shrink-0` inside `ConversationSurface.tsx`, which Tailwind does scan,
and it rendered 32×32. Moving geometry into the design system deleted it.

Failure scenario: a user opens any conversation and Send is a narrow vertical capsule crammed against the
composer edge. `SessionView.tsx:618,622` uses the same primitive in the same flex shape. `DESIGN.md` tells
the next builder it is "32px desktop, 44px touch floor" — it is neither. `progress.json` records it as
"visually confirmed correct on ConversationSurface" — it is not.

### B2 — Input axis did not close: 3 of 28 controls remain hand-rolled
`SetupFlow.tsx:837` · `HostThreadSection.tsx:333` · `RecipientPicker.tsx:239`

Exactly the three sites §1.3 named. Approved §4.1: "All 28 chrome-carrying raw text controls become
`Input`/`Composer`/`SearchField`/`Select`. Enumerated as bug-list: none of substance." 25 DaisyUI ones
migrated; the 3 hand-rolled ones were filed as UI-183/190/201 instead. `progress.json` claims
"28 sites migrated" — 25 migrated, 3 remain. The lint rule reports zero because its predicate only catches
DaisyUI classes and accent fills; these paint token-legal chrome by hand.

`HostThreadSection.tsx:337` also violates Set 3 directly: a text input on `bg-[var(--surface-page)]`,
where Set 3 says nothing that is not the page background uses it as a fill and puts inputs on
`--surface-elevated`. AZ7 removed this exact second job from `Button`'s hover tint and left it on an input.

### B3 — `SearchField`'s fill was never changed
`framework/design-system/src/SearchField.tsx:41` — still `bg-[var(--surface-container)]` with
`focus:bg-[var(--surface-page)]`. The only line the diff touched here is a `rounded-full` token swap.
§5.1 lists the fill change as a deliverable and §5.4 names it as one of three pieces of AC4's proof.
Not done, and the omission is recorded nowhere. `focus:bg-[var(--surface-page)]` is a second
`--surface-page` job on an input — the same defect AZ7 fixed on `Button`.

### B4 — Validation scenario 3 still fails on the team page
`WorkTeam.tsx:344` vs `:728`. Rendered, `/work/team/demo-team-acme`: header chip reads **BLOCKED**
(red `StatusChip`); the STATUS tile two rows below reads **Behind** (plain bold text). Same page, same
object, two words and two treatments. Swapping "Attention" for "Behind" moved the word into the vocabulary
but did not make it match — arguably worse, since "Behind" is now a real status word contradicting the chip.
The tile is not a `StatusChip`, so the treatment does not match either. §3.3 claimed the scenario was
closed by fixing the one measured site. It is not closed.

### B5 — Claims shipped in tracked files that are not true
- `DESIGN.md` §Closed Sets: "Adding a value outside a set is either a type error (Button)…" — adding a
  proper 5th variant (`"warning"` in the union **and** `VARIANT_CLASSES`) leaves `tsc --noEmit` clean,
  exit 0. The `@ts-expect-error` guard at `W2-primitives.test.tsx:280` only fires on the literal string
  `"amber"`. The guard is real for call sites, empty for the set definition.
- `DESIGN.md`: `icon` is "32px desktop, 44px touch floor" — see B1.
- `.pipeline/AZ.md:37`: "all at error, zero survivors" — 8 sites in the approved union survive behind
  inline disables (N1).
- `progress.json`: "28 sites migrated" — see B2.

These are the files the next builder reads. Leaving them is how the next work package gets planned
against a false baseline.

## Non-blocking

- **N1** 8 suppressions of `no-handrolled-control`; 5 are the rule mis-firing on
  `bg-[var(--accent-primary-dim)]` (`ConversationSurface.tsx:264,376`, `Sidebar.tsx:255`,
  `WorkBet.tsx:1361`, `ReviewComposition.tsx:504`) — Set 3 defines that token as exactly the row-hover
  tint. The predicate should exclude it; suppressing means every future hover tint needs a disable comment,
  which is how a rule stops biting. The other 3 (`SetupFlow.tsx:905`, `ReviewCodeDiff.tsx:301,464`) are
  genuine unmigrated hand-rolled controls. All 8 carry reasons and appear in the backlog.
- **N2** Per-file rule-off block at `hearth-config.ts:135-142`, in the file whose docstring forbids
  per-file allowances (§3.2 point 1: "no per-file allowance — AU31/AU32 removed those").
- **N3** `radius-token-only.ts:46,80` carries a filename allowlist `/^(Checkbox|Toggle)\.tsx$/` matched on
  **basename only** — any file anywhere named `Checkbox.tsx` is exempt. The rule's own comment admits
  `Toggle.tsx` needs no exemption and lists it anyway.
- **N4** New dead public API: `RowDot.tsx:31` exports `TONE_COLOR`, re-exported at `index.ts:146`, zero
  consumers repo-wide, not in the §5.2 contract.
- **N5** `npm run lint:design` no longer crashes but still always exits 1 (missing `react-hooks` rule
  definition + 7 unused-disable reports). A command that can never go green can never be a gate.
- **N6** `no-hardcoded-color` cannot see colours inside arbitrary Tailwind values —
  `shadow-[0_0_0_3px_rgba(...)]` passes. One live survivor at error severity: `SetupFlow.tsx:846`.
- **N7** The committed measurement folder mixes before and after with nothing marking which is which.
  `summary.json`, `radius-sites.json`, `surface-sites.json`, `status-sites.json`, `button-recipes.json`,
  `input-recipes.json` are pre-AZ7; `predicate-*.json` are post-AZ7. ~10k lines that read as one snapshot.
- **N8** 18 non-`@lore` work-package-id references in shipping source: `WorkTeam.tsx:335,601,615`,
  `SettingsHarnesses.tsx:299`, `KnowledgeList.tsx:216`, `ReviewCodeDiff.tsx:291`, `Button.stories.tsx:41`,
  `DESIGN.md`, plus tests. `KnowledgeList.tsx:216` embeds a `.pipeline/` path in a production comment and
  `ConversationSurface.tsx:261` points production source at `migration-backlog.md`.
- **N9** `hearth-config.test.ts:32-40` "break-test" is a tautology that can never go red. The real
  totality assertion at line 18 does work.
- **N10** `RULE_SEVERITY` typed `Record<string, ScopedSeverity>`, not `Record<keyof typeof rules, …>` as
  §5.2 states. Totality lives in the test lane, and `verify` runs no tests.
- **N11** Migrated `size="sm"` buttons render 44px tall on desktop (`lg:min-h-[32px]` not generated) —
  same root cause as B1. Pre-existing on main, but AZ7 moved ~40 dense actions onto it.
- **N12** `W2-primitives.test.tsx:265` asserts `className` contains `w-[44px]` — a string check, not
  geometry. It passes with the utility entirely absent from CSS, so it cannot catch B1.
- **N13** `migration-backlog.md:3` says it continues from UI-172; the first item is UI-180.
- **N14** `hearth-config.ts:96-142` dropped `languageOptions`/`tsParser`, relying implicitly on other
  blocks in `eslint.config.ts`.

## Genuinely good

- Enforcement is real and was shown going red: 14 correct errors across both packages under `--quiet`,
  the flag that made every previous design rule a no-op. D1/D2/D3 diagnosis was right; all three fixed.
- The radius axis is closed for real — `rounded-full` is no longer generated into the app's CSS.
- `hearth-config`'s totality guard works (proven red by registering an unlisted rule).
- The test edits in `18950998` are honest — spelling updates of equal strength. The `NotificationRow`
  change to `[data-ds-component="Tag"]` is a strengthening, correctly reasoned.
- Status forks genuinely fixed: roster renders a real `StatusChip`, the private `Status` type imports from
  the design system, `SettingsHarnesses` uses `RowDot`. `RowCell.tone` deletion is a clean type-level guard.
- Input migrations preserve behaviour — controlled value, `onChange`, `disabled`, `maxLength`, `onKeyDown`,
  `rows` all carried across.
- AC6's backlog is real work, generated, in the track's shape, deferring to existing ids.

---

# AZ7 re-review — evaluation 2

**Fresh independent reviewer, read-only. Verdict: NOT-DONE.**

All five blocking findings from evaluation 1 are genuinely fixed, each reproduced by running.
But the B1 fix changed which CSS the app ships, and that surfaced one new blocking failure.

## The five blocking findings — all FIXED

| # | Verdict | Evidence run |
|---|---|---|
| B1 icon button geometry | **FIXED** | `button[aria-label="Send message"]` computes **32×32** at 1440px, **44×44** at 768px. Root cause was a pre-existing broken `@source` glob on origin/main (`layers/core-ui/src/index.css:78` pointed at the nonexistent `layers/design-system/src`). Reverting the glob makes the new e2e spec red — the guard bites |
| B2 three inputs | **FIXED** | Browser-verified: HostThreadSection composer is `INPUT` on `--surface-elevated`, `--surface-page` gone, `data-testid` preserved so `WorkBet.tsx:598`'s querySelector still resolves. RecipientPicker keeps Escape-to-close. Ref forwarding real. Scanner: **0** raw chrome-carrying text controls in core-ui production |
| B3 SearchField fill | **FIXED** | Blurred and focused both `rgb(255,255,255)`; focus shows border `--accent-deep` + 3px ring. `focus:bg-[var(--surface-page)]` gone |
| B4 WorkTeam status fork | **FIXED** | Header chip BLOCKED (red StatusChip); tile reads AGENT HEALTH / Needs attention / 4 idle agents. Label is honest — the tile rolls up `deriveHealthLevel`, a different measurement from `deriveTeamStatus`. Neither displayed word is a StatusChip word |
| B5 AC5 type arm | **FIXED** | Reproduced the exact break-test: `"warning"` in the union AND `VARIANT_CLASSES` → `npm run check` **FAILS** (`W2-primitives.test.tsx(313,8): TS2322`). Reverted → 54/54 pass |

N1, N3, N8, N9, N12 all confirmed fixed. **The fix diff adds zero suppressions** — no `eslint-disable`, no
`ts-expect-error`, no `.skip`, no widened allowlist, no weakened test. It removes five disables.
`npm run verify` green, `npm run test` green (265 files / 2566 tests), 14/14 relevant Playwright specs green.

## NEW BLOCKING

### NEW-1 — the pill has two spellings again, and the app paints both
`framework/design-system/src/CommentRow.tsx:246-247` — both branches of a ternary build a class string
containing `rounded-full`, assigned to a variable and only then passed to `className`.

**Measured:** open the sidebar assistant — **18 elements** compute `border-radius: 3.35544e+07px`.
Every other pill computes 9999px. `CommentRow` ships via `index.ts:71-72` → `ThreadShell` →
`AssistantOverlay.tsx:447`: two clicks from app open.

**Why it is new to this branch.** These two lines exist on origin/main too, but the broken `@source` glob
meant `.rounded-full` was never generated, so they painted square. Evaluation 1's AC3 evidence recorded
exactly that ("`rounded-full` is no longer generated into the app's CSS"). **The B1 fix invalidated that
evidence** — `.rounded-full` is one of 198 CSS rules that came back.

**Why nothing caught it.** The class string is held in a variable before reaching `className`.
`radius-token-only` reads JSX `className` attributes, so `npx eslint --no-inline-config CommentRow.tsx`
exits 0. `scan.mjs` and `predicates.mjs` share the blind spot and report no `rounded-full` anywhere.
This is the exact failure AC5 exists to prevent: an out-of-set value passing silently.

**Failure scenario.** A builder copies the adjacent line to add a sibling avatar, ships a third
`rounded-full`, and lint, check and test are all green — while the app's most-used radius is again an
off-scale value that a computed-style audit reports as the headline defect. `:247` also paints
`bg-[var(--surface-page)]` on an avatar, the same Set 3 second-job defect B2 and B3 removed elsewhere.

**Tracked files now untrue:** `DESIGN.md:259-266` ("`rounded-full` … are all lint errors"),
`.pipeline/AZ.md:37` ("Radii, inputs and status close fully"), `progress.json` ("90 → 0").

## AC status after evaluation 2

AC1 PASS (two sentences now false per NEW-1) · AC2 PARTIAL (inputs now 28/28 and status close; radius does
not) · **AC3 FAIL** (NEW-1) · AC4 FAIL as product property, founder-deferred; its one named deliverable
(SearchField) is now delivered · AC5 PARTIAL (type arm proven red; the radius rule cannot see a class
string in a variable) · AC6 PASS (backlog regenerates byte-identically, 44 items; does not cover NEW-1) ·
Scenario 2 PASS · **Scenario 3 PASS** · Scenario 1 radius now fails too.

## New non-blocking

- **NB-1** The `@source` repair made the whole design-system utility surface live for the first time:
  **+198 CSS rules, 0 removed**. Spot-checked team page, a dialog, the assistant overlay, the bet page,
  `/knowledge`, `/setup` — all paint correctly, and dense buttons going 44px → 34/36px is what the design
  intended (this resolves N11). But no one has swept every surface whose modal width, popover position,
  toggle thumb or status tint only started applying with this commit.
- **NB-2** `Input`'s textarea mode cannot reach its own minimum height. `Input.tsx:56` puts
  `lg:min-h-[36px]` in `INPUT_BASE`; `:79` appends `min-h-[80px]` for textarea. CSS order wins over class
  order, so at ≥1024px computed `min-height` is 36px — measured on RecipientPicker's message box. Newly
  visible because both utilities only became live with the B1 fix.
- **NB-3** Two members of the closed Input set still paint `--surface-page`: `Composer.tsx:86`,
  `RoleCombobox.tsx:217`. Same defect B3 fixed on `SearchField`, same package. AC4 is founder-deferred, so
  not blocking, but the set is internally inconsistent about its own rule.
- **NB-4** Design-system `.stories.tsx` files sit inside the app's `@source` glob, so story-only utilities
  now ship in the production stylesheet — development-world markup shaping a production artifact.
- **NB-5** `Button.tsx:62`'s prose comment containing `lg:min-h-[N]` is emitted as a real CSS rule.
- **NB-6** `measurement/predicate-summary.json` is the BEFORE snapshot (radius 91→3, control chrome
  137→79, chips 62→64 on a fresh run). Pins down evaluation 1's N7.
- **NB-7** `plans/AI4/proof/*.png` are rewritten by `AI4-status-language.spec.ts` and now differ because
  AZ7 changed button heights. Restored by the reviewer; someone should decide whether to refresh them or
  stop the spec writing into tracked files.
