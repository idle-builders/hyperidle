# AL1 — Review across the whole spectrum (cross-functional synthesis)

Input to the parts-design. Maps what a reviewer needs when an agent takes over a task, across **Product, Sales, Marketing, Finance, Support, Operations** (parallel function studies, 2026-06-17). The finding: the review is a **constant skeleton + a domain-parameterized proof layer + a universal relevance principle + a universal risk taxonomy.** That *is* "review for anything."

---

## 1. The constant — the review skeleton (function-agnostic)
Every function's review is the same eight parts, in the same order of understanding:
1. **Outcome summary** — what the agent achieved, plain language. The lead.
2. **Intent & done-conditions** — what was asked; which conditions are met / not.
3. **Needs-you** — the few things blocking approval (gap · risk · over-authority · unresolved).
4. **Proof preview** — *the variable* (§2): the artifact shown as proof it worked.
5. **Rationale & assumptions** — the structured why + the assumptions, with confidence.
6. **Provenance** — where each figure / claim / change came from (§4, first-class).
7. **Conversation** — anchored discussion.
8. **Verdict + cost** — the 5 binding verdicts; tokens + $; what the action will spend/commit.

Only parts **4, 6** and the *contents* of **3** change by function. **1, 2, 5, 7, 8** are designed once and parameterized.

---

