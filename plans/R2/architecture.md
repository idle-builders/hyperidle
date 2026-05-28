# R2 Architecture Plan: Work-First Landing

## Overview

R2 is a subtractive change. It removes fields from SetupFlow, removes the product picker from BetCreateDialog, changes the post-setup redirect, and adds a "Create bet" empty-state CTA to WorkPortfolio. No new tables, no new API endpoints, no new components.

## Affected Files

### Backend (packages/server)
1. `packages/server/src/routes/users.ts` -- make email optional in createHumanUserSchema
2. No other backend changes needed. Product creation and bet creation APIs are unchanged.

### Frontend (packages/web)
3. `packages/web/src/pages/SetupFlow.tsx` -- strip to 2 required + 1 optional fields
4. `packages/web/src/pages/work/BetCreateDialog.tsx` -- hide product picker when single product, remove appetite
5. `packages/web/src/pages/WorkPortfolio.tsx` -- add "Create bet" empty-state CTA when no bets
6. `packages/web/src/pages/FirstRunRedirect.tsx` -- change existing-user redirect to /work/portfolio
7. `packages/web/src/router.tsx` -- no changes needed (routes already exist)

### Tests (update existing)
8. `packages/web/src/__tests__/SetupFlow.test.tsx` -- rewrite to match new field set
9. `packages/web/src/__tests__/BetCreateDialog.test.tsx` -- update for removed product picker/appetite
10. `packages/web/src/__tests__/WorkPortfolio.test.tsx` -- add test for "Create bet" CTA
11. `packages/server/src/routes/__tests__/users-create.test.ts` -- update for optional email

---

## Task Plan (Ordered)

### Task 1: Make email optional in user creation API

**File:** `packages/server/src/routes/users.ts`

**Change:** In `createHumanUserSchema` (line 49-52), change email from required to optional:

```
// Current
const createHumanUserSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200),
});

// R2
const createHumanUserSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200).optional(),
});
```

**Also change:** Line 119, where email is inserted into the DB. Currently `email` is destructured and used directly. After making it optional, the value may be undefined, which is fine -- the `email` column in the users table is already nullable (text type, no `.notNull()`).

```
// Current (line 110)
const { name, email } = parsed.data;
// ... line 119:
email,

// R2 -- no change needed. Drizzle handles undefined as NULL.
```

**Test updates:** `packages/server/src/routes/__tests__/users-create.test.ts` -- add a test case that creates a user without email and verifies success. Update existing test expectations if they assert email is required.

**Risk:** Low. The email column is already nullable in the schema. PATCH /api/users/:id still accepts optional email for editing later.

---

### Task 2: Simplify SetupFlow component

**File:** `packages/web/src/pages/SetupFlow.tsx`

**Remove:**
- All `backendMode` state and related state (`serverUrl`, `sharedKey`, `testConnectionStatus`)
- `email` state, `emailError` state, `handleEmailBlur`
- `productName` state
- `handleTestConnection` callback
- `isValidEmail` function (no longer used)
- Backend Mode section (lines 142-216, the entire `<div>` with h2 "Backend Mode")
- Email field (lines 238-258)
- First Product section (lines 261-319, the h2 "First Product", product name input, repo path)
- "Skip credentials" button from footer

**Keep:**
- `name` state
- `apiKey` state
- `repoPath` state (optional field, keep state + folder picker)
- `submitting` state
- `submitError` state
- `handleFolderPick` callback
- `handleSubmit` callback (modified)

**Modify `canStart`:**
```ts
// Current
const canStart = name.trim().length > 0 && email.trim().length > 0 && productName.trim().length > 0 && !submitting;

// R2
const canStart = name.trim().length > 0 && apiKey.trim().length > 0 && !submitting;
```

**Modify `handleSubmit`:**
```ts
// Step 1: Create user -- omit email
body: JSON.stringify({ name: name.trim() })

// Step 2: Create product -- derive name from repo path or default
const derivedProductName = repoPath.trim()
  ? repoPath.trim().split("/").filter(Boolean).pop() ?? "My Product"
  : "My Product";

body: JSON.stringify({
  name: derivedProductName,
  repoPath: repoPath.trim() || undefined,
})

// Step 3: Store API key (unchanged)

// Step 4: Navigate to /work/portfolio (was /conversations)
navigate("/work/portfolio");
```

