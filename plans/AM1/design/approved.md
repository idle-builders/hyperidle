# AM1 Conversation Experience — Approved Design (LOCKED)

`DESIGN-CLASS: novel` (from `brief.md` — new primitive, the Part model). This design therefore proceeds to **`/human-design-review`** before any build. In an autonomous run a novel design **parks** for the founder rather than auto-shipping.

**Approved variant (story title for the viewer):** `AM1 Conversation — Calm Document (C)`
**Story file:** `packages/web/src/components/Am1ConversationCalmDocument.tsx` (+ `.stories.tsx`)
**Render:** `plans/AM1/design/calm-document/screenshot.png`

This is the input contract to `/architecture` and the variant the founder annotates at `/human-design-review`. It honors the locked concept (`plans/AM1/concept.md`) — deliberate messages only; the session is a reference Embed, never an inlined work-log; renders within Thread/Message/verdict; nothing named "Block"/"blocked"; no color/token changes.

---

## 1 — Chosen variant + pulled-in elements

**Base: C "Calm Document"** — a generous single reading column (~760px desktop) that reads like a living document: quiet 1px sender-turn rules (not boxes), 15px/1.7 body, and embeds rendered **full-bleed inline** so the founder judges the actual diff/plan/session in place. The "Worked for 1m 12s" **Fold** is a first-class calm-making device.

**Grafted from B (interaction rigor, not layout):**
- The focus contract: `aria-pressed` on toggles/open-elsewhere controls; focus returns to the triggering element on close of any opened surface; tab order follows reading order (column then any secondary surface).
- B-grade Loading skeletons: 3 sender-turn rows (avatar circle + name bar + 2 body bars), `--border-strong` fill so the shared `skeleton-pulse` (dips to opacity 0.4) stays visible at every phase.
- The chip→detail / side-surface affordance reserved **only as the overflow escape** for an oversized embed — never the default. Carries B's active-accent + `aria-pressed` for the "open elsewhere" action.

**Grafted from A (reuse-first discipline):**
- `plain` and `verdict` Parts map straight onto `CommentRow` — add nothing.
- NEW renderers held to the minimum: `DiffEmbedPart` + `BlockEmbedPart` + standalone `Fold` + `SessionReferenceEmbed`.

## 2 — Rejection list (locked; do not re-litigate)

