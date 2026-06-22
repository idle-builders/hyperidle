# AM3 — "Session View": APPROVED design (the single source for build)

**FOUNDER-APPROVED — 2026-06-22, 12 human-design-review rounds in the `:8098` viewer.** This is the locked, single source of truth for `/architecture` + build; supersedes `brief.md` / `comparison.md` / `synthesis.md` / `1-calm-transcript/spec.md` wherever they conflict.

- **Approved story `title:`** `Session View`
- **Viewer link:** `http://localhost:8098/#Session%20View`
- **Files:** `packages/web/src/components/SessionView.stories.tsx` (export `SessionView`) + `packages/web/src/components/sessionContentFixtures.tsx` (shared atoms + fixture).
- **DESIGN-CLASS:** `novel` (two new Part render kinds + a re-modeled surface + a shared-component message-pattern fix). The 12-round founder pass IS the human-design-review; the approved state below is what shipped from it.

---

## 0. The two reframes that produced this design

The session view is **NOT** a controls+activity panel. Two reframes happened during review:

1. **Session = streaming conversation.** The agent streams text + interleaved tool calls + reasoning; human messages QUEUE while the agent works; thinking is shown separately; file diffs reuse `ReviewCodeDiff`. The session view is a *reading* of the process-layer Session, exactly as a conversation is the reading of a thread.
2. **Conversation + session are ONE shared component** — `PartList` / `ConversationSurface`. A session is "just a slightly different FORM of conversation." The message pattern was fixed **AT THE SOURCE** in the shared `packages/web/src/components/PartList.tsx` — which also fixed the AM1 conversation (it was missing avatars + the self-box). The session differs only in CONTENT, not message layout.

---

## 1. The APPROVED unified message pattern (verbatim — lives in the shared `PartList`)

Inherited by BOTH the session and the conversation:

- **Only MY OWN messages** (`isMe`) are highlighted: **right-aligned, grey background box** (`bg-[var(--surface-container)]`, `rounded-[var(--r-default)]`), capped width (≤80%), with the **avatar+name header above the box's top-left corner**.
- **Everyone else — other people AND agents** — renders **left-aligned, plain, no background**.
- **Round avatars on every author: GREEN for agent, GREY for human** (`GroupAvatar`).
- **No agent "star" glyph** — the avatar color signals agent vs human.
- **Session reference is split from attachments** (`EmbedRow`): a `session-reference` renders on its own level, separate from artifact/diff/block/knowledge chips.
- The **queued** human message follows the same self/right-aligned pattern (it is also a human turn), muted + clock + "sends when the agent finishes" + dequeue ✕.
- This pattern is IDENTICAL in the conversation and the session — the session differs only in CONTENT (streaming text, `tool`/`reasoning` Parts, folded aggregation, descriptor composer pills, working/queue/Stop state), not message layout.

---

## 2. The rendering language (the calm session transcript)

A streaming, append-only human+agent conversation read inside the `ConversationSurface` shape: **header → reading column → composer**, centered measure. Content-first; tool activity recedes to a quiet, foldable ledger.

- **Agent prose owns the column.** Full-width markdown (left-plain), a quiet streaming caret on the in-progress turn. No bubble.
- **Tool row = a bare one-liner.** `[per-kind icon] · verb · muted truncated target · (diff chip) · (open-session) · (▾ if expandable) · status glyph`. NO inline I/O at rest. Output reveals as an indented capped mono `<pre>` on click; a failure's `<pre>` carries a destructive left rule. Only `failed` uses the destructive color token.
- **Tool aggregation — THE AGGREGATION RULE (final).** Within an agent turn, **ALL COMPLETED tool calls fold into the turn's aggregate expander — INCLUDING failed ones.** The summary verb + step count carries a **failure signal** when present ("Edited 2 files, ran 2 commands · 1 failed" + a small ✗/`--status-error` marker), so breakage stays glanceable without a standalone row; on expand the failed step shows its ✗ + stderr beneath a left rule. **The ONLY tool that renders STANDALONE is the currently-RUNNING one** (live/streaming — e.g. the running sub-agent); once it completes it folds in too. **Diffs are never lost:** the per-turn **Changed files (N)** panel always surfaces the turn's file changes regardless of folding. `aggregateAt = 2` (calm bias). Every aggregate is collapsed at rest; a click expands it to the bare rows beneath a left rule.
- **Reasoning** folds to "Thought for Ns" (italic, tertiary), re-expands to muted prose under a left rule. (`reasoning` Part kind — shown separately from answer text.)
- **File diff** reachable via the per-turn/session **Changed files (N)** panel below the stream with "View diff" → `ReviewCodeDiff` (and an inline `name +N/−M` chip on a standalone file-change row).
- **Typed tool icons.** Predefined icons for the common tools (view/read, search, edit, run-command, web-search, create) + ONE shared generic icon for ALL MCP calls. Keep this.
- **Sub-agent tool row opens its own nested session view** (same `session` `OpenTarget` — recursion; see §4).
- **Scroll-to-bottom pill** sits centered just above the composer, shown when far from the bottom; auto-pin while streaming. *(Cross-cutting follow-up: a shared affordance the conversation should also adopt — not done here.)*

