# L1 Thread primitive — Design brief

## What story this serves

TRACK-L L1 — Thread primitive (concept + shared implementation, DS quality).

The concept (locked) lives in `docs/concept/HUMAN_INTERFACE_LAYER.md` §4.5. **The variants must respect the concept; they do not redefine what a Thread / Message IS.** They explore the *visual & interaction shape* of the rendered thread shell, the message stream, and the three message types.

## What gets designed

A reusable design-system family that any consumer (Conversations queue detail, bet detail, knowledge-item detail, artifact detail, coach surface) can mount to render one Thread. Specifically:

1. **`ThreadShell`** — the wrapper around messages. Carries the host attachment label (e.g. "On bet: Pricing overhaul"), participants summary, blocking indicator, resolved status, pinned indicator, an optional collapse/scroll affordance for long history.
2. **`MessageStream`** — the chronologically-ordered list of messages within a thread. Handles message grouping (consecutive messages from the same sender), timestamps, separators.
3. **`MessageRow`** (the discriminated dispatch surface) — renders one message; dispatches by `type`:
   - **`PlainMessage`** — text body, optional inline reference cards (knowledge item, task, artifact link rendered as a small pill or card).
   - **`ReviewMessage`** — embeds an artifact reference + a verdict affordance (5 binding actions: approve / approve-with-comments / request-changes / edit / reject; 3 message-emitting non-binding actions: comment / inline-comment / reply; 2 sidecar workflow actions: snooze / escalate).
   - **`QuestionnaireMessage`** — embeds a constrained answer set + an answer slot.
4. **`Composer`** — the input affordance at the bottom of the thread. Sends a plain message by default; consumers can mount review-action affordances when the latest message is a review.

## What does NOT get designed in L1

