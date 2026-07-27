# AU20 UI A–L diagnosis

42 formerly unresolved identities across seven registers are dispositioned. None has evidence of a production regression yet. The first divergent boundaries are obsolete routes/contracts, repository-owned disabled seed fixtures, ambiguous selectors, or browser lifecycle failure.

## Controlled evidence

- Focused imported-runtime probe: 58/58 tests passed across 22 suites covering Settings sections, Conversations, Knowledge list/signals, artifact no-preview behavior, and Assistant overlay.
- The attempted 42-identity browser probe was invalidated by shared port 5179 contention from concurrent diagnostic runs. It is not used as evidence and proves no E2E journey green.
- Imported-component green supports only the located selector/fixture boundary; it does not prove end-to-end routing, persistence, focus, responsive, or painted behavior.
- Existing browser failures are used only where they directly expose strict-mode duplicate locators or explicit repository-owned `test.describe.skip`. `ERR_CONNECTION_REFUSED` is excluded.
- Accepted current contracts: `work-view.md`, `app-shell-always-present.md`, and `knowledge-view.md`.

## Counts

| Disposition | Count |
|---|---:|
| Intentional move | 6 |
| Missing external prerequisite | 0 |
| Stale test, mock, skip, or seed fixture | 36 |
| Harness defect | 0 |
| Proven feature regression | 0 |
| Unresolved | 0 |

## Required ordering

1. Isolate the browser server/port.
2. Restore repository-owned deterministic Knowledge seed fixtures; unskip all 15 seed-gated identities.
3. Correct canonical routes and accepted UI moves.
4. Correct fixtures and selectors without weakening semantic assertions.
5. Run corrected tests to their real interaction boundary.
6. Only failures after that boundary become production-red and authorize code changes.

Full per-identity membership, exact symbols, actions, proof requirements, and dependencies are in `ui-a-l.json`.
