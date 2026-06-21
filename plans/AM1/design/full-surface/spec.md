# AM1 — Conversation v3: Full Surface (C) — Design Spec

Supersedes the rejected v1/v2 thin-column variants (QuietStream / Quiet Turns / Calm Document). This is the v3 foundation embodied in the real app container, per `plans/AM1/design/brief-v3.md`.

**Story:** `AM1 Conversation — Full Surface (C)` / `Populated`. Renders at desktop width on `--surface-page`.
**Component:** `packages/web/src/components/Am1ConversationSurface.tsx` (`data-ds-component="Am1ConversationSurface"`).

> **Revision (v3.2) — THE CONVERSATION IS THE SURFACE.** Scope = the OPEN conversation, i.e. the open thread's content. A **conversation IS a thread** — settled in the schema: `conversationId === threadId`; messages carry one `threadId` with no sub-thread / parent column. A thread attaches to exactly ONE host (bet/task/user/team/agent/artifact/knowledge_item/factory). There are **no Slack-style sub-threads**.
>
> **Navigating BETWEEN threads is the app sidebar (`SidebarV2`, AD9)** — app-shell chrome, NOT part of this design. The v3.1 left "inbox / thread-list" pane WAS that app sidebar and has been **removed**. What remains is the conversation itself: header (thread identity) · author-grouped messages · composer.

---

## v3.10 — round-8: the conversation owns NO viewing surface; chips are navigation hooks (founder annotations, this revision)

Three founder comments on the round-7 right-page block viewer drove this pass; verified by clicking block / artifact / "Open review" in the `:8100` viewer and reading the console (`screenshot.png` = resting surface, no right pane).

> **Founder (verbatim):** "Why is there a white box around this. generally not sure what this is? Do we not have standardized artifact views yet?" · "Is this a block? Why does this not open the knowledge view?" · "This looks weird. we need to figure out what the artifact views look like. the review already has more time invested here … in review it's more about diffs."

### A. The bespoke right-page block viewer is REMOVED
The conversation does **NOT** own a viewing surface. The `Am1BlockRightPanel` (the white-box right page that rendered a full `<Block>` via the real viewer) and all the state that drove it (`openPanel`, `PanelKey`, `PANELS`, the block-payload fixtures, the `Block` import) are **deleted**. The surface is now just the conversation column + composer — no right pane, so the earlier "right panel cramps the conversation" problem is gone too.

### B. Reference chips are NAVIGATION HOOKS into the existing, OWNED surfaces
Each chip routes to a surface that already exists and is owned elsewhere — nothing renders inline:
- a **BLOCK** chip → the **Knowledge view** (`/knowledge/:knowledgeId`, `pages/KnowledgeDetail.tsx`), anchored to the block (founder comment 2 — "why does this not open the knowledge view?"). The work-fold, session fold, and knowledge-source chips route here too.
- an **ARTIFACT** chip (the change-set `auth/passkey.ts +2 −1`, the composer-draft code chip, the image) → the **Artifact view** (`/artifacts/:id`, `pages/ArtifactPermalink.tsx` → `shell/ArtifactView.tsx`).
- **"Open review"** / "View review" → the **review page** (`/work/bet/:betId/review/:reviewId`, `pages/review/ReviewPage.tsx` → `ReviewComposition`) — unchanged from round-7.

In the isolated story (no router) each hook is a clearly-labeled `console.info` naming its real destination route (`openKnowledgeView` / `openArtifactView` / `openReviewPage`). Verified: clicking a block chip logs the Knowledge-view route, an artifact chip logs the Artifact-view route, "Open review" logs the review-page route; **no** `Am1BlockRightPanel` and **no** real `<Block>` node mount on any click (`panelAfterClicks=0`, `realBlockNodes=0`).

> **Out of AM1 scope:** standardizing the artifact views themselves across knowledge / work / review is a fragmented cross-cutting concern (the review proof-canvases in `pages/review/` are diff-oriented and further along; `shell/ArtifactView.tsx` + `pages/ArtifactPermalink.tsx` are the generic artifact view). AM1 only HOOKS into these surfaces; it does NOT define them.

Unchanged from round-7: the shared `ReferenceChip` (kinds {artifact,image,knowledge,block}, modes {draft,posted}), agent identity = green avatar only (no boxes), own-message light bg, the conditional reply banner, horizontal compact attachments, taller textarea, no bottom footer, the questionnaire ("?" marker + hover-button options), the review request + resolved verdict echo, the unified subtle session folds, the "+" hover button.

---

## v3.9 — round-7: quiet identity + review-page target + unified session fold (founder annotations, prior revision)

Four founder comments drove this pass; verified by looking at the rendered surface + clicking "Open review" in the `:8100` viewer (`screenshot.png`).

### A. Agent identity = green avatar ONLY — no green box (comment 1)
The agent-message **background tint + left accent rule** (the "green box" around agent message groups) is **removed**. The **green avatar is the agent marker** — that's enough. A tiny neutral agent spark glyph sits after an agent's name as the only secondary cue (no green pill, no box, no accent-colored structural border). The old `border-l-[2.5px] border-[accent-primary]` + 4% accent tint + "Agent" pill are gone.
- **Identity model now:** own messages (A. Founder) = subtle light background (`color-mix --text-secondary 3%`) — **kept** (comment 5, founder likes it); agent (Atlas) = green avatar, plain group, spark glyph; other humans (Mara) = plain. Clean and quiet.
- Verified: no tint/border/accent-rule on any agent group; the Founder groups keep the light bg; Mara plain.

