# L1 Thread primitive — Variant A: `slack-shaped`

## User story

A founder lands on a thread (from the Conversations queue, the Rail, a bet detail, or an artifact detail) to read the latest activity, react to a rich message inline, and reply or post a verdict — without leaving the chat metaphor or jumping to a separate region.

## Component composition

`ThreadShell` (new) — outermost wrapper. Three slots stacked vertically:

1. `ThreadHeader` (new, internal to `ThreadShell`) — single dense row carrying:
   - host attachment label rendered as a `Tag` with the host kind as prefix mono caps (`BET / ` / `TASK / `) and the host title in `--text-hi`;
   - blocking indicator: `StatusChip` `kind="blocked"` (only when the thread is blocking — derived from messages, never from a kind column);
   - resolved indicator: `StatusChip` `kind="done"` (only when `resolvedAt` is set);
   - participants summary: avatar stack (max 3 visible, `+N` overflow chip) using the same `--density-avatar-size` ladder as `ThreadRow`;
   - terse last-active timestamp at the right edge in `--text-lo` (e.g. `2m`).
2. `MessageStream` (new) — the chronological list. Renders `MessageRow`s top-to-bottom (oldest at top, newest at bottom). Inserts:
   - day-separator chips (`mono-sm` text on a hairline rule using `--border-subtle`);
   - sender-grouping rule: only the first message in a run of consecutive same-sender messages shows the avatar + sender label + absolute timestamp; subsequent messages in the run hide all three and indent the body to align under the first (~28px gutter), with a hover-revealed condensed `HH:mm` timestamp at the left.
3. `Composer` (new) — pinned to the bottom of `ThreadShell`. A single textarea on `--surface-2` with a primary `Send` button. When the latest message is an unresolved review or questionnaire, a thin `--text-lo` hint line above the textarea reads e.g. `Plain reply — verdict above ↑` to remind the founder the binding action lives inline.

`MessageRow` (new) is a discriminated dispatch on `message.type`:

