# Concept verification -- M4

**Workpackage:** M4 -- Final sweep + lint promotion to error.
**Locked concept:** `plans/mock-data-purge/concept.md` (locked 2026-05-10, Track M root).
**Verification date:** 2026-05-12.

---

## Verification

The locked concept covers M4's needs. M4 is the final step in the track shape (Phase 0, item 4): "Re-run the inventory (zero rows), promote warn to error, add the e2e regression suite, ship." The concept's definitions of mock data, permitted-mock surface, mock-data guard, and all seven hard rules apply to M4 without modification.

**Concept elements M4 depends on:**

| Element | Concept section | Status |
|---|---|---|
| Mock data definition (identity, properties, lifecycle) | Phase 1 | Covered. M4 uses the definition to classify remaining rows. |
| Permitted-mock surface (closed glob set) | Phase 1, Phase 4 rule 6 | Covered. M4 inherits the exact set; no expansion needed. |
| Mock-data guard lifecycle: "Land at warn, clear baseline, promote to error" | Phase 1, item 3 | Covered. M4 is the "promote to error" step. |
| Forbidden prefix set | Phase 1, item 3 | Covered. No new prefixes needed. |
| Per-line disable requires tracking issue id | Phase 4, rule 5 | Covered. M4 does not relax this -- promotion to error only changes severity. |
| Fallback removal rule ("removing a mock removes its fallback path") | Phase 4, rule 3 | Covered. M4 verifies this was done correctly in M3. |
| Ground-truth output list (Phase 5) | Phase 5 | Covered. M4 produces `test-coverage-gap.md` and `follow-ups.md` as listed. |

**Gaps: none.** The concept anticipated M4's deliverables precisely. The concept is locked and no update is needed.

---

## Current inventory analysis (16 rows, pre-M4)

The M1 inventory script currently produces 16 rows. M4 must drive this to zero (or classify every remaining row as `tracked-out` with a follow-up entry). The rows fall into three groups:

### Group A -- False-positive literal-id hits in comments (9 rows)

The inventory script detects quoted `"u-founder"` and `"agent-unassigned"` in comments, lore annotations, and doc strings. These are not runtime code -- they are prose descriptions of what was removed. The scanner uses regex line-by-line matching and cannot distinguish comments from code.

- `packages/server/src/middleware/auth.ts` lines 27, 59, 97: comment/lore text mentioning `"u-founder"` as a fallback description.
- `packages/server/src/routes/bets.ts` line 364: comment `// M3 A5: actor comes from auth context (c.get("userId")), not hardcoded "u-founder".`
- `packages/web/src/services/host-threads.ts` line 28: lore comment referencing `"agent-unassigned"`.
- `packages/web/src/services/task-threads.ts` line 15: lore comment referencing `"agent-unassigned"`.

**Note:** 3 of the `"u-founder"` rows (auth.ts:89, auth.ts:50, lifecycle-propagation.ts:409) are actual fallback code (`?? "u-founder"` for unseeded DBs), not comments. These are genuine runtime hits.

### Group B -- Server fallback code (3 rows from Group A that are real)

- `auth.ts:89`: `c.set("userId", founderRow?.value ?? "u-founder")` -- factory fallback.
- `auth.ts:50` (route): `const userId = c.get("userId") ?? "u-founder"` -- route fallback.
- `lifecycle-propagation.ts:409`: `const founderId = founderRow?.value ?? "u-founder"` -- propagation fallback.

These are backward-compat fallbacks for unseeded DBs. They satisfy M3's contract (auth context reads from factorySettings), but the literal `"u-founder"` still appears as a fallback value. M4 must decide: tracked-out (acceptable for unseeded dev DBs) or replaced with a fail-loud path.

### Group C -- Knowledge page mock data (7 rows, already tracked-out)

All 7 rows are the knowledge page fixtures already tracked-out in `contracts.md`: MOCK_KNOWLEDGE_ITEMS, MOCK_CURATION_SUGGESTIONS, 2 fixture imports, LEGACY_DETAILS, LEGACY_SOURCES, FALLBACK_DETAIL. These require full knowledge-page API wiring -- a separate workpackage. M4 writes them into `follow-ups.md` with concrete tracking.

---

## Implications for architecture

1. The inventory script needs a mechanism to exclude comment/lore-only mentions from the literal-id scan (or M4 must rewrite those comments to not quote the literal). The architecture plan should specify which approach.
2. The 3 real `"u-founder"` fallbacks need a decision: keep (tracked-out with follow-up) or replace with a fail-loud path. The concept's hard rule 3 says "removing a mock removes its fallback path" -- but these fallbacks protect unseeded dev DBs, not runtime users. They are DB-seed bootstrapping fallbacks, not data-standing-in.
3. The 7 knowledge rows are already tracked-out; M4 writes the follow-up entry and moves on.
4. After resolving groups A-C, the inventory should hit zero forbidden rows.
