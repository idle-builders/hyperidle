# AL1 — Review-canvas components: design critique (REVIEWER, independent + adversarial)

Critique of the 8 rendered review-canvas components against `components-brief.md` §1-7, `spectrum-review-needs.md`, `tool-ecosystem-and-canvases.md`, `PRINCIPLES.md`, and `aesthetic-quality.md`. Shot at 1380px viewport, deviceScaleFactor 2, factory/Hearth-light theme. I did not produce these.

---

## TL;DR

- **Per-component averages (9 dims):** Outcome-Finance **8.1** · Outcome-Support **8.0** · Field-ChangeSet **7.3** · Action-Operation **8.2** · Rendered-in-Context **7.0** · Metrics-Moved **8.0** · Visual-Diff **7.2** · Code-Diff **8.4** · Batch **8.3**.
- **Family verdict:** This is a real family, not eight one-offs. Shared chrome reads (cream card, mini-logo top-left, `needs you`/`BLOCKING` amber-red language, forest primary CTA, calm density). The layering is genuinely 3-tier in **6 of 8** — the founder's prior rejection reason (flat walls) is largely fixed. Two components (Rendered-in-Context, Visual-Diff) are the weak corners.
- **The single biggest concern:** **`--status-success-dim` and `--status-warning-dim` are undefined tokens — they exist NOWHERE in `tokens.css`.** Every `var(--status-warning-dim)` / `var(--status-success-dim)` background resolves to `transparent` with no fallback. This is the exact "substituted undefined `*-dim` token" risk the brief flagged, and it is visibly broken: the "needs you" pill and the amber needs-you row washes in Field-ChangeSet, Action-Operation, and Rendered-in-Context render with NO fill. This must be fixed before `/human-design-review` — the founder will see colorless pills where amber emphasis was specified.

---

## 0. The cross-cutting token bug (read this first)

`packages/design-system/src/tokens.css` defines only four `-dim` tokens: `--accent-primary-dim`, `--accent-secondary-dim`, `--status-info-dim`, `--status-error-dim`. **`--status-success-dim` and `--status-warning-dim` do not exist in the repo.** Usages with no fallback (→ resolve to `transparent`):

- `ReviewFieldChangeSet.tsx` L136 (needs-you row wash), L138 (approved row wash), L185 (the **"needs you" pill** bg), L216 (L3 needs-you detail bg), L296 (footer)
- `ReviewActionOperation.tsx` L118-119 (the IRREVERSIBLE header band border+bg), L261 (warning band)
- `ReviewRenderedInContext.tsx` L350 (the FLAG row wash)

**Visible symptom:** Field-ChangeSet `field-changeset.png` — the orange "needs you" pill next to $78,400 shows orange text on an **empty/transparent** background (no amber pill fill), and the Amount row has no amber wash to float it. Action-Operation's IRREVERSIBLE band (line 118) survives only because line 205 uses the *defined* `--status-error-dim` for the red callout — the amber header band itself is transparent. **Highest-value family-wide fix.** Either add the two tokens to `tokens.css` (preferred — completes the scale) or switch these references to the defined `--status-error-dim`/`--accent-secondary-dim`.

Other token notes (non-blocking):
- `ReviewRenderedInContext.tsx` L149-209: the email body uses raw hex (`#ffffff`, `#e2dcd2`, `#2f6b4f`, `#faf7f1`, `#8a8174`, …). **Defensible** — this is the foreign branded email surface rendered as-it-lands (same nominative-use carve-out as `ToolLogo`). Recommend a file-level `// foreign-surface` directive + comment so the lint exemption is explicit and the next agent doesn't "fix" it into Hearth tokens (which would defeat the in-the-inbox realism).
- `ReviewVisualDiff.tsx` L145, L286: `var(--text-on-accent,#fff)` — hex fallback on a defined token. Cosmetic; drop the `,#fff`.
- `ReviewBatch.tsx` `#20418` etc. are ticket-reference strings, not colors. False positive.

---

## 1. Per-component scores + layering verdict

Scale 0-10. Dims: hierarchy / spacing / typography / color / coherence / states / a11y / anti-slop / premium-polish.

