# U7 Architecture Critique — Tier 1 Primitives Restyle

**Reviewer:** Phase 2 architecture critique
**Artifact:** `plans/U7/architecture.md`
**Round:** 1 of 3

---

## Dimension Scores

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | Completeness | 9 | All 12 ACs map to specific tasks with verification methods. Every component has a task. HTML references update first (Task 0), then TSX (Tasks 1-8), then stories (Task 10), tests (Task 11), verify (Task 12). Protected tests identified. |
| 2 | Correctness | 9 | Token mappings verified against tokens.css: --status-success, --status-warning, --status-error, --status-info, --accent-primary, --accent-primary-dim, --surface-elevated, --surface-container, --surface-page, --text-primary, --text-secondary, --text-tertiary, --text-placeholder, --text-on-accent, --shadow-subtle, --border-default, --r-subtle, --r-default, --r-pill, --font-mono, --font-sans all exist. No contradictions found between the plan and actual token definitions. See Finding 1 for one minor inaccuracy. |
| 3 | Order | 10 | Task dependency graph is correct. Task 0 (HTML) has no deps. Tasks 1-8 depend only on Task 0 and are independent of each other (parallelizable). Task 9 is a verification no-op. Tasks 10-11 depend on 1-8. Task 12 depends on all. This is the optimal ordering. |
| 4 | Risk | 9 | Five risks identified: downstream Lucid consumers, visual regression during partial migration, DaisyUI theme mismatch, font-heading class consumers, NavItem statusDot as additive API. All have mitigations. The plan correctly scopes U7 to only the 8 named components. |
| 5 | Testability | 9 | Every AC has concrete class-name assertions (e.g., `text-[var(--status-success)]`). AC-9 uses grep for negative assertion (zero matches for Lucid tokens). AC-10 uses type-check pass. AC-12 uses full verify. The test strategy is mechanical and unambiguous. |
| 6 | Scope | 9 | Plan explicitly excludes: Tailwind config color updates (out of scope), DaisyUI theme migration (U4 concern), type changes to Status, new token additions, density system changes. One additive prop (statusDot) is the only API surface change. See Finding 2 for a minor scope question. |
| 7 | Contracts | 9 | NavItemProps type signature is fully specified. STATUS_STYLES record is fully specified with exact class strings. Tag radius change is precisely specified. All token replacements are enumerated in both the migration table and per-task sections. |
| 8 | Efficiency | 8 | Minimal change set. Task 9 is explicitly a verification no-op (correct -- tag-tint classes already use Hearth tokens). No unnecessary work. However, the plan duplicates the token mapping table 3 times (design spec, architecture plan reconciliation table, and Task 0 table). See Finding 3. |
| 9 | Clarity | 9 | Unambiguous for a builder agent. Every file is named. Every class change is specified as "old -> new". The execution order diagram at the bottom makes dependencies visual. Type signatures are given as code blocks. Protected tests are called out separately from tests that will be modified. |

**Overall: 9.0 / 10 — PASS (all dimensions >= 7)**

---

## Findings

### Finding 1: Design spec says --r2 was 8px, but architecture plan says --r2 is a token name

**Location:** Design approved.md Radii table: "--r2 -> --r-default (16px)"
**Issue:** The design spec says Lucid `--r2` had value "8px" in the radii table header area, but the architecture plan Task 2 says Tag changes from `rounded-[var(--r2)]` to `rounded-[var(--r-pill)]`. Checking the actual Tag.tsx source: it uses `rounded-[var(--r2)]` -- so `--r2` is a CSS variable reference, not a literal 8px class. Since `--r2` is undefined in Hearth tokens.css, the actual rendered radius is currently 0 (browser fallback for undefined variable). The plan is correct to replace it.
**Severity:** Informational. The plan's task descriptions are correct. The design spec's "8px" annotation for `--r2` refers to the Lucid-era value that no longer resolves.
**Resolution:** Non-blocking. Builder follows the Task-level instructions which are correct.

### Finding 2: Task 9 tokens.css scope ambiguity resolved correctly

**Location:** Architecture plan Task 9
**Issue:** The plan initially considers adding a `.tag-tint-neutral` class, then self-corrects ("Wait -- actually the TSX uses an inline arbitrary value...NO tokens.css change needed"). This reasoning is visible in the plan and could confuse a builder.
**Severity:** Minor. The self-correction is correct -- the neutral Tag uses an inline Tailwind arbitrary value for its background, not a tint class. The final conclusion (no change) is right.
**Resolution:** Non-blocking. Builder reads the final conclusion. The reasoning trail is slightly messy but not ambiguous about the outcome.

### Finding 3: Plan correctly identifies Tag.tsx uses `var(--surface-ghost)` for neutral tag

