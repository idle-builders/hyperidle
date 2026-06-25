# Code Composition — HyperIdle

LOC of every git-tracked file, classified and grouped. *Generated* = lockfiles, migration SQL, drizzle meta, `.snap` snapshots (separated so they don't inflate the real picture). `cfg` = json/yaml/css/html/sh/sql config.

## By group

| group | prod | test | docs | cfg | generated | TOTAL | test% |
|---|--:|--:|--:|--:|--:|--:|--:|
| pkg:server | 32,952 | 101,108 | 0 | 61 | 0 | 134,121 | 75% |
| pkg:web | 36,273 | 78,520 | 0 | 1,752 | 0 | 116,545 | 68% |
| pkg:db | 2,866 | 7,395 | 134 | 13,680 | 55,128 | 79,203 | 72% |
| pkg:design-system | 12,538 | 16,692 | 4,457 | 1,373 | 9,671 | 44,731 | 57% |
| pkg:fabric | 15,482 | 9,338 | 0 | 31 | 0 | 24,851 | 38% |
| (root/misc) | 1,142 | 96 | 760 | 1,848 | 17,443 | 21,289 | 8% |
| pkg:shared | 8,347 | 9,902 | 0 | 33 | 0 | 18,282 | 54% |
| docs/ | 40 | 0 | 18,165 | 49 | 0 | 18,254 | 0% |
| pkg:eval | 14,368 | 896 | 0 | 39 | 0 | 15,303 | 6% |
| plans/ | 35 | 0 | 11,451 | 267 | 0 | 11,753 | 0% |
| .pipeline/ | 0 | 0 | 6,925 | 3,004 | 0 | 9,929 | 0% |
| pkg:eslint-plugin-design | 3,269 | 2,669 | 616 | 37 | 0 | 6,591 | 45% |
| pkg:desktop | 2,444 | 2,972 | 0 | 350 | 0 | 5,766 | 55% |
| .claude/ | 146 | 0 | 5,043 | 297 | 0 | 5,486 | 0% |
| scripts/ | 5,071 | 0 | 0 | 49 | 0 | 5,120 | 0% |
| pkg:pipeline | 1,968 | 977 | 0 | 46 | 0 | 2,991 | 33% |
| pkg:eslint-plugin-authz | 578 | 326 | 0 | 33 | 0 | 937 | 36% |
| pkg:strategy-minimal | 213 | 506 | 59 | 25 | 0 | 803 | 70% |
| pkg:api-contract | 126 | 533 | 0 | 20 | 0 | 679 | 81% |
| **TOTAL** | **137,858** | **231,930** | **47,610** | **22,994** | **82,242** | **522,634** | |

## Overall

| category | LOC | share |
|---|--:|--:|
| test | 231,930 | 44.4% |
| prod | 137,858 | 26.4% |
| generated | 82,242 | 15.7% |
| docs | 47,610 | 9.1% |
| cfg | 22,994 | 4.4% |

**Hand-written prod:test ratio = 1 : 1.68.**

## Observations

- **Tests are the largest body of code by far** — 1.68 lines of test per line of production. Server is the extreme (1 : 3.07), then api-contract (1 : 4.2 on a tiny base) and db. The TDD-first mandate is clearly being followed; whether server's 101k test LOC is *proportionate* coverage or test bloat is worth a separate look.
- **`fabric` is the most test-light core package** (38%) — notable given it holds the relevance/attention scoring engines flagged in the overengineering audit (Themes B). Low test ratio + high heuristic complexity is the riskiest combination in the codebase.
- **`eval` is 14.4k prod LOC at 6% test** — expected (it *is* the test/eval harness; it isn't unit-tested itself), but it's also where the biggest single dead-code finding lives (22 judge factories, A1).
- **`db` generated = 55k LOC** of migration SQL + drizzle meta — dwarfs its 2.9k of hand-written schema/connection code. Normal for Drizzle, but it means "db is huge" is misleading; the real surface is small.
- **Docs are substantial — 47.6k LOC** across `docs/` (18k), `plans/` (11.5k), `.pipeline/` (7k), `.claude/` (5k), and design-system (4.5k). The overengineering audit's Theme F (docs outrunning code) is consistent with this: a lot of prose to keep in sync with a smaller, faster-moving codebase.
- **`web` and `server` are ~90% of hand-written prod code** (69k of 138k). That's where complexity-reduction effort pays off most.

*Method: `git ls-files` → per-file line count → classify by path/extension. Excludes untracked and gitignored files.*

---

## Subgroups of the big packages (>10k LOC)

### `server` (134k) — prod ~33k, the rest is tests
| sub | prod | test |
|---|--:|--:|
| `__tests__` | 0 | 56,670 |
| `routes` | 13,235 | 22,621 |
| `harness` | 6,557 | 13,006 |
| `services` | 7,256 | 1,653 |
| `tools` | 2,987 | 5,559 |
| middleware / schemas / auth / mcp | ~1,768 | ~1,499 |

### `web` (116k) — UI code is `pages` + `components`/`shell`/`hooks`/`settings`
| sub | prod | test |
|---|--:|--:|
| `__tests__` | 0 | 29,739 |
| `pages` | 17,021 | 9,225 |
| `e2e` (+cassettes) | 207 | 23,655 (+1,559 cfg) |
| `settings` | 3,516 | 5,721 |
| `components` | 5,025 | 3,231 |
| `shell` | 3,113 | 3,066 |
| `hooks` | 3,294 | 2,571 |

### `db` (79k) — 84% is generated Drizzle journal
| sub | hand-written | generated |
|---|--:|--:|
| `drizzle/meta` (active, Postgres) | 0 | 53,892 |
| **`drizzle-sqlite-archive/`** (dead, pre-PGLite) | 0 | 13,642 |
| `src/*` (schema, connection, seed) | 2,762 | 0 |
| `__tests__` | 6,985 (test) | 0 |

> The `drizzle-sqlite-archive/` 13.6k is **dead cruft** from the SQLite→PGLite migration (#139) — see audit finding **A5**. Real hand-written db code is ~2.8k.

### `design-system` (44.7k) — mostly machinery, not components
| sub | prod | test | generated/other |
|---|--:|--:|--:|
| `__tests__` (snapshot net) | 0 | 8,200 | 9,671 (`.snap`) |
| `src/*` stories + components | 7,443 | 5,261 | 686 |
| `viewer/annotations` (design-review overlay) | 1,566 | 2,010 | 0 |
| `research/` (md) | 0 | 0 | 3,422 |
| `viewer/` + scripts + kinds + body-editor + block | ~3,529 | ~1,221 | ~1,722 |

> Real component source ≈ 7.4k. The bulk is the visual-regression snapshot machinery + the `/human-design-review` annotation tool.

### `fabric` (24.9k) — only ~39% is actually "knowledge fabric"
By directory:
| sub | prod | test |
|---|--:|--:|
| `services` (incl. nested `notifications/`) | 10,277 | 510 |
| `__tests__` | 0 | 8,813 |
| `src/*` (scoring/relevance/attention engines) | 5,205 | 0 |

By **function** (the more revealing cut — see audit Part 5):
| group | prod | share |
|---|--:|--:|
| Knowledge-fabric proper (context assembly 995, knowledge store 1,176, scoring 1,622, promotion 946, strategy+glue 1,311) | 6,050 | 39% |
| Background services not related to knowledge (lifecycle-propagation, builtin-routines, practice-meeting, routine-scheduler, cost-cap, git-export×3, task-dispatcher, …) | 7,103 | 46% |
| Notifications subsystem (`services/notifications/`: dispatcher 893, config 556, adapters, mute, digest) | 2,329 | 15% |

> `fabric` is large because it absorbed every in-process background job — not because the knowledge engine is bloated. The headline context-assembly logic is <1k LOC.

### `shared` (18.3k)
| sub | prod | test |
|---|--:|--:|
| `__tests__` | 0 | 9,535 |
| `src/*` root | 5,224 | 0 |
| `harness` | 871 | 357 |
| `blocks` | 1,034 | 0 |
| kinds / format / types / net / observability | ~1,218 | 0 |

### `eval` (15.3k) — 70% is scenario data
| sub | prod |
|---|--:|
| `scenarios` | 10,796 |
| `src/*` (runner, judges, scoring, cli) | 3,137 |
| `smoke` | 435 (+886 test) |

> `src/judges.ts` (~550 LOC of the 3.1k) is the dead-22-factories finding (A1).

---

## DB schema — 29 tables, 411 fields (avg 14.2/table)

| domain | tables (fields) | Σ fields |
|---|---|--:|
| **Work / process** | routines (47), bets (45), tasks (25), sessions (22), routine_runs (13) | 152 |
| **Identity / org** | users (38), team_members (14), teams (13), user_skills (7), invite_codes (7), login_sessions (6), org_edges (5), hint_progress (3) | 93 |
| **Knowledge** | items (16), knowledge_items (13), knowledge_conflicts (12), knowledge_strategy_fabric (11), knowledge_edit_log (9), knowledge_access_log (5), task_strategy_fabric (4) | 70 |
| **Notifications** | notification_queue (25) | 25 |
| **Conversation** | threads (13), messages (13) | 26 |
| **Infra / config** | service_connections (13), propagation_log (12), artifacts (7), server_credentials (7), factory_settings (3), server_config (3) | 45 |

Notes:
- **Fattest tables: routines (47), bets (45), users (38)** — overlap with the cost-column sprawl (audit finding #30). Best targets for a schema-slimming pass.
- `items` (human-interface contract) is a separate table from `knowledge_items`.
- The kernel/strategy split shows up as the `*_strategy_fabric` extension tables (audit finding #39).
- Scoring "knobs" are **rows** in `factory_settings` (3 cols), not columns — so the tunable-weights findings don't bloat the schema.