- B as the base (terse index ≠ calm column; panel not AM3-reusable).
- The two-pane / side-panel as the default embed-open strategy (desktop-only second region, most state, worst mobile, conversation-specific). Side-surface allowed only as overflow escape.
- A's compact-chips-as-ceiling (under-delivers "embed beautifully"). Compact = overflow fallback, not default.
- C's old mid-thread composer (now a single bottom-pinned composer outside/after the Part stack) and C's old faint loading skeleton (now B-grade 3-row sender-turn skeletons).
- Any session work-log / activity stream rendered as first-class conversation Parts (concept hard-rule #3).

## 3 — Component mapping (DS components + new Part renderers)

| Part / slot | Component | Props / notes |
|---|---|---|
| Part-model wrapper | **NEW** `Part[]` renderer | Source-agnostic single calm column; exhaustive discriminant dispatch + `unknown` fallback; derived from `Message[]`, never stored. The WP's primitive; AM3 reuses it for session events. No existing component is a source-agnostic Part stack. |
| Host banner | `ThreadHostBanner` | host kind + title ("Bet · Passkey login"). |
| Plain Part | `CommentRow` | sender-grouped, `showSenderHeader` once per group, mention/redaction-aware. Reuse — no new shape (A discipline). |
| Verdict Part | `CommentRow` verdict rendering | `verdictDecisionLabel` / `verdictDecisionToStatus` from `shared/thread.ts`. Reuse. |
| Review Part + verdict bar | `RichMessageCard` | `state.phase` idle/saving/error; `resolved` echo; foldable reasoning; `artifactSlot` hosts the inline diff. Reuse verbatim. |
| Avatar / role tint | `Avatar` (`isAgent` → accent tint), `AvatarGroup` | |
| Kind / status chips | `Tag` + `TAG_KIND_ICONS`, `StatusChip` | uppercase labels carry `--tracking-caps-sm` (AQ-007). |
| Cost / tool meta | `KeyValue` | `tabular-nums` (AQ-006). |
| Composer | `Composer` | textarea + send, ⌘↵; NO model/effort pills (those are AM3 dial-in). **Sticky bottom**, single instance, outside the Part stack. |
| Empty / Loading / Error | `EmptyState` / `SkeletonList` / `ErrorState` | |
| **`DiffEmbedPart`** | **NEW** wraps `ArtifactEmbed` + `ArtifactPreview` + `kinds/code-renderer` (`text_diff`) | Extension impossible: existing embed is sized for a compact card; C needs an in-column document block with its own fold state, line numbers, +/− tinting. Full-bleed, foldable. |
| **`BlockEmbedPart`** | **NEW** wraps `BlockRefEmbed` → `Block` + `renderPayload` | Extension impossible: no existing component renders a referenced block at document scale in-column (quote-rule, §-scoped content) — only as a compact chip. |
| **`Fold`** (standalone) | **NEW (small)** generalizes `RichMessageCard`'s reasoning fold | Usable on any Part (work-fold, diff, reasoning). UI-local view state, never persisted. |
| **`SessionReferenceEmbed`** | **NEW (small)** composes `Avatar` + `KeyValue` + `Button` | A calm reference card (avatar · model · cost · tool-call count · "Open session →") routing to AM3. NEW because no component points at a Session without inlining activity — non-inlining is concept hard-rule #3. |

New shapes: 4 (`DiffEmbedPart`, `BlockEmbedPart`, `Fold`, `SessionReferenceEmbed`) + the Part wrapper. Each justified above against "could an existing component do this compact?"

## 4 — All states (with copy)

- **Empty** — `EmptyState`, centered in the column. Title "No messages yet"; body "Start a deliberate message to Atlas — embed a diff, a plan, or a session it should work from."
- **Loading** — `SkeletonList`: 3 sender-turn skeleton rows (avatar circle + name bar + 2 body bars), `--border-strong` fill, `skeleton-pulse`. Honors `prefers-reduced-motion`.
- **Error** — `ErrorState`, centered. Title "Couldn't load this conversation"; body "The thread failed to load. Check your connection and try again."; `Button` "Retry".
- **Populated** — the canonical fixture: host banner → founder ask (plain) → Atlas work-Fold ("Worked for 1m 12s · 14 steps") → Atlas plain + full-bleed diff embed (`auth/passkey.ts · text_diff · +124 −18`) → Atlas plain + full-bleed referenced-block embed ("Auth migration plan · §2 Dual-auth window") → Atlas plain + session-reference card ("Session · Atlas · Opus 4.8 · $0.42 · 14 tool calls · Open session →") → Atlas review ("Approve deploy of passkey login to staging", foldable reasoning, inline diff, verdict bar Approve / Request changes / Reject) → founder verdict ("APPROVED · deploy of passkey login to staging") → bottom-pinned composer.
- **Overflow** — long agent reasoning and completed work collapse via `Fold` to one-line summaries; embeds never become a wall (the diff folds; the block shows §-scoped content). When a full-bleed embed exceeds its height budget, the Fold "expand" may route to the B-style detail/side-surface escape (overflow only). Many turns scroll the column; the composer stays sticky.

## 5 — Behavior + motion + keyboard/focus

- **Motion (named tokens only, AQ-013):** fold chevron rotates 0→90° and the panel expands over `--motion-default` with `--motion-ease`; hover affordances (session card, fold headers, embed borders) use `--motion-fast`. `--motion-slow` is unused here. Animate `transform`/`opacity` only (AQ-014); honor `prefers-reduced-motion` (durations collapse to ~1ms via tokens; skeleton animation → none).
- **Hover:** session-reference card and fold headers get a subtle `--surface-container` hover; embed borders raise `subtle → default`; body rows reveal a timestamp/anchor affordance.
- **Focus:** every fold toggle, embed header, verdict button, and the composer is a real focusable control. `aria-expanded` on folds; `aria-pressed` on any open-elsewhere toggle (B graft). Visible focus ring from the token system. On close of any opened side/detail surface, focus returns to the triggering control.
- **Keyboard:** Tab order follows reading order top→bottom; Enter/Space toggles a focused fold; ⌘↵ sends from the composer.

## 6 — Mobile adaptation (3-tab layout)

The Conversations tab hosts a single full-width column. The 760px cap is desktop-only — on mobile max-width drops to 100% with `--space-4` (12px) side padding. Embeds stay full-bleed (already full-width). The work-Fold and diff default **collapsed** on mobile to keep the column short. The composer is sticky at the bottom above the tab bar; composer textarea uses ≥16px font at ≤768px (AQ-005). Sender lead-ins wrap the timestamp under the name when width is tight. The overflow side-surface escape, if used, promotes to a full-screen sheet (B's mobile contract) with focus restored to the trigger on dismiss.

## 7 — Open questions for the architect

These are carried forward from the critique's coverage notes — the architecture must resolve them; the embodiment did not (and need not) cover them.

a. **Exhaustive Part dispatch.** The Part renderer must dispatch exhaustively over `plain | review | questionnaire | verdict` with an `unknown` fallback Part (mirrors Block's `unknown` kind). The canonical fixture renders no **questionnaire** message — the embodiment omits it — so architecture must specify the `questionnaire` Part rendering even though no variant embodied it. Closure is concept-mandated (Phase 4): adding a Part kind requires a concept-doc update first.

b. **AM1↔AM3 reuse contract.** The Part model is the shared structure AM3 renders session activity through — there must be **no duplicated renderer**. Architecture must define the source-agnostic boundary: a `Message` → Part and a session event (`HarnessEvent` / `CapturedToolCall`) → Part both feed the same `Part[]` renderer. Specify the adapter shape so AM3 reuses, not re-implements.

c. **Closed Embed target-kind set.** Embed targets are the closed set `artifact | block | diff | session-reference | entity-ref | mention`. Architecture must type this as a closed discriminant; new kinds require a concept-doc update.

d. **Parts and Folds are derived, never stored.** No `part` table/column; Fold state is UI-local. Parts derive per render from their source (`Message[]` or session events); the Message/Thread rows remain the sole mutable source of truth. Architecture must keep the renderer pure-derived — no persisted Part/Fold shape.
