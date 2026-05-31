# U7 Code Review -- Tier 1 Primitives Restyle

**Reviewer:** Phase 4 code review (6 lenses + AC completeness)
**Branch:** `feat/U7-tier1-primitives-restyle`
**Commits reviewed:** `bd5341bf` (tests), `1de0ee4b` (implementation)
**Verdict:** **DONE** (re-reviewed after 2a851455 fix)

---

## AC Completeness Audit

| AC | Description | Status | Evidence |
|---|---|---|---|
| AC-1 | StatusChip Hearth colored badges | PASS | `StatusChip.tsx` STATUS_STYLES uses `--status-success/warning/error/info/text-tertiary`. `StatusChip.html` matches. Tests assert new tokens. |
| AC-2 | Tag pill-shaped with colored tint backgrounds | PASS | `Tag.tsx` TAG_BASE uses `rounded-[var(--r-pill)]`, neutral bg uses `color-mix(...)`. `tag-kinds.tsx` uses `--text-secondary`, `--accent-primary`, `--status-error`. HTML matches. |
| AC-3 | NavItem warm hover + rounded-10px + statusDot | PASS | `NavItem.tsx` uses `--r-subtle` (10px), `hover:bg-[var(--accent-primary-dim)]`, selected `bg-[var(--surface-elevated)]` + `border-l-[var(--accent-primary)]`. `statusDot` prop added with 4-variant Record. HTML CSS classes defined. |
| AC-4 | SearchField 16px radius + forest green focus ring | PASS | `SearchField.tsx` uses `--r-default` (16px), `border-[var(--border-default)]`, `focus:border-[var(--accent-primary)]`, `focus:shadow-[0_0_0_3px_var(--accent-primary-dim)]`. HTML matches. |
| AC-5 | Skeleton warm backgrounds | PASS | `Skeleton.tsx` SKELETON_BAR uses `--surface-container`, SkeletonCard uses `--surface-elevated`. HTML matches. |
| AC-6 | EmptyState warm card styling | PASS | `EmptyState.tsx` has `bg-[var(--surface-elevated)]`, `rounded-[var(--r-default)]`, `shadow-[var(--shadow-subtle)]`. Title `--text-primary`, description `--text-tertiary`. HTML matches. |
| AC-7 | ErrorState warm card + forest green retry | PASS | `ErrorState.tsx` has card styling, title `--status-error`, retry button `bg-[var(--accent-primary)]` + `text-[var(--text-on-accent)]`. HTML matches. |
| AC-8 | KeyValue Hearth text tokens | PASS | `KeyValue.tsx` label `font-[family-name:var(--font-mono)]` + `--text-tertiary`, value `--text-primary`. HTML matches. |
| AC-9 | HTML reference files updated | PASS | Grep for all Lucid tokens (`--ok`, `--warn`, `--danger`, `--text-lo`, `--text-hi`, `--text-mid`, `--primary`, `--surface-2/3/4/5/ghost`, `--r1`, `--r2`, `--mono`, `--ui`) across all 8 HTML files returns ZERO matches. |
| AC-10 | Stories render correctly | PASS | All 8 components have stories. NavItem `WithStatusDot` story added. Container tokens in stories migrated from `--surface-3` to `--surface-container`. StatusChip and Tag demo cards use `--text-secondary`/`--text-tertiary`. |
| AC-11 | Unit tests updated | **FAIL** | The 8 component-level test files are correctly updated. However, 7 downstream consumer test files still assert Lucid tokens (`rounded-[var(--r2)]`, `bg-[var(--surface-ghost)]`) on rendered Tag components, causing 21 test failures. See Blocking Finding B1. |
| AC-12 | npm run verify passes | **FAIL** | Cannot pass with 21 failing downstream tests. |

---

## Blocking Findings

### B1: Downstream consumer tests broken by Tag token migration [AC-11, AC-12]

**Severity:** Blocking
**Contract:** Architecture plan Task 11 lists test files to update but misses consumer tests that transitively render Tag with assertion on Tag's class names.

