# AV2 — Combined critique (refine + design + architecture)

Reviewer: independent evaluator (not the producer). All load-bearing code claims verified against
real source in this worktree's checkout. Severity: CRITICAL | WARNING | NIT.

---

## Act 1 — Refine critique (`requirements.md` + `guide-draft.md`)

### Load-bearing code claims — VERIFIED

Both pinned nouns rest on code claims. I checked every one against the real files:

| Claim | Cited loc | Real loc | Verdict |
|---|---|---|---|
| `users.role` is free `text`, not enum | — | `packages/db/src/schema.ts:48` `role: text("role").notNull()` | TRUE |
| Route role schema `z.string().min(1).max(100)` (not enum) | `agents.ts:49,62` | `agents.ts:49` (POST) + `:62` (PATCH `.optional()`) | TRUE — exact |
| Template route 404s gracefully for unknown role | `agents.ts:212-214` | `agents.ts:200` (`"No template for role"`, 404) | TRUE — line off by ~12 |
| `agentCategory` falls back to `"team"` for unknown role | `agents.ts:303-304` | `agents.ts:289-291` derivation, second echo at `:317` | TRUE — line cited is an echo, logic is 289-291 |
| `ASSISTANT_SOUL_EDIT_FORBIDDEN` rejects `systemPrompt` on `ast-*` | `agents.ts:364-383` | `agents.ts:361-370` | TRUE |
| Assistant route accepts persona+harness+model triple | `assistant.ts:345` | `assistant.ts:51-55` (schema) + `:344` (PATCH) | TRUE |
| Assistant already returned by `GET /api/agents`; exclusion is UI-only | `SettingsAgents.tsx:753` | `SettingsAgents.tsx:753` `.filter((a) => a.role !== "assistant")` | TRUE — exact |

**Conclusion: no wrong load-bearing claim in the refine.** Both pinned nouns (a: catalog-plus-custom open
string with ZERO backend change; b: UI-only shared editor with split save-routing preserving the `ast-*`
reject) are **correctly grounded and well-justified.** The "zero backend change" decision is the decisive,
correct call — it collapses the spec's anticipated "light backend for role definition" to nothing, which is
the right read of the code.

### Findings

- **WARNING — refine §5 / guide-draft "Model dropdown filtering" §.** The claim *"empty `modelProviders` list
  means provider-agnostic → show the whole catalog (matches the Cluster B validator rule: empty list = no
  check)"* is **FALSE as grounding**. The server validator (`agents.ts:145-160`, §4 INCOMPATIBLE_HARNESS_MODEL)
  has **NO empty-list exemption**: the guard is `if (caps && !caps.modelProviders.includes(effectiveProvider))`.
  When `modelProviders` is `[]` and a provider is set, `[].includes(x)` is `false` → the validator **FIRES** with
  the empty `Supported: .` string. That empty-`Supported:` error is precisely the bug this WP cites, and it
  originates from an empty list, not from a missing check. Required change: stop describing the UI helper as
  "mirroring" a non-existent validator rule. State the real invariant instead — *the UI filter shows the whole
  catalog when providers is empty; the save is only safe from a 422 because the provider-agnostic harness leaves
  `modelProvider` null (validator §4 is gated on `effectiveProvider &&`).* If a provider-agnostic harness's agent
  ever carries a non-null `modelProvider`, the server still 422s and the UI filter does NOT save it. Pin that
  precondition. (See also the matching architecture WARNING below — same root claim.)

- **NIT — refine §5.** Line citations for template-404 (`212-214`) and category-fallback (`303-304`) are off by
  ~12 and point at echoes rather than the derivation. Builder-facing; harmless but tighten to `:200` and
  `:289-291` so the builder doesn't grep a stale line.

- **NIT — guide-draft.** Solid backwards-planned draft; user sections lead, dev note is accurate. No change
  needed beyond the model-filter wording fix above (which appears verbatim in the dev note).

**Act 1 verdict: PASS** (with the one WARNING to correct the model-filter grounding).

---

## Act 2 — Design critique (`design/approved.md` + rendered TSX)

### Extract-vs-invent discipline — VERIFIED against `feedback_design_extract_before_invent`

The Phase-0 gate classifies each surface extract|build|mixed and lands on **mixed: ~90% extract, one build
(RoleCombobox)**. I verified the extract claims and the one build:

- **SplitView / ItemList / Row / EmptyState** all exist (`packages/design-system/src/{SplitView,ItemList,Row,EmptyState}.tsx`).
- **`useUiPreference(surfaceKey, default)`** exists (`web/src/hooks/useUiPreference.ts:35`) and is used exactly
  as claimed by Conversations (`Conversations.tsx:285` `useUiPreference("conversation.dial-in", 0.6)`; SplitView
  wired at `:461`). The IA-B "section body IS a SplitView" pattern is a faithful extract of Conversations, not a
  reinvention. CONFIRMED.
