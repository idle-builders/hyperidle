# Q3 Approved Design — Bet Creation Dialog

**Variant:** Modal dialog (routine, single variant — follows KnowledgeCreateDialog pattern)

---

## 1. User story (one sentence)

A founder opens a modal from the Canvas Shaped column header, fills product + pitch + optional appetite, and submits to create a shaped bet that appears instantly.

## 2. Entry point

A `+` button in the Shaped column header, inline with the "Shaped" label. The button uses DaisyUI `btn btn-ghost btn-xs` (same chrome weight as the PitchSelector close button). Label: `+` with `aria-label="New pitch"`.

```
┌─ Shaped ──────────────────────┐  ┌─ Committed ─── 2 / 4 ────────┐
│  [+]                          │  │                                │
│  ┌──────────────────────────┐ │  │  ┌──────────────────────────┐  │
│  │ BetCard: "Nimmly push…"  │ │  │  │ BetCard: "Alya pricing"  │  │
│  └──────────────────────────┘ │  │  └──────────────────────────┘  │
│  ┌──────────────────────────┐ │  │                                │
│  │ BetCard: "Speed dial UX" │ │  │                                │
│  └──────────────────────────┘ │  │                                │
└───────────────────────────────┘  └────────────────────────────────┘
```

The `+` button sits at the RIGHT side of the column header row (flex `justify-between` on the header). It is visible in both empty and populated Canvas states. When Canvas is empty (EmptyState), the button still appears in what would be the Shaped column header.

## 3. Dialog layout

Native `<dialog>` element. Same dimensional constraints as KnowledgeCreateDialog:
- `min-w-[320px] max-w-[480px] w-full`
- `aria-modal="true"` `aria-label="New pitch"`

### Form fields (top to bottom)

```
┌─────────────────────────────────────────┐
│  NEW PITCH                              │  ← h2, text-sm font-heading uppercase
│                                         │
│  Product (required)                     │  ← label, text-xs text-[var(--text-lo)]
│  ┌─────────────────────────────────┐    │
│  │ ▼ Select a product              │    │  ← select select-bordered select-sm
│  └─────────────────────────────────┘    │
│                                         │
│  Pitch (required)                       │  ← label, text-xs text-[var(--text-lo)]
│  ┌─────────────────────────────────┐    │
│  │                                 │    │  ← textarea textarea-bordered text-base
│  │  Markdown. First line becomes   │    │     resize-none h-40 (160px, taller than
│  │  the bet title.                 │    │     KnowledgeCreateDialog's h-32 because
│  │                                 │    │     pitch is the primary content)
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Title preview                          │
│  ┌─────────────────────────────────┐    │
│  │ "Nimmly push notifications"     │    │  ← derived title, text-sm text-[var(--text-mid)]
│  └─────────────────────────────────┘    │     only shown when pitch has a non-empty
│                                         │     first line; applies deriveTitleFromPitch
│  Appetite (optional)                    │     logic client-side for preview
│  ┌──────────────┐ ┌───────────────┐    │
│  │ 500          │ │ ▼ USD        │    │  ← input input-bordered input-sm [w-24]
│  └──────────────┘ └───────────────┘    │     + select select-bordered select-sm [w-20]
│  Amount in major units (e.g. $500)      │     inline flex row, gap-2
│                                         │
│  ⚠ Validation error message             │  ← text-xs text-error, role="alert"
│                                         │
│                    [Cancel]  [Create]    │  ← btn btn-xs btn-ghost / btn-xs btn-primary
└─────────────────────────────────────────┘
```

### Field details

**Product picker** (`<select>`):
- Flat DaisyUI `select select-bordered select-sm`
- Options populated from `useProducts()` hook: `products.map(p => <option value={p.id}>{p.name}</option>)`
- First option is placeholder: `<option value="" disabled selected>Select a product</option>`
- No search/combobox needed -- founders manage a small product portfolio (typically 1-5 products)

