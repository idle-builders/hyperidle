# AC2 Architecture Critique -- Bet Hypothesis Validation Flow

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:8 LI:8 AC:8 DM:7 N:8 MD:8 FMC:6 S:8 V:7

## Summary

The plan is well-structured and makes sound decisions. The single atomic endpoint (POST /bets/:id/retro) is the right call over two client-side calls. The decision to use `kind='reflection'` rather than adding a new enum value follows from the concept doc and avoids accidental complexity. The stub approach for the AI draft endpoint is pragmatic -- it delivers the frontend integration and endpoint contract while deferring the LLM call.

The plan has one area of genuine concern (failure-mode coverage, particularly around YAML frontmatter rendering and transaction semantics) and several specification gaps that need addressing during implementation. Score 7/10 -- meets threshold for advancement.

---

## Dimension Scores

### 1. Spec Alignment -- 8/10

Every acceptance criterion from TRACK-AC.md maps to a plan task:

| Spec AC | Plan coverage |
|---|---|
| "guided through evaluating the hypothesis side-by-side" | Task 4: two-column layout in WorkBet.tsx |
| "validation is optional -- unvalidated bets show persistent not evaluated" | AC2-9: verified by existing AC1 tests. No new work needed. |
| "creates a structured retro knowledge item (kind: retro)" | Task 2: POST /retro creates knowledge item with kind='reflection'. The concept doc resolves 'retro' -> 'reflection'. |
| "AI-assisted drafting" | Task 3: POST /retro/draft + Task 4: handleRetroDraft handler |
| "eligible for promotion through existing pipeline" | Concept doc Phase 4 hard rule 3: retro item enters existing pipeline via standard knowledge lifecycle. No plan task needed -- this is the default behavior. |

The plan does not invent requirements beyond the spec. Task 5 (verify AC1 tests) is a justified dependency verification, not scope creep.

One nuance: the spec says `kind: "retro"` but the concept doc resolves this to `kind: 'reflection'`. The plan correctly follows the concept doc. AC2-10 explicitly tests this. This is well-handled.

### 2. Layer Integrity -- 8/10

The three-layer boundary is respected:
- The new endpoint POST /bets/:id/retro lives in `packages/server` (Meta Layer), composes the knowledge item body server-side, and writes to `packages/db` schema tables.
- The frontend in `packages/web` calls the endpoint via `apiFetch` -- no direct DB access.
- The knowledge item creation uses the existing `knowledgeItems` and `knowledgeStrategyFabric` tables via Drizzle ORM -- no raw SQL.
- The YAML frontmatter composition happens server-side, not client-side. This keeps the structured format as a server contract.

The plan correctly identifies that adding a FK from `bets` to `knowledge_items` (Option B for deduplication) would violate the layer boundary ("bet table is kernel; knowledge item is strategy-adjacent"). Using the scope query instead preserves layer separation.

### 3. API Contracts -- 8/10

Both new endpoints are fully specified:

**POST /bets/:id/retro**: Request body (3 fields with types and constraints), response shape (`{ ...bet, retroKnowledgeItemId }`), error codes (404, 400, 400), Zod schema (`betRetroSchema`).

**POST /bets/:id/retro/draft**: Empty request body, response shape (`{ verdict, summary, learnings }`), error codes (404, 400, 500), response Zod schema (`retroDraftResponseSchema`).

Both schemas are concrete TypeScript with Zod validation -- not "returns the bet." The response shapes reference existing patterns (bet detail shape).

**WARNING**: The response for POST /retro says "Same bet shape as GET /bets/:id (with atRisk normalized to boolean)" -- but the GET /bets/:id response includes enriched fields (title, team, progress, costAppetite as WireMoney, tasks array). The POST /retro handler would need to replicate this enrichment, or return a simpler shape. The plan does not specify whether it returns the full enriched shape or the raw bet row. This needs clarification.

### 4. Data Model Alignment -- 7/10

The plan correctly states "No database schema changes. AC2 does not add columns to any table." This is verified against `packages/db/src/schema.ts` -- all necessary tables and columns (bets.hypothesis, bets.outcomeVerdict, knowledgeItems, knowledgeStrategyFabric) exist from AC1 and earlier workpackages.

The BetDetail type addition (`hypothesis?: string | null`) is additive and matches the API response (hypothesis is already returned via `...restBet` spread).

**WARNING**: The plan's reconciliation table says "`BetDetail` type includes `hypothesis`" -> "No" -> "Add `hypothesis?: string | null` to BetDetail." However, looking at the actual BetDetail type in `packages/web/src/types/bet.ts`, it already includes `outcomeVerdict`, `outcomeSummary`, `outcomeRecordedAt`, `outcomeRecordedBy` from AC1, but indeed lacks `hypothesis`. This is correct. But the plan should note that `hypothesis` is not present on the `tasks` sub-type either -- and it is not needed there (hypothesis is a bet-level field). This is a minor gap.

