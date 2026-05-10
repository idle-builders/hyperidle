# M1 Architecture Critique

**Verdict: ADVANCE**

---

## Scores

| Dimension | Score | Justification |
|---|---|---|
| 1. Spec-alignment | 8 | Every M1 AC is addressed with a named file and test. One overclaim in the validation table ("Lint rules produce warnings for every existing offender") -- bare `FOUNDER_ID` sites are only caught by the script, not lint. The AC itself separates these correctly (lint rules + script together cover all offenders). |
| 2. Concept fidelity | 8 | All seven hard rules honored. The meta-test grep approach for non-bypassable disable (hard rule 5) is sound for warn-level and becomes double-enforced at error-level in M4. Path-only verification (hard rule 6) strictly observed -- no content inspection in lint rules. Inventory is machine-generated (hard rule 6 of the policy doc). |
| 3. Completeness | 7 | All file changes enumerated in dependency order. Script types defined. Missing: no explicit handling of the `KnowledgeList.tsx` runtime imports of `MOCK_KNOWLEDGE_ITEMS` and `MOCK_CURATION_SUGGESTIONS` from `fixtures/knowledge-data.ts` in the test cases (these are caught by the import rule, but the test plan does not cite them as positive cases). |
| 4. Coherence | 8 | Policy module as single source of truth is clean. Rule pair + script + CI check form a closed feedback loop. The literal-id being script-only while prefix detection is lint-only is well-reasoned and avoids ESLint performance concerns. |
| 5. Simplicity | 7 | The `DEFAULT_*` disambiguation is the most complex element and carries known false-positive risk. The path-filter approach is pragmatic but the `/services/` fragment is too broad (catches `git-export-runner.ts`, `upgrade-token-store.ts` config constants). The plan acknowledges this only generically in Risk 2 without naming the specific existing false-positives. |
| 6. Testability | 8 | Every file has a corresponding test file. Test patterns use the Linter API (matching existing `fixtures.test.ts` convention). The meta-test is correctly specified as a grep-based Vitest. The `--check` integration test is well-defined. |
| 7. Evolvability | 8 | The policy module makes M2/M4 changes single-edit affairs. The closed prefix set and glob set are `readonly` arrays. The triage hint is explicitly documented as non-authoritative (M2 overrides). Script-only literal-id is easy to extend. |
| 8. Risk-awareness | 7 | Five risks named with mitigations. Three are concrete (force-add persistence, import resolution aliases, seed file scope). Two are generic-leaning (DEFAULT false-positives names the category but not the specific existing symbols that will false-positive today; importerCount accuracy). |
| 9. Build-readiness | 8 | Dependency-ordered phases (A-G). File paths are exact. Code blocks show the shape. Task list is implicit in the file numbering. Builder can execute without further design questions for the core path. |

**Average: 7.7** (all dimensions >= 7, threshold met)

---

## Critical issues

None. No dimension scored below 5.

---

## Important suggestions (scores 5-6 range; should address before build)

1. **`DEFAULT_*` false-positives on existing server config constants.** The path fragment `/services/` will flag `DEFAULT_LOCAL_MS` and `DEFAULT_PUSH_MS` in `packages/server/src/services/git-export-runner.ts`. The path fragment `/routes/` will flag `DEFAULT_LIMIT` in `packages/server/src/routes/artifacts.ts`. These are numeric timeout/limit constants -- unambiguously NOT mock data. At warn-level this is noise, not breakage, but it pollutes the signal for real offenders. The builder should either (a) narrow `DEFAULT_PREFIX_DATA_PATHS` for the server package to only `/routes/threads.ts` and `/routes/coach.ts` (the actual offenders), or (b) add a "value is numeric literal" exemption (a constant assigned `= 50` or `= 5_000` is clearly config, not mock data). The plan's own concept rejection list item 2 says algorithm/config constants are NOT mock data -- the heuristic should honor that.

2. **The validation table overclaims lint coverage.** Row "Lint rules produce warnings for every existing offender" is false. `FOUNDER_ID = "u-founder"` in `WorkBet.tsx:613` and `HostThreadSection.tsx:67` has no forbidden prefix -- it is caught ONLY by the inventory script's literal-id detection, not by lint. The builder should correct the validation table to say "Lint rules + script together cover every existing offender" and ensure the test plan has an explicit case proving the script catches unprefixed `FOUNDER_ID` declarations via the `"u-founder"` literal-id.

3. **`DEFAULT_SUFFIX_TRIGGERS` includes `_ID` -- too broad.** The suffix `_ID` will flag `DEFAULT_FOUNDER_ID` (correct) but also any future `DEFAULT_SESSION_ID`, `DEFAULT_REQUEST_ID`, etc. that might be legitimate config. The concept's known offender is specifically `DEFAULT_FOUNDER_ID`. Consider narrowing to `_FOUNDER_ID` or verifying the breadth is acceptable given warn-level semantics. This is acceptable for M1 (warn-only) but note for M4 promotion audit.