---

## 3. Reuse-from-conversation contract (the dominant theme of the review)

The session view is the conversation's shared components + the session-specific render kinds. **Reinvent as little as possible.** Architecture must wire these to the REAL shared components, not the design-time copies in the fixture (which exist only so the story renders stand-alone in the viewer).

| Session element | REUSES (production target) | Source |
|---|---|---|
| Surface shape (header · column · composer) | `ConversationSurface` | `packages/web/src/components/ConversationSurface.tsx` |
| Message column renderer + **unified self/other pattern** | `PartList` over `derivePartsFromSession(...)` — the self-right / others-left pattern, fixed at the source | `packages/web/src/components/PartList.tsx` |
| **Avatars** | `GroupAvatar` — ROUND, GREEN=agent / GREY=human (no star glyph) | shared `PartList` / `ConversationSurface` |
| **Session reference** | split from attachments onto its own `EmbedRow` level | `PartList` `EmbedRow` |
| Composer chrome + "+" attach affordance | the `ConversationSurface` composer (exact container) | `ConversationSurface.tsx` `Composer` |
| Reference / artifact chips | `ReferenceChip` / `ArtifactEmbed` (DS) | design-system |
| File diff | `ReviewCodeDiff` (one diff renderer in the product) | `packages/web/src/pages/review/ReviewCodeDiff.tsx` |

**ADDS (session-specific, the only net-new render work):**
- `tool` + `reasoning` Part render kinds (extend the closed `PartKind` union + the `PartList` exhaustive dispatch; `assertNeverPart` + `unknown` fallback preserved).
- The folded **tool aggregation** (a renderer grouping beside `groupParts`, NOT a Part kind).
- The **descriptor pill strip** on the composer (model · effort · mode from `HarnessCapabilityDescriptor`; `select`→pill, `boolean`→toggle; never per-backend-branched).
- The **working/queue/Stop** composer state (streaming → Stop + "Working for Ns" + "queues while working"; idle → Send).
- The **sub-agent → nested session** affordance (§4).
- The **changed-files panel** (per-turn/session, → `ReviewCodeDiff`).

