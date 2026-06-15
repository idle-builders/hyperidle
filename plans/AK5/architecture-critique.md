# AK5 — Reviewer critique (Phase 2)

Reviewer evaluated the designer's output cold against the 9-dimension rubrics, then verified every load-bearing claim against real code in the worktree. Two artifacts scored: design (`design/approved.md`) and architecture (`architecture.md`). Concept (`concept.md`) read as context.

**Code-verification performed (claims checked against source, not taken on faith):**
- `createBetSchema` shape + `.strict()` + POST handler structure + revisionLog seed + `...created` 201 spread — `packages/server/src/routes/bets.ts:48,565+` ✓ matches plan.
- `betDetailResponseSchema` has no `sourceKnowledge` today; GET `/bets/:id` builds an explicit object via `deriveTitle(bet.description, bet.id)` (`bets.ts:495,533`) — plan's "route enriches" approach is correct ✓.
- POST `/bets` has **no** registered response schema in `response-validator.ts` — so the 201 extra field is not validator-gated (plan's task-2 "check the response validator" is benign over-caution, not a real risk).
- `bets` table + `decompositionStatus`/`decompositionBlockerReason` columns + indexes — `packages/db/src/schema.ts:121-189` ✓.
- `knowledge_items.body` is `notNull` (`schema.ts:579`) — promotion body always present ✓.
- `knowledge_edit_log` uses `onDelete:"restrict"` with the exact "must outlive its subject / HIGH-2" rationale the plan cites (`schema.ts:~600`) — analogy is real ✓.
- Knowledge has **no hard-delete endpoint** — only soft-delete via `POST /:id/archive` → `status:"archived"` (`knowledge.ts:880`). RESTRICT is inert against the only deletion users have. ✓ (decisive for the RESTRICT question below).
- `KnowledgeDetail.tsx`: `KnowledgeOverflowMenu`, `MenuItem`, `change-scope`, `handleArchive`, `archiveError`, `savedContent`, `effectiveKnowledgeId`, `item.content` all exist (`KnowledgeDetail.tsx:351,366,375,455,463,474,583`) ✓.
- `WorkBetCreate.tsx`: `useTeams()`, `singleTeam ? teams[0].id : teamId` (line 48), team `Select`, `handleCreate` payload — all real (`WorkBetCreate.tsx:30,37,48,55`) ✓ — multi-team fallback reuses an existing surface, not a new one.
- `WorkBet.tsx`: imports `RRLink` (line 56), has a `header` block (line 837) ✓.
- Reverse link confirmed real: `WorkBet.tsx:1052` "Add knowledge" opens `KnowledgeCreateDialog` locked to bet scope (`scopeKind="bet"`). Distinct from AK5's forward link ✓.

---

## Architecture critique — `architecture.md`

| # | Dimension | Score | Findings |
|---|---|---|---|
| 1 | Contract fidelity (AG3 reuse, POST /bets, AK1 nouns) | 4 | WARNING (stale noun); otherwise faithful |
| 2 | Data model correctness | 4 | WARNING (migration SQL inaccurate) |
| 3 | API surface / coupling | 5 | Additive, single create-path — exemplary |
| 4 | Provenance / RESTRICT soundness | 5 | Verified sound (no hard-delete path) |
| 5 | Multi-team routing coherence | 4 | WARNING (UX asymmetry under-specified but coherent) |
| 6 | Migration discipline | 3 | WARNING (dialect + numbering) |
| 7 | User Sovereignty | 5 | Draft-only, human commits — explicit |
| 8 | AC completeness | 5 | Every AC + validation scenario mapped to a task |
| 9 | Task ordering / TDD-readiness | 5 | Red phases named per task, dependency-ordered |

### Findings

**WARNING — A2/A6 — Migration: dialect claim wrong, generated SQL sketch inaccurate.**
Plan §"Data model" says: *"SQLite + Postgres both: `ALTER TABLE bets ADD COLUMN source_knowledge_item_id text REFERENCES knowledge_items(id)`"*. Two inaccuracies:
1. The schema is **Postgres-only** (`pgTable` throughout `schema.ts`; migrations are Postgres SQL). There is no SQLite migration lane to satisfy. The "SQLite + Postgres both" framing (inherited from CLAUDE.md's stale tech-stack line) is wrong for this codebase.
2. The hand-sketched SQL is not what drizzle-kit emits. The precedent migration `0034_aromatic_hulk.sql` (which added the FK-less decomposition columns) emits `ALTER TABLE "bets" ADD COLUMN "x" text;` — drizzle-kit-pg emits FK constraints as a **separate** `ADD CONSTRAINT ... FOREIGN KEY` statement, not inline `REFERENCES` on `ADD COLUMN`.
*Mitigation:* the plan also says the migration is **generated** via `npm run db:generate` (task 1), which is the correct mechanism — so the builder will get the right SQL regardless. The prose sketch is illustrative and wrong; harmless to the build but misleading to a reader. Fix the prose or the builder may try to hand-write the wrong DDL.
*Numbering:* plan says `0035_AK5_bet_provenance.sql` "next after 0034" — correct; latest is `0034`. ✓

**WARNING — A1 — Stale noun (`deriveTitleFromPitch`) — AK1 rename not fully applied in prose.**
`architecture.md §spec-interrogation` and `concept.md:5` reference `deriveTitleFromPitch`. AK1 renamed this to **`deriveTitle`** in server + shared (`bets.ts:18`, `teams-routes.ts:51` — "`deriveTitleFromPitch` -> `deriveTitle`"). The old name now survives **only** as a client-local helper in `WorkBetCreate.tsx:49`. Since AK5 never calls title-derivation server-side (title is derived from `description` inside the existing GET enrichment, untouched by AK5), this is a prose-only stale reference, not a code contract. Tag: NIT-bordering-WARNING. Use the locked AK1 noun in the artifacts.

**No CRITICAL findings.**

### The four AK5-specific questions — adjudicated

**Provenance approach (nullable FK vs join table vs reuse reverse link): SOUND.**
- Nullable FK on `bets` is the cheapest recoverable form for a born-with-the-bet 1→≤1 relation. A join table would be a new noun with its own lifecycle for a relation that has none — correctly rejected at concept level.
- Reusing `scopeKind="bet"` is correctly rejected: that link is the **inverse** ("knowledge produced under this bet", real at `WorkBet.tsx:1052`). Conflating directions would corrupt both. Verified the reverse link exists and means the opposite. ✓

**`onDelete:"restrict"` — CORRECT, and stronger than the plan argues.**
The plan defends RESTRICT as "provenance must outlive convenience deletes." Code verification makes this airtight: **knowledge items have no hard-delete endpoint** — deletion is soft (`status:"archived"`, `knowledge.ts:880`), which RESTRICT does not touch. So RESTRICT has **zero** live UX downside (nothing can trip it today) while guaranteeing provenance integrity if a hard-delete is ever added. `set null` would silently erase recoverable provenance (AC2) on a future delete — strictly worse. The plan's choice is right; its `@lore` note about "future hard-delete must repoint first" is the correct forward-guard. AC2 ("provenance recoverable") is genuinely satisfied: stored as FK, enriched into `GET /bets/:id` as `sourceKnowledge:{id,title}`.

**AG3 reuse — GENUINE, no smuggled editor/dialect.**
The promote action creates a draft via the existing `POST /bets` and navigates to the existing `WorkBet`/`WorkBetCreate` AG3 surface. No new editor, no new content dialect, no promote-wizard. The design explicitly rejects a dialog (variant X) precisely because it would be a second authoring surface. Bet body flows as `description` (block-backed, AG3) — verified the schema treats `description` as the block body. Contract honoured.

**Multi-team routing — COHERENT but UX-asymmetric (under-specified, not broken).**
`createBetSchema` requires `teamId` at create. The plan resolves: single-team → one-click POST with `teams[0].id`; multi-team → navigate to `WorkBetCreate?fromKnowledge=:id` which pre-fills body + carries `sourceKnowledgeItemId` and lets the founder pick the team in the existing create page. Verified `WorkBetCreate` already has the team `Select` and the `singleTeam` auto-resolve (line 48) — so multi-team genuinely reuses a real surface, not a phantom one.
- *The asymmetry:* single-team users land on `WorkBet` (detail/edit); multi-team users land on `WorkBetCreate` (a different page) and must click Create again before the bet exists. So for multi-team, the bet is **not yet created** at landing, and provenance is carried as a query-param/payload — a different flow shape than the AC's "a draft bet exists … and the founder is taken to edit it." Both paths satisfy the ACs (the multi-team draft exists after the extra Create click), but the WP prose reads as a single uniform flow. WARNING: the plan should state plainly that multi-team is a two-step (pick team → Create → land) vs single-team one-step, and that the `?fromKnowledge=` pre-fill path must carry `sourceKnowledgeItemId` all the way into `WorkBetCreate.handleCreate`'s payload (task 7 says this — verify it lands, it is the only place provenance can be lost on the multi-team path).

### Migration / behaviour-change check
Forward-only, additive nullable column, existing rows → NULL, existing callers (`create_bet` tool, hand-typed bets) omit the field and are unchanged (`.strict()` still holds because the field is optional). No behaviour change to existing bets. ✓

### AC completeness audit
- **AC1** (draft bet pre-filled with item content) → tasks 2, 6, 7. ✓
- **AC2** (provenance recoverable) → tasks 1 (FK), 3 (GET enrichment), 5 (display). ✓
- **AC3** (lands in normal authoring surface) → task 6 (`navigate('/work/bet/:id')`) + task 7 (`WorkBetCreate` multi-team). ✓
- **Validation scenario 1** (promote → draft bet with body + provenance link, founder taken to edit) → task 9 integration test. ✓
- **Validation scenario 2** (commit → normal lifecycle incl. AK3) → out-of-scope note correctly states the promoted bet commits through the normal path; decomposition fires on commit unchanged. ✓
No AC lacks plan coverage.

**Architecture score: 4.3 / 5.** No unresolved CRITICAL. **APPROVED.**

---

## Design critique — `design/approved.md`

Routine classification accepted: it reuses three established patterns (overflow `Menu` action, AG3 authoring surface, backlink styling). One variant + considered-alternatives is the correct gate for routine. Verified every reused affordance exists in code (`KnowledgeOverflowMenu`, `MenuItem`, `archiveError` banner, `RRLink`, `WorkBet` header).

| # | Dimension | Score | Note |
|---|---|---|---|
| 1 | Task fit | 5 | "Don't retype, drop me in the editor" — matches AC exactly |
| 2 | Component budget | 5 | Zero new components; all reused affordances verified to exist |
| 3 | One interaction grammar | 5 | Promote = lifecycle menu action (like Archive); provenance = backlink (like BacklinksCard) |
| 4 | Density | 4 | One menu item + one provenance line; header-meta placement flagged by designer for build-time confirm |
| 5 | States covered | 4 | Default/disabled/loading/error/populated all specified — see WARNING on multi-team |
| 6 | Avoids AI aesthetic | 5 | No icon, no card, no hero, no dialog |
| 7 | Keyboard / focus | 4 | Inherits `Menu` a11y; post-nav focus relies on existing `WorkBet` (not re-verified) |
| 8 | Reuse / no rebuild | 5 | AG3 surface is the landing target verbatim; no editor rebuilt |
| 9 | Sovereignty fit | 5 | Produces draft; human commits |

### Findings

**WARNING — D5 — The multi-team flow is invisible in the design.**
The design describes promotion as "Menu action → optimistic create → land in editor" with an inline "Promoting…" state. But for a multi-team factory the architecture routes through `WorkBetCreate?fromKnowledge=` — a **page navigation to a create form**, not an optimistic in-place create. The design's loading/landing narrative ("on 201, navigate to `WorkBet`") describes only the single-team path. The two flows look and feel different to the founder. The design defers to "whichever the plan settles" (§interaction step 2) — acceptable for routine — but the multi-team landing experience (a create page with body pre-filled, team picker focused) has no state described. NIT-to-WARNING: the build should confirm the `?fromKnowledge=` landing reads as "finish promoting" not "blank new bet."

**NIT — D4 — Provenance line placement self-flagged.**
Designer self-docked density to 4 because header-meta-row placement "needs the build to confirm it doesn't crowd status/team." Honest. The fallback ("one-line note above the body") is acceptable. Build-time visual check via the live TSX viewer is the right resolution — flag for Phase 4.

**NIT — D7 — Post-navigation focus not re-verified.**
Designer relies on existing `WorkBet`/`WorkBetCreate` routing focus behaviour. Reasonable for routine reuse, but no a11y assertion. Phase-4 component test should confirm focus is not lost on land.

**No CRITICAL findings.** Anti-slop clean: explicitly rejects icon, card, "Promoted from" verbosity, and a wizard.

**Design score: 4.7 / 5.** No unresolved CRITICAL. **APPROVED.**

---

## Verdict

| Artifact | Score | Verdict |
|---|---|---|
| Design | 4.7 / 5 | APPROVED |
| Architecture | 4.3 / 5 | APPROVED |

**Both APPROVED — no designer revision round required.** Zero CRITICAL findings; all WARNINGs are prose-accuracy or build-time-confirm items, not plan defects.

### Carry-forward to Phase 4 code review (the things the builder can get wrong)
1. **Migration must be `npm run db:generate`-generated Postgres SQL** (FK as separate `ADD CONSTRAINT`), not the hand-sketched inline-`REFERENCES` DDL in the plan prose. Confirm `onDelete:"restrict"` lands on the generated FK.
2. **Multi-team provenance is the failure-prone seam.** Verify `WorkBetCreate`'s `?fromKnowledge=` path carries `sourceKnowledgeItemId` all the way into `handleCreate`'s POST payload — it is the only place provenance can silently drop on the multi-team flow (task 7).
3. **`GET /bets/:id` enrichment + `betDetailResponseSchema`** must add `sourceKnowledge:{id,title}|null` — the schema is a plain object today with no such field; the route builds an explicit object, so the field must be added in both places or the response-validator (if later registered) / the type will break.
4. **`.strict()` preserved** on `createBetSchema` with `sourceKnowledgeItemId` optional — existing `create_bet` tool + hand-typed callers must stay green (no extra field sent).
5. **Source knowledge item unchanged** after promotion (no status/body mutation) — assert in the integration test (task 9).
6. **Stale noun:** use `deriveTitle`, not `deriveTitleFromPitch` (server side); confirm no AK1-dropped term is reintroduced.
