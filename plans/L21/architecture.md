# L21 Architecture Plan — CoC Rail Overlay

## Summary

A popover overlay (Variant B from design/variants.md) anchored to the bottom-right of the Rail, hosting a ThreadShell in coach configuration. The user's coach thread (host = user, pinned = true) is resolved or created on first open. Context references leverage the existing `InlineRef` shape on `PlainPayload.refs`. No new database tables. No new custom components.

---

## 1. Data Model

### 1.1 Coach Thread (existing schema, no changes)

The coach thread is a standard `threads` row:

```
id:          "thr-coach-<userId>"   (server-generated on first create)
hostKind:    "user"
hostId:      <userId>               (e.g., "u-founder")
initiatorId: <userId>
participants: [<userId>, <cocAgentId>]
pinned:      1
resolvedAt:  null                   (never resolved; coach threads are perpetual)
```

The `classifyThreadConfiguration` function in `@hyperidle/shared` already recognizes this as `"coach"` (hostKind === "user" && pinned === true).

### 1.2 Context References (extend existing type)

The existing `PlainPayload` already carries:

```typescript
interface PlainPayload {
  readonly text: string;
  readonly refs?: ReadonlyArray<InlineRef>;
}
```

And `InlineRef` is:

```typescript
interface InlineRef {
  readonly kind: "knowledge_item" | "task" | "artifact" | "bet";
  readonly id: string;
}
```

**Change:** Extend `InlineRef.kind` to include `"message"`:

```typescript
// packages/shared/src/thread.ts
export interface InlineRef {
  readonly kind: "knowledge_item" | "task" | "artifact" | "bet" | "message";
  readonly id: string;
}
```

Context attachments flow as `refs` on the plain message payload. The server already stores `payload` as opaque JSON text; the Zod schema in `threads-schema.ts` validates `PlainPayload` -- it needs the `"message"` kind added to its allowed values.

**Display label:** The UI needs a label for each ref (e.g., "Bet: Ambrovia v2"). The label is NOT stored in the payload (that would be denormalized and stale). Instead, the client resolves labels at render time using existing data (the bet/task/knowledge item is already loaded or fetchable). For the composer chips (pre-send), the label comes from the item the user clicked. For rendered messages (post-send), the client decorates refs inline by resolving ids against cached data or a lightweight batch-fetch.

---

## 2. API Endpoints

### 2.1 Resolve Coach Thread (new endpoint)

**`GET /api/threads/coach`**

Returns the current user's coach thread. Creates one if it does not exist.

```
Response 200:
{
  thread: Thread,
  messages: Message[],
  identities: Record<string, { name: string; role?: string }>
}
```

Implementation:
1. Read the authenticated user's id (header `X-Identity` or default `u-founder`).
2. Query `threads WHERE hostKind = 'user' AND hostId = <userId> AND pinned = 1`.
3. If found, return thread + messages + identities.
4. If not found, create a new thread (hostKind = "user", hostId = userId, participants = [userId, cocAgentId], pinned = 1) and return it empty.

The CoC agent id is a well-known constant: `"agent-coc"`. This agent row must exist in the `agents` table (seeded in dev, created on factory init in production).

**Why a dedicated endpoint?** The generic `GET /api/threads?host_kind=user&host_id=<userId>` returns ALL threads for that host. The coach thread is ONE specific thread (pinned = true). A dedicated endpoint avoids client-side filtering and encapsulates the "create if absent" logic server-side (identical to the `resolveOrCreateHostThread` pattern from L18 but with the pinned-coach constraint).

### 2.2 Append Message (existing endpoint, no changes)

**`POST /api/threads/:id/messages`**

Already supports:
- `type: "plain"`
- `payload: { text: "...", refs: [...] }`
- `clientKey: "..."`

Context refs ride in the `payload.refs` field. No endpoint changes needed.

### 2.3 System-Initiated CoC Messages

The server (or an agent harness) can POST to the coach thread's message endpoint using the CoC agent's identity (`X-Identity: agent-coc`). This satisfies the AC "system can initiate a CoC session and persist messages with context references." No new endpoint required.

---

## 3. Component Architecture

### 3.1 Component Tree

```
AppShell (existing)
├── ... (IconRail, Submenu, Main, etc.)
├── Rail (modified — adds CocTrigger)
│   ├── ... (existing Rail sections)
│   └── CocTrigger (new, internal to Rail — NOT a custom component)
└── CocOverlay (new file, shell-level composition)
    └── ThreadShell (existing design-system component)
```

### 3.2 CocOverlay (new file)

**Path:** `packages/web/src/shell/CocOverlay.tsx`

