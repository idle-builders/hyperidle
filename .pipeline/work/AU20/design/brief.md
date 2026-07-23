DESIGN-CLASS: routine  ref=AppShell/SidebarV2/current-view-pages  pattern=docs/information-architecture/*-view.md

# AU20 corrective light-design brief

## Task

Restore confidence in the existing browser/desktop product after AU20 without inventing a new interface. Maintainers need an authoritative interaction contract that separates intentional product moves from stale expectations and real regressions before tests or code change.

## Fixed inputs

- `requirements.md` corrective reset and its finite 604-case inventory.
- `plans/AU20/browser-validation-ledger.json`: 364 browser non-passes, exactly partitioned into 21 primary registers; this pass owns the 14 `owner=design` registers only.
- Current IA and HIL docs: app shell, Work, Conversations, Knowledge, cross-view navigation, open contract, Part model, Settings guide.
- Hearth design rules and tokens. No new primitive, route family, density mode, or visual language.
- Fresh AU20 review findings remain architecture/build obligations; none authorizes visual redesign.

## Settled design questions

1. **Smallest surface:** a contract-reconciliation atlas plus a register decision map. Production UI remains the approved current app.
2. **Primary states:** canonical populated, empty, loading, error, and retained overlay/dialog states at desktop and ≤1024px; 375px specifically for retained bottom-sheet dialogs.
3. **Proof:** semantic role/name and URL/state assertions plus painted screenshots. Test IDs are optional implementation aids, never product anatomy.
4. **Disposition boundary:** design settles current contracts and mappings. Runtime health remains unproven until write-tests/write-code. A contract decision alone never changes a case to “pass.”

## Representative state set

- Shell: Conversations, Work, Knowledge, Settings, Assistant; sidebar always present except standalone NotFound.
- Work: zero teams, one-team redirect, many-team overview, team, bet, task, full-page bet create.
- Conversations: empty queue, populated queue, detail, not-found, dial-in/session split, review link-out.
- Knowledge: Curated, Triage, full-page create, detail/read, detail/edit, in-context capture, scope change.
- Shared: retained dialogs, search, theme light/dark/system, 1920/1024/768/375 geometry, accessibility gates, status/time vocabulary.

## Considered and rejected

- Recreate retired portfolio/product canvas: contradicts current Work IA.
- Restore Settings tabs/avatar entry: contradicts current in-shell stacked Settings contract.
- Restore verdict buttons inside Conversations: contradicts ReviewPage ownership.
- Use screenshots as a blanket rebaseline: hides capability loss and violates corrective requirements.