- **`PlainMessage`** — sender + timestamp (only on group head), then body text in `--text-hi` at `--density-text`. Inline references render as compact `Tag` pills (`KNOWLEDGE / `, `TASK / `, `ARTIFACT / `) right-aligned at the end of the body line they appear on. No background, no border — a plain message is just typography.
- **`ReviewMessage`** — same group-head treatment, but the body block lives inside a left-bordered "review block" (2px `--primary-dim` left border, no card background — typographic weight, not chrome) which contains:
  - a one-line review header: `mono-sm` "REVIEW" caps label + the artifact reference rendered as a tight `Tag` (`ARTIFACT / `pricing-engine/calculate.ts`);
  - the review reasoning text in `--text-hi`;
  - an embedded `text_diff` preview (slot for L11) — a `<pre>` strip with up to 6 visible diff lines, `--ok` for additions, `--danger` for deletions, monospaced, `--surface-2` background, `--r1` corners. Capped height with a "n more lines" link inline at the bottom right;
  - **inline verdict affordance** — a single horizontal row of 5 binding buttons rendered at the bottom of the review block itself (NOT pinned to the top of the screen). Order, left-to-right: `approve`, `approve w/ comments`, `request changes`, `edit`, `reject`. Primary visual weight on `approve` (`--primary` solid). The other four are ghost buttons sharing one row. Below them, on a single line in `--text-lo` mono-sm, three non-binding actions: `comment · inline comment · reply` and to the right two sidecar links: `snooze · escalate`. When `resolvedAt` is set, the verdict row collapses to a single inline `StatusChip` (`approved` / `changes requested` / etc.) followed by the resolver name and timestamp — read-only.
- **`QuestionnaireMessage`** — group-head + body block with a left-border in `--ok` (10% tint, no card background). Body is the question text. Below the question, a vertical list of constrained answer rows: each row is a single-line button on `--surface-2` with a leading mono-sm letter (`A`, `B`, `C`) and the answer label. Selecting one emits the answer-message; on resolution the chosen row is shown alone with a `done` `StatusChip` and the rest collapse to a `Show alternatives` link.
- **Verdict-payload messages** (the response messages from §4.5) render as `PlainMessage` typographically but with a leading `mono-sm` caps verdict tag (`APPROVED`, `CHANGES REQUESTED`, …) tinted with the appropriate semantic token (`--ok` / `--warn` / `--danger`).

DaisyUI primitives used directly: `btn` (`btn-primary` for `Send`/`approve`, `btn-ghost btn-sm` for the other four binding actions and the non-binding link row), `textarea` (Composer body).

Existing custom components used: `Tag`, `StatusChip`. No re-skin; pulled from `packages/design-system/src/`.

## Information hierarchy

1. **Latest message at the bottom of the stream**, always in view at first paint. The eye lands here because the page auto-scrolls to the latest message and because the sender-grouping rule visually anchors it (avatar reappears for the freshest sender even if the previous run was the same sender, when the latest is a rich message).
2. **The Composer**, pinned below the latest message. The action surface for plain replies dominates because it is the only persistently-visible interactive region.
3. **The host label and blocking chip** in the slim header. A 3-second scanner reads "this is a thread on bet *Pricing overhaul*, blocking" without committing eye-time.

The verdict affordance, when present, sits *inside* the review message body in the stream — not at the top of the screen. This is the variant's defining trade: density beats separation; the user finds the action by reading the rich message, not by jumping to a chrome strip.

## All states

**Empty.** No messages yet (a thread initiated but the first message hasn't sent — rare; usually arises in DM start). Stream renders one centered line: `mono-sm` "no messages yet" in `--text-lo`. Composer focused, placeholder text "Send a plain message".

**Loading.** Header renders immediately from cached thread metadata (host, participants). Stream shows three `Skeleton` message rows: avatar circle + two text bars, each at `--density-text` height. Composer renders enabled (the user can start typing before history loads). No spinner — productivity tools do not show spinners on thread loads.

**Error.** Header renders. Stream replaces messages with a single inline `ErrorState`-like row: `mono-sm` "couldn't load messages" + a ghost `Retry` link. Composer remains enabled — sending while errored queues the message client-side and shows it as a `pending` row (the row reads exactly like a normal `PlainMessage` but with a `--text-lo` "sending…" suffix on the timestamp slot; once the server confirms, the suffix drops). No optimistic-UI bragging; the suffix is purely an informational status.

**Populated (primary).** Header + day-grouped stream + composer. The latest message is auto-scrolled into view. If the latest message is an unresolved review or questionnaire, a single thin `--surface-3` rule with `mono-sm` `UNRESOLVED REVIEW · acting required` text sits between the message and the composer — a tactile reminder that the verdict is *inside* the message above, not in the composer.

**Overflow.** Threads longer than ~50 messages render the oldest history collapsed under a single row reading `mono-sm` "Older — N earlier messages · expand". Expanding loads the page above the current viewport without changing scroll anchor (so the user's reading position is preserved). Day separators inside the collapsed range are preserved. The collapsed row sits where the day separator would sit.

## Behavior

- **Hover.** `MessageRow` on hover gets a 1px `--surface-ghost` background tint (no left/right padding shift) and reveals two right-edge ghost icon-buttons: `react` (a single mono-sm "+" — not an emoji picker, opens a tag/comment menu) and `more` (overflow). `motion-fast` (80ms) on the tint.
- **Focus.** Tab order: composer textarea → composer send button → newest binding verdict (if visible) → next-newest message's actions → … walking *up* the stream. `:focus-visible` uses the standard 1px `--primary` outline (offset `-1px`).
- **Scroll.** The stream auto-scrolls to bottom on mount and on new own-message append. A new incoming-other-participant message appearing while the user is scrolled away from bottom does NOT auto-scroll; instead a single floating pill appears centered above the composer reading `mono-sm` "1 new · jump" — clicking it scrolls to bottom. The pill stacks count (`3 new · jump`) and dismisses on scroll-to-bottom.
- **Group head injection.** When a same-sender run is interrupted by *time* alone (>10 min gap), the next message becomes a new group head (with avatar + timestamp) even if the sender is unchanged. This keeps the scanability of "who said what when" without forcing the avatar on every line.
- **Transitions.** Expanding the overflow collapse uses `motion-medium` (150ms) opacity-fade-in on the loaded history. The verdict-row collapse on `resolvedAt` uses `motion-medium` height crossfade. New incoming messages use `motion-fast` opacity-only fade-in (no slide — slide-in animations on chat are an AI-aesthetic tell). The "new messages" pill uses `motion-fast` opacity. Day-separator inserts have no animation.
- **Composer.** Multi-line textarea, auto-grows to a max of 6 lines then scrolls. `Cmd/Ctrl+Enter` is reserved at the consumer level but the variant does not advertise verb shortcuts (founder demoted). Empty state of the textarea = primary button is `disabled` (DaisyUI `btn-disabled`).

## Mobile adaptation

The desktop variant collapses to mobile cleanly because the variant *is* a single column.

- The mobile Conversations tab renders `ThreadShell` full-width. The IconRail / Submenu stack from desktop is replaced by the three-tab bottom bar — the thread fills the viewport between the tab bar and the system bar.
- The header drops the participants avatar stack to the host label + blocking chip + a single `(N)` participant count. Tapping the count opens a sheet with the full list.
- Sender-grouping shrinks the indent gutter to ~24px.
- The verdict row inside a review message wraps to two rows on viewports < 480px: row one = `approve` + `request changes` + `reject` (the three most-used), row two = `approve w/ comments` + `edit`. The link row of non-binding actions becomes a single `more actions` text link that opens a sheet.
- Composer pins above the on-screen keyboard via `interactive-widget=resizes-content` (handled at the AppShell level, not the variant); textarea grows to 3 lines max on mobile before scroll. Input font-size locked to 16px to suppress iOS Safari zoom.
- The "n new · jump" pill sits above the composer at the same z-layer as on desktop.

## Signature

**The verdict lives inline at the bottom of the review message — never pinned to the top of the screen.** A reviewer scrolls a chat, finds the latest review, and acts on it in place. The thread feels like a Slack channel where some messages happen to carry binding actions, not like a review tool wearing a chat skin.

## Trade-offs

- **Bad at very long review threads where the founder revisits the verdict often.** The verdict is at the latest review message's location in the stream — if 40 plain replies have been appended after it, the founder has to scroll up to act. (Mitigation: when the latest review remains unresolved, the `UNRESOLVED REVIEW · acting required` rule sits above the composer with a `jump to review` link. Still slower than B's sticky head.)
- **Bad at deep artifact review.** A 40-line diff is fine inline; a multi-file PR or a full landing-page mockup will be cramped in the stream. The `text_diff` preview caps at 6 visible lines and links out — but reviewers who want to see all 40 lines in context may prefer C's canvas.
- **Bad at heavy questionnaires with long answer text.** A questionnaire with 5 multi-paragraph answer options crowds the stream; the variant degrades to scrolling. (B's head treatment handles this better.)
- **Density rewards experts but punishes first-time users.** The sender-grouping rule and the lack of borders on plain messages mean a founder who has not used the system before reads a wall of text. Onboarding must teach the grouping rule (out of L1 scope).
- **No room for inline-comments-on-diff lines.** The 6-line diff strip is a preview, not an annotated artifact. Inline comments will need to live in the `inline comment` link action which spawns a sub-thread — clean architecturally, slower than C's canvas-side dock.
