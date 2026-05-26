# Q3 Architecture Plan — Human-Created Bets

**Fixed inputs:**
- Concept: `plans/Q3/concept.md` (all nouns stable, no concept changes)
- Design: `plans/Q3/design/approved.md` (modal dialog, KnowledgeCreateDialog pattern)

---

## Required reading (for the builder)

- `plans/Q3/concept.md` — concept confirmation, observations 1-5
- `plans/Q3/design/approved.md` — visual contract, component mapping, data flow
- `packages/server/src/routes/bets.ts` — POST /api/bets (createBetSchema), GET /api/bets/canvas, deriveTitleFromPitch()
- `packages/server/src/services/product-team.ts` — loadProductTeam(db, productId)
- `packages/db/src/schema.ts` lines 63-100 — bets table
- `packages/shared/src/types/money.ts` — WireMoney, CurrencyCode, CURRENCY_CODES, CURRENCY_SCALE
- `packages/shared/src/product.ts` — ProductListItem, ProductListResponse
- `packages/web/src/shell/Canvas.tsx` — CanvasBet interface, Canvas component
- `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx` — dialog pattern reference
- `packages/web/src/hooks/useProducts.ts` — products fetch hook
- `packages/web/src/pages/WorkBet.tsx` — bet detail page (pitch rendering via deriveBlocks)
- `packages/server/src/middleware/auth.ts` — HyperIdleEnv, c.get("userId")
- `packages/server/src/test-utils.ts` — createTestApp

---

## Phase 0 — Interrogation (resolved)

**Q1: Where does Canvas render in production?**
Canvas is in `packages/web/src/shell/Canvas.tsx` but no production page mounts it. The router has no `/work/canvas` route. The spec says "from the Work Canvas" which implies a page hosts Canvas. **Decision:** Do not create a new route. Instead, mount the Canvas on WorkPortfolio.tsx below the product grid and above the ArtifactSection. This is the natural location -- the founder is on the Work view, sees their products, then sees the Canvas below. The Canvas section is collapsible via DaisyUI `collapse`.

**Q2: GET /api/bets/canvas returns raw rows without title/product enrichment. Canvas expects `CanvasBet` with title + product name.**
The canvas endpoint (line 158-175) returns raw bet rows directly from `db.select().from(bets).all()`. The `CanvasBet` interface needs `title: string` and `product: string` (display names). **Decision:** Enrich the canvas endpoint server-side (like the detail endpoint does) with `deriveTitleFromPitch()` for title and a products join for product name. Also add `costAppetite` as WireMoney for appetite display.

**Q3: How does the PATCH flow work for post-creation editing (AC-6)?**
The existing PATCH /api/bets/:id handles `done_condition`, `hypothesis`, and `cost_appetite` fields. It does NOT handle `pitch` edits. **Decision:** Add `pitch` to the mutable fields set. The PATCH handler already has the discriminated union pattern; add a fourth branch for `field: "pitch"` with `value: string`.

**Q4: Where does the Canvas live in the page hierarchy for E2E testing?**
E2E tests need to navigate to a page that shows the Canvas. Since Canvas will be on WorkPortfolio, the test navigates to `/work/portfolio`. **Decision:** Canvas section is always visible on WorkPortfolio (not behind a tab or toggle). It sits between the product grid and the artifact gallery.

---

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| "New pitch action accessible from Work Canvas" | Canvas is not mounted on any production page | Mount Canvas on WorkPortfolio.tsx (T1) |
| "PitchCard appears in shaped column" | Canvas uses BetCard, not PitchCard. PitchCard needs hypothesis/proposer the bets table doesn't carry | Use BetCard (design decision, confirmed in approved.md) |
| POST /api/bets requires `teamId` | `createBetSchema` has `teamId: z.string()` (required) | Make `teamId` optional; server derives from productId (T2) |
| "Version history tracks both human and agent edits" | POST /api/bets does not seed `revisionLog` | Seed initial revision entry on POST (T2) |
| GET /api/bets/canvas returns enriched data | Returns raw bet rows (no title, no product name) | Enrich canvas endpoint (T3) |
| "Founder can edit pitch body post-creation" | PATCH /api/bets/:id does not support `field: "pitch"` | Add pitch to mutable fields (T4) |
| `CanvasBet.appetite` is a display string | Canvas endpoint returns raw costAppetiteMinor/Currency | Enrich response with formatted appetite (T3) |
| "Empty pitch body -> validation error" | createBetSchema validates `pitch: z.string()` — allows empty string | Add `.min(1)` to pitch validation (T2) |

