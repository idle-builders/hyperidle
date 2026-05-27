# P5 FirstTimeHints -- Approved Design

## Design decision

Hints are NOT a new component. They are a **rendering pattern** -- a `<div>` or `<p>` using existing design tokens, placed inline in each view's existing layout flow. The hint system's value is in the catalog + progress-tracking infrastructure, not in a visual primitive.

Each hint renders as a subtle inline callout using the app's existing surface/text/button vocabulary. The visual treatment is intentionally understated -- hints should feel like the app is whispering, not announcing.

---

## Visual treatment

### The hint region

```
Container:
  div.rounded-[var(--r1)]
     .bg-[var(--surface-2)]
     .p-[var(--density-card-pad)]
     .flex.flex-col.gap-[var(--density-card-gap)]

Text:
  p.text-[length:var(--density-text)]
   .text-[var(--text-mid)]
   .leading-[var(--leading-body)]

Dismiss affordance:
  button.btn.btn-ghost.btn-xs.text-[var(--text-lo)]
  Text: "Got it" or "Dismiss"
  Min touch target: 44px (AQ-015)

Optional action link:
  button.btn.btn-ghost.btn-xs.text-[var(--primary)]
  Text: action-specific (e.g., "Open Settings")
```

### Why this treatment

- **`bg-[var(--surface-2)]`** is one step up from the main content area (`surface-3`), matching the card treatment used for "Burn vs Cap", "Active Bets" sections in WorkProduct. This creates a gentle visual distinction without introducing a new surface semantic.
- **`text-[var(--text-mid)]`** is body text weight -- not de-emphasized like EmptyState descriptions (`text-lo`), but not commanding like titles (`text-hi`). The hint is conversational guidance, not a heading.
- **`btn-ghost btn-xs`** for dismiss matches the existing ghost-button pattern used throughout the app (e.g., breadcrumb chips, column header actions). Minimal chrome, no visual competition with primary actions.
- **No icon.** Icons would over-signify. The hint is just text. AQ-113 (over-iconification) applies.
- **No border.** The surface step (`surface-2` against `surface-3` context) is sufficient differentiation. Adding `border-[var(--border-subtle)]` is available as a fallback if the surface step proves insufficient during visual polish, but the default is no border.

### Density behavior

The hint region is density-aware via the tokens it consumes:
- `--density-card-pad` for padding (8/12/16 across compact/default/comfortable)
- `--density-card-gap` for internal gap (4/8/12)
- `--density-text` for text size (14/15/16)

This matches EmptyState's density behavior exactly. No new density decisions.

---

## Per-hint placement

### Hint #1 -- "Create a bet" (product page, zero bets)

**Location:** `WorkProduct.tsx`, inside the "Active Bets" section, BELOW the existing EmptyState.

**Trigger:** User has at least one product AND zero bets across all products AND hint #1 not yet dismissed.

**Layout:**
```
<section aria-label="Active bets">
  <h2>Active Bets</h2>
  <EmptyState
    title="No active bets"
    description="This product team has no bets in flight."
  />
  {/* Hint #1 renders here when triggered */}
  <div data-testid="hint-create-bet" class="[hint region]">
    <p>Create a bet to give your team something to work on.</p>
    <div class="flex gap-2">
      <button class="btn btn-ghost btn-xs text-[var(--text-lo)]">Got it</button>
    </div>
  </div>
</section>
```

**Why below EmptyState:** The EmptyState says WHAT (no bets). The hint says WHAT TO DO (create one). Placing the hint below keeps the empty state's existing role unchanged and adds guidance as a follow-up. The hint is visually subordinate to the EmptyState.

**Auto-dismiss:** When any bet is created (hint trigger condition no longer true), the hint disappears regardless of explicit dismissal.

### Hint #2 -- "Add a credential" (bet detail, first bet)

**Location:** `WorkBet.tsx`, below the bet header section, above the task list.

**Trigger:** User has created their first bet AND has no valid credential configured AND hint #2 not yet dismissed.