A positioned overlay that renders ThreadShell in the coach thread's data context. Uses `@floating-ui/react` for popover positioning anchored to the trigger button ref.

**Props:**
```typescript
interface CocOverlayProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement>;
  contextRefs: ReadonlyArray<CocContextRef>;
  onRemoveContextRef: (index: number) => void;
}
```

**Internal state:**
- Fetches coach thread via `useCocThread()` hook (new).
- Passes messages/thread/identities to ThreadShell.
- Passes an extended `onAppendMessage` that injects `contextRefs` into the payload.

### 3.3 CocTrigger (internal to Rail)

Not a standalone component. A `<button>` rendered at the bottom of the Rail's flex column (below Cost, pushed down with `mt-auto`). The trigger receives a ref which CocOverlay anchors to.

**Expanded Rail:** Full-width button with icon + "Chief of Staff" label.
**Collapsed Rail:** 32px icon-only button.

### 3.4 Context Provider

**Path:** `packages/web/src/contexts/CocContext.tsx`

```typescript
interface CocContextValue {
  overlayOpen: boolean;
  attachContext: (ref: CocContextRef) => void;
}

const CocContext = createContext<CocContextValue>({
  overlayOpen: false,
  attachContext: () => {},
});
```

**Where provided:** In AppShell, wrapping the Main content area. This allows any component rendered in Main to detect when the CoC overlay is open and expose the "+" affordance.

### 3.5 "Add as Context" Affordance

When `CocContext.overlayOpen === true`, attachable components (BetCard, TaskCard, KnowledgeRow, ThreadRow in the Submenu) render a small "+" icon on hover. Clicking calls `CocContext.attachContext({ kind, id, label })`.

**Implementation:** A thin wrapper hook:

```typescript
// packages/web/src/hooks/useCocAttach.ts
function useCocAttach(kind: InlineRef["kind"], id: string, label: string) {
  const { overlayOpen, attachContext } = useContext(CocContext);
  const handleAttach = useCallback(() => {
    attachContext({ kind, id, label });
  }, [attachContext, kind, id, label]);
  return { showAttach: overlayOpen, handleAttach };
}
```

Components that support context attachment call this hook and conditionally render the "+" button.

---

## 4. New Files

| Path | Purpose |
|------|---------|
| `packages/web/src/shell/CocOverlay.tsx` | Overlay shell composition (popover + ThreadShell) |
| `packages/web/src/shell/CocOverlay.stories.tsx` | Storybook entry |
| `packages/web/src/contexts/CocContext.tsx` | Context provider for overlay-open state + attach handler |
| `packages/web/src/hooks/useCocThread.ts` | Hook: fetches/creates the coach thread via `/api/threads/coach` |
| `packages/web/src/hooks/useCocAttach.ts` | Hook: provides attachability signals to Main-area components |
| `packages/server/src/routes/coach.ts` | `GET /api/threads/coach` endpoint |
| `packages/web/src/__tests__/CocOverlay.test.tsx` | Vitest: trigger renders, overlay opens, context attaches |
| `packages/web/src/__tests__/CocTrigger.test.tsx` | Vitest: trigger presence in Rail |
| `packages/server/src/routes/__tests__/coach.routes.test.ts` | Vitest: coach endpoint behavior |
| `e2e/coc-overlay.spec.ts` | Playwright e2e: full flow |

## 5. Modified Files

| Path | Change |
|------|--------|
| `packages/web/src/shell/Rail.tsx` | Add CocTrigger button at bottom of flex column (both expanded and collapsed states) |
| `packages/web/src/layouts/AppShell.tsx` | Wrap Main in CocContext provider, render CocOverlay, manage overlay open/close state |
| `packages/shared/src/thread.ts` | Add `"message"` to `InlineRef.kind` union |
| `packages/server/src/routes/threads-schema.ts` | Add `"message"` to InlineRef kind zod enum |
| `packages/server/src/index.ts` (or router mount file) | Mount coach routes |
| `packages/web/src/components/ThreadSections.tsx` | (Optional) Ensure coach thread shows in Conversations submenu with pinned-top behavior (already handled by pinned sort in `sortActive`) |

---

## 6. Type Signatures

### 6.1 CocContextRef

```typescript
// packages/web/src/contexts/CocContext.tsx
export interface CocContextRef {
  kind: InlineRef["kind"]; // "bet" | "task" | "artifact" | "knowledge_item" | "message"
  id: string;
  label: string; // Display label for the chip (not persisted in message)
}
```

### 6.2 useCocThread Hook