---

## Acceptance criteria with verification

| # | Criterion | Verification |
|---|---|---|
| AC1 | "New pitch" `+` button visible in Canvas Shaped column header | Vitest: render Canvas, assert button with `aria-label="New pitch"` is in the document. Playwright: navigate to `/work/portfolio`, assert `+` button visible in Shaped column. |
| AC2 | Creation form: product picker, pitch textarea, optional appetite | Vitest: render BetCreateDialog, assert `<select>` with product options, `<textarea>`, number input, currency select are present. |
| AC3 | Submit creates bet via POST /api/bets with status=shaped | Integration test: POST with productId + pitch, assert 201, response has status="shaped", teamId is populated from product's team. |
| AC4 | New bet appears as BetCard in Shaped column immediately | Playwright: create pitch from dialog, assert new BetCard title appears in shaped column within 2s. |
| AC5 | Pitch body renders as markdown in bet detail | Playwright: create pitch with markdown body, navigate to bet detail, assert markdown-rendered content (e.g., `<strong>` tag from `**bold**`). |
| AC6 | Founder can edit pitch body post-creation | Integration test: PATCH /api/bets/:id with field="pitch", value="new content", reason="edited". Assert 200, response pitch updated, revisionLog has entry. |
| AC7 | Agent can subsequently edit — version history tracks both | Integration test: POST bet (actor=founder), PATCH pitch (actor=agent-id). Assert revisionLog has 2 entries with different actors. |
| AC8 | teamId auto-assigned from product's team | Integration test: POST with productId only (no teamId). Assert response teamId matches the team row WHERE product_id = productId. |
| AC9 | Create with no appetite shows "--" (not $0) | Vitest: render BetCard with appetite="--". Playwright: create pitch with no appetite, assert appetite displays "--" on the card. |
| AC10 | Empty pitch body -> validation error, no submit | Vitest: render dialog, clear pitch, click Create, assert error message visible, assert no fetch called. Integration test: POST with empty pitch, assert 400. |
| AC11 | `bun run check` + `bun run lint` + `bun run test` all green | Run `bun run verify` at the end. |

---

## Type signatures and schemas

### Server: updated createBetSchema

```typescript
// packages/server/src/routes/bets.ts
const createBetSchema = z
  .object({
    productId: z.string().min(1),
    teamId: z.string().optional(),  // <-- was required, now optional
    pitch: z.string().min(1),       // <-- added .min(1) for empty body rejection
    costAppetite: wiremoneySchema.nullable().optional(),
    doneCondition: z.string().optional(),
    hypothesis: z.string().optional(),
  })
  .strict();
```

### Server: updated POST /api/bets handler

```typescript
// In the POST handler, after validation:
// 1. Resolve teamId from productId if not provided
const teamId = body.teamId ?? loadProductTeam(db, body.productId).id;

// 2. Seed revisionLog with initial creation entry
const initialRevision = [{
  timestamp: now,
  field: "created",
  old_value: null,
  new_value: null,
  reason: "Bet created",
  actor: c.get("userId"),
}];

db.insert(bets).values({
  id,
  productId: body.productId,
  teamId,
  pitch: body.pitch,
  // ... existing fields ...
  revisionLog: JSON.stringify(initialRevision),
}).run();
```

### Server: pitch added to PATCH mutable fields

