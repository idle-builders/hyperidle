# L11 — Plan: Render rich messages inline; remove the ThreadActionBar abstraction

**Branch.** `feat/L11-rich-messages-inline`
**Worktree.** `/workspace/.worktrees/L11`
**Inputs locked (do NOT relitigate).**
- Spec: `docs/work-packages/TRACK-L.md` § L11 (lines 375–405).
- Approved design: `docs/design-explorations/L11/approved.md` (Variant B + promotion-rule pull from A + sticky-within-card pull from C). Rejection list at §11 — load-bearing; the architecture below refuses every item.
- Visual contract: `packages/design-system/html/L11-approved/mockup.html`.
- Concept: `docs/concept/HUMAN_INTERFACE_LAYER.md` § 4.5 (Thread); `docs/work-packages/SHARED.md` "Thread primitive (L1)".
- L1 Thread primitive: shipped (`packages/design-system/src/{ThreadShell,ThreadHead,ThreadHostBanner,CommentRow,ReviewVerdictBar}.tsx`).
- L3 Artifact primitive: shipped (`packages/web/src/shell/ArtifactView.tsx`, embedded "output" layout).

---

## 1. Context

The current review thread mounts three competing decision surfaces:
1. `ReviewHeader` (`packages/web/src/shell/ReviewHeader.tsx`) — a top toolbar with 10 verb buttons, a global keydown listener for 7 single-key shortcuts, and a `More` overflow menu. Lines 153–178 host the keydown listener.
2. `ThreadHead` (`packages/design-system/src/ThreadHead.tsx`) — a section above the message stream that renders the review's title, reasoning, and artifact slot.
3. `ReviewVerdictBar` (`packages/design-system/src/ReviewVerdictBar.tsx`) — a sticky-bottom bar with the 5 binding verdicts.

L11 collapses these three surfaces into a single in-stream `RichMessageCard` that renders exactly one promoted rich message per thread, with a rich-row variant of `CommentRow` for any other unresolved rich messages. The action surface becomes a property of the message — not a property of the thread.

Net component change: **−2** (delete `ReviewHeader` Tier 3 + `ReviewVerdictBar` Tier 2; add `RichMessageCard` Tier 2; extend `CommentRow` Tier 2 with three optional slots). `ThreadHead` is a third deletion forced by the visual contract (its content moves into the card).

---

## 2. Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| AC §384 says action invocation "dispatches to L7's response-as-event path" with citation "PR #40 response endpoint". | `POST /api/conversations/responses` was deleted in L1 step5 (`packages/server/src/routes/conversations.ts:11`). Verdicts now go through `POST /api/threads/:id/messages` with `type: "verdict"`, which already emits `thread_resolved` to the event bus (`packages/server/src/routes/threads.ts:530`). The agent runtime listens for that event and unblocks the agent. | Use the canonical `POST /api/threads/:id/messages` surface — same endpoint `ThreadShell` already calls today. **CONFUSION** flagged below; proceeding with (A). |
| Approved design §2.3 deletes only `ReviewHeader` and `ReviewVerdictBar`. | `ThreadHead` (Tier 2) renders the review title + reasoning + artifact ABOVE the stream — exactly the structure L11 removes. The promoted card replaces it inline. | Also delete `ThreadHead` + `ThreadHead.stories.tsx` + `ThreadHead.test.tsx`. The `headCollapsePredicate` helper stays (still used by `isBlocking` and the new promotion-rule helper). |
| Spec §378 implies multiple Work surfaces render rich messages. | grep across `packages/web/src/` confirms `ThreadShell` is mounted only by `ConversationsReview.tsx`. `ConversationsChat` is a queue list (`ThreadRow`), not a thread renderer. No other route mounts the rich-message stream. | Route-checklist (§7) covers exactly one route: `/conversations/review?id=*`. |
| Approved design §3 candidates filter requires `m.blocking === true`. | Message has no `blocking` flag. The `Thread`-level `isBlocking(thread, messages, agentSessionState)` predicate (concept §4.5.5) returns true iff the agent is actively waiting on this thread. | Promotion rule derives `m.blocking` as `isBlocking(thread, messages, sessionState) && m.id === headCollapsePredicate(messages).headMessageId`. Implementation = pure helper `promotedRichMessageId(thread, messages, sessionState)` in `@hyperidle/shared`. |
| Approved design §9 Q5 leaves `clientKey` generator open. | Existing `ThreadShell` generates `verdict-${headMessageId}-${Date.now().toString(36)}` — NOT idempotent on retry. | Generate `crypto.randomUUID()` at click-handler entry; hold in card-local state for the saving phase so a Retry from the error alert reuses the same key (200 response) and a fresh click on a different decision generates a new key. |
| Approved design §9 Q4 leaves `--card-max-h` token open. | Token does not exist in `tokens.css`. | Add `--card-max-h: 70vh` (default) and `--card-max-h: 60vh` at viewport ≤ 768px in `tokens.css`. |

### CONFUSION: L7 dispatch endpoint
I'm uncertain about: AC §384 references "L7 response-as-event path (PR #40)" but the codebase shows that path was deleted in L1 step5 — the canonical surface is `POST /api/threads/:id/messages` with `type: "verdict"` (already emits `ThreadResolvedEvent` which the agent runtime listens on to unblock).

Options:
- A) Use `POST /api/threads/:id/messages` (current canonical surface) — same path `ThreadShell` already uses today; the unblock-the-agent contract is preserved by `thread_resolved` event emission.
- B) Reintroduce a separate L7 response endpoint — out of scope for L11 and against the L1-step5 decision.

Proceeding with (A). Flag for review during `/architecture-critique`.

---

## 3. Acceptance criteria → 1:1 verification map