```typescript
// packages/web/src/hooks/useCocThread.ts
export interface CocThreadState {
  status: "loading" | "ready" | "error";
  data: {
    thread: Thread;
    messages: ReadonlyArray<Message>;
    identities: Record<string, { name: string; role?: string }>;
  } | null;
  error: string | null;
  retry: () => void;
  /** Refreshes messages without full reload */
  refresh: () => void;
}

export function useCocThread(): CocThreadState;
```

### 6.3 Coach Endpoint Response

```typescript
// Response shape matches existing GET /api/threads/:id response
interface CoachThreadResponse {
  thread: Thread;
  messages: Message[];
  headMessageId: string | null;
  identities: Record<string, { name: string; role?: string }>;
}
```

---

## 7. Endpoint Shape: GET /api/threads/coach

```
GET /api/threads/coach
Headers: X-Identity: <userId> (optional, defaults to u-founder)

200 OK → CoachThreadResponse
  (thread created on-the-fly if absent)

500 Internal Server Error → { error: string, code: string }
```

Implementation in Hono:

```typescript
// packages/server/src/routes/coach.ts
export function createCoachRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
  const router = new Hono();

  router.get("/", (c) => {
    const userId = readSenderId(c); // same pattern as threads.ts
    const COC_AGENT_ID = "agent-coc";

    // Find existing pinned coach thread for this user
    const existing = db.select().from(threads)
      .where(and(
        eq(threads.hostKind, "user"),
        eq(threads.hostId, userId),
        eq(threads.pinned, 1),
      ))
      .get();

    if (existing) {
      // Return thread + messages + identities
      const msgs = db.select().from(messages)
        .where(eq(messages.threadId, existing.id))
        .orderBy(messages.createdAt, messages.id)
        .all();
      return c.json({
        thread: rowToThread(existing),
        messages: msgs.map(rowToMessage),
        headMessageId: null,
        identities: resolveIdentities(db, existing),
      });
    }

    // Create coach thread
    const threadId = generateId();
    const now = new Date().toISOString();
    db.insert(threads).values({
      id: threadId,
      hostKind: "user",
      hostId: userId,
      initiatorId: userId,
      participants: JSON.stringify([userId, COC_AGENT_ID]),
      pinned: 1,
      resolvedAt: null,
      lastActiveAt: now,
      createdAt: now,
    }).run();

    eventBus.emit({ type: "thread.created", ... });

    return c.json({
      thread: { id: threadId, hostKind: "user", hostId: userId, ... },
      messages: [],
      headMessageId: null,
      identities: { [userId]: { name: "You" }, [COC_AGENT_ID]: { name: "Chief of Staff", role: "chief_of_staff" } },
    });
  });

  return router;
}
```

---

## 8. Ordered Implementation Tasks

### Phase 1: Data layer (no UI)

1. **T1: Extend InlineRef kind** — Add `"message"` to `InlineRef.kind` in `packages/shared/src/thread.ts` and to the Zod schema in `packages/server/src/routes/threads-schema.ts`. Run `bun run check`.

2. **T2: Seed CoC agent** — Ensure `agent-coc` exists in the agents table (add to dev seed if not present). The agent row is needed for the coach thread's participants constraint.

3. **T3: Coach endpoint** — Implement `GET /api/threads/coach` in `packages/server/src/routes/coach.ts`. Mount in the server router. Write tests (`coach.routes.test.ts`): (a) returns existing coach thread, (b) creates coach thread when absent, (c) respects X-Identity header.

### Phase 2: Frontend foundation (no overlay yet)

4. **T4: CocContext provider** — Create `packages/web/src/contexts/CocContext.tsx`. Wire into AppShell wrapping the Main area.

5. **T5: useCocThread hook** — Create `packages/web/src/hooks/useCocThread.ts`. Fetches `GET /api/threads/coach`. Exposes status/data/error/retry/refresh.

6. **T6: CocTrigger in Rail** — Add the trigger button at the bottom of Rail.tsx (expanded and collapsed). Emit an `onCocClick` callback to AppShell. Write Vitest test: trigger renders in both Rail states.

### Phase 3: Overlay

7. **T7: CocOverlay component** — Create `packages/web/src/shell/CocOverlay.tsx`. Popover anchored to trigger ref using `@floating-ui/react`. Renders ThreadShell with data from useCocThread. Write Vitest tests: overlay opens/closes, ThreadShell renders with mock data.

8. **T8: CocOverlay.stories.tsx** — Storybook entry showing open state with messages + empty state.

9. **T9: Wire CocOverlay in AppShell** — Manage open/close state. Pass trigger ref from Rail. Render CocOverlay conditionally. Escape closes overlay.

### Phase 4: Context attachment