---

## Nits (scores 7-8; optional)

1. **Decision 7 (per-line disable) reasoning wanders.** The plan shows three abandoned approaches before settling on the grep-based meta-test. This is intellectually honest but creates confusion for the builder about what to implement. The builder only needs the "Simplest correct approach" paragraph -- the prior attempts should be collapsed into a brief "rejected alternatives" note.

2. **Test File 13 initially passes (no disable comments exist).** The plan correctly notes this. A pure-green test on day one is not a strong proof. Consider adding a fixture file with a deliberate bare disable that the test asserts it catches (positive case), alongside the codebase grep (negative case: no bare disables in real source).

3. **`importerCount` grep will match partial names.** Grepping for `FOUNDER_ID` will also match `DEFAULT_FOUNDER_ID` and `DEMO_FOUNDER_ID`. The plan's Risk 5 acknowledges this ("may over-count"). Acceptable at M1 -- the count is a hint, not load-bearing.

4. **The `FORBIDDEN_PREFIXES` list includes `FALLBACK_` unconditionally.** The concept says `FALLBACK_*` is forbidden "when the shape mirrors a real source" and allowed "when the value is a true empty/null shape." The plan does not provide a mechanism to distinguish these cases -- it flags all `FALLBACK_*`. At warn-level this is acceptable (the only existing `FALLBACK_AVATAR` in `hooks/useConversationsThreads.ts` is in a hooks file, which is not in `DEFAULT_PREFIX_DATA_PATHS` -- so the path exemption does not apply, BUT `FALLBACK_` is in the unconditional `FORBIDDEN_PREFIXES` so it WILL fire). The inventory labels it `borderline`. This matches the concept's instruction that `FALLBACK_*` is in the prefix set. Acceptable -- M2 triages.

5. **`packages/web/src/fixtures/knowledge-data.ts` is imported by `KnowledgeList.tsx` at runtime** (per the grep output). The plan's `no-mock-data-import` rule will catch this (import from `/fixtures/`). Worth adding as an explicit positive test case in File 11 alongside the `app-shell-data` case to prove the rule catches both fixture directory patterns (`fixtures/` without double-underscore).

---

## AC coverage matrix

| M1 AC (from TRACK-M.md) | Satisfied by | Proven by |
|---|---|---|
| `design/no-mock-data-import` rule in `packages/eslint-plugin-design/src/rules/` | File 2 (`no-mock-data-import.ts`) | File 11 (`no-mock-data-import.test.ts`) |
| `design/no-mock-data-symbol` rule alongside | File 3 (`no-mock-data-symbol.ts`) | File 12 (`no-mock-data-symbol.test.ts`) |
| `scripts/mock-inventory.ts` walks packages, emits `inventory.json`/`inventory.md`/`queue.md` | File 6 (`scripts/mock-inventory.ts`) | File 14 (`scripts/__tests__/mock-inventory.test.ts`) + manual run |
| Script detects literal-id strings as `kind: "literal-id"` | File 6 (literal-id regex using `LITERAL_ID_STRINGS`) | File 14 (explicit literal-id test case) |
| Both rules + script emit actionable messages (file, symbol, policy URL, where-legal) | Files 2, 3, 6 | Files 11, 12, 14 (message content assertions) |
| Per-line eslint-disable requires tracking issue id | File 13 (meta-test grep) | File 13 (asserts zero bare disables) |
| Both rules wired at `warn` for web + server, permitted-surface `ignores` | File 5 (`eslint.config.js` new block) | `bun run lint:eslint` exits 0 with warnings |
| CI step regenerates and fails on drift | Files 8, 9 (verify.ts + package.json) | File 14 (`--check` mode integration test) |
| Vitest tests: positive/negative/allowlist/disable | Files 11, 12, 13, 14 | `bun run test` green |
| `bun run check` + `bun run lint` + `bun run test` green | All files type-safe, lint-clean, tests pass | `bun run verify` exit 0 |
| Lint rules produce warnings for existing offenders | Files 2, 3, 5 (plus File 6 for non-prefixed offenders) | `bun run lint:eslint` output + inventory.json non-empty |
| `inventory.json` is non-empty | File 6 | File 14 integration test + manual verification |

---

## Specific feedback on the 8 architectural decisions

### Decision 1: Single source of truth (shared policy module)

Sound. The module location (`packages/eslint-plugin-design/src/mock-data-policy.ts`) is correct -- colocation with the enforcement logic avoids a dependency cycle. The exact exports are named (`FORBIDDEN_PREFIXES`, `PERMITTED_MOCK_SURFACE_GLOBS`, `LITERAL_ID_STRINGS`, `DEFAULT_PREFIX_ALLOWLIST`, `POLICY_DOC_URL`). The plan also adds `DEFAULT_PREFIX_DATA_PATHS`, `DEFAULT_SUFFIX_TRIGGERS`, `PERMITTED_SURFACE_PATH_FRAGMENTS`, `PERMITTED_SURFACE_SUFFIXES`, `FORBIDDEN_IMPORT_FRAGMENTS` -- all named and typed. The script imports via workspace resolution. No hand-waving detected.

