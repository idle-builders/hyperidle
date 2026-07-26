# Design-owned register decisions

Source set: `plans/AU20/browser-validation-ledger.json`. Counts preserve its 14-register, 268-case primary partition. Populations are disjoint: **94 intentional moves + 58 stale tests/mocks + 23 known feature regressions + 93 unresolved = 268**. Runtime work is **116** cases: every known regression needs red-before-green correction, and every unresolved case needs isolated diagnosis/red proof. Only 152 move/stale cases authorize contract-aligned test correction, each with replacement lineage.

| Register | Cases | Move | Stale | Regression | Unresolved | Design outcome |
|---|---:|---:|---:|---:|---:|---|
| BR-WORK-ROUTES | 46 | 44 | 0 | 0 | 2 | canonical Work drill locked |
| BR-SETTINGS | 44 | 0 | 41 | 0 | 3 | stacked in-shell Settings locked |
| BR-KNOWLEDGE | 37 | 12 | 2 | 0 | 23 | create moved; retained capture/scope/signals/edit need proof |
| BR-ACCESS | 22 | 2 | 0 | 17 | 3 | 17 known AA/touch regressions; no exceptions |
| BR-CONVERSATIONS | 21 | 12 | 2 | 0 | 7 | chips/old shell retired; list/detail/send/dial-in retained |
| BR-NAV | 19 | 1 | 3 | 3 | 12 | stale routes plus 3 known keyboard/navigation regressions |
| BR-RESPONSIVE | 19 | 2 | 0 | 1 | 16 | 1 known theme regression; viewport matrix locked |
| BR-WORK-DETAIL | 14 | 5 | 3 | 0 | 6 | row anatomy moved; actions/session metadata retained |
| BR-ARTIFACT-BLOCK | 12 | 5 | 3 | 2 | 2 | 2 known block/action regressions plus retained states |
| BR-MESSAGES | 10 | 0 | 0 | 0 | 10 | Part/ReviewPage split governs diagnosis |
| BR-DIALOGS | 9 | 8 | 0 | 0 | 1 | top-level create retired; retained dialogs finite below |
| BR-AGENTS | 6 | 1 | 1 | 0 | 4 | old team route moved; placement/org retained |
| BR-ASSISTANT | 5 | 0 | 3 | 0 | 2 | old Settings selectors stale; overlay states retained |
| BR-STATUS | 4 | 2 | 0 | 0 | 2 | semantic vocabulary retained; formatter paints need proof |
| **Total** | **268** | **94** | **58** | **23** | **93** | **152 test corrections; 116 runtime obligations** |

## BR-WORK-ROUTES — canonical hierarchy, not Portfolio Canvas

**Contract.** `/work` is a team overview: zero teams → “No teams yet” + Setup; one team → redirect `/work/team/:id`; many teams → attention-sorted team rows. Team → bet → task/review is the drill. `/work/portfolio` redirects to `/work`; `/work/product/:id` redirects to `/work/team/:id`. New bet is `/work/bet/new` full page. ⌘/Ctrl+2 lands through `/work` and therefore honors the one-team redirect.

**Disposition guidance.** Portfolio/product/canvas/grid/team-pill assertions are intentional moves when their underlying outcome maps to overview/team rows, team-filter-free navigation, create, or detail. Do not restore deleted anatomy. The two runtime-open cases prove ⌘2 and current team→bet interaction independently.

**Representative proof.** 0/1/many-team fixtures; URL + title + rows; legacy redirects; create; team→bet; keyboard entry.

## BR-SETTINGS — stacked in-shell page

**Authority adjudication.** `docs/information-architecture/app-shell-always-present.md` owns page structure and explicitly names the shipped 13-section order; `docs/guides/user/settings.md` is a walkthrough and currently drifts by adding “Agent behavior” while omitting Models/Assistant from its summary table. For AU20 the IA contract wins. The guide needs a later documentation correction; implementation paint is not the adjudicator.