**New JSX structure:**
```
<h1>HyperIdle Setup</h1>
<form>
  <!-- Name field (autoFocus) -->
  <label>Name</label>
  <input id="setup-name" ... autoFocus />

  <!-- API Key field -->
  <label>Anthropic API Key</label>
  <input id="setup-api-key" type="password" ... />
  <p>Your agents need this to work.</p>

  <!-- Repo path (optional) -->
  <label>Project folder (optional)</label>
  <div class="relative">
    <!-- folder picker button (same as current) -->
    <input id="setup-repo" ... />
  </div>

  <!-- Error -->
  {submitError && <p>...</p>}

  <!-- Footer -->
  <div class="flex justify-end ...">
    <button type="submit" class="btn btn-primary btn-sm">Start HyperIdle</button>
  </div>
</form>
```

No section headings. Fields directly under the page title.

**Risk:** Low. Pure removal. The remaining API calls (POST /api/users, POST /api/products) are unchanged except email omission.

---

### Task 3: Simplify BetCreateDialog

**File:** `packages/web/src/pages/work/BetCreateDialog.tsx`

**Changes:**

1. **Conditional product select:** Show only when `products.length > 1`. When hidden, auto-resolve productId.

```ts
// Current
const canCreate = productId.trim().length > 0 && pitch.trim().length > 0 && !submitting;

// R2
const singleProduct = products.length === 1;
const resolvedProductId = singleProduct ? products[0].id : productId;
const canCreate = resolvedProductId.trim().length > 0 && pitch.trim().length > 0 && !submitting;
```

2. **Remove appetite fields:** Delete state for `appetiteAmount` and `appetiteCurrency`. Remove the appetite `<div>` from JSX. Remove `costAppetite` from the submit payload. Remove CURRENCY_CODES and CURRENCY_SCALE imports.

3. **Simplify submit payload:**
```ts
const payload: Record<string, unknown> = {
  productId: resolvedProductId,
  pitch: trimmedPitch,
};
// No costAppetite field
```

4. **Conditional JSX for product select:**
```tsx
{products.length > 1 && (
  <label className="flex flex-col gap-1">
    <span className="text-xs text-[var(--text-lo)]">Product <span aria-hidden>(required)</span></span>
    <select ... />
  </label>
)}
```

**Imports to remove:** `CURRENCY_CODES`, `CURRENCY_SCALE`, `CurrencyCode` from `@hyperidle/shared`.

**Props unchanged:** `BetCreateDialogProps` still accepts `products: BetProduct[]`. WorkPortfolio still passes the products list. The dialog decides whether to show the select internally.

**Risk:** Low. The server-side bet creation already handles `teamId` resolution from `productId`. No costAppetite in the payload is fine -- the field is optional in `createBetSchema`.

---

### Task 4: Add "Create bet" CTA to WorkPortfolio empty state

**File:** `packages/web/src/pages/WorkPortfolio.tsx`

**Change:** When the canvas has zero bets AND products exist, render an EmptyState with action above the Canvas.

```tsx
{/* R2: "Create bet" CTA when no bets exist */}
{items.length > 0 && canvasBets.length === 0 && (
  <EmptyState
    title="Ready to shape your first bet"
    description="A bet is a time-boxed commitment. Pitch what you want built."
    action={
      <button
        type="button"
        className="btn btn-primary btn-sm min-h-[44px]"
        onClick={() => setDialogOpen(true)}
      >
        Create bet
      </button>
    }
    dataTestId="create-bet-cta"
  />
)}
```

Insert this block between the product grid and the Canvas component.

**Condition logic:**
- `items.length > 0` -- at least one product exists (post-setup, always true)
- `canvasBets.length === 0` -- no shaped or committed bets exist

When the user creates their first bet, `refreshCanvas()` triggers and `canvasBets` becomes non-empty, hiding the CTA automatically.

**Risk:** Low. Uses existing EmptyState component with its action slot. No new components.

---

### Task 5: Change FirstRunRedirect target

**File:** `packages/web/src/pages/FirstRunRedirect.tsx`

**Change:** Line 37, change the redirect target from "/conversations" to "/work/portfolio":

```ts
// Current
setTarget(hasUser && hasProducts ? "/conversations" : "/setup");

// R2
setTarget(hasUser && hasProducts ? "/work/portfolio" : "/setup");
```

**Risk:** Low. Single-line change. Existing users who navigate to "/" will now land on WorkPortfolio instead of Conversations. The Conversations view is still accessible via the icon rail.

---