- **RoleCombobox as `build`** — I checked whether an existing DS primitive covers it. The nearest is `ScopePicker`
  (a radiogroup-of-pills, id-based `onChange(id|null)`, no free-text create) and `Select`. Neither supports the
  load-bearing behavior: *type-to-filter catalog + commit an arbitrary new string*. **RoleCombobox as a new build
  surface is JUSTIFIED** — no existing primitive does the job, so the reuse-before-build rule (design-system.md
  CRITICAL) is satisfied.

### Rendered TSX (`RoleCombobox.tsx`, `SettingsAgentsSplit.stories.tsx`)

- RoleCombobox is token-clean (`--r-subtle`, `--border-default`, `--surface-elevated`, `--shadow-elevated`,
  `--accent-primary`, 6px-grid gaps, on-scale type 11/12/13px), carries `role="combobox"` + listbox +
  `aria-activedescendant`, handles ↑/↓/Enter/Esc, and the "Use new role: X" affordance matches the guide. Good.
- SettingsAgentsSplit composes only existing primitives + RoleCombobox; Assistant is a Row with `disabled`
  RoleCombobox — matches the "role locked to assistant" invariant.

### Findings

- **WARNING — `SettingsAgentsSplit.stories.tsx:147-182`.** The story omits `onRatioChange`, which the real
  Conversations wiring uses (`onRatioChange={setDialInRatio}`) to actually persist the ratio through
  `useUiPreference`. `SplitView.surfaceKey` is **informational-only** (per its own `@lore AM5 T6` — "SplitView
  itself stays presentational"); persistence lives in the container via `useUiPreference` + `onRatioChange`. The
  story is acceptable as a static design artifact, but the **architecture/DoD must make the builder wire
  `onRatioChange` + `useUiPreference`**, or the "persisted ratio" AC silently no-ops. The plan text says
  `useUiPreference(surfaceKey)` but never names `onRatioChange`. Add it to sub-area (a)/(c) tasks and to AC-2's
  proof. (Cross-listed as an architecture NIT.)

- **NIT — `design/approved.md:66,141` and states policy.** Empty/loading/error deferred to build is correct per
  `feedback_no_skeleton_error_in_initial_designs`. But States scored 7.5 and A11y 8.0 while the combobox's
  keyboard/focus story is only partially designed (the popover filter input's focus-trap and the
  return-focus-to-field on Esc are not specified). Note them as build obligations so they don't get lost — the
  DoD's AC-3 tests the commit behavior but not focus return.

- **NIT — `design/approved.md:98-119`.** Three role-combobox variants (R1/R2/R3) with scores is genuine
  multi-variant exploration (satisfies the "don't skip /design" rule). Good. IA got one family + rejected
  alternatives (A/C) rather than three built variants — defensible here because the frame ("consolidate onto the
  app's own pattern") makes IA-B the only faithful extract; the rejection list documents why. Acceptable.

**Act 2 verdict: PASS** (extract discipline honored, the one build justified; wire `onRatioChange` per the WARNING).

---

## Act 3 — Architecture critique (`architecture.md` + `dod.md` + handoff `.pipeline/plans/AV2.md`)

### Named-symbol reconciliation — VERIFIED

The architecture's §3 symbol table is accurate. Spot-checked: `SplitView`/`FoldMode`/`SplitViewProps` exported
(`SplitView.tsx:36-46`); `useUiPreference` (`:35`); `HarnessCapabilityDescriptor.modelProviders` exists
(`harness-capability-descriptor.ts:111`); `GET /api/harnesses` returns the descriptors incl. `modelProviders`
(`harnesses.ts:79-84`); assistant route + reject as cited. No fabricated symbol.

### Sub-area split & ordering (a→b→c→d)

Dependency-correct: (a) extracts `AgentEditor`, (c) consumes it; (b) and (c) both convert a section to
`ItemList`+`SplitView` and both touch `SettingsPage.tsx`. Ordering is sound. Each sub-area has a proof test
mapped. Good.

### One-PR recommendation for an L WP — SOUND

The single-PR recommendation is correctly reasoned and does **not** violate the stacked-PR ban — it's the
opposite: splitting into 4 PRs would force a stacked (a→c) dependency the repo forbids, plus 4 rebases on the hot
`SettingsPage.tsx`. "Backend is nil → no DB-then-UI reason to split" is the right L-WP judgment. The
green-phase-overrun guardrail (resume at a sub-area boundary, don't split the branch) matches
`feedback_builder_green_phase_timeout`. APPROVED.

### AC → verification mapping — mostly correct

Runtime→test, static→lint/type, visual→story/paint mapping is applied correctly (e.g. `worker` removed from the
union → `tsc` catches danglers; `modelsForHarness` → unit test; deleted `SettingsAssistant.tsx` → `tsc`). Good
alignment with the CLAUDE.md validation-before-implementation rule.

### Findings

- **WARNING — `architecture.md:23-24` + `dod.md` AC-2 + handoff §"Model dropdown filter".** Same false grounding
  as the refine WARNING: *"empty list = no filter (mirrors the Cluster B validator, `agents.ts:159-171`)."* The
  validator at `agents.ts:145-160` has no empty-list branch — an empty `modelProviders` with a set provider FIRES
  INCOMPATIBLE. **The architecture must correct the claim AND the DoD must add the missing guard:** AC-2's proof
  ("save → no 422") is only true if, for a provider-agnostic harness (`modelProviders: []`), the editor sends
  `modelProvider: null`. Real evidence this matters: `adapter-pool.ts` registers a `modelProviders: []` case
  (`@lore claude-cli-adapter`: `getCapabilities().modelProviders` returns `[]`). Required change: (1) fix the
  "mirrors the validator" wording in architecture §2 and the handoff; (2) add an explicit sub-area (c) task —
  *when the selected harness has empty providers, the editor must not send a stale `modelProvider`* — and a
  `modelsForHarness`/save-payload test asserting the save omits/nulls `modelProvider` for a `[]`-provider harness.
  Without this, the "no 422 on save" AC can pass the UI-filter test and still 422 in production.

- **WARNING — `dod.md` AC-2 static check + AC-4/AC-1 "review grep".** Several ACs are verified by "review grep"
  (`no `<tr>` edit row`, `HarnessCard no longer hand-rolls the container`, `no `role !== "assistant"` filter`).
  Per CLAUDE.md these are **static codebase properties → they belong in a lint rule or the type system, not a
  human grep at review time.** A grep-at-review is not a durable gate; the next edit reintroduces the `<tr>` and
  nothing catches it. Required change: for the load-bearing ones (no readded assistant filter; no inline `<tr>`
  editor), either delete the file so `tsc` enforces absence (already done for `SettingsAssistant.tsx` → good), or
  accept these as advisory NITs rather than ACs. Don't dress a manual grep as an acceptance gate.

- **WARNING — handoff + architecture: `onRatioChange` not named.** (Cross-listed from design.) The plans say
  `useUiPreference(surfaceKey)` but never state that `SplitView` needs `onRatioChange` wired to the setter for
  the ratio to persist (SplitView is presentational — `surfaceKey` alone does nothing). AC-1/AC-2 assert
  "persisted ratio / matching Conversations exactly." Add the `onRatioChange={setRatio}` wiring to sub-area (a)/(c)
  tasks so the persistence AC is actually satisfiable.

- **NIT — `architecture.md:141-143` open question (empty filtered set → whole catalog).** Good catch by the
  planner, but it collides with the INCOMPATIBLE_HARNESS_MODEL reality above: showing the whole catalog for a
  harness whose declared providers the catalog can't satisfy will offer models that 422 on save. The fallback
  ("show whole catalog when filtered is empty") is only safe for the empty-`modelProviders` case, not the
  non-empty-but-unsatisfiable case. Split the two cases in the helper spec.

- **NIT — AC coverage completeness.** All 5 ACs map to at least one runtime test + a paint check. AC-4's "configurable
  harness opens in split-pane" is asserted only for builtin (tier rows); add a one-line assertion that a
  non-builtin harness row also opens a destination pane, so "configurable harness in split-pane" isn't proven by
  the builtin path alone.

**Act 3 verdict: REVISE** — architecture is structurally sound (split, ordering, one-PR, symbol table all
correct), but the model-filter grounding is factually wrong and load-bearing for AC-2, and two ACs lean on
review-grep where a durable gate is required. These are cheap fixes, not a redesign.

---

## Rollup

- **Act 1 (refine): PASS** — both pinned nouns correctly grounded; one WARNING on the model-filter "validator
  rule" wording.
- **Act 2 (design): PASS** — extract discipline honored, RoleCombobox build justified (no existing primitive
  covers type-to-filter + free-text create); wire `onRatioChange`.
- **Act 3 (architecture): REVISE** — sound split/ordering/one-PR/symbol table; fix the false "empty list = no
  validator check" grounding + add the `modelProvider: null` save guard for provider-agnostic harnesses; demote
  review-grep ACs to durable gates or NITs.

**One-line:** Solid, honestly-grounded plan — the only real landmine is the model-dropdown "empty providers"
story, which misreads the server validator and could let AC-2's "save → no 422" pass in test yet 422 in prod;
fix that grounding + add the null-provider save guard and this is builder-ready.

---

## Revision round 1 — planner critique responses

Planner re-verified every code claim against the real source in this worktree before revising. Summary of
how each WARNING was resolved. Note one correction to the critique's own grounding on WARNING-1.

### WARNING-1 — model-filter grounding + anti-422 save guard — RESOLVED (with a correction)

The plan's original "empty list = no filter, mirrors the Cluster B validator" wording was imprecise and is
fixed. **However, the critique's proposed correction was itself factually wrong** and I did not adopt it
verbatim. The critique claims a `modelProviders: []` harness with a set provider "FIRES the INCOMPATIBLE
error with the empty-`Supported:` string." Verified against `agents.ts:159-171`: the guard is
`meta && meta.modelProviders.length > 0 && !meta.modelProviders.includes(effectiveProvider)`. The
`.length > 0` clause **explicitly exempts an empty list** — an empty `modelProviders` does NOT fire. The
empty-`Supported:` string was the OLD POLISH-060 bug (reading `getCapabilities()` which returns `[]` for
claude-cli), already fixed by that guard + reading `meta` (`@lore POLISH-060 B1`, `adapter-pool.ts`).

Also verified: `GET /api/harnesses` returns `pool.listCapabilityDescriptors()` (`harnesses.ts:82`), and
`describeRegisteredHarness` sets the descriptor's `modelProviders` = `meta.modelProviders`
(`harness-capability-descriptors.ts:144,164,179`) — the SAME field the validator reads. So the UI filter
source and the validator source agree by construction (no `getCapabilities()` divergence in the descriptor).

Real per-harness values (`adapter-pool.ts`): `claude-code` → `["anthropic"]` (`:627`, non-empty);
`builtin` → `["anthropic","openrouter","openai-compatible"]` (`:638`); codex/opencode via
`registerCliAdaptersIfAvailable` → `[]` (`:575`); missing families → `[]`.

The critique's *underlying* concern is nonetheless valid and load-bearing, so I added the real guard: the
genuine 422 risk is the OPPOSITE case — a non-empty harness (`claude-code`=`["anthropic"]`) whose agent
still carries a STALE non-anthropic `modelProvider` after a harness switch. Filtering the dropdown alone
does not fix a pre-existing draft value. Changes applied across requirements §5, architecture §2/§4/§5(c)/§7,
design/approved.md (Agents model-dropdown note), dod.md AC-2, and the handoff:
- Corrected the "empty list = validator rule that fires" wording everywhere → "empty list is EXEMPT / save-safe".
- Added sub-area (c) task 5: harness-change `modelProvider` reconciliation (reset to compatible model for
  non-empty; send `modelProvider: null` for empty-`modelProviders` provider-agnostic harnesses).
- Added dod AC-2 runtime tests: (i) a `modelsForHarness` case; (ii) an `AgentEditor` save-payload test that
  an empty-`modelProviders` save sends `modelProvider: null` and a `claude-code`-switch reconciles a stale
  `openrouter` model; (iii) a server `validateAgentConfig` route test asserting an empty-`modelProviders`
  save does NOT 422 (locks the exemption the UI relies on).
- Stated the real provider source precisely (descriptor `modelProviders` = `meta.modelProviders`, not
  `getCapabilities()`).

### WARNING-2 — static-property ACs must be type/lint-gated, not review-grep — RESOLVED

Rewrote dod AC-1/AC-2/AC-4 so every static property is enforced by DELETION + a failing `tsc`/runtime test
on reintroduction, not a manual grep:
- AC-1: `SettingsAssistant.tsx`(+story) deleted → `tsc` fails on any import; the `role !== "assistant"`
  filter's absence is enforced by the component test that asserts the assistant row renders (a re-added
  filter turns that test red). Removed the "grep-guard in review" language.
- AC-2: the inline `<tr>` editor is deleted when the editor moves into the SplitView destination; the
  "editor renders inside SplitView" component test goes red if the `<tr>` returns. Removed the `<tr>` grep.
- AC-4: the `Models` top-level section is deleted from `SettingsPage.tsx` → `tsc`/section-render test fails
  on a dangling reference; `HarnessCard`-uses-`Row` is proven by the runtime row-render assertion, not a
  container grep. Removed both review-greps.
- Added an explicit DoD preamble: static properties are enforced by deletion so `tsc`/a test fails on
  reintroduction — never by a review-grep.

### WARNING-3 — name `onRatioChange` — RESOLVED

Confirmed against real wiring: `SplitView` is presentational (`SplitView.tsx:45` `@lore AM5 T6`:
`surfaceKey` "informational for the stories viewer only"); persistence lives in the container via
`useUiPreference(key, default)` → `[ratio, setRatio]`, wired `dividerRatio={ratio} onRatioChange={setRatio}`,
exactly as Conversations does (`Conversations.tsx:285,461-465` `onRatioChange={setDialInRatio}`). Added
`onRatioChange={setRatio}` explicitly to every settings SplitView surface (`settings.agents`,
`settings.backends`) in architecture §2/§3/§5(a)(b)(c), design/approved.md (new "SplitView ratio
persistence" note + per-surface wiring), dod AC-2 (a ratio-persist test that exercises `onRatioChange`, not
just `surfaceKey`), and the handoff. The "persisted ratio" claim is retained as an AC and is now satisfiable.

### Also addressed (NITs)
- AC-4 completeness: added an assertion that a NON-builtin (configurable) harness row also opens a
  destination pane (so "configurable harness in split-pane" isn't proven by the builtin path alone).
- `modelsForHarness` empty-vs-unsatisfiable split: the helper contract now distinguishes empty
  `modelProviders` (save-safe) from non-empty-but-unsatisfiable (whole-catalog display fallback + the
  reconcile guard owns save safety). Documented in architecture §4/§7 and dod AC-2.
- Line-citation drift fixed throughout (template-404 → `agents.ts:200`; category fallback → `:289-291`;
  assistant reject → `:361-370`; assistant route → `assistant.ts:344`).
- RoleCombobox focus-return-on-Esc noted as a build obligation (design a11y note + rubric).

**Round-1 verdict:** all three WARNINGs resolved; one factual correction to the critique's WARNING-1
mechanism (empty list is exempt, not firing) is recorded above with source lines. No production code changed
— artifacts + handoff only.

---

## Round 2 verdict

Re-verified every revision against real source in this checkout. The planner's pushback on WARNING-1 is
CORRECT and my round-1 mechanism claim was wrong. All three findings resolved.

### WARNING-1 — model-filter grounding + anti-422 save guard — RESOLVED

Adjudicated against the real validator. `packages/server/src/routes/agents.ts:161-164`:
```
if (meta && meta.modelProviders.length > 0 && !meta.modelProviders.includes(effectiveProvider))
```
The `.length > 0` clause EXEMPTS an empty list — the planner is right, my round-1 `[].includes()` claim was
wrong. The inline comment (`:150-152`) documents it: "An empty list means provider-agnostic ... skip the
check." The empty-`Supported:` string was the old POLISH-060 `getCapabilities()` bug, already fixed by
reading `meta` (`@lore POLISH-060 B1`, `:154-158`).

Descriptor-field agreement CONFIRMED: `harnesses.ts:82` returns `listCapabilityDescriptors()`; every
descriptor branch sets `modelProviders: meta.modelProviders`
(`harness-capability-descriptors.ts:144,164,179`; missing families `[]` at `:208`). The validator reads the
same `meta` via `getRegistrationMetaByType(...).modelProviders` (`agents.ts:160`). UI-filter source and
validator source agree by construction. Adapter values match the plan: `claude-code`→`["anthropic"]`
(`adapter-pool.ts:627`), `builtin`→3 providers (`:638`), CLI-registered→`[]` (`:575`).

The revised plan now targets the REAL 422 risk — a stale non-empty `modelProvider` after a harness switch
(non-empty case) reconciled to a compatible model, and `modelProvider: null` for empty-`modelProviders`
provider-agnostic harnesses. Encoded in architecture §2/§4/§5(c)-task-5, requirements §5, dod AC-2 (three
runtime tests incl. the `validateAgentConfig` route test locking the empty-list exemption). The empty-vs-
unsatisfiable helper split (§4/§7) is correct and load-bearing. RESOLVED.

### WARNING-2 — static-property ACs must be type/lint-gated, not review-grep — RESOLVED

dod preamble (`dod.md:6-8`) now states static properties are enforced by deletion so `tsc`/a test fails on
reintroduction, never a review-grep. AC-1: `SettingsAssistant.tsx`(+story) deleted → `tsc` enforces; the
removed `role !== "assistant"` filter's absence is enforced by the assistant-row-renders component test (a
re-added filter turns it red) — no grep. AC-2: inline `<tr>` deleted, "editor renders inside SplitView"
test goes red on reintroduction — no grep. AC-4: `Models` section deleted from `SettingsPage.tsx`/
`SETTINGS_SECTIONS` → `tsc`/section-render test; `HarnessCard`-uses-`Row` proven by the row-render runtime
assertion, not a container grep. All "review grep" language removed. RESOLVED.

### WARNING-3 — name onRatioChange — RESOLVED

Real wiring confirmed: `Conversations.tsx:285` `useUiPreference("conversation.dial-in", 0.6)` →
`:464-465` `dividerRatio={dialInRatio} onRatioChange={setDialInRatio}`. `SplitView.surfaceKey` is
"informational for the stories viewer only" (`SplitView.tsx:45`); persistence is container-owned
(`onRatioChange` fires the setter, `:164`). Plan now names `const [ratio,setRatio]=useUiPreference(key,default)`
+ `dividerRatio={ratio} onRatioChange={setRatio}` for every settings SplitView surface (`settings.agents`,
`settings.backends`) in architecture §2/§3/§5(a)(b)(c), requirements §3, design/approved.md, and dod AC-2's
ratio-persist test that exercises `onRatioChange` (not `surfaceKey` alone). RESOLVED.

### Overall: PASS — builder-ready

Architecture was structurally sound in round 1 (split, ordering, one-PR, symbol table); the only real
landmine was the model-filter grounding, and the planner correctly identified that MY round-1 mechanism was
the wrong one — the code exempts empty lists, and the real 422 risk is the stale-provider-after-switch case,
which the plan now guards with a reconcile step and locks with a `validateAgentConfig` route test. Static ACs
are now deletion/tsc/test-gated with no review-grep. `onRatioChange` is named per surface and matches
Conversations. No unresolved findings; no production code changed (artifacts + handoff only). Plan is
builder-ready.


---

## Amendment: harness-discovered models (founder concept-review tweak, 2026-07-06)

**Decision:** Approve with tweaks (`.annotations/AV2-concept-review.md`). The IA-B SplitView, Assistant-as-row,
catalog-plus-custom RoleCombobox, and guide direction are APPROVED unchanged. ONE blocking tweak lands in the
plan: **the Settings model dropdown must offer the models the harness ACTUALLY provides, DISCOVERED from the
harness — NOT the hardcoded `MODEL_CATALOG` filtered by provider.** Each harness exposes its own model set;
the dropdown reflects that discovered set, per harness.

Planner amended requirements §5 (+ §1 item 3, §3), architecture §1/§2/§3/§4/§5(e new)/§5(c)/§6/§7,
design/approved.md (model-dropdown anatomy + stories note), dod.md AC-2 + global gates, and the handoff
`.pipeline/plans/AV2.md`. **No production code changed — artifacts only.** The Phase-4 reviewer must verify
the discovery layer against these honest per-harness sources.

### What changed (for the reviewer to check)

- **New backend sub-area (e) — harness model discovery** (sequence BEFORE/WITH (c); build order a→b→e→c→d).
  Populate the pre-existing-but-unpopulated `HarnessCapabilityDescriptor.models` (delivered by
  `GET /api/harnesses` today) at PROBE time, cached at discovery cadence — NOT per request. The
  `HarnessDiscoveryInput.models` carrier already exists (`harness-discovery.ts:45`) and is read on the
  missing-family path (`harness-capability-descriptors.ts:206`); the registered-CLI branch must be extended
  to read it too (`:162,177`).
- **Web dropdown source flips** from `MODEL_CATALOG` map (`SettingsAgents.tsx:579`) to
  `selectedHarnessDescriptor.models`; a new `modelOptionsForHarness(descriptor)` helper (no `MODEL_CATALOG`
  import). Empty discovered list → an AFFORDANCE, never a global-catalog fallback.
- The stale-`modelProvider` on-switch reconcile is UNCHANGED (still 422-safe; reads `modelProviders`, the
  validator's field — independent of the `models` list).

### Honest per-harness discovery source (the reviewer must hold the build to these — no relabelled catalog, no fabrication)

| Harness | Discovery source | Descriptor result | Anti-pattern to reject |
|---|---|---|---|
| **builtin** | resolved gateway `/models`, cached (NEW HTTP client): OpenRouter `GET /api/v1/models` (no auth) `data[].{id,name,context_length}`; Anthropic `GET /v1/models` (`x-api-key`+`anthropic-version: 2023-06-01`) `data[].{id,display_name,max_input_tokens}`; openai-compatible `GET {baseUrl}/v1/models` (bearer) | discovered `models`; **no key present → `[]`** (never fabricated) | `MODEL_CATALOG` relabelled as "discovered"; a fabricated list when no key |
| **opencode** | `opencode models --verbose` (real CLI, via probe `run` dep) → per-model JSON | `{id,label:name,contextWindow}` (only opencode's configured providers + shipped catalog) | a stubbed opencode list; a `MODEL_CATALOG` map |
| **claude-code** | `claude models` Markdown table parsed (harness's OWN bundled catalog); `claude models --json` does NOT exist | table rows → descriptors | relabelling `MODEL_CATALOG` as "discovered" |
| **codex** | NO enumeration surface | `models: []` + editor affordance ("manages its own model"; optional read-only `~/.codex/config.toml` model) | fabricating a codex model list |
| **cursor-agent** | inert | `models: []` | — |

### Revised model AC (dod AC-2)

"The model dropdown for a selected harness offers **that harness's discovered models** (builtin = gateway
list, opencode = `opencode models`, claude-code = `claude models` table), NOT the hardcoded catalog; a
harness with no enumerable models shows the **affordance**, not the global catalog." Verification: runtime —
builtin probe with a stubbed `/models` payload surfaces those ids (no-key → `[]`); a **harness-facing
integration test using the REAL `opencode` binary** (`requireHarness('opencode')`, no stub, hard-fail if
absent) proves the `opencode models --verbose` parse; the web dropdown renders `descriptor.models` and shows
the affordance when empty; the empty-`modelProviders` no-422 `validateAgentConfig` test is kept. Static: no
`MODEL_CATALOG` import in the agent-edit dropdown path (deletion/tsc-enforced; optional
`no-restricted-imports` lint).

### Scope / one-PR call

The tweak grows AV2's backend materially (a real `/models` discovery layer). **One-PR recommendation still
holds** — (e) is (c)'s data source over the shared `descriptor.models` seam; the founder tied discovery to
the AV2 dropdown, so splitting (e) out ships dead code or a forbidden stacked PR. Flagged split trigger:
carve (e) into its own backend WP ONLY if the `/models` layer balloons (per-provider auth/paging/caching
warrants its own design pass), landing (e) first with (c) consuming it. Now L-and-slightly-deep, not
L-but-shallow.

### Reviewer note (Phase 4)

- ⚠️ UNVERIFIED: the three `/models` response shapes are from the founder's real 2026-07-06 probes but must
  be re-confirmed against current provider API docs at build time before the parser is written (source-driven).
- Enforce the honest-harness rule on the opencode discovery test: REAL binary, `requireHarness('opencode')`,
  no `skipIf`, hard-fail if absent — a stubbed opencode adapter makes it a mislabelled unit test.
- Reject any implementation that relabels `MODEL_CATALOG` as discovered, or that falls back to the global
  catalog when the discovered list is empty.

---

## Round 3 — amendment (e) verdict (harness-discovered models)

Focused re-critique of the NEW sub-area (e) only. Every seam re-verified against real source in this
worktree.

### 1. Seam correctness — RESOLVED (one placement CONCERN)
- **discovery→descriptor→client wiring is real and correctly identified.** `listCapabilityDescriptors`
  passes `this.discoveries` into `describeRegisteredHarness(entry.meta, getCapabilities(), this.discoveries)`
  (`adapter-pool.ts:300`); missing families read `cliModelsFromInput(discoveryInput?.models)`
  (`harness-capability-descriptors.ts:206`). CONFIRMED.
- **Extending the registered-CLI branch is NECESSARY and correctly placed.** The registered CLI/external
  branches read `cliModels(caps)` = `caps.descriptorModels ?? []` (`:162,177`), NOT `discoveries[type].models`.
  A probe-discovered opencode/claude list would NOT reach the descriptor without the plan's fix (prefer
  `discoveries?.[type]?.models`, fallback `cliModels(caps)`). The `discoveries` param is already plumbed to
  this function, so the fix is a read-site change only — no new plumbing. Additive-merge instruction (don't
  drop `descriptorModels`) is correct. RESOLVED.
- **CONCERN (minor) — builtin branch phrasing is loose.** The builtin branch reads `builtinModels(caps)` =
  `caps.descriptorModels ?? MODEL_CATALOG.map(...)` (`:142,74-85`). The probe writes its output to
  `HarnessDiscoveryInput.models`, which flows via `discoveries`, **NOT** via `caps`. So "builtin branch reads
  the discovered list via `builtinModels(caps)` fed from the probe" is only true if some upstream step copies
  the probe result into `caps.descriptorModels` — a path that does not exist today. Builder must read
  `discoveries?.[builtin]?.models` in the builtin branch (the same merge as CLI), not expect `caps` to carry
  it. Pick the `discoveries[type].models` merge for ALL three branches. Not blocking, but name it or the
  builder wires builtin the wrong way.
- **Web reads `descriptor.models` from the already-loaded payload — CONFIRMED, no new fetch.**
  `harnesses.ts:82` returns full `HarnessCapabilityDescriptor[]` (incl. `models`); the web already holds the
  array (`SettingsAgents.tsx:568,573` maps `h.type`/`h.name`). Reading `h.models` needs no new request.
  Builder must ensure the web's local harness type includes `models` (shared `HarnessCapabilityDescriptor`
  has it at `harness-capability-descriptor.ts:108`).

### 2. builtin /models client at probe time — RESOLVED (one WARNING)
- Populate-at-probe + cache-at-discovery-cadence is sound: `refreshDiscoveries` (`adapter-pool.ts:111-113`)
  is the cache point, rate-limited 1/5s (`harnesses.ts:77`); the fetch inherits that cadence, not per-request.
- No-key→`[]` is explicit and correct: `probeBuiltinGateway` already resolves the credential set
  (`harness-discovery.ts:333-352`); no matched key → `unauthenticated` → `models: []`, never fabricate.
  RESOLVED.
- **WARNING (builder must handle) — failure isolation of the network call.** `probeBuiltinGateway` is SYNC
  today and does ZERO network. Making it async + adding a `/models` fetch puts a network call inside
  `discoverLocalHarnesses`'s `Promise.all` (`harness-discovery.ts:659-669`). If the fetch REJECTS (DNS,
  timeout, gateway 5xx), `Promise.all` rejects → `refreshDiscoveries` throws → `POST /redetect` 500s AND the
  eager boot discovery blanks EVERY harness (readiness, inheritedTools, all families), not just builtin
  models. The plan says "degrade to `[]`, never hang" but does not name the Promise.all blast radius. The
  `/models` fetch MUST be internally try/caught → `[]` (bounded timeout, like `INHERITED_PROBE_TIMEOUT_MS`
  `:384`) so a gateway error cannot reject the discovery batch.
- **CONCERN (minor) — testability seam.** The AC-2 builtin unit test stubs "the probe's injectable
  `run`/fetch dep", but `HarnessProbeDeps` (`:69-87`) has `run`/`env`/`cwd` and **no fetch injection**. The
  new `/models` client (or `HarnessProbeDeps`) must expose an injectable fetch, else the no-network unit
  test cannot stub the payload. Name the injection point.

### 3. CLI parser honesty — RESOLVED for opencode/codex; WARNING for claude
- Anti-patterns are explicitly forbidden in §2/§4/§5(e) + the amendment table: no `MODEL_CATALOG` relabelled
  as "discovered", no empty→catalog fallback. RESOLVED as a contract.
- opencode: real binary `opencode models --verbose` via the probe `run` dep, proven by a real-binary
  integration test (`requireHarness('opencode')`, no `skipIf`). Honest. RESOLVED.
- codex: `models: []` + affordance, optional read-only `~/.codex/config.toml` model for display, no
  fabrication. Honest. RESOLVED.
- **WARNING — claude parse is proven only by a memory-authored fixture (mock-validation trap).** Two
  unverified, load-bearing assumptions: (a) that a `claude models` subcommand EXISTS, and (b) that it emits a
  Markdown table with the assumed columns. The plan's ⚠️ UNVERIFIED flag covers ONLY the three gateway
  `/models` shapes — it does NOT flag the two CLI subcommands (`claude models`, `opencode models --verbose`)
  as unverified. Per `feedback_dont_assume_external_tool_capabilities` + `feedback_no_stubs_from_memory`, a
  hand-authored `claude models` fixture proves nothing if the real subcommand/format differs — the unit test
  passes green against a fabrication. opencode is protected by its real-binary test; claude is NOT (unit
  fixture only) — asymmetric. `requireHarness('claude')` is available (locked matrix claude→haiku,
  `project_harness_test_models`), so claude discovery should EITHER get a real-binary integration parse check
  (parity with opencode) OR commit a fixture CAPTURED from real `claude models` output, never authored from
  memory. Extend the ⚠️ UNVERIFIED flag to both CLI subcommands (existence + format), verified at build time.

### 4. AC / verification mapping — RESOLVED
- builtin fetched-ids (unit, stubbed payload, no-key→`[]`), opencode real-binary parse, `modelOptionsForHarness`
  (empty→`hasModels:false`, never `MODEL_CATALOG`), `AgentEditor` options=`descriptor.models` + codex
  affordance, empty-`modelProviders` no-422 `validateAgentConfig` route test — all map to real runtime
  imports/assertions. No AC unverifiable except the claude-fixture gap in §3.
- Static property correctly assigned: "no `MODEL_CATALOG` import in the agent-edit path" → deletion + `tsc` +
  optional `no-restricted-imports` lint + a component test that reddens on reintroduction. Not a review-grep.
  Correct per CLAUDE.md.

### 5. Scope / one-PR — CONCUR (one blast-radius CONCERN)
- Independent read: one PR is right. (e) is (c)'s only data source over the shared `descriptor.models` seam;
  splitting ships dead code or a forbidden stacked (e→c) PR. Split trigger (carve (e) out only if `/models`
  balloons into per-provider auth/paging/caching) is correctly flagged, not taken.
- **CONCERN — wider blast radius than "the settings dropdown."** The `describeRegisteredHarness` merge changes
  `descriptor.models` for EVERY `/api/harnesses` / `listCapabilityDescriptors` consumer (session dial-in,
  onboarding), not just AV2 Settings — CLI harnesses that returned `[]` will now return a populated list. The
  additive fallback (`?? cliModels(caps)`) contains regression risk, but the builder MUST confirm no existing
  dial-in/onboarding consumer breaks on a now-populated CLI models list. One PR still correct; just review the
  seam's other readers.

### Round-3 verdict: REVISE (builder-ready after cheap fixes — no redesign)

The amendment is honestly grounded and the seams are real and correctly located: the registered-CLI branch
fix is necessary and its plumbing already exists (`adapter-pool.ts:300`), the web needs no new fetch, no-key→
`[]` and the anti-relabel/anti-fallback contract are explicit. Two items the builder MUST handle before
green: (WARNING) failure-isolate the builtin `/models` fetch so it cannot reject the `discoverLocalHarnesses`
Promise.all and blank all discovery; (WARNING) the `claude models` subcommand + format is unverified and
backed only by a memory-authored fixture — extend the ⚠️ UNVERIFIED flag to both CLI subcommands and back
claude with a real-binary check (parity with opencode) or a real-captured fixture. Three minor CONCERNs
(builtin branch must read `discoveries[builtin].models` not `caps`; add an injectable fetch to the probe deps
for the unit test; verify other `descriptor.models` consumers tolerate populated CLI lists). None require a
redesign.
