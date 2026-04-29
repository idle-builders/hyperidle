# Variant C — `slate-shaped`

> Artifact-first / canvas-first. The thread is *about the artifact*; the conversation is supporting context.

## User story

A founder lands on a review thread for "Pricing overhaul (Nimmly)" — an unread, blocking review proposing a 40-line diff to `pricing-engine/src/calculate.ts` — and needs to study the diff line-by-line, weigh the proposer's reasoning, glance at peer comments without losing the diff, and act (approve / request-changes / reject) without ever scrolling the artifact off-screen.

## Component composition

| Region | Component | Existing? | Role |
|---|---|---|---|
| Outer shell | `ThreadShell` | new (L1) | The two-column wrapper. Carries host attachment label, participants summary, blocking indicator, resolved status, pinned indicator. |
| Left column (~68%) | `ThreadCanvas` | new (slate-only) | Hosts the rich head message: proposer + role, artifact-mounted region, reasoning bullets. The artifact slot is filled by L11's `ArtifactView` (5 shapes); slate mounts whichever shape the message references. The canvas is the "document" — what the user is reviewing. |
| Canvas-edge action surface | `CanvasEdgeToolbar` | new (slate-only) | A vertical strip pinned to the right inner edge of the canvas (between canvas and dock). Renders the verdict affordance: 5 binding actions emphasised, 3 non-binding compact, 2 sidecar quietest. NOT a sticky top bar; NOT a footer. The eye lands here only after it has seen the artifact. |
| Right column (~32%) | `ThreadDock` | new (slate-only) | Compact chronological message stream + composer. Mirrors `MessageStream` semantics. Header carries host + participants summary. Footer is the `Composer`. |
| Dock rows | `DockMessageRow` | new (L1) | Compact message renderer used inside the dock — sender, timestamp, body, optional inline reference pill. Visually quieter than the head message in the canvas (smaller avatar, smaller body, monoline metadata). |
| Dock composer | `Composer` | shared L1 | Plain-text input. Mounts review-action affordances only when the latest message is a review AND the user is a participant who can verdict. |
| Tier 1 dependencies | `StatusChip`, `Tag`, `KeyValue` | existing DS | Used in headers, participant pills, and the reasoning sidebar. |

Component-budget impact: introduces 4 new components scoped to slate (`ThreadCanvas`, `CanvasEdgeToolbar`, `ThreadDock`, `DockMessageRow`) plus 1 shared (`ThreadShell`). If slate is selected, two of these (`ThreadShell`, `Composer`) are reusable; the canvas/dock pair is variant-specific.

## Information hierarchy

1. **Artifact in the canvas.** The 40-line `text_diff` dominates the screen. Color-coded `--ok` / `--danger` lines, monospace, breathing room. The eye lands here first because it occupies ~70% of the viewport width and ~80% of the viewport height.
2. **Latest unread comment in the dock.** The dock's unread row has a 2px left rule in `--primary` and bold sender. The eye finds it second because the dock is narrower and the unread row has higher contrast within that column.
3. **CanvasEdgeToolbar verdict.** The vertical toolbar sits between the artifact and the dock — exactly where the eye naturally falls when transitioning from "study artifact" to "read discussion." The 5 binding actions are visually emphasised (filled buttons in the column); the 3 non-binding (`comment`/`inline-comment`/`reply`) are quieter; the 2 sidecar (`snooze`/`escalate`) are the quietest.
4. Proposer + role + reasoning bullets sit *above* the artifact inside the canvas — the framing context for the diff, not competing with it.
5. ThreadShell chrome (host label, blocking dot, participants) is at the top of the screen, low contrast, recedes.

## All states