Tag.tsx changed `rounded-[var(--r2)]` to `rounded-[var(--r-pill)]` and `bg-[var(--surface-ghost)]` to `bg-[color-mix(...)]`. Seven downstream test files assert these old class names on rendered Tag elements:

| File | Failing assertions |
|---|---|
| `packages/web/src/__tests__/ThreadRow.test.tsx` | 3 (r2) |
| `packages/web/src/__tests__/BetCard.test.tsx` | 2 (r2 + surface-ghost) |
| `packages/web/src/__tests__/TaskCard.test.tsx` | 2 (r2 + surface-ghost) |
| `packages/web/src/__tests__/PitchCard.test.tsx` | 4 (r2 + surface-ghost) |
| `packages/web/src/__tests__/KnowledgeRow.test.tsx` | 6 (r2 + surface-ghost) |
| `packages/web/src/__tests__/KnowledgeDetail.metadata.test.tsx` | 3 (r2 + surface-ghost) |
| `packages/web/src/__tests__/NotificationRow.test.tsx` | 3 (r2 + surface-ghost) |
| **Total** | **21 failures** |

**Fix:** Update all 7 files: replace `rounded-[var(--r2)]` assertions with `rounded-[var(--r-pill)]`, and `bg-[var(--surface-ghost)]` assertions with the new color-mix value or use `.toContain("text-secondary")` as a proxy.

**Note:** ThreadRow and TaskCard tests also reference `var(--danger)` for their own component's border styling (not Tag), but those pass because ThreadRow/TaskCard themselves have NOT been migrated yet -- their `border-[var(--danger)]` is still correct for the unmigrated components. Those are out of scope for U7.

---

## Lens Findings

### Lens 1: Architecture

**Token migration table: correct.** Every Lucid-to-Hearth mapping in the architecture plan (Task 0 table) is applied correctly in both HTML and TSX. Verified by grep: zero Lucid tokens remain in any of the 8 HTML files or 9 TSX component files.

**Task order: respected.** HTML updated first (design source of truth), TSX matched to HTML, stories updated, tests updated. The ESLint rule update (`use-density-tokens.ts`) for `--accent-primary` is a correct side-effect fix -- the ErrorState retry button would have failed the density lint without it.

**Type addition: correct.** `NavItemProps.statusDot` is typed as `"success" | "warning" | "error" | "info"` -- matches the architecture plan exactly. The `STATUS_DOT_COLORS` record uses `NonNullable<NavItemProps["statusDot"]>` as its key type, which is type-safe.

**Out-of-scope changes in diff:** The `git diff main..HEAD` includes changes to `packages/db/src/index.ts`, `packages/db/src/test-utils.ts`, `scripts/test.ts`, `scripts/verify.ts`, and `vitest.config.ts`. These are NOT authored by U7 -- they come from main advancing past the branch point (commit `65ce1859`). They will resolve on rebase.

### Lens 2: Design

**Token parity: HTML and TSX match.** Verified all 8 components:
- StatusChip: Both use `--status-success/warning/error/info`, `color-mix(in oklab, ... 14%, transparent)`, `--font-mono`. Correct.
- Tag: Both use `--r-pill`, `--font-sans`, `color-mix(in oklab, var(--text-secondary) 8%, transparent)`. Correct.
- NavItem: Both use `--r-subtle`, `--accent-primary-dim` hover, `--surface-elevated` selected, status dot CSS defined in HTML and TSX. Correct.
- SearchField: Both use `--r-default`, `--border-default` visible border, `--accent-primary` focus, `--accent-primary-dim` shadow. Correct.
- Skeleton: Both use `--surface-container` bars, `--surface-elevated` card. Correct.
- EmptyState: Both use `--surface-elevated` + `--r-default` + `--shadow-subtle` card. Correct.
- ErrorState: Both use card styling + `--status-error` title + `--accent-primary` retry. Correct.
- KeyValue: Both use `--font-mono` label, `--text-tertiary`/`--text-primary`. Correct.

**States coverage:** All pre-existing states preserved. StatusChip covers all 7 variants (6 + unknown). NavItem covers default/selected/hover. SearchField covers default/focus/loading/with-value. EmptyState/ErrorState cover with/without action.