**Contract.** Footer gear opens Settings. Sidebar body becomes Settings navigation; main is a max-width stacked scroll page. Exact order: **Profile · Org chart · Models · Agents · Filesystems · Agent backends · Connections · Assistant · Appearance · Credentials · Notifications · Worker · Backend**. No Agent behavior section in AU20, avatar trigger, tab role, top-level modal, density selector, or backdrop dismissal. Escape/explicit close returns to prior view and restores focus to the footer gear.

**Disposition guidance.** Old avatar/dialog/tab selectors are stale. Credentials, Profile save, Appearance theme, Agents placement, Org chart, and other controls remain real capabilities and require independent request/persistence proof after canonical entry.

**Representative proof.** Footer entry, sidebar section jump, focus/close, Profile PATCH, Credentials paint, live theme persistence, no density control.

## BR-KNOWLEDGE — full-page primary creation, retained contextual capture

**Contract.** `/knowledge` has Curated/Triage, scope pills, search and sort. `/knowledge/new` is primary human create; in-context `KnowledgeCreateDialog` remains on host objects. Detail supports in-page edit, discussion, related items and `ScopeChangeDialog`. User scope shows Private; factory/practice are Shared; team/product are Team. Signals and sort vocabulary are relevance/recency/frequency; null signals use an em dash.

**Disposition guidance.** Tests expecting top-level create dialog are intentional moves only when remapped to `/knowledge/new`. Bet capture, scope/private semantics, signals, sorting, list/detail, edit and network mutations are retained and may not be deleted as “moved.” Runtime-open cases need isolated fixtures.

**Representative proof.** Curated/Triage + URL filters; full-page create; host capture; private/scope change; signals null/populated; detail edit autosave.

## BR-ACCESS — no exceptions to product floors

**Contract.** Canonical painted screens are Conversations list/detail, Work overview/team/bet/task, Knowledge list/detail/create, Settings open, Assistant open, ReviewPage and retained dialogs. Every text pairing meets 4.5:1; every interactive at ≤1024px is ≥44 CSS px; focus is visible; mobile inputs are ≥16px. Legacy routes are audited after redirect at their canonical destination, not as extinct layouts. There are no AU20 accessibility exceptions.

**Disposition guidance.** Route-only ambiguity may move the audit target, never waive the gate. Concrete axe/geometry failures on canonical paint are feature regressions.

**Representative proof.** axe + target geometry + screenshot for each canonical screen in light/dark; 1024 and 375 retained-dialog checks.

## BR-CONVERSATIONS — one list/detail reading surface

**Contract.** `/conversations` is a flat chronological queue with no visible filter chips; empty state starts a thread. `/conversations/:id` is `ConversationSurface` with shared Part rendering and composer. Reviews are read here but decided at ReviewPage through “Open review.” Dial-in uses D/button and a `SplitView`; it closes by D/button, not Escape. Legacy URLs replace to canonical routes and preserve history semantics.

**Disposition guidance.** Visible filter-chip and obsolete `ThreadShell` assertions are moved/stale. List rows, route navigation, empty state, send, Part rendering, legacy redirect history, and dial-in remain capabilities.

**Representative proof.** empty/populated queue, list→detail, legacy redirect/back, send, review link-out, dial-in split.

## BR-NAV — shell shortcuts, search, and standalone NotFound

**Contract.** ⌘/Ctrl+1/2/3 switches overview routes; ⌘/Ctrl+[/] controls history; ⌘K opens global search; bindings do not fire while typing. Escape closes Search and Settings as their contracts specify and restores focus. Search clear empties results; result activation uses canonical entity route. `*` renders standalone NotFound with a useful route home.

**Disposition guidance.** Old route/name selectors migrate, but shortcut/search/focus failures remain regressions until proven otherwise. Review verdict keyboard assertions inside Conversations are stale: verdict choice belongs to ReviewPage.

**Representative proof.** each key alone, input guard, focus return, query/clear/result URL, NotFound recovery.

