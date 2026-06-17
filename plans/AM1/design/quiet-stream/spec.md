# AM1 — Variant A "Quiet prose" — Design Spec (REDO v2)

**Thesis:** the LEAST structured variant. The conversation reads as flowing prose
in a narrow centered column. Hierarchy is purely typographic — no avatars, no
role badges, no per-line timestamps, no per-message cards, no accent rails. Turns
are separated only by quiet uppercase section labels on a faint hairline and by
whitespace. Embeds are understated muted single lines, all aligned to the column's
one left edge. Faithful to the t3code reference's restraint.

Story-only `/design` artifact. Hand-rolled with Hearth tokens for guaranteed
render. Component: `packages/web/src/components/Am1ConversationQuietStream.tsx`.
Story: `…/Am1ConversationQuietStream.stories.tsx` (single `Populated` export).

---

## User workpackage

The founder is in a deliberate threaded conversation with their builder agent
(Atlas) on a task ("Passkey login"). They scan the agent's reply calmly, glance
at *what it refers to* — a diff, a referenced plan, the session it came out of —
without leaving the column, then make one decision: **approve the deploy, request
changes, or reject.** The design optimizes for reading the reply as prose and
reaching the verdict with the least chrome between the founder and the words.

Wasteful for this user: avatar columns, repeated name/role/time on every line,
heavy embed cards that pull the eye off the prose, a verdict bar that looks like a
toolbar. All removed.

---

## Component composition (production reuse mapping)

The story hand-rolls visuals; production composes existing primitives. Mapping:

| Story element | Production component | Note |
|---|---|---|
| Prose paragraph / lead-in | `CommentRow` (plain payload, chrome stripped to once-per-turn) | A renders the *minimal* CommentRow: name once per turn, no avatar, no per-line meta. |
| Turn label + Fold (`RESPONSE · WORKED FOR 1M 12S` + Show) | generalized **Fold** device | The new small device from the concept: collapse-to-summary, here as a section label. |
| Diff line (`auth/passkey.ts +124 −18`) | `ArtifactEmbed` / compact **diff Embed** | A renders the *one-line* face; opens the fuller `kinds/code-renderer` off-column. |
| Referenced-block line | `BlockRefEmbed` (web) → `Block` + `renderPayload` | One-line collapsed face of the block ref. |
| Session reference line | new small **Session-reference Embed** | Composes id + `KeyValue`-style meta as one line; opens the AM3 dial-in. |
| Review title + foldable reasoning + verdict actions | `RichMessageCard` | A renders RichMessageCard with chrome dialed all the way down — no border/shadow, text-button verdict bar. |
| Composer | `Composer` | textarea + Cmd/Enter; NO model/effort pills (AM3 dial-in). |

All four Embeds resolve to ONE treatment: `EmbedLine` (a muted left-aligned
button line with a trailing `→`). No second card style.

---

## Information hierarchy (numbered, top to bottom)

1. **Host line** — `Passkey login` as a single quiet uppercase tracked label
   (`--text-tertiary`). Names the thread once, then recedes. No banner box.
2. **Founder message** — quiet sender name (`--text-secondary`, once) + a prose
   paragraph (`--text-primary`, 15px, `--leading-relaxed`).
3. **Agent work-turn label** — `RESPONSE · WORKED FOR 1M 12S`, uppercase
   `--tracking-caps` `--text-tertiary`, on a faint `--border-subtle` hairline. A
   `Show` control on the right reveals the one-line work summary. This is the Fold.
4. **Agent prose** — paragraphs with **bold inline lead-ins** ("The change.", …);
   structure from type weight, not boxes.
5. **Embeds** — each on its own muted line directly under its prose lead-in, all
   sharing the column's left edge: the diff line, the block-ref line, the session
   line. Trailing `→` is the only affordance.
6. **Review** — `Review` section label on the hairline, then the 17px semibold
   title, a `Show reasoning · 3 lines` Fold, the same one-line diff embed, then the
   resolved line *or* the verdict actions.
7. **Verdict** — resolved: `Approved by A. Founder` (accent on "Approved").
   Unresolved: three calm text buttons — **Approve** (accent, semibold) /
   **Request changes** / **Reject** (hover → error) — spaced `18px`, no bar.
8. **Composer** — bottom-pinned, one rounded `--r-default` elevated input.

Vertical rhythm: `36px` between turns/sections, `18px` between a lead-in and the
next, `9px` for an embed under its prose, `6px` name→prose. Column `max-w-680px`,
`24px` side padding, centered — generous margins left and right.

---

## Behavior

- **Hover** — embed lines shift text `--text-secondary → --text-primary` and the
  `→` shifts `--text-tertiary → --accent-primary` (`--motion-fast`). Verdict text
  buttons shift toward their tone color.
- **Focus** — all interactive elements are native `<button>`/`<textarea>`; visible
  focus ring inherited from global focus styles. Composer border → `--accent-primary`
  on `focus-within`.
- **Keyboard** — Fold labels and verdict actions are buttons (Enter/Space toggle).
  Each Fold control carries `aria-expanded` + `aria-controls`; reasoning/body
  region carries the matching `id`. Composer: Cmd/Enter to send (production).
- **Fold label** — collapsed by default (calm); the label always reads, the body
  appears only on `Show`. Two folds: the work-turn summary and the review reasoning.
- **Embed open** — compact-inline: each opens its fuller view off-column (diff →
  code-renderer surface; block → the item; session → the AM3 dial-in). The session
  line NEVER expands a work-log inline (concept hard rule).

---

## Mobile adaptation

Single column already; below `768px` the `max-w-680px` is just the viewport minus
`24px` gutters. No layout change. Verdict text buttons keep `18px` spacing and meet
the `44px` touch target via padding added in production (`Composer`/`RichMessageCard`
already touch-sized). Composer stays bottom-pinned. Inputs ≥ 16px on mobile (AQ-005)
applied in the production `Composer`.

---

## Signature

**Prose on a hairline.** The whole conversation is body text in a 680px column;
the only "chrome" is a faint horizontal rule carrying a quiet uppercase label
(`RESPONSE · WORKED FOR 1M 12S`) that opens each agent turn, and embeds that read
as muted single lines flush to the column's left edge. There is no card, no badge,
no avatar, no rail anywhere — identity is named once per turn in `--text-secondary`
and never repeated. It looks like a calmly typeset document, not an app.

---

## Trade-offs

- **(+)** Maximum calm and reading focus; zero chrome competing with the words;
  near-zero new shapes (the Embed is a single shared line). Cheapest to ship.
- **(+)** Embeds never become a wall — one muted line each, all aligned.
- **(−)** Lowest scannability of the three: with no per-turn block tint or border,
  a very long multi-turn thread relies entirely on the hairline labels + whitespace
  to chunk it; a power user skimming 40 turns may want more structure (that is
  Variant B's job).
- **(−)** The diff/block/session distinction is carried by content, not by a
  per-kind affordance — a user must read the line to know what it opens (mitigated
  by the `Session` micro-label and the monospace path + `+/−` on the diff).
- **(−)** Verdict-as-text-buttons is the calmest treatment but the least
  "actionable-looking"; relies on the accent weight on **Approve** to read as the
  primary action.