```typescript
// packages/server/src/routes/bets.ts — new union member
const updateBetPitchSchema = z.object({
  field: z.literal("pitch"),
  value: z.string().min(1),
  reason: z.string(),
});

const updateBetSchema = z.discriminatedUnion("field", [
  updateBetStringFieldSchema,
  updateBetCostAppetiteSchema,
  updateBetPitchSchema,         // <-- new
]);
```

### Server: enriched canvas response

```typescript
// packages/server/src/routes/bets.ts — GET /bets/canvas
// Each bet row enriched with derived title + product name + formatted appetite
interface CanvasBetWire {
  id: string;
  title: string;                    // deriveTitleFromPitch(pitch, id)
  product: string;                  // products.name via join
  productId: string;
  status: "shaped" | "committed";
  appetite: string;                 // formatMoney(costAppetite) or "--"
  costAppetite: WireMoney | null;
  progress: { done: number; total: number };
}

interface CanvasResponse {
  shaped: CanvasBetWire[];
  committed: CanvasBetWire[];
  capacity: { used: number; max: number };
}
```

### Shared: MUTABLE_BET_FIELDS update

```typescript
// packages/shared/src/types.ts
export const MUTABLE_BET_FIELDS = [
  "done_condition",
  "hypothesis",
  "cost_appetite",
  "pitch",           // <-- new
] as const;
```

### Web: BetCreateDialog props

```typescript
// packages/web/src/pages/work/BetCreateDialog.tsx
export interface BetCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (bet: CanvasBetWire) => void;
  products: Array<{ id: string; name: string }>;
}
```

### Web: Canvas gains onNewPitch prop

```typescript
// packages/web/src/shell/Canvas.tsx
export interface CanvasProps {
  bets: CanvasBet[];
  capacity: number;
  onMoveBet: (betId: string, targetStatus: "shaped" | "committed") => void;
  onNewPitch?: () => void;  // <-- new optional prop
}
```

### Web: useCanvasBets hook

```typescript
// packages/web/src/hooks/useCanvasBets.ts
export interface UseCanvasBetsResult {
  shaped: CanvasBet[];
  committed: CanvasBet[];
  capacity: { used: number; max: number };
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  addOptimistic: (bet: CanvasBet) => void;
  removeOptimistic: (tempId: string) => void;
}

export function useCanvasBets(): UseCanvasBetsResult;
```

---

## Ordered task list

### T1: Mount Canvas on WorkPortfolio (frontend wiring)

**Files:**
- `packages/web/src/pages/WorkPortfolio.tsx` — add Canvas section
- `packages/web/src/hooks/useCanvasBets.ts` — new hook for GET /api/bets/canvas

**Work:**
1. Create `useCanvasBets` hook: fetches GET /api/bets/canvas, returns shaped/committed/capacity + refetch + optimistic helpers.
2. In WorkPortfolio, import Canvas and useCanvasBets. Render Canvas below the product grid, above ArtifactSection.
3. The Canvas section has a heading: `<h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">Canvas</h2>`
4. Wire `onMoveBet` to POST /api/bets/:id/commit (or reverse transition) with refetch on success.

**Tests:**
- `packages/web/src/hooks/__tests__/useCanvasBets.test.ts` — mock fetch, assert shaped/committed split, assert refetch.
- `packages/web/src/__tests__/WorkPortfolio.canvas.test.tsx` — render WorkPortfolio with mocked useCanvasBets, assert Canvas renders with bet cards.

**Dependencies:** T3 (enriched canvas endpoint must exist first for the hook to work).

### T2: API changes — teamId optionality + revisionLog seeding + pitch validation

**Files:**
- `packages/server/src/routes/bets.ts` — update createBetSchema, POST handler
- `packages/shared/src/types.ts` — update MUTABLE_BET_FIELDS if pitch mutable constant is defined there

