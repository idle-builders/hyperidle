# AM3 — Session view: APPROVED design (locked direction)

**Founder decision (2026-06-22):** Variant 1 — **"Calm Transcript"** — chosen. Reason: *"I prefer this calm aspect with the various tool calls closed and combined in an expander."* Variants 2 (Glanceable Activity) and 3 (Activity Timeline) are dropped (story files + plan folders deleted). This is the single source of truth for `/architecture`; supersedes `brief.md` / `comparison.md` / `synthesis.md` / `1-calm-transcript/spec.md` where they conflict.

- **Approved story `title:`** `Session View · Calm Transcript`
- **Viewer link:** `http://localhost:8098/#Session%20View%20%C2%B7%20Calm%20Transcript`
- **Files:** `packages/web/src/components/SessionContentTranscript.stories.tsx` (export `CalmTranscript`) + `packages/web/src/components/sessionContentFixtures.tsx` (shared atoms + fixture). Screenshot: `plans/AM3/design/1-calm-transcript/screenshot.png`.
- **DESIGN-CLASS:** `novel` (two new Part render kinds + a re-modeled surface). In an autonomous run a novel design parks for the founder — this revision IS that founder pass; the annotations below are applied.

**ROUND-2 annotations applied (founder review, 2026-06-22):**
1. **Avatar** — the human row AND the agent turn header now carry the conversation's ROUND, human/agent-TINTED Avatar (not a plain initial), byte-identical to `ConversationSurface`'s `Avatar`.
2. **Message background** — *superseded by round-5 (see below): the human message DOES get a calm background box; the agent stays plain.*
3. **Aggregation rule** — *superseded by round-5 (see below): ALL completed tool calls fold incl. failed; only the running tool is standalone.*
4. **Cost → header** — the inline `CostTick` is removed from the stream; the **combined session-total** cost + tokens now reads in the **header** beside the avatars (`SessionCostTotal`).
5. **Composer container** — the session composer uses the conversation composer's EXACT container treatment (same border/bg/shadow/radius + outer `px-[18px] pb-[18px] pt-[9px]`, no top border), verified side-by-side against `ConversationSurface` in the `:8098` viewer.

**ROUND-5 annotations applied (founder review, 2026-06-22):**
1. **Human message BACKGROUND BOX.** The human message body now sits in a calm background box — `bg-[var(--surface-container)] rounded-[var(--r-default)] px-[12px] py-[9px]`, still LEFT-aligned, still under the round tinted avatar + name · "You" · time header ("the message box of the human is missing the background like it has in the conversation"). NOT a heavy colored chat bubble. The **agent** turn stays PLAIN full-width — the asymmetry (human = boxed, agent = plain) is intentional, matching the references. This REVERSES the round-2 "no background for either" instruction (which was an orchestrator mis-instruction). The queued human row gets the same (muted) box. **Cross-cutting follow-up (NOT done here, AM3 scope only): the AM1 conversation currently renders human messages PLAIN (no box); for true parity the conversation should adopt the same human-message box. Flag for when the conversation surface is next touched.**
2. **Aggregation — ALL completed tools fold, incl. failed.** SIMPLIFIED rule (replaces the round-4 "failures stay standalone" exception): within an agent turn, ALL COMPLETED tool calls fold into the turn's aggregate expander — including failed ones. The aggregate header SIGNALS failures when present ("Edited 2 files, ran 2 commands · 1 failed" + a small ✗/`--status-error` marker); on expand the failed step shows its ✗ + stderr. The ONLY tool that renders STANDALONE is the currently-RUNNING one (live/streaming — the running sub-agent); once it completes it folds too. Diffs remain reachable via the per-turn Changed-files panel. The failed `npm test` now folds into the adjacent fix-aggregate (which reads "· 1 failed"); the only standalone tool row in the whole stream is the running sub-agent (●).

