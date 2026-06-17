# AM1 — Conversation Experience: Design Brief v3 (FULL-SCOPE, IN-CONTAINER)

Supersedes v1/v2. The thin "calm column" was rejected. This brief is the authoritative target.

## Mandate (founder, verbatim intent)
- **Thread vs conversation is SETTLED at the architecture level — do NOT change the primitive or re-litigate the concept.** A *conversation* is a **Thread attached to one host** (bet/task/team/user/agent/…), flat, append-only, no Slack-style sub-threads. The UI's job is to make this **legible**, not to add branching. (`packages/shared/src/thread.ts`, `docs/human-interface-layer/thread-primitive.md`.)
- **We already HAVE a basic conversation. Improve it MANIFOLD** using the research — bring in everything that actually belongs in a chat.
- **Think through the ENTIRE scope** (not staged): identity/multi-user, grouping/structure/layout, the full composer, message actions, embeds/artifacts/citations, agent-work integration.
- **Embody in the REAL app container** (sidebar · main conversation · contextual right pane) — NOT a bare floating column. The founder must see it as it lives in the app.

## Ground truth to read first
- `plans/AM1/research/conversation-surface-inventory.md` — THE feature inventory (§1–§8). Every area below maps to it.
- The five dossiers in `plans/AM1/research/` for depth on any area.
- `plans/AM1/concept.md` — Part / Embed / Fold / Session-reference (UNCHANGED; this is the rendering vocabulary).
- The CURRENT baseline to improve: `packages/web/src/pages/Conversations.tsx`, `packages/design-system/src/{ThreadShell,CommentRow,RichMessageCard,Composer,ThreadRow,ThreadHostBanner}.tsx`.
- The app container: `docs/information-architecture/app-shell-always-present.md`, `docs/information-architecture/conversations-view.md`, `packages/web/src/shell/*`, `packages/web/src/layouts/*`.
- The founder's Round-1 annotations: `.annotations/annotations.md` — every gap below traces to one; address ALL.

## The annotated gaps this design MUST fix (checklist)
1. **Identity & multi-user** — "who wrote what / me vs them / multiple users." Single column (NO left/right bubbles, per Slack). Sender identity (avatar + name + time) at each author-group head; consecutive-author grouping collapses repeats; human vs agent legibly distinct; a subtle own-message cue; works with 3+ participants.
2. **Spacing / grouping / structure / layering / layout** — clear visual hierarchy and rhythm; author-groups as the structural unit (not per-line styling, not disconnected "blobs"). Calm but STRUCTURED.
3. **Thread vs conversation legibility** — a clear conversation header showing the host context (e.g. "Bet · Passkey login" with participants) so it's obvious what this conversation is and what it's attached to. No cryptic "TASK" label floating alone.
4. **The composer is a real component** (founder's loudest gap). Anatomy (inventory §7): bottom-pinned card; optional banner (replying/editing); attachment-chip row; input row `[ +  Aa | auto-sizing textarea | Send ]`; Send (Enter sends · Shift+Enter newline · disabled-when-empty); attach (button + drag-drop + paste); formatting (bold/italic/code/link/quote/list); **@mention autocomplete (people/agents/artifacts — the Embed-authoring path)**; `/` commands + "+" tools menu; emoji. **NOT here:** model/effort/mode pills (= AM3 dial-in). Properly aligned/centered in the column.
5. **Embeds with DEFINED open-destinations** — "if I open this, where do I end up?" Specify: artifact embed → opens in the **right contextual pane** (versioned); referenced block/item → opens the item; **diff/change-set** → review in right pane; **citations/sources** chips → source; **session-reference** → AM3 dial-in (lower-level, never inlined work-log). Attachments (file/image) render as chips/cards.
6. **Message actions** — hover toolbar (React · Reply · ⋯) + overflow (Copy · Copy-link · Edit/Delete for author). Show them.
7. **Real app container** — render inside the shell: left **conversation list/sidebar** (so "where do I jump in" is answered), **main conversation pane**, **right contextual pane** (artifact/diff/session). Mobile note in spec.

## Content to render (improve the canonical fixture — make it multi-user + richer)
A real, populated conversation on a host (Bet "Passkey login"), with **3 participants**: A. Founder (you), Atlas (agent), and one more human teammate (e.g. "Mara"). Exercise: a human message; a teammate message (so multi-user + me-vs-them is visible); an agent summary message with a **work-Fold** + an embedded **diff/change-set** (opens right pane); a **referenced block/item** embed; **citation/source** chips; an **attachment** (e.g. a screenshot/file chip); a **session-reference**; a **review** message → **verdict** (approve/request-changes/reject); a message with an **@mention** + a **reaction**. Show the composer in its full anatomy with an attachment chip present.

## Aesthetic bar (still Hearth-calm — but STRUCTURED, not barren)
The reference's restraint still applies (no badge-soup, calm rhythm, one alignment grid) — but v2 over-stripped into a flat wall. Now: calm AND clearly structured/grouped with real identity and a real composer. Existing tokens only; Hearth grid spacing {3,6,9,12,18,24,36,48}, radius {10,16,9999}, type {12,13,15,17,20,24}, weights {400,500,600,700}, warm only. No new tokens, no hardcoded colors, no cool grays, no `rounded-3xl`, no gradients, no emoji-as-icon. **No skeleton/loading/error states** — only the populated real conversation ([[memory]]: initial designs render only populated).

## Output
A full-page, in-container story (`Populated` only). The conversation must read as a real product surface inside the app shell, fixing every checklist item above. This is the v3 foundation the founder reviews and iterates.