## BR-RESPONSIVE — same product, finite viewport/theme matrix

**Contract.** No density modes. Representative widths: 1920 desktop, 1024 touch boundary, 768 narrow shell, 375 retained-dialog/mobile. Sidebar remains present at 768 according to current shell contract; content adapts without horizontal page overflow. Light/dark/system persist; live system preference updates without reload or white flash. Reduced motion is honored.

**Disposition guidance.** Retired surface snapshots migrate to canonical routes; geometry assertions tied to obsolete wrappers are stale. Live system-theme failure is a feature regression candidate. Screenshot updates require inspected canonical paint, never mass rebaseline.

**Representative proof.** canonical screen matrix across widths/themes, OS theme toggle, reload-flash observation, reduced-motion state.

## BR-WORK-DETAIL — current regions and real actions

**Contract.** Bet detail comprises breadcrumb, overflow actions, progress/cost stats, optional provenance, outcome, editable Block-derived description, task rows, artifacts and discussion. Task rows navigate to full task route, not a sheet. Pause/resume are retired; activate/kill remain. Sessions on task detail show title and agent where data exists.

**Disposition guidance.** Table/test-id/task-sheet/scope-browser anatomy is stale or moved. Description PATCH, task navigation, canonical bet paint, and session metadata remain runtime obligations.

**Representative proof.** detail paint; description autosave request/result; task route; active/kill; session metadata; missing optional metadata.

## BR-ARTIFACT-BLOCK — shared artifact/open/block grammar

**Contract.** Artifacts use shared preview/composition and `OpenTarget`; `preview=null` shows “Preview pending,” never fabricated thumbnail. Bet/knowledge bodies derive Blocks. Block actions expose retained Discuss/Share/Assistant attachment where context supports them. Orphaned message anchors visibly say “anchor lost”; missing destinations degrade safely.

**Disposition guidance.** Obsolete host test IDs/selectors migrate to semantic regions. Retained preview pending, share, attach, discuss and orphan semantics cannot be dropped.

**Representative proof.** preview null; artifact open; one Block discuss round trip; share/attach; orphaned anchor.

## BR-MESSAGES — Part rendering here, verdict decisions on ReviewPage

**Contract.** Plain messages render and round-trip in Conversation. Review request Parts expose “Open review”; no 5 verdict buttons or A/R/X/S/C/I/E verdict POSTs live in Conversation. ReviewPage owns decision vocabulary/actions. Resolved review returns as a resolved Part. Response errors provide retry; non-resolving async acknowledgement remains visible.

**Disposition guidance.** Tests asserting `RichMessageCard` with inline verdict buttons or verdict POST from Conversation are intentional moves/stale expectations and must map to two proofs: Conversation link-out/read state + ReviewPage decision. Plain message, response retry/ack, legacy payload projection, and resolved echo remain runtime obligations.

**Representative proof.** plain send; unresolved review link; ReviewPage verdict request; resolved echo; error→retry; async ack.

## BR-DIALOGS — only retained dialogs receive dialog proof

**Contract.** Bet and top-level Knowledge creation are full pages. AU20's finite retained families are:

| Family | Title · primary action | Cancel/Escape/focus return | 375px/overflow |
|---|---|---|---|
| KnowledgeCreateDialog | “New knowledge item” · “Create” | clean Cancel/Escape closes; dirty dismissal opens Keep editing/Discard guard with Keep editing focused; return to host Add knowledge | bottom sheet; body scrolls; no horizontal overflow |
| ScopeChangeDialog | “Change scope” · “Save” | clean Cancel/Escape closes; dirty dismissal uses same guard; return to scope action | bottom-anchored sheet; no horizontal overflow |
| AppetiteDialog | “Adjust appetite” · “Save” | clean Cancel/Escape closes; dirty dismissal uses same guard; return to appetite action | bottom sheet; fields scroll; footer reachable |
| ConsequencePreviewDialog | “Kill this bet?” · “Kill bet” | Cancel/Escape closes (not dirty); return to overflow trigger; empty reason keeps confirm disabled | bottom sheet; consequence/reason scroll; footer reachable |
| RoutineCreateDialog | “New routine” · “Create” | clean Cancel/Escape closes; dirty dismissal uses same guard; return to team Add routine | bottom sheet; form scrolls; footer reachable |
| AgentAddDialog | “Add agent” · “Create” | clean Cancel/Escape closes; dirty dismissal uses same guard; return to team/Settings Add agent | bottom sheet; team/model fields scroll; footer reachable |
| AddConnectionDialog | “Add a connection” · “Add” | Cancel/Escape closes (no dirty guard); return to Settings Connections add action | bottom sheet; credential fields scroll; footer reachable |