**Layout:**
```
{/* After bet header, before task section */}
<div data-testid="hint-add-credential" class="[hint region]">
  <p>Your team will pick this up. Add a credential in Settings if you haven't yet.</p>
  <div class="flex gap-2">
    <button class="btn btn-ghost btn-xs text-[var(--primary)]">Open Settings</button>
    <button class="btn btn-ghost btn-xs text-[var(--text-lo)]">Got it</button>
  </div>
</div>
```

**Action:** "Open Settings" navigates to the credentials section. This is a `btn-ghost` with primary text color -- the only hint with an explicit navigation action.

**Auto-dismiss:** When a valid credential is added, the hint disappears.

### Hint #3 -- "Knowledge items" (knowledge list, zero items)

**Location:** `KnowledgeList.tsx`, augmenting the existing empty state.

**Trigger:** User is viewing Knowledge list AND zero knowledge items exist AND hint #3 not yet dismissed.

**Layout:**
```
{/* Replaces or follows the existing empty state in KnowledgeList */}
<EmptyState
  title="No knowledge items yet"
  description="Agents will populate this as they learn."
/>
<div data-testid="hint-knowledge" class="[hint region]">
  <p>Knowledge items are created by your team as they work. You can also add your own.</p>
  <div class="flex gap-2">
    <button class="btn btn-ghost btn-xs text-[var(--text-lo)]">Got it</button>
  </div>
</div>
```

**Why not merge into EmptyState:** EmptyState is a permanent UI element for the empty state. The hint is transient -- it appears once and disappears forever. Merging would complicate the EmptyState component with hint-awareness. Keeping them separate respects single responsibility.

**Auto-dismiss:** When the user creates a knowledge item manually OR when agents create items, the hint disappears.

### Hint #4 -- "Review verdicts" (first review thread)

**Location:** Inside the review thread view (Conversations page), inline below the ReviewHeader verdict buttons.

**Trigger:** User sees their first review thread AND hint #4 not yet dismissed.

**Layout:**
```
{/* Below ReviewHeader, above the artifact view */}
<div data-testid="hint-review-verdict" class="[hint region]">
  <p>Approve, request changes, or reject. Your verdict tells the agent what to do next.</p>
  <div class="flex gap-2">
    <button class="btn btn-ghost btn-xs text-[var(--text-lo)]">Got it</button>
  </div>
</div>
```

**No action button:** The verdict buttons ARE the action. The hint just explains what they do.

**Auto-dismiss:** After the user submits any verdict on any review thread, the hint disappears.

### Hint #5 -- "Rail indicators" (first rail expansion)

**Location:** `Rail.tsx`, inside the expanded rail view, at the top before the notification groups.

**Trigger:** User expands the Rail for the first time AND hint #5 not yet dismissed.

**Layout:**
```
{/* Inside expanded rail, before notification groups */}
<div data-testid="hint-rail" class="[hint region]">
  <p>Active bets, blockers, and cost alerts appear here. Red means something needs your attention.</p>
  <div class="flex gap-2">
    <button class="btn btn-ghost btn-xs text-[var(--text-lo)]">Got it</button>
  </div>
</div>
```

**Note on surface context:** The Rail's background is `surface-1`. The hint uses `surface-2`, which is still one step up and reads correctly in the rail context.

**Auto-dismiss:** After the user interacts with any notification in the rail (clicks a bet row or blocker), the hint disappears.

---

## States

### Visible state
The hint region renders with the treatment described above. It appears in the natural document flow -- no animation, no slide-in, no fade. It is simply present when the trigger condition is met and the user has not dismissed it.

### Dismissed state
The hint is not rendered. The DOM element is absent (not `display: none`). The `hint_progress` record with `seenAt` timestamp exists in the database.

### Loading state
While hint progress data is loading from the API, hints are NOT shown. This prevents flash-of-hint on page load for users who have already dismissed them. The default assumption is "already seen" until the API confirms otherwise.

### Error state
If the hint progress API fails, hints are NOT shown. Failing gracefully by hiding hints is better than showing hints to users who have already dismissed them. The hint system is non-critical -- no error state UI is needed.

