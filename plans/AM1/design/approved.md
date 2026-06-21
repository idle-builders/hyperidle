# AM1 Conversation Experience — Approved Design (LOCKED)

`DESIGN-CLASS: novel` (new primitive — the Part model; see `brief.md`). This design therefore proceeds to **`/human-design-review`**; in an autonomous run a novel design **parks** for the founder rather than auto-shipping. The design below is the LOCKED, founder-approved direction — it is the single input contract to `/architecture`.

**Approved design:** the **Conversation Surface** — the full-scope conversation embodied in the real app pane, interactive.
**Story (viewer title):** `Conversation Surface` — variants `Populated` (resting composer, whole thread) and `ComposerInsertBlock` (active Insert-Block composer).
**Component:** `packages/web/src/components/ConversationSurface.tsx` (+ `.stories.tsx`; `data-ds-component="ConversationSurface"`).
**Render:** `plans/AM1/design/full-surface/screenshot.png` (+ detail shots `_chips*.png`, `_composer.png`, `_insert-menu.png`, `_plus_hover.png`, `_questionnaire*.png`, `_review*.png`).
**Full detail spec:** `plans/AM1/design/full-surface/spec.md` (round-by-round founder annotations; this file is the summary contract).

> The three earlier thin-column variants (Quiet Stream / Two-Pane / Calm Document, the A/B/C trio in `brief.md`) were **rejected** by the founder ("too busy, too misaligned, not structured enough"). Their specs, screenshots, comparison/synthesis/critique are removed. The approved direction is this single Full Surface conversation. Do not re-litigate the rejected trio.

This design honors the locked concept (`plans/AM1/concept.md`): deliberate messages only; the session is referenced, never inlined as a work-log; renders within Thread/Message/verdict; nothing named "Block"/"blocked"; no color/token changes (existing Hearth tokens + 6px grid only).

---

## 1 — Scope (what this surface IS)

The **open conversation** = the open thread's content. A conversation **IS** a thread (`conversationId === threadId`; one `threadId` per message, no sub-thread/parent column; one host per thread). One flex column inside the app main pane:

```
header (thread identity) · author-grouped messages (own scroll) · pinned composer
```

**Out of scope (app-shell chrome, owned elsewhere):** navigating BETWEEN threads — the conversation/thread list is the app sidebar (`SidebarV2`, AD9), not this design.

## 2 — The approved design (the calm conversation)

- **Identity model (round-7, founder-locked).** No bubbles, no per-message boxes. Identity at each **author-group head** (avatar + name + time):
  - **Agent** (Atlas) = **green avatar** as the marker — that's enough. A tiny neutral agent-spark glyph after the name is the only secondary cue. **No** green box/tint/accent-rule, no "Agent" pill.
  - **Own** messages (A. Founder) = subtle light background (`color-mix(--text-secondary 3%)`) + a quiet "You" label. (Founder likes the light bg — kept.)
  - **Other humans** (Mara) = plain. Proves a second human reads distinctly from "me" — multi-user.
- **Author grouping** is the structural unit: consecutive same-author messages collapse under one head; one alignment grid (avatar gutter + ~760px reading column); generous calm rhythm (18px inter-group). No box-per-message, no badge soup, no accent rails.
- **Per-message hover toolbar** (React · Reply · ⋯), compact (26px targets), anchored top-right of each group; live on the review group, `group-hover` on the rest.

## 3 — ONE shared reference chip (round-6, founder-locked)

A single `ReferenceChip` is used for **every** attachment/reference, everywhere — composer draft, in-message embeds, knowledge sources, and the review change-set. (Replaces five divergent chips/cards that had drifted apart.)

- **Kinds:** `artifact` (code, e.g. `auth/passkey.ts`) · `image` (e.g. `auth-flow.png`) · `knowledge` (a source/citation IS a knowledge-doc reference) · `block`.
- **Modes:** `draft` (chip **body = open**, trailing **✕ = remove** — two distinct hit targets) and `posted` (whole chip = open, no ✕, a → reveals on hover). Identical outer shell in both modes; only the trailing slot differs.
- Compact (the image-chip size the founder liked); on-grid padding (`pl-[9px]`, even hit area).
- **Builder note:** promote `ReferenceChip` to the design system — kinds {artifact, image, knowledge, block}, modes {draft, posted}. The single attachment/reference primitive across composer + messages + review echoes.

## 4 — Composer

- **Unified "+" tools menu (round-5, founder-locked):** ONE "+" button opens ONE grounded popover with every compose action, each labeled + single-purpose — **Insert block** (the key, accent-highlighted affordance: heading · list · code · table) · Attach file · Mention · Reference item · Format · Emoji. No second/duplicate icon strip. (Resolves "what's the difference between insert and those other icons.") The popover is anchored to the "+" (its relative parent), opens upward, opaque `--surface-overlay` + `--shadow-elevated` (solid above content, never grows the box). On "+" hover the resting button fills with `--surface-container` so it reads as a button.
- **Draft attachments** render as the shared `ReferenceChip` (draft mode) in a single **horizontal compact wrapping row** (~one chip tall) — image AND inserted code block share the identical chip.
- **Conditional reply quote (round-5):** a slim reply banner (reply glyph · "Replying to **Atlas**" · quoted snippet · cancel) shown **only** when replying (the active Insert-Block state); the resting composer has no banner.
- **No bottom footer (round-5):** the format strip + "Enter to send" hint row is removed (served no value, ate height). The reclaimed space goes to a **taller textarea** (`rows=3`, `min-h-[72px]`).
- One real **Send** button (accent). No model/effort/mode pills — those are the AM3 session dial-in, not the conversation composer.