**Work:**
1. Make `teamId` optional in `createBetSchema`: `teamId: z.string().optional()`.
2. Add `.min(1)` to `pitch` in `createBetSchema`.
3. In POST handler: resolve `teamId` via `loadProductTeam(db, body.productId).id` when `body.teamId` is undefined.
4. Seed `revisionLog` with initial creation entry including `c.get("userId")` as actor.
5. Verify `productId` references a real product before team lookup (return 400 if not found, not 500 from loadProductTeam).

**Tests:**
- `packages/server/src/__tests__/bets.q3.test.ts` — new test file:
  - POST with productId only (no teamId) → 201, response.teamId matches product's team
  - POST with empty pitch → 400
  - POST with both productId and teamId → 201, uses provided teamId
  - POST with invalid productId → 400 (not 500)
  - POST → response.revisionLog has initial creation entry with actor

**Dependencies:** None (standalone API change).

### T3: Enrich GET /api/bets/canvas endpoint

**Files:**
- `packages/server/src/routes/bets.ts` — update canvas handler

**Work:**
1. Join bets with products to get product name.
2. Call `deriveTitleFromPitch()` for each bet.
3. Format appetite: `costAppetiteMinor != null && costAppetiteCurrency != null ? formatMoney({minor, currency}) : "--"`.
4. Count tasks per bet for progress (or return `{done: 0, total: 0}` if task counting is deferred — check if the existing canvas endpoint already includes task data. Currently it does NOT include tasks. For Q3 MVP, progress is `{done: 0, total: 0}` for all shaped bets since shaped bets have no tasks yet. Committed bets may have tasks; join if needed, or defer to existing bet detail endpoint.)
5. Return `CanvasBetWire[]` shape for both shaped and committed arrays.

**Tests:**
- `packages/server/src/__tests__/bets.q3.test.ts` (same file as T2):
  - GET /api/bets/canvas → response.shaped[0] has title, product (name), appetite (formatted), status
  - GET /api/bets/canvas with no bets → `{shaped: [], committed: [], capacity: {used: 0, max: 0}}`

**Dependencies:** None (standalone API change, but T1 consumes the output).

### T4: Add pitch to PATCH mutable fields

**Files:**
- `packages/server/src/routes/bets.ts` — add updateBetPitchSchema to discriminated union, handle in PATCH
- `packages/server/src/services/bet-state-machine.ts` — add "pitch" to MUTABLE_FIELDS set if it gates there
- `packages/shared/src/types.ts` — add "pitch" to MUTABLE_BET_FIELDS

**Work:**
1. Define `updateBetPitchSchema = z.object({ field: z.literal("pitch"), value: z.string().min(1), reason: z.string() })`.
2. Add to `updateBetSchema` discriminated union.
3. In PATCH handler: when `body.field === "pitch"`, update `bets.pitch` directly (similar to cost_appetite handling), add revisionLog entry.
4. Update `bet-state-machine.ts` MUTABLE_FIELDS if it gates pitch mutability.

**Tests:**
- `packages/server/src/__tests__/bets.q3.test.ts`:
  - PATCH with field="pitch", value="# New Title\nNew body" → 200, response.pitch updated
  - PATCH with field="pitch", empty value → 400
  - revisionLog has entry with old_value (old pitch), new_value, reason, actor

**Dependencies:** None.

### T5: BetCreateDialog component

**Files:**
- `packages/web/src/pages/work/BetCreateDialog.tsx` — new file
- `packages/web/src/pages/work/BetCreateDialog.stories.tsx` — new file

**Work:**
1. Follow KnowledgeCreateDialog pattern exactly (native `<dialog>`, showModal/close, form state reset on open).
2. Fields: product select (from props.products), pitch textarea, appetite (number + currency select).
3. Client-side title preview: apply `deriveTitleFromPitch` logic (strip `#{1,6}\s+`, first non-empty line, 60 char max).
4. On submit: convert amount from major units to minor units via `CURRENCY_SCALE`. Call POST /api/bets via `apiFetch`.
5. On success: call `onCreated(bet)` with the server response mapped to CanvasBet shape.
6. On error: show error message, keep dialog open.
7. Validation: product required, pitch non-empty. Disable Create button when invalid or submitting.