---

## Interaction

### Dismiss flow
1. User clicks "Got it" (or "Dismiss")
2. Client immediately hides the hint (optimistic)
3. Client sends `POST /api/hints/:hintId/dismiss` (or `PUT /api/hint-progress`)
4. Server records `{ userId, hintId, seenAt: now() }` in `hint_progress`
5. On failure: the hint stays hidden locally (best effort -- showing it again would be jarring)

### Action flow (Hint #2 only)
1. User clicks "Open Settings"
2. Navigation to Settings > Credentials occurs
3. The hint is NOT auto-dismissed by the navigation -- only by adding a credential or explicit "Got it"

### Auto-dismiss
Each hint has a trigger condition. When the condition is no longer true (e.g., bets exist, credential is valid, user has submitted a verdict), the hint disappears even without explicit dismissal. The auto-dismiss also records `seenAt` in `hint_progress` so it never reappears.

### Keyboard
- "Got it" / "Dismiss" buttons are standard DaisyUI `btn` elements -- focusable, activatable with Enter/Space
- Tab order follows document flow (hint region is not focus-trapped)
- No keyboard shortcuts for hint dismissal (not worth the complexity)

---

## Mobile adaptation

On mobile (three-tab layout), hints render in exactly the same way -- they are inline text blocks that flow naturally in the document. The density tokens handle sizing automatically (comfortable mode at mobile viewport). No mobile-specific layout changes.

---

## Copy register

All hint copy is:
- **One sentence.** Never two. If it takes two sentences, the hint is trying too hard.
- **Action-oriented.** Tells the user what to DO, not what the feature IS.
- **No jargon.** "Your team" not "your AI agents." "Credential" not "API key" (though Hint #2 context makes the meaning clear).
- **No marketing.** No "Get started!", no "Welcome!", no exclamation marks. Quiet, informative, professional.
- **Imperative or declarative.** "Create a bet..." or "Knowledge items are created by..." -- never interrogative ("Did you know...?").

---

## Rejected list (do not re-litigate)

1. **New InlineHint component in design system:** Over-engineering for 5 uses with no shared behavior beyond text + dismiss.
2. **DaisyUI `alert`:** Too prominent, implies urgency/warning.
3. **Tooltip/popover:** Explicitly out of scope, wrong interaction model.
4. **Numbered steps / progress indicators:** Explicitly rejected in spec.
5. **Primary-tinted background (`--primary-dim`):** Looks like selection state, wrong semantic.
6. **Icons on hints:** Over-iconification (AQ-113), hints are text-only.
7. **Slide-in / fade-in animations:** Explicitly out of scope (no animated transitions).
8. **"Learn more" links:** Explicitly out of scope (no contextual documentation links).
9. **Merging hints into EmptyState props:** Violates single responsibility; EmptyState is permanent, hints are transient.

---

## Open questions for architecture

1. **Hint progress storage:** Server-side `hint_progress` table or client-local storage? The spec says per-user tracking on shared backends, which implies server-side. But the spec also says hints are strategy-layer code in `packages/fabric`. The architect must decide the storage location.

2. **Trigger evaluation:** Are triggers evaluated client-side (React hooks check view state + hint progress) or server-side (API returns "show hint X on this page")? Client-side evaluation is simpler and avoids an API round-trip per page load, but requires the client to have hint progress data.

3. **Hint catalog location:** The catalog of hints (id, copy, trigger condition, placement) lives where? `packages/shared` (so both server and client can reference it), `packages/web` (client-only), or `packages/fabric` (strategy layer)? The spec says hints are strategy-layer code, suggesting fabric.

4. **API shape:** Single endpoint `GET /api/hint-progress` returning all hint IDs the user has seen (client evaluates which to show), or per-page endpoint returning applicable hints? The former is simpler.

5. **Integration with existing views:** Each view that shows a hint needs to conditionally render the hint region. This is a cross-cutting concern -- the architect should specify whether this is done via a shared React hook (`useHint(hintId)`) or ad-hoc per view.
