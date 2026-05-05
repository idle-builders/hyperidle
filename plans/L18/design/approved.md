# L18 — Design (approved)

## Surfaces in scope

| Surface | Classification | Reason |
|---|---|---|
| Bet detail attached thread | routine | L1's `ThreadShell` already exists; L16 already mounts L2 blocks on the bet pitch. Reuse. |
| Task detail attached thread | routine | L15 shipped `TaskSheet` with the resolve-or-create flow + an "Open thread" affordance. Mount `ThreadShell` inside the sheet. |
| Knowledge entry attached thread | routine | KnowledgeDetail has an existing `ObservationLog` section; L24 will eventually replace it with a thread surface. L18 does the replacement now (per AC §625's framing of "block-anchored discussion uses L2's own affordance"). |
| Artifact detail attached thread | **novel** | First-ever surface. AC §620 says discussion of an artifact lives on the artifact itself. The artifact "detail surface" today is `ArtifactPermalink` — a thin wrapper around `ArtifactPreview`. L18 expands it. |
| Bet-view summarisation of attached artifact threads | **novel** | Volume-management affordance. Many artifacts × one thread each = the bet view drowns unless we summarise. AC §622 puts this decision squarely on the designer. |

The two novel surfaces get 3-variant exploration each. Routine surfaces get one variant + an explicit list of considered-and-rejected alternatives.

---

## Routine surface 1 — Bet detail attached thread

**Decision.** Render `ThreadShell` as the final section of `WorkBet.tsx`, replacing today's hand-rolled `<section data-testid="bet-comment-thread">…</section>` block (lines 233–259). Section header `Discussion` (uppercase, tracking `+0.02em`, `text-[var(--text-lo)]`). Surface fills page-width; height is content-driven; the composer is pinned at the bottom of the surface (already the `ThreadShell` contract). Single column on desktop and mobile — the bet pitch sits above; the thread sits below. No nested scroll inside the page-level scroll.

**Empty state.** "No discussion yet. Be the first to post in this thread." (already the `ThreadShell` empty copy via `EmptyState`). The composer is still rendered — posting creates the thread (host=bet, hostId=betId) on first send via the resolve-or-create helper, mirroring L15's task pattern.

**Loading state.** Same `SkeletonList rows={3}` the rest of the system uses — already wired through `ThreadShell.loading`.

**Error state.** `ErrorState title="Failed to load thread" description={…}`. Already wired.

**Did we consider?**
- *A right-rail thread instead of a below-the-fold thread.* Rejected: the bet detail is dense (BetCard + tasks table + pitch blocks); a right rail would compress every other section and break the established 1-column WorkBet layout. The thread reads better as a chronological tail to the page.
- *A collapsible accordion.* Rejected: hides activity from glance. Users on bet detail are reviewing a bet — the thread is part of the review.
- *Inline rendering inside the Sheet (the L15 path).* The L15 path is for the task surface; the bet surface is the page itself, not a sheet — different ergonomics.

---

## Routine surface 2 — Task detail attached thread

**Decision.** Inside `TaskSheet.tsx`, replace the existing "Open thread" link affordance with an inline `ThreadShell` mounted in the sheet body, below the state-change action group. Sheet width grows from current narrow drawer to a slightly wider drawer (`w-[--sheet-wide]` token, defined as `min(640px, 90vw)` — the existing Sheet pattern from `ConversationsReview`). The composer pins to the sheet floor; the message stream scrolls inside the sheet body above it.

**Did we consider?**
- *Keep the "Open thread" link, navigate away to a thread page.* Rejected: AC §621 says "the Task detail 'open thread' affordance from L15 opens the same primitive" — same primitive means rendered in place, not in a separate route. Navigating away breaks the founder's "review without losing context" mental model.
- *Tabs in the sheet (Details | Thread).* Rejected: hides activity. The sheet is already small; the thread should be visible as soon as it has content, with the state-change actions sitting above.
- *Inline thread on the kanban card itself.* Rejected: cards are dense and small; the sheet is the right detail surface.

---

## Routine surface 3 — Knowledge entry attached thread

**Decision.** Replace `ObservationLog` (`KnowledgeDetail.tsx:309-347`) with `ThreadShell` mounted in the same vertical slot. Section header changes from `OBSERVATION LOG` to `DISCUSSION`. Per-block discussion (block-anchored) is rendered as inline-after-payload comments on the block itself — see "Block-anchored discussion" below. The right sidebar (`RelatedSidebar`) is preserved unchanged.

**Did we consider?**
- *Keep ObservationLog AND add ThreadShell side by side.* Rejected: violates AC §881 spirit (parked L26 also calls for the read-only Observation Log to be replaced with the L1 thread surface). Two surfaces showing the same shape of activity is redundant.
- *Modal thread.* Rejected: knowledge entries are scrolly long-form; in-page is the right shape.
- *Defer to L26.* Rejected: L18's AC explicitly names knowledge entries as a target. L26 is now scoped to "block-anchored discussion polish" on top of L18's foundation.

---

## Novel surface A — Artifact detail thread (3 variants)

The artifact detail surface today is `packages/web/src/pages/ArtifactPermalink.tsx` — it renders `ArtifactPreview` and not much else. We need to keep the preview as the centre of gravity and add a thread.

### Variant A1 — Preview as hero, thread below

`ArtifactPermalink` becomes a 1-column page: artifact metadata bar (kind, producing task link, cost) → `ArtifactPreview` at full width → `ThreadShell` below. The preview is the centrepiece; the thread is the conversation about it.

### Variant A2 — Two-column preview-left / thread-right

Desktop only: 60/40 split. Preview on the left, thread on the right with the composer pinned at the bottom of the column. Mobile collapses to a vertical stack (preview first, thread second).

### Variant A3 — Sticky preview with thread below

Preview sticks to the top while the user scrolls the thread. This is a nice "always know what we're discussing" affordance, but introduces a sticky region that interacts oddly with the page-level scroll on mobile.

### Score (9-dim rubric, 0-10)

| Dim | A1 | A2 | A3 |
|---|---|---|---|
| Hierarchy (preview is the subject) | 9 | 7 | 9 |
| Spacing & density | 8 | 7 | 7 |
| Typography fit | 9 | 8 | 8 |
| Color / status surfacing | 9 | 8 | 8 |
| Coherence with rest of app (1-col detail surfaces) | 9 | 6 | 7 |
| State coverage (empty, loading, error, populated) | 9 | 7 | 7 |
| Accessibility (focus order, scroll regions) | 9 | 7 | 6 |
| Anti-slop (no AI aesthetic) | 9 | 8 | 8 |
| Premium polish | 8 | 7 | 8 |
| **Total** | **79** | **65** | **68** |

### Settled — A1 (Preview as hero, thread below)

Rationale: matches WorkBet, KnowledgeDetail, and TaskSheet's established 1-column detail-surface pattern. No sticky region quirks. Mobile-equivalent without adaptation. Discussion is downstream of seeing the artifact — that is the user task: see, then discuss.

**Spec for A1.**

- Page wrapper: `<div className="p-3 flex flex-col gap-3">` (12px padding, 12px section gap — matches density tokens).
- Metadata strip: `Tag` (kind) · link to producing task · cost via `formatArtifactCost`. Hand-rolled flex row (no new component).
- `ArtifactPreview` mounted full-width.
- `<section aria-label="Discussion" data-testid="artifact-discussion">` with an uppercase section header and `ThreadShell` below.
- Empty state, loading state, error state are inherited from `ThreadShell`.
- Permalink remains `/artifacts/:id` (no route change).

---

## Novel surface B — Bet-view summarisation of attached artifact threads (3 variants)

The volume question. A bet may aggregate dozens of artifacts. Each may carry a thread. The bet view cannot inline all of them.

### Variant B1 — Thread-activity column on the artifact aggregate

The bet detail aggregates artifacts somewhere (today: not yet rendered on `WorkBet.tsx`; L12 will render the artifact aggregate). When that aggregate lands, each artifact row carries a small column showing thread activity: count of unread + relative timestamp of last message. Click → navigate to artifact detail (where the full thread lives). No thread snippet in the bet view at all.

### Variant B2 — "Recent discussion" section above the bet thread

Add a `<section>` between the bet's own thread and the rest of the page titled "Recent discussion across artifacts" — shows the 5 most recently active artifact threads as `ThreadRow` entries (existing component) with artifact-name as host title and the last message preview. Click → artifact detail.

### Variant B3 — Inline accordion per artifact thread on bet view

Each attached-artifact-thread renders as a collapsible row on the bet view. Closed by default. Expand → see the thread inline. Drowns the page if there are many; expanding-to-edit interactions are heavy.

### Score (9-dim rubric, 0-10)

| Dim | B1 | B2 | B3 |
|---|---|---|---|
| Hierarchy (bet is the subject; artifact threads are derivative) | 9 | 8 | 5 |
| Information density (no drowning) | 9 | 8 | 4 |
| Coherence (uses existing aggregates / ThreadRow) | 8 | 9 | 6 |
| Decision economy (where does the user go to act?) | 9 | 8 | 6 |
| State coverage | 8 | 9 | 7 |
| Accessibility (focus, screen-reader linearity) | 9 | 8 | 6 |
| Anti-slop | 9 | 8 | 7 |
| Premium polish | 8 | 8 | 6 |
| Performance (bet view stays fast) | 9 | 8 | 5 |
| **Total** | **78** | **74** | **52** |

### Settled — B1 (Thread-activity column on the artifact aggregate) **with a small B2 component reused at the bet level**

The full decision is two-layered, and this is what falls out of the volume question:

1. **Per-artifact summary column on the bet's artifact aggregate.** When L12 ships the artifact aggregate (separate story; L18 must not block on it), the artifact rows pick up a "Discussion" column showing `<count> · <relative-time>` from a fresh API call. The summary endpoint is per-bet (one API round trip). When L12 has not yet shipped the aggregate (current state), the column lands as a simple list at the bottom of `WorkBet.tsx` for now: a section labelled "Artifact discussion" listing each artifact with a thread, count + last-message-time. **L18 ships this list now**; L12 absorbs it into the artifact aggregate when it lands.
2. **No inline artifact-thread bodies on the bet view.** Click → navigate to `/artifacts/:id` → full `ThreadShell` on the artifact detail page (Surface A above).

Rationale:
- Bet view stays scannable. No drowning.
- The artifact detail page is the source of truth — single canonical surface per thread (matching L9's "one detail surface per thread" rule).
- The bet view's own thread (Surface "Routine 1") is not crowded by other threads — it stays the bet-level conversation.
- B2 was tempting but conflates bet-level and artifact-level discussion. B1's "summary on the aggregate" preserves the hierarchy.

**Spec for B1.**

- New component `ArtifactThreadsSummary` in `packages/web/src/components/`. Density-aware. 19-component budget impact: borderline — see architecture §components for the call.
- Props: `betId`, list of `{ artifactId, artifactKind, artifactTitle, threadId | null, messageCount, lastMessageAt | null, lastMessageSnippet | null }`, plus `betHasArtifacts: boolean` so the component can distinguish "no artifacts at all" from "artifacts but no messages".
- Renders one row per artifact that has at least one message. Artifacts with no thread (or thread but zero messages — initial-creation messages count) collapse out of the list.
- Each row (revised per F1 — include the snippet): `[kind tag]  [artifact title]  ·  "<first ~80 chars of last plain message>"  ·  <relative-time>`. The snippet is single-line, ellipsised at the row's content edge. Click anywhere on the row navigates to `/artifacts/:id`. The snippet renders as `<span className="text-[var(--text-mid)] italic truncate">"…"</span>` so it reads as quoted speech without competing with the artifact title.
- Section header `ARTIFACT DISCUSSION` matching the rest of the page's uppercase tracking-wider style.
- **Empty-with-artifacts stub (F2):** when the bet has artifacts but none have thread messages, render a single muted line `No artifact discussion yet.` under the section header. This tells the founder "absence is real, not a bug".
- **No-artifacts case:** if the bet has zero artifacts at all, hide the section entirely (no header, no stub). Different signal — the bet hasn't produced anything yet; an "artifact discussion" section is irrelevant.
- **Overflow cap (F3):** show top 10 rows, ordered by `lastMessageAt` desc. When more than 10 artifacts have messages, append a `View all (N more) →` link as the last row, navigating to `/artifacts?betId=…` (the existing artifacts list filter, see `packages/server/src/routes/artifacts.ts:200` — query param is `betId`). The 10-cap survives until L12's artifact aggregate absorbs the section.
- **Loading state:** `SkeletonList rows={3}`.
- **Error state:** `ErrorState title="Could not load artifact discussion" description={…}` rendered as a single row inside the section.

---

## Block-anchored discussion (AC §623)

L2's `BlockActionsPopover` already exposes a closed action set with extensible items. L18 contributes a new action with label **"Discuss"** (revised per F4 — short verb phrase matching the popover's existing items like `Copy permalink`, `Delete`). The action ID is `discuss-block`. Selecting it pre-targets the host page's thread composer at this block id (the composer payload includes `{ text, blockId }`). On post, the rendered message in the thread shows a small `Re: <block excerpt>` chip linking to the anchored block. Block messages render inline-after-payload on the host page when present (via `Block`'s existing `slots.inlineAfterPayload`).

