# AL1 Review Experience — Design Critique (Reviewer, Phase 2)

Independent, adversarial critique of three rendered variants of the Review surface (workpackage AL1). Scored from the screenshots (`*/screenshot.png`, 2880×2000, cropped to full-res for verdict bars, intent checklists, needs-attention panels, the C ledger row, the B gutter) plus each `spec.md`. Contracts: `plans/AL1/concept.md` (10 parts §1.5, 8 hard rules Phase 4), `plans/AL1/review-information-architecture.md` (§F flow of understanding, two reading modes), `docs/human-interface-layer/review-primitive.md`. Rubric: `PRINCIPLES.md`, `.claude/rules/aesthetic-quality.md`.

I do **not** echo the designer self-scores. Where I disagree I say so and why.

---

## 1. Per-variant 9-dimension scores (0–10)

### A — Verdict Brief

| Dim | Mine | Self | Note |
|---|---|---|---|
| Hierarchy | 9 | 9 | Genuinely inverts the research anti-pattern: "3 things need you before you can approve" lands *above* any diff; title → meta → needs-you → ask → evidence is a clean top-down brief. Best hierarchy in the set. |
| Spacing | 8 | 8 | On-grid, calm reading column. Needs-you card has generous internal rhythm. One nit: the right-hand `Jump ↓` links float far from their rows in a wide viewport — a lot of dead horizontal gap. |
| Typography | 8 | 8 | Mono anchors (`refund-webhook.ts:9`), serif-ish quiet caps section heads (`THE ASK`, `WHAT ATLAS PRODUCED · 4 ARTIFACTS`), italic intent statement. Tabular nums on the cost chip. Solid. |
| Color | 8 | 8 | Forest verdict, amber/blue/earth needs-you dots carry the gap/risk/comment taxonomy, faint red wash on the NOT-ADDRESSED row. Restrained. |
| Coherence | 9 | 9 | Near-all-reuse; reads most native to Hearth. Agreed. |
| States | 7 | 8 | **Down one.** Spec lists populated/empty-needs-you/resolved/loading/error, but the screenshot only proves *populated*. The "NothingNeedsYou" calm-green state — the signature fast-read affordance — is asserted, not rendered. For the variant whose entire thesis is "approve in 5s when nothing needs you," not showing that state is a real gap. |
| A11y | 7 | 8 | **Down one.** The `Jump ↓` ghost links are small and low-contrast against cream; the anchor chips are tiny. Caps headers are quiet (good), but the needs-you detail line is a thin secondary that may brush the 4.5:1 floor (AQ-010). Keyboard map is specified, not provable. |
| Anti-slop | 9 | 9 | Left-aligned, no hero/gradient/centered body, warm. Zero tells. Agreed. |
| Premium polish | 8 | 8 | Briefing reads finished. The dead gutter between label and `Jump ↓` is the one unpolished beat. |
| **Avg** | **8.1** | 8.3 | |

### B — Examination Bench

| Dim | Mine | Self | Note |
|---|---|---|---|
| Hierarchy | 6 | 7 | **Down one.** The frame leads with the *diff* in the center pane — exactly the research anti-pattern the IA §F demotes. Intent + needs-attention are present but parked as left-rail *chrome*, not the spine. The variant's own spec admits this. For a surface whose #1 contract is "the diff is evidence, not the lead," leading with the diff is a hierarchy miss, not a 7. |
| Spacing | 8 | 8 | Three panes (240/center/320) are well-proportioned and on-grid; the gutter rows have correct line-height rhythm. |
| Typography | 8 | 8 | Mono diff body + line numbers, caps rail headers (`VERDICT`, `ON THIS ARTIFACT`, `INLINE ON REFUND-WEBHOOK.TS:54`). Good. |
| Color | 8 | 8 | add/ctx diff tints are warm (green wash), the `:54` amber comment dot + green selected-line ring read clearly. Reject button is the destructive red. |
| Coherence | 7 | 7 | The gutter is the most bespoke shape in the whole set; rail tabs + per-artifact checkboxes are new compositions. Agreed. |
| States | 7 | 7 | Populated proven (gutter + open `:54` comment + verdict rail all visible — the signature is genuinely demonstrated). Loading/error/resolved/single-artifact asserted only. |
| A11y | 6 | 7 | **Down one.** Spec concedes three columns "tighten <1100px." A 320px right rail + 240px left + a code pane is brittle; the rail verdict pills wrap to two rows already at this width (visible in the crop). The gutter `+`-on-hover affordance is mouse-dependent — keyboard `c` is specified but the discoverability is poor. |
| Anti-slop | 8 | 8 | No AI tells; dense but warm. Agreed. |
| Premium polish | 8 | 8 | The selected-line ring + comment dot are a genuinely premium micro-detail. The wrapped verdict-pill row in the rail header is the unpolished beat. |
| **Avg** | **7.3** | 7.6 | |