## 5 — Agent message types in the fixture

- **Review message (round-6/7, founder-locked):** a COMPACT REFERENCE into the merged review experience (`ReviewComposition` / `ReviewPage`). "?"-style marker + `REVIEW REQUESTED` caps + the proposal line + the change-set as an `artifact` `ReferenceChip` + a single **"Open review"** button. **NO inline decision** (no Approve / Request changes / Reject in the conversation) and **NO inline code/diff** — the decision is made on the review page. The conversation echoes the **verdict once taken** (`ReviewResolvedPart`: "✓ **Approved** by A. Founder · …" + quiet "View review"), using the merged `verdictDecisionLabel` vocabulary; no buttons.
- **Quick-ask questionnaire (round-6, founder-locked):** a calm SURVEY. A minimal **"?" marker** (small accent-dim circle) + the question + answer options as **neutral hover-buttons** — quiet/neutral at rest (no green bias), full button form on hover; recommendation hinted by a small neutral "Recommended" tag only. Prominence from layering (`--surface-elevated` + `--shadow-default`) + the "?" marker, never from an accent structural border or a biased answer.
- **Subtle session folds (round-7, founder-locked):** the "Worked for 1m 12s · Show" work-fold is the preferred subtle dial-in style. The session reference renders as the **same quiet `Fold`** ("› Show session") — the heavy SESSION embed card was removed ("too much"). No card, no border; opening it enters the session dial-in (AM3), never inlines a work-log.

## 6 — OPEN / ROUTING contract (founder ask, round-8 — LOCKED)

**The conversation owns NO viewing surface.** It renders no bespoke block/artifact viewer inline (the earlier right-page white-box block panel was removed — founder: "why is there a white box around this… do we not have standardized artifact views yet?"). The reference chips/embeds and the review/session affordances are **hooks that open the respective views** — they do not render a viewer in place. Routing:

| Affordance | Opens (destination view) | Route / surface |
|---|---|---|
| **block** chip (title only, e.g. "Auth migration plan · §2"); work-fold; knowledge-source chips | **Knowledge view** (`KnowledgeDetail`) | `/knowledge/:knowledgeId`, anchored to the block |
| **artifact / change-set** chip (`auth/passkey.ts +2 −1`); composer-draft code chip; image | **Artifact view** (`ArtifactView` / artifact permalink) | `/artifacts/:id` → `pages/ArtifactPermalink.tsx` → `shell/ArtifactView.tsx` |
| **review** — "Open review" / "View review" | **review page** (the review experience / `ReviewComposition`) | `/work/bet/:betId/review/:reviewId` → `pages/review/ReviewPage.tsx` |
| **session** fold ("Show session") | **the session dial-in (AM3)** | the AM3 lower-level session surface |

The block chip shows the block's **title only** (never the first line of code); opening it routes to Knowledge. AM1's build **wires these hooks to those routes; it does NOT build the destination views.** The destination views are provided by existing surfaces + the **standardized artifact-view & open/routing contract (AM5)**. Standardizing the artifact views across knowledge/work/review is a fragmented cross-cutting concern, out of AM1 scope.

In the isolated story (no router) each hook is a clearly-labeled `console.info` naming its real destination route (`openKnowledgeView` / `openArtifactView` / `openReviewPage`); nothing mounts inline.

## 7 — Constraints (locked)

- No color/token changes; existing Hearth tokens only. 6px grid spacing `{3,6,9,12,18,24,36,48}`; radius `{10,16,9999}`; closed type scale; warm tones only.
- Deliberate messages only; session activity is NEVER first-class conversation content (concept hard-rule #3).
- Nothing named "Block"/"blocked" in the rendering vocabulary.
- Renders within Thread/Message/verdict; reshapes none of them.

## 8 — Open questions for the architect

- **Exhaustive Part dispatch.** The renderer dispatches exhaustively over `plain | review | questionnaire | verdict` with an `unknown` fallback Part (mirrors Block's `unknown` kind). Adding a Part kind is concept-gated.
- **AM1↔AM3 reuse contract.** The Part model is the shared structure AM3 renders session activity through — no duplicated renderer. Architecture defines the source-agnostic boundary (`Message` → Part and a session event → Part feed the SAME `Part[]` renderer).
- **Closed Embed target-kind set.** `artifact | block | diff | session-reference | entity-ref | mention`, typed as a closed discriminant; new kinds require a concept-doc update.
- **Parts and Folds are derived, never stored.** No `part` table/column; Fold state is UI-local. Parts derive per render from the source (`Message[]` or session events).
- **Open/routing wiring (AM5).** Architecture wires the chip/review/session hooks to the routes in §6, depending on the standardized artifact-view & open/routing contract (AM5); it does not build the destination views.