| # | AC (paraphrased from spec) | Verification method |
|---|---|---|
| AC-1 | Rich messages render their affordances inline as part of the message stream (no top toolbar). | Vitest: `RichMessageCard.test.tsx` renders a card from a review-payload `Message` and asserts (a) `data-component="RichMessageCard"`, (b) the artifact slot is rendered inline within the card body, (c) the action footer is rendered inside the card (`section[data-component="RichMessageCard"]` contains `[role="toolbar"][aria-label="Verdict actions"]`). |
| AC-2 | `ReviewHeader.tsx` (`shell/ReviewHeader.tsx:153-178` keydown + 7 shortcuts) is deleted. | Filesystem: `packages/web/src/shell/ReviewHeader.tsx` and `.stories.tsx` and the two `__tests__/ReviewHeader*.test.tsx` files do not exist (assert via Vitest `existsSync` test in `packages/web/src/__tests__/L11-removal.test.ts` plus a `git status` audit step in `/check-definition-of-done`). |
| AC-3 | The 7 keyboard verb shortcuts (A / R / X / S / C / I / E) are removed. | Vitest + Playwright: `packages/web/e2e/L11-rich-messages.spec.ts` opens a review thread, **focuses `document.body` (no input element active)** to reproduce the original keydown listener's trigger condition, dispatches `keydown` events for each of A/R/X/S/C/I/E via `page.keyboard.press()`, and asserts no verdict POST occurs (`page.route` interceptor counter stays at 0). Plus a Vitest grep test that asserts no `addEventListener("keydown"` listener exists in `packages/web/src/**/*.tsx` for verdict handling. |
| AC-4 | `ReviewVerdictBar` Tier 2 is deleted. | Filesystem: `packages/design-system/src/ReviewVerdictBar.tsx` + `.stories.tsx` + `packages/web/src/__tests__/ReviewVerdictBar.test.tsx` do not exist. The export is removed from `packages/design-system/src/index.ts`. Verified by a Vitest grep test + `bun run check` (any remaining import fails compile). |
| AC-5 | `ThreadHead` is deleted (forced by visual contract — the head moves into the card). | Filesystem: `packages/design-system/src/ThreadHead.tsx` + `.stories.tsx` + `packages/web/src/__tests__/ThreadHead.test.tsx` do not exist; `ThreadShell` no longer imports `ThreadHead`. Verified by `bun run check`. |
| AC-6 | At most one `RichMessageCard` per thread, deterministically chosen by the promotion rule (`(blocking, oldest first)`). | Vitest: `promotedRichMessageId.test.ts` exhaustively covers (a) zero rich messages → `null`, (b) one unresolved blocking review → its id, (c) two unresolved blocking reviews → the older one, (d) unresolved but non-blocking thread → `null`, (e) resolved review → `null`. Plus `ThreadShell.test.tsx` asserts `screen.queryAllByTestId("rich-message-card")` length ≤ 1 across each scenario. |
| AC-7 | Subsequent unresolved rich messages render as the rich-row variant of `CommentRow`. | Vitest: `CommentRow.richVariant.test.tsx` renders a thread with two unresolved blocking reviews; asserts the older message renders as `RichMessageCard` and the newer as `CommentRow` with `data-variant="rich-review"` carrying `richHeader` + `richBody` + `richActions` slot content. |
| AC-8 | Review messages embed L3 ArtifactView (embedded "output" layout) inline. | Vitest: card with review payload has `[data-component="ArtifactView"]` mounted inside `[data-component="RichMessageCard"]`. Playwright: opens a review thread with a `text_diff` artifact; asserts the diff lines render inside the card. |
| AC-9 | Questionnaire messages embed the constrained answer set as buttons inline. | Vitest: card with questionnaire payload renders one `<button>` per `payload.options` entry inside the card's `[role="toolbar"][aria-label="Answer options"]`. The first option is `btn-primary`, the rest are `btn-ghost`. |
| AC-10 | No separate action-bar component. | Static check: `bun run check` after deletions; grep test asserts no file matches `ThreadActionBar` / `ReviewVerdictBar` references. |
| AC-11 | Action invocation dispatches via the canonical thread-message endpoint; the agent waiting on the response is unblocked. | **Verified for `kind="review"` only.** Questionnaire dispatch is render-only per § 5.6 CONFUSION resolution (C); a separate story adds typed answer commit. Vitest (server): existing `packages/server/src/routes/__tests__/threads.test.ts` already proves verdict POST emits `ThreadResolvedEvent`. Playwright: opens `/conversations/review?id=t-review-1`, focuses the document body (no input element active), clicks `Approve` in the card footer, asserts the POST body shape `{ type: "verdict", payload: { decision: "approve", resolvesMessageId: <head id> }, clientKey: <uuid> }`, asserts the verdict CommentRow renders with `APPROVED` label, asserts `[data-state="resolved"]` on the resolved card. |
| AC-12 | Vitest covers each rich-message type rendering its inline affordance + invocation dispatches via the canonical surface. | Covered by the Vitest tests in AC-1, AC-8, AC-9, AC-11. |
| AC-13 | Playwright e2e covers the full unblock flow. | `packages/web/e2e/L11-rich-messages.spec.ts` per AC-11. Plus the existing `threads.spec.ts:380` "verdict click resolves" test must be REWRITTEN to target the card footer instead of the deleted `ReviewVerdictBar`. |
| AC-14 | `bun run check` + `bun run lint` + `bun run test` all green; full e2e suite green. | Pipeline gate. |

---

## 4. Concept fit (no concept drift)

This story consumes the L1 Thread primitive and L3 Artifact primitive without modifying the closed enums (`MessageType`, `ArtifactKind`, `VerdictDecision`). It introduces zero new server primitives, zero new database tables, zero new API endpoints. The only shared-package addition is one pure helper (`promotedRichMessageId`).

Compliance with rejection list (`approved.md` §11) — every item is refused:
- (1) No top header. (2) No thin presentation header. (3) No keyboard verb shortcuts. (4) No emoji reactions. (5) No emojis in code. (6) No drop-shadow on the card. (7–8) Reasoning collapsed-by-default for long, inline for short. (9) One card max via promotion rule. (10) No left-gutter rule from variant C — surface lift + optional `--danger` left-border only. (11) No `AnchorFrame`/`MessageContainer` abstraction. (12) No checkmark celebrations or animated progress. (13) No `…` overflow popover for verdicts — all 5 visible. (14) No composer slash-shortcuts. (15) `ReviewVerdictBar` deleted. (16) `MessageType` enum closed. (17) `ArtifactKind` enum closed. (18) Verdict-payload renders as a normal `CommentRow`, never as a card.

---

## 5. Design — types, schemas, contracts

### 5.1 Schemas (none)

DB: unchanged. No migration. The Drizzle `messages` table already stores `review` / `questionnaire` / `verdict` / `plain` types; payloads carry the rich content.

Server routes: unchanged. `POST /api/threads/:id/messages` already supports verdict dispatch with idempotency, race protection, and event emission.

### 5.2 Types — new exports from `@hyperidle/shared`