**ROUND-4 polish applied (founder review, 2026-06-22):**
1. **`BareToolRow` — no completed tool stands alone.** Per the locked aggregation rule, EVERY consecutive completed tool call folds into the aggregate expander, collapsed at rest — including the completed FIX-run (edit · run-command · edit). The aggregate is no longer auto-expanded; collapsing it stops its trailing completed Edit row from visually hugging the standalone failed test below it (which read as a "stray completed run command"). The ONLY standalone tool rows left in the whole stream are now the **failed `npm test` (✗)** and the **running sub-agent (●)** — verified in the `:8098` viewer.
2. **`SessionCostTotal` — plain "$", no glyph.** The custom dollar SVG (which read as a "weird" icon) is REMOVED. The design system ships no currency icon, and the product's canonical cost renderer (`ArtifactCostChip` + `shared/formatMoney`) carries NO icon — it prints a plain `Intl` "$" prefix. So the header cost reads as plain text: **`$0.71 · 48.2k tokens`** (mono, tabular-nums, middot separator). The "$" is the glyph.
3. **`ScrollToBottomPill` — repositioned above the composer.** The pill no longer floats buried mid-stream. It is now anchored centered at the bottom edge of the reading area, **floating just above the composer/chat box** (`absolute inset-x-0 bottom-[12px]` over the `overflow-hidden` reading container), shown when the stream is far from the bottom; auto-pin while streaming. Same small reusable `ScrollToBottomPill` atom — just relocated. **Cross-cutting follow-up (NOT done here, AM3 scope only): this "scroll-to-bottom, centered just above the chat box, shown when far from the bottom" affordance should become a SHARED pattern that the AM1 conversation surface adopts too.** Lift `ScrollToBottomPill` + its placement into a shared component when the conversation surface is next touched; do not fork a second pill.

---

## 1. The rendering language (the calm transcript)

A streaming, append-only human+agent conversation read inside the `ConversationSurface` shape: **header → reading column → composer**, all in a centered `max-w-[760px]` measure. Content-first; tool activity recedes to a quiet, foldable ledger.

- **Agent prose owns the column.** Full-width markdown, a quiet streaming caret on the in-progress turn. No bubble.
- **Tool row = a bare one-liner.** `[per-kind icon] · verb · muted truncated target · (diff chip) · (open-session) · (▾ if expandable) · status glyph`. NO inline I/O at rest. Output reveals as an indented capped mono `<pre>` on click; a failure's `<pre>` carries a destructive left rule. Only `failed` uses the destructive color token.
- **Hard tool aggregation — THE AGGREGATION RULE (chosen behavior, round-5 SIMPLIFIED).** Within an agent turn, **ALL COMPLETED tool calls fold into the turn's aggregate expander — INCLUDING failed ones.** The summary verb + step count carries a **failure signal** when present ("Edited 2 files, ran 2 commands · 1 failed" + a small ✗/`--status-error` marker), so breakage stays glanceable without a standalone row; on expand the failed step shows its ✗ + stderr beneath a left rule. **The ONLY tool that renders STANDALONE is the currently-RUNNING one** (live/streaming — the running sub-agent); once it completes it folds in too. **Diffs are never lost:** the per-turn **Changed files (N)** panel always surfaces the turn's file changes regardless of folding. `aggregateAt = 2` (calm bias). *This reverses the round-4 "failures stay standalone" exception — the founder rejected a completed/failed tool sitting standalone next to an aggregate ("this command should be included in the above expander"). The simplified rule: fold everything completed (failures included), signal failures on the aggregate header, keep only the in-flight running tool standalone, never lose a diff.* Every aggregate is collapsed at rest; a click expands it to the bare rows beneath a left rule.
- **Reasoning** folds to "Thought for Ns" (italic, tertiary), re-expands to muted prose under a left rule. (`reasoning` Part kind.)
- **File diff** stays as its own row (never folded into an aggregate) with an inline `name +N/−M` chip; a per-turn/session **Changed files (N)** panel sits below the stream with "View diff" → `ReviewCodeDiff`.
- **Tool icon family.** Typed icons for the common tools (view/read, search, edit, run command, web-search, create) + ONE shared generic icon for all MCP calls. *(Founder: "smart idea to have typical ones predefined with a specific icon, and all the various MCPs get a shared icon.")* Keep this.

---

## 2. Reuse-from-conversation contract (the dominant theme of the review)