**Pitch textarea**:
- `textarea textarea-bordered text-base resize-none h-40 w-full`
- `text-base` (16px) for iOS Safari zoom mitigation (AQ-005)
- Placeholder: `"Describe your pitch in markdown.\nFirst line becomes the bet title."`
- No character limit (pitch is freeform markdown)

**Title preview**:
- Appears below the textarea only when the first non-empty line of pitch exists
- Client-side derivation: strip leading `#{1,6}\s+`, take first 60 chars
- `text-sm text-[var(--text-mid)]` -- secondary, not competing with the textarea
- Prefix with a muted "Title:" label so the preview reads as "Title: Nimmly push notifications"
- If pitch is empty or first line is only whitespace, this section is hidden (not blank)

**Appetite input** (optional):
- Two-field inline row: amount input + currency select
- Amount: `<input type="number" min="0" step="1" />` with `input input-bordered input-sm` and explicit width `w-24`
- Currency: `<select>` with `select select-bordered select-sm` and width `w-20`
- Default currency: USD (first in CURRENCY_CODES)
- Hint text below: `text-xs text-[var(--text-lo)]` "Amount in major units (e.g. $500)"
- The form converts major-unit user input to minor units before submission: `minor = amount * 10^scale`
- When amount is empty/zero, costAppetite is omitted from the POST body (not sent as `{minor: 0, currency: "USD"}`)
- `font-variant-numeric: tabular-nums` on the amount input (AQ-006)

## 4. States

### Empty (no bets on Canvas)
- Canvas shows EmptyState as today
- The `+` button still appears above the EmptyState in a minimal header strip
- Clicking `+` opens the dialog normally

### Dialog open
- Form fields reset on open (same pattern as KnowledgeCreateDialog)
- Focus trapped inside dialog (native `<dialog>` behavior)
- Initial focus on product select
- ESC closes dialog (native behavior, plus explicit Cancel button)

### Validation
- **Required fields:** product (must not be placeholder), pitch (must have non-empty trimmed body)
- **Validation timing:** on submit attempt only (not on blur -- matches KnowledgeCreateDialog)
- **Empty pitch body:** error message "Pitch body is required" below the textarea
- **No product selected:** error message "Select a product" below the select
- **Create button disabled:** when submitting is true OR required fields are empty
- Validation error: `text-xs text-error` with `role="alert"`

### Submitting
- Create button shows "..." (same as KnowledgeCreateDialog)
- All fields disabled
- Cancel button disabled

### Success
- Dialog closes
- Parent calls `onCreated(newBet)` callback
- New bet appears in Shaped column as a BetCard
- Optimistic: the bet is added to the local bets array immediately with data from the form (product name from the selected option text, derived title, appetite formatted as display string). On POST response: replace with server-returned data.

### Error (POST failure)
- Dialog stays open
- Error message shown: `text-xs text-error` with the server error or "Failed to create bet"
- User can retry or cancel

