# AU20 browser discovery analysis

## Accounting

`browser-validation-ledger.json` reconciles all 588 declared lane-cases. Execution remains a fact separate from causal disposition:

- 224 passed
- 126 failed
- 143 timed out
- 32 explicitly skipped
- 63 unrun

Current evidence-backed planning dispositions:

- 23 feature regressions
- 99 intentional moves
- 60 stale tests/mocks
- 1 missing prerequisite
- 224 passing/no correction
- 181 unresolved

No reporter-signature-derived root/cascade graph remains. Every non-pass is independent until an intervention demonstrates a causal edge.

## Targeted probes

Seven durable probe records live under `browser-validation-ledger.json#/probes`. Each records exact command, exit code, captured artifact kinds, direct evidence, and counter-evidence.

- AB1: `/work/teams/:id` paints NotFound; canonical route is `/work/team/:id`. Profile behavior was not reached.
- AG2: `/work/portfolio` redirects into current Work/team flow; retired portfolio fixture then leaks a 502. Canonical Work behavior is not thereby proven healthy.
- AH3 Settings: current stacked section buttons paint; `role=tab` never exists. Persona styling was not reached.
- Work task rows: current task buttons paint instead of a table. Session metadata remains unproven.
- T4 pitch: semantic Pitch region paints; retired `bet-pitch` test id blocks reaching block actions.
- L9 detail: current conversation header/composer/send surface paints; retired `thread-shell` test id is absent.
- AH1: owning lane reaches `/work`, while test waits for `/work/portfolio`; Settings button paints while test waits for `sidebar-avatar-btn`. Credential state assertions were never reached.

## Primary problem register

The ledger partitions all 364 browser non-passes into 21 concrete primary registers. Each register has one owner (`design` or `architecture`), a concrete problem statement, affected IDs, execution/disposition distributions, direct and counter-evidence, confidence, one specific proof, and separate contract/runtime questions. No passing case is registered. Optional secondary links carry domain context for lane-accounting cases without creating another owner.

| Primary register | Cases | Owner | Problem |
|---|---:|---|---|
| BR-LANE | 70 | architecture | lane overlap and missing terminal accounting |
| BR-WORK-ROUTES | 46 | design | retired portfolio/product routes versus current Work hierarchy |
| BR-SETTINGS | 44 | design | retired avatar/dialog/tab anatomy versus stacked Settings |
| BR-KNOWLEDGE | 37 | design | list/create/scope/signals/body contract split |
| BR-ACCESS | 22 | design | WCAG and touch-target conformance |
| BR-CONVERSATIONS | 21 | design | list/filter/detail presentation and navigation |
| BR-NAV | 19 | design | global search, shortcuts, routes, and NotFound |
| BR-RESPONSIVE | 19 | design | responsive geometry and theme behavior |
| BR-WORK-DETAIL | 14 | design | bet/task anatomy, actions, and metadata |
| BR-ARTIFACT-BLOCK | 12 | design | artifact and block actions/discussion |
| BR-MESSAGES | 10 | design | rich messages, reviews, and responses |
| BR-DIALOGS | 9 | design | retired versus retained dialog behavior |
| BR-FIXTURES | 7 | architecture | route/mock/API shape compatibility |
| BR-LIFECYCLE | 7 | architecture | task/session lifecycle and dial-in projections |
| BR-AGENTS | 6 | design | agent profile, composition, and placement |
| BR-SETUP | 6 | architecture | first-run transaction and landing |
| BR-ASSISTANT | 5 | design | Assistant/CoC overlay states and interactions |
| BR-STATUS | 4 | design | status/time vocabulary parity |
| BR-AH6 | 3 | architecture | cassette scenario divergence |
| BR-AH1 | 2 | architecture | credential proof blocked by journey drift |
| BR-AH5 | 1 | architecture | live-path ownership and prerequisite |

Mechanical reconciliation lives at `browser-validation-ledger.json#/problemRegisterReconciliation`:

- declared: 588;
- passes excluded: 224;
- non-passes: 364;
- primary memberships: 364;
- unique registered non-passes: 364;
- missing IDs: 0;
- duplicate primary memberships: 0;
- passing IDs in registers: 0;
- pairwise primary intersections: 0;
- exact set equality: true.

## Remaining exact unknowns

181 cases remain deliberately unresolved: 65 failures, 31 timeouts, 23 explicit skips, and 62 unrun; 177 belong to the default mocked lane, one to AH1, and three to AH6. They are no longer a catch-all register: every one belongs to exactly one concrete primary problem and owner above.

They remain unknown for specific reasons:

- Unrun and skipped cases have no behavior result. Execution state alone cannot identify a harness, test, or product cause.
- Generic timeouts without an isolated snapshot/network record cannot distinguish a missing feature from fixture/selector drift.
- Failed locator assertions without a current-contract citation and painted counter-evidence cannot safely be called stale or broken.
- AH1 stale routing/selectors prevent credential assertions; credential behavior remains unknown.
- AH6 boots and passes one scenario, but three failures still need per-scenario API/server-event evidence to separate cassette drift from application regression.
- Knowledge Q2 AC-11, AC-12, and AC-20 remain unresolved. Current Knowledge IA retains in-context capture, scope change, and Private semantics, so the prior top-level-create intentional-move classification was invalid.

Largest unresolved files are L21 CoC overlay (12), L17 cost tokens (11), L22 Knowledge signals (10), R9 action prominence (10), synthesis (10), L14 bet actions (9), and L23 Knowledge body (8). Each exact case ID and next reproduction command remains in the ledger.

Architecture must first make lanes disjoint and terminally account every case. Light design must settle current Work, Settings, Conversations, Knowledge, accessibility, and responsive interaction contracts. Each primary register's `decisionTable` separates settled migrations from unresolved reruns. Only then can tests change against approved contracts without manufacturing green.