**Location:** Architecture plan Task 2: "bg-[var(--surface-ghost)] -> bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]"
**Issue:** Verified against source -- Tag.tsx line 43: `bg-[var(--surface-ghost)]`. This is correct. The replacement inline color-mix is necessary because there is no `--surface-ghost` in Hearth and the design explicitly rejected adding one.
**Severity:** Informational (verification positive).
**Resolution:** No action needed.

### Finding 4: Skeleton.tsx plan claims bg-[var(--surface-5)] but actual is bg-[var(--surface-5)]

**Location:** Architecture plan Task 5 vs actual Skeleton.tsx
**Issue:** Verified. SKELETON_BAR uses `bg-[var(--surface-5)]` (line 30) and SkeletonCard uses `bg-[var(--surface-3)]` (line 82). Plan Task 5 correctly maps: bar `--surface-5` -> `--surface-container`, card `--surface-3` -> `--surface-elevated`. This is accurate.
**Severity:** Informational (verification positive).
**Resolution:** No action needed.

### Finding 5: NavItem font class discrepancy

**Location:** Architecture plan Task 3 vs actual NavItem.tsx
**Issue:** Plan says change count badge from `font-[var(--mono)]` to `font-[family-name:var(--font-mono)]`. Verified: NavItem.tsx line 47 uses `font-[var(--mono)]`. The Tailwind `font-[var(--mono)]` shorthand sets `font-family: var(--mono)` directly. The replacement `font-[family-name:var(--font-mono)]` explicitly uses the `family-name:` prefix which is the Tailwind v4 pattern for font-family arbitrary values. Both produce the same CSS output (`font-family: var(--font-mono)`) but the `family-name:` form is more explicit and avoids ambiguity with font shorthand.
**Severity:** Informational. The migration is correct.
**Resolution:** No action needed.

### Finding 6: EmptyState/ErrorState card styling -- density interaction

**Location:** Architecture plan Task 6-7 vs AESTHETICS.md Appendix D
**Issue:** The plan adds `bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-subtle)]` to EmptyState/ErrorState outer div. These are density-static styling additions (background/radius/shadow are not density-dependent). The existing density wiring (pad-x via --density-pad-x, pad-y via --density-card-pad, gap via --density-card-gap) remains untouched. This is correct -- visual styling (color, radius, shadow) is orthogonal to spatial density.
**Severity:** Informational (verification positive).
**Resolution:** No action needed.

### Finding 7: Security surface is correctly assessed as N/A

**Location:** Architecture plan "Security & Abuse Cases" table
**Issue:** This is a pure CSS/styling change with one additive optional prop (statusDot). No new user input handling, no API endpoints, no secrets, no file paths, no outbound URLs. The "N/A" assessment is correct.
**Severity:** Informational (verification positive).
**Resolution:** No action needed.

### Finding 8: Missing explicit mention of HTML _tokens.css link dependency

**Location:** Architecture plan Task 0
**Issue:** Task 0 updates HTML files' inline `<style>` blocks. The HTML files also load `_tokens.css` via `<link rel="stylesheet" href="_tokens.css" />`. Since `_tokens.css` already defines all Hearth tokens (verified: --r-subtle, --r-default, --status-success, etc. all present), the HTML files will correctly resolve the migrated token references. The plan does not explicitly state this dependency but it holds true.
**Severity:** Informational. No risk here -- the dependency is implicit and correct.
**Resolution:** Non-blocking.

---

## AC Coverage Audit

| AC | Covered by Task | Verification Method | Complete? |
|---|---|---|---|
| AC-1 StatusChip Hearth colors | Task 1 | Unit test class assertions | Yes |
| AC-2 Tag pill-shaped | Task 2 | Unit test radius + tint assertions | Yes |
| AC-3 NavItem warm hover + statusDot | Task 3 | Unit test state + prop assertions | Yes |
| AC-4 SearchField 16px radius + focus ring | Task 4 | Unit test class assertions | Yes |
| AC-5 Skeleton warm backgrounds | Task 5 | Unit test bg class assertions | Yes |
| AC-6 EmptyState card styling | Task 6 | Unit test bg/radius/shadow assertions | Yes |
| AC-7 ErrorState card + green retry | Task 7 | Unit test class assertions | Yes |
| AC-8 KeyValue Hearth text tokens | Task 8 | Unit test class assertions | Yes |
| AC-9 HTML references updated | Task 0 | Grep negative test (zero Lucid matches) | Yes |
| AC-10 Stories render | Task 10 | npm run check (type safety) | Yes |
| AC-11 Unit tests updated | Task 11 | npm run test (all green) | Yes |
| AC-12 npm run verify passes | Task 12 | Exit code 0 | Yes |

All 12 ACs are covered. No gaps.

---

## Verdict

**APPROVED.** All 9 dimensions score >= 7 (average 9.0). The architecture plan is thorough, correctly maps every token against the actual tokens.css definitions, identifies all affected files, specifies exact class-string transformations, and provides an optimal task ordering. The builder can execute this plan mechanically with high confidence.

APPROVED — advancing to Phase 3.
