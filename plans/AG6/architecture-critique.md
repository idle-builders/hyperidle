# Architecture Critique: AG6

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:10 AC:8 DM:n/a N:9 MD:8 FMC:7 S:9 V:9

Plan scored cold against TRACK-AG.md §AG6, `plans/AG6/design/approved.md`, and codebase reality. Every spec/codebase claim in the Plan-reconciliation table was verified by grep: `AgentRow` §597, `RoutineRow` §748, `BetRow` §829 in WorkTeam.tsx; `KnowledgeListRow` §249 in KnowledgeList.tsx; testids `agent-row` (34 uses), `agent-customize-btn` (11), `agent-card-category` (3), `agent-status`, `routine-row`, `team-routines-empty` all present in the named protected tests; NotificationRow anatomy is `py-[12px] px-[24px]` (matches the catalogued claim); `clickableProps`, `EmptyState`, `ErrorState`, `Skeleton` all exist. No CC-007 drift. This is a strong, reality-grounded plan. Findings are polish + two real gaps.

## Dimension notes
- **Spec Alignment (9):** All six ACs map to concrete tasks (AC→task map present and correct). AC-4's "removed or reduced" is enforced by the grep-returns-0 deletion checks on AgentRow/RoutineRow/KnowledgeListRow. No scope creep — the opportunistic NotificationPopover migration is correctly marked not-gated.
- **Layer Integrity (10):** Pure presentational primitive in `packages/design-system`, consumed by `packages/web` pages. No layer violation possible. No network, no DB.
- **API Contracts (8):** Component prop contracts are fully typed and resolvable (`RowDotProps`, `RowCell`, `RowProps`, `ItemListProps`, `ItemListEmpty`, `ItemListError`). State precedence documented. See WARNING on the `tone` union mismatch.
- **Data Model (n/a):** No schema. Correctly excluded from the average.
- **Naming (9):** `Row`/`ItemList`/`RowDot`/`RowCell`/`RowTone` are honest and don't collide with closed vocab (Bet/Task/Thread/Block/Artifact). `ItemList` over `Table` is correct — these are scannable lists, not sortable grids (synthesis rejected the data-grid correctly).
- **Module Depth (8):** 3 exported components + 3 types serve every named consumer (agents, routines, knowledge, opportunistic notifications) with no per-consumer wrapper. The `as` escape hatch keeps the heuristic from leaking. Good depth. Minor: `isEmpty` + `empty` + children-emptiness is three ways to express one thing (see SUGGESTION).
- **Failure-Mode Coverage (7):** Security/abuse block present and correctly N/A-with-reason for a presentational primitive (React auto-escaping is the one real trust boundary, named). Drops a point for the two real gaps below (hover token, protected-test list completeness).
- **Simplicity (9):** Design-it-twice on ItemList state-ownership is genuine (not theatre) — Option B is a real alternative (status quo) with a real reject reason (AC-5 unmet). `ItemList.rows` correctly deferred YAGNI.
- **Verifiability (9):** Every AC has a concrete method (importable types, named stories, component-test assertions, grep-0 deletion checks, E2E screenshots). Failing-test-first ordering is correct (T1–T3 each pair a `.test.tsx` with the impl). Protected-tests block populated.

### CRITICAL
- None.

### WARNING
- [arch §Type contracts / §Migrations + design approved.md] **Hardcoded hover color.** The locked design specifies hover as `bg-[rgba(44,36,26,0.02)]`. As production TSX this violates **AQ-008** (no `rgb()`/hardcoded color) and **AQ-018** (warm tint must trace to a token), and `npm run lint` (eslint-plugin-design `no-hardcoded-color`) will fail T2. It also diverges from the row hover every sibling row already uses: `bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]` (KnowledgeRow.tsx, NotificationRow.tsx, clickable.ts). → The plan should restate the Row hover as the `color-mix` token form (or reuse `clickableProps`, which already bundles that exact hover + focus-visible + `duration-[var(--motion-fast)]`) so the builder doesn't transcribe the rgba literal from approved.md. Note this collides with the design-critique WARNING — both must resolve to the same token hover.