**WARNING**: The upsert logic for the retro knowledge item uses a cross-table query (`knowledge_items JOIN knowledge_strategy_fabric WHERE scope_kind='bet' AND scope_id=betId AND kind='reflection'`). The existing `upsertFabricLayer` function in `knowledge.ts` only sets `layer`, not `kind`. The plan identifies this in the reconciliation table ("Extend or create a new function that also sets `kind='reflection'`") but Task 2's action list does not explicitly call out creating this new upsert function or modifying the existing one. The task says "Upsert fabric row with kind='reflection'" but does not name the function that does this. This is a specification gap -- the builder may attempt to reuse `upsertFabricLayer` and find it does not set `kind`.

### 5. Naming -- 8/10

Names are honest and consistent:
- `betRetroSchema` -- accurately describes the Zod schema for the retro endpoint.
- `retroKnowledgeItemId` -- clear what it returns.
- `handleRetroDraft` -- clear handler name for the AI draft action.
- `retroSummaryForm` / `retroLearningsForm` / `retroDrafting` / `retroDraftError` -- state variables are prefixed with `retro` to distinguish from AC1's `outcome` state. This avoids collision.

The plan correctly repurposes `outcomeSummaryForm` as the "reality" textarea (it maps to the same `outcomeSummary` field). This is efficient naming -- no unnecessary rename.

The endpoint path `/api/bets/:id/retro` is honest: it is the retro recording endpoint. `/api/bets/:id/retro/draft` nests naturally. Both follow RESTful conventions established in the codebase.

### 6. Module Depth -- 8/10

The plan adds two endpoints and enhances one page. The public surface is minimal:
- Two new server routes (both in the existing `bets.ts` router -- no new file).
- One new optional field on `BetDetail` type.
- Four new state variables in WorkBet.tsx (scoped to the component).
- One new handler (`handleRetroDraft`), one modified handler (`handleOutcomeSave`).

No new hooks, no new utility modules, no new shared types. The knowledge item creation is server-side -- no client-side knowledge API calls. This keeps the frontend's dependency surface unchanged.

The existing `POST /bets/:id/outcome` endpoint is preserved, not replaced. This is a depth decision -- the retro endpoint subsumes outcome but the simpler endpoint remains for callers that only need the verdict.

### 7. Failure-Mode Coverage -- 6/10

This is the weakest dimension.

**CRITICAL**: The plan's Risk #1 says "the block derivation pipeline (`deriveBlocks`) already handles frontmatter (markdown parsers typically strip YAML frontmatter between `---` delimiters). Verify this during implementation." I verified: `deriveBlocks` in `packages/shared/src/blocks/derive-blocks.ts` has NO frontmatter handling. There is no `yaml`, `frontmatter`, or `---` stripping logic anywhere in the function. The `---` delimiter in YAML frontmatter will be parsed as a thematic break (horizontal rule) by the markdown parser, and the key-value pairs will render as paragraph text. When a retro knowledge item is viewed in the Knowledge view via `KnowledgeBody`, the YAML frontmatter will render as visible text (e.g., "betId: abc-123" as a paragraph, `---` as a horizontal rule). This is a real bug, not a hypothetical risk. The plan must either: (a) add frontmatter stripping to `deriveBlocks`, (b) strip frontmatter in `KnowledgeBody` before passing to `deriveBlocks`, or (c) not use YAML frontmatter in the body at all and store the structured metadata elsewhere (e.g., in the `knowledgeStrategyFabric.meta` JSON column). Option (c) changes the body format contract from the concept doc. Option (b) is a targeted fix. Option (a) has wider blast radius but is arguably the correct long-term fix.

**WARNING**: Transaction semantics are mentioned ("Begin transaction" in step 4) but the plan does not specify how to use Drizzle ORM transactions. The existing codebase uses `db.transaction()` in some places -- the plan should reference this pattern explicitly. If the transaction fails after writing the bet outcome but before writing the knowledge item, the bet outcome is NOT rolled back (it is inside the transaction), which is correct. But if the transaction fails entirely, nothing is written. The partial-failure scenario from the design doc ("Outcome saved but retro record failed") can only occur if the two writes are NOT in a transaction -- which contradicts the plan's atomicity claim. The plan should clarify: with a transaction, it is all-or-nothing (no partial failure). The design's partial-failure error message is dead code. Either remove it from the design or acknowledge it.

