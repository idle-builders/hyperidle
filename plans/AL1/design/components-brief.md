# AL1 — Review canvas components: design brief (the build contract)

We are designing **one review element per proof family** + the **outcome-summary lead**, each a **built-in Hearth component**, **tool-grounded** (mini-logo + real fixture), as isolated rendered stories at `:8098`. Single strong embodiment of the locked direction (NOT 3 variants each) — the founder iterates each in `/human-design-review`.

**Read first:** `spectrum-review-needs.md` (the model), `tool-ecosystem-and-canvases.md` (tools + canvas types), `concept.md` + `review-information-architecture.md` (locked nouns/IA).

---

## The non-negotiable design language (this is where the last attempt failed — get it right)

1. **Proper LAYERING — progressive disclosure, with depth.** Every canvas reads at three layers: **(L1) a one-glance summary** (what/how-much/what-needs-you) → **(L2) the structured proof** (the grid / receipt / render / deltas / hunks) → **(L3) on-demand detail** (a field's source, a file's diff, an item's full content). Default state shows L1 + the meat of L2; trivia collapses to "N more like this". The reviewer **drills DOWN through layers** — never a flat wall. Use elevation + collapse, not everything at one altitude.
2. **Draw from the reference review experiences (T3 Code / Claude / Copilot).** Concretely: **collapsible cards** with a header + a **change badge** (`+82 −14`, `5 fields`, `$1,240`), a **"Collapse all / Expand"** affordance, a **mini provider logo on every item**, **line-number gutters** for code, calm desktop density, a **summary-block lead** then drill-down. These are the patterns to embody — not invent something unrelated.
3. **Result-first, code-tertiary-but-must-win.** Lead with the outcome/proof, not the raw change. Code-diff is opened least but must be **excellent** (the market is strongest there).
4. **Relevance-ordering, always.** Order the contents of any change/list by impact (meat→trivia), collapse the trivia, **float the outlier/exception** to the top. Never file/row/alphabetical order.
5. **Tool-grounded.** Every canvas + every artifact carries its **source tool's mini-logo** (`<ToolLogo tool="stripe" />`) — provenance at a glance. Use realistic tool data.
6. **Hearth + CP1 tokens only.** `var(--token)` names only (CP1 values auto-apply): surfaces `--surface-page/-container/-elevated`, text `--text-primary/-secondary/-tertiary`, accents `--accent-primary`(forest)/`--accent-secondary`(amber), status `--status-success/-warning/-error/-info`, `*-dim`, borders `--border-subtle/-default/-strong`, radius `--r-subtle`(10)/`--r-default`(16)/`--r-pill`, shadows `--shadow-subtle/-default/-elevated`, motion `--motion-fast/-default`. 6px grid {3,6,9,12,18,24,36,48}. Type {12,13,15,17,20,24,30}, weights {400,500,600,700}. Pill buttons. Agent avatar green-distinct (AQ-012). Left-aligned (no centered body). Animate transform/opacity only. No hex/raw-tailwind/cool-gray.
7. **Isolation story.** Each component is a presentational story (local `useState` for collapse/expand/toggle; callbacks no-op). NO router/context. NO tests/check/lint/bless. The story renders the component on its fixture, showing L1+L2 with one L3 item expanded so the layering is visible in a screenshot.

## Location + discovery (do exactly this)
- Files in `packages/web/src/pages/review/` (this path is discovered by the viewer's nested-pages glob).
- Story default export MUST include `group: "Conversations"` (or the AJ6 catalog drops it): `export default { title: "Review/<Name>", group: "Conversations" };`
- Import the shared `ToolLogo` from `./ToolLogo` (already built). Build your own fixture inline or in a `<name>.fixture.ts` next to the component.

## The 8 components

| # | Component (file) | Proof family | Tool + fixture | L1 summary → L2 proof → L3 detail (the layering) | Signature |
|---|---|---|---|---|---|
| 1 | `ReviewOutcomeSummary` | the **frame lead** (function-agnostic) | render 2 examples: **Finance** (Stripe/QuickBooks "May close") + **Support** (Zendesk "overnight sweep") | L1: agent→reviewer, *what was achieved* (1 sentence), the **tools used** (mini-logos row), cost, standing · L2: intent done-conditions (✓/✗ met) + **needs-you** chips (the 6-category risk taxonomy) · L3: each links down to its proof canvas | "what was achieved + what needs you", tools logo'd, before any artifact |
| 2 | `ReviewFieldChangeSet` | record/field change-set | **Salesforce** deal write (Stage Discovery→Proposal, Amount $0→$78,400, Close→Jul 31, Next step, +contact) | L1: "1 record · 5 fields changed · 1 needs you" + Salesforce logo · L2: before→after field grid (old strikethrough → new, unchanged collapsed) · L3: per-field source line + select-to-approve | per-field before→after grid, approve-per-field |
| 3 | `ReviewActionOperation` | action / operation | **Stripe** refund $1,240.00 (charge ch_3Q…, reason: duplicate, idempotency key) | L1: the action headline + **$1,240.00** + Stripe logo + "irreversible" · L2: the receipt (charge, customer, reason, idempotency) · L3: blast-radius + reversibility/undo + a pre-commit **Approve / Reject** gate | a staged pre-commit *receipt*, money + reversibility prominent |
| 4 | `ReviewRenderedInContext` | rendered-in-context | **Mailchimp/Klaviyo** launch email "Solo plan $19" to 12,400 | L1: the **inbox row** (sender · subject · preview) + logo + segment size · L2: the opened render (desktop), mobile toggle · L3: claims/links flagged (1 unverified claim) + send plan | the email *as it lands in the inbox*, then drill to full render |
| 5 | `ReviewMetricsMoved` | metrics-that-moved / data-diff | **QuickBooks/Stripe** May close: revenue roll-forward + reconciliation | L1: the moved headline numbers (materiality-sorted: $612,400 revenue, 4 exceptions) + logo · L2: the table with **changed cells highlighted** + tie-out (Σ=control ✓) · L3: per-figure **provenance** + the exceptions list | materiality-sorted deltas, tie-out ✓, per-figure provenance |
| 6 | `ReviewVisualDiff` | visual before→after | **Figma** design frame vs implemented screen (onboarding) | L1: side-by-side thumbnails + Figma logo + "3 regions differ" · L2: before/after at size with a swap/overlay toggle · L3: the differing regions flagged | design-vs-build side-by-side, diff regions called out |
| 7 | `ReviewCodeDiff` | **code diff (must-win)** | **GitHub** PR "Fix expired-promo checkout 422" (12 files, meat = 6 lines) | L1: PR header + GitHub logo + **+140 −31**, CI checks green, "Collapse all" · L2: **relevance-ranked file list** (logic files top, generated/lockfile collapsed to "3 files · formatting") · L3: expand a file → hunks with a **line-number gutter** + inline anchor affordance | T3-style collapsible file cards, relevance-ranked, gutter, CI inline |
| 8 | `ReviewBatch` | batch / per-item *(container)* | **Zendesk/Intercom** overnight triage (41 tickets: 4 flagged, 18 auto-resolved, 19 drafted) | L1: the rollup ("41 · 4 need you · 18 auto · 19 drafted") + logo · L2: relevance-sorted list — **4 flagged pinned top**, 18 auto collapsed to "18 auto-resolved (Checkout-500)", 19 drafted · L3: expand an item → its full reply/context + per-item approve, **approve-all-except-flagged** | flagged-floats-up, routine-collapses, approve-all-except |

## States each component must define (show populated; specify the rest in a code comment)
populated (default) · empty · loading (skeleton) · the "needs-you/flagged" emphasis state. Resolved is out of scope for the canvas (the frame owns the verdict).

## Output per designer
`packages/web/src/pages/review/<Component>.tsx` + `<Component>.stories.tsx` (+ optional `<Component>.fixture.ts`). Story title `Review/<Name>`, `group: "Conversations"`, named export `Populated` (and others as useful). Reply with the file paths + the story title + 2 lines on how the render embodies the **3-layer drill-down** signature. Short status return.
