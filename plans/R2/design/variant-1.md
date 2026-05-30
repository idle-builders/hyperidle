# R2 Design Variant 1: Minimal Strip

## Design Classification: Routine

R2 is removal and simplification of existing components. No new components, no new interaction patterns, no new page layouts. The design question is "what to remove and how to handle the gaps."

---

## Surface 1: SetupFlow Simplification

### Current State (4 sections, 6+ fields)

1. Backend Mode (select: local/shared + conditional URL/key/test fields)
2. Your Identity (name + email, both required)
3. First Product (product name required + repo path optional)
4. API Credentials (API key optional + "Without a key, agents cannot run" hint)

Start button gated on: name + email + product name.
Post-submit redirect: /conversations.

### Proposed State (2 sections, 2 required fields)

**Section 1: "Your Identity"**
- Name (required, text input) -- autoFocus
- No email field. Email moves to Settings only.

**Section 2: "API Key"**
- Anthropic API Key (required, password input)
- Helper text: "Your agents need this to work. Find it at console.anthropic.com."

**Removed entirely:**
- Backend Mode section (local/shared selector + URL/key/test connection)
- Email field
- First Product section (product name + repo path)
- "Skip credentials" button (API key is now required, not optional)

**Optional field (collapsed):**
- Repo path -- shown as a single text input below the API key with label "Project folder (optional)". This is how product name auto-derivation works: if a repo path is given, derive product name from package.json `name` field or folder basename. If no repo path, product name defaults to "My Product".
- Product name is NOT shown as a field. It is computed:
  - If repo path given: try to read package.json name via bridge, fall back to folder basename
  - If no repo path: "My Product"

**Start button gated on:** name + API key (both non-empty).

**Post-submit behavior:**
1. Create user (POST /api/users) with `{ name, email: undefined }` -- email is now truly optional in the user creation schema
2. Create product (POST /api/products) with `{ name: derivedProductName, repoPath: repoPath || undefined }`
3. Store API key via bridge (window.__HYPERIDLE__.credentials.set)
4. Navigate to /work/portfolio (NOT /conversations)

**Form layout:**
- Same centered column layout (max-w-md, py-16)
- Title: "HyperIdle Setup" (unchanged)
- No section headings for just 2-3 fields; use labels directly
- Footer: single "Start HyperIdle" button, right-aligned. No skip button since API key is required.

### Behavioral Notes

- autoFocus on the Name input (was previously on Backend Mode select)
- No email validation needed (field removed)
- No "Test Connection" flow (backend mode removed)
- Product creation happens silently during submit -- user never sees product name field
- If product creation fails, show error inline (same pattern as current)

---

## Surface 2: WorkPortfolio Empty State

### Current State

When `items.length === 0`:
```
EmptyState
  title="No products in the portfolio"
  description="Create your first product to start working with AI agents."
```

No action button. "Add product" button in the header bar links to /onboarding.

### Proposed State

After setup, the user has 1 product (created silently). So `items.length >= 1` always after setup. The empty state for "no products" is now unreachable in the normal flow.

The relevant empty state is now: **products exist but no bets exist**. The Canvas component already handles its own empty state via the Shaped column. But the overall page needs to make "Create bet" the most prominent action.

**Approach:** The Canvas component's "New pitch" button (the `+` in the Shaped column header triggered by `onNewPitch`) already exists. R2 makes this more prominent by:

1. When the Canvas has zero bets AND the portfolio has products, render an enhanced empty state ABOVE the Canvas that says:
   - Title: "Ready to shape your first bet"
   - Description: "A bet is a time-boxed commitment. Pitch an idea and your agents will break it down."
   - Action: `<button class="btn btn-primary btn-sm">Create bet</button>` that triggers setDialogOpen(true)

2. The existing Canvas still renders below with its column headers and the `+` button in Shaped.

3. The EmptyState component already supports an `action` slot (ReactNode). We pass the "Create bet" button as the action prop.

**Why this works:**
- "Create bet" is the most visually prominent action (btn-primary in an otherwise sparse page)
- The button appears at the natural reading position (top of the content area, after the Portfolio header)
- Does not require a new component (uses existing EmptyState with action slot)
- Canvas still visible below so the user understands the shaped/committed structure

---

## Surface 3: BetCreateDialog Simplification

### Current State (4 field groups)

1. Product select (required) -- dropdown with all products
2. Pitch textarea (required) -- h-40, markdown
3. Title preview (derived, read-only)
4. Appetite (optional) -- amount + currency

### Proposed State (2 field groups)

1. **Pitch textarea** (required) -- moved to top, h-40, markdown
   - Label: "Pitch (required)"
   - Same placeholder: "Describe the bet in markdown..."
2. **Title preview** (derived, read-only) -- same as current

**Removed:**
- Product select -- productId resolved automatically. If exactly one product exists, use it. If multiple products exist, fall back to showing the select (graceful degradation for future multi-product setups).
- Appetite fields (amount + currency) -- removed from the dialog entirely for R2. Appetite can be set later via bet detail editing.

**Dialog title:** "New pitch" (unchanged)

**Submit behavior:**
- Resolve productId: if `products.length === 1`, use `products[0].id`. If `products.length > 1`, show select (backward compatible).
- POST /api/bets with `{ productId: resolvedProductId, pitch: trimmedPitch }`
- No costAppetite in payload

**Validation:** Pitch must be non-empty. Create button gated on pitch non-empty (no product selection needed when single product).

**Props change:**
- `products` prop still passed from WorkPortfolio (needed for the fallback multi-product case)
- Dialog internally decides whether to show the product select based on `products.length > 1`

---

## Self-Critique

**Strengths:**
- Maximum removal -- truly gets to "two fields" for setup
- No new components (component budget: 0)
- Graceful degradation for multi-product (product picker returns automatically)
- Uses existing EmptyState action slot for the "Create bet" CTA

**Risks:**
- API key required at setup means there is no "browse around first" flow. Users must have an API key ready. Mitigation: the spec says "name and API key" as the two required fields, so this is by design.
- Product name defaulting to "My Product" is not great discoverability. But the spec says product name is optional with that default, so it matches.
- Removing appetite from BetCreateDialog means new bets have no cost constraint. Acceptable for a first-bet flow; appetite editing exists on the bet detail page.

**Score (self-assessed, pre-critique):**
- Hierarchy: 8 (clear primary action, minimal cognitive load)
- Spacing: 8 (existing layout tokens, less content = less density concern)
- Typography: 8 (same system, fewer labels)
- Color: 8 (btn-primary as the single accent, monochrome otherwise)
- Coherence: 9 (consistent with existing patterns, just fewer elements)
- States: 7 (need to handle: what if repo path given but package.json unreadable? graceful fallback to folder name)
- A11y: 8 (fewer fields = fewer a11y concerns, existing patterns preserved)
- Anti-slop: 9 (pure removal, no decorative additions)
- Premium polish: 7 (functional, not flashy -- appropriate for a setup flow)