**Composer prefill UX (F5).** Selecting `Discuss` on a block performs three things, in order:
1. The bottom-anchored composer (the same one always visible in `ThreadShell`) is brought into view via `scrollIntoView({ block: "nearest", behavior: "smooth" })`.
2. The composer renders an `Re: <block-excerpt-or-id-chip>` indicator immediately above the textarea — a small grey chip showing a 6-8 word excerpt of the block payload (or the block id when no excerpt is derivable). The chip carries a × dismiss control that clears the prefill and reverts the post to a plain (non-anchored) message.
3. The textarea receives focus. The user types and submits; the message lands with `payload.blockId` set. The chip then disappears (next post resets to plain).

The page-level state holding the prefill (`prefillBlockId: BlockId | null`) lives on the host page (e.g. `WorkBet.tsx`), not on `ThreadShell`. `ThreadShell` exposes the prefill via a new optional prop `composerPrefill?: { blockId: BlockId; excerpt: string }`. When set, the chip renders; when null, the composer is plain.

**Important constraints.**
- The block-anchor is L2's own affordance — L18 contributes one items entry to the popover and threads a `blockId` field through composer → message → renderer.
- No new message type. The plain message payload extends with an optional `blockId?: BlockId` field. This is a payload-shape addition, not an enum extension — does not violate the closed message-type set in L1 (`docs/human-interface-layer/thread-primitive.md:17`).
- Bet pitch (L16's blocks-rendered pitch on `WorkBet.tsx`) is the proving ground per AC §629. Knowledge entry body is the second consumer. Both reuse the same code path.
- a11y: the `Re: <chip>` carries `aria-label="Replying to block: {excerpt}"`; the live region in `BlockActionsPopover` (existing `liveRegionId`) announces "Composer focused, replying to block" on selection. The dismiss × is a `<button>` with `aria-label="Cancel block reply"`.

---

## Component budget audit

L18 introduces **one** new web-package component: `ArtifactThreadsSummary` (in `packages/web/src/components/`, NOT in design-system because it is bet-detail-specific). It is **not** counted against the 19-component design-system budget — that budget governs `packages/design-system/`. Web-package shell/page components are not under the 19 cap, but each must justify itself; this one carries its weight by being the volume-management affordance.

No new design-system components.

---

## States and a11y

`ThreadShell` already covers empty/loading/error/populated/populated-overflow. `ArtifactThreadsSummary` covers:
- *No-artifacts (bet has zero artifacts at all):* section does not render.
- *Empty-with-artifacts (bet has artifacts but none have messages):* section header renders + the muted line `No artifact discussion yet.` below it. (F2)
- *Loading:* `SkeletonList rows={3}` (existing component).
- *Error:* `ErrorState` row inside the section.
- *Populated (1-10 rows):* the listed rows.
- *Overflow (more than 10 rows):* the first 10 rows + a final `View all (N more) →` link row. (F3)

Keyboard order on every surface: page tabs → page actions → thread message stream (scrollable, focusable rows) → composer (focusable last). The composer's `<textarea>` is the natural last stop on Tab.

---

## Round 1 reviewer polish applied

- F1 — `ArtifactThreadsSummary` rows now carry the last-message snippet. Endpoint already returns `lastMessageSnippet`; the design now renders it.
- F2 — empty-with-artifacts case now shows a `No artifact discussion yet.` stub line under the section header.
- F3 — top-10 cap on rendered rows + `View all (N more) →` overflow link to `/artifacts?betId=…`.
- F4 — popover label shortened from `Comment on this block` to `Discuss`; action id remains `discuss-block`.
- F5 — composer prefill behaviour spelled out: scroll-into-view, `Re: <chip>` indicator with dismiss, focus-textarea, page-level `prefillBlockId` state passed to `ThreadShell` via `composerPrefill?: { blockId, excerpt }`.

## What this design does NOT decide

- Identity disambiguation (whose `senderId` is "u-founder"?). Inherited from L1's API-key-holder default; tracked as a follow-up on auth middleware.
- Notification UX when a new artifact-thread message arrives. Inherits whatever L20 does; L18 does not introduce an in-page notification chrome.
- The artifact aggregate component shape itself (L12's territory).
- Any mobile-sheet adaptation of the bet view (no mobile-sheet redesign in scope).