**Tests:**
- `packages/web/src/__tests__/BetCreateDialog.test.tsx`:
  - Renders all form fields
  - Product select populated with provided products
  - Pitch textarea shows placeholder
  - Title preview updates as user types pitch
  - Empty pitch body disables Create button
  - No product selected disables Create button
  - Submit calls apiFetch with correct POST body (productId, pitch, costAppetite as WireMoney or omitted)
  - Major-to-minor conversion: $500 USD → {minor: 50000, currency: "USD"}
  - JPY amount 1000 → {minor: 1000, currency: "JPY"} (scale 0)
  - No appetite entered → costAppetite not in body
  - Error response shows error message
  - Cancel closes dialog
  - ESC closes dialog

**Dependencies:** T2 (API must accept optional teamId).

### T6: Wire BetCreateDialog into Canvas + WorkPortfolio

**Files:**
- `packages/web/src/shell/Canvas.tsx` — add `onNewPitch` prop, render `+` button
- `packages/web/src/pages/WorkPortfolio.tsx` — manage dialog open state, wire callbacks

**Work:**
1. Canvas component: add `onNewPitch?: () => void` to CanvasProps. In the Shaped column header, render `<button onClick={onNewPitch}>+</button>` (btn btn-ghost btn-xs, aria-label="New pitch"). Only render when `onNewPitch` is provided.
2. WorkPortfolio: manage `[dialogOpen, setDialogOpen]` state. Pass `onNewPitch={() => setDialogOpen(true)}` to Canvas. Render BetCreateDialog with open={dialogOpen}, products from useProducts(), onCreated handler that adds bet to canvas and refetches.
3. Optimistic update: on `onCreated`, add the bet to useCanvasBets' local state immediately, then trigger background refetch.
4. If the refetch reveals the bet was not persisted (edge case: network partition), remove the optimistic entry and show error.

**Tests:**
- `packages/web/src/__tests__/Canvas.q3.test.tsx`:
  - Canvas with onNewPitch prop renders `+` button with aria-label="New pitch"
  - Canvas without onNewPitch prop does NOT render `+` button (backward compat)
  - Click `+` calls onNewPitch
- `packages/web/src/__tests__/WorkPortfolio.canvas.test.tsx` (extends T1 test):
  - Click `+` in Canvas opens BetCreateDialog
  - Complete dialog submission adds BetCard to shaped column

**Dependencies:** T1 (Canvas on WorkPortfolio), T5 (BetCreateDialog exists).

### T7: Playwright E2E tests

**Files:**
- `packages/web/e2e/Q3-bet-creation.spec.ts` — new file

**Work:**
1. Navigate to `/work/portfolio`.
2. Assert Canvas section visible with Shaped and Committed column headers.
3. Click `+` (New pitch) in Shaped column.
4. Assert dialog opens with product select, pitch textarea, appetite inputs.
5. Select product "Nimmly" (requires E2E seed data with a product).
6. Type markdown pitch: `# Test Pitch\nThis is a **bold** pitch.`
7. Assert title preview shows "Test Pitch".
8. Enter appetite: 500, USD.
9. Click Create.
10. Assert dialog closes.
11. Assert BetCard with title "Test Pitch" appears in Shaped column.
12. Click the bet card to navigate to bet detail.
13. Assert pitch renders as markdown (bold text visible).
14. Validation test: open dialog, leave pitch empty, click Create → error shown, dialog stays open.
15. No-appetite test: create pitch with no amount → card shows "--" for appetite.

**Dependencies:** T6 (full stack wired).

### T8: Verify

**Work:**
1. Run `bun run verify` (check + lint + test).
2. Ensure all existing tests pass (no regressions).
3. Ensure all new tests pass.

**Dependencies:** All previous tasks.

---

## Task dependency graph

