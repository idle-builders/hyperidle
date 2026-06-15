# AI7 — Design critique (reviewer, Phase 2)

**Verdict: 8.0 / 10 — APPROVED for the design substance.** This is a consolidation/ratification WP; judged as such. The scroll rule is correctly grounded in the verified `overflow-hidden` host fact, the primitive APIs cover every primary page's real header, and the rejected-directions list is disciplined. One WARNING on slot sufficiency edge cases; the gate-scope problems are architecture-layer (carried into the architecture critique, not design).

DESIGN-CLASS: routine (single ratified variant). Bar = "faithfully encode the de-facto standard, settle scroll cleanly, give an API every page can adopt without fighting it." Met.

## Ground-truth verification

| Claim | Verified | Result |
|---|---|---|
| AppShell page-host is `overflow-hidden` (forces internal scroll) | `AppShell.tsx:573` `mainContent` = `flex-1 flex flex-col overflow-hidden ... min-w-0` | TRUE — load-bearing fact holds. Pinned header is the only host-consistent rule. |
| `--tracking-caps-sm` exists (= 0.06em) | `tokens.css:97` `--tracking-caps-sm: 0.06em` | TRUE — token form is real; not a CRITICAL. |
| `SectionHeader` is a private Sidebar component | `Sidebar.tsx:127,133` `SectionHeaderProps` + fn — nav view-switcher | TRUE — rename to `SectionLabel` justified. |
| No DS `PageHeader`/`SectionLabel` export exists | grep DS src + web src — none | TRUE — names are clear. |
| WorkTeam/WorkRoutine scroll-away; titles `text-sm font-heading uppercase tracking-wider` | `WorkTeam.tsx:269`, `WorkRoutine.tsx:196`; roots `flex-1 overflow-y-auto` | TRUE. |
| AgentProfile section h2s `text-[11px] font-heading tracking-caps` | `AgentProfile.tsx:250,280,297,327,379` | TRUE — and `font-heading` count of 3 page files (vs spec's 2) is the correct correction. |
| KnowledgeCreate inline-style title | `KnowledgeCreate.tsx:134` `style={{fontSize:"20px"...}}` on `<input>` | TRUE. |

## Per-dimension scores

| # | Dimension | Score | Note |
|---|---|---|---|
| 1 | Problem fidelity | 9 | Encodes the exact de-facto standard verbatim; deviations enumerated and tied to verified line numbers. |
| 2 | Scroll rule soundness | 9 | Grounded in the `overflow-hidden` host, not taste. Genuinely consistent app-wide — every page MUST own internal scroll, so pinned is the only stable pattern. Correct. |
| 3 | Primitive API sufficiency | 7 | Slots (title/leading/subtitle/actions) cover all 10 pages' real headers. Two edge cases under-specified — see W1, W2. |
| 4 | Naming honesty | 9 | `SectionLabel` (label, not header bar) dodges the Sidebar collision and states its job. `PageHeader` renders semantic `<header>`. |
| 5 | Closure discipline | 9 | Slots open / typography+padding closed is the crux of AI7 and is explicit. `as`/`trailing`/`divider` are the only SectionLabel knobs. |
| 6 | Rejected-directions rigor | 9 | Combined `<Page>`, scroll-away, small-caps title, tile-label folding, always-on divider, new token — each rejected with a load-bearing reason. No re-litigation hooks left open. |
| 7 | AC5 re-grounding | 9 | Correctly retires "Playwright sweep" (dead per repo policy) and re-grounds on snapshot net + adoption gates + live viewer. This is the RIGHT call — flagging the Playwright absence would be wrong. |
| 8 | AG1 coordination | 7 | Correctly identifies PageHeader must drop above a page-owned body and the team body is AG1's. Merge-order risk acknowledged. But "header only on WorkTeam" interacts with 4+ return branches — see W3. |
| 9 | Migration completeness | 7 | All 10 named pages covered. Misses that `font-heading`/`tracking-wider` also live outside pages (the gate-scope problem) — design defers gate mechanism to architecture, so this lands there, but design's "zero occurrences in page files" framing under-states the blast radius. |

## Findings

### WARNING W1 — KnowledgeCreate title-as-`<input>` weakens the closure guarantee
The design routes the editable `<input>` through PageHeader's `title` ReactNode slot with title classes applied via className (concept open-question, resolved "no new prop"). Sound, but it means the title treatment now lives as a class string **on a page-owned input node**, not inside the primitive. The whole AI7 thesis is "title treatment exists only inside the primitive." This one page reintroduces the literal `text-[20px] font-[600] tracking-[-0.01em]` string in a page file — which is exactly what `no-handrolled-page-header` is meant to forbid. Design must state explicitly how the gate exempts this single legitimate case (or PageHeader exposes a `titleClassName`/`editable` affordance). Currently contradictory: the gate forbids the string the migration requires KnowledgeCreate to write.

### WARNING W2 — `subtitle` slot vs WorkBet/WorkTeam multi-element meta rows
Real WorkBet/WorkTeam headers carry compound meta (phase chip + lead avatar + status). `subtitle?: ReactNode` accepts arbitrary nodes so it technically fits, but the design shows subtitle as a single `mt-[3px] text-[13px] text-[var(--text-tertiary)]` line. If a page needs the status chip on the **title row** (actions) AND a meta line (subtitle) AND a leading breadcrumb, that's three slots — fine. But the "Phase: build · Lead: Dana" example renders fine only as text; an avatar+chip cluster in `subtitle` inherits the tertiary-text wrapper styling, which may fight. Confirm the subtitle wrapper doesn't impose color/size on rich nodes, or document that rich meta goes in `actions`/`leading`.

### NIT N1 — `divider` default-off documented as "de-facto majority" — verify
Design claims most pages have no divider on the section label. WorkTask/WorkBet pass `divider`. Accept, but the snapshot net will pin both variants regardless; low risk.

### NIT N2 — `as` default
Concept says default `h2`; approved.md + architecture say default `h3` (PageHeader title is the page `h2`). Approved.md/architecture are internally consistent (h3); concept Phase 1 line 38 says "h2 by default" — stale. Cosmetic doc drift; architecture's `h3` default is correct for document outline. Builder should follow architecture.

## Bottom line
Design substance is sound and faithfully consolidates. W1 is the one that can bite implementation (gate contradicts the KnowledgeCreate migration). W2/N2 are clarifications. None block the build provided architecture resolves the gate exemption (it does not yet — see architecture-critique CRITICAL C1).