```ts
// packages/shared/src/thread.ts (additions)

/**
 * Approved.md §3 — promotion rule. Pure derivation over a thread's messages.
 * Returns the id of the SINGLE rich message that should render as a card,
 * or null when the thread has no candidate.
 *
 * Candidate predicate:
 *   m.type ∈ {"review","questionnaire"}
 *   AND m.resolvedAt === null
 *   AND m is the head per headCollapsePredicate(messages)
 *   AND isBlocking(thread, messages, sessionState) === true
 *
 * "Oldest unresolved blocking" reduces to "the head when the thread is
 * blocking" because headCollapsePredicate already returns the most-recent
 * unresolved review/questionnaire and blocking is a thread-level property.
 * The rule is therefore: at most one promoted card per thread.
 */
export function promotedRichMessageId(
  thread: Thread,
  messages: ReadonlyArray<Message>,
  sessionState: AgentSessionStateSnapshot,
): MessageId | null;
```

### 5.3 Types — new design-system component

```ts
// packages/design-system/src/RichMessageCard.tsx

export interface RichMessageCardSender {
  id: string;
  name: string;
  role?: string;
  avatarUrl?: string;
}

export type RichMessageCardKind = "review" | "questionnaire";

export interface RichMessageCardProps {
  message: Message; // narrowed at use-site to type='review' | 'questionnaire'
  sender: RichMessageCardSender;
  /**
   * Banner-thread-level signal that lifts the --danger left-border.
   * Derived by the page from isBlocking(thread, messages, sessionState).
   */
  blocking: boolean;
  /**
   * Card body. Page resolves the artifact ref and mounts <ArtifactView>.
   * The card adds no chrome around the slot beyond its own padding.
   */
  artifactSlot?: ReactNode;
  /**
   * Action invocation — fires when a footer button is clicked. Payload is
   * a discriminated union over the card's `kind`.
   */
  onAction: (action: RichMessageCardAction) => void;
  /**
   * Saving / error state — page-controlled. `idle` shows the action footer;
   * `saving` shows the "Saving…" strip (min-show 80ms enforced by caller);
   * `error` shows the inline alert with a Retry callback supplied via
   * onAction({ kind: "retry", clientKey }).
   */
  state: { phase: "idle" } | { phase: "saving" } | { phase: "error"; reason: string };
  /**
   * Resolved card state — when supplied, the card renders the resolved
   * single-line summary; click on Re-expand fires onReexpandToggle.
   */
  resolved?: {
    decision: VerdictDecision;
    actor: string;
    timestamp: string;
    reExpanded: boolean;
    onReexpandToggle: () => void;
  };
}

export type RichMessageCardAction =
  | { kind: "verdict"; decision: VerdictDecision; clientKey: string }
  | { kind: "answer"; option: string; clientKey: string }
  | { kind: "retry"; clientKey: string };
```

### 5.4 Types — `CommentRow` extension (rich-row variant)

```ts
// packages/design-system/src/CommentRow.tsx (extended)

export interface CommentRowRichSlots {
  /**
   * Tag + meta strip + (always-inline) reasoning. Designed to mirror the
   * promoted card's metadata but rendered in the row body column. Variant
   * marker `data-variant="rich-review" | "rich-questionnaire"`.
   */
  richHeader?: ReactNode;
  /** ArtifactView mounted inline, no card chrome. */
  richBody?: ReactNode;
  /** Flex-wrap row of buttons — same DaisyUI variants as the card footer. */
  richActions?: ReactNode;
}

export interface CommentRowProps extends CommentRowRichSlots {
  message: Message;
  sender: CommentRowSender;
  showSenderHeader: boolean;
  inlineAnchor?: string;
}

// Render rule: when any of richHeader/richBody/richActions is supplied AND
// message.type ∈ {"review","questionnaire"}, the row body renders the slots
// in place of the standard renderBody() output. Other message types ignore
// the slots (defensive).
```

### 5.5 Types — `ThreadShell` integration

```ts
// packages/design-system/src/ThreadShell.tsx (modified)

export interface ThreadShellProps {
  thread: Thread;
  messages: ReadonlyArray<Message>;
  identities: Record<string, ThreadShellIdentity>;
  /** Page-supplied artifact resolver — same shape as today. */
  artifactSlot?: (ref: ArtifactRef) => ReactNode;
  onAppendMessage: (input: ThreadShellAppendInput) => Promise<void>;
  loading?: boolean;
  error?: string;
  agentSessionState?: AgentSessionStateSnapshot;
  hostTitle?: string;
  hostHref?: string;
}

// Internal: ThreadShell calls promotedRichMessageId(...) to pick the card.
// The promoted message renders as <RichMessageCard>. Other unresolved
// review/questionnaire messages render via <CommentRow> with the rich
// slots filled. All other messages render as plain CommentRow.
//
// ThreadShell stops mounting <ThreadHead> entirely. Stops mounting
// <ReviewVerdictBar>. The IntersectionObserver + verdict-bar-wrapper is
// removed (sticky-within-card is pure CSS, not JS-coordinated).
```

### 5.6 API surface — dispatch endpoint and payload shape

**Endpoint.** `POST /api/threads/:id/messages` (existing, unchanged).

**Headers.** `Content-Type: application/json`. `X-Identity` carries the founder identity (existing convention).

**Payload — verdict.**
```json
{
  "type": "verdict",
  "payload": {
    "decision": "approve" | "approve-with-comments" | "request-changes" | "edit" | "reject",
    "resolvesMessageId": "<promoted review message id>"
  },
  "clientKey": "<uuid v4 generated at click-handler entry>"
}
```

**Payload — questionnaire answer.** A questionnaire answer is NOT a verdict (it does not terminate via the verdict closed enum). The architectural decision: questionnaire answers commit as a **plain message** with `payload.text` set to the chosen option string. This avoids extending `MessageType` (rejection list item 16) and keeps the answer rendered in the stream as a normal `CommentRow`. The questionnaire's `resolvedAt` flips when a separate verdict-author marks it answered (out of scope for L11) — the visual "resolved" state in the card is driven by `m.resolvedAt !== null`. **CONFUSION** flagged below.

```json
{
  "type": "plain",
  "payload": { "text": "<chosen option string>" },
  "clientKey": "<uuid v4>"
}
```

### CONFUSION: questionnaire dispatch shape
I'm uncertain about: There is no `answer` message type in the closed `MessageType` enum, and rejection list item 16 forbids extending it. The existing `verdict` semantics terminate a *review* via `resolvesMessageId`; nothing in the L1 contract describes how a questionnaire transitions to `resolvedAt !== null`.

