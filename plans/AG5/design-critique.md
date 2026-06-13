# AG5 — Design Critique (reviewer, Phase 2)

Scope reviewed: `concept.md`, `design/brief.md`, `design/approved-draft.md` against the 9-dimension design rubric. Reuse inventory and routine-classification spot-checked against live code in this worktree.

## Verification of factual claims (spot-checks)

| Claim in brief | Verified | Result |
|---|---|---|
| `Select` exists Tier-0, never imported by web app | `grep design-system…Select` in `packages/web/src` → **0 hits** | TRUE — pure accidental divergence, as claimed |
| 16 native `<select>` + 4 inline-style | 15 `select-bordered` daisy sites + WorkBet:1440 inline-chrome (=16 native) + OrgChart selects at 358/383/408/430 (=4 inline) | TRUE — count is honest |
| Five distinct class strings drift | confirmed: `select select-sm select-bordered`, `select select-bordered select-sm`, `…w-[88px]`, `…text-base w-full`, WorkBet:1440 full inline-chrome | TRUE |
| 3 bespoke popovers | bet overflow `WorkBet.tsx:1075` (`toggleAttribute("open")`, no Escape/click-outside/role=menu); knowledge `KnowledgeDetail.tsx:364` (`role=menu`, click-outside+Escape effect at :486); RecipientPicker (`role=listbox`/`option`, SearchField, 3 states) | TRUE — all three exist exactly as described |
| Bet menu lacks Escape/click-outside/role=menu | confirmed at source | TRUE — and the consolidation genuinely fixes a real a11y regression |
| RecipientPicker already `@lore Q1` "page-level composition" | confirmed at `RecipientPicker.tsx:12` | TRUE |

**Minor inaccuracy (NOTE):** brief says `Select.stories.tsx` has "(Default/labeled/disabled)" — actually a *single* `Default` export holding all three. Cosmetic; arch corrects it by adding named exports. Also brief lists OrgChart under `pages/settings/` in one spot and `settings/` in the table — actual path is `packages/web/src/settings/SettingsOrgChart.tsx`; the table is right, the prose drifts. No impact.

## Per-dimension scores

**1. Problem fidelity — 9/10.** Reads the founder complaint correctly ("do we not have a shared dropdown?") and the spec's two-part ask (adopt the existing Select; decide popovers). Correctly excludes the scope pill (AI5) and model/role *function* (AH2) per the track boundaries. Honest that the component "largely exists; adoption does not."

**2. Reuse-first / inventory honesty — 10/10.** Mandatory Phase-0b inventory present, exhaustive, and every line verified against code. Promotes existing `Select` and existing `BlockActionsPopover` rather than inventing. This is the strongest dimension.

**3. Routine vs novel classification — 9/10.** ROUTINE/single-variant is the honest call: the spec mandates "exactly ONE canonical dropdown" and "do not add a second parallel one," which forecloses divergent anatomies — a 3-variant fan-out would be theatre. The non-trivial decision (fold vs keep popovers) is explicitly surfaced as the real design judgment, which is the right place to spend the design budget. Correct.

**4. Anatomy completeness — 8/10.** Select anatomy fully specified (label, control, arrow, all states). Menu states enumerated for stories (closed/open/destructive/disabled/shortcut/copy-feedback). **WARNING:** the brief asserts width is handled "via `className` — no new prop," but the live `Select` applies `className` to the **outer wrapper div** (`flex flex-col gap-[6px] ${className}`) while the inner `<select>` is hard-coded `w-full`. So `className="w-[88px]"` (WorkBet currency) sizes the wrapper, not the control — the control stays full-width. The fixed-width currency picker would visually change. The design doc treats this as solved; it is not. Carries into architecture as a behavior-change risk.

**5. Token / Hearth discipline — 9/10.** Tokens-only asserted and matched against AQ rules (form 10px v-pad = AQ-001 exemption already directive-marked; type ∈ {13,15}; `--r-default`/`--r-subtle`; `--shadow-elevated` AQ-012; warm-only AQ-018; `--motion-fast` AQ-013). The 44px touch floor at ≤1024px (AQ-015) is named and pushed to the test plan. No AI-aesthetic tells. Solid.

**6. States & a11y — 9/10.** All Select states present. Native-`<select>` rationale for "a11y ≥ native by construction" is sound. Menu a11y plan adds arrow-nav that even `BlockActionsPopover` lacks today — a net improvement, correctly scoped.

**7. Fold/keep-distinct justification — 9/10.** The keep-distinct call for RecipientPicker is well-argued: it selects an *entity from a searchable directory* (role=listbox/option, 3 states, composer), not an *action from a short list* — a genuine category difference, already lore-documented, and the AI5 boundary on its identity rows is respected. The fold of the two overflow menus is correct — they are the same shape and one is a regression. Strong.