### Empty
A thread that has been created but has zero messages does not exist by contract (every thread is opened by an initiator's first message). Slate's "empty" state is reserved for the canvas region when the head message is a `plain` chat-shape message with no embedded artifact: see chat-shape below.

### Loading
ThreadShell renders immediately with the host attachment label. Canvas shows a `Skeleton` shaped like the artifact slot (a tall block 70% × 60vh) plus three short horizontal skeletons above it for proposer/role/reasoning. Dock shows three `DockMessageRow` skeletons with shimmer on avatar + 2-line body. CanvasEdgeToolbar renders disabled (`aria-busy="true"`) — the verdict shape is visible immediately so the user knows what's about to be possible.

### Populated (review-shape, primary state)
Canvas renders proposer + role chip + 3 reasoning bullets above the `ArtifactView` (text_diff). CanvasEdgeToolbar is interactive. Dock shows the original review message at the top (compact echo of the canvas's headline — same thread head, rendered tersely so the dock doesn't duplicate the canvas verbosely) followed by 2-3 plain replies in chronological order. Composer at the dock floor accepts plain replies; review-action buttons live in the toolbar, not the composer.

### Error
If the artifact fails to load, canvas renders an `ErrorState` in the artifact slot ("Failed to load artifact preview. Retry"), reasoning bullets remain, and the toolbar disables only the `edit` and `approve` verdicts (the user can still `request-changes`, `reject`, `comment`, `snooze`). If the dock fails, dock shows `ErrorState` and the canvas remains fully interactive — the verdict is still possible without the discussion.

### Overflow
- Long diff: artifact slot scrolls *internally* with a sticky line-number gutter. The canvas's outer scroll position (proposer + reasoning) does not move when the user scrolls the diff.
- Long discussion: dock scrolls *independently*. Composer remains pinned at the dock floor.
- Many participants: participants pill in the ThreadShell header collapses to "+N more" with a hover-to-expand pop.
- Long reasoning bullets (> 5): collapses to first 3 with a "Show all reasoning" expander; never pushes the artifact below the fold.

### Chat-shape thread (no review/questionnaire) — explicit decision
**The variant degrades.** When the thread's head message is a plain message and *no* message in the thread carries a rich payload (`review` or `questionnaire`), slate-shaped collapses to a single column: the canvas region is suppressed, the dock takes the full width up to a max content width, and the CanvasEdgeToolbar is removed. The Composer still anchors the bottom; ThreadShell chrome still anchors the top. The user sees what is effectively a Slack-shaped fallback inside slate's shell.

**Justification.** The slate variant's whole reason for existing is that the artifact is heavy enough to deserve its own canvas. A thread without an artifact has nothing to put in the canvas — rendering an empty canvas with "No artifact in this thread" copy would be (a) noisy chrome for ~40% of threads, (b) a permanent dead zone the user has to look past, and (c) a teaching moment that *negatively* trains the user (every time they open a chat thread they relearn that the canvas is empty). Collapsing to single-column is the honest call: the variant earns the canvas only when there is something worth canvassing. This is consistent with progressive-disclosure (PRINCIPLES D3) — show the canvas when it has substance, hide it when it doesn't.

The same rule applies in reverse: if a chat-shape thread later receives a review message, the canvas re-mounts on the next render with the review at the top of the canvas, and the dock reflows to the right. The transition is a layout change announced via `aria-live="polite"` ("Review attached. Canvas opened.") with motion respecting `prefers-reduced-motion`.

## Behavior

### Scrolling
Canvas and dock scroll **independently**. Each is a separate scroll container. The ThreadShell header is sticky to the page top across both columns (single bar). The artifact slot inside the canvas has its own internal scroll for the diff body — three nested scroll regions total (artifact → canvas → page).

### Focus management
- Initial focus on mount: the canvas's artifact region (`tabindex="0"`, role="region", aria-label="Artifact: pricing-engine diff").
- Tab order: ThreadShell header chrome → canvas (proposer → reasoning → artifact) → CanvasEdgeToolbar (verdicts top-down) → DockMessageRow list → Composer.
- Posting a reply from the composer returns focus to the composer (not to the new message) so the user can keep replying. Verdict actions return focus to the dock's newly-appended verdict-payload message.

### Transitions
- Verdict click: button shows pressed state (`--motion-fast`); on success the verdict-payload message appends to the dock (slide-in from bottom, `--motion-medium`, `transform` + `opacity`); the toolbar's binding actions disable except `re-open` (which becomes the only enabled binding action). ThreadShell's blocking dot fades out (`opacity`, `--motion-medium`).
- Dock collapse: a single chevron at the dock header collapses the dock to a 32px-wide rail showing only the message-count and unread-count chips. The canvas expands to fill. Re-expand restores the previous width. The collapse state persists per-thread in local storage.
- Canvas-only mode: dock can be collapsed completely (chevron + `View dock` button on the canvas-edge toolbar). Useful for full-width artifact study.

### Keyboard
- No verb shortcuts (per founder filter). All keyboard interaction is standard Tab / Shift-Tab / Enter / Space / Escape on focused affordances.
- `Escape` closes a focused inline-comment popover but does not navigate away from the thread.
- Standard composer behavior: `Enter` posts, `Shift+Enter` newline.

## Mobile adaptation

Slate is wide-screen native. Mobile (<= 768px) cannot host two columns side-by-side without sacrificing both. The mobile adaptation is a **two-tab segmented control** at the top of ThreadShell:

- **Tab 1: Artifact** — the canvas, full width, with the CanvasEdgeToolbar repositioned as a sticky bottom action bar (binding verdicts as horizontally laid-out buttons; non-binding behind a "More" overflow). The toolbar must clear iOS safe-area insets.
- **Tab 2: Discussion (N)** — the dock, full width, composer pinned at the bottom. The unread count badges this tab.

The default tab on mobile is **Discussion** when there are unread messages and **Artifact** otherwise — the user is on mobile to triage, not to study a diff. The blocking indicator (a red dot) appears on whichever tab carries the action the user must take next.

For a chat-shape thread on mobile, the segmented control is suppressed (no canvas to switch to); the dock fills the screen as on desktop's chat-shape collapse.

Justification: a stacked layout (canvas on top, dock below) was rejected because (a) it forces the user to scroll past the artifact to reach the latest comment — the worst of both worlds, and (b) on mobile the canvas's value (large artifact preview) is already compromised; making it stack-and-scroll wastes the screen.

## Signature

The **CanvasEdgeToolbar** — verdict actions live on the *seam between artifact and discussion*, not at the head, not at the foot, not in the composer. The user studies the diff, the eye drifts right toward the dock, and the verdict is exactly where the eye lands. No other variant puts the action surface there because no other variant has that seam.

## Trade-offs

- **Bad at**: short chat threads with no artifact. The variant has to degrade (collapses to single-column) for ~40% of threads — that's a maintenance tax the other variants don't pay.
- **Bad at**: narrow viewports. Below ~1100px the dock becomes uncomfortably narrow and the canvas starts to cramp; the layout effectively requires a desktop or a large laptop screen.
- **Bad at**: long discussion threads with little artifact substance. If a review thread accumulates 50+ comments on a small artifact, the dock becomes the substance and the canvas is overweight. There's no graceful "flip" — the user just lives with a ~30% column doing 70% of the work.
- **Bad at**: questionnaire threads where the "artifact" is a list of three text choices. The canvas region is overkill for three radio buttons; the variant renders correctly but feels architecturally heavy. (linear-shaped is probably the better fit for questionnaires.)
- **Bad at**: cross-thread navigation. The dock's compact rows are good at-a-glance, but the heavy canvas commitment per-thread makes opening 5 threads in sequence feel slower than slack-shaped's single-column flow.

## Anti-convergence audit (vs A and B)

| Axis | A (slack) | B (linear) | C (slate) — this variant |
|---|---|---|---|
| Hierarchy | latest message at bottom | head message at top | artifact canvas dominates left |
| Density | high single-column | medium head + compact comments | low canvas + medium dock |
| Action surface | composer at bottom | sticky bar near head | canvas-edge toolbar (the seam) |
| Composition | 1 stream + 1 composer | 1 head + 1 stream + 1 composer | 1 canvas + 1 dock + 1 composer |
| Copy register | terse, chat-shape | structured, issue-shape | label-driven, document-shape |

Slate differs from A on hierarchy + density + action surface + composition + copy register (5/5).
Slate differs from B on hierarchy + density + action surface + composition (4/5).
Anti-convergence threshold (≥3 axes per pair) is met for both pairs.
