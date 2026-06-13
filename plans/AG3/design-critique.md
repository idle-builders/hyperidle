# Design Critique: AG3 — Bet authoring is block editing

DESIGN-CRITIQUE: variant=full-page-parity score=8/10  rounds=1  axes: H:9 S:8 T:8 C:9 Co:10 St:7 A:8 AS:9 PP:8

**Verdict: PASS (8/10).** Single-variant routine port. The decision — kill `BetCreateDialog`, mount the bet pitch in the verbatim `KnowledgeCreate` chassis at `work/bet/new` — is the correct, lowest-risk way to satisfy the founder's "exact same experience" demand. Verified against the screenshot and against the live code the design cites. Two WARNINGs and several SUGGESTIONs; none block. Findings below are about *edges the parity argument glosses over*, not about the chosen shape.

---

## Verification of load-bearing claims (done cold, against code)

| Claim | Verified | Evidence |
|---|---|---|
| `KnowledgeCreate` is a full-page create chassis to copy | YES | `KnowledgeCreate.tsx:112-263`: `flex flex-col h-full`, bordered header (breadcrumb + title + Cancel/Create pills), `max-w-[960px]` two-column body, bordered editor frame, scope aside. |
| Bet *edit* already has full-page `BodyEditor` + autosave | YES (with caveat — see W1) | `WorkBet.tsx:1431-1451`: `BodyEditor variant="full" minHeight="200px"` + `pitch-save-indicator` (Saving/Saved/Save failed). |
| `BetCreateDialog` is the cramped box being replaced | YES | `BetCreateDialog.tsx:108-191`: `Dialog size="md"`, `BodyEditor minHeight="160px"`, team `Select` (multi-team only), `bet-title-preview`. |
| Appetite currency-`Select`+number-`Input` shape exists | YES | `WorkBet.tsx:400-531` `AppetiteDialog`; `CURRENCY_CODES`, `scaleForCurrency` exported from `@hyperidle/shared`. |
| `Select`/`Input`/`BodyEditor` are real design-system exports | YES | `design-system/src/index.ts:38,66,110`. |
| `deriveTitleFromPitch(pitch, betId)` exists | YES | `packages/shared/src/format/bet.ts:42` (back-compat alias for `deriveTitle`). |

The chosen variant is faithful to a proven, shipped pattern. The screenshot (`full-page-parity/screenshot.png`) matches the spec: warm Hearth palette, system fonts, no AI tells, editor column dominant, commitments peripheral, accent Create top-right.

---

## CRITICAL

None.

---

## WARNING

- **[design/full-page-parity/spec.md; brief.md §"precise scope"] The "edit is already at parity" claim is true for *experience* but not for *chassis* — AC8 visual review may flag it.** Bet edit (`WorkBet.tsx:1431-1451`) renders the editor as a `<section data-testid="bet-pitch-section">` *inside the bet detail page* with `minHeight="200px"` and **no bordered editor frame** (`border-[1.5px] ... p-[18px]`). The new create page and `KnowledgeCreate` both use `minHeight="260px"` inside a bordered frame. So "create-bet ≈ create-knowledge" will hold, but "edit-bet ≈ edit-knowledge" is being asserted on a surface that is structurally a detail-page section, not a create-chassis clone. AC8 requires "the review finds the two experiences matching" with screenshots side-by-side. The design leans on "preserve untouched, just screenshot it" — if the reviewer in Phase 4 finds the edit frames visibly diverge (no frame, different minHeight), that AC fails on a surface the design declared done. → Make the architect/builder explicitly confirm what the knowledge *edit* surface (`KnowledgeDetail` edit mode) looks like and whether bet-edit genuinely matches it, OR scope AC3's "matching" to "both are full-page BodyEditor + autosave" rather than pixel-parity. Do not let "already done" hide an untested parity gap.

- **[brief.md §7; synthesis.md; concept §4] Re-introducing appetite at create reverses `@lore R2` with no recorded rationale.** `BetCreateDialog.tsx:18-19` (`@lore R2`) explicitly *removed* appetite from create per a prior spec decision: "appetite fields removed per spec. Submit payload no longer includes costAppetite." The AG3 design adds it back. The architecture notes the reversal but neither concept nor design states *why R2 removed it* or *why it is now correct to restore it*. AG3's own AC4 only requires "team, appetite can be set during creation" — so restoring it is in-scope — but a previously-removed field returning needs one sentence of justification so the next agent doesn't re-remove it in a future cleanup. → Add a `@lore` note in `WorkBetCreate` (and/or a line in synthesis) recording: R2 removed appetite from the cramped dialog; AG3 restores it because the full-page aside has room and AC4 + spec name it; API (`createBetSchema`) already accepts optional `costAppetite`.

---

## SUGGESTION

- **[spec.md §"States" — Submitting] No save-status / progress affordance beyond button copy.** Create's only in-flight signal is "Creating…" on the disabled button. Knowledge create has the same (acceptable). Fine — but note the edit surface has a richer "Saving…/Saved" indicator; the asymmetry (create = button copy only; edit = live indicator) is inherent to create-vs-edit and matches Knowledge. No change needed; flagging so Phase 4 doesn't read it as a missing state.