### B. "Open review" → the REVIEW PAGE, not the artifact (comment 2)
The review message's **"Open review →"** targets the **review experience** (`packages/web/src/pages/review/ReviewPage.tsx` → route `/work/bet/:betId/review/:reviewId`, rendering `ReviewComposition`) — NOT the code/artifact viewer. Two distinct targets in `ReviewRequestPart`:
- the **artifact chip** (`auth/passkey.ts +2 −1`) → opens the artifact (right-page `<Block>` viewer), via `onOpenArtifact`;
- **"Open review →"** → routes to the review page, via `onOpenReview`. `ReviewResolvedPart`'s "View review →" routes there too.
- Story has no router, so `onOpenReview` is a clearly-labeled noop (`console.info("[AM1] open review page → /work/bet/:betId/review/:reviewId")`); the spec is the contract that it routes to the review experience, never the right-panel Block viewer. Verified: clicking "Open review" logs the review-page route (NOT a block-panel open).

### C. Session dial-in unified to the subtle fold; heavy SESSION card removed (comments 3,4)
The "Worked for 1m 12s · Show" **work-fold** is the preferred, subtle session dial-in style (founder: "more subtle and the better one"). The separate heavy **SESSION embed card** ("Atlas · Opus 4.8 · 14 tool calls · Dial in" on an elevated bordered surface) was "too much" and is **removed** (along with the `Embed` / `EmbedKindLabel` / `SessionRefEmbedBody` components). Session dial-in now renders as a quiet **"› Show session"** line in the **same `Fold` style** as the work-fold.
- `Fold` generalized: optional `label`, an optional `cta` ("Show" default, "Show session" for the session line), and an `onShow` handler so it's live. No card, no border, no heavy chrome.
- Verified: no `Am1Embed` in the DOM; the session dial-in is the subtle fold line.

Unchanged from round-6: the shared `ReferenceChip` (kinds {artifact,image,knowledge,block}, modes {draft,posted}), the review request (REVIEW REQUESTED + proposal + artifact chip + Open-review) and resolved verdict echo, the questionnaire ("?" marker + hover-button options), the "+" hover button, interactivity (Insert opens; block "Open" → right-page real `<Block>` viewer), the conditional reply banner, horizontal compact attachments, taller textarea, no bottom footer.

---

## v3.8 — round-6: one shared chip + review rethink (founder annotations, prior revision)

Branch rebased onto `origin/main` — the merged review experience (AL2/AL3/AL4: `pages/review/ReviewComposition.tsx`, `review-composition.ts`) is now the source of truth for the review surface. Ten founder comments drove this pass; verified by clicking + screenshotting in the `:8100` viewer (`screenshot.png`; `_chips.png` = composer-draft chips; `_chips_message.png` = same chip inside a message; `_review.png` = review request; `_review_resolved.png` = verdict echo; `_questionnaire.png` / `_questionnaire_hover.png`; `_plus_hover.png`).

### A. ONE shared reference/attachment chip — used EVERYWHERE (comments 2,3,4,5,6)
`ReferenceChip` (single component) replaces the five divergent chips/cards (`DraftAttachmentChip`, `AttachmentChip`, `BlockTitleEmbed`, `CitationChips`, `ChangeSetEmbedCard`). One look everywhere — composer draft AND inside messages.
- **`kind`**: `artifact` (code, e.g. `auth/passkey.ts`) · `image` (e.g. `auth-flow.png`) · `knowledge` (a knowledge-doc source/citation) · `block`.
- **`mode`**: `draft` (body = open · trailing ✕ = remove — two hit targets) and `posted` (whole chip = open, no ✕, → reveals on hover). Identical outer shell in both modes; only the trailing slot differs.
- Compact (the image-chip size the founder liked); on-grid padding `pl-[9px] pr-[3px]/[9px]` — fixes "icons too close to the edges" (comment 4).
- **Sources/citations (comment 5)** render as `knowledge`-kind chips — a source IS a knowledge document reference; each opens the doc. No vague "Sources" text label.
- **Change-set (comment 6)** renders as an `artifact`-kind chip (`auth/passkey.ts +2 −1`) that OPENS the artifact in the review experience — NOT a big inline-code card (the old real-`ArtifactEmbed` card + `Artifact` fixture were removed). Inline code WOULD be a Block; this is an artifact attachment.
- Verified: 7 posted chips + 2 draft chips per story; the composer-draft chip and the in-message chip share the same `Am1ReferenceChip` shell; no `Am1ArtifactEmbedCard` in the DOM; the conversation text never contains the code first line.
- **Builder note:** promote `ReferenceChip` to the design system (`packages/design-system`) — kinds {artifact, image, knowledge, block}, modes {draft, posted}; it is the single attachment/reference primitive across composer + messages + review echoes.

### B. "+" composer button hover = button form (comment 1)
On hover the resting "+" fills with `--surface-container` (rounded) + a stronger border, so it reads as a BUTTON, not just a glyph color change. Verified computed hover background = `rgb(245,240,235)` (`--surface-container`).

