# Q3 Architecture Critique — Human-Created Bets

ARCHITECTURE-SCORE: 8/10 rounds=1 score-line: SA:9 LI:9 AC:8 DM:9 N:8 MD:8 FMC:7 S:8 V:8

---

## Summary

The plan is thorough, well-grounded in the codebase, and covers all 11 ACs with explicit verification methods. The Phase 0 interrogation correctly identified the four spec-vs-reality gaps (Canvas unmounted, teamId required, revisionLog not seeded, canvas endpoint unenriched). The design-it-twice sections make honest tradeoff arguments rather than straw-manning the rejected option. The task dependency graph is correctly ordered. Two issues need the builder's attention: a missing status guard specification for the pitch PATCH handler, and a gap in the plan's treatment of the `updateBetSchema` discriminated union vs. `MUTABLE_BET_FIELDS` constant synchronization.

---

## CRITICAL

None.

## WARNING

### W-1: Pitch PATCH status guard is underspecified [plan: T4, "Design-it-twice: pitch mutable field handling"]

The plan says pitch should be mutable in "all statuses except `shipped` and `killed`" and lists: `shaped`, `committed`, `in_progress`, `paused`, `behind`, `blocked`, `review`. This is correct and well-reasoned (Option B chosen over Option A because the state machine's MUTABLE_IN_STATUSES excludes `shaped`).

However, the plan does not specify the concrete implementation of this guard. The cost_appetite PATCH handler (bets.ts:358) hardcodes its own `MUTABLE_IN_STATUSES` set inline. The plan's T4 section says "handle pitch directly in PATCH route... similar to how cost_appetite is handled" but does not explicitly state:

1. That the pitch handler needs its own status guard (a different set than cost_appetite's, since pitch allows `shaped` and `committed` but cost_appetite does not).
2. What the error response shape should be (400 with what code/message).
3. Whether the status guard set should be extracted to a named constant (DRY) or hardcoded inline (matching the cost_appetite precedent).

Without this, the builder may copy the cost_appetite guard verbatim (which excludes `shaped` and `committed` and `review`) and break AC-6 (founder edits pitch on a shaped bet).

**Fix:** In T4's Work section, add an explicit step: "Define `PITCH_MUTABLE_IN_STATUSES = new Set(['shaped', 'committed', 'in_progress', 'paused', 'behind', 'blocked', 'review'])` and guard the pitch handler with it. Return 400 with `{error: 'Pitch is not editable on a <status> bet', code: 'VALIDATION_ERROR'}` for `shipped` and `killed`."

### W-2: MUTABLE_BET_FIELDS constant and updateBetSchema discriminated union are not synchronized [plan: T4, "Migrations: Symbol renames/moves"]

The plan says to add `"pitch"` to `MUTABLE_BET_FIELDS` in `packages/shared/src/types.ts`. Currently:

```typescript
export const MUTABLE_BET_FIELDS = ["done_condition", "hypothesis", "cost_appetite"] as const;
```

But the actual `updateBetSchema` in bets.ts does NOT use `MUTABLE_BET_FIELDS`. The string field schema hardcodes `z.enum(["done_condition", "hypothesis"])` (line 60), and `cost_appetite` is a separate literal schema (line 66). They are joined in a discriminated union (line 71-74).

The plan adds a third union member `updateBetPitchSchema` with `field: z.literal("pitch")` — this is correct. But adding `"pitch"` to `MUTABLE_BET_FIELDS` is misleading because the route does not consume that constant for validation. The route uses the discriminated union, and the state machine uses its own local `MUTABLE_FIELDS` set (line 52: `["done_condition", "hypothesis", "appetite"]`).

There are now three separate lists of "mutable fields" that must stay in sync:
1. `MUTABLE_BET_FIELDS` in shared/types.ts (used by one test file: bets.validation.test.ts)
2. `updateBetSchema` discriminated union in bets.ts (actual validation)
3. `MUTABLE_FIELDS` in bet-state-machine.ts (service-layer guard)

Adding "pitch" to `MUTABLE_BET_FIELDS` without noting that pitch does NOT flow through `updateBetField()` (the state machine) creates a false expectation. The plan's T4 section says "Update `bet-state-machine.ts` MUTABLE_FIELDS if it gates pitch mutability" — this conditional phrasing is correct but vague. Since pitch is handled directly in the route (Option B), it should NOT be added to the state machine's `MUTABLE_FIELDS`.

**Fix:** In T4, make explicit: (1) add `"pitch"` to `MUTABLE_BET_FIELDS` for the shared constant, (2) do NOT add `"pitch"` to `bet-state-machine.ts` `MUTABLE_FIELDS` (pitch bypasses the state machine, per the design-it-twice decision), (3) note that the `bets.validation.test.ts` file expects `MUTABLE_BET_FIELDS` to match what the PATCH route accepts, so the test may need updating.

### W-3: loadProductTeam throws 500 but plan says to guard with 400 — the guard implementation is not specified [plan: T2]

The plan correctly identifies Risk 1: "loadProductTeam throws 500 on invalid productId." T2 step 5 says "Verify productId references a real product before team lookup (return 400 if not found, not 500 from loadProductTeam)."

This is the right approach, but the plan does not specify HOW to verify the product exists. Options:
- (a) `db.select().from(products).where(eq(products.id, body.productId)).get()` — a direct query
- (b) Wrap `loadProductTeam` in a try-catch and map `ApiError(500, 'team_missing')` to 400

Option (a) is better (explicit, no exception flow for expected errors) but adds a DB query. The plan should specify which approach and what the 400 response body looks like.

**Fix:** In T2 step 5, specify: "Before calling loadProductTeam, query `products` table for the given productId. If not found, return `c.json({ error: 'Product not found', code: 'NOT_FOUND' }, 400)`. Do not rely on catching loadProductTeam's 500 — that is reserved for invariant violations (product exists but team is missing)."

### W-4: Canvas enrichment (T3) does not specify the products join pattern [plan: T3]

T3 says "Join bets with products to get product name." The existing canvas endpoint (bets.ts:158-175) does `db.select().from(bets).all()` — a simple full-table scan with no join. The plan should specify whether this becomes:
- (a) A Drizzle `leftJoin` in the query itself
- (b) A post-hoc lookup (fetch all products, build a map, enrich in JS)

The bet detail endpoint (line 242-247) does option (b): a per-bet `db.select({name: products.name}).from(products).where(eq(products.id, bet.productId)).get()`. For the canvas endpoint returning multiple bets, a per-bet query is an N+1. A single join or a batch lookup is needed.

**Fix:** In T3, specify: "Use a single `db.select().from(products).all()` to build a `Map<productId, productName>`, then map over bet rows. This avoids N+1 queries and matches the pattern of the existing `allTeams` fetch on line 160."

## SUGGESTION

### S-1: The POST response shape should match CanvasBetWire for immediate consumption [plan: T2, T5]

Currently, POST /api/bets returns the raw bet row plus `costAppetite` as WireMoney. The plan's T5 says "On success: call `onCreated(bet)` with the server response mapped to CanvasBet shape." This means the frontend must transform the POST response into the CanvasBetWire shape (derive title, look up product name from the select option text, format appetite).

An alternative: have the POST handler return the enriched `CanvasBetWire` shape directly (like the detail endpoint does). This eliminates client-side derivation and ensures the optimistic card matches the server's data shape. However, the existing POST contract returns the raw row, and changing it would affect any other callers (none found in the codebase, but it is a contract change).

The current plan's approach (client-side mapping) is acceptable. Noting this as an option the builder can consider.

### S-2: BetCreateDialog file location is `pages/work/` but no such directory exists [plan: T5]

T5 specifies `packages/web/src/pages/work/BetCreateDialog.tsx`. The `pages/work/` directory does not exist — the current page files are flat under `pages/` (e.g., `WorkPortfolio.tsx`, `WorkBet.tsx`, `WorkProduct.tsx`). The KnowledgeCreateDialog is under `pages/knowledge/KnowledgeCreateDialog.tsx`, which is a subdirectory.

This is consistent with the KnowledgeCreateDialog pattern (subdirectory per domain area) and creating `pages/work/` is fine. The builder should just know the directory needs to be created.

### S-3: The `useCanvasBets` hook location is `hooks/useCanvasBets.ts` but its shape assumes CanvasBetWire from the server [plan: T1]

The hook's `UseCanvasBetsResult` interface includes `addOptimistic` and `removeOptimistic`. These are good for the optimistic update pattern but the plan does not specify whether the hook stores `CanvasBet[]` (the frontend type from Canvas.tsx) or `CanvasBetWire[]` (the API response type). The two types differ — CanvasBet has `appetite: string` (display string) while CanvasBetWire has both `appetite: string` and `costAppetite: WireMoney | null`.

The hook should transform `CanvasBetWire` to `CanvasBet` internally so the Canvas component receives the shape it expects. The plan implies this but does not state it explicitly.

### S-4: Risk 2 mitigation (disable drag on optimistic cards) needs implementation detail [plan: Risks]

The plan says: "DraggableBetCard component checks if `bet.id.startsWith('pending-')` and sets `disabled: true` on the useDraggable hook." Looking at the current DraggableBetCard (Canvas.tsx:84-101), the `useDraggable` hook does support a `disabled` option. This mitigation is straightforward but the builder needs to know that `useDraggable({id: bet.id, disabled: bet.id.startsWith('pending-')})` is the specific API. The plan could be more precise.

### S-5: The cost_appetite PATCH handler has a misleading error message [observation, not plan issue]

bets.ts:362 says `"Field 'cost_appetite' is not mutable on an in_progress bet"` but the actual guard allows in_progress, paused, behind, and blocked. The error message should say something like "not mutable in current status." This pre-dates Q3 but the builder touching this code path for pitch may want to fix it.

---

## What's Working Well

1. **Phase 0 interrogation is genuinely useful.** The four questions (Canvas mount location, canvas enrichment, PATCH pitch support, E2E page) are exactly the questions a builder would hit in the first 30 minutes. Resolving them upfront saves a full iteration cycle.

2. **Design-it-twice sections are honest.** The teamId resolution (Option A server-side vs Option B client-side) and the pitch mutable field handling (Option A state machine vs Option B direct route) are real tradeoffs with concrete reasons for the choice. Neither rejected option is a straw man. The L13 lore citation for teamId is particularly good — it grounds the decision in an existing invariant, not a preference.

3. **Plan reconciliation table catches real drift.** Every row maps a spec assumption to actual codebase reality and names a specific resolution. This is the most valuable section of the plan — it prevents the builder from discovering these gaps during implementation.

4. **Protected tests list is explicit.** Five files named, "additive only" rule stated. This is exactly what the downstream code reviewer needs.

---

## AC Coverage Audit

| AC | Task(s) | Verification method | Complete? |
|---|---|---|---|
| AC1: "New pitch" action in Canvas | T6 | Vitest: aria-label present. Playwright: button visible. | Yes |
| AC2: Creation form fields | T5 | Vitest: all form fields rendered with correct attributes | Yes |
| AC3: POST with status=shaped | T2 | Integration: POST, assert 201 + status=shaped + teamId populated | Yes |
| AC4: BetCard in shaped column | T6, T7 | Playwright: create pitch, assert BetCard title in shaped column within 2s | Yes |
| AC5: Markdown in bet detail | T7 | Playwright: create with markdown, navigate to detail, assert `<strong>` tag | Yes |
| AC6: Edit pitch post-creation | T4 | Integration: PATCH field=pitch, assert 200 + updated pitch + revisionLog | Yes |
| AC7: Agent edits + version history | T4 | Integration: POST (founder), PATCH (agent-id), assert 2 revisionLog entries | Yes |
| AC8: teamId auto-assigned | T2 | Integration: POST without teamId, assert response teamId matches product's team | Yes |
| AC9: No appetite shows "--" | T5, T7 | Vitest: BetCard appetite="--". Playwright: create without appetite, verify display | Yes |
| AC10: Empty pitch validation | T2, T5 | Integration: POST empty pitch, assert 400. Vitest: error message visible | Yes |
| AC11: bun verify green | T8 | `bun run verify` | Yes |

All ACs have explicit verification methods and task assignments. No scope-creep tasks detected — every task traces to one or more ACs.

---

## Dimension Detail

### 1. Spec Alignment (9/10)
All 11 ACs map to tasks. No scope creep. The plan reconciliation table catches all spec-vs-reality gaps. Minor deduction: the plan does not explicitly name where AC-5 (markdown rendering in bet detail) is tested at the unit level — only E2E is specified. The existing `deriveBlocks` + `<Block />` pipeline handles this, but a unit test verifying the pitch-to-blocks round-trip would strengthen coverage.

### 2. Layer Integrity (9/10)
Clean layer separation. Frontend talks to API, API talks to DB. No cross-package private imports. The `loadProductTeam` service is correctly imported into the route handler (same layer). `CanvasBetWire` is defined on the server and consumed by the frontend via API response — no shared type import needed because the frontend has its own `CanvasBet` interface.

### 3. API Contracts (8/10)
POST, PATCH, GET canvas all have request/response shapes specified as TypeScript types. The `CanvasBetWire` interface is fully spelled out. The `updateBetPitchSchema` is specified with field, value, and reason. Deductions: (1) the POST 201 response body shape is not re-specified after the change (it adds `revisionLog` to the creation flow, but the response still returns the raw row — does `revisionLog` appear in the 201?). (2) The 400 error shape for invalid productId is not specified (W-3).

### 4. Data Model Alignment (9/10)
No DB migration needed — confirmed by checking the schema. The `revisionLog` column already exists as nullable text. `teamId` column exists. costAppetite columns exist. The plan correctly identifies that no DDL changes are required. Minor: the plan says `teamId: z.string().optional()` but the DB column is `text("team_id").notNull()` — the builder must ensure the server always resolves a teamId before INSERT (the plan states this but it bears emphasis).

### 5. Naming (8/10)
`BetCreateDialog` follows the `KnowledgeCreateDialog` naming pattern. `useCanvasBets` is descriptive. `CanvasBetWire` distinguishes the API shape from the frontend `CanvasBet`. Minor: the plan introduces `onNewPitch` as the Canvas callback name, which is slightly misleading — "pitch" is the internal term for the bet's body content, but the user action is "create a new bet." However, the spec itself says "New pitch" so this aligns with spec language.

### 6. Module Depth (8/10)
The `useCanvasBets` hook hides fetch, optimistic state, and refetch behind a simple interface. `BetCreateDialog` is a single component with a 4-prop interface. The Canvas change is minimal (one optional prop). No unnecessary abstractions. Slight concern: `addOptimistic` and `removeOptimistic` on the hook interface are implementation-detail leakage — the parent (WorkPortfolio) needs to orchestrate the optimistic flow manually. A higher-level `createBet(data)` method on the hook would be deeper. But for v1, the current approach is acceptable.

### 7. Failure-Mode Coverage (7/10)
The plan addresses: POST validation (empty pitch 400, invalid productId), optimistic failure (card removal + error), drag-on-pending prevention, money input validation (negative/decimal). Deductions: (1) W-1 — pitch PATCH status guard not fully specified. (2) W-3 — product existence check not fully specified. (3) The plan's security table says "No additional rate limit needed for v1 (single founder)" — this is a reasonable v1 decision but should explicitly note the follow-up. (4) No mention of what happens if `loadProductTeam` throws `ApiError(500, 'invariant_broken')` — multiple teams for one product. The builder should catch this and return 500 with a descriptive error rather than letting it bubble as an unhandled exception.

### 8. Simplicity / Over-Engineering Risk (8/10)
No feature flags, no abstract base classes, no premature generics. The design-it-twice sections make real decisions. The optimistic update flow is the most complex piece — it could be simplified by omitting optimistic updates and just refetching after POST success (the dialog closes, a 200ms delay for the refetch is acceptable). But the design specifies optimistic updates, so the plan follows the design. No scope creep detected.

### 9. Verifiability (8/10)
Every AC has a concrete verification method (specific test assertions, not "write a test"). The protected-tests list names 5 files. Test-before-implementation ordering is maintained (T2/T3/T4 integration tests are specified before T5/T6 component tests). Deductions: (1) the E2E spec (T7) requires seed data but the plan does not specify whether E2E uses page.route() mocks (hermetic) or a real seeded DB. Existing E2E specs in the codebase use `page.route()` mocks, so the builder will likely follow that pattern, but the plan should state it. (2) The plan does not specify whether `BetCreateDialog.stories.tsx` (T5) covers all states or just the happy path.

---

## Verdict

Score 8/10. The plan is above the 7-threshold and advances to build. The WARNINGs (W-1 through W-4) are implementation-detail gaps that the builder can resolve during the test-writing phase. None of them represent architectural misjudgments or missing contracts — they are specification precision issues. The plan's structure, reconciliation table, and design-it-twice sections are strong. Ship it.