**8. Decision 1 (additive Menu vs rename) — 7/10.** See cross-cutting finding below. The decision is *defensible* but the design doc leaves it as an open question for the reviewer rather than settling it, and the "wrapper SHARES vs duplicates" contract test is not explicitly applied in the design doc (it is in the brief's intent but not nailed). Resolved in the architecture-critique.

**9. Test/proof orientation — 9/10.** Stories-at-`/designsystem` named; ≥3-surface Playwright consistency review named; keyboard E2E named; the static "no hand-rolled selects" AC correctly routed to a lint rule, not a test. Proof bar matches the track's "rendered app is the proof" rule.

## Cross-cutting finding — the additive-Menu / wrapper decision

The spec contract is: *"no two menus duplicate the same open/position/item-style logic by accident."* The reviewer's test (from the task brief): **if the wrapper SHARES the logic it is fine; if it duplicates, it is not.**

Judgment: the designer's **additive `Menu` + leave `BlockActionsPopover` as-is** plan PASSES the contract *only if* `BlockActionsPopover` is refactored to render *through* `Menu` (sharing open/position/item-style), with copy-feedback as an opt-in item behavior. As written, the approved-draft (Q1) explicitly says *"leave `BlockActionsPopover` as-is"* and *"its copy-feedback specialization earns its keep"* — i.e. `BlockActionsPopover` keeps its **own** `role=menu` container, **own** item chrome, **own** Escape effect, and `Menu` gets a **parallel** copy of the same. That is duplication, not sharing — it would leave the codebase with `Menu` (general) + `BlockActionsPopover` (full independent reimplementation of the same anatomy) = exactly the "two menus duplicate item-style by accident" the AC forbids, just renamed.

This is the one design decision that, taken literally, **violates the spec contract.** It must be resolved one of two ways, and the design doc does not commit to either:
- **(a)** `BlockActionsPopover` becomes a thin wrapper that renders `<Menu>` and injects copy-feedback as one opt-in item — SHARES, passes contract. (Preferred — fewest files, honest single anatomy.)
- **(b)** Strict rename `BlockActionsPopover` → `Menu`, copy-feedback as opt-in item — one component, passes contract, costs the rename ripple.

Either is acceptable. Leaving both as independent full implementations is not.

## 03-hearth.html reference staleness (designer-flagged risk c)

Confirmed: `packages/design-system/html/Select.html` exists (the Select HTML ref the visual-parity rule points to). `html/Menu.html` does **not** exist (it's net-new, correctly listed under arch §7 "New"). There is no stale `03-hearth.html` dependency in *this* workpackage's critical path — AG5's parity anchor is `Select.html` + (new) `Menu.html`, not the global hearth reference. The designer's flag is a non-issue for AG5; no Select anatomy was derived from a stale hearth snapshot. NOTE only.

## Overall: 8.5/10 — REVISE

Strong, honest, reuse-first design with a fully verified inventory and a correct routine classification. Two issues must be fixed before architecture is sound:

- **WARNING (D4):** width-via-`className` does not reach the `<select>` (applies to wrapper); WorkBet currency `w-[88px]` would change behavior. Needs an explicit control-width mechanism (e.g. `className` forwarded to the inner select, or a `selectClassName`/width prop). Decide in architecture.
- **WARNING (D8):** the "additive `Menu` + `BlockActionsPopover` as-is" decision, taken at its literal word in approved-draft Q1, duplicates menu anatomy and violates the AC's "no two menus duplicate item-style by accident." Must commit to wrapper-that-shares (a) or rename (b).

No CRITICALs. Everything else PASSES.

---

## Round 2 addendum (re-critique after designer revision)

Re-read `brief.md`, `approved-draft.md` against the two round-1 WARNINGs. Both addressed.

**D8 (Menu wrapper-shares vs duplicates) — RESOLVED.** The round-1 WARNING was that approved-draft Q1 read literally ("leave `BlockActionsPopover` as-is") = two independent `role=menu` reimplementations = the exact AC violation. The revision now COMMITS, in both design files, to `BlockActionsPopover` becoming a **thin wrapper that renders THROUGH `<Menu>`** (brief.md §Decision-2 / line 61; approved-draft.md line 20 + resolved-decision §1). The menu anatomy lives in exactly one place; copy-feedback/`liveRegionId`/BlockHandle `aria-controls` stay as the wrapper's local specialization. The strict rename is named as the rejected-on-cost alternative (both pass the AC). This is the SHARE resolution the contract requires. Gate carried into arch §5 (component test asserts `BlockActionsPopover` produces a `Menu`-owned container and defines no own `role=menu`/item chrome) + lint (no `role=menu` outside `Menu`).

**D4 (width-via-`className`) — downgraded WARNING → NOTE.** The design files now correctly state the live behavior (className lands on the wrapper; inner `<select>` hard-codes `w-full`; width never reaches the control) and commit to forwarding `className` to the inner `<select>`, with the currency `w-[88px]` + `w-full` sites in the behavior-preservation gate. The *design-level* decision (forward className to the control, no second class slot) is sound and verified against source (`Select.tsx:25,31`). The residual concern is purely the implementation mechanism, evaluated in the architecture re-critique (the "last-class-wins" assumption is empirically false — see arch addendum). At the design layer the intent is correct; the mechanism caveat is an architecture/builder NOTE, not a design blocker.

### Round-2 scores (revised)
- Dim 4 (Anatomy completeness): 8 → **9** (width path now explicit, behavior-preservation gate named).
- Dim 8 (Decision 1 — Menu): 7 → **9** (committed share-through-Menu, no open question left for the reviewer).
- All other dimensions unchanged.

### Round-2 overall: 9.2/10 — **PASS**
No CRITICAL, no WARNING remaining. One NOTE for the builder (D4 width mechanism — see arch addendum: use the conditional-`w-full` fallback, not the last-class-wins primary).