- The **Submenu thread list / queue** — that's L8.
- The **detail-route shape** (collapsing review/chat URLs to one) — that's L9.
- The **filter chips** — that's L10.
- The **artifact embedding contract** (how a review message *embeds* an artifact's preview) — that's L11. L1 exposes a slot; L11 fills it.
- The **per-block discussion gutter** — that's L26. L1 produces a thread renderer; L26 places it in the gutter.

## Concept contracts the variants MUST respect

- A Thread has no shape of its own. The differences live on *messages* (typed shapes) and on the thread's *configuration* (host + pinning + membership).
- Message types are CLOSED: `plain | review | questionnaire`.
- Host kinds are CLOSED: `bet | task | knowledge_item | artifact | agent | user | team | factory`.
- Verdicts are messages, not hidden state on the review message — the audit trail lives in the message sequence.
- Rich messages render via a typed dispatch (TypeScript discriminant). No untyped HTML payloads.
- "Review thread" is shorthand for "thread containing an unresolved review message"; the visual indicator must read off the messages, not a `kind` column on the thread.
- Blocking ⇔ the participating agent cannot continue without an answer; drives ordering (blocking sorts first).

## Founder filter — explicit rejection list (no variant may include these)

- **No keyboard verb shortcuts** (founder demoted in TRACK-L scope rules).
- **No optimistic-UI bragging** (founder demoted).
- **No emoji reactions** (founder demoted).
- **No customizable dashboards / view kits** (founder demoted).
- **No drag-reorder of threads** (founder demoted).
- **No emojis as iconography** (per `.claude/rules/aesthetic-quality.md` AQ-105).
- **No purple gradients, hero sections, decorative icons on every element** (per `.claude/rules/frontend.md`).
- **No `rounded-2xl`/`rounded-3xl`** (per AQ-101).

## Existing design system (use these, don't reinvent)

- Custom components already live in `packages/design-system/src/`: `BetCard`, `EmptyState`, `ErrorState`, `KeyValue`, `KnowledgeRow`, `NavItem`, `NotificationRow`, `PitchCard`, `SearchField`, `Skeleton`, `StatusChip`, `Tag`, `TaskCard`, `ThreadRow`. ThreadRow is a **list-row** primitive (used in the Submenu) — it is NOT the thread detail shell. The detail shell is what L1 is designing.
- HTML reference: `packages/design-system/html/_tokens.css`. Variants link this directly.
- Lucid Dark theme is default. All variants must render correctly in Lucid Dark.
- Density tokens drive every padding/gap. No raw `p-[Npx]`. See AESTHETICS.md § Spacing.

## Real data shape for the mockups

Use real-feeling content from `docs/concept/HUMAN_INTERFACE_LAYER.md` §6 examples:

- **Plain message thread (chat shape)** — Builder asking a founder a question:
  - Host: `task`, "Implement Stripe webhook handler"
  - Participants: Backend Builder, Founder
  - Sender Backend Builder: "I'm stuck — Coolify deploy keeps timing out. The webhook signing keys might be wrong. Can you check?"
  - Sender Founder: "Yes — they're in `.env.production` under `STRIPE_WEBHOOK_SECRET`. Should I rotate them?"
  - blocking: true (Builder is paused on the founder's answer)

- **Review message thread (review shape)** — Backend Builder asking for sign-off on a deploy:
  - Host: `bet`, "Pricing overhaul (Nimmly)"
  - Participants: Nimmly Backend Builder, CPO
  - Sender Nimmly Backend Builder, type=`review`: "Deploy Nimmly pricing-engine v1.4.2 to staging. Reasoning: 1) verified margin calc against contracts; 2) ran integration tests; 3) staging only — production gated on next review." Embed: `text_diff` artifact preview (40-line diff in `pricing-engine/src/calculate.ts`).
  - Verdict slot: 5 binding actions visible.
  - blocking: true.

- **Questionnaire message thread** — Product Manager asking founder which of three pitches to commit to:
  - Host: `bet`, "Cycle 7 commitment"
  - Sender Product Manager, type=`questionnaire`: "Pick which to commit this cycle. (one of)" with answers: ["Search relevance overhaul (6 weeks)", "Onboarding v2 guided flow (4 weeks)", "Margin alerts dashboard (3 weeks)"].
  - blocking: false (PM is async — will pick up the answer next session).

- **Coach thread (pinned, configuration)** — Chief of Staff to founder:
  - Host: `user`, the founder.
  - Pinned: true.
  - Plain messages over time + a review message ("Proposed edit to PRINCIPLES.md").

## Variant assignment

| Variant | Working name | Constraint | Thesis |
|---|---|---|---|
| **A** | `slack-shaped` | Highest information density per row. Messages flow in a single column; rich messages are inline cards inside that flow. Optimised for long, conversational threads with many participants. Composer pinned at bottom. | A chat metaphor: every thread feels like a Slack channel. The eye lands on the latest unread message; the rich messages are noticed because they're typographically heavier, not because they take a separate region. Density beats separation. |
| **B** | `linear-shaped` | Issue-shaped: one HEAD message + a comment stream BELOW. The head is whichever message is "the substance" — the original review or questionnaire if present, or the first message otherwise. Subsequent messages are condensed below. Verdict / answer affordances live at the head, sticky-pinned. Optimised for PR-review-style review threads. | The thread is *about a thing* — the head message — and the rest is discussion. The user lands on the substance first and the conversation second. A proven Linear / GitHub / Notion shape. |
| **C** | `slate-shaped` | Artifact-first / canvas-first: the rich message takes the full primary surface (canvas), and the comment / discussion stream is a *dock* on the side. The thread is rendered as: canvas (the artifact + verdict affordance) ‖ dock (chronological message list, narrower). Optimised for deep review of complex artifacts. | The thread is *about the artifact*; the conversation is supporting context. Best when the embedded artifact is heavy (multi-file diff, full landing-page preview, design mockup). Borrows from Figma's comment dock + Linear's canvas-with-side-panel pattern. |

Anti-convergence requirement: variants must differ on at least 3 of these axes per pair: hierarchy (where the eye lands first), density, state strategy, motion, action surface, composition, copy register.

| Axis | A (slack) | B (linear) | C (slate) |
|---|---|---|---|
| Hierarchy | latest message at bottom; composer dominates | head message at top; verdict pinned | artifact canvas dominates; dock secondary |
| Density | high (single-column, tight rows) | medium (head expanded; comments compact) | low primary (canvas) + medium secondary (dock) |
| Action surface | composer at bottom | sticky verdict bar near head | canvas-edge toolbar |
| Composition | 1 stream + 1 composer | 1 head + 1 stream + 1 composer | 1 canvas + 1 dock + 1 composer |
| Copy register | terse, chat-shape | structured, issue-shape | label-driven, document-shape |

## Per-variant deliverable

Each variant produces:
1. `spec.md` — the opinionated spec (component composition, hierarchy 1/2/3, all states, behaviour, motion, mobile adaptation, signature, trade-offs).
2. `mockup.html` — self-contained HTML that links `_tokens.css`, embodies the variant, demonstrates the *primary state* (a populated thread with a mix of messages — at minimum: 1 plain + 1 review + 1 plain reply). Where states matter (loading / empty / error / overflow), embody at least *two* of them.
3. `screenshot.png` — a Playwright screenshot of `mockup.html` at desktop width (1280×800).

## Hard quality bar

- Lucid-dark surfaces only (the file is allowed to render light, but dark is the canonical screenshot).
- Spacing on the 4px grid. No off-scale radius. No off-scale type sizes. No hardcoded colors.
- A reader scanning for 3 seconds must identify (a) what kind of thread this is, (b) whether the user needs to act now, (c) where to act.
- Render at least one rich message (review or questionnaire) so the variant's stance on the generative-UI dispatch is visible.

## Output location

`docs/design-explorations/L1/<variant-slug>/{spec.md, mockup.html, screenshot.png}`

Slugs already exist: `slack-shaped`, `linear-shaped`, `slate-shaped`.
