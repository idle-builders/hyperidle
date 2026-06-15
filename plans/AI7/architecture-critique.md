# AI7 — Architecture critique (reviewer, Phase 2)

**Verdict: 6.5 / 10 — NOT YET APPROVED. One CRITICAL (gate scope breaks `npm run lint`) must be fixed before build.** The plan is otherwise strong: correct token reconciliation, correct AC5 re-grounding, sound task ordering (gates-after-migration), real precedent reuse. But the two proposed lint gates, as scoped, will fire on out-of-scope files and turn `npm run lint` red — which AI7 cannot fix without scope creep into AG7/onboarding/AG-AH component territory. That is a hard blocker for a track whose rule is "verify must pass after every WP."

## Ground-truth verification of plan claims

| Plan claim | Verified | Result |
|---|---|---|
| `--tracking-caps-sm` token exists | `tokens.css:97` = 0.06em | TRUE — token form is correct; NOT a CRITICAL (the brief's worst-case did not materialize). |
| `no-hardcoded-tracking` is error on DS src, forbids positive-em literals | `eslint.config.ts:224` `"design/no-hardcoded-tracking": "error"` in the `design-system/src/**/*.tsx` block | TRUE — primitives must use token form. Plan handles this correctly. |
| `tracking-[-0.01em]` negative-em is allowlisted | (consistent with rule intent; title kerning kept literal) | Plausible — builder must confirm the rule allows negative-em; if it errors, title needs a token too. Minor risk R-new. |
| AppShell host `overflow-hidden` | `AppShell.tsx:573` | TRUE. |
| Snapshot guard `>= 56` at two sites + comments | `catalog-snapshot.test.tsx:73`(`:71` text), `:223`, comments at 4,16,71,222 | TRUE — sites accurate. Story counts: 49 root + 7 kinds = 56 confirmed by `ls`. |
| Precedent rules `no-local-status-builder`/`no-handrolled-select` | Exist; both scope to **all `packages/web/src`** via `filename.includes("packages/web/src")` | TRUE — and this is the root of C1: the precedent scope is web-src-wide, not pages-only. |
| KnowledgeCreate inline style | `KnowledgeCreate.tsx:134` confirmed | TRUE. |
| `SectionHeader` private in Sidebar | `Sidebar.tsx:127` | TRUE. |

## Per-dimension scores

| # | Dimension | Score | Note |
|---|---|---|---|
| 1 | Layer integrity | 9 | Human-interface only; no Meta/Agent reach. Correct. |
| 2 | Contract/type fidelity | 8 | Prop interfaces match design; `dsProps` signature verified; token-corrected class strings. |
| 3 | Plan↔reality reconciliation | 8 | The reconciliation table is genuinely load-bearing and mostly accurate. One row (gate scope) is wrong — see C1. |
| 4 | AC→verification mapping | 7 | AC1–AC5 each get a real method; AC5 correctly re-grounded on snapshot net. AC2's "structural property reviewed in diff" is thin but acceptable for a presentational change. |
| 5 | Static-gate soundness | 4 | **The two gates over-reach.** As scoped they flag out-of-scope files → lint red. C1 + C2. |
| 6 | Task ordering | 8 | Gates-land-at-error-LAST (after migration) is the right order. Phase A→E sound. |
| 7 | Migration completeness | 6 | 10 pages covered, but multi-branch roots (WorkTeam 4+ returns, AgentProfile 3, WorkRoutine 3) under-enumerated; and the `font-heading` blast radius outside pages is unaddressed — W2. |
| 8 | Risk register honesty | 8 | R1–R4 are real and the R2 false-positive risk is correctly anticipated — but under-scoped (see C2: it's not just "elsewhere in pages," it's SettingsPage + SetupFlow concretely). |
| 9 | Security/abuse | 9 | Correctly N/A across the board; XSS note (ReactNode escaped, no dangerouslySetInnerHTML) is the right call. |

## Findings

### CRITICAL C1 — `no-undefined-font-heading` at error on `packages/web/src/**` breaks lint on out-of-scope files
Task 10 puts `no-undefined-font-heading` at **error for `packages/web/src/**`**, and task 7 scopes the rule "like `no-local-status-builder`" — which I verified matches **all of `packages/web/src`** (`filename.includes("packages/web/src")`). But `font-heading` / `tracking-wider` live in NON-page files AI7 does not touch:

- `components/ArtifactSection.tsx:98,130,149,170` — `font-heading ... tracking-wider`
- `components/ArtifactThreadsSummary.tsx:54,80` — `font-heading`
- `components/ArtifactThreadsSummary.stories.tsx`, `shell/HostThreadSection.stories.tsx` — `font-heading`
- `shell/TaskSheet.tsx:174,407,487,510` — `font-heading`
- `components/BlockRefEmbed.tsx:56,91`, `components/ReasoningBlockView.tsx:33`, `components/ThreadSections.tsx:375`, `shell/ArtifactView.tsx:62` — `tracking-wider`
- `designsystem/DesignSystem.tsx:123,172` — `font-heading`

Turning the rule on at error web-src-wide makes `npm run lint` **red** on ~8 files outside AI7's scope (Track AG/AH and content-primitive territory). AI7's track rule is "verify must pass after every WP." The plan does not resolve this. **Fix options (architecture must pick one before build):**
1. Scope `no-undefined-font-heading` at error to `packages/web/src/pages/**` only (the AC2/AC3 surface), leave it at `warn` web-src-wide for the durable-defect-class value. This matches the AC ("no undefined utility classes" is asserted for *primary pages*).
2. Migrate the non-page occurrences too — rejected: scope creep into AG/AH, violates the boundary note (line 11) and out-of-scope list.

Option 1 is correct. Note this also splits `font-heading` (a real undefined-utility defect — worth a web-wide *warn* now, error later when AG/AH clean their files) from `tracking-wider` (NOT undefined — it is Tailwind's valid 0.05em; it is merely off the Hearth caps scale, and is used *intentionally* as mono-cap micro-labels in BlockRefEmbed/ReasoningBlockView/ThreadSections). **Erroring on `tracking-wider` web-wide is doubly wrong** — it is neither undefined nor always a fork. Confine the `tracking-wider` arm to `pages/**`.

### CRITICAL C2 — `no-handrolled-page-header` at error on `pages/**` flags pages NOT in the migration list
Task 8/10 puts `no-handrolled-page-header` at error on `packages/web/src/pages/**`, matching the title combo `text-[20px]`+`font-[600]`+`tracking-[-0.01em]`. I grepped every 20px-title site in `pages/`. Two are in files AI7 does NOT migrate (its list is exactly 10 pages; these are not among them):

- `pages/SettingsPage.tsx:43` — `<h2 className="text-[20px] font-[600] tracking-[-0.01em]">Settings</h2>` — **SettingsPage is AG7's; explicitly out of AI7 scope** (boundary note line 11, out-of-scope list). The gate flags it → lint red.
- `pages/SetupFlow.tsx:237` — `<p className="text-[20px] font-[600] text-... tracking-[-0.01em]">` — onboarding flow, not in the 10-page list. Flagged → lint red. (Line 225 is `font-[700]`, correctly excluded by the combo.)

The R2 mitigation anticipates false-positives "elsewhere in pages" but treats it as a tuning detail; it is concretely two out-of-scope pages that will turn lint red. **Fix:** either (a) the gate must `ignores` SettingsPage + SetupFlow (and document why), or (b) migrate them too — rejected, scope creep. Cleanest: the gate exempts the two named files, OR the rule only fires when the combo is NOT already inside a `PageHeader` AND the file is one of the 10 migrated pages. Architecture must specify the exemption mechanism; "error on all pages/**" as written breaks the build.

### WARNING W1 — the KnowledgeCreate migration directly contradicts `no-handrolled-page-header`
Task 17 keeps the editable `<input>` and applies title classes via className — i.e. it writes `text-[20px] font-[600] tracking-[-0.01em]` into `KnowledgeCreate.tsx` (a page in the gate's scope). The gate (task 8) forbids exactly that combo in `pages/**` outside a `PageHeader`. Even though the input sits in PageHeader's `title` slot, the className lives on a page-owned node in the page file — the AST-level heuristic ("a className carrying the 20px-title signature on a JSX element whose name is not `PageHeader`") will flag the `<input>`. The plan's R2 negative case ("a 20px non-title heading without the full combo passes") does not cover this — the input HAS the full combo. Architecture must either add a `titleClassName`/`editable` affordance to PageHeader so the page never writes the literal, or define a precise gate exemption (e.g., the combo is allowed on an element that is a direct child passed to a `PageHeader title=` slot — hard to detect statically). Recommend the affordance. This is the same issue flagged in design-critique W1; it surfaces here as a concrete gate contradiction.

### WARNING W2 — multi-branch page roots under-enumerated in the migration tasks
WorkTeam has 4+ return branches all rooted `flex-1 overflow-y-auto` (loading, error, not-found, malformed-guard, loaded — verified `WorkTeam.tsx:111,127,139,151...`). AgentProfile (`:87,99,109`) and WorkRoutine (`:68,77,85`) likewise have multiple `flex flex-col ... h-full` branches with no pinned header. Tasks 18–20 say "root → scaffold" singular. If the builder migrates only the loaded branch, the loading/error/not-found states keep the old (scroll-away or headerless) shape and AC2 ("one scroll rule on EVERY page") fails for those states. The plan should state: every return branch of each migrated page adopts the scaffold (or the page hoists a single scaffold wrapper above the branch switch). Not a blocker — intent is clear — but call it out so the builder doesn't miss the non-happy-path branches.

### WARNING W3 — snapshot guard bump `56 → 58` assumes exactly two new story FILES, but the net counts MODULES not variants
The enumeration guard counts `modules.length` (story FILES via `import.meta.glob`), not variants. Two new files (`PageHeader.stories.tsx` + `SectionLabel.stories.tsx`) → 56→58 module count is correct. Good. But the plan's task 6 comment edits say "49→51 root, 56→58 total" — verify the comment at `:71`/`:222` and the message string at `:73` all move together (three text sites + two numeric guards). The plan lists the sites; just confirm the builder updates the *message template* too (`Expected ≥56 ... got ${...}`) or the error text lies. Cosmetic but the rule says "never skip the enumeration guard" — keep it honest.

### NIT N1 — `tracking-[-0.01em]` negative-em allowlist unverified
Plan asserts negative-em is allowlisted by `no-hardcoded-tracking`. I did not open the rule body. If it forbids ALL `tracking-[Nem]` literals (positive or negative), the PageHeader title needs a token too and there isn't one for -0.01em. Builder must confirm in the red phase; low risk (the existing de-facto title string already ships in the tree, so it presumably passes today).

### NIT N2 — AC2 has no positive runtime assertion for the scaffold
AC2's verification leans on "reviewed in the diff" + AC4 page tests. A one-line component/structural test that the migrated page root carries `overflow-y-auto` and the PageHeader carries `shrink-0` would make the pinned-rule machine-checked rather than eyeball-checked. The PageHeader `shrink-0` test is already in task 1; consider a tiny per-anomaly-page assertion. Optional.

## Bottom line
The design and the plan's substance are right. The blocker is purely the **gate scoping**: both proposed ESLint rules, at error on the scopes written (`web/src/**` and `pages/**`), will fire on files AI7 must not touch (ArtifactSection/TaskSheet/ThreadSections/DesignSystem for C1; SettingsPage/SetupFlow for C2), turning `npm run lint` red and making the WP un-shippable under the track rule. Plus the KnowledgeCreate migration writes the very string the C2 gate forbids (W1). Architecture must:
1. Scope `no-undefined-font-heading` error to `pages/**` (warn elsewhere); confine its `tracking-wider` arm to `pages/**` (it is not an undefined utility).
2. Scope/exempt `no-handrolled-page-header` so SettingsPage + SetupFlow do not trip it.
3. Give PageHeader an editable-title affordance (or a precise exemption) so KnowledgeCreate doesn't write the forbidden combo.

With those three fixes the plan is build-ready (would score ~8.5).
