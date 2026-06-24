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
