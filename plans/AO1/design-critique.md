# Design Critique: AO1 — Filesystem attach/inspect surface

Fresh evaluator (reviewer persona, separate from the producer). Scores re-derived from the rendered TSX + committed screenshots against the 9-dimension rubric, not echoed from `variants.md`. Concept/AC alignment audited against `plans/AO/concept.md`, `docs/process-layer/filesystem-primitive.md`, `plans/AO1/architecture.md`, and `TRACK-AO.md` AO1 ACs.

DESIGN-CRITIQUE: variant=a-settings-filesystems score=8/10  rounds=0  axes: H:9 S:9 T:8 C:9 Co:10 St:8 A:7 AS:9 PP:7
DESIGN-CRITIQUE: variant=b-inline-agent-config score=7/10  rounds=0  axes: H:9 S:8 T:7 C:8 Co:8 St:8 A:7 AS:8 PP:7
DESIGN-CRITIQUE: variant=c-connection-first-flow score=6/10  rounds=0  axes: H:7 S:7 T:8 C:8 Co:6 St:7 A:6 AS:7 PP:7

(Scores below 5 fail; 5–7 advance with findings; ≥7 advance clean. All three clear the floor. My re-derived totals track the producer's ordering — A > B > C — but I score A at 8 not 8.9 and C at 6 not 7.3; specifics below.)

---

## Per-variant scoring (re-derived)

### Variant A — Settings "Filesystems" section · 8/10

| Dim | Score | Evidence |
|---|---|---|
| 1 Hierarchy | 9 | Agent group caption → mono resource title → StatusChip reads cleanly left-to-right. `needs_attention` group floats to a second group with its own amber caption; severity sort (`bySeverity`, line 154) puts the attention row first within a group. Eye lands right. |
| 2 Spacing | 9 | All gaps on the 6px grid (`gap-[9px]`, `gap-[6px]`, `gap-[3px]`, `gap-[18px]`, `gap-[24px]`). `p-[24px]` page pad on-grid. `max-w-[760px]` matches the Settings convention. No off-grid value. |
| 3 Typography | 8 | Mono resource (13px) + mono `@branch` (11px tertiary) + Tag is correct. `h2` 20/600. One downgrade: `font-[var(--font-mono)]` is used where the DS convention is `font-[family-name:var(--font-mono)]` (see KeyValue.tsx:20) — works via Tailwind arbitrary property but is the non-canonical form. Minor. |
| 4 Color | 9 | StatusChip carries every state (healthy/behind/unknown) — color + label, never color-only. Amber=attention, green=reachable, grey=attached. Halation-safe (`--surface-page`, no `#000`). |
| 5 Coherence | 10 | This IS the AN1 grouped-list grammar (Row + ItemList contained + SectionLabel + StatusChip + Menu + Dialog) re-applied verbatim. Sibling to Connections — the strongest expression of Filesystem ⟂ Connection as matching Settings sections. Zero new shapes; KindMark is the AN1 ServiceMark inline precedent, lore-marked (line 22). |
| 6 States | 8 | Populated + needs_attention both rendered (AC5). Empty/loading/error correctly deferred to build (MEMORY: no skeleton/empty/error in initial designs). −1: the inspect depth the recommendation folds in from B is NOT present in this story — the row has no expand/inspect affordance at all. The recommendation describes it; the artifact doesn't render it (see CRITICAL-1). |
| 7 A11y | 7 | Row/ItemList/Menu a11y inherited. Menu has `label`; ghost button has `aria-label`. −: the `⋯` actions button uses a raw glyph as its only visible content with a manual `relative`-positioned Menu — fine, but the open/close is hand-rolled local state rather than a DS disclosure; focus return on Menu close is not guaranteed by the story. |
| 8 Anti-slop | 9 | Dense, purposeful, warm-toned, no card grid, no hero, no emoji-as-icon (KindMark `{ }`/`¶` are typographic marks, not emoji — AQ-105 safe). Reads like a real Settings section. |
| 9 Premium polish | 7 | Proven and unsurprising. No tabular-nums needed (no numeric columns). −: the inspect/expand interaction (the thing that would make it "premium" over plain Connections) is absent from the rendered artifact, so on its own the story is a competent-but-flat list. |

**Total: 8/10.** I dock the producer's 8.9 to 8 because the recommended design = A's list **plus B's inspect**, and A's story does not render the inspect — the headline artifact is incomplete relative to the recommendation it anchors (CRITICAL-1).

### Variant B — Inline on the agent's config panel · 7/10

| Dim | Score | Evidence |
|---|---|---|
| 1 Hierarchy | 9 | Agent identity (BB avatar + name + harness line) frames the panel; Role/Harness rows establish "this is the agent config surface"; Filesystems is a clearly-subordinate section. The expanded KeyValue grid reads as inspect detail. Good top-down flow. |
| 2 Spacing | 8 | On-grid throughout (`gap-x-[24px] gap-y-[9px]`, `px-[12px] pb-[12px] pt-[3px]`). −: the expanded card adds real vertical height; with the first card auto-expanded the section is taller than A for the same data. |
| 3 Typography | 7 | Row title mono is right. **But the KeyValue grid renders Resource (`acme/storefront`) and Branch (`main`) as 15px SANS** — `KeyValue` value is `text-[15px] text-[var(--text-primary)]` with no mono (KeyValue.tsx:23). The resource is mono in the row title and sans in the inspect grid two lines down — a same-datum typography inconsistency. The mono identity is the whole point of "resource"; the inspect grid loses it. See MAJOR-1. |
| 4 Color | 9 | StatusChip + amber `--status-warning` attention reason inline. Color=meaning holds. |
| 5 Coherence | 8 | Composes catalogued primitives. −: the FilesystemCard hand-rolls a bordered container (`border-[1.5px] border-[var(--border-subtle)] rounded-[var(--r-subtle)] overflow-hidden`) wrapping a Row + a grid — this is the settings-consistency "Card" treatment (settings-consistency.md §Card-vs-flat) reimplemented inline rather than via a primitive. Acceptable per that doc (a row containing a form/expansion = card), but it's bespoke chrome A doesn't carry, so the two variants' rows look different. |
| 6 States | 8 | Populated + needs_attention + the inspect-expanded state all shown. The richest single-attachment inspect. Empty/error deferred (correct). |
| 7 A11y | 7 | Inspect toggle is a labeled ghost button ("Inspect"/"Hide") — better than A's glyph. −: the expand has no `aria-expanded`/`aria-controls` wiring in the story; the grid appears/disappears with no association. |
| 8 Anti-slop | 8 | Dense, purposeful. −: three stacked bordered cards edge toward the "card list" look; the auto-expanded first card is a lot of chrome on first paint. |
| 9 Premium polish | 7 | The KeyValue inspect IS a genuinely nice touch conceptually — but as rendered it has the mono-loss bug (MAJOR-1) and the 2-col grid at `gap-x-[24px]` leaves Kind/State far apart with a lot of dead center space. Needs polish to earn "premium." |

**Total: 7/10.** The inspect idea is sound and is the right thing to fold into A — but B's *rendering* of it has a real typography regression (resource sans, not mono) that must not carry into the merged design.

### Variant C — Connection-first attach flow · 6/10

| Dim | Score | Evidence |
|---|---|---|
| 1 Hierarchy | 7 | Three stacked sections (Connection / Resource / Assign) all at similar weight in one pane; the left step-rail says "wizard" but the pane shows all three steps at once, so the eye is split and the "where am I" signal is weak. |
| 2 Spacing | 7 | On-grid, but airier than A/B (`gap-[24px]` between three full sections + a bordered Assign card). More whitespace for less scannable data. |
| 3 Typography | 8 | Mono repo names + Tag, consistent with A/B. Most body copy of the three (two help paragraphs + an inline explainer) but all on-scale. |
| 4 Color | 8 | StatusChip on connections; selected connection gets `bg-[var(--accent-primary)]` mark + `text-[var(--accent-primary)]` "Selected". Correct, but the most accent of the three. |
| 5 Coherence | 6 | Introduces a step-rail/wizard grammar **not used elsewhere in Settings** (settings-consistency.md lists 11 sections — none is a wizard). NavItem is repurposed from nav into a step indicator. Coherence cost is real. |
| 6 States | 7 | Connection-source reachability (AC5 at the source) + attached/selected/available repo states shown. But this is an *attach* surface only — it cannot answer "show me everything attached + its health," so a manage/list surface is still needed separately. |
| 7 A11y | 6 | **Concrete a11y concern:** repo Rows use `onClick` AND render `actions` (a "Select" Button / "Selected" span). Per Row.tsx:8 + :185, `onClick` + actions present → `div[role=button]` wrapping a nested `<button>` — a button-in-button. The connection Rows (line 130) do the same with a StatusChip in `actions` (non-interactive, so safer). The repo-row case nests an interactive control inside a `role=button`, which is the exact nested-interactive a11y smell the DS Row anatomy warns about. The producer flagged "clickable Rows as step targets need care"; this is that care, unaddressed. |
| 8 Anti-slop | 7 | A two-pane import wizard flirts with the "setup wizard" cliché (AESTHETICS screenshot tell territory), though it's restrained and warm-toned, not slop-grade. |
| 9 Premium polish | 7 | Slick but heavier; the Assign card + inline explainer are nicely done. |

**Total: 6/10.** I dock the producer's 7.3 to 6: the coherence cost (novel Settings grammar) and the nested-interactive a11y issue are more load-bearing than a 7 implies, and the signature step ("browse a connection's repos") is **aspirational** — it implies a capability AO1's contract lacks (see Concept/AC audit). Correctly rejected as primary.

---

## Recommendation verdict: **UPHOLD (A + B's KeyValue inspect), with conditions.**

A is genuinely the best expression of the concept:
- **Filesystem ⟂ Connection legibility:** A keeps the resource on the title-line (mono) and the Connection on the subtitle (`Auth via GitHub connection`) and write-back as a distinct clause — the two axes are visibly separate, never merged (concept hard rule 3). This is the cleanest reading of the ⟂ rule of the three, *and* it's reinforced structurally by living next to Connections in Settings.
- **Lowest learning cost:** it is the AN1 grammar verbatim. A founder who configured a Connection already knows this surface.
- **No new grammar:** zero new shapes; KindMark is the established ServiceMark inline precedent. C's wizard would add a grammar Settings doesn't have (coherence −2 vs A).

**Folding in B's KeyValue grid is sound, NOT a Frankenstein** — *provided* two things hold:
1. The inspect is rendered as A's row-expand (or a `GET /:id` detail), so A's fleet-scan and B's inspect-depth coexist on one surface. The merge is additive (a disclosure under an existing row), not a structural graft.
2. **The mono-loss in B's KeyValue rendering (MAJOR-1) is fixed in the merge.** If the resource/branch render 15px sans in the inspect grid while mono in the row title, the merged design has a same-datum typography inconsistency baked in from day one. Either render those values mono inside the grid (a `KeyValue` with a mono value variant, or wrap the value), or accept that `KeyValue` is the wrong primitive for identifier values and use a labeled mono pair.

Net: uphold A as the surface, fold B's inspect, reject C as primary. The "useful idea from C" (reachability surfaced at the connection) is already covered by A's per-row `needs_attention` — agreed, no need to re-litigate.

---

## Concept / AC alignment audit

| Check | Verdict |
|---|---|
| Surfaces **kind** | Yes — Tag (`code`/`doc_set`) on every row in all three. |
| Surfaces **resource** | Yes — mono title-line (repo@branch / folder path). |
| Surfaces **write-back** | Yes in A/B (`Write-back via git · commit → PR` / `via file · last write wins`). C states it inline only for the selected repo. A is clearest. |
| Surfaces **state** | Yes — StatusChip, all three. |
| Surfaces **needs_attention (AC5)** | Yes — all three render the missing-connection case as amber. A: severity-sorted + group caption + row subtitle. B: inline amber reason in row + inspect. C: at the connection source. **All satisfy AC5.** |
| Filesystem kept **distinct from Connection** | Yes — concept hard rule 3 honored. A/B put auth in subtitle/KeyValue, never merged into the resource. C makes the connection the *entry point* but still keeps resource separate. No variant collapses the two axes. |
| Renders **only populated real state** | Yes — all three render populated + needs_attention only; no skeleton/empty/error (MEMORY-compliant). |
| Does **NOT imply a capability AO1 lacks** | **A: clean. B: clean. C: VIOLATES.** C's step-2 "browse a connection's repos" (REPOS list, FilesystemAttachFlow.stories.tsx:65-69, "Available to attach") implies AO1 can **enumerate a connection's remote repositories**. AO1's architecture (§7, Q2, line 372) is explicit: **structural reachability only, NO live forge calls, AO1 never lists remote repos** (`resourceRef` is a *typed* repo/branch, not picked from a fetched list). C's signature interaction is **aspirational for v1** — correctly identified by the producer and correctly excluded. Confirmed: C's repo-browse is **rightly out of scope**; A's typed-Input attach (Dialog) is the contract-honest interaction. |
| `doc_set` modeled as bare local folder | Yes — A renders `~/vaults/product-notes` · `Local · no connection needed` · `Write-back via file` as a first-class healthy row. Concept/arch-correct (Q3: v1 doc_set = bare local folder). |
| **needs_attention default-state honesty** | Note for build, not a design defect: architecture §3 (WARN-3, line 264) discloses that in v1 — with no real `FilesystemAuthResolver` — **every connection-backed `code`+`git` filesystem permanently shows `needs_attention`**. The screenshots show only ONE needs_attention row (acme/marketing-site) while acme/storefront shows `REACHABLE` *with* a GitHub connection. That `REACHABLE` connection-backed row is **not achievable in v1 by the default binding** — it requires an injected resolver. The design is fine (it shows the post-AN steady state); but the builder must not be surprised when the real v1 app renders storefront as needs_attention too. Flagging so the design↔runtime gap is known, not silently assumed. |

**No variant invents a data field the wire `Filesystem` type lacks.** The fixture shapes (FilesystemView) mirror the architecture §1 type faithfully (`id/kind/resource/branch/writeback/state/connection`), with no token/secret ever in the shape (correctly noted in the A story header comment, lines 47-49) — honors AC2 (no credential surface).

---

## Open-question adjudication

**Q1 — Inspect depth: inline row-expand vs `GET /:id` detail panel.**
**Verdict: DECIDABLE NOW → inline row-expand.** Architecture exposes `GET /:id` so either binds; this is a UX call, not a contract fork. Inline-expand keeps the fleet-scan and the inspect on one surface (A's whole value), avoids a route transition for a 6-field read, and matches the in-codebase Settings precedent (Credentials catalog reveals inline below the Row, settings-consistency.md §AG6). A detail *panel* would only earn its keep if inspect grew heavy (history, sessions, materialization log) — none of which AO1 ships. **Pick inline; reserve `GET /:id` as the data source for the expand. Not a founder call.**

**Q2 — Attach-dialog agent-picker pre-fill.**
**Verdict: DECIDABLE NOW → per-group `+ Attach` pre-fills the agent; page-level button starts unfilled.** This is a pure affordance refinement with one obviously-correct answer (a group-scoped button that doesn't carry its group's context would be a bug). The current A story does NOT wire this — every `+ Attach` (page-level and per-group, lines 235/361) opens the same dialog defaulting to "Builder Bot" regardless of group. **Minor build-time fix, not a founder call.** Pre-fill from the group; reset for the page-level entry.

**Q3 — `doc_set` v1 = bare local folder as the rendered default.**
**Verdict: DECIDABLE NOW → yes, correct default.** Concept + architecture Q3 agree: no Drive/Obsidian Connection exists in v1, so a connection-backed `doc_set` is modeled-but-unexercised. A renders the local case as primary (`Local · no connection needed`), which is the only `doc_set` a v1 user can actually create. Showing a connection-backed folder as the headline would imply a capability that doesn't exist yet (same class of error as C's repo-browse). **Local-folder default is contract-honest. Not a founder call** — though the founder may *want* to see it confirmed, the design has no other defensible choice.

**Q4 — Settings vs Team/Work-view placement.**
**Verdict: GENUINELY THE FOUNDER'S CALL (the one real /human-design-review decision).** This is the load-bearing IA fork the brief itself names (brief.md Phase 0·2). The case for Settings is strong and consistent (Connections, Agents, Harnesses, Models all live there; Filesystem ⟂ Connection as sibling sections is the cleanest concept expression) — but the concept binds the filesystem to an *agent-within-a-team*, and B's "configure the agent where harness/model already live" is a legitimately different mental model (filesystem as an agent property, not a team-wide registry). Both are coherent; the choice is about where the founder thinks about "what this agent authors into." **This is exactly the kind of placement/IA fork MEMORY says to build-and-decide-via-human-review, not auto-resolve.** Park here for `/human-design-review` (DESIGN-CLASS = novel). The other three Q's do not need the founder.

---

## CRITICAL (must fix before founder inspects)

- **CRITICAL-1 — The recommended design's headline artifact does not render the inspect it recommends.** `approved.md` and `variants.md` recommend "A's grouped list + B's KeyValue inspect as an inline row-expand," but `SettingsFilesystems.stories.tsx` (the named design source of truth in approved.md:9) renders **no inspect/expand affordance** — the rows are static, the Menu only offers Re-select/Detach. The founder opening `#SettingsFilesystems` in the viewer will not see the recommended design; they'll see A-without-the-fold-in. Before `/human-design-review`, either (a) render the inline KeyValue expand in `SettingsFilesystems.stories.tsx` so the approved design is what's shown, or (b) explicitly point the founder at `#AgentFilesystemsInline` for the inspect half and annotate that the merge is "A's list + B's expand." (a) is correct — the founder must review the actual recommended surface, not two halves.

## MAJOR

- **MAJOR-1 — KeyValue renders identifier values as 15px sans, breaking same-datum mono consistency.** `AgentFilesystemsInline.stories.tsx:155-156` feeds `acme/storefront` (Resource) and `main` (Branch) into `KeyValue`, which renders the value `text-[15px]` sans (KeyValue.tsx:23). The same resource is mono 13px in the row title (line 126). When B's grid is folded into A (the recommendation), this inconsistency carries over. Fix in the merge: render resource/branch mono inside the inspect grid (don't use bare `KeyValue` for identifier values, or add a mono value treatment). This is the single thing that makes the fold-in a Frankenstein if left unfixed.
- **MAJOR-2 — Variant C implies remote-repo enumeration AO1's contract forbids.** Already correctly rejected as primary; recording it as a MAJOR so it is not partially-revived. C's step-2 repo list (the "available to attach" browse) cannot be built in v1 (architecture §7/Q2: no live forge calls, no remote repo listing). If any guided-first-attach is wanted later, it must be a thin entry into A's *typed-Input* dialog, never a fetched repo picker — until a WP adds forge listing with its own AC.