**WARNING**: The plan's security table says "Existing rate-limit middleware applies to all API routes. No new action needed" for the retro endpoint. This is correct for basic rate limiting. But the AI draft endpoint (POST /retro/draft) will eventually make an LLM call. The plan mentions "add an explicit per-user per-bet cooldown (e.g., max 3 draft calls per bet per hour)" for when LLM integration lands, but does not implement it now. For the stub, this is acceptable. But the plan should note that the stub has no LLM cost, so the cost cap is effectively infinite for AC2.

**WARNING**: YAML injection in hypothesis text is identified in the security table with mitigation "proper YAML escaping (quoted string with backslash-escaped internal quotes)." The plan does not name a specific YAML library or escaping function. If the builder uses string concatenation to build the YAML frontmatter, injection is trivial (a hypothesis containing `---` or `\n` breaks the format). The plan should specify: use JSON.stringify for the hypothesis value in the frontmatter (JSON strings are valid YAML strings), or use a YAML serialization library.

### 8. Simplicity / Over-Engineering Risk -- 8/10

The plan is appropriately scoped:
- No new tables, no new migration.
- No new shared types (uses existing `BetOutcomeVerdict`, `KnowledgeKind`).
- The stub AI draft is pragmatic -- it delivers the endpoint shape without the LLM complexity.
- The design-it-twice sections are substantive, not theatre:
  - Endpoint shape: single endpoint vs two client calls. Real trade-off, correct winner.
  - Deduplication: scope query vs FK column. Real trade-off, correct winner (layer boundary argument is concrete).

The plan does not introduce feature flags, plugin points, or abstract base classes. No premature generalization.

One minor note: the plan includes `retroDraftResponseSchema` as a Zod schema for the response shape, which is unusual (response shapes are typically just TypeScript types, not Zod schemas). This is harmless but adds a schema that has no validator consuming it (the server creates the response, it does not validate it). The builder may skip this.

### 9. Verifiability -- 7/10

The AC verification table maps all 15 criteria to specific test types and assertions:
- AC2-1 through AC2-6: Integration tests with concrete assertions (POST + assert fields).
- AC2-7, AC2-8, AC2-12: Component/E2E tests with DOM assertions.
- AC2-9: Covered by existing AC1 tests (no new test needed).
- AC2-10, AC2-11, AC2-13, AC2-14, AC2-15: Integration tests + `npm run check`.

The protected tests list names `packages/server/src/__tests__/AC1-bet-outcome.test.ts` -- correct, as the AC1 outcome endpoint must continue passing.

**WARNING**: The plan's test list for Task 2 is thorough but does not include a test for the YAML frontmatter parsing correctness -- i.e., that the body content can be rendered by `deriveBlocks` without visible frontmatter artifacts. This is the implementation-side verification for Risk #1.

**WARNING**: Task 4 (WorkBet.tsx) lists component tests but does not specify test file location. Task 2 names `packages/server/src/__tests__/AC2-retro.test.ts` and Task 3 names `packages/server/src/__tests__/AC2-retro-draft.test.ts` -- both explicit. Task 4 names `packages/web/src/pages/__tests__/WorkBet.retro.test.tsx` -- explicit and correctly located. This is good.