- **[spec.md §"Component composition" — single-team static line] Single-team renders "Team · \<name\>" as a static read-only line, not a `Select`.** Correct (matches dialog auto-resolve, AQ — no dead picker). But confirm the static line still reads as a *labelled commitment* (uppercase 12px/600 "TEAM" label + value), not just inline text, so the aside doesn't look empty/broken with one team. The screenshot shows multi-team-style "GR Growth" with a team badge — verify the single-team path renders with equal visual weight.

- **[spec.md §"Open questions" Q1] Cancel-when-dirty confirm punted to architect.** The old dialog guarded dismissal when `isDirty` (`BetCreateDialog.tsx:113`). Design recommends a lightweight confirm on Cancel-with-content but leaves it optional. Reasonable (abandon is structurally lossless). If omitted, ensure the abandon E2E (AC6) still proves no POST fires — losing typed content silently on a misclick is a UX regression vs. the dialog, even if data-safe. Lean toward keeping the confirm to match the dialog's prior behavior.

- **[spec.md §"Mobile"] Mobile stack relies on `flex-col under sm` but `KnowledgeCreate` body is a flat `flex gap-[24px]` with a fixed `w-[240px]` aside — no responsive collapse in the copied chassis.** `KnowledgeCreate.tsx:176` does NOT have an `sm:flex-col` / responsive switch; the aside is always `width: 240px` beside a `flex-1` editor. If the builder copies the chassis verbatim, the promised mobile single-column stack (spec §Mobile, AQ-005/AQ-015) will NOT happen for free — it must be added (`flex-col sm:flex-row` or similar). Flag for the architect: the parity copy does not include the mobile behavior the design promises. (This is a real divergence between the design's mobile claim and the chassis it says to copy verbatim.)

- **[spec.md — appetite empty state] "Leave blank for an uncapped bet" helper copy is honest and terse (good).** Confirm it renders as helper text (12px tertiary) not as a placeholder inside the number Input, so it survives focus.

---

## What's Working Well

- **Consistency: 10.** Copying the live `KnowledgeCreate` chassis verbatim is the maximal cross-surface consistency play — same header band, same two-column body, same editor frame, same Cancel/Create pills, same tokens. This is exactly the founder's demand ("exact same experience") executed literally rather than approximated.
- **Anti-slop / Hierarchy: editor column dominates, commitments peripheral in a 240px aside, Create is the single accent action top-right.** No hero, no gradient, no 3-col grid, no emoji, warm palette, system fonts. The derived-not-typed title (one intentional, well-justified divergence from Knowledge that honors the established bet contract) is the right call — recorded in synthesis #6.
- **Abandon handled structurally, not with cleanup.** Nothing POSTed until explicit Create ⇒ no half-bet by construction, and the server-side-draft-on-open alternative is explicitly rejected (synthesis #5). This is the correct model and directly satisfies AC5/AC6.

---

## Round 2 (re-critique of revised design, 2026-06-13)

DESIGN-CRITIQUE: variant=full-page-parity score=9/10  rounds=2  axes: H:9 S:9 T:9 C:9 Co:10 St:9 A:9 AS:9 PP:9

**Verdict: PASS (9/10). Both R1 WARNINGs resolved. APPROVED.** Verified the parity claim cold against both edit surfaces.

| R1 finding | Status | Evidence |
|---|---|---|
| WARNING 1 — "edit at parity" true for experience not chassis; AC8 review may flag frame divergence | **RESOLVED** | §"Scope clarification" `:13` now states both edit surfaces are frameless `minHeight="200px"` and scopes AC3 "matches" to experience-parity, NOT frame-identity, with explicit "do not add a frame." Verified cold: bet edit `WorkBet.tsx:1431-1451` and knowledge edit `KnowledgeDetail.tsx:823-833` are both bare `<div>` → `BodyEditor variant="full" minHeight="200px"`, neither framed. The side-by-side the Phase 4 reviewer judges is bet-edit ↔ knowledge-edit (both frameless), not bet-edit ↔ bet-create. The untested parity gap is closed. |
| WARNING 2 — appetite reverses @lore R2 without recorded rationale | **RESOLVED** | Component table appetite row `:34` records the restoration + "builder adds a `@lore` note recording why (see architecture.md task #3)." Resolved Q3 `:69` confirms API already accepts optional `costAppetite`, empty⇒omitted⇒uncapped. |
| SUGGESTION — mobile stack not in copied chassis | **RESOLVED** | §Mobile `:55-59` explicit implementation note: chassis has NO responsive collapse; mobile stack must be ADDED (`flex-col sm:flex-row`, `w-full sm:w-[240px]`), AQ-005/AQ-015 cited, do not retrofit KnowledgeCreate. |
| SUGGESTION — single-team static line could read as broken | **RESOLVED** | Component table Team row `:33`: single-team static line must read as labelled commitment (uppercase 12px/600 "TEAM" + value at equal weight to appetite group). |
| SUGGESTION — appetite helper must be helper text not placeholder | **RESOLVED** | Appetite row `:34`: "Leave blank for an uncapped bet" renders as 12px tertiary helper below the row, NOT placeholder, survives focus. |
| SUGGESTION — Cancel-when-dirty confirm punted | **RESOLVED** | Resolved Q1 `:67`: confirm on Cancel-with-content YES, browser-back not intercepted, tested under AC6. |

No remaining CRITICAL or WARNING. The chosen variant remains faithful to the shipped `KnowledgeCreate` pattern; every load-bearing claim re-verified against live code.