## WARNING

- **WARN-1 — `as Status` cast in A is unnecessary and slightly wrong.** `SettingsFilesystems.stories.tsx:187` casts `stateToStatus(fs.state) as Status`, but `stateToStatus` returns `Status | "unknown"` and `StatusChipProps.status` is `Status | "unknown"` (StatusChip.tsx:20, widened in AG7 W1). The cast narrows away the legitimate `"unknown"` and is the exact pattern settings-consistency.md §Allowed-exceptions wants removed (tracked as W1). Drop the cast; the value already matches the prop type. (Build-phase, not a design-review blocker.)
- **WARN-2 — Sibling state→status divergence between A and B.** A maps `attached → "unknown"` (neutral grey); B maps `attached → "paused"` (blue/info) (AgentFilesystemsInline.stories.tsx:86). Two variants of the same surface assign different colors to the same state. Per settings-consistency.md StatusChip table, `paused`/blue = transitional/in-progress and `unknown`/grey = absence. `attached` ("created, not yet checked") is closer to grey/unknown (A's choice) than blue/in-progress. **A is right; B is wrong.** Lock `attached → unknown` in the merged design.
- **WARN-3 — A's Menu disclosure is hand-rolled local state.** The `⋯` button toggles `menuOpen` via a local `useState` with a manual `relative` wrapper (lines 188-203) rather than the DS Menu's own trigger/disclosure. Focus-return-on-close and outside-click are not guaranteed by the story. Use the DS Menu's trigger pattern (as AN1's row-menu does) so a11y is inherited, not re-implemented.