## 2. The variable — the proof-preview vocabulary
The proof is the artifact shown *as its consumer encounters it*. Seven kinds cover all six functions (extends the concept's five renderers — last column):

| Proof kind | "Show me it worked" = | Seen in | Concept renderer |
|---|---|---|---|
| **Rendered-in-context** | the asset as its recipient sees it: email-in-inbox, post-in-feed, landing/page, proposal/quote, KB article, the reply inside the ticket | Mktg, Sales, Support | `content_preview` |
| **Live / interactive** | the thing running: app at the changed screen, clickable prototype, a live dashboard | Product | (new — live preview) |
| **Visual before→after** | design/image/UI screen, the bug repro before vs after | Product, Mktg | `visual_comparison` |
| **Metrics that moved** | the figures that changed — deltas, changed cells, tie-out, KPI/forecast chart, pipeline numbers — relevance/materiality-ordered, each traceable | Finance, Product (experiments), Sales, Ops | `data_metrics` |
| **Record/field change-set** | structured before→after on records/fields: CRM fields, a discrepancy ledger, a dedupe merge, a 1,240-record backfill (sample + count) | Sales, Ops, Finance | (new — record diff) |
| **Action / operation** | *what it will DO*: commit total + blast-radius + reversibility/undo + exceptions — a PO batch, a reschedule, a refund, a mass send, a bulk-resolve | Ops, Support, Sales, Mktg-sends | `action_summary` |
| **Change-view, relevance-ordered** | ordered changes meat→trivia: code (logic→tests→formatting), a doc/SOP redline (substance→wording) | Product, Ops, Mktg, Finance(model) | `text_diff` |

**Cross-cutting container — Batch / per-item.** Half of all real agent work is a *set*: 41 tickets, a 7-line PO batch, a 5-touch sequence, 142 categorized transactions, 1,240 records. A batch view is its own pattern: relevance-sorted, the routine collapsed to "N like this," 3-5 samples shown in full, **approve-all-except-flagged**, per-item override. This is load-bearing and recurs everywhere — design it once.

---

## 3. Relevance-ordering — one principle, domain-weighted axis
Universal rule: **order by impact, lead with the meat, collapse the trivia, float the outlier/exception** — never by file/row/recency order. The *axis* is domain-supplied:

| Function | Relevance axis (meat → trivia) |
|---|---|
| Product | behavioral blast-radius — logic / migration / authz → tests → generated files, formatting |
| Sales | does-it-change-the-yes / is-the-number-right — offer · price · ask · the personalization line · recipient → boilerplate |
| Marketing | persuasion × audience-visibility × reversibility — hook · CTA · claim · audience · send-time → comma, alt-text |
| Finance | **materiality**, dual ($ and % of line) — the $50k swing → the $12 rounding |
| Support | blast-radius × reversibility × customer-heat — angry/VIP/money/legal/public → routine auto-resolves |
| Operations | consequence magnitude — $ committed × blast-radius × reversibility → low-$ identical records |

= **impact × visibility × reversibility, domain-weighted.** One ordering engine, a per-domain weight.

---

## 4. Needs-you — a universal risk taxonomy
"Risk" is the same six categories across every function; only the instances are domain-supplied. This makes the **needs-you** part constant and the contents pluggable:

1. **Irreversible / wide blast-radius** — send, commit, delete, migrate, pay, vendor auto-confirm, mass email.
2. **Over-authority / threshold breach** — discount > floor, refund > limit, PO > budget cap, journal > signing limit. *A hard gate, not a soft flag.*
3. **Unverified claim / factual error / no provenance** — marketing superlative, sales over-promise, support wrong answer, a finance number with no source.
4. **Unhandled exception / unmet intent item** — the gap; the unmatched record; the edge case left out.
5. **Shaky / unstated assumption** — esp. finance, but every function makes assumptions.
6. **Compliance / legal / policy / PII / safety** — every function.

---

## 5. Parts the spectrum forced to first-class (not niche)
- **Provenance / source-trace** — every figure, claim, or change links to its origin (GL row, CRM source line, KB clause, linked issue). Finance demands it; everyone benefits.
- **Authority / threshold gate** — when the action exceeds a limit, a *hard* gate routes upward; the reviewer sees limit · ask · delta.
- **Assumptions panel** — value · source · confidence · sensitivity (impact if ±). Sits with rationale, surfaced.
- **Blast-radius / reversibility / undo** — on any action-kind: who/what/how-many affected, reversible-within-window vs irreversible, the exact undo + its deadline.
- **Recipient / target context** — who/what this affects: the customer card (tier/ARR/sentiment/renewal), contact-safety (active/opted-out/competitor), audience/segment + size.
- **Claim / fact ledger** — extracted factual claims with verify status (a provenance flavor for prose).

---

## 6. The six flagship fixtures (the design test set — one per function)
Design every part against *all* of these, not just product.

- **Product** — *Fix expired-promo checkout bug (ISSUE-4821).* Proof: before/after running checkout + relevance-ranked diff (6 lines of 140) + green regression test + Sentry repro. Risk: touches payment path; user-facing dated copy. Cost ~$4.20 · 310k.
- **Sales** — *Northwind proposal + follow-up.* Proof: the email exactly as it sends (merged) + the $78,400 proposal rendered + CRM field before→after. Risk: 12% discount > 10% floor (authority gate); "go-live in 2 weeks" over-promise. ~$0.34 · 52k.
- **Marketing** — *Solo-plan launch email to 12,400.* Proof: inbox-row + opened render (mobile/desktop) + 5 subject variants side-by-side + CTA A/B + send plan. Risk: "set up in <5 min" unverified claim; 412 paid recipients to exclude. ~$0.62 · 38k.
- **Finance** — *May close: reconciliation + revenue roll-forward.* Proof: the moved numbers with changed cells + tie-out (Σ=control ✓) + 4 exceptions + per-figure provenance. Risk: $9,840 wire with no source; $4,200 duplicate ACH over auto-resolve authority. ~$0.42.
- **Support** — *Overnight sweep, 41 tickets.* Proof: triage table (4 flagged pinned, 18 auto-resolves collapsed) + bulk-resolve rule + samples + the reply rendered in-ticket. Risk: $48k-renewal churn-threat; $180 refund > $50 authority. ~$1.10.
- **Operations** — *Q3 winter reorder, US-East.* Proof: PO batch with on-hand before→after + $48,240 commit (96% of cap) + coverage chart + reversibility note. Risk: 2 POs auto-confirm (irreversible); batch at 96% of weekly cap. ~$0.14 · commits $48,240 real.

---

## 7. Implications for the design
1. **The proof preview is a *family* (7 kinds + the batch container), not "the diff."** Designing it well across functions IS the product. Lead the parts exploration here, and lead with the *non-code* kinds (rendered-in-context, action/operation, metrics-that-moved, batch).
2. **Outcome-summary, needs-you (risk taxonomy), relevance-ordering, provenance, authority-gate, assumptions, batch** are function-agnostic — design each *once*, parameterized, and prove it on all six fixtures.
3. **Then** the journey: how these layer into ≤3 sections (navbar + 2), where a proof preview goes full-screen vs. a right-pane-expand (16:9 app/image/dashboard needs the room; a triage batch or finance table is fine in a pane).

→ Next: design the **individual parts** against this spectrum, starting with the proof-preview family + the outcome-summary lead + needs-you, each rendered on more than one function's fixture.