All trap focus while open, expose an accessible title, keep primary action in the footer, avoid horizontal overflow, and restore the invoking control. Only the first two own BR-DIALOGS IDs; the rest close the shared-family contract.

**BR-DIALOGS ID mapping.** Five `BetCreateDialog` IDs (desktop, 375px, dirty Escape guard, safe-default focus, keyboard discard) map to `/work/bet/new` full-page behavior and its navigation/unsaved-change proof. Two `KnowledgeCreateDialog` chrome IDs plus its 375px chrome ID remain on KnowledgeCreateDialog. The single `ScopeChangeDialog` 375px ID remains runtime-open on ScopeChangeDialog. No BR-DIALOGS ID maps to another family.

**Representative proof.** one shared chrome/focus/escape proof per retained family; ScopeChange at 375px.

## BR-AGENTS — direct profile plus Settings placement

**Contract.** Agent profile is `/agents/:id`. Team composition lives on `/work/team/:id`; old `/work/teams/:id` is not restored. Settings → Agents adds an agent with team placement; created agent appears in the list. Team creation automatically yields founder→team org edge; Settings Org chart displays it without manual add.

**Disposition guidance.** The old team URL is an intentional move. Placement/list/org-edge behaviors are retained and runtime-open.

**Representative proof.** team agent→profile; add form options; create/list persistence; auto org edge ID/name.

## BR-ASSISTANT — retained overlay, explicit response states

**Contract.** Sidebar search-row Assistant button opens a 360px bottom-right overlay. Opening moves focus to its composer. **Escape closes it**, the trigger button toggles it closed, and its explicit close button closes it; all three restore focus to the Assistant trigger. Outside click does not close it. States: welcome/empty, sending/thinking, reply, missing-key guidance, recoverable error. Settings Assistant persona and Agents system-prompt fields are rectangular textareas; assistant identity is not editable in the ordinary Agents table.

**Disposition guidance.** Settings tab-based selectors are stale. Thinking→reply and missing-key guidance remain runtime obligations; live-backend ownership belongs to architecture lane isolation.

**Representative proof.** open/focus/close, outside click, each response state, Settings field anatomy.

## BR-STATUS — one semantic vocabulary, context-appropriate date display

**Contract.** Shared `StatusChip`/formatters own labels; status is text plus color/shape, never color alone. Domain closed sets remain authoritative (e.g. bet draft/active/completed/killed). Invalid timestamps do not render a misleading em dash time chip; omit the chip or use the shared time placeholder where the component contract calls for one. Date-only “Created” metadata uses `MMM D, YYYY`; live/relative contexts keep their documented formatter.

**Disposition guidance.** Assertions on retired placements move to canonical surfaces. Vocabulary and invalid/date formatting remain runtime obligations.

**Representative proof.** one fixture per closed status, invalid timestamp, absolute date, live/relative time.

## Architecture handoff invariant

Architecture must consume **all 116 runtime obligations** (23 known regressions + 93 unresolved) and all 152 contract-aligned test corrections (94 intentional moves + 58 stale tests/mocks). It may refine unresolved causality but may not reclassify a known regression as migration or change interaction contracts without returning to design. Replacement tests must use stable case lineage and semantic outcomes, not reintroduce retired anatomy.