### Decision 2: DEFAULT_* disambiguation (path filter + suffix triggers)

The heuristic is pragmatic but carries the false-positive burden described in Important Suggestion 1. The path fragments `/services/` and `/routes/` are too broad for the server package (they catch `DEFAULT_LIMIT`, `DEFAULT_LOCAL_MS`, `DEFAULT_PUSH_MS`). For the web package, the fragments are fine -- `AppShell.tsx` is in `/layouts/` and the fixtures are in `/fixtures/`. The suffix triggers (`_DATA`, `_SETTINGS`, `_ID`) correctly catch the known offenders (`DEFAULT_SETTINGS`, `DEFAULT_FOUNDER_ID`). The `_ID` suffix is the broadest risk factor. Overall the design is correct for M1's warn-level purpose; the false-positive count on `main` today is 3 symbols (all clearly config), which is manageable noise.

### Decision 3: Literal-id detector (script-only)

Correct choice. ESLint visiting every Literal node would be hostile to performance and confusing in error output. The script's regex-based search for quoted strings is fast, simple, and correctly scoped to the same walk as the rest of the inventory. The boundary semantics are clear: the regex searches for `"u-founder"` or `'u-founder'` -- this is specific enough that false positives on prose/comments are unlikely (the strings are identifier-shaped, not natural-language). The plan does NOT explicitly state whether it searches inside comments or only in code -- the builder should clarify (a naive line-by-line regex will match comments too). Given the strings are highly specific (`u-founder`, `agent-unassigned`, `founder@hyperidle.com`), false matches in comments are theoretically possible but practically improbable. Acceptable.

### Decision 4: Triage hint heuristic

Well-specified. The three buckets (`straight-swap`, `needs-contract`, `borderline`) match the M2/M3 consumption pattern. The heuristic is simple string matching on symbol names -- no import-graph analysis, no AST. The default-to-borderline fallback is correct (conservative). The plan explicitly states this is non-authoritative and M2 overrides. No issues.

### Decision 5: Inventory gitignore (git add -f)

Correct. The established pattern (`plans/L*/` files are force-tracked) is cited. The plan correctly identifies that `.gitignore` negation patterns are fragile (ordering-dependent). The one risk (re-creation after deletion requires `git add -f` again) is mitigated by the `--check` mode catching missing files. Robust.

### Decision 6: CI drift check

The claim of <500ms is validated: 160 runtime files, ~30K lines total. Bun's sync file reads at that scale are well under 500ms. The `--check` semantics are specified (regenerate in memory, compare JSON, exit 1 on divergence, diff to stderr). Placement after `lint:eslint` and before `test` in the verify tools list is appropriate -- it depends on the same source but is independent of lint results. The exclusion from `--quick` is correct. The `package.json` aliases are clean. One note: the plan says "placed AFTER lint:eslint in the verify tool list" but `scripts/verify.ts` runs tools sequentially (line 226: `for (const tool of tools)`), so ordering matters for failure reporting but not for execution independence. The plan's placement is fine.

### Decision 7: Per-line disable enforcement (meta-test grep)

The final approach (grep-based Vitest) is correct and zero-dependency. The reasoning journey is overly verbose (four abandoned approaches before landing on the grep) -- this is honest design thinking but creates noise for the builder. The regex pair (`DISABLE_RE`, `TRACKED_RE`) is well-specified. The test walks the same directories as the lint rules. The key insight -- that at warn-level developers cannot meaningfully "disable" a warning that does not block CI -- is correct, making the meta-test a forward-looking contract for M4 promotion. The one weakness: on day one the test passes vacuously (no disable comments exist). This is acceptable but the builder should add a fixture-based positive case.

### Decision 8: Wired at warn only

Correct. The config block shape is fully specified (files, ignores, parser, plugins, rules). The interaction with the L16 `no-restricted-imports` block is explicitly addressed -- they coexist because they target different specificity levels (L16 catches `__fixtures__/` at error with a specific message; the new rule catches broader `fixtures/` at warn with the general policy message). The ignores list is comprehensive and matches the concept's permitted-mock surface. The one omission: `packages/server/src/**/seed*.ts` is in the ignores but the plan notes this is moot because `seed.ts` lives in `packages/db/src/` (outside the rule's file scope). Correct analysis.

---

## Summary

The plan is thorough, correctly structured, and addresses every M1 acceptance criterion with named files and tests. The single-source-of-truth policy module is well-designed. The literal-id detection being script-only is the right tradeoff. The main weakness is the `DEFAULT_*` path-filter heuristic producing 3 known false-positives on existing server config constants -- manageable at warn-level but worth narrowing before build. The wandering reasoning in Decision 7 should be compressed for builder clarity. Overall the plan advances.