10. **T10: useCocAttach hook** — Create `packages/web/src/hooks/useCocAttach.ts`. Returns `{ showAttach, handleAttach }` from CocContext.

11. **T11: Context chips in overlay** — Render attached context refs as chips above the ThreadShell composer. Each chip shows kind-icon + label + dismiss "x". On send, inject refs into the message payload.

12. **T12: Attach affordance on BetCard** — When overlay is open, BetCard shows "+" on hover. Clicking attaches. Write Vitest test.

13. **T13: Attach affordance on TaskCard, KnowledgeRow, ThreadRow** — Same pattern as T12. One test per component.

### Phase 5: Integration + E2E

14. **T14: Coach thread in Conversations** — Verify the coach thread surfaces in the Conversations submenu (pinned-top behavior already handled by `sortActive` in ThreadSections). Clicking it opens the thread in Main via existing routing. Write Vitest assertion.

15. **T15: Playwright E2E** — Full flow: invoke CoC from any page -> overlay opens -> add bet as context -> ask question -> response renders -> close -> thread persists in Conversations.

16. **T16: Verify** — `bun run check` + `bun run lint` + `bun run test` all green.

---

## 9. Dependencies and Risks

| Risk | Mitigation |
|------|-----------|
| `@floating-ui/react` not imported yet in web package | Already listed in component-budget.md as a behavior dependency. Verify `package.json` has it; if not, `bun add @floating-ui/react`. |
| CoC agent (`agent-coc`) not in seed data | T2 explicitly creates it. Blocking nothing else. |
| Popover conflicts with SettingsPanel z-index | CocOverlay at z-30; Settings at z-40. Settings dims the shell (pointer-events-none) which naturally hides the CocOverlay when settings is open. No conflict. |
| Thread message send while overlay navigates away | AppShell wraps all routes; overlay state is in AppShell. No navigation destroys it. |
| Mobile adaptation (FAB + bottom sheet) | Deferred. The AC does not mandate mobile. Design spec notes the pattern; build only if time permits or in a follow-up. |

---

## 10. Component Budget Impact

**No new custom components added to the budget.** Rationale:

- `CocOverlay` is a shell-level composition (like AppShell, SettingsPanel, GlobalSearchPanel). It composes existing Tier 3 (ThreadShell) with positioning logic. It lives in `packages/web/src/shell/`, not in `packages/design-system/`.
- `CocTrigger` is a button rendered inline inside Rail.tsx. Not a standalone component.
- `CocContext` is a React context, not a visual component.

The design system's 19-component budget is unchanged.

---

## 11. Performance Considerations

- **Lazy fetch:** The coach thread is fetched only when the overlay is first opened (not on AppShell mount). The `useCocThread` hook is called inside CocOverlay which is conditionally rendered.
- **No polling:** Messages are fetched once on open. Future story wires WebSocket subscription for real-time updates (out of scope for L21).
- **Context provider cost:** CocContext provides a stable object (memoized). Re-renders propagate only when `overlayOpen` changes (binary state, rare).

---

## 12. Accessibility

- **Focus management:** Focus moves to the overlay when opened (first focusable element in ThreadShell). Not a focus trap — user can Tab out to interact with Main.
- **Escape:** Closes the overlay, returns focus to the trigger button.
- **aria-expanded:** Trigger button carries `aria-expanded` reflecting overlay state.
- **aria-label:** Overlay container carries `aria-label="Chief of Staff conversation"`.
- **Screen reader announcement:** On open, the overlay is announced via `role="dialog"` with `aria-labelledby` pointing to a visually-hidden heading inside.

---

## 13. Self-Critique

**Potential over-engineering:** The CocContext provider adds a new context to AppShell. This is justified because the "+" affordance on Main-area components needs to know the overlay state without prop-drilling through the entire component tree.

**Potential under-specification:** The exact "+" affordance styling on BetCard/TaskCard/etc. is left to the builder. The architecture provides the hook; the builder chooses whether it is a floating icon, a hover overlay, or a row action button. The design spec says "small + icon on hover" -- the builder has enough guidance.

**Missing failure mode:** What if the `/api/threads/coach` endpoint fails? The overlay shows an ErrorState inside the popover (ThreadShell's `error` prop). The user can retry. The trigger button remains functional (clicking retries the fetch).

**Coupling concern:** The CocContext is consumed by components that are otherwise unaware of the overlay (BetCard, etc.). This is a deliberate trade-off: the coupling surface is one boolean + one function, constrained by the hook interface. If the overlay pattern scales beyond CoC (e.g., "add to any thread as context"), the context can generalize without breaking consumers.