### C. Review message — rethought against the merged review experience (comment 7)
Aligned to `ReviewComposition` (the decision lives there — `FrameHeader`'s Verdict; `ReviewVerdictState` carries the resolved decision).
- **`ReviewRequestPart`** — a compact REFERENCE: "?"-style marker + `REVIEW REQUESTED` caps + the proposal line ("Approve deploy of passkey login to staging") + the change-set as an `artifact` `ReferenceChip` + a single **"Open review →"** that opens the review page. **NO inline decision** (no Approve / Request changes / Reject in the conversation) and **NO code/diff**.
- **`ReviewResolvedPart`** — the verdict ONCE TAKEN, echoed into the conversation: "✓ **Approved** by A. Founder · approve deploy of passkey login to staging" + a quiet "View review →". Uses the merged `verdictDecisionLabel` vocabulary; no buttons.
- Both reads are visible in the fixture: message 7 = the request (Atlas), message 8 = the resolved verdict echo (Founder). Padding is on-grid (`p-[18px]`) — as clean as the questionnaire card. Verified: no decision buttons in the DOM, no inline code.

### D. Questionnaire (comments 8,9,10) — kept its nice look, but:
- The big "QUICK ASK · NEEDS YOUR ANSWER" pill is replaced by a **minimal "?" glyph** in a small accent-dim circle — no big multi-word colored pill, no third font/color (comment 9).
- Answer options read as **buttons**: quiet + neutral at rest (no green bias), and on **hover** the full button form appears (`--surface-container` fill + stronger border) so they're obviously clickable choices (comment 10). Recommended hinted by a small neutral tag only. Verified hover state.

Removed in this pass: the `ArtifactEmbed` import + `Artifact`/`CHANGE_SET_ARTIFACT` fixture (the change-set is now a chip), the `BlockTitleEmbed`/`AttachmentChip`/`CitationChips`/`DraftAttachmentChip` components (folded into `ReferenceChip`), the old `ReviewPart`/`VerdictEcho` (replaced by request + resolved). Unchanged: interactivity (Insert opens, Open → right page with the real `<Block>` viewer), agent-vs-human, the conditional reply banner, horizontal compact attachments, taller textarea, no bottom footer, the unified "+" menu.

---

## v3.7 — round-5 composer pass (founder annotations, prior revision)

Six founder comments, all on the composer draft/attachment area, verified by clicking + screenshotting in the `:8100` viewer (`screenshot.png` = resting `Populated`; `_composer.png` = composer with horizontal compact attachments + taller input + no footer).

**Composer anatomy (after this pass):**
```
[ reply banner — ONLY when replying ]
[ attachment chips — horizontal wrapping row, compact, SAME style for image/code-block/etc.; click body = open, ✕ = remove ]
[ +(tools menu)   textarea (taller, rows=3)                                Send ]
```

1. **One chip style for EVERY draft attachment.** The inserted code block and the image attachment now render through the SAME compact chip (`Am1DraftAttachmentChip`) — verified: the two chips' class strings are identical. Founder: "why does the code block attachment have a different style than the image?" The old full-width inserted-block title card + separate side ✕ is gone.

2. **Chip interaction: body = open, ✕ = remove.** Each chip is two distinct hit targets — an open-body `button` (aria `Open <name>`, opens the right panel / item) + a trailing ✕ `button` (aria `Remove <name>`, removes from the draft). Founder: "the open should just happen by clicking on the item, the x removes it." Verified: 2 buttons per chip, distinct aria.

3. **Horizontal compact row, ~one chip tall.** Attachments lay out in a wrapping `flex` row (`flex-wrap gap-[6px]`), not a vertical stack. Verified: both chips sit on the same y (Δ<4px) at 26px tall. Founder: "the attachments section should be the smaller part… if they line up horizontally this will become typically just the height of a single attachment."

4. **Taller textarea.** With attachments compact and the footer gone, the input grows to `rows={3}` / `min-h-[72px]` (measured 74px). Founder: "gives space for this one to become a bit taller."

5. **Bottom footer REMOVED.** The format-icon strip + "Enter to send · Shift+Enter" hint row is gone — verified the footer text is absent in both states. All tools already live in the "+" menu; the footer was redundant and ate height. Founder: "this bottom footer of the box serves no value it just takes away space."

6. **Reply banner is CONDITIONAL.** Shown ONLY when replying (the active Insert-Block state); absent in the resting `Populated` composer. Verified: banner count = 0 in `Populated`, = 1 in `ComposerInsertBlock`. Founder: "I assume this header disappears if you are not replying to something?" — yes.

Unchanged: the real `ArtifactEmbed` change-set card, the real `<Block>` viewer on "Open", inline block embeds = title only, the neutral questionnaire, the unified "+" tools menu (grounded solid popover: Insert block · Attach · Mention · Reference · Format · Emoji).

---

## v3.6 — round-5: INTERACTIVE + real components (founder annotations, prior revision)

Founder asked to **SEE it work** ("I want to see this interactive and open the right page and display the full block in the proper block viewer component that we already have"). The story is now **live React** — verified by clicking in the `:8100` viewer and screenshotting each state (`_insert-menu.png`, `_open-block.png`, `screenshot.png`).

1. **Insert "+" affordance WORKS — solid grounded popover.** Click "+" toggles `insertMenuOpen`; click "+" again, outside, or Escape closes it. The menu is anchored to the "+" (its relative parent), opens upward, and is now a **guaranteed-SOLID surface**: `background: var(--surface-overlay)` + `zIndex: 50` are set via **inline style**, because the arbitrary-value `bg-[var(--surface-overlay)]`/`z-30` Tailwind classes did NOT resolve in the viewer JIT — the menu was painting `rgba(0,0,0,0)` (transparent) with `z-index:auto`, which IS the founder's "floating completely out of place in transparent. pretty wrong." Probed computed style after fix: `rgb(255,255,255)`, `zIndex:50`. No content bleeds through; the popover never grows the composer box.

2. **Block "Open →" WORKS — opens a RIGHT PAGE rendering the FULL block via the real `<Block>` viewer.** Clicking any block-title embed (inserted code draft, or the referenced "Auth migration plan · §2") sets `openPanel` and slides in `Am1BlockRightPanel`, which renders the full block(s) through the **real `Block` component** (`@hyperidle/design-system`, the same viewer Knowledge uses) — verified: 2 real `[data-ds-component='block']` nodes mount in the panel. A close ✕ returns. This is the "open in the right page" founder asked to SEE working — no facsimile.

3. **Inline block preview = TITLE only (never code first line).** The inserted code embed shows `CODE BLOCK · TS / auth/passkey.ts` + "Open →" — verified the conversation text does NOT contain the code first line (`navigator.credentials.create`). The full multi-line code render lives only in the right page.

4. **Change-set / artifact embed = the real `<ArtifactEmbed>`.** A `kind:"code"` `Artifact` (valid `preview {kind:"code",file,hunks}`, `cost.money/tokens`, `createdAt`) renders through `@hyperidle/design-system`'s `ArtifactEmbed` inside the message host card — verified `[data-ds-component='ArtifactEmbed']` present. Renders `CODE / CHANGE SET · WIRE PASSKEY LOGIN · $0.42 · 6M AGO` + `auth/passkey.ts (+2 -1)`.

5. **Composer tools UNIFIED into ONE "+" menu.** The duplicate bottom icon strip is gone. The single "+" opens one menu with every action, each labeled + single-purpose: **Insert block · Attach file · Mention · Reference item · Format · Emoji**. Resolves "what's the difference between insert and those other icons / why is the insert there and not where the other icons are." *(v3.7: the residual "Enter to send" hint footer below the input was also removed — see v3.7 §5.)*

6. **Questionnaire — neutral SURVEY options + token padding.** All three options are **identical quiet outlined chips** on `--surface-elevated`; no "very very green" filled chip biasing an answer. The recommendation is a small **neutral** "RECOMMENDED" tag (`--surface-container`/`--text-tertiary`), not an accent fill. Padding is on-grid Hearth (`px-[18px] py-[12px]`, `mt-[12px]` between question and chips). Prominence comes from layering (`--surface-elevated` + `--shadow-default`) + the QUICK ASK pill — never from an accent structural border (none present) and never from biasing one answer.

`Populated` is the resting conversation (menu + right panel closed by default; founder clicks to open). `ComposerInsertBlock` shows the active composer with the inserted-block draft.

---

## v3.5 — round-4 detail fixes (founder annotations, prior revision)

Three element-anchored founder notes on the `ComposerInsertBlock` / `Populated` states drove these. Confirmed in the `:8100` viewer (`plans/AM1/design/full-surface/screenshot.png`; QUICK ASK verified element-level).

1. **QUICK ASK prominence via LAYERING — no accent-colored structural border (HARD RULE).** Founder: "this border is absolutely very wrong. those are not allowed in our style." The questionnaire previously used `border-[var(--accent-primary)]` + a `border-l-[3px]` accent rule + a 5% accent tint. **All removed.** Hearth principle — *status through content, not thick structural colored borders; cards stay structurally uniform.* The QUICK ASK is now an **elevated surface** (`--surface-elevated` + `--shadow-default`, `--r-default`) with a neutral `--border-subtle`, identical card chrome to the review card. Prominence comes from **layering** (the card lifts off the page) + the **"QUICK ASK · NEEDS YOUR ANSWER" pill** + the **answer chips** (recommended = filled accent + "RECOMMENDED", others outlined). The agent group already carries the left accent rule for identity, so no second competing accent is stacked. **No accent-colored structural border appears anywhere in this surface.**

2. **Insert menu — grounded popover, rendered CLOSED in the review frame.** Founder (twice): "floating completely out of place in transparent. pretty wrong." The menu's grounded-popover anatomy ships: its **relative anchor is the "+ Insert" button itself** (not the composer card), so it opens UPWARD off the button and reads as belonging to it; opaque `--surface-overlay` (#ffffff) + `--shadow-elevated`; absolute overlay so the composer never grows. **In this review frame the menu is rendered CLOSED** (`insertMenuOpen={false}`): open, it collided messily with the inserted-block draft sitting directly above the input row. The capability reads cleanly from the **inserted-block preview + the "+ Insert" button** — no menu floating in a transparent gap. The `hasDraft` and `insertMenuOpen` props are decoupled so the inserted-block RESULT shows with the menu closed.

3. **Inserted block preview — clean, minimal, opens in the right page.** Founder: "for a block in the typical sense the title might be enough" + "incorporate opening a block in the right page" + "whats this weird space here?" The inserted block is a **compact preview card consistent with the artifact/change-set Embed**: kind marker (`‹› CODE BLOCK · TS`) + a one-line snippet + "3 lines · open to edit" + an **"Open →"** hook that opens the full block in the **right slider (track AL)** + a single quiet remove ✕ at the row end. The old handle gutter (the "weird space") is gone; the off-grid `mt-[1px]` meta gap was fixed to `mt-[3px]` (Hearth grid). **`code` is a confirmed valid `BlockKind`** (`heading/paragraph/list/quote/code/table/divider/image/html`, with `lang`+`text` payload) — so the inserted code block is conceptually a Block, not relabeled as an artifact.

---

## v3.4 — round-3 detail refinements (founder annotations, prior revision)

Five element-anchored founder notes on the `ComposerInsertBlock` / `Populated` states drove these changes. Confirmed in the `:8100` viewer (`plans/AM1/design/full-surface/screenshot.png`).

1. **Insert menu = a floating POPOVER; the composer never grows.** The Insert menu was inline in the composer flow, so opening it ballooned the box ("horrible"). It is now an **absolutely-positioned popover** anchored above the composer card, left-aligned to the "+ Insert" button (`style={{ bottom: "calc(100% + 6px)", left: 12 }}`, `--surface-overlay` + `--shadow-elevated`). It overlays the calm message area above the composer; the composer keeps its compact height open or closed. The popover is **shrunk to 228px** (was 300px), the redundant "INSERT" heading is **dropped** (the button already says Insert), and options are compact icon + label + tiny hint: **Block · Attach file · Mention · Reference item**. *(Note: Tailwind arbitrary `bottom-[calc(100%+6px)]` does NOT parse without underscores; inline `style` is used for the calc — see `@lore` in source.)*

2. **Inserted block = a compact PREVIEW card (not the inline rich editor); weird gap removed.** The composer's Insert-Block no longer renders the full rich code-block editor inline. It renders a **compact preview card consistent with the artifact/change-set Embed**: kind marker (`‹› CODE BLOCK · TS`) + a one-line snippet + "3 lines · inserted into this message" + an **"Open →"** hook that opens the full block/artifact in the **right slider delivered by track AL**. The old `grid-cols-[24px_1fr]` block-handle gutter (the "weird space") is gone; a single quiet remove ✕ sits at the row end. Same pattern applies to a block rendered inside a message.

3. **Questionnaire / QUICK ASK is now unmissable.** Wrapped in a bounded, accent-edged container (border + `border-l-[3px]` accent rule + faint 5% accent tint). A **"QUICK ASK · NEEDS YOUR ANSWER"** pill with a question glyph, the question text given weight (15px/600), and answer chips rendered as clearly tappable choices — the **recommended** option is a solid filled accent chip with a "RECOMMENDED" label, the others outlined on `--surface-elevated`. Calm but reads as a decision to make, not plain tags.

4. **Reply banner = a clean slim strip.** Refined from a stacked two-line block into a **single slim strip**: accent reply glyph · "Replying to **Atlas**" · quoted snippet (one line, truncated) · cancel, tied by a 2px accent left rule. With the popover fix the box no longer grows, so the banner reads clean at the composer top.

5. **Review card: spacing restored, still AL's (compact hook only).** The review message uses an even 12px-rhythm `flex-col` (`gap-[12px]`) so it no longer looks broken: marker · bold proposal line · change-set Embed · single "Open review →" button. The **full review card / verdict bar / diff is owned by track AL** — not designed here.

Stray text `✕` glyphs were replaced with a proper `ICON_REMOVE` svg across the reply banner, attachment chip, and inserted-block remove for consistency.

---

## v3.3 — round-3 detail refinement (prior revision)

Round-2 founder comments + the explicit scope boundary drove six refinements. The headline change is the **scope cut**: the review/artifact experience is owned by a parallel worktrack.

### Review / artifact = track AL (NOT designed here)
The **review experience — artifact review, the verdict flow, and the right slider/diff pane — is owned by track AL.** This design does **not** build it. Consequences:

- **The change-set / diff context pane is REMOVED.** There is no diff body, no tab strip, no `ContextPane`, no `paneOpen` state in this surface.
- A change-set/artifact appears only as a **compact Embed card that is a HOOK**: it carries an **"Open →"** affordance and "opens the artifact in a right slider" delivered by AL. The embed renders kind + filename + `+N/−M` and nothing more.
- The **review message stays compact**: the agent proposes X (one title line + the change-set hook) with a single **"Open review →"** button into AL's verdict flow. No verdict bar (Approve / Request changes / Reject), no reasoning detail, no diff — those are AL's. The two workstreams piece together later: AM1 emits the hook, AL delivers the destination.

### Composer Insert-Block capability (the conversation composer's unique power)
The composer can **insert a knowledge Block** (heading / list / code / table / quote) with the **same rich block editing as Knowledge blocks** (production: DS `Block` + `BodyEditor` / TipTap). The story renders this concretely in two states at once:

- **The open "+" Insert menu** — attached above the input row, listing **Insert block** (the key, accent-highlighted affordance) plus Attach file · Mention · Reference item, each labeled with a hint. `/` slash-commands are reserved (not shown as a tool).
- **A draft that already contains an inserted, rich-edited Block** — a code Block sitting in the composer draft above the text line, with a **block handle** (drag/reorder + block actions, mirrors DS `BlockHandle`), a **kind chip** (`Code · ts`, changeable inline), a remove ✕, and the **same code render** as a Knowledge code block. The label "inserted block — edits like a knowledge block" makes the mechanic explicit.

**Composer toolbar fix (round-2: "this icon seems broken" / "what does this icon do?"):** every tool is a legible, single-purpose icon with an `aria-label` + `title` tooltip. The bottom strip set: **Attach** (paperclip) · **Insert block** (blocks/stack glyph) · **@ Mention** (at) · **Format** (a clean `Aa` mark → bold/italic/code) · **Emoji** (face). No mystery/broken glyphs. The broken bold-`d` path was replaced with a proper `Aa` format mark.

**Resting composer anatomy** (top→bottom): reply banner → inserted-block / attachment draft area → open Insert menu (when "+" active) → input row `[ + Insert | textarea | Send ]` → formatting strip + "Enter to send · Shift+Enter for newline".

### Reply-to-a-specific-message (round-2: "I cannot tell to which message I am replying")
- The composer **reply banner** references the specific message, not just the person: "Replying to **Atlas**" + a **Slack-style quoted snippet** of that message ("Added WebAuthn registration and the dual-auth window. Existing password sessions stay valid…").
- One message in the thread renders **as a reply**: the founder's 9:14 message carries a quoted **`ReplyReference`** above its body (↩ **Atlas** · "How long should the password fallback stay enabled?") so a reader sees what the reply refers to — answering both the writer's and the reader's need.

### Questionnaire / quick-answer agent message (the AM1-relevant agent message type; review = AL)
Added an **agent questionnaire message** (Atlas 9:13): a scoped "QUICK ASK" question with **constrained answer options rendered as inline answer chips** the human picks ("Keep through phase 2" recommended/accent · "Drop now" · "Decide later"). Calm, teammate-style — a quick ask, not a heavy form. Drawn from AI-chat quick-replies + Slack. Message types covered in the fixture: **plain · questionnaire · review (hook) · verdict** (echo).

### Density + agent-vs-human legibility (round-2: more space; "certain people will want to know" who is an agent)
- **Inter-group rhythm bumped to 18px** (from 6px) — more breathing room between message groups; calmer vertical rhythm, not crammed.
- **Agent vs human reads at a glance without reading the name:** agent groups carry a **left accent rule (2.5px) + a faint 4% accent tint** behind the whole group, plus the existing green-tinted avatar + "AGENT" pill (now with a check glyph). **Humans are plain.** The **own ("You")** group keeps a subtle 3% warm tint + the "You" label (color-independent).

### Header avatars (round-2: "these weirdly overlap")
Participants render as a clean overlapping **`ParticipantGroup`** (production: DS `AvatarGroup`): consistent 2px `--surface-page` ring, even -9px overlap, descending `z-index` so each reads cleanly; the agent avatar's green ring distinguishes it. Followed by the participant count and the ⋯ actions. No broken overlap.

### Per-message hover controls (round-2: founder liked them, "not too big")
Kept as-is: the React · Reply · ⋯ hover toolbar, compact (26px targets), anchored top-right of each group; shown live on the Atlas review group and `group-hover/msg:flex` on the rest.

---

### v3.1 anatomy note (superseded for the diff pane)

What remains is the conversation itself: header (thread identity) · author-grouped messages · composer. The **on-demand right context pane referenced below is removed in v3.3** — artifact review is track AL.

---

## User workpackage

A founder (A. Founder) opens the **Passkey login** conversation. A teammate (Mara) has flagged a constraint; the agent (Atlas) has done the work, summarized it deliberately, embedded the reviewable change set, cited its sources, attached a diagram, referenced the work session, and asked for a verdict. The founder reads the grouped exchange, opens the change set in the right pane, and approves. **Decision being made:** is this change set safe to ship to staging? The surface surfaces that decision (a single verdict on the change set) and never makes the founder do agent work (read the raw work-log inline).

---

## Anatomy — the conversation (+ on-demand pane)

The surface IS the open conversation. It fills the app main pane (to the right of the app sidebar, which this design does NOT render). One flex column: header · scrolling message list · pinned composer. The diff pane opens to the right on demand.

| Region | Width | Role |
|---|---|---|
| **Conversation header** | full pane | Carries thread identity so "what is this conversation" is clear without a sidebar: host chip **"Bet · Passkey login"** + title + 3 participant avatars (A. Founder, Mara, Atlas) + quiet actions ⋯. Header content is centered to the reading column. `--surface-page`. |
| **Message list** | reading column ~740px, centered | Primary. Author-grouped messages (avatar + name + time at group heads; human vs agent distinct; own-message cue for A. Founder), @mentions, a reaction, the work-Fold, the CHANGE SET embed (opens → + citation sources), referenced-item embed, attachment chip, review → verdict. Own scroll (`minHeight:0; overflowY:auto`). `--surface-page`. |
| **Composer** | reading column ~740px, centered | Bottom-pinned. Reply banner · attachment chip · `+` · textarea · Send · formatting strip · Enter hint. `shrink-0` so it never scrolls away. |
| **Change-set / diff pane** | 420px | **DEFAULT CLOSED.** Opens on demand when a change-set Embed is clicked (push/overlay): header (`auth/passkey.ts` +124/−18 + close), tab strip (Diff / Files / Session), syntax-gutter diff body. The story renders the default state: pane closed; the CHANGE SET embed keeps its "opens →" affordance. `--surface-container`. |

**Thread navigation (between conversations) is the app sidebar (`SidebarV2`, AD9) — out of this design's scope.** The earlier inbox / thread-list left pane was that sidebar and is removed.

---

## Information hierarchy (numbered)

1. **The pending decision** — the Review part ("needs your decision") + verdict buttons is the heaviest unit (the only bordered+shadowed card in the stream). It is where the eye lands.
2. **The change set under review** — the diff embed inside the review, mirrored open in the right pane (accent border ties embed ↔ destination).
3. **Author groups** — avatar + name + time at each group head; the structural rhythm of the column.
4. **Agent summary content** — prose + work-Fold + embeds + citations, calm and foldable.
5. **Conversation framing** — header host chip ("Bet · Passkey login") + participants.
6. **Composer chrome** — present and complete, but visually quiet until focused (shadow lifts on `focus-within`).

(Navigation between conversations is owned by the app shell, out of this design's scope.)

---

## How each annotated gap is addressed (maps to brief-v3 §"annotated gaps")

| # | Founder annotation | Fix in this design |
|---|---|---|
| 1 | "who wrote what / me vs them / multiple users" | Single column, NO bubbles. Identity (avatar + name + time) at each **author-group head**. 3 participants (A. Founder, Mara, Atlas). Human vs agent: agents get the green-tinted avatar + an "Agent" pill at the head. **Own-message cue:** A. Founder's groups carry a faint 3% accent tint + a quiet "You" label. Mara proves a second human reads distinctly from "me." |
| 2 | "spacing / grouping / structure / layering — everything; blobs; memory game" | Author-**grouping** is the structural unit (not per-line styling, not disconnected blobs). Consecutive same-author messages collapse under one head (Atlas 9:11→9:12 group). Consistent 6px intra-group / 6px inter-group rhythm on the Hearth grid; generous group padding (12px/9px). One alignment grid (avatar gutter + 740px reading column). No box-per-message. |
| 3 | "what's a thread vs a conversation; where would I jump in; why TASK floating alone" | Header shows host as a labeled chip **"Bet · Passkey login"** with the full participant set — the conversation IS the thread attached to one host, made legible. No cryptic bare "TASK" label. ("Where do I jump in" — the conversation-list navigation — is the app shell's job, out of this design's scope.) |
| 4 | "composer is a stub — no send/attach/format/tools; not centered" | Full composer anatomy: optional **banner** (Replying to Atlas ✕), **attachment-chip row** (auth-flow.png 82 KB, removable), input row `[ + | textarea "Message Atlas, Mara…" | Send ]`, a **formatting strip** (bold/italic/code/link · @mention · attach) + an Enter/Shift+Enter hint, real **Send** button (accent). Centered in a 740px column matching the message column. **No** model/effort/mode pills (those are AM3 dial-in). |
| 5 | "embeds — if I open this, where do I end up?" | Every embed names its kind ("Change set" / "Referenced item" / "Session") and has a defined destination (table below). The **diff embed opens the right contextual pane** — shown OPEN, with an accent border on both the embed and the pane header tying source↔destination. Citations are source chips; the attachment is a file chip; the session reference opens the AM3 dial-in (never inlines the work-log). |
| 6 | "message actions" | Hover toolbar (React · Reply · ⋯) anchored top-right of each group; shown live on the Atlas review group (`hovered`) so the founder sees it, and `group-hover/msg:flex` on the rest. Reactions render as a pill stack under Mara's message. |
| 7 | "show it in the real app container" | The surface is the conversation pane + contextual right pane, framed inside the app window — not a floating column. (The app-shell sidebar that wraps it is out of this design's scope; see Scope note.) |

---

## Component composition (production reuse mapping)

Most chrome (header, message groups, composer) is hand-rolled here for guaranteed standalone render in the viewer; the builder maps each slot to the catalogued component. **The block / artifact embeds, however, render through the REAL design-system components in this story (AM1 round-5):**

- **Change-set / artifact embed → the real `ArtifactEmbed`** (`@hyperidle/design-system`), fed a **code-kind `Artifact`** fixture (`kind:"code"`; `preview:{kind:"code", file, hunks:[{header, lines:[{kind:"add"|"del"|"ctx", text}]}]}`; `cost:{money:{minor,currency}, tokens:{byTier}}`; ISO `createdAt`). `ArtifactEmbed` is chrome-less (kind badge · label · task · cost · time · `→` + `summarizePreview` line), so the **message owns the host card** (`--surface-elevated` / `--border-subtle` / `--r-subtle`). `onOpen` is the hook into AL's right slider.
- **Inserted code block + referenced knowledge item → the real `Block`** (`@hyperidle/design-system`), fed real `BlockPayload`s: code = `{kind:"code", lang:"ts", text}`; referenced item = a `heading` (level 3) + a `paragraph` payload. `BlockId`s are built with the real `blockId()` derivation helper from `@hyperidle/shared`. Each `Block` sits in a compact host card with an **"Open →"** affordance (opens the full block in AL's right page) and a `max-h` clamp for a tight inline preview — the body is the actual `Block` render, not a facsimile.
- **The full preview** (the bigger right-page view) is `ArtifactPreview`, which lives in **AL's right slider** — not rendered inline here.

The builder maps the remaining hand-rolled slots to the catalogued component:

| Hand-rolled slot | Production component | Notes |
|---|---|---|
| Avatar / participant group | `Avatar` + `AvatarGroup` (DS) | Drop-in; agent tint already in `Avatar agent`. |
| Conversation header | `PageHeader` + `Tag` (host chip) + `AvatarGroup` | `PageHeader` subtitle already renders `Tag + host link` (see `Conversations.tsx`). Add the participant `AvatarGroup` to `actions`. |
| Message group head + body | `ThreadShell` + `CommentRow` | `computeSenderGrouping` (already exported from `ThreadShell`) drives author-grouping. `CommentRow` renders identity + body; needs the **own-message cue**, **Agent pill**, and **hover toolbar** added (new, but reused across every conversation → in-budget). |
| Prose / mention | `CommentRow` + `MentionRef` segment render | `segmentMentions` already exists (per `thread.ts` AE5 lore). |
| Reactions | **New `ReactionBar`** | Needs Message-schema work (out of AM1 render scope per inventory §9); render-only here. Used on every message → in-budget. |
| Fold (work summary) | **New `Fold`** device | The concept's load-bearing calm device; reused in conversation + session view (AM3). |
| Change-set / artifact embed | **real `ArtifactEmbed`** (already rendered here) | Round-5: rendered through the actual `ArtifactEmbed` with a code-kind `Artifact` fixture, wrapped in the message's host card. `onOpen` → AL's right slider; full view there = `ArtifactPreview`. |
| Referenced item embed | **real `Block`** (heading + paragraph) in a host card | Round-5: the body IS the actual `Block` render (real `BlockPayload` + `blockId()`); host card adds "Open →" into AL's right page. |
| Session embed | **new `SessionRefEmbed`** | Session has no DS component yet; still hand-rolled (one-line dial-in reference, opens AM3). |
| Citation chips | **New `CitationChips`** | Source/provenance row. Reused wherever an agent cites (conversation + knowledge) → in-budget. |
| Attachment chip | **New `AttachmentChip`** | File/image attachment. Reused in composer + message → in-budget. |
| Review message (compact hook) | `RichMessageCard` (compact) + `Button` | v3.3: AM1 renders only the **compact review hook** — title + change-set Embed + a single "Open review →" button. The **verdict bar + artifact/diff view are track AL's** — do NOT build them here. |
| Questionnaire (quick ask) | **New `QuickAskPart`** (answer chips) | Agent message type: scoped question + constrained inline answer chips (recommended chip accented). Reused wherever an agent asks a quick scoped question → in-budget. |
| Verdict echo | `CommentRow` verdict terminator | Existing. |
| Inserted-block draft (preview) | **real `Block`** (code payload) in a host card | Round-5: the composer's inserted block renders through the actual `Block` (real `{kind:"code", lang:"ts", text}` payload), wrapped in a compact host card with a kind marker + **"Open →"** + remove ✕, and a `max-h` clamp for a tight inline preview. NOT the inline rich editor — "Open →" opens the full block + `BodyEditor` (TipTap) in the right slider (track AL). |
| Insert menu (popover) | DS `Menu` / `Popover` | v3.4: a **floating popover** anchored above the "+ Insert" button — overlays, never grows the composer. Compact items (Block · Attach file · Mention · Reference item). Map to the DS menu/popover primitive; do not render it in the composer's flow. |
| Composer | `Composer` (DS) | Extend with a slim reply banner (reply + quoted snippet) + inserted-block-preview / attachment draft area + the **floating "+" Insert popover** (overlay, not in flow) + formatting strip. The DS `Composer` is the single owner — do not hand-roll a second one. |
| ~~Right contextual pane~~ | **Track AL** | REMOVED from this design (v3.3). Artifact review / the right slider is owned by track AL. The change-set Embed is only a hook into it. |

**New components introduced:** `ReactionBar`, `Fold`, `SessionRefEmbed`, `CitationChips`, `AttachmentChip`, `ContextPane`. Each is reused in 2+ contexts or is a concept primitive (Fold, the Embed satellite) — within the component budget. No new tokens. **Thread navigation (the conversation/thread list) is NOT in this design** — it is the app sidebar (`SidebarV2`, AD9), owned by the app shell.

---

## Embed open-destinations table

| Embed kind | Renders | Opens (destination) |
|---|---|---|
| Change set (diff) | `auth/passkey.ts` +124/−18 | **Track AL's review experience** (right slider) — a HOOK only; "Open →". AM1 does not render the diff/pane. |
| Referenced item (block) | Plan §2 title + snippet | The referenced item in place (Knowledge / host surface). |
| Session reference | Atlas · Opus 4.8 · 1m 12s · 14 tool calls | **AM3 session dial-in** (lower-level). NEVER an inlined work-log. |
| Citation / source chip | Numbered source label | The source (external URL or internal doc). |
| Attachment (file/image) | File chip + size | Preview / download. |
| @mention | Inline accent chip | The mentioned identity (profile / agent). |

---

## Behavior

- **Hover:** message group reveals the React · Reply · ⋯ toolbar (top-right). Embed reveals its open-arrow at full opacity. Demo renders the toolbar live on the review group.
- **Focus:** composer card lifts shadow on `focus-within`; verdict + tool buttons have `focus-visible` accent outline.
- **Keyboard (production target):** composer Enter sends · Shift+Enter newline · ⌘/Ctrl+Enter always-send · ↑ edits last; `@` opens mention autocomplete, `/` opens command menu, `:` opens emoji typeahead. Right pane closes on Escape.
- **Composer:** disabled-when-empty Send; attachment via `+`, drag-drop, paste; formatting strip toggles markdown.
- **Fold:** collapsed by default showing the one-line summary ("Worked for 1m 12s"); expands to the summary detail with a left rule. UI-local state, never persisted (concept hard rule 2).
- **Right pane:** open state driven by the active embed; the source embed and the pane header share an accent border so the source↔destination link is visible.

---

## Mobile adaptation (conversation → tab; right pane → sheet)

Per `docs/information-architecture/` (mobile = three tabs). This design owns only the conversation tab and its contextual pane; the conversation-list tab is the app shell's:

- **The conversation:** the conversation pane fills the screen. Header collapses host chip + participants into one line. The composer stays bottom-pinned (formatting strip behind the `+`/`Aa` to save height; ≥16px input font per AQ-005; ≥44px touch targets per AQ-015).
- **Right pane → sheet:** opening an embed pushes the contextual pane as a full-screen route (or a bottom sheet for short content), not a side-by-side column. Back returns to the conversation.
- Author-grouping, identity, own-message cue, verdict, and embeds are unchanged — the reading column already is the mobile column.

---

## Trade-offs

- **Thread navigation excluded — the conversation IS the surface:** the inbox / thread-list (navigating between threads) is the app sidebar (`SidebarV2`, AD9), app-shell chrome that lives elsewhere. The v3.1 left pane was that sidebar; v3.2 removes it so the design is just the open conversation. Cost: this story does not show the "where do I jump in" navigation — correct, the app shell owns it; here the conversation header carries thread identity instead. Benefit: the conversation reading column + contextual pane get the full main-pane width and are judged as the focused surface they are in production.
- **Hand-rolled chrome vs importing `Composer`/DS components:** chose hand-rolled for a guaranteed standalone render in the viewer (no router/AppShell context). Cost: the spec must carry the reuse mapping (above) so the builder doesn't ship the hand-rolled copies. Benefit: the founder reviews the real composition without infra risk.
- **Change-set / diff pane DEFAULT CLOSED:** v3 shipped it open, which crowded the surface. It now defaults closed and opens on demand when the CHANGE SET embed is clicked (push/overlay), with the source↔destination accent tie shown on open. Cost: the story no longer shows the open diff state by default — acceptable, the embed's "opens →" affordance plus the open-destinations table carry the relationship.
- **Reactions/attachments rendered though schema-absent:** per inventory §9 these need Message-schema growth beyond AM1's render scope. Shown here as the design target (spec scenarios may name surfaces not yet reachable — [[memory]]); the builder gates them behind the schema work, not this story.
- **Own-message cue = faint tint, not a bubble:** keeps the no-bubbles Slack model (annotation 1) while still answering "what's mine." Risk: 3% tint is subtle in light mode; paired with the "You" label so it never relies on color alone.
- **Density:** 12px/9px group padding, 6px rhythm — denser than v2's barren wall, calmer than per-message cards. The single bordered card (the review) earns its weight as the one decision.

---

## Render risk (could not verify — viewer not run)

- `color-mix(in oklab, var(--accent-primary) 3%, transparent)` own-message tint may read as near-invisible in light mode; the "You" label is the non-color fallback. Builder should confirm in the `:8100` viewer and bump to 4% if needed (4% is the established sidebar-hover value).
- Inline `✕` close glyphs are text, not icons — acceptable for a design embodiment; production uses an icon button.
- The hand-rolled icon `d` paths (bold/italic/code/link/at) are approximations for render; production reuses real DS/Heroicon glyphs.
