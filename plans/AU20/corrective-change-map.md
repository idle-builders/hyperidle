# AU20 corrective change map

Machine source: `plans/AU20/corrective-change-map.json`.

## Coverage

- Identities: **604/604** (588 browser + 16 system)
- Unresolved target dispositions: **0**
- Fresh-review obligations: **5/5 critical + 4/4 warning**
- Harness-defect targets: **0**. Historical harness health is trusted; none is assigned without direct AU20-local evidence.
- Classification review: **accepted and payload-hash bound**.
- Proof-inventory architecture amendment R3: **red proof accepted; amendment write-code unlocked only for this increment**. Scope: one captured verifier, pinned manifest with mandatory builder identity, descriptor-stable reads, physical legacy authority deletion, strict attempts.

## Target dispositions

| Disposition | Count |
|---|---:|
| architecture_obligation | 4 |
| feature_regression | 32 |
| intentional_move | 112 |
| missing_prerequisite | 2 |
| none | 273 |
| proof_gap | 2 |
| stale_test_mock | 178 |
| static_contract_violation | 1 |

## Change locations

| Change kind | Count |
|---|---:|
| aggregate_closeout | 1 |
| documentation | 1 |
| evidence_generator | 2 |
| no_change | 273 |
| prerequisite_or_setup | 2 |
| production_change | 33 |
| test_addition | 2 |
| test_correction | 1 |
| test_move_or_replacement | 112 |
| test_or_fixture_correction | 177 |

## Decision rules

Every entry records root register/problem, exact test and candidate production surfaces, required red proof, owner/layer, test versus production action, and ordered dependencies. Existing reviewed discovery/design decisions are carried forward. Formerly unresolved identities change state only through a hash-bound diagnostic record with direct terminal/imported-runtime/source evidence and an exact first boundary; the generator has no ambiguity default. Repository-owned skips, seeds, mocks, and fixtures are stale-test corrections, never external prerequisites. Only a named unavailable credential, binary, or external service can be a prerequisite. Independent review may revise any target; changed content invalidates the gate hash.
