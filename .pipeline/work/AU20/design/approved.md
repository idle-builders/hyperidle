# AU20 corrective approved light design

## Chosen direction

Current-contract recovery atlas. Production visual/interaction design remains the authoritative shipped design documented in current IA/HIL. This pass locks how the 14 design-owned registers are interpreted and proved; it does not authorize redesign.

## Locked interaction grammar

- Fixed `Sidebar | Main` shell; three sections and one swapping fast-nav list. Standalone NotFound is outside shell.
- Work is `/work` teams → `/work/team/:id` → `/work/bet/:id` → task/review. One team redirects to team. Bet creation is full page.
- Conversations list/detail share canonical routes; visible filter chips are absent. Reviews link to ReviewPage; session dial-in/session references use `SplitView`.
- Knowledge has Curated/Triage list, `/knowledge/new` full-page creation, in-page edit, retained in-context capture and scope-change dialogs.
- Settings enters from footer gear and is one stacked in-shell page. IA wins over the drifting user guide: exact order is Profile, Org chart, Models, Agents, Filesystems, Agent backends, Connections, Assistant, Appearance, Credentials, Notifications, Worker, Backend. Agent behavior is not an AU20 section. Escape closes and restores focus to the gear. It is not a tabbed modal and has no avatar entry.
- Assistant remains bottom-right overlay and exposes welcome/thinking/reply/missing-key/error states. Outside click does not close it; Escape, trigger-toggle, and close button do, always restoring trigger focus.
- References open through `OpenTarget`; blocks use shared Block actions; messages/sessions use shared Part renderers.

## Shared state and quality contract

- Every retained surface: empty/loading/error/populated/overflow where applicable, using existing DS primitives.
- Light, dark, and live system-theme change without reload/flash; no density control.
- Text ≥4.5:1; interactive targets ≥44px at ≤1024px; visible focus; mobile inputs ≥16px; semantic role/name is proof authority.
- 1920 desktop, 1024 boundary, 768 narrow shell, and 375 retained-dialog state are representative paints. No arbitrary pixel-perfect wrapper contract.
- Status comes through text + shared chips/dots. Invalid time is hidden/placeholder per formatter contract; absolute dates use `MMM D, YYYY` where date-only metadata is specified.
- Retained dialog closure is finite: KnowledgeCreate, ScopeChange, Appetite, ConsequencePreview, RoutineCreate, AgentAdd, AddConnection. Titles/actions/dismissal/focus/mobile behavior and the nine BR-DIALOGS ID mappings are locked in `register-decisions.md`.
- Twenty-six inspected canonical TSX renders and their exact provenance/state coverage are indexed by `current-contract/state-atlas.md`; the summary dashboard is diagnostic navigation only. Current implementation drift visible in a render remains regression evidence, never approval of that drift.

## Register contract

`register-decisions.md` is normative. It owns exactly BR-ACCESS, BR-AGENTS, BR-ARTIFACT-BLOCK, BR-ASSISTANT, BR-CONVERSATIONS, BR-DIALOGS, BR-KNOWLEDGE, BR-MESSAGES, BR-NAV, BR-RESPONSIVE, BR-SETTINGS, BR-STATUS, BR-WORK-DETAIL, and BR-WORK-ROUTES. Accounting is 94 move + 58 stale + 23 known regression + 93 unresolved. All 116 regression/unresolved cases remain runtime obligations. It neither owns nor changes architecture registers.

## Proof contract

1. For an intentional move, preserve the capability at its canonical destination and map old case ID → replacement assertion.
2. For stale selectors/mocks, independently prove current behavior before changing them.
3. For feature regressions, keep/add failing semantic/visual proof before production fix.
4. Every one of 23 known regressions receives red-before-green proof; every one of 93 unresolved cases gets isolated fixture/request/route/paint diagnosis. Design approval is not a pass disposition.
5. Screenshots supplement semantic and network evidence; they never substitute for behavior.

## Component mapping

Reuse the existing components named in `current-contract/spec.md`. New components require returning to design because recovery currently budgets zero.

## Rejected

All items in `synthesis.md`, especially legacy restoration and compatibility wrappers.

## Architect questions

- How are canonical fixture profiles and route/network evidence isolated per register?
- How does the ledger enforce one-to-one old-ID → replacement-ID lineage when intentional moves/stale assertions are updated?
- How are desktop/browser paints, mocked/live backend lanes, prerequisites, artifacts, and terminal accounting separated?
- Which runtime-unresolved cases become focused red proofs versus architecture/harness corrections?