Options:
- A) Plain message with `text=<option>`. Renders cleanly as a `CommentRow`. Does NOT mark the questionnaire `resolvedAt`. The questionnaire stays in the promoted slot until something else resolves it. Risk: card never collapses → infinite "open" state.
- B) `verdict` message with a synthetic decision mapped from the option index — abuses the verdict enum.
- C) Out of scope for L11. The questionnaire answer-set renders, but clicking only fires `onAction` upward; the page wires nothing. The Playwright test for AC-11 covers only the review path; the questionnaire AC is satisfied by "renders the answer buttons" (AC-9), not "click commits".

Proceeding with (C). Approved.md §10's mapping for questionnaire is "renders the constrained answer set inline" — it does not require commit semantics. The card calls `onAction({ kind: "answer", option, clientKey })`; the page logs/no-ops. A follow-up story (track-L) can introduce a typed answer-message later. Flag for review.

### 5.6.1 Artifact resolver contract (Plan reconciliation)

**Reality check (grep `packages/server/src/routes/`):** there is NO `/api/artifacts/:id` endpoint. `artifactRef` is carried in the message payload as `{ id, kind }` only — there is no shipped surface to fetch the artifact body by id. L3's primitive ships only the `<ArtifactView>` render component (a pure renderer over already-fetched data); no L3 fetcher endpoint exists in this branch.

**Decision for L11.** The page does NOT introduce a new artifact-fetch endpoint. Three options were considered:

- A) Stub: mount `<ArtifactView>` with a fixture-derived `data_metrics` shape using the `artifactRef.kind` as the `shape` and an empty `data` placeholder. Card body shows the metadata strip + an empty body. AC-8 is satisfied by "artifact view family is mounted inline" (the discriminator + chrome render correctly), but the diff/preview body is empty.
- B) Inline the artifact body in the message payload — extend `ReviewPayload` with `artifactInline?: ArtifactViewProps`. Rejected: violates rejection list item 17 (no new ArtifactView shapes) AND closes the channel for L12 / track-L follow-ups that should fetch artifacts properly.
- C) Block L11 on a new track-L story for an artifact-by-id endpoint. Rejected: scope creep; L11's spec does not authorise a new server endpoint.

**Plan picks (A) with this contract:**

```ts
// packages/web/src/pages/ConversationsReview.tsx
function resolveArtifactSlot(ref: ArtifactRef): ReactNode {
  // L11 stub: render the L3 ArtifactView with the ref's shape + an empty
  // body. Carries the metadata strip showing the `kind` so the user knows
  // what kind of artifact is referenced. A follow-up story (post-L11)
  // wires GET /api/artifacts/:id and replaces this stub with a real fetch.
  return <ArtifactView shape={ref.kind} data={emptyDataForShape(ref.kind)} />;
}
```

The empty-data helper returns the minimal valid shape for each `ArtifactKind`:
- `text_diff` → `{ hunks: [] }` (renders "No diff available")
- `content_preview` → `{ html: "", metadata: [] }`
- `visual_comparison` → `{ before: { label: "before", src: "" }, after: { label: "after", src: "" } }`
- `action_summary` → `{ actions: [] }` (renders "No actions to display")
- `data_metrics` → `{ headlines: [], charts: [] }` (renders "No metrics available")

AC-8's verification adjusts accordingly:

> Vitest: card with review payload has `[data-component="ArtifactView"]` mounted inside `[data-component="RichMessageCard"]` with `data-shape="<ref.kind>"`. Playwright: opens a review thread; asserts the artifact section is mounted (kind discriminator + ArtifactView root). The diff body content is NOT asserted in L11 (deferred to the artifact-fetch follow-up).

This is a deliberate scope cut, captured in the plan and surfaced explicitly to `/check-definition-of-done`.

### 5.7 Token additions

`packages/design-system/src/tokens.css`:
```css
:root {
  /* ... existing tokens ... */
  --card-max-h: 70vh;
}
@media (max-width: 768px) {
  :root { --card-max-h: 60vh; }
}
```

Used by `RichMessageCard`'s outer container: `max-height: min(var(--card-max-h), max-content)`. The artifact body inside has `overflow-y: auto`; the action footer is `position: sticky; bottom: 0`.

### 5.8 Component-budget accounting

| Action | File | Tier | Net |
|---|---|---|---|
| Delete | `packages/web/src/shell/ReviewHeader.tsx` | 3 | −1 |
| Delete | `packages/design-system/src/ReviewVerdictBar.tsx` | 2 | −1 |
| Delete | `packages/design-system/src/ThreadHead.tsx` | 2 | −1 |
| Add | `packages/design-system/src/RichMessageCard.tsx` | 2 | +1 |
| Extend (no new component) | `packages/design-system/src/CommentRow.tsx` rich slots | 2 | 0 |
| **Net** | | | **−2** |

Budget improves. `RichMessageCard` covers ≥ 2 contexts (review + questionnaire) — clears the 2+ minimum for a Tier 2 component.

---

## 6. Files — created / modified / deleted

### 6.1 Created (10 files)