### Task 6: Update tests

**6a: SetupFlow.test.tsx** (`packages/web/src/__tests__/SetupFlow.test.tsx`)

Tests to **remove:**
- "renders BackendMode select" tests (AC-2, AC-3 from P4)
- "renders name and email fields" -- email assertion removed
- "Start button remains disabled without product name" -- product name no longer required
- "Start button remains disabled when only name is filled" -- now only need name + API key
- "Section headings: Backend Mode, Your Identity, First Product, API Credentials" -- sections removed
- "shows validation error for invalid email format" -- email removed

Tests to **add:**
- "Start button disabled when name filled but no API key"
- "Start button enabled when name and API key are filled"
- "navigates to /work/portfolio on successful submission" (was /conversations)
- "renders name and API key fields"
- "renders optional repo path field"
- "does not render email field"
- "does not render backend mode selector"
- "does not render product name field"

Tests to **update:**
- Navigation stub: add a route for /work/portfolio and update assertion

**6b: BetCreateDialog.test.tsx** (`packages/web/src/__tests__/BetCreateDialog.test.tsx`)

Tests to **remove:**
- "renders a product select field" -- hidden when single product
- "renders all provided products in the product select"
- "renders optional appetite amount input"
- "renders optional appetite currency select"
- "Create button is disabled when no product selected"
- "appetite amount field accepts decimal values"

Tests to **add:**
- "hides product select when only one product provided"
- "shows product select when multiple products provided"
- "Create button enabled with pitch only (single product)"
- "does not render appetite fields"

Tests to **keep/update:**
- Title preview tests (unchanged)
- "renders a pitch textarea" (unchanged)
- Cancel / close tests (unchanged)

**6c: WorkPortfolio.test.tsx** (`packages/web/src/__tests__/WorkPortfolio.test.tsx`)

Tests to **add:**
- "renders Create bet CTA when products exist but no bets"
- "Create bet CTA opens BetCreateDialog"
- "Create bet CTA hidden when bets exist"

**6d: users-create.test.ts** (`packages/server/src/routes/__tests__/users-create.test.ts`)

Tests to **add:**
- "creates user without email (email omitted)"
- "creates user with email (backward compatible)"

---

## Dependency Order

```
Task 1 (backend: email optional)
  |
  v
Task 2 (frontend: SetupFlow simplification)  <-- depends on Task 1 (uses updated API)
  |
  v
Task 5 (frontend: FirstRunRedirect target)    <-- independent but logical after Task 2
  |
  v
Task 3 (frontend: BetCreateDialog simplification)  <-- independent
  |
  v
Task 4 (frontend: WorkPortfolio CTA)  <-- independent
  |
  v
Task 6 (tests: update all)  <-- depends on all above
```

Tasks 3, 4, and 5 are independent of each other but all depend on the setup changes being coherent. Tests (Task 6) should be written alongside each task in TDD fashion (red-green), not as a separate final step. The ordering above is for conceptual grouping; in practice, each task includes its own test updates.

## Schema Changes

None. No new tables, no new columns, no migrations.

## API Changes

| Endpoint | Change |
|----------|--------|
| POST /api/users | `email` field becomes optional in Zod schema |
| POST /api/products | No change (name is still required) |
| POST /api/bets | No change (costAppetite already optional) |
| GET /api/bets/canvas | No change |
| GET /api/products | No change |

## Component Budget Impact

Zero. No new custom components. EmptyState (existing, Tier 1) with its action slot is used. BetCreateDialog (existing, packages/web page component) is simplified. SetupFlow (existing, packages/web page component) is simplified.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Existing tests break on removed fields | Certain | Low | Task 6 rewrites affected tests |
| User has no API key and cannot complete setup | Medium | Medium | This is by-design per spec. Users must have a key. |
| Product name "My Product" is undiscoverable | Low | Low | Editable in Settings; shown on WorkPortfolio product card |
| Multi-product users lose BetCreateDialog picker | Low | None | Picker auto-shows when products.length > 1 |
| FirstRunRedirect to /work/portfolio breaks existing workflows | Low | Low | Conversations still accessible via icon rail; no data loss |

## Out of Scope (Confirmed)

- API key validation during setup (spec says "nice-to-have, not blocking")
- Guided first-bet creation (simple dialog is sufficient)
- Settings panel changes (explicitly out of scope)
- Reading package.json from repo path to derive product name (bridge filesystem access is complex; use folder basename instead)
