# AM1 Conversation Experience — Design Critique

Reviewer (evaluator, distinct from producer). Scored against the locked concept (`plans/AM1/concept.md`), the brief (`plans/AM1/design/brief.md`), the Hearth `PRINCIPLES.md`, and the AQ hard rules (`.claude/rules/aesthetic-quality.md`). Screenshots read full-page (states stacked); the right-edge "Inspect" rail is the viewer tool, ignored. Tokens cross-checked against `packages/design-system/src/tokens.css`.

Scoring: per-dimension 0–10 with one-line justification. **Totals are the unweighted mean of the 9 dimensions** (stated explicitly so it is not a vibe). Concept-fidelity is a separate PASS/FAIL gate — a FAIL on rules 1–4 is disqualifying regardless of score.

---

## Variant A — "Quiet Stream"

| Dim | Score | Justification |
|---|---|---|
| Hierarchy | 8 | Clear: message text at reading weight, embeds recede to bordered cards, the review card is the one elevated decision surface. The agent left-rule (vertical accent bar) groups the Atlas turn cleanly without boxing. |
| Spacing | 8 | Calm vertical rhythm, ~720px column, generous turn separation. Slight crowding between the Fold and the first sentence but on-grid. |
| Typography | 8 | One reading weight, quiet sender/meta in tertiary, mono path in the diff card. Reads as "the product, calmer" — exactly the thesis. |
| Color | 8 | Warm-neutral throughout; accent reserved for the verdict "Approved" and diff `+124`. No cool gray visible. `+124/−18` uses green/amber correctly. |
| Coherence | 8 | Reads as one surface; the agent accent-rule is the only new device and it is consistent across the Atlas group and the review card. |
| States | 6 | All five present (empty/loading/error/populated/overflow-via-fold). **Loading skeleton renders near-blank/too-faint** — fails "skeleton matches the shape of what's loading" (PRINCIPLES §6); it does not read as 3 sender-grouped rows. |
| A11y | 7 | Spec commits to real `<button>` embeds, focus-within composer, Fold on Enter, ⌘↵. Cannot verify focus rings from a static shot; tertiary timestamps are WCAG-exempt sizes. Sound on intent, unproven on paint. |
| Anti-slop | 9 | Zero AI tells: no gradient, no hero, no glass, no 3-col grid, no center-aligned body, real copy. The most restrained frame of the three. |
| Premium polish | 7 | Tasteful and quiet but, by its own admission, "least distinctive." The agent left-rule is the only signature; the diff/session chips are competent but not memorable. The faint skeleton reads as unfinished. |
| **Total** | **7.7** | Mean of 9. |

**Top 3 issues**
1. Loading skeleton is near-blank — must render 3 visible sender-grouped skeleton rows (avatar circle + meta bar + 2 text bars) at real skeleton contrast; current state looks broken, not loading.
2. Lowest distinctiveness — the thesis is "calmer current product," which delivers safety but no "wow"; the embedding richness the founder explicitly asked for is the weakest here (compact chips only, everything opens off-column).
3. Session reference and diff are both thin one-liners — legible, but they under-deliver on "embed things beautifully"; a reader can't judge the diff in place at all.

---

## Variant B — "Two-Pane"

| Dim | Score | Justification |
|---|---|---|
| Hierarchy | 8 | Strong index/substance split: the column is a terse scannable list of Parts, the panel holds the heavy diff. Clear reading order, active chip carries accent. |
| Spacing | 7 | Dense by design and executed cleanly, but the column rows sit tight; the avatar-gutter + sender-line + chip stack is efficient but less calm than the brief's "calm reading column" ask. |
| Typography | 8 | Terse one-line Parts, mono in the panel diff, quiet meta. The high-density type rhythm is consistent and scannable. |
| Color | 8 | Warm-neutral; accent on the active chip + verdict; diff syntax colors live in the panel where they belong. No cool gray. |
| Coherence | 7 | Column↔panel coupling reads well **on desktop**; the panel mirrors the existing right-aside pattern (`SessionActivityPanel` chrome), so it's coherent with the app. Risk: it imports a 3-pane mental model the rest of the conversation surface doesn't have. |
| States | 8 | Best state coverage: empty/loading/error all shown panel-closed, plus the populated panel-open default AND the implied panel-closed populated. Loading skeleton actually reads as rows (unlike A). |
| A11y | 7 | Spec commits to `aria-pressed` chips, column-then-panel tab order, focus-return-to-chip on panel close — genuinely the most rigorous focus contract of the three. Unproven on paint; the dense rows risk sub-44px touch targets on the chips (flagged, not confirmed). |
| Anti-slop | 9 | No AI tells. The tabbed panel is a real productivity pattern, not decoration. |
| Premium polish | 8 | The chip→panel→tab interaction is the most "designed" of the three and reads premium and intentional. The terse column + addressable panel is a genuine signature. |
| **Total** | **7.8** | Mean of 9. |