The plan orders tests before implementation in each task description (integration tests listed under each task's **Test** section). This satisfies failing-test-first ordering at the task level.

---

## CRITICAL

- **[plan, Risks #1]** `deriveBlocks` does NOT handle YAML frontmatter. The plan claims "the block derivation pipeline already handles frontmatter" -- this is factually wrong. `packages/shared/src/blocks/derive-blocks.ts` contains no frontmatter stripping logic. When a retro knowledge item is rendered in the Knowledge view via `KnowledgeBody`, the YAML frontmatter (`---`, `betId: ...`, `hypothesis: ...`, `verdict: ...`, `---`) will render as visible text and horizontal rules. **Fix options** (pick one during implementation): (a) Strip YAML frontmatter in `KnowledgeBody` before passing to `deriveBlocks` for knowledge items with `scopeKind='bet'`. (b) Store structured metadata in `knowledgeStrategyFabric.meta` JSON column instead of YAML frontmatter in the body, and keep the body as pure markdown (Reality + Learnings sections only). (c) Add frontmatter stripping to `deriveBlocks` globally (widest blast radius, verify no existing content uses `---` as content). **Recommended**: option (b) -- it eliminates the YAML injection risk entirely, simplifies the body format, and leverages the existing `meta` column on `knowledgeStrategyFabric` for its intended purpose. The concept doc's body format contract would need a minor revision (structured data moves from frontmatter to the `meta` column; body becomes pure markdown).

## WARNING

- **[plan, POST /retro response shape]** The plan says the response is "Same bet shape as GET /bets/:id" but GET /bets/:id returns an enriched shape with derived fields (title, team, progress, costAppetite as WireMoney, tasks array). The POST /retro handler must replicate this enrichment or define a simpler response. Specify explicitly which shape is returned: the full enriched detail shape (which requires the same enrichment queries as GET /:id), or the raw bet row + retroKnowledgeItemId (simpler, frontend refreshes via `fetched.refresh()`). Since the frontend already calls `fetched.refresh()` after save in AC1, the simpler raw-row response is likely sufficient -- but the plan should be explicit.
- **[plan, Task 2 action list]** The plan says "Upsert fabric row with kind='reflection'" but does not specify how. The existing `upsertFabricLayer` function in `knowledge.ts` only sets `layer`, not `kind`. The builder needs to either: (a) extend `upsertFabricLayer` to accept an optional `kind` parameter, (b) create a new function `upsertFabricWithKind`, or (c) inline the upsert logic in the retro endpoint. Option (a) is least disruptive. The plan should specify which approach.
- **[plan, Failure modes]** The transaction wrapping the bet outcome write + knowledge item upsert means the partial-failure scenario described in approved.md section 1.6 ("Outcome saved but retro record failed") cannot occur. If the transaction fails, neither write persists. The design's partial-failure error message is dead code with a correct transaction implementation. The plan should acknowledge this and recommend the builder either: (a) remove the partial-failure error case from the frontend (simplification), or (b) not use a transaction and handle partial failure explicitly (matches the design but loses atomicity). Since atomicity was the reason for choosing Option A (single endpoint), option (a) is correct -- simplify the frontend error handling.
- **[plan, Security table, YAML injection]** The plan identifies YAML injection risk but does not name a specific escaping mechanism. If the builder uses string concatenation for the frontmatter, a hypothesis containing `---\n` or multiline content breaks the format. Specify: use `JSON.stringify(hypothesis)` for the value in YAML frontmatter (JSON strings are valid YAML quoted strings), or adopt the CRITICAL finding's option (b) to eliminate YAML entirely.

## SUGGESTION

- **[plan, Task 3]** The stub AI draft logic ("if all met -> validated, if any not_met -> partial") is reasonable but the mapping is incomplete. What if there are no tasks with outcomes at all (all `outcomeVerdict` null)? The stub should default to `inconclusive` in that case. What if all tasks are `not_met`? The stub should return `refuted`, not `partial`. A complete mapping table would prevent the builder from guessing.
- **[plan, Frontend changes]** The plan repurposes `outcomeSummaryForm` as the "reality" textarea. This works but the variable name no longer matches its UI role. During AC2, this field is labeled "What happened?" in the UI but stored as `outcomeSummaryForm` in React state. This is a naming honesty gap. Renaming to `retroSummaryForm` (which the plan already introduces as a separate variable for a different purpose) would be clearer. The plan should decide: is `outcomeSummaryForm` the reality textarea, or is `retroSummaryForm` the reality textarea? The plan introduces both but uses them for different purposes. Clarify.
- **[plan, AC2-4]** The hypothesis immutability test says "PATCH bet hypothesis to new value. GET knowledge item. Assert body frontmatter hypothesis matches the ORIGINAL value." This test is good but there is no PATCH endpoint for hypothesis on completed/killed bets. The plan should note that the test needs to: (1) create bet, (2) set hypothesis, (3) complete bet, (4) POST retro, (5) update hypothesis via direct DB manipulation (since PATCH is blocked for completed bets), (6) GET knowledge item and assert. The direct DB manipulation is the only way to simulate this scenario.

## What's Working Well

- **Design-it-twice quality**: Both sections (endpoint shape and deduplication) present real alternatives with concrete trade-offs. The layer boundary argument against the FK option is sharp and well-reasoned. Neither alternative is straw-manned.
- **Plan reconciliation table**: The spec-vs-reality table is thorough. It identifies 11 assumptions, verifies each against the codebase, and provides concrete resolutions. The `upsertFabricLayer` gap and the `BetDetail` type gap are both caught here, which shows the designer read the code.
- **AC1 preservation**: The plan explicitly preserves the AC1 outcome endpoint, lists it in protected tests, and adds Task 5 to verify AC1 tests pass. This prevents the common regression where a follow-up workpackage breaks the previous one.

---

## Verdict

Score 7/10. The plan meets the threshold for advancement. The CRITICAL finding (YAML frontmatter rendering) is a real bug that must be addressed during implementation -- the builder should choose one of the three fix options before writing tests. The WARNING findings (response shape clarification, upsertFabric kind handling, transaction vs partial-failure inconsistency, YAML escaping) are all addressable without plan restructuring. The plan's core decisions (single atomic endpoint, scope-based deduplication, stub AI draft, no schema migration) are all correct.