| Path | Purpose |
|---|---|
| `packages/design-system/src/RichMessageCard.tsx` | New Tier 2 component (§5.3). |
| `packages/design-system/src/RichMessageCard.stories.tsx` | Stories: Idle (review), Idle (questionnaire), Saving, Error, Resolved (collapsed), Resolved (re-expanded), Loading, Long-reasoning collapsed, Short-reasoning inline. |
| `packages/design-system/html/RichMessageCard/index.html` | DS HTML reference (mirrors `L11-approved/mockup.html`'s card). |
| `packages/web/src/__tests__/RichMessageCard.test.tsx` | Unit tests for AC-1, AC-8, AC-9, AC-11 (rendering + dispatch payload shape). |
| `packages/web/src/__tests__/CommentRow.richVariant.test.tsx` | Tests for AC-7 — rich-row slot rendering. |
| `packages/web/src/__tests__/promotedRichMessageId.test.ts` | Pure helper tests for AC-6 (5 scenarios). |
| `packages/web/src/__tests__/L11-removal.test.ts` | Asserts deleted files no longer exist (AC-2, AC-4, AC-5) + grep for removed verbatim strings ("ReviewHeader", `addEventListener("keydown"` in shell). |
| `packages/web/e2e/L11-rich-messages.spec.ts` | E2E: open review thread → card mounts inline → click Approve → POST canonical surface → verdict CommentRow appears + thread.resolvedAt set; plus 7-shortcut keydown sweep asserts no POST. |
| `packages/web/src/__tests__/ThreadShell.promotion.test.tsx` | Tests for the promotion rule integration in ThreadShell + that no `ThreadHead`/`ReviewVerdictBar` mount. |
| `docs/work-packages/L11-plan.md` | This file. |

### 6.2 Modified (8 files)

| Path | Change |
|---|---|
| `packages/shared/src/thread.ts` | Add `promotedRichMessageId` pure helper (§5.2). |
| `packages/shared/src/index.ts` | Re-export `promotedRichMessageId`. |
| `packages/design-system/src/CommentRow.tsx` | Add `richHeader` / `richBody` / `richActions` optional slots; render rich body when any slot supplied AND message.type ∈ review/questionnaire (§5.4). |
| `packages/design-system/src/CommentRow.stories.tsx` | Add stories for the three rich-row states (review, questionnaire, with-artifact). |
| `packages/design-system/src/ThreadShell.tsx` | Replace ThreadHead+ReviewVerdictBar mount with the promotion-rule render: promoted message → RichMessageCard, other unresolved rich messages → CommentRow with rich slots. Drop `verdictBarVisible`, `IntersectionObserver`, `verdictBarRef`, `artifactRegionRef`, `verdict-sentinel`, `verdict-bar-wrapper` data-testids and the `Unresolved review · acting required` link (§5.5). **The `ThreadShellProps` public surface is INTENTIONALLY UNCHANGED — this is a refactor under a stable interface; the only consumer (`ConversationsReview`) needs no signature update.** Justification for dropping the `Unresolved review · acting required` link: approved.md §6 makes `ThreadHostBanner` the only chrome above the stream; approved.md §5.7 puts the action footer sticky-within-card so the footer is visible while the card is in view; the card itself sits in the stream so the natural gesture is to scroll up to it. The link is rendered redundant by the new layout. |
| `packages/design-system/src/index.ts` | Add `RichMessageCard` exports. Remove `ReviewVerdictBar` exports (`ReviewVerdictBarProps`, `VerdictGrammarAction`, `ReviewVerdictBar`). Remove `ThreadHead` exports. |
| `packages/design-system/src/tokens.css` | Add `--card-max-h: 70vh` + mobile override (§5.7). |
| `packages/web/src/pages/ConversationsReview.tsx` | Page resolves `agentSessionState` (currently undefined) by either fetching from `/api/agents/me/session` (out of scope — leave undefined for L11; isBlocking returns false → promotion rule still fires once the head is set; **CONFUSION** flagged) and passes `artifactSlot` to mount `<ArtifactView shape={ref.kind} data={...}>`. Add fetch for the artifact data by `artifactRef.id`. |

### CONFUSION: agentSessionState wiring
I'm uncertain about: `ThreadShell` accepts `agentSessionState?` for the blocking signal, but `ConversationsReview` does not pass it today. The promotion rule predicate uses `isBlocking(thread, messages, sessionState)`. If the session state is undefined, `isBlocking` returns `false`, which means `promotedRichMessageId` returns `null` — no card mounts even when a review is open.

Options:
- A) Loosen the predicate for L11: a review/questionnaire with `resolvedAt === null` always promotes, regardless of blocking. The `--danger` left-border still depends on the proper blocking signal. This matches the visual intent that an unresolved review is *visible* even when the agent is not actively waiting.
- B) Wire `agentSessionState` from the page via a new `/api/agents/me/session` fetch — out of scope for L11 (L7-territory).

Proceeding with (A). The promotion rule §3 is "exactly one card per thread, deterministically chosen by `(blocking desc, createdAt asc)`" — under (A) we fall back to `(createdAt asc)` when blocking is unknown, still deterministic, still one card max. The blocking signal lifts the left-border independently. Flag for review.

Adjusted helper signature:

```ts
// REVISED §5.2 — drop the sessionState dependency from promotion.
export function promotedRichMessageId(
  messages: ReadonlyArray<Message>,
): MessageId | null;
// "oldest unresolved review/questionnaire", iterating ascending createdAt;
// returns null when none. Blocking does NOT gate promotion under (A).
```

### 6.3 Deleted (10 files)

| Path | Reason |
|---|---|
| `packages/web/src/shell/ReviewHeader.tsx` | Approved.md §2.3 + AC-2. |
| `packages/web/src/shell/ReviewHeader.stories.tsx` | Component deleted. |
| `packages/web/src/__tests__/ReviewHeader.test.tsx` | Component deleted; tests are not protected. |
| `packages/web/src/__tests__/ReviewHeader.blocking.test.tsx` | Same. The J4 "Pause when blocking" contract migrates: blocking is now signalled by the card's left-border (already covered by `RichMessageCard.test.tsx` blocking-prop assertion). |
| `packages/design-system/src/ReviewVerdictBar.tsx` | Approved.md §2.3 + AC-4. |
| `packages/design-system/src/ReviewVerdictBar.stories.tsx` | Component deleted. |
| `packages/web/src/__tests__/ReviewVerdictBar.test.tsx` | Component deleted. |
| `packages/design-system/src/ThreadHead.tsx` | Visual contract (§2 + §10 of approved.md) absorbs the head into the card. |
| `packages/design-system/src/ThreadHead.stories.tsx` | Component deleted. |
| `packages/web/src/__tests__/ThreadHead.test.tsx` | Component deleted. |

---

## 7. Route checklist (every UI surface that renders rich messages)

| Route | File | Renders rich messages? | Change required |
|---|---|---|---|
| `/conversations/review?id=*` | `packages/web/src/pages/ConversationsReview.tsx` | YES — mounts `ThreadShell` | Pass `artifactSlot` resolver. |
| `/conversations/chat` | `packages/web/src/pages/ConversationsChat.tsx` | NO — queue list of `ThreadRow` only, no message body render | None. |
| `/conversations/review` (no id) | Same as above | NO — `EmptyState` | None. |
| Submenu thread list (any rail/submenu surface) | `packages/web/src/components/Submenu*` (search confirmed none mount `ThreadShell`) | NO | None. |
| WorkBet / WorkTeam / KnowledgeDetail / WorkPortfolio | `packages/web/src/pages/Work*.tsx` | NO — none mount `ThreadShell` (verified via grep) | None. |
| All Tier 1/2 design-system component pages at `/designsystem` | `packages/design-system/src/*.stories.tsx` | NO (in isolation) — but `ThreadShell.stories.tsx` and the new `RichMessageCard.stories.tsx` render isolated states | Add stories for new component (covered §6.1). |

**Single mount audit.** `grep -rn "ThreadShell" packages/web/src/` returns one production caller: `ConversationsReview.tsx`. The story enumeration in `TRACK-L.md` § L11 is therefore satisfied by changing exactly that route.

---

## 8. Protected tests (must not regress)

