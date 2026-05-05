# L21 Design Variants — CoC Rail Overlay

## Context

The Chief of Staff (CoC) overlay is a persistent chat surface reachable from anywhere in HyperIdle. The user clicks a trigger at the bottom-right of the Rail; an overlay opens carrying a ThreadShell in "coach" configuration (host = user, participants = [user, CoC agent], pinned = true). The underlying view remains visible so the user can reference items on screen and attach them as context.

This is a novel interaction pattern for HyperIdle: it is the first overlay that persists across view changes AND coexists with the main content (unlike SettingsPanel / GlobalSearchPanel which dim and disable the shell). It introduces a new spatial relationship: overlay + source-view + Rail all visible simultaneously.

---

## Design Dimensions

| Dimension | Constraint |
|-----------|-----------|
| Trigger placement | Bottom-right of the Rail. Non-negotiable. |
| Overlay behavior | Must keep the underlying view visible (visibility IS the context affordance). |
| Thread primitive | Reuses ThreadShell from L1 (coach configuration). |
| Context attachment | Must support: bet card, task row, artifact, knowledge entry, message. |
| Persistence | Overlay can be closed and reopened; thread persists in Conversations. |
| Component budget | No new custom components needed. Reuses ThreadShell (Tier 3). The trigger button is a lightweight affordance inside Rail (no standalone component). |
| Form factor | Desktop primary (IconRail | Submenu | Main | Rail); mobile is a secondary concern. |

---

## Variant A — Anchored Panel (Right-Edge Drawer)

### Trigger

A button rendered at the absolute bottom of the expanded Rail, below the Cost section. When Rail is collapsed (w-14), the trigger becomes a small icon button at the bottom of the collapsed column. Visually: a 32x32 circle with a speech-bubble icon (matches the Conversations icon vocabulary but distinct in silhouette — e.g., a single-person chat bubble or a "spark" glyph to signal coaching).

```
Expanded Rail (w-[360px]):
  ┌────────────────────────────────┐
  │ [collapse btn]                 │
  │ Active Bets ...                │
  │ Blockers ...                   │
  │ Cost ...                       │
  ��                                │
  │                                │  <- flex spacer pushes trigger down
  │ ┌──────────────────────────┐   │
  │ │ [icon] Chief of Staff    │   │  <- trigger button, full-width
  │ └─────────────────��────────┘   │
  └─────────────────────────��──────┘

Collapsed Rail (w-14):
  ┌──┐
  │BL│
  │RE│
  │PS│
  │ <│
  │ 3│
  │  │
  │  │  <- spacer
  │◉ │  <- 32px circle button
  └──┘
```

### Overlay

A panel anchored to the right edge of the viewport, positioned BETWEEN the Rail and the Main content. Dimensions: 400px wide, max-height = viewport height - 48px (top/bottom padding). Appears as a floating surface at `z-30` (below SettingsPanel z-40 but above Main content). Background: `--surface-2`. Border-left: `--border-default`. Shadow: `--float`.

```
┌──────┬──────────────────────────────────┬───────────────────┬──────────┐
│Icon  │ Submenu │     Main Content       │   CoC Overlay     │   Rail   │
│Rail  │         │     (visible,          │   ┌──────��──────┐ │          │
│      │         │      dimmed?)          │   │ThreadShell  │ │          │
│      │         │                        │   │ messages... │ │          │
│      │         │                        │   │             │ │          │
│      │         │                        │   │ [Composer]  │ │          │
│      │         │                        │   └─────────────┘ │  [CoC]   │
└──────┴──────────────────────────��───────┴───────────────────┴──────────┘
```

The Main content is NOT dimmed or pointer-events-disabled. The user can interact with both simultaneously. The overlay floats as a right-edge panel (like a dev-tools drawer).

### "Add as Context" Interaction

A small pill/chip area above the Composer inside the overlay. The user clicks any item in the Main content (bet card, task row, knowledge row, thread row) and a small "pin" icon appears on hover. Clicking the pin attaches the item's reference to the pending message. Attached items render as compact chips above the composer textarea:

```
┌──────────────────────────┐
│ ThreadShell messages...   │
│                           │
│ Context:                  │
│ [Bet: Ambrovia v2] [x]   │
│ [Task: Auth flow]   [x]  │
│                           │
│ ┌────────────���────────┐  │
│ │ What should we...   │  │
│ └───────────���─────────┘  │
│               [Send]      │
└──────────────────��───────┘
```

### States

- **Closed**: trigger visible, no overlay rendered.
- **Open, empty thread**: ThreadShell EmptyState + Composer.
- **Open, populated**: ThreadShell with message history + Composer.
- **Open, sending**: Composer disabled, message pending.
- **Open, with context chips**: Context references shown above composer.

### Pros