> **AM1-conversation parity:** the same shared-`PartList` change that gives the session its avatars + self-box also fixes the AM1 conversation (which was missing both). One fix, two surfaces. Builder must therefore re-bless the PartList / ConversationSurface / catalog DOM snapshots and update PartList tests (the shared component's avatar/self-box/embed structure changed).

> Design-time note: the story's `sessionContentFixtures.tsx` copies the avatar / message row / composer chrome so the story renders without the app router/context. **Architecture must collapse these onto the real shared components** — they are intentionally byte-for-byte the conversation's look so the merge is mechanical, not a re-style.

---

## 4. Sub-agent recursion (the enhancement)

A sub-agent `tool` call is itself a Session. Its row carries a **`session` `OpenTarget`** (`{ route: "session", sessionId }`) and an **"Open session"** affordance that **opens the sub-agent's OWN session view** — the SAME `ConversationSurface`-shaped surface, recursed, through the SAME open seam every reference uses (`packages/web/src/services/open-handler.ts` `case "session"`). *(Founder: "very nice — this could yet again open a session view just of the sub agent.")* Fixture field: `ToolPart.opensSession`.

---

## 5. Removed aspects (founder review)

- **Inline permission / approval prompt — REMOVED** (concept rejection 9). HyperIdle has no per-tool allow/deny gate; the agent acts freely and the **review** is the allow point (Approve / Reject / Request Changes at review time). No "Allow this command?" card; the `permission` Part kind and `PermissionPrompt` component are gone. The model/effort/mode pills are **launch settings**, not an inline gate.
- **Status-metrics roll-up bar — REMOVED** (concept rejection 10). No PR # · change-count · Background · Artifacts counter strip. HyperIdle attaches no PRs to sessions. The header carries only **minimal session identity** (Session tag · host · title · avatars) + the **session-total cost** (`$0.71 · 48.2k tokens`, plain "$", no glyph). Real changed-files work product still surfaces via the per-turn **Changed files** panel (aspect f).

---

## 6. Full aspect list rendered (concept Part 7)

| # | Aspect | Rendering in the approved Session View |
|---|---|---|
| a | Streaming answer text | Full-width agent prose (left-plain) + a quiet streaming caret on the last turn. |
| b | Reasoning | Folds to "Thought for Ns" (italic/tertiary), expands to muted prose under a left rule — shown separately from answer text. |
| c | Tool calls by family | Bare one-liner rows; typed icons + one shared MCP icon; per-family expanded I/O. |
| d | Tool states | `running` pulse · `ok` ✓ · `failed` ✗ (destructive). A failed call folds into the aggregate; the aggregate header signals it ("· 1 failed" + ✗); stderr on expand. |
| e | Tool aggregation | THE AGGREGATION RULE: fold ALL COMPLETED calls (edits AND failed) to one summary verb + count + failure signal; only the RUNNING tool stays standalone; diffs never lost (Changed files panel). |
| f | File diffs / changed files | Inline `+N/−M` chip on a standalone file-change row + a per-turn Changed files panel → `ReviewCodeDiff` (always surfaces diffs, even when edits folded). |
| g | Cost / token — SESSION TOTAL in HEADER | Combined session-total cost + tokens in the **header** beside the avatars, plain `$0.71 · 48.2k tokens` (mono, tabular-nums, plain "$" character, NO icon). NOT an inline per-turn tick. |
| ~~h~~ | ~~Permission prompt~~ | **REMOVED** — review is the allow point. |
| i | Artifacts | `ArtifactChip` → opens its owned surface. |
| j | Sub-agent / nested session | Sub-agent row → "Open session" → nested session view (recursion, §4). |
| k | Plan / todo | Compact foldable step list (done/active/todo). |
| l | Human + queued message | UNIFIED self pattern: my own (`isMe`) message RIGHT-aligned in a grey `--surface-container` box, capped ≤80%, avatar+name header above the box; other authors + agent left-plain. Queued = muted right-aligned box + clock + "sends when the agent finishes" + ✕. |
| m | Identity / turn boundaries | Conversation author-group header carrying the ROUND tinted Avatar (green=agent/grey=human) + name · time; turn fold device available. |
| n | Working state + Stop | "Working for Ns" pulse + Stop in the composer (calm, no loud spinner). |
| o | Composer | Conversation composer chrome ("+" attach) + descriptor model·effort·mode pills + Send↔(Stop + queues). |
| ~~p~~ | ~~Status roll-ups~~ | **REMOVED** — no PR/change-count metrics bar. |
| q | Scroll-to-bottom / auto-pin | "Scroll to bottom" pill centered just above the composer, shown when far from the bottom; auto-pin while streaming. Cross-cutting follow-up: lift to a SHARED affordance the conversation adopts too. |

---

## 7. Hard rules carried into architecture

- One message renderer: the shared `PartList` over `derivePartsFromSession`; the self/other pattern is fixed at the source — NO parallel/second renderer.
- One diff renderer in the product: reuse `ReviewCodeDiff`; any new per-file diff component is a concept violation.
- One composer: reuse the conversation composer chrome; do NOT invent a parallel composer.
- `PartKind` stays closed + exhaustive + `unknown`-terminated; adding `tool`/`reasoning` is the only union growth (concept-doc-gated).
- No color/token change (Hearth + AESTHETICS.md unchanged; only `failed` uses the existing destructive token).
- Parts derived-never-stored; queued message is pre-Part composer/session state, FIFO, cancellable, non-interrupting (delivers into the NEXT turn).
- No inline permission gate; no status-metrics roll-up bar.
- The shared `PartList` change is re-blessed against the catalog/PartList/ConversationSurface DOM snapshots; PartList tests updated for the new avatar/self-box/embed structure (builder, green phase). The AM1 conversation is fixed by the same change.