These existing tests cover behaviour that L11 must preserve. Their assertions MUST NOT change. (`/check-definition-of-done` audits via `git diff --name-only` — these files appear only as additions for new test cases, never as edits to existing assertions, except for the explicit migrations called out below.)

```
protectedTests:
  - packages/server/src/routes/__tests__/threads.test.ts          # canonical message-append surface incl. verdict authz, idempotency, race, event emission
  - packages/server/src/routes/__tests__/threads.integration.test.ts
  - packages/shared/src/__tests__/thread.test.ts                  # MessageType enum, headCollapsePredicate, isBlocking
  - packages/web/src/__tests__/ThreadShell.test.tsx               # sender-grouping, populated-chat, populated-issue (issue case migrates — see migrations below)
  - packages/web/src/__tests__/ThreadHostBanner.test.tsx          # banner is the ONLY top-of-pane chrome after L11
  - packages/web/src/__tests__/CommentRow.test.tsx                # if it exists; plain/verdict/inline/redacted variants
  - packages/web/src/__tests__/router.test.tsx                    # SPA router mount including ConversationsReview — must not regress on import-graph changes
  - packages/web/e2e/threads.spec.ts                              # parts that test plain-thread + composer round-trip; review-shape parts MIGRATE — see migrations below
  - packages/web/e2e/conversations-surface.spec.ts                # navigation + landing
  - packages/web/e2e/accessibility.spec.ts                        # a11y rules independent of L11
  - packages/web/e2e/touch-targets.spec.ts                        # AQ-015 rule (card buttons must satisfy)
  - packages/web/e2e/density-toggle.spec.ts                       # density toggle independent
  - packages/design-system/src/__tests__/density-tier.test.ts     # density-static/aware classification (RichMessageCard must classify correctly)
  - packages/design-system/src/__tests__/visual-regression.test.ts# DS pixel-diff
  - packages/design-system/src/__tests__/themes.test.ts           # Lucid Dark/Light parity
```

### Migrations (intentional, narrow edits)

The following existing tests MUST be edited because they assert on the deleted surfaces. The edits are scope-limited to the call sites; new assertions REPLACE old ones one-for-one.

| File | Old assertion | New assertion |
|---|---|---|
| `packages/web/e2e/threads.spec.ts:219-252` (`review-shape thread renders ThreadHead + ReviewVerdictBar inline`) | Asserts `[data-testid='thread-head']` + sticky `ReviewVerdictBar` with 5 buttons. | Asserts `[data-component='RichMessageCard']` is mounted inline AS A `<li>` in the stream + footer toolbar exposes the 5 binding verdicts. |
| `packages/web/e2e/threads.spec.ts:380-459` (`verdict click resolves the review`) | Clicks `getByRole("button", { name: /^approve$/i })` (the bar). | Clicks the card's footer Approve button (same selector still resolves once the card mounts; the assertion that `[data-testid='thread-head']` unmounts becomes assertion that `[data-component='RichMessageCard'][data-state='resolved']` mounts). |
| `packages/web/src/__tests__/ThreadShell.test.tsx:67-138` (`populated-issue` + `composer-fallback`) | Asserts `[data-testid='thread-head']` mounts + `Unresolved review · acting required ↑` link. | Asserts `[data-component='RichMessageCard']` mounts inline; `Unresolved review` link is REMOVED (the card is in-stream so there's nothing to scroll to — the link served the sticky-bar's off-viewport case). |
| `packages/web/src/__tests__/ConversationsReview.reasoning.test.tsx` | Asserts reasoning renders inside `[data-testid='thread-head']`. | Asserts reasoning renders inside `[data-component='RichMessageCard']` per Fix 2 (collapsed-by-default for >1 line, inline for short). |

These migrations are explicit and scope-bounded. No assertions are dropped silently.

---

## 9. Failure modes & coverage

| Failure | Trigger | Behaviour | Test |
|---|---|---|---|
| Long artifact overflows the card. | Review with a 200-line diff. | `RichMessageCard` outer `max-height: min(var(--card-max-h), max-content)`. Artifact body has `overflow-y: auto`. Action footer remains `position: sticky; bottom: 0`. | Vitest: render with a long-diff fixture; assert the card's computed style + `[data-component='ArtifactView']` parent has scrollable overflow. Playwright: scroll inside the card; assert footer remains visible. |
| Sticky footer fallback (iOS Safari / unsupported nested sticky). | Browser without nested-sticky support. | Pure CSS — `position: sticky` falls back to `static`; footer renders at natural bottom. | Vitest snapshot of computed `position` value; Playwright in WebKit project asserts footer is at least visually present after scrolling to card bottom. |
| Multiple unresolved rich messages. | Two open reviews + one open questionnaire in one thread. | Promotion rule selects oldest. Other two render as rich-row `CommentRow`. | `promotedRichMessageId.test.ts` scenario (c). `CommentRow.richVariant.test.tsx` asserts the two newer messages render with the rich slots filled. |
| Agent already responded race. | Founder A clicks Approve, founder B clicks Reject simultaneously; first commits. | Server returns 409 `verdict_race` to the loser (existing `routes/threads.ts:507`). Card transitions to `state.phase = "error"; reason = "Review was resolved by a concurrent verdict"`. Inline alert offers Retry — but Retry will fail again (409). **On any non-200/201 response, the page re-fetches `GET /api/threads/:id` after surfacing the error to the card; the next render re-derives the promotion rule (resolved card collapses, blocking next promotes if any).** Path forward: the user clicks Retry → 409 → page refetches → card transitions to resolved single-line summary. | Vitest: card with state.phase=error renders the alert + Retry. E2E: stub the POST to return 409 once then GET to return resolved-state fixture; click Retry; assert the card transitions to `[data-state='resolved']`. |
| Idempotency conflict on retry with different payload. | User clicks Approve, network fails, user clicks Reject (different decision) but client reuses the clientKey by accident. | Server returns 409 `idempotency_conflict`. Card shows the error alert. | Server-route test exists (`threads.test.ts`). New: client `RichMessageCard.test.tsx` asserts that a fresh click *generates a new clientKey* — so the bug cannot occur from this codepath. |
| Idempotent retry from the error alert. | User clicks Approve, network drops mid-response, user clicks Retry. | Card reuses the same clientKey it generated for the first click; server returns 200 (not 201) with the original message. Page refetches; card collapses to resolved. | Vitest: render error state; click Retry; assert the second `onAction` payload carries the same `clientKey` as the first. E2E: fakelog the request log; assert two POSTs with identical clientKeys. |
| Promoted message becomes resolved while another unresolved candidate exists. | Thread has reviews A (older) and B (newer), both unresolved. A is promoted. User approves A. | Card animates to resolved single-line summary. Promotion rule re-evaluates → B promotes. | E2E: open thread with two unresolved reviews; approve the card; assert the second one promotes (`[data-component='RichMessageCard']` count remains 1 throughout). |
| Card collapsed summary truncates at width. | Very long review title in resolved state. | `text-overflow: ellipsis; white-space: nowrap; overflow: hidden` on `.verdict-title`. Re-expand button stays visible at right margin. | Vitest snapshot of computed style on a > 200-char title fixture. |
| Reasoning is short (≤ 80 chars + single string). | `reasoning = ["Pick before deploy."]`. | Renders inline with no toggle (Fix 2). | `RichMessageCard.test.tsx` scenario "short-reasoning". |
| Reasoning is long. | 3 multi-line entries. | Renders the `> N reasons` toggle, collapsed by default. | `RichMessageCard.test.tsx` scenario "long-reasoning collapsed by default". |
| Artifact fetch failure. | `artifactSlot` resolves to `<ArtifactView error="…" />`. | Card body shows ArtifactView's existing error state. Footer stays interactive but a warning row above the buttons reads `Cannot decide without seeing the artifact — Retry`. | Vitest: render card with a slot returning `<ArtifactView error="404" />`; assert warning row visible + footer enabled. |
| Verdict commit failure. | `onAction` throws / page sets `state.phase = "error"`. | Card replaces footer with `<div role="alert" class="alert">Could not commit verdict — Retry</div>`. | Vitest: render card with `state.phase="error"`; assert the alert role. |
| Card resolved but agent has not yet been unblocked. | Race window between `thread_resolved` event emission and the agent runtime's listener picking it up. | Out of scope visually — the agent runtime's behaviour is independent of the card's resolved-state render. The card collapses on POST 201 success, not on agent-unblock confirmation. | No new test; existing server-route test confirms the event is emitted. |
| Empty / loading / error / populated / resolved / re-expanded states (approved.md §4). | Various. | Each has a Story + Vitest test. | `RichMessageCard.stories.tsx` exports the 8 states; `RichMessageCard.test.tsx` covers them. |