**Non-blocking:** The NavItem HTML demo component does not render the `statusDot` (CSS classes are defined but the inline `NavItem` function does not accept or render the prop). This means the HTML reference is incomplete for that new feature -- the CSS specification exists, but no visual demo of it in the HTML file.

### Lens 3: Security

No security surface. This is a pure CSS/styling change with one additive optional prop. No new user input, no API endpoints, no secrets, no path handling, no outbound URLs. The `as Status` cast in `StatusChip.tsx:89` is pre-existing and safe (guarded by `KNOWN_STATUSES.has(status)`).

### Lens 4: Adversarial

**The Saboteur:** No regressions introduced in component logic. The status-to-color mapping is preserved (same statuses map to equivalent-intent colors). The `BUTTON_SHAPED` regex update in the ESLint rule correctly uses alternation `(?:primary|accent-primary)` to handle both old and new token names during the migration window.

**The New Hire:** The `@lore U7` comment in `NavItem.tsx` (lines 34-37) documenting the full migration is valuable for traceability. The color-mix expressions in Tag and NavItem count badge are long but match the HTML reference exactly.

**The Auditor:** PR claims (commit message) match the diff exactly. 26 files claimed, 26 files changed. Every component listed is actually migrated.

### Lens 5: Simplification

No over-engineering detected. The changes are mechanical token swaps. The `STATUS_DOT_COLORS` record is the right pattern (not a switch or if-else chain). No dead code introduced. No single-use helpers. No unnecessary abstractions.

The `@lore U7` comment in NavItem listing all old and new token names (lines 34-37) is borderline verbose but justifiable as migration documentation.

### Lens 6: AI Slop

No AI slop detected. No hardcoded colors (grep confirms zero hex/rgb values in changed files). No magic numbers (all values come from tokens or the existing literal-pixel budget). No filler code. No `=== true`. No "TODO: implement". No unnecessary comments beyond the existing `@lore` annotations.

The `color-mix(in_oklab,var(--text-secondary)_8%,transparent)` pattern appears in 3 places (Tag neutral, NavItem count badge, SearchField clear button hover) which is correct per the architecture plan's resolution for `--surface-ghost` replacement.

---

## Summary

The implementation is clean, thorough, and matches the approved architecture plan precisely across all 8 components, 8 HTML references, and 6 stories files. The single blocking issue is that 7 downstream consumer test files assert old Lucid token class names on rendered Tag elements, causing 21 test failures. The fix is mechanical -- update `rounded-[var(--r2)]` to `rounded-[var(--r-pill)]` and `bg-[var(--surface-ghost)]` assertions in those 7 test files.

**Required fix to unblock DONE:**
1. Update Tag-related assertions in: `ThreadRow.test.tsx`, `BetCard.test.tsx`, `TaskCard.test.tsx`, `PitchCard.test.tsx`, `KnowledgeRow.test.tsx`, `KnowledgeRow.factory.test.tsx`, `KnowledgeDetail.metadata.test.tsx`, `NotificationRow.test.tsx`
2. Run `npm run verify` -- must exit 0

---

## Re-review (2a851455)

**Commit:** `2a8514553d` -- updates 7 downstream test files (ThreadRow, BetCard, TaskCard, PitchCard, KnowledgeRow, KnowledgeDetail.metadata, NotificationRow).

**Verification:**
- All 7 files now assert `rounded-[var(--r-pill)]` instead of `rounded-[var(--r2)]` for Tag elements.
- Tag background assertions updated from `bg-[var(--surface-ghost)]` to `text-secondary` proxy matching the new `color-mix` pattern.
- `KnowledgeRow.factory.test.tsx` was correctly excluded from the fix: its `bg-[var(--surface-ghost)]` assertion (line 50) targets the version pill (`data-testid="knowledge-version-pill"`), not a Tag element. The version pill's source still uses `--surface-ghost`. Not a U7 concern.
- Remaining grep hits for `var(--r2)` in `Tag.test.tsx` and `Tag.kind.test.tsx` are negative assertions (`not.toContain`) -- guardrails confirming old tokens are absent. Correct.
- 10 test files, 122 tests: all pass.

**Verdict: DONE**