### 1 · ReviewOutcomeSummary — Finance (`outcome-finance.png`)
**8 / 8 / 8 / 7 / 9 / 7 / 8 / 9 / 8 — avg 8.1**
- **Hierarchy (8):** Excellent. `Atlas → You` + `BLOCKING` top, then the one-sentence achievement at ~24px, then tools row + cost, then DONE CONDITIONS, then NEEDS YOU. Reads top-down exactly as the brief's L1→L2 demands.
- **Color (7):** `BLOCKING` pill is red-on-pink, the unmet ✗ condition is red, NEEDS YOU items are red/amber-tinted. Correct semantics. Docked one point: the `UNHANDLED EXCEPTION` chip is solid red-filled while `OVER AUTHORITY` is amber-outline — the weight difference is good (floats the worse one) but verify it's intentional ordering, not accidental.
- **States (7):** Populated + blocking shown. Empty/loading specified in comments per brief (not visible here).
- **Layering verdict — 3 LAYERS, CLEAN.** L1 = sender/achievement/tools/cost/standing. L2 = done-conditions (3-of-4, the unmet floated, 3 met collapsed to one line — exactly the relevance rule). L3 = the per-item "Jump ↓" to the proof canvas. This is the model done right.

### 2 · ReviewOutcomeSummary — Support (`outcome-support.png`)
**8 / 8 / 8 / 7 / 9 / 7 / 8 / 9 / 8 — avg 8.0**
- Parameterization proof: same skeleton, Zendesk+Slack logos, "41 tickets — 18 auto-resolved, 19 drafted, 4 flagged" headline. The function-agnostic frame thesis holds — this is the strongest single argument in the set that the frame is reusable.
- **Nit:** `slack` mini-logo label is lowercase while `Zendesk`/`QuickBooks`/`Stripe` are title-case. Inconsistent — title-case it.
- **Layering verdict — 3 LAYERS, CLEAN.** Same structure as Finance; the IRREVERSIBLE / OVER AUTHORITY needs-you items float correctly.

### 3 · ReviewFieldChangeSet (`field-changeset.png`)
**7 / 8 / 8 / 6 / 8 / 6 / 7 / 8 / 7 — avg 7.3**
- **Color (6):** dragged down by the token bug — the "needs you" pill has no fill (§0), so the single most important field (Amount, over the 10% floor) loses its amber emphasis. The amber-tan `--accent-secondary-dim` value pills (Proposal, Jul 31, Decision call, Marcus Vela) read well and are defined.
- **Hierarchy (7):** the Amount row IS floated to top with the source line + the orange "Verify $78,400 — 12% discount over 10% floor" warning expanded by default (good L3-visible-in-static-render). But because the needs-you wash is transparent, the float relies entirely on position + the (working) orange text — weaker than intended.
- **States (6):** populated only; checkboxes all unchecked, "0 of 5 fields approved" — fine, but the approved-row green wash (`--status-success-dim`, also undefined) means the approve-interaction state is also broken on paint.
- **Anti-slop (8):** `+12 unchanged` collapsed correctly. `Approve all fields` is a forest pill. Good.
- **Layering verdict — 3 LAYERS, mostly.** L1 = "1 record · 5 fields changed · 1 needs you" header. L2 = the before→after grid (old strikethrough → new pill). L3 = the expanded source line + verify-warning on Amount. Drill-down present. The collapse of unchanged + the float of the over-floor field satisfy relevance-ordering. **The token bug is what costs it.**

### 4 · ReviewActionOperation (`action-operation.png`)
**9 / 8 / 9 / 7 / 8 / 7 / 8 / 9 / 9 — avg 8.2**
- **Best embodiment of its signature.** The `$1,240.00 USD` in the framed REFUND AMOUNT box is the hero, money-prominent, IRREVERSIBLE pill top-right. Reads as a real pre-commit Stripe receipt — charge id, customer, reason, idempotency key, net-after-refund all in mono, right-aligned. This is the T3-receipt language done well.
- **Premium-polish (9):** the framed amount box, the mono receipt rows, the "Blast radius & reversibility" collapsible with the red IRREVERSIBLE callout, then `Reject` / `Approve refund` (forest) gate — staged, calm, precise.
- **Color (7):** the red IRREVERSIBLE callout (L205, `--status-error-dim`, defined) renders. But the top-band amber `IRREVERSIBLE` treatment at L118-119 uses the undefined `--status-warning-dim` — that header band's intended wash is transparent (§0). It survives visually because the text+dot carry it, but it's not what was specified.
- **Layering verdict — 3 LAYERS, CLEAN.** L1 = action headline + $ + IRREVERSIBLE. L2 = the receipt rows. L3 = the expanded blast-radius/reversibility + the Approve/Reject gate. Textbook.

