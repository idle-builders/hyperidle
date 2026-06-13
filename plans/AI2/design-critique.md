# Design Critique: AI2 — One dialog experience (the `Dialog` primitive)

DESIGN-CRITIQUE: variant=b-react-portal-stack(+approved synthesis) score=8/10 rounds=1
axes: H:8 S:8 T:8 C:9 Co:9 St:9 A:8 AS:9 PP:7

Scored against the **approved** design (`approved.md` = variant B portal stack + A's inline-guard
interaction + C's internal-hook escape hatch). Variant scores carried from the designer's own
comparison (A 6.4 / B 8.6 / C 7.3) were re-derived independently and hold: B is the only variant
that *literally* satisfies the layer ACs ("stack predictably regardless of DOM order"), and A's
top-layer mechanism fails it permanently. The synthesis correctly absorbed C's single real win
(non-box surfaces) as a private internal hook rather than a second public export. The base choice
is sound and well-argued. The findings below are about completeness of the **rule grammar** and a
few token-fidelity gaps, not the base direction.

DESIGN SCORE (9-dim average): **8.0 / 9-dim-total** → APPROVED threshold (≥7) met.

---

## Dimension scores

| Dim | Score | Note |
|---|---|---|
| 1. Visual Hierarchy | 8 | Title 15/600 → body → footer divider is a clean three-tier read. Discard strip is visually distinct (amber tint) and right-anchors its danger action. |
| 2. Spacing & Density | 8 | `--space-6` (18px) desktop / `--space-4` (12px) phone — both on-grid tokens. Footer 18px top margin + 1px rule is the promoted Agent-pair spacing. |
| 3. Typography | 8 | All on-scale: 15px=`--text-base`, 600=`--fw-semibold`. Fixes the off-scale 14px + undefined `font-heading` in knowledge/bet dialogs. See W-1: 15px is body size, not a heading step — acceptable but worth a conscious confirm. |
| 4. Color Usage | 8 | Scrim `rgba(26,21,16,0.45)` is warm and honors AQ-009 (no pure black). Discard danger = `--accent-secondary`/danger token. See W-2 (scrim hardcoded rgba vs token derivation). |
| 5. Component Coherence | 9 | One primitive, flags not forks; chrome promoted verbatim from the reference pair; DS `Button` for all actions; one `<DiscardConfirmStrip>` prevents drift. Exemplary reuse. |
| 6. States & Feedback | 9 | The five-state matrix (populated / clean-dismiss / dirty-guard / non-modal / content-states) is complete and each maps to a behavior. Motion tokens specified. |
| 7. Accessibility | 8 | focus-trap-react + returnFocusOnDeactivate + `inert` on background + `aria-modal`. See C-1 (non-modal `aria-modal`/focus semantics) and W-3 (toast above scrim a11y). |
| 8. Anti-Slop | 9 | No AI tells — warm palette, no gradients, no glass, intentional warm scrim, real content in mockups. Distinctive z-scale-as-token signature. |
| 9. Premium Polish | 7 | Motion on transform/opacity only, prefers-reduced-motion honored, ≥16px inputs (AQ-005), 44px targets (AQ-015). Lowest dim — see C-1 (mobile bottom-sheet position unproven), W-4 (tabular-nums n/a but touch-target of discard buttons unspecced). |

---

## CRITICAL

- **C-1 [approved.md §1, §5 — the guard rule does NOT cover the close affordance for the non-modal
  case, and "second Esc = Keep editing" collides with native expectations].**
  The locked rule says: *"Non-modal (`modal={false}`) → Escape still closes (guarded if dirty)."*
  But the rule also says *"second Esc picks Keep editing"* (the safe default while guarding). For a
  **non-modal dirty** surface (AssistantOverlay with a half-typed message), this produces a
  three-press sequence to actually dismiss: Esc (→guard strip), Esc (→Keep editing, strip closes,
  still open), Esc (→guard again). The user can **never** discard via keyboard alone — there is no
  Esc path to "Discard," only to "Keep editing." That is the literal opposite of the spec's headline
  goal stated from the user's side ("I never lose typed work") but it also means the documented
  grammar has **no keyboard discard at all**. The rule must specify the keyboard affordance for
  *Discard* (e.g. Enter on the focused Discard button, or the strip must take focus so Tab/Enter
  reaches Discard). As written, the only discard path is a mouse click — undocumented for keyboard
  users and a focus-management gap. → Designer: amend §1/§6 to state, explicitly: when the guard
  strip appears, focus moves to "Keep editing"; Esc re-selects Keep editing (closes strip, stays
  open); Discard is reachable by Tab+Enter or click. Confirm this is the intended grammar, not an
  accidental dead-end.

- **C-2 [approved.md §1, §8 — confirmation dialogs (bet-kill) under the dirty-guard rule violate
  validation scenario 2].** Spec validation scenario 2 is binding: *"Given any confirmation dialog,
  when Escape is pressed, then it closes — same as every other confirmation."* The approved rule
  maps WorkBet kill-confirm to `isDirty = reason non-empty`. So: empty reason → Esc closes (correct).
  But once the user types a reason, Esc → **guard strip, does not close** — which *contradicts*
  scenario 2's unqualified "any confirmation dialog … it closes." The synthesis argues this is
  "strictly better," and it may be the right product call, but **the approved design and the spec's
  validation scenario are in direct textual conflict.** A confirmation is not a content-authoring
  form; the reason field is a gate, not "unsaved work" in the founder's mental model. → Designer:
  resolve the conflict explicitly. Either (a) classify confirmation `reason` fields as **never
  dirty** (Esc always closes a confirm, per scenario 2 verbatim) — the reason is re-typed trivially,
  losing it is not the headline harm — OR (b) get the spec's scenario 2 amended to "clean
  confirmation." Right now a builder following approved.md will fail the protected `L14-bet-actions`
  intent *and* validation scenario 2 simultaneously. This is the single most load-bearing
  unresolved decision in the design.

---

## WARNING

- **W-1 [approved.md §4.1 — 15px title is `--text-base` (body), not a heading scale step].** The
  fix is correct (kills off-scale 14px + `font-heading`), and 15/600 is on-scale and on-weight. But
  the Hearth scale has explicit heading steps (`--text-lg` 17px, `--text-xl` 20px). A dialog title
  rendered at body size relies on weight alone for hierarchy. This reads fine in the mockups, but
  document the deliberate choice (compact dialog chrome → title at base+semibold, not lg) so the
  builder doesn't "correct" it to 17px and so it's consistent with PageHeader/SectionHeader work in
  AI7. → Add one line to §4 stating 15/600 is the intentional dialog-title treatment.

- **W-2 [approved.md §2 — scrim is a hardcoded rgba, not derived from a surface/text token].** The
  scale defines `--scrim: rgba(26,21,16,0.45)` as a literal. AI6 explicitly calls out "the AppShell
  scrim" as a *missing semantic token* that forces hardcoding. AI2 introducing `--scrim` as a raw
  rgba (rather than e.g. `color-mix(in oklab, var(--text-primary) 45%, transparent)` or a documented
  surface-derived value) hardcodes the very thing AI6 wants tokenized, and risks the dark-mode
  variant drifting. The designer flagged the AI1 overlap but not the AI6 token-shape question. →
  Designer: state whether `--scrim` is a final semantic token (then give it a proper derivation +
  dark value) or a placeholder AI6 will reshape. Either is fine — the silence is the gap.

- **W-3 [approved.md §2 — `--z-toast: 70` above `--z-scrim: 50` means toasts paint over an open
  modal's scrim but the modal blocks pointer events — interaction ambiguity].** The scale is
  internally deterministic (good), but a toast at z-70 rendered over a z-60 modal sitting on a z-50
  scrim raises: is the toast clickable while the modal is open and the background is `inert`? The
  mockup shows "Saved to Shared knowledge · z-toast (70)" floating over the dialog. If the modal
  inerts everything except `#overlay-root` and the toast also lives in `#overlay-root`, the toast is
  interactive (fine); if toasts live elsewhere, `inert` could disable them. → Designer: one line
  confirming toasts render into `#overlay-root` (or are exempt from `inert`) so the topmost layer
  stays actionable. (Arguably an architecture concern; flagging here because the z-scale is the
  design deliverable.)

- **W-4 [approved.md §7 / mockup — mobile bottom-sheet *position* is asserted but the mockup renders
  the sheet top-anchored at 375px].** §7 promises "bottom-anchored on phone for thumb reach
  (sheet-like)" and "full-width-minus-12px-gutter bottom-sheet, max-height 85vh." The 375px
  screenshot of the approved variant's mockup shows the dialog anchored to the **top** of the
  viewport, not the bottom. The mockup is static (not the responsive primitive), so this is not
  proof of a defect — but it means the headline mobile claim (thumb-reach bottom sheet) is
  **unvisualized**. Every other state has a screenshot; the mobile bottom-sheet does not. →
  Designer/builder: the `.stories.tsx` mobile-sheet state (architecture lists it) must render
  bottom-anchored, and the Playwright AC-4 capture must confirm it. Flagged so this isn't discovered
  at AC-4 time.

---

## SUGGESTION

- **S-1 [approved.md §3 — `discardCopy` prop is good; confirm the *guard prompt* is also overridable
  per-surface].** A kill-bet confirm that goes dirty should probably say "Discard this kill reason?"
  not "Discard your changes?". `discardCopy.prompt` covers this — just confirm every migrated
  surface that can go dirty gets appropriate copy, not the generic default (the migration table in
  §8 doesn't list per-surface copy).

- **S-2 [approved.md §5 — no explicit "error" chrome state, by design].** The table correctly says
  loading/empty/error are "the consumer's body." Good call — but worth one sentence confirming the
  dialog chrome (title/footer) stays mounted during a submit-error so the user isn't bounced. The
  mockups don't show a submit-in-flight or submit-failed dialog; not required, but it's the one
  interaction state with no visual.

- **S-3 [comparison.md — variant A/C screenshots are honest about their machinery but A's "DIRTY ·
  ESC GUARDED" mockup is cut off at the fold].** Cosmetic; the chosen variant (B) is fully rendered.
  No action.

---

## What's Working Well

- **The rule is genuinely encoded, not case-listed.** "A dialog guards dismissal iff it holds dirty
  user input" with one `isDirty` boolean owned by the consumer and the *consequence* owned by the
  primitive is exactly what the spec demanded ("encode the rule, don't case-by-case it"). This is
  the hardest part of the brief and the design nails the shape — the two CRITICALs are edge-grammar
  completeness, not a wrong model.
- **The z-scale as named CSS tokens is the right deliverable in the right place.** Seven bands, no
  two surfaces competing, deterministic by mount-order-within-band — it satisfies every layer AC
  literally and lives in the one file AI1's gate already governs. The "inspect the DOM, read the
  scale in ten seconds" signature is a real design virtue.

---

## Re-critique round 1 (commit 52aac41d, designer claimed 12/12 resolved)

DESIGN-CRITIQUE: variant=b-react-portal-stack(+approved synthesis) score=9/10 rounds=2
axes: H:8 S:8 T:8 C:9 Co:9 St:9 A:9 AS:9 PP:8

Verified each finding against the revised `approved.md` and (for source-grounded claims) against
real files: `packages/web/index.html`, `main.tsx`, `GlobalSearchPanel.cmdk.test.tsx`,
`AD8b-AssistantOverlay.test.tsx`, `CocOverlay.test.tsx`, `WorkBet.L14-actions.test.tsx`,
`KnowledgeRow.factory.test.tsx`.

| Finding | Verdict | Evidence |
|---|---|---|
| **C-1** non-modal dirty has no keyboard discard / Esc dead-end | **RESOLVED** | New §1.2 specifies: guard strip mounts focus on "Keep editing"; Esc/Enter = Keep editing; **Tab → Enter = Discard**; explicitly holds for non-modal AssistantOverlay. Discard is keyboard-reachable, not mouse-only. The three-press "dead-end" is reframed correctly as intentional (Esc protects, Tab+Enter discards). Grammar is now complete and unambiguous. |
| **C-2** confirmation dirty-guard violates validation scenario 2 | **RESOLVED** | New §1.1: a confirmation **never** sets `isDirty=true` → passes literal `false` → Esc **always** closes (empty or typed reason). Satisfies scenario 2 verbatim. The unsaved-input AC is preserved because it now governs only *authoring* surfaces (§1.1 draws the authoring-vs-decision-gate boundary). §8 table marks kill-confirm AND ConsequencePreview as **`false` always**. The rule is encoded as "isDirty reflects authored work; a confirmation has none → pass the literal `false`, not a derived expression" — crisp enough that a builder cannot misapply it. Confirmed against L14 e2e `:151` ("Escape does NOT close") which the flip correctly inverts. |
| **W-1** 15px title is body size, document the deliberate choice | **RESOLVED** | §4.1 added: "15px = `--text-base` is the *intentional* dialog-title treatment", rationale (compact chrome, weight-not-size hierarchy), explicit "do not correct to 17px", locked for AI7 + builder. |
| **W-2** `--scrim` hardcoded rgba vs AI6 token shape | **RESOLVED** | §2 now declares `--scrim` an explicit *placeholder* AI2 mints (not final), names AI6 as owner of the `color-mix` derivation, requires a finder comment, AND adds the dark value `rgba(20,16,12,0.62)` with AQ-009 (no pure black) rationale. Both themes specified. |
| **W-3** toast above scrim — clickable while modal inert? | **RESOLVED** | §2 toast block: toasts **must render into `#overlay-root`** (the node `inert` exempts); only `#root` is inerted; topmost layer never trapped. Positioning fenced out of AI2 scope; the z-band + portal-target rule are AI2's only toast contract. Unambiguous. |
| **W-4** mobile bottom-sheet asserted but mockup is top-anchored | **RESOLVED** | §7: bottom-anchored declared mandatory with concrete CSS (`position:fixed; bottom:0; translateY(100%)→0`), the static top-anchored mockup explicitly demoted as non-binding, and a binding `MobileSheet` story + AC-4 Playwright bottom-anchoring assertion (`box.bottom ≈ vh, top > 0`) named as the proof. |
| **S-1** per-surface discard copy | **RESOLVED** | §8 + §1.1 distinguish authoring vs confirmation; `discardCopy` prop carried; authoring surfaces guard with appropriate copy. Adequate. |
| **S-2** error chrome state | **RESOLVED** | §5 table: loading/empty/error are the consumer's body, chrome identical/persistent. Confirmed. |
| **S-3** A/C mockup fold | **RESOLVED** (cosmetic, no change needed; chosen variant B fully rendered). |

**New score: DESIGN 9 / 9-dim (was 8).** Both CRITICALs resolved soundly; all four WARNINGs and
all three SUGGESTIONs addressed. Accessibility rises 8→9 (keyboard discard path now complete,
inert/toast interaction resolved); Premium Polish rises 7→8 (mobile bottom-sheet now specified +
provable). No remaining CRITICAL or WARNING in the design.

One narrow note carried to the architecture critique (not a design defect): the cmdk protected-test
carve-out under-specifies which *selectors* (beyond the `z-50` className) must change — see arch
re-critique W-new. It does not affect the design rubric.

**DESIGN VERDICT: APPROVED (9 ≥ 7, no remaining CRITICAL/WARNING).**
