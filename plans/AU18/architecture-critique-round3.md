## Architecture Critique: AU18 (round 3, FINAL)

ARCHITECTURE-SCORE: 8/10  rounds=3  score-line: SA:8 LI:8 AC:8 DM:7 N:8 MD:8 FMC:7 S:7 V:8

The one blocking CRITICAL from round 2 (locked template-read design regressed a live web path) is genuinely closed, re-verified against code — not the plan's narrative. The round-3 edit introduces no new defect: the moved `readSystemPromptTemplate` is a local, non-exported function whose only caller is bootstrap itself, so the move breaks nothing; naming, barrel, and layer rules all hold. Clears the ship line.

### Round-2 CRITICAL resolution status
- **[§3 template row / §10 Q2, AC-5 — locked docs-read design broke a live web path]: RESOLVED.** Re-verified every claim from source:
  - `factory-bootstrap.ts:188-197` is an explicit `Array<{role, filename}>` of **exactly 7** entries: `product_manager`→`product-manager.md`, `facilitator`→`facilitator.md`, `builder`→`builder.md`, `growth`→`growth.md`, `designer`→`designer.md`, `qa_engineer`→`qa-engineer.md`, `ops`→`ops.md`. The two underscore roles map to hyphenated files — exactly the mismatch that killed the round-2 `${role}.md` stem + `^[a-z][a-z-]*$` regex. The round-3 map-as-allowlist design consumes this same array, so PM/QA resolve to their real files (200 preserved) and the traversal sink is closed by construction (untrusted `:role` only ever indexes a compile-time literal map; the filename reaching `fs` is never derived from input, so no regex and no post-`resolve` containment check are load-bearing).
  - `docs/system-prompts/` on disk contains all 7 hyphenated files + `assistant.md` + `index.md`. `assistant.md` exists but bootstrap never seeds `system_template:assistant`; catalog `agent-roles.ts:190` sets `hasTemplate:true` (@lore AD8b). So `/templates/assistant` is 404 today, and excluding `assistant` from `SYSTEM_PROMPT_TEMPLATE_FILES` preserves that 404 exactly. Verified, not asserted.
  - `factory-roster.ts:templateRole` is literally `"facilitator"` for every entry (lines 97/103/109/115/121). The round-2 plan's claim that this field enumerates the canonical role set was false; round 3 retracts it and names the bootstrap array as the true source. Correct.
  - Name/signature collision reconciled: `readSystemPromptTemplate(docsRoot, filename)` is a **local (non-exported)** function at `factory-bootstrap.ts:31`; its only caller is bootstrap itself (`:202`) — no test or cross-package importer (grep-confirmed). Moving it verbatim into `packages/db/src/system-prompt-templates.ts` and adding a distinctly-named `readSystemPromptTemplateForRole(role)` is a safe, non-duplicating refactor. §7 states one home, one implementation.
  - §9 now carries positive red-phase cases for real seeded roles including the underscore role `product_manager`→`product-manager.md` content, `qa_engineer`→`qa-engineer.md`, and `builder` (same-stem sanity), alongside the preserved-404 (`assistant`, unknown) and negative traversal cases. This set would have caught the round-2 regression; round 2's negatives-only set would not. Addressed.

### CRITICAL (new or still-open, if any)
- None.

### WARNING
- None blocking. (The round-2 WARNINGs — name-based shape-guard boundary note §6.5; positive template test cases §9 — are both folded and verified present.)

### SUGGESTION
- **[§4.1, non-blocking]** `seedAgent` **already exposes** an optional `costActualMinor` opt (`packages/eval/src/seeding.ts:155/:172`, defaulting to `null`). §4.1 frames "extend `seedAgent`'s opts … or issue a direct `db.update`" as future work — in reality the opt exists, so the eval rewrite is a one-line arg per scenario. Builder should prefer passing `costActualMinor` over an ad-hoc `db.update`. Minor; the plan's caveat about confirming a single costed user per scenario still applies.
- **[§7, non-blocking]** Two `stripFrontmatter` implementations exist repo-wide: the db-local one at `factory-bootstrap.ts:21` (which round 3 moves into the new module) and an unrelated **exported** one at `packages/server/src/services/context-assembly-prompt.ts:76`. Round 3 does not consolidate them — correctly out of scope (different packages, different concerns). Flag only so the builder does not accidentally create a third.

### What's Working Well
- The map-as-allowlist is the *right* fix, not just a patch: it simultaneously closes the traversal sink (by construction, no regex) and repairs the 404 regression (real hyphenated filenames), and it removes the dead round-2 charset regex + resolve-containment machinery. Simpler and more correct than the design it supersedes.
- Every round-3 claim is grounded in a specific verifiable code location, and each one holds under independent reading — the exact 7-entry map, the `assistant` catalog/seed asymmetry, the `templateRole` mis-citation retraction, the non-exported single-caller status of the moved helper, the barrel export lines (`index.ts:42/46/77`), and the `sumAllUserCost` coalesce-over-all-users semantics (`user-store.ts:207`).
- Layer integrity holds: docs-resolution lives in `packages/db`, consumed by `packages/server` (`roster.ts`, `agents.ts`) via the `@hyperidle/db` barrel — a clean downward dependency, and the new module is a normal module re-exported through `index.ts` (not a forbidden barrel). `SYSTEM_PROMPT_TEMPLATE_FILES` is SCREAMING_SNAKE_CASE per convention; `readSystemPromptTemplateForRole` has an explicit `string | null` return type. All naming/typescript rules satisfied.
- The three small folds are all present and accurate: §6.5 heuristic-boundary doc-comment note (line 258), §4.1 exact `users.costActual` row + sum-over-all-users caveat (line 214, verified against `seedFounder`/`seedAgent`/`sumAllUserCost`), and §7's now-singular helper home ("the single home … no 'or'", line 289).
- Round-1 and round-2 closures (eval barrel-drop scope, cost-scenario re-grade, AC-6b shape-guard as option (a)) remain intact and untouched by the round-3 edit.

### VERDICT
SHIP (score 8 >= 7)