**Top 3 issues**
1. **Tension with the brief's core ask.** The brief wants a *calm reading column*; B's column is a "terse scannable index," optimized for messages-per-screen over calm reading. It's the best *power* embodiment but the least faithful to "reads calmly." This is a thesis-level trade, not a bug.
2. **Mobile degradation is real cost.** Two-pane collapses to a full-screen overlay sheet ≤1024px; the "pull it up without losing your place" benefit — the entire signature — is weakest exactly where most scanning happens (mobile). Desktop-optimal by design.
3. **Most state to manage.** Panel open + active-tab + active-chip sync is the largest surface to keep correct and focus-manage; highest regression risk of the three for the least concept-mandated reason (the Part model doesn't need a panel).

---

## Variant C — "Calm Document"

| Dim | Score | Justification |
|---|---|---|
| Hierarchy | 8 | Document rhythm with quiet 1px sender rules, generous 15px/1.7 body, full-bleed embeds elevated on white with shadow, the work-Fold as a prominent collapsed summary. Strongest "judge the actual change in place" hierarchy. |
| Spacing | 7 | Generous and document-like, on-grid, but the full-bleed embeds make turns tall (its own stated trade); the diff renders 6 visible code lines elevated — readable, borderline wall without disciplined folding. |
| Typography | 9 | The best typography of the three — true document body leading, mono diff with line numbers, quiet role chips (`BUILDER`), uppercase kind labels with tracking. This is "typography as the primary interface" (PRINCIPLES). |
| Color | 8 | Warm-neutral; diff add/remove tinting, accent verdict buttons, amber `KNOWLEDGE` kind chip. No cool gray. |
| Coherence | 5 | **The composer renders mid-thread** — after message 3 (the first diff embed) a "Reply to Atlas… / Send" box appears inline, then the thread *continues* below it (msgs 4–7). This breaks the single-document reading and the bottom-pinned-composer contract. It reads as two stacked threads. Severe coherence break (see below — embodiment vs structure call). |
| States | 6 | All states present but **rendered in the wrong order** (Empty/Error/Loading/Populated) because the story lacks an `order` field — viewer-cosmetic, not a design fault. Loading skeleton reads as faint circles only (avatar dots, no name/body bars visible) — weaker than spec'd 3 sender-turn skeletons. |
| A11y | 7 | Spec commits to `aria-expanded` folds, focus rings, reading-order tab, ⌘↵. Same unproven-on-paint caveat. The mid-thread composer would also scramble tab order in practice (a real a11y consequence of the embodiment bug). |
| Anti-slop | 9 | No AI tells; the document framing is editorial, not generated-looking. Real copy throughout. |
| Premium polish | 8 | When the composer bug is set aside, this is the most premium-feeling frame — it delivers the founder's literal ask ("embed things beautifully," see the diff/plan in place). The work-Fold is the strongest single calm device across all three. |
| **Total** | **7.4** | Mean of 9 (the coherence-5 from the composer bug is the dominant drag). |

**Top 3 issues**
1. **Composer renders mid-thread (msg 3), thread continues below it.** This is the headline flaw. *Severity call: embodiment, NOT structural* — the spec explicitly says "Composer → sticky bottom" (hierarchy item 9) and "Composer is sticky at the bottom" (mobile). The design intent is bottom-pinned; the story simply mis-placed it (likely a stray inline `Composer` in the populated fixture instead of one pinned wrapper). It is a fixable rendering defect, not a design-model error — but it is currently the most visible problem in any frame and would block human-design-review. Must fix before approval.
2. **Most new rendering code** — `DiffEmbedPart`, `BlockEmbedPart`, standalone `Fold`, `SessionReferenceEmbed` (4 new document-grade renderers vs A's 2 small). Higher build + maintenance surface; the full-bleed contract is a different layout shape than the existing compact embeds, so "extend" genuinely isn't available. Justified by the thesis, but it's the heaviest variant.
3. **Calm is discipline-dependent** — by the variant's own admission, the document feel collapses if embeds default-open or the agent under-folds. Correctness hinges on fold defaults and per-Part overflow rules that a static frame can't prove.

---

## Concept-Fidelity Gate (PASS/FAIL — non-negotiable; FAIL on 1–4 is disqualifying)

| # | Gate | A | B | C |
|---|---|---|---|---|
| 1 | Deliberate messages only — NOT a session work-log | **PASS** | **PASS** | **PASS** |
| 2 | Session appears only as a reference Embed (chip/card → dial-in), never an inlined activity stream | **PASS** (chip "Session · Atlas · Opus 4.8 · $0.42 · 14 tool calls →") | **PASS** (session chip + "Open dial-in" panel tab) | **PASS** ("Session · Atlas · Opus 4.8 · $0.42 · 14 tool calls · Open session →") |
| 3 | Renders within Thread/Message/verdict (plain/review/questionnaire/verdict; verdict flow intact) | **PASS** (plain + Fold + review→approved verdict) | **PASS** (plain + review + verdict echo "Approved · re-review before prod") | **PASS** (plain + review card + verdict line) |
| 4 | Nothing in the vocabulary named "Block"/"blocked" | **PASS** (uses "KNOWLEDGE ITEM") | **PASS** (uses "Plan" tab / referenced item) | **PASS** (uses "KNOWLEDGE" kind chip) |
| 5 | Embedding model present (artifact/diff + referenced block + session reference, reading inline not as bare links) | **PASS** (diff card + knowledge-item card + session chip) | **PASS** (diff chip→panel + block chip→panel + session chip→panel) | **PASS** (full-bleed diff + full block render + session card) |
| 6 | Factored so AM3 session view could reuse the structure (the Part model) | **PASS** — spec defines a thin source-agnostic Part wrapper recombining existing primitives; cleanest reuse story | **PARTIAL/PASS** — Part renderer is fine, but the *panel* is a conversation-specific surface AM3 wouldn't reuse; the Part-stack itself is reusable, the panel is not | **PASS** — spec defines an explicit source-agnostic `Part[]` renderer with exhaustive-discriminant + `unknown` fallback, derived from `Message[]`, "AM3 reuses it for session events." Strongest stated Part-model factoring |

**No disqualifying FAILs. All three pass gates 1–4.** Note on #5 for question-type completeness: none of the three fixtures renders a **questionnaire** message (only plain/review/verdict). The concept requires questionnaire to be *representable* in the model, not necessarily in this fixture; treat as a coverage gap to confirm in `/architecture` (the Part dispatch must include it), not a fidelity FAIL.

---

## AC Coverage (TRACK-AM AM1 acceptance criteria)

| AC | A | B | C |
|---|---|---|---|
| Calm, scannable threaded conversation of deliberate messages | ✅ calmest | ⚠️ scannable but terse-dense, less "calm" | ✅ document-calm (once composer fixed) |
| A message embeds what it refers to inline (≥ referenced block/artifact + session link) | ✅ compact inline | ✅ chip + side panel | ✅ full-bleed inline (richest) |
| Honors Thread model (host, participants, all message types render) | ✅ (host banner; no participant count shown) | ✅ (host + "2 participants") | ✅ (host "BET · Passkey login") — questionnaire type not exercised |
| Session work-activity NOT first-class; session referenced not inlined | ✅ | ✅ | ✅ |
| Rendering structure factored for reuse | ✅ thin reusable layer | ⚠️ Part-stack reusable, panel not | ✅ explicit source-agnostic Part renderer |

All three meet the ACs. Differentiation is on *how richly* the embed AC is met (C > B > A) vs *how cleanly* the reuse AC is met (C ≈ A > B) vs *how calm* the scannable AC is met (A ≈ C > B).

---

## Recommendation

**Strongest base: Variant C "Calm Document"** — conditional on fixing the composer placement.

Rationale: AM1 exists to (a) deliver the founder's explicit ask — *embed what a message refers to, beautifully, read inline* — and (b) establish the source-agnostic **Part model** AM3 reuses. C wins both. It has the richest embedding (full-bleed diff/block read in place, not a chip you must click away to see), the best typography, the most prominent and concept-true work-**Fold**, and — critically — the **most explicit Part-model factoring** in its spec (exhaustive-discriminant `Part[]` renderer with `unknown` fallback, derived from `Message[]`, stated AM3 reuse). The mid-thread composer is its only serious defect and it is an **embodiment bug, not a design-model flaw** — the spec already mandates a bottom-pinned composer; the story mis-placed a stray `Composer`. Fix: a single bottom-pinned composer wrapper outside the Part stack; remove the inline one after msg 3.

### Graft in from B
- **The chip→addressable-tab affordance as the *overflow* escape, not the default.** C's full-bleed embeds risk a tall column (its own trade). Borrow B's discipline: when an embed exceeds a height budget, its Fold's "expand" can optionally route to B-style detail rather than growing the column without bound. Keep C's full-bleed as the default reading mode; adopt B's *active-chip accent + `aria-pressed`* affordance for any "open elsewhere" action.
- **B's focus contract verbatim** — column-then-panel tab order, focus-return-to-trigger on close, `aria-pressed` on toggles. It is the most rigorous a11y spec of the three; apply it to C's fold/embed-open controls.
- **B's state set** — B shows loading skeletons that actually read as rows and an *explicit panel-closed populated* state. Adopt B's skeleton fidelity (see reject below) and its habit of showing the populated state in more than one configuration.

### Graft in from A
- **A's reuse-first composition discipline for the simple Parts.** For `plain`/`verdict` Parts, use A's "map straight onto `CommentRow`, add nothing" approach — keep C's new renderers strictly to the two that *need* a new layout contract (`DiffEmbedPart`, `BlockEmbedPart`). Do not let C grow new shapes for Parts that A proves are pure reuse.
- **A's restraint as the calm guardrail.** A is the proof that "the product, calmer" is achievable with near-zero new chrome; hold C to that bar — every new document-grade renderer must justify itself against "could `CommentRow`/existing embed do this compact?"

### Explicitly reject
- **Reject B as the base.** Its column is a terse index, not a calm reading column — it trades the brief's primary adjective ("calm/scannable reading") for messages-per-screen, and its signature panel is a conversation-specific surface AM3 would not reuse, weakening the load-bearing Part-model-reuse AC. Keep B's interaction *parts*, not its layout.
- **Reject the two-pane layout as the primary surface.** The Part model needs no panel; a panel is a desktop-only second region with the most state and the worst mobile story. Do not carry it as the default embed-open strategy.
- **Reject A's compact-only embeds as the ceiling.** A under-delivers on "embed beautifully" — chips you must click away to read are not the founder's ask. Compact is the *overflow* fallback, not the default.
- **Reject C's current composer placement** (mid-thread) and **C's faint loading skeleton** — replace with bottom-pinned composer + B-grade 3-row sender-turn skeletons.
- **Fixture coverage gap (carry to `/architecture`, not a reject):** no questionnaire message is rendered in any variant. Ensure the Part dispatch is exhaustive over `plain | review | questionnaire | verdict` with an `unknown` fallback, even though this fixture omits questionnaire.

### Net
Base **C**, composer-fixed, with **A's reuse discipline on simple Parts** and **B's focus contract + skeleton fidelity + "open-elsewhere" affordance reserved for overflow.** This yields the embedding richness and Part-model factoring AM1 is *for*, the calm A proves is reachable, and the a11y rigor B specs best — without importing B's panel or A's compact-only ceiling.