### 5 · ReviewRenderedInContext (`rendered-in-context.png`)
**7 / 7 / 7 / 7 / 7 / 6 / 6 / 7 / 7 — avg 7.0**
- **The weakest of the strong-concept set.** The inbox-row L1 (Mailchimp · 12,400 + trial · "Your team, minus the busywork — now $19" + preview + 9:00 AM) is good and on-brief. The opened render with Desktop/Mobile toggle is the right L2.
- **a11y (6) / typography (7):** the email body is a foreign hex surface (defensible, §0) but the **"Run a team of agents. Keep the final say." headline is centered** inside the email card. Per AQ-106 centered body is allowed inside email/marketing surfaces — but it sits right next to seven left-aligned Hearth cards in the family, so in a screenshot it reads as the one centered-hero tell. Acceptable *because it's the rendered asset*, not Hearth chrome — but flag it so the founder reads it as "the email, not our UI."
- **Layering (6→ weakest):** L1 inbox-row ✓, L2 opened render ✓, but **L3 is thin** — the `1 FLAG · unverified claim · send plan · exclusions` strip at the bottom is collapsed to a single dim row and the "Set up in under 5 minutes — Unverified claim, no source" detail is present but visually buried below the fold of attention. The claim-ledger (the actual review value for marketing — the unverified superlative) is the least prominent thing on screen. **Relevance-ordering is inverted here:** the biggest risk (an unverified claim shipping to 12,400) should float up near L1, not sit last under the send plan.
- **Recommendation drives the lowest score:** float the flagged claim up.

### 6 · ReviewMetricsMoved (`metrics-moved.png`)
**8 / 8 / 8 / 8 / 8 / 7 / 8 / 8 / 8 — avg 8.0**
- **Strong.** L1 = three moved-headline cards (Recognized revenue $612,400 +$24,400 ▲, Cash $1,284,302, AR $118,900 −$25,400 ▼) materiality-sorted, "3 exceptions · 2 need you" floated top-right in red. L2 = the ROLL-FORWARD reconciliation table with changed activity cells highlighted amber and the green **"Opening + activity = Closing ties to bank ✓"** tie-out band. L3 = per-figure provenance ("GL account 4000 · from Stripe MRR report …") expanded on the revenue card + the EXCEPTIONS list by-$ ($9,840 → $4,200 → $31,500), each with NEEDS YOU / TIMING tags.
- **This is the relevance-ordering exemplar** — exceptions sorted by dollar amount, tie-out proven, provenance one drill down. The amber changed-cell highlights use `--accent-secondary-dim` (defined) so they render.
- **Docked:** dense — the table + 3 cards + exceptions is a lot at once; the L1→L2 elevation break is subtler than Outcome/Action (it relies on the section labels ROLL-FORWARD / EXCEPTIONS rather than a strong elevation/collapse). Verify it doesn't read as a flat finance wall at smaller widths. Tie-out band color: confirm the green is `--status-success` text on a defined bg, not the undefined `-dim`.

### 7 · ReviewVisualDiff (`visual-diff.png`)
**7 / 7 / 7 / 7 / 7 / 6 / 7 / 8 / 7 — avg 7.2**
- L1 = two thumbnails + Figma logo + "3 regions differ" + `Onboarding / Account · v4 → SignupScreen.tsx`. L2 = Side-by-side / Overlay / Swipe toggle (Side-by-side active, forest) + the DESIGN vs BUILD frames at size. L3 = DIFFERING REGIONS list ("Email field missing in build", "CTA color forest vs amber", "Hero spacing 24 → 16") with strikethrough before→after.
- **Genuinely clever:** the diff regions are expressed in *design-token language* (`--accent-primary (forest) → --accent-secondary (amber)`, `--space-8 (24px) → --space-6 (18px)`) — that's the most on-brand, tool-grounded detail in the set and a real differentiator vs a generic image-diff.
- **Docked (color/coherence 7):** the BUILD frame's CTA is rendered **amber/orange** (correctly, it's the "bug") but a reviewer scanning fast may read amber-CTA as a Hearth status-warning rather than "the wrong build color." The intent is right but the signal collides with Hearth's amber semantics. Consider a neutral diff-callout (dotted outline + label) over relying on the literal wrong color alone.
- **Layering (6):** the three toggles imply L2 interactivity but only Side-by-side is shown; the differing-regions L3 is good but doesn't visibly tie a region-chip to a highlighted region *on the frame* (no spatial anchor drawn on the thumbnails). The drill-down is list-only, not spatial — weaker than Code-Diff's hunk anchoring.

