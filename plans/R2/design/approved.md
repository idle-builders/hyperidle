# R2 Design Decision: Approved Variant

## Selected: Variant 1 (Minimal Strip) with one adjustment from Variant 2

### Rationale

Variant 1 aligns precisely with the spec: "setup flow stripped to two required fields (name and API key)." The spec explicitly states "product is created silently with defaults" -- making the product name visible (V2) contradicts this.

However, V2's observation about repo path is correct: the spec says "repo path is optional" and "product name is auto-derived from package.json name or folder name if given." This means the repo path field SHOULD be visible (optional) so the user has a chance to provide it.

### Approved Design

**SetupFlow: 2 required fields + 1 optional field**

1. Name (required, text, autoFocus)
2. Anthropic API Key (required, password)
3. Repo path (optional, text with folder picker)

Product name is NOT visible. It is computed:
- If repo path given: derive from folder basename (package.json read is out of scope per constraints)
- If no repo path: "My Product"

No email field. No backend mode. No product name field. No skip button.

Start button gated on: name non-empty AND API key non-empty.

Post-submit: user creation (email omitted) -> product creation (derived name) -> credential storage -> navigate to /work/portfolio.

**WorkPortfolio: "Create bet" as primary action when no bets exist**

When the canvas has zero bets:
- Render EmptyState above the Canvas with:
  - title="Ready to shape your first bet"
  - description="A bet is a time-boxed commitment. Pitch what you want built."
  - action={<button class="btn btn-primary btn-sm">Create bet</button>}
- The button triggers the same BetCreateDialog that the Canvas "+" button opens.
- Canvas still renders below with its column structure.

**BetCreateDialog: pitch-only when single product**

- Product select hidden when `products.length === 1` (auto-resolved to `products[0].id`)
- Product select shown when `products.length > 1` (backward compatible)
- Appetite fields removed entirely
- Fields: pitch textarea + title preview only
- Dialog title: "New pitch" (unchanged)
- Create button gated on: pitch non-empty (and product selected, when visible)

### "Did we consider" checklist

- [x] What if the user has no API key yet? -- The spec makes API key required. Users must obtain one before setup. This is intentional: "without a key, agents cannot run" was already the hint text.
- [x] What if repo path points to a non-existent folder? -- Tolerate gracefully. Product name falls back to "My Product". Repo path is stored as-is; validation is not in R2 scope.
- [x] What about the existing "Skip credentials" button? -- Removed. API key is required.
- [x] What about users who already completed setup? -- FirstRunRedirect already handles this. If user + products exist, redirect to /conversations (which R2 changes to /work/portfolio). No regression.
- [x] What about the existing tests? -- Tests that assert on removed fields (email, backend mode, product name as required) will need updating. Tests that assert post-submit navigation to /conversations need updating to /work/portfolio.
- [x] What about the email field in the user schema? -- The `email` column stays in the schema (nullable). The POST /api/users endpoint currently requires email via Zod validation -- this needs to change to make email optional.
- [x] What if the user has multiple products? -- BetCreateDialog gracefully shows the product picker. The "default product" resolution only applies when exactly one product exists.
- [x] What about the "Add product" button in WorkPortfolio header? -- Keep it. It still works. Points to /onboarding which redirects appropriately.
