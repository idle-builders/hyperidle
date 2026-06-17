# AM1 — Variant A "Quiet stream" · Spec

Thesis: prove the calm, embedding-rich Conversation style ships at near-zero new shapes. The Part model is a THIN presentational layer recombining existing primitives in one calm ~720px reading column. Lowest risk, highest reuse.

Files: `packages/web/src/components/Am1ConversationQuietStream.tsx` (+ `.stories.tsx`). Concept: `plans/AM1/concept.md`. Brief: `plans/AM1/design/brief.md`.

## User workpackage
The founder scans a deliberate person+agent thread, follows what the agent did via compact in-flow embeds (diff, referenced item, session reference), and approves the proposed staging deploy — without ever reading a work-log.

## Component composition (production reuse mapping)
The story hand-rolls visuals for guaranteed rendering; production maps onto existing DS components:

| Slot | Story (hand-rolled) | Production component |
|---|---|---|
| Host banner | inline header row | `ThreadHostBanner` |
| Avatar + agent tint | `Avatar` (local) | `Avatar` (`isAgent` → accent tint) |
| Plain message + sender header | `MessageGroup` + `PlainText` + `SenderHeader` | `CommentRow` (`showSenderHeader` once per group; mention/redaction-aware) |
| Fold ("Worked for…") | `Fold` (local) | NEW small `Fold` device — generalizes `RichMessageCard`'s reasoning fold to any Part |
| Artifact diff embed | `ArtifactDiffEmbed` | `ArtifactEmbed` + `ArtifactPreview` (`text_diff` kind-renderer), compact mode |
| Referenced-item embed | `ReferencedItemEmbed` | `BlockRefEmbed` (web) → `Block` + `renderPayload`, compact |
| Session-reference chip | `SessionReferenceEmbed` | NEW small `SessionReferenceEmbed` (composes `Avatar`+`KeyValue`; a chip, never a log) |
| Review card + verdict bar | `ReviewPart` | `RichMessageCard` (idle/saving/error/resolved; foldable reasoning; `artifactSlot`) |
| Composer | `Composer` (local) | `Composer` (textarea + send, Cmd/Enter; NO model/effort pills) |
| Empty / Loading / Error | inline stubs | `EmptyState` / `SkeletonList` / `ErrorState` |

NEW shapes total: 2 small (`Fold`, `SessionReferenceEmbed`) + a thin Part-model wrapper. Diff embed reuses `ArtifactEmbed` in compact mode — no new shape.

## Information hierarchy
1. **Message text** — full weight `--text-primary`, 15px, the only thing at reading weight.
2. **Embeds** — compact bordered cards/chips in-flow under the sentence that introduces them; an affordance to open, never an inline wall.
3. **Review/verdict** — the one elevated card (`--shadow-default`, `--r-default`); the decision surface, visually heaviest.
4. **Sender + meta** — sender name 13px semibold once per group; time/agent-label `--text-tertiary`, quiet.
5. **Chrome** — host banner + composer recede to `--text-tertiary` / subtle borders.

## All states
- **Empty** — `EmptyState`: "No messages yet" + "Start the conversation…". Centered in the column.
- **Loading** — `SkeletonList`: 3 sender-grouped skeleton rows (avatar circle + 1 meta + 2 text bars), `skeleton-pulse`.
- **Error** — `ErrorState`: "Couldn’t load this conversation" + Retry button.
- **Populated** — full fixture: host banner, founder plain, Atlas group (Fold + diff + referenced-item + session-ref), Atlas review→resolved verdict, composer.
- **Overflow** — long agent text/reasoning Folds to a one-line summary; embeds stay compact (fixed-height card/chip, path truncates); review reasoning folds to "N lines of reasoning". Nothing becomes a wall.

## Behavior
- **Hover** — embeds raise border `subtle`→`default` and reveal the `→` affordance in `--text-secondary`/accent; `motion-fast` color transition only.
- **Focus** — composer border → `--accent-primary` on focus-within; all embeds/buttons are real `<button>`s, tab-reachable, native focus ring.
- **Keyboard** — Tab through embeds in reading order; Enter/Space activates (opens off-column); Fold chevron toggles on Enter; ⌘↵ sends in composer.
- **Fold transition** — chevron rotates 0→90° (`transform`, `motion-fast`, `motion-ease`); body appears below (opacity/transform only, no layout-property animation; honors `prefers-reduced-motion`).
- **Embed open** — compact-inline: opening routes off-column (diff detail / item / AM3 session dial-in); the column never expands a wall in place.

## Mobile adaptation
The single column IS the mobile layout — it already maxes at 720px and centers, so on the **Conversations** tab (of the 3-tab mobile shell) it fills width with the same `px-[24px]` padding. Thread list and session dial-in are separate tabs/routes (out of this column's scope). Embeds reflow naturally (cards full-width, chip wraps); the composer stays sticky to the bottom. Inputs honor AQ-005 (≥16px) on mobile — bump composer textarea to 16px at ≤768px in production.

## The signature
**"Looks like today's product, just calmer — with real embeds."** One quiet reading column where every reference the agent made is a small, legible in-flow card you can open, and the session is a single reference chip — never a work-log. The calm comes from receded chrome + sender grouping + compact embeds, not from new chrome.

## Trade-offs (what this variant is bad at)
- **Low embed richness on screen** — embeds are compact previews, not full renders; deep diffs/documents require a click off-column (B's side panel and C's full-bleed show more without leaving).
- **Vertical length** — a busy thread with many embeds gets tall; no side surface to offload detail.
- **Least distinctive** — by design it reads close to the current product; it wins on risk/reuse, not on "wow".
- **Fold-heavy threads** can feel like a list of collapsed summaries if the agent over-folds; relies on good summary copy.