### 8 · ReviewCodeDiff (`code-diff.png`)
**9 / 8 / 9 / 8 / 8 / 7 / 8 / 9 / 9 — avg 8.4 — highest**
- **The must-win, and it wins.** PR header (`acme/storefront #1428 OPEN`, GitHub logo, "Fix expired-promo checkout returns silent success → typed 422", **+140 −31**), the **CI checks row inline** (✓ All checks passed · tests · lint · build · typecheck · coverage +0.4%), "6 files changed · relevance-ranked" + **Collapse all**. This is the T3/GitHub language embodied precisely.
- **Relevance-ranking is correct and the headline feature:** LOGIC section first (`src/billing/promo-webhook.ts` expanded with a **line-number gutter** and red/green hunk: the silent `ack(evt)` → typed `422 promo_expired`), then `PromoField.tsx` (+19 −2 collapsed), then `expired.test.ts` (+44 −0, green check), then **"3 files · OpenAPI regen + lockfile + formatting" collapsed** at the bottom. Meat=6 lines surfaced, generated/lockfile collapsed — exactly §4.
- **Premium-polish (9):** the gutter, the `@@ -116,9 +116,18 @@` hunk header, the inline `+/−` line markers, the mono code, the green/red wash — all correct. This is shippable.
- **Layering verdict — 3 LAYERS, CLEAN.** L1 PR header + checks + counts. L2 relevance-ranked file cards. L3 expand-a-file → guttered hunks. The best drill-down in the set.

---

## 2. Tool-grounding + reference-language audit

| Component | Mini-logo present/legible | T3 reference language | Proof shown as the real thing |
|---|---|---|---|
| Outcome (both) | ✓ QuickBooks+Stripe / Zendesk+Slack row, legible | ✓ summary-block lead, change counts | ✓ achievement sentence + standing |
| Field-ChangeSet | ✓ `sf` Salesforce, in header + per-field L3 | ✓ collapsible card, change badge "5 fields", unchanged collapsed, per-field source | ✓ real before→after field grid w/ strikethrough |
| Action-Operation | ✓ `S` Stripe | ✓ receipt rows, blast-radius collapse | ✓✓ **best** — staged pre-commit Stripe receipt, idempotency key |
| Rendered-in-Context | ✓ Mailchimp `M` | ~ inbox-row + toggle good; claim-ledger weak | ✓ email renders as-it-lands |
| Metrics-Moved | ✓ QuickBooks + Stripe (provenance) | ✓ changed cells, tie-out ✓, Collapse ("Show 9 items") | ✓✓ moved figures + tie-out + provenance |
| Visual-Diff | ✓ Figma `F` | ✓ side-by-side, swap/overlay toggle | ✓ design-vs-build at size; diffs in token language |
| Code-Diff | ✓ GitHub | ✓✓ **best** — collapse-all, gutter, CI inline, change badge | ✓✓ real gutter+hunks |
| Batch | ✓ Zendesk | ✓ rollup, flagged-pinned, routine-collapsed, **Approve all except flagged (37)** | ✓ real ticket rows + drafted-reply rendered in-ticket |