- [arch §Type contracts, `RowCell.tone`] **Type union mismatch.** `RowCell.tone?: RowTone | "default"` while `RowDotProps.tone: RowTone` (no `"default"`). `RowTone` already includes `"neutral"`. Having both `"neutral"` and `"default"` on cells (where `"default"` → text-tertiary and `"neutral"` also → text-tertiary per design §5/§1) is a redundant two-spelling-for-one-meaning trap and a divergence vector. → Either drop `"default"` and let `tone` be optional (`tone?: RowTone`, undefined → tertiary), or document the exact distinction between `"default"` and `"neutral"`. Resolve before T2 so the test asserts one canonical mapping.

### SUGGESTION
- [arch §Type contracts, `ItemListProps`] `isEmpty?: boolean` plus `empty?` plus children-emptiness gives three signals for the empty branch. The precedence ("empty when isEmpty OR no children") is documented but the migrations always pass `isEmpty={x.length===0}` explicitly — meaning the "no children" auto-path is never exercised by a real consumer. Consider keeping only the explicit `isEmpty` path (children-counting React.Children is fiddly and a known footgun) and dropping the implicit empty-on-no-children, or test it explicitly in T3.
- [arch §Migrations WorkTeam agents] The category `Tag` placement is left ambiguous ("an extra cell or kept before status"). `agent-card-category` is asserted in 3 protected-test locations — pin the exact cell position/order now so T6 doesn't churn against the test. Minor; the testid is preserved either way.
- [arch §Risks 3] The agent `context` cell uses `align:"start"` + fixed `width:140` + truncate — flagged as a risk to the fixed-cell model. Good that it's named; T6 should assert the cell truncates rather than wraps (add to the WorkTeam component test).
- [arch §Stories plan] Stories cover all five AC-1 named states (plain/status/trailing-action/selected/empty) plus extras. `ItemList.stories` `Empty` covers AC-1's "empty list". Complete. No action — confirming.
- [design-critique carryover] `RowDot` (static tone dot) is distinct from the existing `LiveDot` (pulsing accent dot) — justified as separate, but T1 should not duplicate LiveDot markup. Phase-4 check.

### What's Working Well
- The Plan-reconciliation table is exemplary: every spec assumption is checked against actual code with file/line evidence, which is exactly what kills CC-007 drift. I re-verified each row by grep and all held.
- Protected-tests block (CC-008) is explicit and correct: `WorkTeam.AA1/AB2/AB3` + the two E2E specs (`time-vocabulary`, `L13-product-drilldown`), with "assertions must not change" — and the migrations preserve every testid those tests select on. The e2e-selector gap (L7 recurrence) is closed: `agent-row`, `knowledge-row`, `knowledge-time` are the selectors the named specs use, and all are preserved through `Row`/`RowCell` `data-testid` passthrough.

---

## Re-critique (round 2) — confirmation pass

ARCHITECTURE-SCORE: 9/10  rounds=2  score-line: SA:9 LI:10 AC:9 DM:n/a N:9 MD:9 FMC:9 S:9 V:9

**Verdict: APPROVED.**

Both WARNINGs resolved:

1. **Hover token.** `architecture.md:96` now states the hover in token form, sources it from `clickableProps`/`clickable.ts`, and explicitly tells T2 not to transcribe the mockup rgba (cites AQ-008, AQ-018, the eslint `no-hardcoded-color` failure). The `rgba(44,36,26,0.02)` appears in the doc only as the named anti-pattern. AC and FMC unblocked. Matches the design-critique resolution — both land on the same `color-mix` token.

2. **`RowCell.tone` union.** `architecture.md:50` is now `tone?: RowTone` — single spelling, `"default"` alias dropped, undefined → text-tertiary. No `"default"` type member remains; the only `"default"` strings in the doc are prose confirming its removal. T2 can assert one canonical tone→color mapping. API Contracts mismatch closed (8→9).

SUGGESTIONs folded:
- `isEmpty` is now a single required signal (`architecture.md:86,92`); the implicit React.Children-counting path is removed as a footgun, T3 asserts the explicit branch only. Module Depth's "three ways to express one thing" is gone (8→9).
- `agent-card-category` cell position pinned as the **first cell** (`architecture.md:136`), with the 3-protected-test assertion noted — no T6 churn risk.
- `RowDot`≠`LiveDot` carryover restated at `architecture.md:98` — author fresh, no pulse copy. Phase-4 check stands.
- Context-cell truncation risk (Risk 3) and stories completeness unchanged — already acceptable.

FMC +2 (7→9): both real gaps (hover token, tone union) closed; protected-test list was already complete. No new findings.