```
T2 (API: teamId, revisionLog, pitch validation)  ───────┐
T3 (API: enrich canvas endpoint)  ───────────────────────┤
T4 (API: pitch mutable field)  ──────────────────────────┤
                                                          │
T1 (Mount Canvas on WorkPortfolio) ──── requires T3 ─────┤
T5 (BetCreateDialog component) ──── requires T2 ─────────┤
                                                          │
T6 (Wire dialog into Canvas+Portfolio) ── requires T1,T5 ─┤
                                                          │
T7 (E2E tests) ──────────────── requires T6 ─────────────┤
                                                          │
T8 (Verify) ─────────────────── requires all ─────────────┘
```

Parallelizable: T2 + T3 + T4 can run simultaneously.
Then: T1 + T5 can run simultaneously (T1 needs T3 done, T5 needs T2 done).
Then: T6 (needs T1 + T5).
Then: T7, T8.

---

## Risks and mitigations

### Risk 1: loadProductTeam throws 500 on invalid productId
**Impact:** If the frontend sends a bad productId, the server returns 500 instead of 400.
**Mitigation:** Add a product existence check before calling `loadProductTeam`. If the product doesn't exist, return 400 with "Product not found". The `loadProductTeam` 500 is reserved for invariant violations (product exists but team is missing).

### Risk 2: Optimistic update + drag-drop interaction
**Impact:** If the user drags an optimistic (pending) BetCard before the POST completes, dnd-kit fires onDragEnd with a temporary ID. The commit transition would fail.
**Mitigation:** Disable drag on optimistic cards. The DraggableBetCard component checks if `bet.id.startsWith("pending-")` and sets `disabled: true` on the useDraggable hook.

### Risk 3: Canvas data freshness after creation
**Impact:** After creating a bet, the Canvas might show stale data if another bet was created/moved concurrently.
**Mitigation:** The `onCreated` callback adds the new bet optimistically AND triggers a background refetch via `useCanvasBets().refetch()`. The refetch replaces the entire local state with server truth.

### Risk 4: Money input allows negative or non-integer values
**Impact:** User enters -500 or 12.50, producing invalid WireMoney.
**Mitigation:** Input has `min="0" step="1"` attributes. Client-side validation rejects negative values. The conversion to minor units uses `Math.round(amount * 10^scale)` to handle any floating-point edge cases. Server-side Zod schema already validates `minor: z.number().int().min(0)`.

### Risk 5: Existing Canvas tests break
**Impact:** Adding `onNewPitch` prop to Canvas changes its interface.
**Mitigation:** `onNewPitch` is optional. Existing tests that don't pass it see no change. The `+` button only renders when `onNewPitch` is provided.

---

## Security and abuse cases

| Concern | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST /api/bets | Yes | Existing API-key auth gates all requests. No additional rate limit needed for v1 (single founder, single concurrent user). If multi-user, add per-user rate limit later. |
| Input-trust boundary for pitch field | Yes | Pitch is stored as-is and rendered via `deriveBlocks()` → `<Block />` which uses a markdown renderer. The markdown renderer must sanitize HTML (existing behavior from L16). No new XSS vector. |
| Secret handling | N/A | No new credentials or secrets. |
| Path traversal | N/A | No file path inputs. |
| SSRF | N/A | No outbound URLs. |
| IDOR on product selection | Low | User can only select products returned by GET /api/products, which is already auth-gated. Submitting a productId the user shouldn't access is mitigated by the API key auth (single founder model). |

---

## Protected tests

These existing test files must not have their assertions changed (only additive assertions allowed):

```
protectedTests:
  - packages/server/src/__tests__/bets.test.ts
  - packages/web/src/__tests__/Canvas.test.tsx
  - packages/web/src/__tests__/WorkPortfolio.test.tsx
  - packages/web/src/__tests__/PitchCard.test.tsx
  - packages/web/src/__tests__/BetCard.test.tsx
```

---

## Migrations

