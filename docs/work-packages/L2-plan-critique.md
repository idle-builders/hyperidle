# Architecture Critique: L2 Block primitive

**Score: 8.7/10** (78/90)

| Dimension | Score |
|---|---|
| Spec Alignment | 9 |
| Layer Integrity | 9 |
| API Contracts | 9 |
| Data Model Alignment | 8 |
| Naming | 9 |
| Module Depth | 8 |
| Failure-Mode Coverage | 9 |
| Simplicity / Over-Engineering | 8 |
| Verifiability | 9 |
| **Total** | **78 / 90** |

## CRITICAL

*(none — adversary findings already addressed in revised plan §18)*

## WARNING

- **[plan §9 + T20]** `body_blocks_derived` event has no L2 consumer. Plan acknowledges "future-proofing." Per CLAUDE.md "Don't design for hypothetical future requirements." → **Fix:** defer event emission until a consumer exists. T20 becomes "fabric calls `deriveMarkdownBlocks` after body ingest (no event emission yet)." If derivation needs to happen at ingest time for some other reason, document why. If not, drop T20 entirely — derivation is on-read.
- **[plan §4.3]** Migration lacks explicit rollback note. → **Fix:** add one line under the SQL block: `Rollback: ALTER TABLE messages DROP COLUMN anchor; DROP INDEX messages_anchor_block_id_idx; (Postgres only — index didn't exist on SQLite).` Forward-only migrations still need a documented rollback path per the codebase's L1 precedent.

## SUGGESTION

- **[plan §4.1 — `MarkdownBlockBase.span`]** Span byte-offsets are exposed on the wire but no L2 consumer reads them. → **Fix:** drop `span` from the wire type and keep it internal-only to derivation, OR document a real consumer.
- **[plan §6-A]** "Code blocks include `language` as part of kind-key" detail is buried. → **Fix:** lift it into the formula spec: `kindKey(block) = block.kind === 'code' ? \`code:${block.language || 'plain'}\` : block.kind`.
- **[plan §13]** "Bun-runtime ESM compatibility with `unified` is ⚠️ UNVERIFIED" — non-trivial gamble. → **Fix:** during T1, run a 5-minute spike to confirm. If broken, fall back to alternative now, not at T8.
- **[plan §13]** Verify CI has Playwright Chromium for visual goldens; document install step in T17 if not.

## What's Working Well

- **Adversary findings comprehensively addressed.** §18 revision log traces every CRITICAL + MAJOR fix to plan-section deltas. Coverage matrix §17 — no orphan ACs. The C3 re-scope (production pages move to L16/L23) is disciplined boundary-management.
- **Design-it-twice §6 is real, not theatre.** Three decisions with concrete alternatives + explicit rejection reasons; the broken occurrence-index option preserved as a documented pitfall for future architects.

## Verdict

**APPROVE — ready for `/write-tests`.** Score 8.7. WARNINGs are non-blocking (deferrable to implementation); SUGGESTIONs are polish.