The session view is the conversation's components + the session-specific render kinds. **Reinvent as little as possible.** Architecture must wire these to the REAL conversation components, not the design-time copies in the fixture (which exist only so the story renders stand-alone in the viewer).

| Session element | REUSES (production target) | Source |
|---|---|---|
| Surface shape (header · column · composer, `max-w-[760px]`) | `ConversationSurface` | `packages/web/src/components/ConversationSurface.tsx` |
| Message column renderer | `PartList` over `derivePartsFromSession(...)` | `packages/web/src/components/PartList.tsx` |
| **Human message row** | A **left-aligned** author-grouped row (round tinted avatar + name · "You" · time) whose body sits in a calm **background box** (`bg-[var(--surface-container)] rounded-[var(--r-default)] px-[12px] py-[9px]`, round-5) — NOT a right-aligned bubble, NOT a heavy colored chat bubble. The agent turn stays PLAIN full-width. *Follow-up: AM1 conversation should adopt the same box for parity (AM3 scope only).* | `PartList` group + `parts/ProsePart.tsx` + the conversation's calm `--surface-container` surface |
| **Avatars / participant group** | `ConversationSurface` `Avatar` (ROUND, human/agent-TINTED) + `ParticipantGroup` — on the header AND on the human row AND the agent turn header | `ConversationSurface.tsx` |
| Turn header (name · time) | `PartList` group header (`clockTime`, `groupParts`) | `PartList.tsx` |
| **Composer chrome + "+" attach affordance + EXACT container** | The `ConversationSurface` composer — its EXACT container (`rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] focus-within:shadow-[var(--shadow-default)]`, outer `px-[18px] pb-[18px] pt-[9px]`, no top border) · the SAME "+" attach button look · paper-plane send | `ConversationSurface.tsx` `Composer`/`ComposerInputRow` |
| Reference / artifact chips | `ReferenceChip` / `ArtifactEmbed` (DS) | design-system |
| File diff | `ReviewCodeDiff` (one diff renderer in the product) | `packages/web/src/pages/review/ReviewCodeDiff.tsx` |

**ADDS (session-specific, the only net-new render work):**
- `tool` + `reasoning` Part render kinds (extend the closed `PartKind` union + the `PartList` exhaustive dispatch; `assertNeverPart` + `unknown` fallback preserved).
- The folded **tool aggregation** (a renderer grouping beside `groupParts`, NOT a Part kind).
- The **descriptor pill strip** on the composer (model · effort · mode from `HarnessCapabilityDescriptor`; `select`→pill, `boolean`→toggle; never per-backend-branched).
- The **working/queue/Stop** composer state (streaming → Stop + "Working for Ns" + "queues while working"; idle → Send).
- The **sub-agent → nested session** affordance (below).
- The **changed-files panel** (per-turn/session, → `ReviewCodeDiff`).

> Design-time note: the story's `sessionContentFixtures.tsx` copies `Avatar`/`ParticipantGroup`/`HumanRow`/the composer chrome so the story renders without the app router/context. **Architecture must collapse these onto the real `ConversationSurface` components** — they are intentionally byte-for-byte the conversation's look so the merge is mechanical, not a re-style.

---

## 3. Sub-agent recursion (the enhancement)

A sub-agent `tool` call is itself a Session. Its row carries a **`session` `OpenTarget`** (`{ route: "session", sessionId }`) and an **"Open session"** affordance that **opens the sub-agent's OWN session view** — the SAME `ConversationSurface`-shaped surface, recursed, through the SAME open seam every reference uses (`packages/web/src/services/open-handler.ts` `case "session"`). The row also expands inline to a calm nested mini-stream (the sub-agent's tool rows). *(Founder: "very nice — this could yet again open a session view just of the sub agent, if that information is accessible in the same way.")* Fixture field: `ToolPart.opensSession`.

---

## 4. Removed aspects (founder review)

