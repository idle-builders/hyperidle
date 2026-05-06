# L21 Approved Design — Variant B (Popover Overlay)

Approved by reviewer critique with average score 7.9/10 (threshold: 7.0).

---

## Trigger Button

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

---

## Overlay (Popover)

- **Positioning:** Anchored to the trigger button. Placement: `top-end` (grows upward and to the left from the trigger's top-right corner). Offset: 8px vertical gap from trigger.
- **Dimensions:** Width: 360px. Max-height: 70vh. Min-height: 200px.
- **Surface:** `--surface-2`. Border: `1px solid var(--border-default)`. Shadow: `var(--float)`. Radius: `--r2` (8px).
- **z-index:** 30 (above Main at z-0, below Settings at z-40).
- **Focus management:** Focus moves into the overlay when opened. Escape closes the overlay. The overlay is NOT a focus trap (user can tab out to interact with Main content).
- **Close:** Clicking the trigger again closes the overlay. Escape closes the overlay. Clicking outside (Main content) does NOT close the overlay (the user needs to interact with Main to select context items).
- **Persistence:** Open/closed state is session-local (not URL-based). Navigating between views does NOT close the overlay.

---

## ThreadShell Integration

The overlay renders a ThreadShell with:
- `thread`: The user's persistent coach thread (host = user, pinned = true).
- `messages`: Fetched from `/api/threads/coach` (messages included in response).
- `identities`: `{ [userId]: { name: "You" }, [cocAgentId]: { name: "Chief of Staff", role: "chief_of_staff" } }`.
- `onAppendMessage`: Posts to `/api/threads/:coachThreadId/messages`.
- `hostTitle`: "Chief of Staff"
- No `artifactSlot` (coach threads are plain messages).

---

## Context Attachment

**Composer Extension:** Above the composer textarea, a "Context" chip area renders attached references. Each chip shows: icon + truncated title + dismiss "x" button.

**Attachment Mechanic:** When the CoC overlay is open, a `CocContext` provider sets `{ overlayOpen: true, attachContext: (ref) => void }`. Components in Main that are "attachable" (BetCard, TaskCard, KnowledgeRow, ThreadRow) render a small "+" icon on hover (and on focus for keyboard users) when `overlayOpen === true`. Clicking "+" calls `attachContext(ref)` which adds the reference to the overlay's pending-context state.

**Context reference shape:**
```typescript
interface CocContextRef {
  kind: "bet" | "task" | "artifact" | "knowledge_item" | "message";
  id: string;
  label: string;
}
```

**Payload integration:** When the user sends a message with context attached, the context refs are included in the message payload via the existing `PlainPayload.refs` field (as `InlineRef[]`). Labels are resolved client-side at render time, not persisted.

---

## Animation

- **Open:** Overlay fades in (opacity 0 -> 1) and translates up slightly (translateY(8px) -> translateY(0)) over `--motion-fast` (150ms).
- **Close:** Reverse of open.
- **Respects** `prefers-reduced-motion`: when set, no animation (instant show/hide).

---

## Keyboard

- No keyboard shortcut to open (founder directive).
- Escape closes the overlay.
- Tab within the overlay cycles through messages and the composer.
- Tab OUT of the overlay moves focus to Main content (no trap).
- Context attachment "+" buttons are keyboard-focusable (visible on focus, not only hover).

---

## States

- **Closed**: trigger visible, no overlay rendered.
- **Open, loading**: overlay shell visible with skeleton/loading indicator.
- **Open, error**: ErrorState inside overlay with retry button.
- **Open, empty thread**: ThreadShell EmptyState + Composer.
- **Open, populated**: ThreadShell with message history + Composer.
- **Open, sending**: Composer disabled, message pending.
- **Open, with context chips**: Context references shown above composer.

---

## Mobile (< 1024px) — Deferred

Not in L21 scope per AC. Noted for future:
- Trigger: FAB at bottom-right, 48px diameter, z-30.
- Overlay: Bottom sheet covering 70% viewport height. Slide-up animation. Drag handle to dismiss.
- Context attachment: "+" button in composer opens picker bottom-sheet.