### C — Reasoning Ledger

| Dim | Mine | Self | Note |
|---|---|---|---|
| Hierarchy | 9 | 9 | The confidence-sorted ledger puts the 45%/LOW/RISK partial-refund decision *first*, hot red meter leading the eye to uncertainty — the cleanest embodiment of "pull the human in where it matters." Top bar = orient+verdict; spine = reasoning; rail = intent/needs/subject. Strong. |
| Spacing | 9 | 9 | Calmest, most composed rhythm. Ledger-card → evidence → comment nests cleanly. Agreed. |
| Typography | 8 | 8 | `45%` in heavy red, `LOW` micro-caps under the meter, `instead of:` discarded-alt in secondary, mono `CODE refund-webhook.ts:54` chip. The structured-why reads as structure, not prose. |
| Color | 9 | 9 | The confidence meter band (red at 45%) is the only place in the set where color carries *quantitative* meaning, not decoration. Best color use. Agreed. |
| Coherence | 8 | 8 | Ledger row + meter are new but composed from `Progress`/`Tag`/`Row`; reads native. Agreed. |
| States | 7 | 8 | **Down one.** Populated proven well (45% row first, expanded evidence + Robin's comment, intent rail, verdict bar). But the load-bearing risk for THIS variant is the empty-Rationale degradation (`NoRationale` → falls back to an artifact list). That's the variant's named weakest case and it is *not* rendered. Asserting the fallback isn't proving it. |
| A11y | 8 | 8 | Sort segmented control + meters need a non-color signal — the `45% / LOW` text label provides it (good, satisfies "never color alone"). Verdict bar sticky-top stays reachable. |
| Anti-slop | 9 | 9 | Left-aligned, dense-calm, distinctive, warm. Agreed. |
| Premium polish | 9 | 9 | Hover-lift cards + meter + inline evidence read the most finished. Agreed. |
| **Avg** | **8.4** | 8.6 | |

**Averages — mine vs self:** A **8.1** (self 8.3) · B **7.3** (self 7.6) · C **8.4** (self 8.6). My ordering matches the designer's (C > A > B) but I dock every variant ~0.2–0.3 for the same reason: **only the populated state is rendered.** Each variant's *most decision-relevant secondary state* — A's NothingNeedsYou, B's <1100px collapse, C's NoRationale — is asserted in prose, not proven in a frame. The screenshots over-represent the happy path.

---

## 2. Concept / IA completeness audit

### The 10 parts (§1.5) — presence/legibility per variant

| Part | A | B | C |
|---|---|---|---|
| 1 Subject (set) | ✓ "4 artifacts" list | ✓ Artifacts·4 rail | ✓ Subject·4 rail |
| 2 Examination surface (renderers) | ✓ code inline; data/text/action asserted | ✓ code in center; gutter; others asserted | ✓ code under decision; text asserted |
| 3 Intent (asked/addressed/NOT) | ✓ best — full checklist + 3/4 met + NOT-ADDRESSED row | ✓ rail mini-checklist 3/4 | ✓ rail checklist + 75% bar |
| 4 Rationale (per-decision, linked) | ◐ collapsed, asserted not shown | ◐ Rationale tab, asserted | ✓✓ **the spine** — proven, structured, confidence-sorted |
| 5 Conversation channel | ◐ inline thread asserted | ✓ rail Thread w/ Robin+Atlas anchored | ✓ anchored comments under evidence |
| 6 Anchors (join examine↔converse) | ◐ anchor chips shown, not interactive | ✓✓ **gutter** — the join, proven on `:54` | ✓ anchor chip→evidence |
| 7 Verdict affordance | ✓ pinned bottom bar, 5 binding | ✓ rail header, 5 binding | ✓ sticky top, 5 binding |
| 8 Cost | ✓ $2.14·312k | ✓ $2.14 | ✓ $2.14 |
| 9 Navigation & progress | ◐ collapsed rows + reviewed check | ✓✓ per-artifact checkbox + "1 of 4 reviewed 25%" bar | ✓ Subject rows + reviewed state |
| 10 Reviewer presence (human/agent) | ✓ Atlas(agent)→Robin(human) | ✓ AvatarGroup agent-distinct | ✓ Atlas→Robin |

All 10 parts are accounted for in every variant. The differentiators show where each spends its budget: **A** owns Intent legibility (part 3), **B** owns Anchors+Navigation (parts 6, 9), **C** owns Rationale (part 4) — the one part the AL1 research says no shipped tool has.

### Flow of understanding (§F: Orient → Triage → Judge ask-vs-result → Examine → Decide)

- **A — honors it exactly.** Orient (title/meta) → **Triage** (needs-you, *above the diff*) → Judge (the ask checklist + result headline) → Examine (collapsed evidence) → Decide (pinned bar). This is the textbook §F sequence and the cleanest in the set.
- **C — honors it, reordered to its thesis.** Orient (top bar) → Triage (needs-attention rail) → **Judge = the ledger spine** (reasoning × intent, confidence-sorted) → Examine (evidence under a decision) → Decide (sticky bar). Triage is present but visually *secondary* to the ledger; the spine is "Judge the why." Defensible, on-thesis, but a pure fast-reader's triage is one rail-glance, not the spine — slightly less §F-faithful than A.
- **B — violates the §F priority.** Leads with **Examine** (the center diff). Orient/Triage/Judge are demoted to left-rail chrome. The IA is explicit: "the result/artifact content is *evidence*, not the lead." **B leads with the diff** — the research's named anti-pattern and the synthesis's first rejection. (B's own spec concedes this.)

### Both reading modes (fast / slow)

- **A** serves fast best (needs-you + pinned verdict = responsible 5s approve) and slow adequately (expand evidence in place). Weak at cross-artifact pivot.
- **B** serves slow best (persistent examine+converse, per-artifact tracking) and fast **poorly** — a fast-reader must parse three panes. Spec admits this.
- **C** serves both: fast = read the needs-attention rail + sticky verdict; slow = work the ledger, drill evidence. Genuinely two-mode.

### Hard-rule check (Phase 4)

| Rule | A | B | C |
|---|---|---|---|
| #1 one Verdict over Subject (no per-artifact verdict) | ✓ one bar | ✓ one rail verdict | ✓ one bar | (per-artifact state is *progress* in all three — correct.) |
| #2 dual anchor (Intent always present) | ✓ | ✓ | ✓ |
| #3 Rationale structured/decision-grained | ✓ (asserted) | ✓ (asserted) | ✓✓ proven structured |
| #4 Anchors = block identity, not geometry | ✓ labels `…:54` are block-id labels | ✓ gutter dots are block-anchored (spec confirms) | ✓ |
| #8 verdict grammar untouched (5 binding) | ✓ Approve/Approve w-comments/Request changes/Edit/Reject (A/C/R/E/X) | ✓ same five | ✓ same five |

**Hard-rule 8 is now satisfied in all three** — the earlier defect (B/C had Snooze/Explain/Ask) was fixed; I confirmed the 5 binding verbs in every full-res verdict crop. No hard-rule violation remains.

**Anti-pattern flag (leads-with-the-diff):** **B only.** A and C correctly demote the diff to drill-down.

---

## 3. Anti-slop / token audit

Scanned each frame for the AQ-101..113 screenshot-detectable tells (centered body, hero, gradient, cool gray, off-grid, off-scale radius/type, glass).

- **A:** No tells. Left-aligned reading column, warm cream `--surface-page`, no gradient/hero/glass. Needs-you card is a flat elevated card (`--r-default`), not a tinted banner. **0 tells. Pass.**
- **B:** No tells. Dense workbench, warm diff tints (not slate/zinc), pill verdict buttons, no centered content. The active-artifact card uses the elevated-surface treatment, not a glow. **0 tells. Pass.**
- **C:** No tells. Ledger cards use `--shadow-subtle`/hover-lift (Hearth signature), the `--accent-secondary-dim` RISK wash is a status tint, not decoration. Confidence meter is a real `Progress`. **0 tells. Pass.**

No frame approaches the 3-tells screenshot-rubric failure. All three are warm, left-aligned, on the Hearth palette. This is the strongest part of the set — anti-slop is uniformly excellent. (Caveat: token-exactness — 6px grid, closed radius/type/motion — is not screenshot-verifiable; it must be enforced by `npm run lint` / `eslint-plugin-design` at build. These are design specs, not built components, so the lint gate hasn't run. Flag for build.)

---

## 4. Adversarial findings (the 3 sharpest)

**F1 — Count inconsistency inside A's own frame (and across the set).** A's needs-you header says **"3 things need you before you can approve"** (3 rows shown), but A's verdict-bar left counter reads **"BLOCKING · 2 unresolved."** B and C both say **"3 unresolved."** Within a single screenshot, 3-needs-you vs 2-unresolved is a contradiction a real reviewer will notice immediately and distrust. The likely intent: "unresolved" = open *comments* (1 blocking comment) and "things need you" = the derived set (gap + risk + comment = 3) — but the labels don't disambiguate, so the numbers read as a bug. The needs-attention derivation must define exactly what each counter counts, and the labels must make the difference legible, before build. (This is the IA §A6 derived needs-attention set; its cardinality has to be deterministic.)

**F2 — The same anchor points at two different lines across variants.** The gap "RefundProcessed event not emitted" anchors to **`refund-webhook.ts:10`** in B's needs-attention but cites **"Rationale #5"** with *no* line in A's needs-you; the partial-refund risk anchors to **`:54`** everywhere (consistent). More sharply: a *gap* (an unaddressed intent item) anchors to a line in the produced code in B — but a gap is, by definition, the thing that was **not** produced; anchoring "RefundProcessed NOT emitted" to `:10` of an existing file is semantically wrong (there is no block there for the missing event). The gap should anchor to the **intent item**, not to a line in the Subject. A handles this correctly (the gap row in A's intent checklist carries *no* `→ line` link). B's `:10` anchor on a gap is an anchor-semantics bug to resolve in `/architecture` (anchors bind to *what exists*; a gap has no Subject anchor — it has an Intent anchor).

**F3 — The most decision-relevant state of every variant is unrendered.** A's NothingNeedsYou (the 5-second responsible-approve case — the entire point of A), B's sub-1100px three-pane collapse (the case the spec admits breaks), and C's NoRationale fallback (C's named worst case, where the ledger spine evaporates and C "becomes a worse Bench") are all asserted in prose and absent from the frames. A reviewer using the *real* surface hits these constantly (a fully-met task → empty needs-you; a human-authored Subject → no rationale; a laptop at 1280px → B collapses). The happy-path screenshots oversell. `/human-design-review` must render at least C-NoRationale and A-NothingNeedsYou before the base is locked, because those states change the layout's spine, not just its contents.

*(Honorable mention — B's verdict pills wrap to two rows in the 320px rail header already at the screenshot width; at <1100px the rail tightens further. The always-reachable verdict in B is the most fragile of the three.)*

---

## 5. Independent recommendation

**Pick: C — Reasoning Ledger — as the base. I AGREE with the synthesis's C-as-base + grafts, with two adjustments.**

**Why C, independently:** C is the only variant whose *spine* is the one part the AL1 research says no shipped tool owns (structured Rationale × Intent × confidence-routing). It scores highest on my independent card (8.4), honors §F (with Triage present in the rail), serves *both* reading modes honestly, and proved its signature in the render (45%-first, hot meter, inline evidence + comment). A is cheaper and more §F-pure but its spine is triage-then-checklist — strong, but it does not *own* white space; it's the best execution of a known shape. B leads with the diff (the rejected anti-pattern) and is the most fragile at width — correctly demoted to a future "deep mode," not the base.

**On the grafts — I agree, with two adjustments:**

1. **Agree: graft A's needs-you triage band + always-reachable verdict bar onto C.** §F is Orient→**Triage**→Judge; C's triage currently lives as a *secondary rail panel*, which is the one place C is less §F-faithful than A. Lifting A's needs-you set to a band *above* the ledger (between the top bar and the spine) fixes that without changing C's thesis. C's sticky-top verdict is fine; A's "Blocking · N unresolved" counter belongs next to it — **but only after F1 is resolved** (define what N counts; do not graft an ambiguous counter).

2. **Agree: graft B's gutter as the in-evidence examine mechanism for code decisions** — it is the proven join of examine↔converse (part 6) and the one net-new interaction A and C both need when drilling a code decision. C already drops the real `CodeRenderer` under a decision; upgrading that to B's line-numbered gutter (dot + `+` + selected-line ring) is the right graft.

**My adjustments to the synthesis:**

- **Adjustment 1 — anchor semantics for gaps (from F2).** Before grafting B's gutter, fix the gap-anchor rule: a *gap* (unaddressed intent item) anchors to the **Intent item**, never to a line in the Subject (there is no block for what wasn't produced). Adopt **A's** handling (gap row carries no `→ line` link) as the contract; reject **B's** `:10`-on-a-gap. This is a hard-rule-4 correctness point (anchors bind to what exists), not a visual choice — flag it to `/architecture` now so the gutter graft doesn't inherit B's bug.

- **Adjustment 2 — the NoRationale fallback must be designed *into* the grafted base, not deferred.** C's spine vanishes when Rationale is empty (human-authored Subjects, and any agent that emits no rationale). The synthesis grafts A's triage band onto C — good, because **that band is exactly the fallback spine**: when there's no ledger, the needs-you band + intent checklist + artifact list (A's shape) *is* the review. So the graft does double duty — it's the Triage step *and* the empty-Rationale layout. Make that explicit in the build contract and render it in `/human-design-review`, because it's the case F3 flags as unproven and it's the one where the whole spine swaps.

---

### Summary

- **Independent averages (mine):** A **8.1** · B **7.3** · C **8.4**. Same ordering as the designer (C > A > B); I dock ~0.2–0.3 each because only the populated state is rendered.
- **Pick:** **C as base + graft A's needs-you triage band & verdict counter + B's code gutter** — I **agree** with the synthesis, with two adjustments: (1) gaps anchor to the **Intent item**, not a Subject line (adopt A's handling, reject B's `:10`-on-a-gap), and (2) the grafted triage band doubles as the **NoRationale fallback spine** and must be rendered in `/human-design-review`.
- **Hard rules:** all 8 satisfied in all three frames (verdict grammar = 5 binding confirmed; diff-first anti-pattern present in **B only**).
- **Anti-slop:** 0 tells in every frame — the strongest dimension of the set.
- **Single biggest concern:** the **needs-attention / "unresolved" count is inconsistent inside A's own frame (3 vs 2) and the gap-anchor is semantically wrong in B (`:10` on a not-produced event).** The derived needs-attention set's cardinality and anchor semantics are undefined — this is the thing that will most visibly bite a real reviewer and it must be pinned in `/architecture` before any of these ship.