## SUGGESTION

- **SUGG-1 — A's row glyph button needs a non-glyph fallback.** The `⋯` is the only visible content of the actions button. It has an `aria-label`, so screen-reader-safe, but consider the DS icon-button treatment for consistency with other Settings row menus.
- **SUGG-2 — B's auto-expanded first card is heavy on first paint.** Defaulting `FilesystemCard[0]` to `expanded` (line 218) is a story-demo choice to show the inspect; in the real surface, default-collapsed (expand on demand) keeps the fleet-scan density the recommendation prizes.
- **SUGG-3 — `font-[var(--font-mono)]` should be `font-[family-name:var(--font-mono)]`.** All three stories use the former; the DS canonical form (KeyValue.tsx:20) is the latter. Both render, but match the convention in the production component.

---

## What's working well

- **Concept fidelity is high across all three.** Every variant keeps Filesystem ⟂ Connection legible (resource vs auth as distinct visual axes), surfaces `needs_attention` as first-class (AC5), and renders only populated real state — the producer internalized the concept's hard rules and the MEMORY "no skeleton/empty/error in initial designs" rule. No variant invents a data field or implies a forbidden capability *except* C's repo-browse, which the producer itself flagged and excluded.
- **Variant A's coherence is the real win.** Re-applying the AN1 grouped-list grammar verbatim and seating Filesystems next to Connections is the single best decision here — it turns the abstract ⟂ rule into a concrete IA ("auth section, files section, side by side") at zero new-grammar cost. That is the cleanest possible expression of the concept, and it's why A deserves to be the surface.