- Clear spatial relationship: overlay sits between Main and Rail, anchored to the Rail's left edge.
- Main content fully interactive (no modal trap).
- 400px width gives ThreadShell enough room for readable messages.
- The "pin to context" mechanic works because both overlay and Main are visible and interactive simultaneously.

### Cons

- Overlapping Main content when viewport is narrow. At < 1280px the overlay competes with Main for horizontal space.
- "Pin" affordance on hover in Main adds interaction complexity to every clickable element.
- New z-index layer that must be managed alongside existing overlays.

### Small Viewport Adaptation (< 1024px / Mobile)

The overlay becomes a bottom sheet (full-width, 60vh max-height) that slides up. The trigger moves to a floating action button at the bottom-right of the screen. Context attachment on mobile: a "+" button in the composer area opens a picker sheet listing recent/visible items from the current view.

---

## Variant B — Popover Overlay (Anchored to Trigger)

### Trigger

Same placement as Variant A: bottom of the expanded Rail (full-width button with icon + "Chief of Staff" label), bottom of collapsed Rail (32px icon button). Identical visual treatment.

### Overlay

A popover that anchors to the trigger button and grows UPWARD. Dimensions: 360px wide (matches Rail width), max-height = 70vh. The popover uses `@floating-ui/react` for positioning (already in the dependency tree per `docs/ui-design/component-budget.md`). Background: `--surface-2`. Border: `--border-default`. Shadow: `--float`. z-index: 30.

```
Expanded Rail:
  ┌────────────────────────────────┐
  │ Active Bets ...                │
  │ Blockers ...                   │
  │ Cost ...                       │
  │                                │
  │ ┌─────���────────────────────┐   │
  │ │ ThreadShell              │   │  <- popover grows upward
  │ │ messages...              │   │
  │ │                          │   │
  │ │ Context: [Bet: X] [x]   │   │
  │ │ ┌──────────────────┐    │   │
  │ │ │ textarea...      │    │   │
  │ │ └─────────��────────┘    │   │
  │ │             [Send]       │   │
  │ └──────────────────────────┘   │
  │ ┌─────���────────────────────┐   │
  │ │ [icon] Chief of Staff    │   │  <- trigger (stays visible)
  │ └──────────────────────────��   │
  └────────────────────────────���───┘
```

The popover visually "belongs to" the Rail. It does not overlay the Main content — it floats above the Rail's area only.

### "Add as Context" Interaction

Since the overlay does NOT cover Main content, the user can still see and interact with Main. Context attachment: the user clicks an item in Main, and a small contextual "Add to CoC" toast-action appears briefly near the clicked item (2-second auto-dismiss). Clicking that action attaches the reference. Alternatively, a single persistent "Add context" button in the overlay Composer area opens a quick-picker dialog (list of items from the current view).

Actually, the simpler and more direct mechanic: the overlay leaves the Main content fully visible and interactive. Items in Main (bet cards, task rows, knowledge rows) gain a subtle "+" affordance on hover ONLY when the CoC overlay is open. Clicking "+" attaches the reference as a context chip in the overlay's composer. This is lower-friction than a picker dialog.

### States

Same as Variant A.

### Pros