### Optimistic failure (response was non-2xx after dialog closed)
- Remove the optimistic BetCard from the Shaped column
- Show an inline error below the column header (not a toast -- toasts aren't in the component budget)
- Error text: "Failed to create pitch. Try again." with a retry action (re-opens dialog with previous field values)

## 5. Behavior

### Keyboard
- `Tab` cycles through form fields in order: product -> pitch -> amount -> currency -> Cancel -> Create
- `Enter` in amount input does NOT submit (default browser behavior for `<input type="number">` in a `<dialog>`)
- `Escape` closes dialog (native `<dialog>` behavior)
- No custom keyboard shortcuts in the dialog

### Focus management
- On dialog open: focus moves to product select (first interactive element)
- On dialog close: focus returns to the `+` button in the Shaped column header
- Focus trap is handled by native `<dialog>` -- no custom trap needed

### Motion
- Dialog open: native `<dialog>` showModal (no custom animation -- browsers provide a fade)
- Optimistic BetCard insertion: no animation (card just appears in the list). This is intentional -- animation on list insertion conflicts with dnd-kit's own motion system.

### Mobile adaptation (viewport <= 1024px)
- Dialog stretches to near-full-width (max-w-[480px] is already mobile-safe)
- `text-base` inputs prevent iOS Safari zoom
- Touch targets: all buttons meet 44px minimum (btn-xs with padding meets this)
- The `+` button in the column header: increase hit area via `p-2` on mobile (visible via responsive class `sm:p-0 p-2`)

## 6. Component mapping

| UI element | Component | Props / Classes |
|---|---|---|
| Entry button | DaisyUI `<button>` | `btn btn-ghost btn-xs`, aria-label="New pitch" |
| Dialog | Native `<dialog>` | `aria-modal="true"` aria-label="New pitch" |
| Dialog container | `<div>` | `p-4 flex flex-col gap-3 min-w-[320px] max-w-[480px] w-full` |
| Heading | `<h2>` | `text-sm font-heading font-semibold uppercase tracking-wider` |
| Field labels | `<span>` | `text-xs text-[var(--text-lo)]` |
| Product select | DaisyUI `<select>` | `select select-bordered select-sm` |
| Pitch textarea | DaisyUI `<textarea>` | `textarea textarea-bordered text-base resize-none h-40 w-full` |
| Title preview | `<div>` | `text-sm text-[var(--text-mid)]` (conditional render) |
| Amount input | DaisyUI `<input>` | `input input-bordered input-sm w-24`, type="number", tabular-nums |
| Currency select | DaisyUI `<select>` | `select select-bordered select-sm w-20` |
| Hint text | `<span>` | `text-xs text-[var(--text-lo)]` |
| Error message | `<p>` | `text-xs text-error`, role="alert" |
| Cancel button | DaisyUI `<button>` | `btn btn-xs btn-ghost` |
| Create button | DaisyUI `<button>` | `btn btn-xs btn-primary` |
| Optimistic card | `BetCard` | opacity 40%, no drag handle |
| Shaped card | `BetCard` | existing props |

## 7. Data flow (for architecture)

### Form -> API

```
User input:
  productId: string         (from select value)
  pitch: string             (from textarea)
  amount: number | null     (from number input, major units)
  currency: CurrencyCode    (from currency select)

Transform to POST body:
  productId: string
  pitch: string
  costAppetite: amount != null
    ? { minor: amount * 10^CURRENCY_SCALE[currency], currency }
    : undefined              // omit entirely, not null
  // teamId: omitted — server derives from productId
```

### API response -> Optimistic reconciliation

```
Optimistic BetCard (before response):
  id: "pending-" + crypto.randomUUID()   // temporary
  title: deriveTitleClientSide(pitch)
  product: selectedProductName            // from select option text
  status: "shaped"
  appetite: amount != null
    ? formatMoney({minor, currency})      // display string
    : "—"

Server response (201):
  Replace optimistic card with server-returned bet data
  Map to CanvasBet shape (id, title from server, product name, status, appetite)
```

## 8. Open questions for architecture

1. **teamId optionality:** POST /api/bets currently requires `teamId`. Architecture must make it optional (server derives from productId via teams table lookup). Zod schema change: `teamId: z.string().optional()`.

2. **Canvas hosting:** The Canvas component is not mounted in any production page. Architecture must decide where to render it -- likely WorkPortfolio gains a Canvas section, or a new /work/canvas route.

3. **Data refetch:** After successful creation, how does the Canvas parent re-fetch? Options: (a) optimistic local state update + background refetch, (b) SWR/query invalidation. Architecture decides.

4. **revisionLog seeding:** Per concept doc observation 1, the POST endpoint should seed `revisionLog` with an initial creation entry including actor identity for AC-7 (collaborative continuation attribution).

5. **Product-to-team lookup on server:** The server needs a `SELECT id FROM teams WHERE product_id = ?` lookup. This exists indirectly in `product-team.ts` (`loadProductTeam`) but the bet creation route doesn't use it. Architecture wires this.