**Verdict:** Tool-grounding is universal and legible across all 8. The T3/Copilot reference language is fully embodied in Code-Diff, Action-Operation, Metrics-Moved, Field-ChangeSet; lightly in Rendered-in-Context and Visual-Diff (those lean on their domain rather than the T3 card idiom — acceptable, they're different proof families). No generic/placeholder logos seen.

---

## 3. Relevance-ordering audit (meat-first, float-outlier, collapse-trivia)

- **Outcome (both):** ✓ unmet condition floated, 3-met collapsed; needs-you items ordered worst-first (IRREVERSIBLE/UNHANDLED above OVER-AUTHORITY).
- **Field-ChangeSet:** ✓ Amount (over-floor) floated to top with source+verify expanded; `+12 unchanged` collapsed.
- **Metrics-Moved:** ✓✓ exemplar — exceptions sorted by $ descending ($9,840 → $4,200 → $31,500-timing), headline cards materiality-sorted, "Show 9 items" collapse.
- **Code-Diff:** ✓✓ logic top, generated/lockfile/formatting collapsed to "3 files".
- **Batch:** ✓✓ 4 flagged pinned top (with rank numbers 1-4 by ARR/heat), 18 auto-resolved + 19 drafted collapsed to one line each.
- **Rendered-in-Context:** ✗ **INVERTED** — the unverified-claim flag (the actual risk) sits LAST, below the send plan. Should float up. This is the one relevance miss in the set.
- **Visual-Diff:** ~ regions listed but not impact-ranked on screen (Email-missing, CTA-color, Hero-spacing appear list-order, not severity-order); a missing field is arguably more severe than a spacing px and should lead.

---

## 4. Anti-slop / token audit

- **AI-aesthetic tells:** No gradients, no glass, no `rounded-3xl`, no purple/indigo, no stock 3-col identical-card grid (the Metrics 3 headline cards are heterogeneous values, not the AQ-108 pattern). One centered headline — but it's *inside the rendered email* (AQ-106 carve-out), not Hearth chrome. **No AI-slop tells in the Hearth chrome itself.** Clean.
- **Token violations:** the undefined `--status-success-dim` / `--status-warning-dim` (§0) — the one real, blocking issue. Plus the cosmetic `,#fff` fallbacks in Visual-Diff and the (defensible) foreign-surface hex in the email.
- **Off-grid/off-scale:** spot-check of classNames shows `px-[18px]/py-[12px]/gap-[9px]/gap-[6px]` (on the {3,6,9,12,18,24} grid), `text-[12px/13px/15px]` (on the type scale), `rounded-[var(--r-subtle/-pill)]`. No off-grid/off-scale values seen in the read samples. Lint will confirm.

---

## 5. Cross-cutting

**Family coherence — YES.** Shared cream card on `--surface-elevated`, mini-logo top-left, `needs you`/`BLOCKING`/`NEEDS YOU` consistent amber-red language, forest primary CTA + ghost secondary (`Reject`/`Request changes`/`Hold`), `Jump ↓` / `Source` / `Collapse all` affordance vocabulary, calm desktop density. A reviewer would recognize these as one product.

**The 3 sharpest problems a real reviewer hits:**
1. **Undefined `-dim` tokens (§0)** — the needs-you/approved emphasis washes are transparent in 3 components. The amber "needs you" pill — the most important attention signal in the whole review surface — renders without fill. Blocking.
2. **Rendered-in-Context buries the risk** — the unverified claim (the entire reason to review a 12,400-recipient send) is the least-prominent element. Relevance-ordering inverted. The one component where the review value is hidden.
3. **Visual-Diff has no spatial anchor** — region chips don't tie to highlighted regions on the frames, and the "wrong" amber CTA collides with Hearth's amber-warning semantics. The drill-down is list-only where a spatial overlay is the natural affordance.

**What's missing (states / families):**
- **No empty/loading/error renders captured.** Every component's `Populated` was shot; the brief requires populated + empty + loading-skeleton + needs-you-emphasis. Only populated + needs-you are visible. The founder can't review the skeleton-loading shape (D-principle: skeleton matches layout) or the empty state from these screenshots. Recommend shooting at least the loading skeleton for Code-Diff and Batch (the two with the most layout to skeleton).
- **Proof-family coverage:** 7 families + batch are all present. The "live/interactive" proof kind from `spectrum-review-needs.md §2` (Product app-at-changed-screen) is intentionally out of scope for AL1 — fine, note it as the known gap for a follow-up.

---

## 6. Per-component highest-value fix (raise before `/human-design-review`)

1. **Outcome-Finance:** title-case parity already fine here; lowest-effort polish — confirm the solid-red vs amber-outline needs-you weighting is deliberate (worst-floats). Otherwise ship-ready.
2. **Outcome-Support:** title-case the `slack` mini-logo label to `Slack` (consistency with the other logos).
3. **Field-ChangeSet:** **define `--status-warning-dim` + `--status-success-dim`** (or switch L136/138/185/216/296 to defined tokens) so the "needs you" pill and the floated Amount row actually fill amber. This is the make-or-break for the component.
4. **Action-Operation:** point the IRREVERSIBLE header band (L118-119) at a defined token so the amber wash paints; the rest is ship-ready.
5. **Rendered-in-Context:** **float the unverified-claim flag up** to sit directly under the inbox-row L1 (it's the review's whole point); add a `// foreign-surface` lint directive + comment over the email hex block.
6. **Metrics-Moved:** strengthen the L1→L2 elevation break (the table currently reads close to the cards) — a shadow/divider or collapse on the reconciliation table so it reads as drill-down, not a flat finance wall.
7. **Visual-Diff:** draw a spatial anchor — highlight the differing region ON the frame and link it to its chip; reconsider relying on the literal amber CTA (add a neutral diff outline) so it doesn't read as Hearth status-warning.
8. **Code-Diff:** ship-ready. Only nicety: capture the loading-skeleton state for the founder, since it has the most layout to skeleton.

**Plus one family-wide fix:** add the two missing `-dim` tokens to `tokens.css` (completes the `-dim` scale: all four statuses + both accents) — this single change resolves the §0 bug across Field-ChangeSet, Action-Operation, and Rendered-in-Context at once. Do this first.

---
*Findings only. No TSX edited. The builder applies; the founder iterates each in `/human-design-review`.*
