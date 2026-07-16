# LG1 — Lint/Knip Strict Migration Plan

Goal: every warning-level finding currently silently tolerated by `npm run lint`
becomes a hard failure, with zero regression in what's enforced today. Fix
first, flip second. `npm run knip` is already clean; only its CI-gating scope
changes.

## Baseline (verified 2026-07-17, re-measured empirically — not copied blind
from recon)

- ESLint (with the 3 broken type-aware rules disabled via CLI override so it
  doesn't crash): **274 warnings** exactly matching the recon breakdown
  (no-off-grid-spacing 111, no-hardcoded-color 50, react-compiler 35,
  no-off-scale-radius 18, no-op-button 13, unused-disable-directives 11,
  no-undefined-font-heading 10, exhaustive-deps 8, no-ai-aesthetic 8,
  require-stories-sibling 6, no-explicit-any 2, require-focus-on-interactive 2).
- Biome (`--reporter=json`, confirmed via direct diagnostic count): **538
  warnings + 146 infos**, exact per-rule breakdown matches recon.
- `no-unsafe-assignment/-return/-member-access`: confirmed the crash
  reproduces exactly (`ERR requires type information`) on
  `packages/core-api/src/index.ts`. Real count unmeasured until Phase 2 wires
  type info — the ~19 indicative figure is not trustworthy, don't plan finer
  than "re-measure."
- Knip: `npx knip` and `npx knip --production ...` both exit 0. CI's
  `ci.yml` runs `npm run lint` and `npm run knip` live but **not**
  `knip:production` (confirmed by reading the workflow) — matches landscape.

## Ordering rationale

1. **Mechanical autofix first** (Phase 1) — closes the largest fraction of
   findings for near-zero risk, gives a clean, smaller baseline before any
   judgment work starts. Verified fixable: Biome `useOptionalChain` (22),
   `useLiteralKeys` (121, info), `noUselessFragments` (23, info) via
   `--write --unsafe`; ESLint unused-disable-directives (~11-15) via `--fix`.
   Verified NOT fixable by either tool: every `design/*` rule (no `fixable`
   meta on any rule in `packages/eslint-plugin-design/src/rules/`),
   `useNamingConvention`, `useAwait`, `noExcessiveCognitiveComplexity`,
   `noArrayIndexKey`, the a11y rules, `suppressions/unused`.
2. **Type-info prerequisite** (Phase 2) is its own phase, before any
   no-unsafe-* fixes, because you cannot size or fix findings that don't
   exist yet under a crashing rule.
3. **Config-only / zero-code-risk buckets next** (Phase 4, 9a, 15's config
   step, 19c) — buckets where the fix is a config/waiver/doc change, not a
   code edit, sequenced early because they're fast and de-risk later phases
   (e.g. the `useNamingConvention` config override in Phase 15 should land
   before burning manual-rename effort on findings that override will erase).
4. **Structural/mechanical-but-visual buckets** (stories, font-heading,
   radius, ai-aesthetic, off-grid-spacing) — low logic risk, closed value
   sets, but require real screenshot verification (visual-regression.md).
5. **Behavior-risk buckets last** (react-hooks/exhaustive-deps, react-compiler,
   useAwait, noExcessiveCognitiveComplexity, no-unsafe-*) — these can change
   runtime behavior, not just style; sequenced last so the codebase is
   already clean everywhere else and reviewers can focus entirely on
   behavior-preservation for these phases.
6. **Full re-verification checkpoint** (Phase 18) before the flip, so the
   flip phase is a pure, low-drama config change against a genuinely clean
   tree.
7. **The flip** (Phase 19) last, atomic, config-only.

Total: **19 top-level phases**, 8 of which are split into lettered
sub-phases (a/b/c) for large buckets → **~30 sequential builder iterations**.
Each iteration is independently verifiable and should be its own commit.

---

## Phase 1 — Mechanical autofix sweep (repo-wide)

**Closes:** Biome `useOptionalChain` (22, warn), `useLiteralKeys` (121, info),
`noUselessFragments` (23, info); ESLint unused-eslint-disable-directives
(~11-15, folds into the "no ruleId" bucket + a few incidental). **Autofix.**

Actions:
1. `npx biome check . --write --unsafe` (repo-wide). Verified semantically
   safe for this codebase's actual usages of `useOptionalChain` (`!x ||
   x.y !== 'V'` → `x?.y !== 'V'` — same truth table for undefined/null `x`).
2. `npx eslint . --fix --rule '{"@typescript-eslint/no-unsafe-assignment":"off","@typescript-eslint/no-unsafe-return":"off","@typescript-eslint/no-unsafe-member-access":"off"}'`
   — the CLI override avoids the crash without touching `eslint.config.ts`
   yet (that's Phase 2's job). Verified: warning count drops 274 → 259 on a
   real run.
3. **Known caveat, must check:** the `--fix` removal of an unused
   `// eslint-disable-next-line ...` comment can leave a stray blank/
   whitespace-only line (observed in `packages/web/src/hooks/useTeam.ts`).
   Run `npx biome check . --write` again after the eslint fix (Biome's
   formatter normalizes it) and `git diff` to confirm no dangling empty
   comment lines survive.
4. Diff review: `git diff --stat` should show only mechanical changes
   (bracket→dot property access, `!x||x.y` → `x?.y`, removed JSX fragments,
   removed disable comments). Anything else in the diff is a red flag —
   investigate before committing.

**Verify:** `npm run check && npx biome check . --reporter=summary && npm run test:full`
(full suite, not affected-only — this touches files repo-wide). Confirm
Biome's warn+info total dropped by ~166 and ESLint's crash-disabled count
dropped to ~259.

**Risk:** LOW. AST-level, semantics-preserving. Still full-test-gated because
`--unsafe` is Biome's own admission these aren't proven 100% safe.

---

## Phase 2 — ESLint type-info prerequisite

**Prerequisite, not a finding-fix.** Confirmed by direct repro: linting
`packages/core-api/src/index.ts` with `no-unsafe-assignment` enabled throws
`Error while loading rule '@typescript-eslint/no-unsafe-assignment': You
have used a rule which requires type information, but don't have
parserOptions set...` — this is a hard crash, not a soft warning; `--quiet`
hides it only because `--quiet` skips invoking warn-severity rules entirely.

Actions:
1. In `eslint.config.ts`, find the `api-typesafety` block (currently
   `files: ["packages/core-api/src/**/*.ts", "packages/web/src/**/*.{ts,tsx}"]`,
   `languageOptions.parser: tsParser` with no `parserOptions.project`/
   `projectService`). Add `parserOptions: { projectService: true,
   tsconfigRootDir: import.meta.dirname }` (preferred over hardcoding
   `project: [...]` paths — auto-discovers the right tsconfig per file,
   avoids brittleness across the monorepo's multiple tsconfigs). Confirm the
   installed `typescript-eslint` version supports `projectService` before
   using it (check `node_modules/typescript-eslint/package.json` version —
   should be recent; fall back to explicit `project: ["packages/core-api/tsconfig.json", "packages/web/tsconfig.json"]` if not).
2. Re-run `npx eslint packages/core-api/src packages/web/src` (rules still at
   `"warn"` — do NOT flip severity in this phase). Confirm it completes
   without the `ERR requires type information` crash.
3. Capture the REAL finding count for the 3 rules (expect drift from the
   ~19 indicative estimate — that probe used a standalone config, not this
   one). Record it in this doc's "Phase 2 results" note for Phase 3 sizing.
4. Time `npm run lint:eslint` before/after — type-aware linting is slower;
   log the delta (informational; only a blocker if egregious, e.g. >2x).
5. For any finding, decide fix (Phase 3) vs. narrow documented exclude —
   default to fix; only exclude with an explicit, narrow, commented reason.

**Verify:** `npm run check` unaffected (config-only, zero `.ts` edits);
`npx eslint packages/core-api/src packages/web/src` completes clean of
crashes; new count logged.

**Risk:** MEDIUM. Wiring `projectService` changes file resolution for the
whole scoped glob — watch for "parserOptions.project has been set... but
this file was not found in any project" on files outside a tsconfig's
`include`; those need adding to tsconfig include or an explicit ignore, not
silent skipping.

---

## Phase 3 — Fix real no-unsafe-* findings

**Sized from Phase 2's measured count.** If ~19-30 (matches indicative
estimate), do as ONE bounded phase. If Phase 2 finds substantially more
(>50), split by package: core-api first, web second.

Per finding: find the `any`-typed source (JSON.parse result, external SDK
callback, catch(err) binding, Drizzle raw-query result) and give it an
explicit type or zod schema — never a bare `as` cast (repo rule: no unsafe
casts), never `@ts-ignore`.

**Verify:** `npm run check && npx eslint packages/core-api/src packages/web/src && npm run test:full`
(full suite — type-narrowing changes runtime branching).

**Risk:** MEDIUM-HIGH per finding. This rule exists to catch real "any
laundering" bugs — treat each fix as a potential behavior-preserving bug
fix, not a lint-satisfy. Verify the added type actually matches runtime
reality by reading the call site.

---

## Phase 4 — Structural/config-only bucket (zero code-behavior risk)

**Closes:** `design/no-op-button` (13), `design/require-focus-on-interactive`
(2), `@typescript-eslint/no-explicit-any` (2).

- **`design/no-op-button` (13):** confirmed by direct measurement — **all 13
  hits are in `packages/web/src/**/__tests__/**/*.test.tsx`** (BetCard,
  EmptyState, KnowledgeRow, NotificationRow, Sidebar.settings, TaskCard,
  ThreadRow, foundation.component, W3-knowledge). This matches the existing
  K6-AC2 comment in `eslint.config.ts` ("the rule's 13 false-positive hits
  are all in test fixtures") — these are not real no-op buttons, they're
  test mocks. Fix: extend the broad K6 warn-level block's `ignores` (the
  block at `files: ["packages/web/src/**/*.tsx"]`, currently only ignoring
  `*.stories.tsx`) to also ignore `**/__tests__/**` and `*.test.tsx` for
  this rule — mirror the K6-AC2 block's ignore list rather than deleting
  the rule from the broad block (deleting would silently stop enforcing
  `no-op-button` outside `pages/**`+`components/**`, e.g. in `shell/**`,
  `settings/**` — a real coverage regression).
- **`design/require-focus-on-interactive` (2, `GlobalSearchPanel.tsx`,
  `Sidebar.tsx`):** waivers.md already documents this exact class
  (dialog-overlay backdrop divs). For each: read the component to confirm
  it's genuinely a click-outside-to-close backdrop with no independent
  keyboard-reachability need (vs. actually needing `tabIndex={0}
  role="button"`). Prefer the real a11y fix; only waive (inline
  `eslint-disable-next-line design/require-focus-on-interactive` + reason)
  if truly backdrop-only, and record in waivers.md.
- **`no-explicit-any` (2):** `tool-handlers-bindings.ts:141`,
  `SettingsHarnesses.stories.tsx:128` — give explicit types.

**Verify:** `npx eslint packages/web/src` (crash-disabled override) + `npm run test` (affected).

**Risk:** LOW for no-op-button (pure config). LOW-MEDIUM for
focus-on-interactive — verify keyboard-tab behavior in the running app
(`/run` skill), not just lint-green, per CLAUDE.md's proof-before-done rule.

---

## Phase 5 — `design/require-stories-sibling` (6)

Files: `AssistantAttachButton.tsx`, `ProsePart.tsx`, `QuestionnairePart.tsx`,
`ReviewRequestPart.tsx`, `ReviewResolvedPart.tsx`, `UnknownPart.tsx`. Each
needs a `.stories.tsx` sibling rendering key states (empty/loading/error/
populated per testing.md). Use an existing `parts/*.stories.tsx` sibling as
the template.

**Verify:** `npx eslint packages/web/src/components` → 0 remaining; render
each new story in the design-system viewer / screenshot to confirm it
actually renders representative states, not a placeholder stub.

**Risk:** LOW (additive only) but reviewer must screenshot-check each — a
story that satisfies the linter but renders one degenerate state doesn't
meet testing.md's bar.

---

## Phase 6 — `design/no-undefined-font-heading` (10) + `design/no-off-scale-radius` (18)

Files (font-heading): `ArtifactSection.tsx` (4), `TaskSheet.tsx` (4),
`ArtifactThreadsSummary.tsx` (2). Files (radius, top): `KnowledgeList.tsx` (5),
`GlobalSearchPanel.tsx` (3), `ReviewComposition.tsx` (3), + 7 more with 1 each.

Both are closed-scale swaps: `font-heading` → `font-[600]`/`font-[500]` or
`PageHeader`/`SectionLabel`; off-scale `rounded` → `rounded-2xl`(16px)/
`rounded-none`/`rounded-full`/`var(--r-*)` per AQ-011. Low logical ambiguity
(closed enumerated scale) but IS a visual change.

**Verify:** `npx eslint <touched files>`, `npm run lint:design`, then
screenshot/viewer-render the touched pages/components before/after — no
"looks about right," actually compare pixels per visual-regression.md.

**Risk:** LOW-MEDIUM (visual only).

**Sequencing note:** `KnowledgeList.tsx` is also touched by Phase 10 (off-grid
spacing) and Phase 17b (cognitive complexity) — do this phase first among the
three to avoid stacking unrelated diffs on the same file across phases.

---

## Phase 7 — `design/no-ai-aesthetic` (8)

Files: `ReviewBrowserPreview.tsx` (2), `TaskSheet.tsx` (2),
`ReviewComposition.tsx`, `ReviewMetricsMoved.tsx`, `ReviewOutcomeSummary.tsx`,
`SettingsHarnesses.tsx` (1 each). Per-finding manual read; same
waiver-vs-fix judgment as the K8 `SearchField.tsx` "×" glyph precedent in
`waivers.md` (typographic symbol ≠ iconography).

**CAUTION:** the 2 findings in `ReviewBrowserPreview.tsx` are inside the
same deliberately-neutral "fake browser chrome" file flagged in Phase 9 —
read its header comment (lines 1-16) before touching; it may need a waiver,
not a fix.

**Verify:** screenshot diff + `npx eslint`.

**Risk:** LOW.

---

## Phase 8 — `react-hooks/exhaustive-deps` (8)

Files: `AppShell.tsx` (2), `SetupFlow.tsx`, `WorkBet.tsx`,
`RoutineDetailPane.tsx`, `AssistantOverlay.tsx`, `NotificationPopover.tsx`
(1 each). Real risk: adding a missing dep can cause infinite re-renders or
unwanted re-fetches if the dep is unstable (recreated every render). For
each: check whether the missing dep is already stable (useCallback/useMemo'd
or primitive) before adding it directly; if unstable, wrap it in
useCallback/useMemo/useRef FIRST, then satisfy the rule properly — don't
paper over with `// eslint-disable-next-line`.

**Verify:** `npm run test:full` (component tests) **AND** manually
click-through the affected surfaces in the running app (`/run` skill) —
jsdom unit tests routinely miss render-loop/perf regressions from this
class of fix.

**Risk:** MEDIUM-HIGH. Flag for reviewer: lint-green + unit-tests-green is
NOT sufficient sign-off here; require a live app check per file.

---

## Phase 9 — `design/no-hardcoded-color` (50)

### 9a — Waiver assessment for the 2 concentrated files (38 of 50)
`ReviewBrowserPreview.tsx` (27) and `ReviewRenderedInContext.tsx` (11).
Confirmed by reading `ReviewBrowserPreview.tsx`'s own header comment (lines
1-16): *"the rendered page is the one place neutral page styling is
allowed... it must read as a real web page"* — the AL1 review-canvas family
deliberately hand-builds a fake browser-chrome mockup with neutral,
non-token colors as its explicit design intent (founder-approved per the
comment's "human-design-review round 1" citation). This is NOT a token gap
to fix — bulk-converting it to tokens would fight the documented design.

Action: read `ReviewRenderedInContext.tsx`'s own header to confirm it's the
same family (same reasoning should apply, but verify — don't assume). Add a
scoped `eslint.config.ts` override (or per-file `eslint-disable
design/no-hardcoded-color` + a comment citing the file's own header) for
these two files, and add a new section to
`packages/eslint-plugin-design/waivers.md` (mirroring its existing K8
structure) documenting the waiver with file + reasoning.

### 9b — Remaining ~12 findings, 7 files
`AgentProfile.tsx`, `WorkBet.tsx`, `WorkTeam.tsx`, `ReviewVisualDiff.tsx` +
3 more (2 each/1 each). Real token-swap fixes per AESTHETICS.md § Color.

**Verify:** `npx eslint`, screenshot check, `waivers.md` updated and
referenced from the `eslint.config.ts` comment near the K6 block.

**Risk:** LOW for 9a (config/doc-only, zero behavior change) but getting the
waiver-vs-fix call wrong in either direction is a real error — either a
genuine violation gets waived away, or a deliberate design gets broken by a
well-meaning token swap. MEDIUM for 9b (visual, closed token set,
screenshot-verify).

---

## Phase 10 — `design/no-off-grid-spacing` (111, largest bucket, 3 sub-phases)

- **10a:** `SessionActivityPanel.tsx` (21) + `RecipientPicker.tsx` (12) +
  `ReviewComposition.tsx` (12) = 45 findings, 3 files.
- **10b:** `KnowledgeList.tsx` (10) + `ReviewBatch.tsx` (8) +
  `ReviewActionOperation.tsx` (7) + `ReviewCodeDiff.tsx` (7) +
  `ReviewOutcomeSummary.tsx` (5) = 37 findings, 5 files.
- **10c:** remaining ~29 findings across ~17 files (`ReviewRequestPart.tsx`,
  `ReviewRenderedInContext.tsx`, and the long tail) — re-run
  `npx eslint 'packages/web/src/**/*.tsx' --rule '{...}'` filtered to
  `design/no-off-grid-spacing` at the start of this sub-phase to get the
  exact current file list (earlier sub-phases shift line numbers).

Per finding: snap the off-grid px value to the nearest Hearth-grid value
`{3,6,9,12,18,24,36,48}` or a `--space-*` token — **unless** it matches the
AQ-001 documented EXEMPTION (button/input optically-tuned vertical padding,
badge/toggle sub-element gaps), in which case add the `//
hearth-internal-padding` file-level directive instead of forcing the
exempt value onto the grid. Check the exemption list before mechanically
"fixing" — forcing an exempt case onto the grid is a real visual
regression.

**Verify per sub-phase:** `npx eslint <touched files>`; screenshot every
touched page/component — this is the largest visual-surface bucket in the
plan, budget real screenshot time.

**Risk:** MEDIUM. Closed value set bounds the risk, but the sheer
per-file finding count creates real rubber-stamping risk — reviewer should
spot-check at least 3 of the 25 touched files per sub-phase against the
live app with fresh eyes, not just trust the diff.

---

## Phase 11 — `react-compiler/react-compiler` (35, 2 risk-tier sub-phases)

Confirmed by direct probe: findings are genuine impurity violations
("Unexpected reassignment of a variable which was defined outside of the
component... use useState instead"), plus components that got fully
skipped by the compiler because a React hooks rule was disabled nearby.
**This is explicitly the bucket most likely to require real code
restructuring, not suppression removal**, per the task's own risk callout —
confirmed true by direct inspection, not hypothetical.

- **11a (lower risk, ~15):** `.stories.tsx`/`.test.tsx` files —
  `SettingsAgents.stories.tsx` (6), `SettingsHarnesses.stories.tsx` (5),
  `SettingsWorker.stories.tsx` (5), `Conversations.stories.tsx` (4),
  `AD8b-AssistantContext.test.tsx` (3), etc. Dev/test surfaces, lower blast
  radius.
- **11b (higher risk, ~20):** real components/hooks, e.g. `useTeamAgents.ts`
  (3) and others carrying the module-level-variable-reassignment pattern.
  Fix = convert the mutable module-level state used during render into
  `useState`/`useRef`/derived state — a genuine mini-refactor, not a
  suppression removal. Any timing/re-render difference here is a real
  user-facing regression, not a lint nit.

**Verify:** `npm run test:full` **AND** manual click-through of every
touched surface in the running app (`/run` skill).

**Risk:** HIGH for 11b specifically. Reviewer should require an explicit
before/after behavior note per file in the PR description, not "lint
passes."

---

## Phase 12 — Biome low-risk cleanup bundle

**Closes:** `suppressions/unused` (23) + misc long-tail (`noConfusingVoidType`
3, `noTemplateCurlyInString` 3, `internalError/fs` 2,
`noUnusedFunctionParameters` 1, `noForEach` 1 = 10).

For each stale `biome-ignore` comment: delete it, but re-run biome on that
single file FIRST to confirm the underlying rule genuinely no longer fires
there — some staleness is from code drift (comment moved away from the
violation), not from the violation being fixed; deleting a still-needed
suppression creates a fresh real finding in the same commit (fine, but must
be caught, not left broken). Misc bundle: fix each directly per its rule.

**Verify:** `npx biome check . --reporter=summary` (global — suppressions
span many packages) + `npm run test` (affected).

**Risk:** LOW.

---

## Phase 13 — Biome `noArrayIndexKey` (17) + `noEmptyBlockStatements` (9)

`noArrayIndexKey`: needs a stable key per list item — verify the
replacement key is a genuinely unique/stable field in the data before
swapping (don't invent one; using array index only breaks reconciliation
when list order changes, so confirm the real risk before "fixing").
`noEmptyBlockStatements`: add an explanatory comment for genuinely
intentional empty blocks, or remove dead code.

**Verify:** `npx biome check . --reporter=summary` + `npm run test:full`
(list-key changes can affect component snapshots/interactions).

**Risk:** LOW-MEDIUM.

---

## Phase 14 — Biome a11y bundle

**Closes:** `useAriaPropsSupportedByRole` (28) + `noStaticElementInteractions`
(7) + `useSemanticElements` (4). Real a11y semantic fixes: remove/replace
unsupported aria-* props for the element's implicit role, add proper
interactive semantics (role/tabIndex/keyboard handler) to static elements
with click handlers, or swap `<div role="X">` for the native semantic
element. Same class as Phase 4's `require-focus-on-interactive` — apply the
same "verify keyboard reachability live" standard.

**Verify:** `npx biome check . --reporter=summary` + manual keyboard-nav
smoke test of touched surfaces in the running app; screen-reader spot check
recommended for the 2-3 highest-traffic surfaces.

**Risk:** MEDIUM. A mechanically "correct" role swap can still break
existing click/focus behavior if not tested live.

---

## Phase 15 — Biome `useNamingConvention` (221, config step + 3 sub-phases)

**Pre-step (config, before any per-file work):** confirmed 160/221 (72%) of
findings are in `.test.ts`/`.test.tsx`/`.stories.tsx`/fixture files, and a
representative spot-check surfaces a recurring false-positive pattern:
PascalCase-named object properties for mocked React components inside
`vi.mock(...)` factories (React requires PascalCase for a value to be
treated as a JSX component, but biome.json's `objectLiteralProperty`
convention currently only allows `camelCase`/`snake_case`/`CONSTANT_CASE`).
Example confirmed in `packages/web/src/__tests__/AD6-knowledge-simplification.test.tsx:37`
(`BodyEditor: (...) => ...` inside a `vi.mock` return object).

Action: audit a representative sample of the 160 test-file findings to
confirm the proportion matching this exact pattern vs. something else, then
add a targeted `biome.json` `overrides` block (scoped to `**/*.test.ts`,
`**/*.test.tsx`, `**/*.stories.tsx`, alongside the existing test-file
override at biome.json's `overrides` array) extending `objectLiteralProperty`
to also allow PascalCase. If the audit finds a real mix (some genuine
naming slop mixed in with mock-component false positives), keep the
override as narrow as Biome's convention schema allows rather than
blanket-relaxing. Re-measure the real remainder after this config lands —
expect it to shrink substantially before any manual renames start.

For the 61 non-test-file findings (+ whatever test-file remainder survives):
per-finding judgment. **Confirmed live precedent for the external-protocol
case:** `packages/agent-execution/harness-registry/src/cli-mcp-config.ts:154-155`
already has `// biome-ignore lint/style/useNamingConvention: HTTP header
name is canonical RFC case` on an `Authorization:` key — but the *identical*
`Authorization` key at line 189 (in `writeCursorJson`, same file) has no
suppression. That's a live, unambiguous, zero-risk finding: copy the
existing in-repo suppression pattern, don't rename. For genuine internal
naming slop, rename to camelCase (verify no string-key access like
`obj["oldName"]` survives — `tsc` won't catch that).

- **15a (small, no config dependency, ~37):** `agent-execution` (9) +
  `eval` (9) + `shared` (9) + `desktop` (6) + `eslint-plugin-authz` (4).
- **15b (~66, re-measure after config override):** `db` (27) +
  `eslint-plugin-design` (27) + `design-system` (12).
- **15c (~118, re-measure after config override, largest — split further
  if the post-config remainder is still large):** `web` (94) +
  `core-api` (24).

**Verify per sub-phase:** `npx biome check <package> --reporter=summary` +
`npm run check` + `npm run test` (affected). Property renames CAN break
destructuring call sites — typecheck catches most, but grep for
string-bracket access which it won't.

**Risk:** LOW for the config-override step (config-only — review it doesn't
over-relax and swallow real slop). MEDIUM for manual renames
(destructuring/string-access breakage, mitigated by full typecheck + grep).

---

## Phase 16 — Biome `useAwait` (125, highest call-site-breakage risk, 3+ sub-phases)

Concentrated: `git-export-runner.ts` (21), `conversation-store.ts` (11),
`work-service.ts` (10), `user-store.ts` (9) = 51 of 125 in 4 files.

**Not mechanical — genuine per-finding judgment.** An `async function` with
no `await` inside either (a) genuinely doesn't need to be async — removing
`async` changes its return type from `Promise<T>` to `T` and can silently
break every call site using `.then()`/`.catch()` on the result (grep ALL
call sites before removing `async` — `await` on a non-Promise value is
still valid JS/TS and won't error, but `.then()` on a non-Promise WILL); or
(b) is intentionally async to satisfy an interface/contract (implementing
an async port where sibling implementations DO await) — here the fix is
NOT to remove `async` (breaks interface conformance across implementations)
but to add `// biome-ignore lint/suspicious/useAwait: <reason>`.

This is **the single highest call-site-breakage-risk bucket in the whole
plan** — a stripped `async` keyword can pass `tsc` cleanly if the caller's
context is loosely/inferred-typed, and only fail at runtime.

- **16a:** `git-export-runner.ts` alone (21, single file/concern, careful
  pass).
- **16b:** `conversation-store.ts` (11) + `work-service.ts` (10) +
  `user-store.ts` (9) = 30.
- **16c+:** remaining ~63 across ~42 files — re-pull the current file list
  (`npx biome check . --reporter=json`, filter `lint/suspicious/useAwait`)
  at the start and chunk into 2-3 further sub-iterations of ~20-25 each.

**Verify per sub-phase:** `npm run check` (catches most signature-change
breakage) + `npm run test:full` (not affected-only) + grep every touched
function name repo-wide for `await fn(` / `.then(` call sites to confirm no
stale-Promise-expectation survives a stripped-async change.

**Risk:** HIGH. Reviewer should require the PR to state, per function,
whether `async` was removed (with call-site grep evidence) or the no-await
was justified via ignore-comment, and why.

---

## Phase 17 — Biome `noExcessiveCognitiveComplexity` (72, 55 files, real refactors)

Concentrated: `core-api` (29), `web` (16), `design-system`/
`eslint-plugin-design`/`shared` (6 each), `agent-execution` (5). These are
genuine logic refactors (extract functions, flatten branching, early
returns) — **not lint-only changes**, per the task's explicit risk callout,
confirmed by inspection (e.g. `KnowledgeList.tsx` alone carries 5).

- **17a:** `core-api` (29) — highest-risk cluster (server/business logic);
  split into 2 sub-iterations of ~15 if a single pass can't safely cover 29
  refactors with adequate coverage.
- **17b:** `web` (16) — sequence AFTER Phase 6/10 land (both also touch
  `KnowledgeList.tsx`) to avoid stacking unrelated diffs on the same file.
- **17c:** remaining 27 (`design-system` 6, `eslint-plugin-design` 6,
  `shared` 6, `agent-execution` 5, `agent-orchestration` 2,
  `eslint-plugin-authz` 1, `eval` 1).

**Mandatory pre-condition per file:** confirm adequate existing test
coverage for the function before refactoring; if thin, either add
characterization tests first (per CLAUDE.md's "Validation Before
Implementation") or flag the file for a reviewer/founder call rather than
refactor blind.

**Verify per sub-phase:** `npm run check && npx biome check <package> --reporter=summary && npm run test:full`
— full suite, since `--changed=origin/main` scoping could miss a
refactored function's coverage living elsewhere in the dependency graph.

**Risk:** HIGH — the highest in this plan alongside 11b and 16. A
genuinely irreducible complexity case (rare) may warrant a documented
`biome-ignore` with justification (mirroring the design-system
`waivers.md` precedent) rather than a forced bad refactor — acceptable only
if rare and justified, never a blanket escape hatch.

---

## Phase 18 — Full-repo re-verification checkpoint (gate, no content changes)

Run `npm run check && npm run lint && npm run knip && npm run test:all`
end-to-end. Re-measure both tools' real (non-quiet, crash-free) counts.
Confirm ZERO remaining findings in every target bucket except deliberately
documented waivers — log their exact count/location so Phase 19's flip has
an accurate "expected surviving warn count" to sanity-check against 0. If
stragglers are found, loop back to the relevant phase — do not proceed to
the flip on a dirty baseline.

---

## Phase 19 — THE FLIP (config-only, final phase)

### 19a ESLint
- Remove `--quiet` from `package.json`'s `"lint:eslint"` script (`npx
  eslint . --quiet` → `npx eslint .`) and from the `"lint"` composite
  script's ESLint segment — restores real rule execution.
- Promote every rule currently `"warn"` in `eslint.config.ts` to `"error"`,
  in the exact same `files`/`ignores` scope as today (no scope-widening as
  part of this flip — that's a separate, deliberate decision) except the
  handful of deliberately-documented waiver sites from earlier phases
  (those stay as inline `eslint-disable-next-line` + reason, not a
  block-level warn — per the K8 `waivers.md` precedent, a live warn block
  is not the right permanent-exception mechanism).
- **Also add `--max-warnings 0`** to the ESLint invocation.
  **Recommendation: do both, not either/or** — severity promotion is the
  correct, explicit fix (matches this repo's existing per-scope
  error-promotion pattern already visible in `eslint.config.ts`, e.g. the
  K8 design-system block, `no-raw-overlay-z`, `no-dialog-boilerplate`), but
  `--max-warnings 0` is the cheap backstop that catches a FUTURE new
  warn-level rule someone adds later and forgets to promote to error.
- Update `packages/eslint-plugin-design/waivers.md` with a new section for
  the web-package promotions (mirroring its K8 structure), listing every
  surviving inline-waived finding with file:line + reason.

### 19b Biome
- Promote all 15 currently-`"warn"` rules in `biome.json` to `"error"`.
- **Leave the info-level categories (`useLiteralKeys`, `noUselessFragments`,
  `deserialize`) as-is — do not promote to error.** Justification: (1)
  `useLiteralKeys` and `noUselessFragments` are already fully cleared to 0
  findings by Phase 1's mechanical sweep — nothing outstanding to un-silence
  for them; (2) Biome's `info` tier is intentionally distinct from `warn` in
  Biome's own severity model — it's advisory/non-blocking by design,
  whereas `warn` is exactly the "silently tolerated" tier this migration
  targets. Promoting `info`→`error` is scope creep beyond "stop tolerating
  today's warnings" into adopting a stricter house style than Biome
  recommends. Flag as a cheap optional follow-up for the founder, not part
  of this migration.
- Fix `biome.json`'s `$schema` version-mismatch (`deserialize`, 2 findings)
  as a 1-line hygiene bump (unrelated to code findings, trivial, do inline
  rather than a separate phase).

### 19c Knip
- Add a `Knip (production)` step to `.github/workflows/ci.yml` running
  `npm run knip:production`, alongside the existing `Knip` step, gated by
  the same `only_docs` docs-fast-path condition — closes the
  attestation-only gap.
- knip.json config-hint cleanup (40 hints) — optional, time-boxed: remove
  hints that are pure duplication of knip's own defaults (e.g. `.claude/**`
  in `ignore`); verify `npx knip` stays exit-0 with the SAME 0-issue count
  after each removal — if any removal changes the outcome, revert that
  specific one (the "redundant" hint can be wrong if default coverage is
  narrower than it implies). Don't let this optional cleanup block phase
  completion.

**Verify:** `npm run verify` end-to-end (check + lint + knip +
knip:production + build + attest) against the NEW config (no `--quiet`,
`--max-warnings 0`, all rules at error) — the definitive gate. Push and
confirm the actual CI workflow run is green (not just local `npm run
verify`), since CI now also live-runs `knip:production`.

---

## Verification command reference

| Scope | Command |
|---|---|
| Full check | `npm run check && npm run lint && npm run knip` |
| Quick | `npm run verify:quick` |
| Biome only, scoped | `npx biome check <path> --reporter=summary` |
| ESLint only, scoped (pre-Phase-2, crash-safe) | `npx eslint <path> --rule '{"@typescript-eslint/no-unsafe-assignment":"off","@typescript-eslint/no-unsafe-return":"off","@typescript-eslint/no-unsafe-member-access":"off"}'` |
| ESLint only, scoped (post-Phase-2) | `npx eslint <path>` |
| Full test | `npm run test:full` |
| Design-scoped lint | `npm run lint:design` |
| Full gate before flip | `npm run verify` |

## Consolidated risk notes

- **Highest risk phases:** 16 (`useAwait` — silent call-site breakage via
  return-type change), 17 (`noExcessiveCognitiveComplexity` — real logic
  refactors touching business logic), 11b (`react-compiler` on real
  components — module-state-to-useState conversion). All three require
  full-suite (`test:full`) verification, not affected-only, and live
  app click-through, not just green CI.
- **File-collision risk:** `KnowledgeList.tsx` is touched by Phases 6, 10,
  and 17b — sequence as documented to avoid diff thrash.
- **Waiver-vs-fix judgment risk:** Phases 7, 9a, 15 (config step) all
  require correctly distinguishing "documented deliberate exception" from
  "real violation." Getting it wrong in either direction is a real error
  (over-waiving hides a real defect; under-waiving breaks a deliberate
  design). Every waiver must cite a concrete reason and land in
  `waivers.md`, mirroring the existing K8 precedent — no bare
  `eslint-disable` without a comment.
- **The `--max-warnings 0` + severity-promotion combination in Phase 19a**
  is deliberate belt-and-suspenders per the requester's own reasoning —
  don't drop either half during implementation.