---

## 10. Security & abuse cases

| Concern | Applicable? | Mitigation |
|---|---|---|
| Rate-limit on POST. | N/A for L11. | Verdict POST volume is bounded by founder click intent (≤ ~10/min by founder workflow). The wider rate-limit concern applies to all `POST /api/threads/*/messages` callers (composer, agent-authored messages, verdicts) and is owned outside L11. L11 changes the *trigger* of the verdict POST (card footer instead of sticky bar) but not the *volume* — same founder, same surface, same number of clicks. Track-G/security work owns the cross-cutting rate-limit story. |
| Input-trust boundary for agent-authored content. | YES — `payload.title`, `payload.reasoning`, `payload.options`, `payload.question` come from agents. | (a) Server already Zod-validates message inputs (`packages/server/src/routes/threads-schema.ts`). (b) Client-side: rendering text uses React JSX text nodes (auto-escaped). The reasoning toggle, title, and meta strip never use `dangerouslySetInnerHTML`. (c) `<ArtifactView>` already sanitises `content_preview` HTML via DOMPurify (verified `ArtifactView.tsx:141`). |
| Secret-handling for new credential surface. | NO — no new credentials introduced. | N/A. |
| Path-traversal for path inputs. | NO — no path inputs. | N/A. |
| SSRF for outbound URLs. | NO — no outbound URL fetches from the card. The artifact fetch is page-side, against the internal API. | N/A. |
| Replay attacks on verdict. | YES. | Server enforces `(thread_id, sender_id, client_key)` unique constraint with idempotency-conflict (409 if same key + different payload, 200 if same key + same payload). Client generates `crypto.randomUUID()` per click intent. |
| Verdict authz (who can approve). | YES. | Server enforces `senderAgent.role === "founder" && resolvesMessage.senderId !== senderId` (`routes/threads.ts:441-446`). |
| Cross-thread verdict (resolves a message in a different thread). | YES. | Server checks `resolvesMessageRow.threadId === threadId` (line 437). |
| Self-verdict (sender votes on own message). | YES. | Server enforces `selfVerdict === false` (line 443). |
| XSS via reasoning array entry. | YES. | React JSX text auto-escape; no `dangerouslySetInnerHTML` in `RichMessageCard` or `CommentRow`. |
| Clickjacking on verdict. | LOW. | Card is a regular DOM element inside the SPA. No iframe surface. |
| Confused-deputy (founder logged in elsewhere). | OUT OF SCOPE — auth surface, not L11. | N/A. |

---

## 11. Ordered task list

Each task lists: (a) what, (b) which files, (c) which test proves it, (d) dependencies on prior tasks.