- **Inline permission / approval prompt — REMOVED** (concept rejection 9). HyperIdle has no per-tool allow/deny gate; the agent acts freely and the **review** is the allow point (Approve / Reject / Request Changes at review time). No "Allow this command?" card; the `permission` Part kind and `PermissionPrompt` component are gone. The model/effort/mode pills are **launch settings**, not an inline gate (the `permission` launch option was also dropped from the descriptor fixture to keep the pill row to model·effort·mode).
- **Status-metrics roll-up bar — REMOVED** (concept rejection 10). No PR # · change-count · Background · Artifacts counter strip. HyperIdle attaches no PRs to sessions. The header carries only **minimal session identity** (Session tag · host · title · avatars). Real changed-files work product still surfaces via the per-turn **Changed files** panel (aspect f) — that stays.

---

## 5. Full aspect list rendered (concept Part 7)

| # | Aspect | Rendering in the approved variant |
|---|---|---|
| a | Streaming answer text | Full-width agent prose + a quiet streaming caret on the last turn. |
| b | Reasoning | Folds to "Thought for Ns" (italic/tertiary), expands to muted prose under a left rule. |
| c | Tool calls by family | Bare one-liner rows; typed icons + one shared MCP icon; per-family expanded I/O. |
| d | Tool states | `running` pulse · `ok` ✓ · `failed` ✗ (destructive). Round-5: a failed call folds into the aggregate; the aggregate header signals it ("· 1 failed" + ✗); stderr shows on expand. |
| e | Tool aggregation | The AGGREGATION RULE (round-5): fold ALL COMPLETED calls (edits AND failed) to one summary verb + count + failure signal ("· 1 failed"); only the RUNNING tool stays standalone; diffs never lost (Changed files panel). Shown collapsed + expanded. |
| f | File diffs / changed files | Inline `+N/−M` chip on a file-change row (when standalone) + a per-turn Changed files panel → `ReviewCodeDiff` (always surfaces diffs, even when edits folded). |
| g | Cost / token — SESSION TOTAL in HEADER | Combined session-total cost + tokens in the **header** beside the avatars (mono, tabular-nums), plain `$0.71 · 48.2k tokens` — plain "$" character, NO icon (round-4 annotation 2). NOT an inline per-turn tick (round-2 annotation 4). |
| ~~h~~ | ~~Permission prompt~~ | **REMOVED** — review is the allow point. |
| i | Artifacts | `ArtifactChip` → opens its owned surface. |
| j | Sub-agent / nested session | Sub-agent row → "Open session" → nested session view (recursion). |
| k | Plan / todo | Compact foldable step list (done/active/todo), open at rest. |
| l | Human + queued message | LEFT-ALIGNED rows with the ROUND tinted Avatar; the body sits in a calm `--surface-container` background BOX (round-5) — agent stays plain full-width; queued = muted boxed row + avatar + clock + "sends when the agent finishes" + ✕. |
| m | Identity / turn boundaries | Conversation author-group header carrying the ROUND tinted Avatar + agent glyph + name · time; turn fold device available. |
| n | Working state + Stop | "Working for Ns" pulse + Stop in the composer (calm, no loud spinner). |
| o | Composer | Conversation composer chrome ("+" attach) + descriptor model·effort·mode pills + Send↔(Stop + queues). |
| ~~p~~ | ~~Status roll-ups~~ | **REMOVED** — no PR/change-count metrics bar. |
| q | Scroll-to-bottom / auto-pin | "Scroll to bottom" pill **centered, floating JUST ABOVE the composer** (anchored to the bottom of the reading area), shown when far from the bottom; auto-pin while streaming, suppressed during user expand (round-4 annotation 3). Cross-cutting follow-up: lift to a SHARED affordance the conversation surface adopts too. |

---

## 6. Hard rules carried into architecture

- One diff renderer in the product: reuse `ReviewCodeDiff`; any new per-file diff component is a concept violation.
- One message renderer: `PartList` over `derivePartsFromSession`; no parallel/second renderer.
- One composer: reuse the conversation composer chrome; do NOT invent a parallel composer.
- `PartKind` stays closed + exhaustive + `unknown`-terminated; adding `tool`/`reasoning` is the only union growth (concept-doc-gated).
- No color/token change (Hearth + AESTHETICS.md unchanged; only `failed` uses the existing destructive token).
- Parts derived-never-stored; queued message is pre-Part composer/session state, FIFO, cancellable, non-interrupting (delivers into the NEXT turn).
- No inline permission gate; no status-metrics roll-up bar.