- Popover is a well-understood UI pattern; `@floating-ui/react` handles positioning.
- Does not overlay Main content at all — zero spatial conflict.
- Width matches Rail width so it feels like the Rail "extended" upward.
- The trigger stays visible below the popover, reinforcing spatial ownership.
- Works at all viewport widths (the popover lives in the Rail's column).

### Cons

- 360px is tight for a ThreadShell with rich message content (review messages with artifacts would be cramped, but coach threads are plain messages — acceptable).
- 70vh max-height may truncate long threads on shorter viewports.
- The "conditional hover affordance on items while overlay is open" requires awareness of the overlay state across distant components (coupling).

### Small Viewport Adaptation

Same as Variant A: bottom sheet + FAB trigger. The popover pattern does not adapt well to mobile; the bottom-sheet takeover is cleaner.

---

## Variant C — Inset Overlay (Rail Splits)

### Trigger

Identical to Variants A and B.

### Overlay

When the CoC overlay is open, the Rail region splits vertically: the upper portion retains the current Rail content (bets, blockers, cost) in a compressed/scrollable area; the lower portion becomes the ThreadShell. The split is roughly 40% Rail / 60% ThreadShell (user-resizable via drag handle, optional follow-up). The Rail stays at its 360px width. No floating surface — the thread is INSIDE the Rail.

```
┌──────┬─────────────┬─────────────────────┬──────────────────────────────┐
│Icon  │ Submenu     │     Main Content    │  Rail (360px)                │
│Rail  │             │                     │  ┌──────────────────────┐    │
│      │             │                     │  │ Active Bets (compact)│    │
│      │             │                     │  │ Blockers (compact)   │    ���
│      │             │                     │  │ Cost (compact)       │    │
│      │             │                     │  ├─���────────────────────┤    │
│      │             │                     │  │ CoC Thread           │    │
│      │             │                     │  │ messages...          │    │
│      │             │                     │  │                      │    │
│      │             │                     │  │ Context: [x] [x]    │    │
│      │             │                     │  │ [composer]     [Send]│    │
│      │             │                     │  └─────────────────────��┘    │
│      │             │                     │  [CoC trigger]               │
└──────┴───────���─────┴──────────���──────────┴─────────────���────────────────┘
```

### "Add as Context" Interaction

Same as Variant B: items in Main gain a contextual "+" affordance while the CoC thread section is visible. The reference attaches as a chip in the CoC composer area. Since the CoC thread is inside the Rail (always visible when open), the user has a persistent visual anchor showing their attached context.

### States

- **Closed**: Rail renders normally (full height for bets/blockers/cost).
- **Open**: Rail splits. Rail content compresses to ~40% height (scrollable); CoC thread occupies ~60%.
- **Open + collapsed Rail**: Not possible. When Rail is collapsed (w-14), clicking the CoC trigger expands the Rail and opens the CoC thread section simultaneously.

### Pros

- Zero z-index complexity. No floating surfaces. The thread lives IN the Rail.
- Main content is fully visible and interactive with zero overlap.
- Spatial model is simple: Rail is the CoC's home.
- No new positioning logic needed.
- The thread being "inside the Rail" reinforces the mental model: the CoC is part of the factory's vital signs.

### Cons

- Rail content gets compressed when CoC is open. If the user has many active bets, the top section becomes cramped.
- The CoC thread area is limited to ~60% of viewport height within 360px width — tighter than Variants A/B.
- Coupling between Rail state and CoC state adds complexity to the Rail component.
- Conflicts with the "Rail is ambient, not interruptive" design principle — adding a full thread violates the Rail's character.

### Small Viewport Adaptation

On mobile, the CoC trigger appears as a FAB at the bottom-right. Tapping opens a full-screen CoC view (replaces the current tab content temporarily). Back button returns to the previous view.

---

## Scoring (9-dimension rubric)

| Dimension | A (Right-Edge Drawer) | B (Popover) | C (Inset) |
|-----------|:----:|:----:|:----:|
| 1. Hierarchy clarity | 7 | 8 | 6 |
| 2. Spacing / density | 7 | 8 | 6 |
| 3. Typography readability | 8 | 7 | 6 |
| 4. Color / tone alignment | 8 | 8 | 8 |
| 5. Cross-component coherence | 7 | 9 | 7 |
| 6. State coverage | 8 | 8 | 7 |
| 7. Accessibility | 8 | 8 | 7 |
| 8. Anti-slop (AI aesthetic avoidance) | 8 | 9 | 9 |
| 9. Premium polish | 7 | 8 | 7 |
| **Total** | **68** | **73** | **63** |

---

## Recommendation: Variant B (Popover Overlay)

Variant B wins on coherence and hierarchy. Rationale:

1. **Zero spatial conflict with Main.** The popover lives entirely in the Rail's column. The user never loses visibility of their work surface. This directly satisfies the AC: "underlying view stays visible."

2. **Matches existing patterns.** `@floating-ui/react` is already in the stack. The pattern is identical to how tooltips and popovers work — well-understood, boring technology.

3. **Respects the Rail's character.** The overlay is OUTSIDE the Rail (floating above it) rather than INSIDE it. The Rail continues to render its ambient vital signs unperturbed. The CoC popover is a companion, not a replacement.

4. **Width is acceptable.** Coach threads carry plain messages (not rich review artifacts). 360px is sufficient for text-based conversation. If a future story adds rich messages to coach threads, the popover width can be expanded to 400px without architectural change.

5. **Context attachment is clean.** When the overlay is open, items in Main show a "+" affordance on hover. This is low-friction: see item, click "+", reference appears in the overlay. The coupling cost (overlay state must be accessible to Main-area components) is manageable via a simple context provider at the AppShell level.

6. **Component budget respected.** No new custom components. The trigger is a button rendered inside Rail. The overlay is a positioned div containing ThreadShell. Context chips are a small composition inside the Composer area (or a thin wrapper in Composer's slot).

---

## Detailed Spec (Variant B)

### Trigger Button

**Expanded Rail:** Full-width button at the bottom of the Rail, below the Cost section. Uses `mt-auto` to push to the bottom of the flex column. Styling:

- Height: 36px (`min-h-[36px]`)
- Background: `--surface-4` at rest, `--surface-5` on hover
- Border: `--border-subtle`
- Border-radius: `--r1` (4px)
- Icon: 16x16 SVG speech bubble (single person variant)
- Label: "Chief of Staff" in `text-xs text-[var(--text-mid)]`
- Icon color: `--text-lo` at rest, `--primary` when overlay is open

**Collapsed Rail:** 32px square button with icon only. Same surface/border treatment. Positioned at the bottom of the collapsed column via `mt-auto`.

**Unread indicator:** When the CoC has posted a message the user has not seen (future story), a 6px dot (`bg-error`) appears at the top-right corner of the trigger (same pattern as IconRail badges).

### Overlay (Popover)

- **Positioning:** Anchored to the trigger button. Placement: `top-end` (grows upward and to the left from the trigger's top-right corner). Offset: 8px vertical gap from trigger.
- **Dimensions:** Width: 360px. Max-height: 70vh. Min-height: 200px.
- **Surface:** `--surface-2`. Border: `1px solid var(--border-default)`. Shadow: `var(--float)`. Radius: `--r2` (8px).
- **z-index:** 30 (above Main at z-0, below Settings at z-40).
- **Focus management:** Focus moves into the overlay when opened. Escape closes the overlay. The overlay is NOT a focus trap (user can tab out to interact with Main content).
- **Close:** Clicking the trigger again closes the overlay. Escape closes the overlay. Clicking outside (Main content) does NOT close the overlay (the user needs to interact with Main to select context items).
- **Persistence:** Open/closed state is session-local (not URL-based). Navigating between views does NOT close the overlay.

### ThreadShell Integration

The overlay renders a ThreadShell with:
- `thread`: The user's persistent coach thread (host = user, pinned = true).
- `messages`: Fetched from `/api/threads/:coachThreadId/messages`.
- `identities`: `{ [userId]: { name: "You" }, [cocAgentId]: { name: "Chief of Staff" } }`.
- `onAppendMessage`: Posts to `/api/threads/:coachThreadId/messages`.
- `hostTitle`: "Chief of Staff"
- No `artifactSlot` (coach threads are plain messages).

### Context Attachment

**Composer Extension:** Above the composer textarea, a "Context" chip area renders attached references. Each chip shows: icon + truncated title + dismiss "x" button.

**Attachment Mechanic:** When the CoC overlay is open, a `CocOverlayContext` provider sets `{ overlayOpen: true, attachContext: (ref) => void }`. Components in Main that are "attachable" (BetCard, TaskCard, KnowledgeRow, ThreadRow) render a small "+" icon on hover when `overlayOpen === true`. Clicking "+" calls `attachContext(ref)` which adds the reference to the overlay's pending-context state.

**Context reference shape:**
```typescript
interface CocContextRef {
  kind: "bet" | "task" | "artifact" | "knowledge_item" | "message";
  id: string;
  label: string; // truncated display label
}
```

**Payload integration:** When the user sends a message with context attached, the context refs are included in the message payload:
```typescript
// The plain message payload extends with optional contextRefs
interface CoachMessagePayload {
  text: string;
  contextRefs?: CocContextRef[];
}
```

### Animation

- **Open:** Overlay fades in (opacity 0 -> 1) and translates up slightly (translateY(8px) -> translateY(0)) over `--motion-fast` (150ms).
- **Close:** Reverse of open.
- **Respects** `prefers-reduced-motion`: when set, no animation (instant show/hide).

### Keyboard

- No keyboard shortcut to open (founder directive).
- Escape closes the overlay.
- Tab within the overlay cycles through messages and the composer.
- Tab OUT of the overlay moves focus to Main content (no trap).

### Mobile (< 1024px)

- Trigger: Floating action button (FAB) at the bottom-right corner of the screen, 48px diameter, z-30.
- Overlay: Bottom sheet covering 70% of viewport height. Slide-up animation. Drag handle at top to dismiss.
- Context attachment: A "+" button in the composer opens a picker bottom-sheet listing items from the current view.
- The IconRail/Rail are hidden on mobile; the FAB is the only trigger.

---

## Open Questions for Architecture

1. **Coach thread resolution:** How does the client know which thread is THE coach thread for this user? Options: (a) special endpoint `/api/threads/coach` that returns the user's pinned coach thread or creates it; (b) query `/api/threads?hostKind=user&hostId=<userId>&pinned=true`.
2. **Context refs in message payload:** Is extending the `plain` message payload with an optional `contextRefs` field backward-compatible? The schema stores payload as JSON text — additive fields should be safe.
3. **System-initiated CoC sessions:** The AC says "system can initiate a CoC session." This means the server can POST a message to the coach thread without user action. The existing `POST /api/threads/:id/messages` endpoint already supports this (agent posts with its own identity). No new endpoint needed.
4. **Overlay state across navigations:** React state or a lightweight store? The overlay must survive route changes within the SPA. React state in AppShell (where Rail lives) is sufficient — AppShell wraps all routes.