| # | Task | Files | Proven by | Depends on |
|---|---|---|---|---|
| T1 | Add `promotedRichMessageId` pure helper to `@hyperidle/shared`. | `packages/shared/src/thread.ts`, `packages/shared/src/index.ts` | `packages/web/src/__tests__/promotedRichMessageId.test.ts` (5 scenarios from §3 of approved.md). | — |
| T2 | Add `--card-max-h` token + mobile override. | `packages/design-system/src/tokens.css` | `packages/design-system/src/__tests__/tokens.test.ts` extension asserts the variable resolves to `70vh` default and `60vh` at ≤ 768px. | — |
| T3 | Author HTML reference for the new card (mirror of `L11-approved/mockup.html`'s card). | `packages/design-system/html/RichMessageCard/index.html` | `packages/design-system/src/__tests__/html-components.test.ts` extension. | T2 |
| T4 | Implement `RichMessageCard.tsx` (Tier 2). All 8 states; `kind="review"` and `kind="questionnaire"`; sticky-within-card footer; Fix 1 (no shadow); Fix 2 (short reasoning inline). **Register `RichMessageCard` in the DS sync manifest (`packages/design-system/scripts/<sync-config>` or equivalent — verify via `bun run ds:sync` listing) so the visual diff job runs.** | `packages/design-system/src/RichMessageCard.tsx`, `.stories.tsx`, DS sync manifest | `packages/web/src/__tests__/RichMessageCard.test.tsx` (AC-1, AC-8, AC-9, all 8 state stories render). Visual diff via DS sync (`bun run ds:sync`) against the HTML reference at ≤ 5% pixel diff. | T1, T2, T3 |
| T5 | Extend `CommentRow.tsx` with `richHeader` / `richBody` / `richActions` slots. | `packages/design-system/src/CommentRow.tsx`, `.stories.tsx` | `packages/web/src/__tests__/CommentRow.richVariant.test.tsx` (AC-7). | T4 |
| T6 | Refactor `ThreadShell.tsx`: drop `ThreadHead` mount, drop `ReviewVerdictBar` mount, drop `IntersectionObserver` + `verdict-bar-wrapper` + `verdict-sentinel` + `Unresolved review` link. Add promotion-rule render via `promotedRichMessageId(messages)`; promoted message → `<RichMessageCard>`; other unresolved review/questionnaire → `<CommentRow>` with rich slots. | `packages/design-system/src/ThreadShell.tsx`, `packages/design-system/src/index.ts` | `packages/web/src/__tests__/ThreadShell.promotion.test.tsx` + migrations to existing `ThreadShell.test.tsx`. | T1, T4, T5 |
| T7 | Wire `ConversationsReview.tsx` to fetch artifact data per `artifactRef.id` and pass `artifactSlot` to `ThreadShell`. Generate `clientKey` via `crypto.randomUUID()` per click intent (held in card-local state). | `packages/web/src/pages/ConversationsReview.tsx` | `packages/web/src/__tests__/ConversationsReview.test.tsx` migration; `packages/web/e2e/L11-rich-messages.spec.ts` (AC-11, AC-13). | T6 |
| T8 | Delete `ReviewHeader` + stories + tests. | `packages/web/src/shell/ReviewHeader.{tsx,stories.tsx}`, `packages/web/src/__tests__/ReviewHeader{.test,.blocking.test}.tsx` | `packages/web/src/__tests__/L11-removal.test.ts` (AC-2). | T7 |
| T9 | Delete `ReviewVerdictBar` + stories + tests. Remove from DS index. | `packages/design-system/src/ReviewVerdictBar.{tsx,stories.tsx}`, `packages/web/src/__tests__/ReviewVerdictBar.test.tsx`, `packages/design-system/src/index.ts` | AC-4 verified by `bun run check` (no unresolved imports) + L11-removal test. | T6 |
| T10 | Delete `ThreadHead` + stories + tests. Remove from DS index. | `packages/design-system/src/ThreadHead.{tsx,stories.tsx}`, `packages/web/src/__tests__/ThreadHead.test.tsx`, `packages/design-system/src/index.ts` | AC-5 verified by `bun run check`. | T6 |
| T11 | Migrate `packages/web/e2e/threads.spec.ts` review-shape + verdict-click sections per §8 migrations. | `packages/web/e2e/threads.spec.ts` | Suite green. | T7 |
| T12 | Migrate `packages/web/src/__tests__/ConversationsReview.reasoning.test.tsx` per §8. | Same | Vitest green. | T7 |
| T13 | Author the new e2e spec covering: card mounts inline; 5 verdict buttons; click Approve dispatches POST canonical surface with payload shape; verdict CommentRow appears + thread resolves; 7-shortcut sweep produces zero POSTs; questionnaire renders answer buttons. | `packages/web/e2e/L11-rich-messages.spec.ts` | AC-3, AC-11, AC-13. | T7, T11 |
| T14 | `bun run check` + `bun run lint` + `bun run test` + e2e green. | Full repo. | AC-14. | T1–T13 |

---

## 12. Open questions for `/architecture-critique`

These are flagged inline as `### CONFUSION` blocks. Summarised here:

1. **L7 dispatch endpoint.** Spec references "PR #40 response endpoint" but that path is deleted. Plan uses `POST /api/threads/:id/messages` (canonical surface). (§ Plan reconciliation.)
2. **agentSessionState wiring.** Page does not currently pass it; promotion rule simplified to "oldest unresolved review/questionnaire" — no blocking gate on promotion. Blocking only lifts the `--danger` left-border. (§ 6.2.)
3. **Questionnaire dispatch shape.** No `answer` message type. L11 renders the answer buttons but the click is a no-op at the page level (out of scope for L11; AC-9 requires render-only). Future story will introduce typed answer handling. (§ 5.6.)
4. **Rate-limit on verdict POST.** Not introduced by L11; defer to a track-wide concern. Flagged in security table.

---

## 13. Definition of done (audit hooks for `/check-definition-of-done`)

- [ ] All 14 ACs map to a passing test (Vitest or Playwright). The verification map (§3) is the audit ledger.
- [ ] All 10 deletions verified by filesystem audit (`L11-removal.test.ts` + `git status`).
- [ ] No grep hit for `ReviewHeader`, `ReviewVerdictBar`, or `ThreadHead` in `packages/{web,design-system}/src/**/*.{ts,tsx}` (excluding the explicit deletion task in commit history).
- [ ] No grep hit for verdict-keydown listeners in `packages/web/src/**/*.tsx`.
- [ ] `bun run check` zero errors, `bun run lint` zero errors, `bun run test` zero failures, `bun run test --workspace=packages/web -- e2e` green.
- [ ] Visual regression: DS sync (`bun run ds:sync`) at ≤ 5% pixel diff between `RichMessageCard.tsx` and `html/RichMessageCard/index.html`.
- [ ] Component-budget audit: net −2 components verified by counting Tier 2/3 entries in `packages/design-system/src/index.ts`.
- [ ] All 18 rejection-list items remain refused — automated grep test in `L11-removal.test.ts` covers items 1, 3, 5, 11, 13, 15. Items 2, 4, 6, 7, 8, 9, 10, 12, 14, 16, 17, 18 are visual / structural — covered by `RichMessageCard.test.tsx` + visual regression.
- [ ] `protectedTests` files (§8) show no diff except the documented migrations (§8 Migrations table).

---

## 14. Cross-references

- Story: `docs/work-packages/TRACK-L.md` § L11.
- Approved design: `docs/design-explorations/L11/approved.md`.
- HTML mockup: `packages/design-system/html/L11-approved/mockup.html`.
- Concept: `docs/concept/HUMAN_INTERFACE_LAYER.md` § 4.5.
- L1 plan: `docs/work-packages/L1-plan.md`.
- L1 SHARED contract: `docs/work-packages/SHARED.md` § "Thread primitive (L1)".
- Existing canonical surface: `packages/server/src/routes/threads.ts` (lines 348–564).
- Existing artifact primitive: `packages/web/src/shell/ArtifactView.tsx`.
- Components being deleted: `packages/web/src/shell/ReviewHeader.tsx`, `packages/design-system/src/ReviewVerdictBar.tsx`, `packages/design-system/src/ThreadHead.tsx`.