### Symbol renames/moves

| Symbol | Current location | Change | Affected files |
|---|---|---|---|
| `createBetSchema.teamId` | `bets.ts:39` | `z.string()` → `z.string().optional()` | `bets.ts` (schema + POST handler). No other file imports this schema directly. |
| `MUTABLE_BET_FIELDS` | `shared/types.ts:32` | Add `"pitch"` | `shared/types.ts`, `server/services/bet-state-machine.ts` (if it reads this constant), `bets.ts` (route handler). |

### New files

| File | Purpose |
|---|---|
| `packages/web/src/pages/work/BetCreateDialog.tsx` | Creation dialog component |
| `packages/web/src/pages/work/BetCreateDialog.stories.tsx` | Stories for design system viewer |
| `packages/web/src/hooks/useCanvasBets.ts` | Canvas data hook |
| `packages/web/src/hooks/__tests__/useCanvasBets.test.ts` | Hook tests |
| `packages/web/src/__tests__/BetCreateDialog.test.tsx` | Dialog unit tests |
| `packages/web/src/__tests__/Canvas.q3.test.tsx` | Canvas Q3-specific tests |
| `packages/server/src/__tests__/bets.q3.test.ts` | API tests for Q3 changes |
| `packages/web/e2e/Q3-bet-creation.spec.ts` | Playwright E2E |

### No DB migration needed

The bets table schema is unchanged. The revisionLog column already exists as nullable text. The teamId column already exists. No DDL changes.

---

## Design-it-twice: teamId resolution

### Option A: Server-side resolution (chosen)

Make `teamId` optional in createBetSchema. Server calls `loadProductTeam(db, productId).id` when teamId is absent.

**Trade-off:** Requires adding product existence validation before the team lookup (loadProductTeam throws 500 on missing product, not 400). One extra DB query on creation.

**Why chosen:** Keeps internal team IDs out of the frontend. Eliminates a class of bugs where the client sends a wrong teamId. The L13 lore says "team_id is an internal join key not surfaced in URLs or copy."

### Option B: Client-side resolution (rejected)

Extend ProductListItem with `teamId`. Frontend fetches products, selects one, sends both productId and teamId.

**Trade-off:** Exposes team IDs to the wire format. Frontend must ensure teamId matches productId. If the products cache is stale, the wrong teamId could be sent.

**Why rejected:** Violates L13 invariant (team_id is internal). Adds a coupling surface between the products list response and the bet creation form.

---

## Design-it-twice: pitch mutable field handling

### Option A: Add to bet-state-machine (rejected)

Route all pitch edits through `updateBetField()` in bet-state-machine.ts, extending the MUTABLE_FIELDS set and the status guard.

**Trade-off:** Consistent with existing done_condition/hypothesis flow. But pitch should be mutable in more statuses than just `in_progress` — a shaped bet should also have its pitch editable.

**Why rejected:** The state machine's MUTABLE_IN_STATUSES is `{in_progress, paused, behind, blocked}` and explicitly excludes `shaped`. A founder creating a bet at `shaped` status needs to edit the pitch immediately. Routing through the state machine would require widening MUTABLE_IN_STATUSES for pitch only, creating an inconsistency.

### Option B: Handle pitch directly in PATCH route (chosen)

Similar to how `cost_appetite` is handled directly (line 353-394 in bets.ts), handle `pitch` directly in the PATCH route. The pitch-specific handler allows editing in all statuses except `shipped` and `killed`.

**Trade-off:** Pitch edit logic is in the route, not the service. But cost_appetite already established this precedent.

**Why chosen:** Follows the existing precedent (cost_appetite). Allows pitch edits in `shaped` status (which the state machine doesn't support). Keeps the blast radius small — one new `if` branch in the PATCH handler.

**Mutable-in statuses for pitch:** `shaped`, `committed`, `in_progress`, `paused`, `behind`, `blocked`, `review`. NOT `shipped` or `killed` (immutable once finalized).
