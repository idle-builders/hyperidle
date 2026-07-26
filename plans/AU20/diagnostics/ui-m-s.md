# AU20 UI M–S diagnosis

43 formerly unresolved identities are dispositioned with no shared-port browser result treated as evidence.

| Disposition | Count |
|---|---:|
| Intentional move | 6 |
| Missing external prerequisite | 0 |
| Stale test/mock/skip/fixture | 37 |
| Harness defect | 0 |
| Proven feature regression | 0 |
| Unresolved | 0 |

Controlled imported-runtime probe: 161/161 tests passed across 51 suites covering global search, keyboard navigation, settings shell, ThreadShell, Conversations, Sidebar, Knowledge/Work width contracts, and status components. This supports only selector/fixture hypotheses; it does not prove any E2E journey, routing, request, persistence, focus, responsive, or painted behavior. The shared-port browser run is invalidated and excluded.

Dominant first boundaries:

- global semantic selectors became ambiguous after both persistent and overlay controls rendered;
- message tests never mount current ThreadShell because their mocked API envelope is stale;
- Settings is shell content, not a modal dialog;
- responsive tests target retired landmarks or outer containers;
- skipped synthesis identities lack their named fixtures;
- connection reset is browser lifecycle failure, not product evidence.

Per-identity memberships, exact symbols, corrective actions, red proofs, and dependencies are in `ui-m-s.json`.
