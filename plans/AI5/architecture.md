# AI5 — Architecture (technical plan)

Inputs (fixed, do not re-litigate): `plans/AI5/concept.md`, `plans/AI5/design/approved.md`, `.pipeline/work-packages/TRACK-AI.md` §AI5.

## Required reading (builder must read before implementing)

- `packages/design-system/src/EmptyState.tsx`, `ErrorState.tsx`, `Avatar.tsx`, `Skeleton.tsx`, `Button.tsx`, `TabBar.tsx`, `index.ts`
- `packages/design-system/DESIGN.md`, `packages/design-system/src/tokens.css` (token `--accent-primary-dim`)
- `packages/web/src/utils/scope-labels.ts` (scope vocabulary authority)
- `.claude/rules/aesthetic-quality.md` (AQ-015 touch targets, AQ-008 no hardcoded color)
- `plans/AI5/concept.md` + `plans/AI5/design/approved.md`

## Boundary yields (verified against tree + progress files)

| Track | Status | What AI5 yields |
|---|---|---|
| **AG5** (dropdowns/Select/Menu) | **DONE** (merged: PR #273, ESLint `no-handrolled-select`) | Do NOT touch overflow-menu triggers or generic `<Select>`. ONE scope site is a `<Select>` today: `ScopeChangeDialog:162` — ScopePicker replaces it with the pill group (this is AI5's scope-picker AC, sanctioned by concept; not an AG5 dropdown). The OTHER three scope sites are already hand-rolled pill `radiogroup`s (NOT Selects) — see corrected inventory below. All overflow triggers carrying `aria-haspopup="menu"` (verified `KnowledgeDetail:412`, `WorkBet:955`) feed an AG5 Menu and STAY a `<button>` — touch-target repair only, no `<Button>` swap. |
| **AG6** (item-row/table primitive) | **NOT STARTED** (no progress file) | Do NOT migrate `KnowledgeList`'s inline `KnowledgeListRow` (line ~200, explicitly replaces DS `KnowledgeRow`) nor `NotificationPopover`'s inline notification row (reimplements DS `NotificationRow`). Both are **rows** → AG6 owns. The spec named these; they YIELD. |
| **AG7** (Settings consistency) | **NOT STARTED** (no progress file) | Do NOT touch any file under `packages/web/src/settings/` or Settings panes. |
| **AI4** (one status language / live-pulse) | merged baseline | **Live-dot allowlist (verified, exactly 3 — do NOT touch, do NOT convert to Skeleton):** `Conversations.tsx:316` (6×6px `rounded-full bg-[var(--accent-primary)] animate-pulse`), `SessionActivityPanel.tsx:198` (5×5px), `RecipientPicker.tsx:200` (5×5px, inside the "Live" pill). These are the ONLY `animate-pulse` survivors AC3's grep gate allowlists — see AC3 row. |
| **AI2** (dialog) | merged | Dialog footer `btn btn-xs btn-ghost/primary` inside `Dialog` surfaces are dialog chrome. AI5 migrates them to `Button` **only where it doesn't fight the Dialog footer contract** — see Button task; default is migrate, but keep `min-h-[44px]` and Dialog `footer` slot wiring. |

**Net effect of yields:** the two spec-named row reimplementations (KnowledgeList, NotificationPopover) are explicitly OUT for AI5 — they belong to AG6. AI5's row work is therefore the avatar/button/state/scope atoms *inside* whatever rows exist, not the row container.

---

## Plan reconciliation (spec ⇆ verified tree)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "scope-picker copy-paste in 4 files" | **Re-verified against tree (CC-007 correction): 3 hand-rolled pill `radiogroup`s + 1 `<Select>`, NOT 2+2.** Pill rows: `KnowledgeList:599` (filter, testid `scope-pill`), `KnowledgeCreate:220` (create, testid `scope-pill-create`), **`KnowledgeCreateDialog:192` (create, testid `scope-pill-dialog`) — ALREADY a pill row, hardcodes `rgba(22,118,79,0.08)` at :213, it is NOT a `<Select>`**. Only `<Select>`: `ScopeChangeDialog:162` (no pill testid today). All 3 pill rows carry `data-active` + `aria-checked` + the hardcoded rgba tint. TaskSheet radiogroup is *request-intent*, not scope → out. | ScopePicker primitive replaces all 4. THREE migrate from hardcoded pill rows (tint-bypass consolidation); ONE (`ScopeChangeDialog`) migrates from `<Select>` to the pill group. Each preserves its existing testid prefix + `data-active`/`aria-checked` attrs (tests assert them). |
| `Skeleton` single-bar primitive | DS exports only `SkeletonList`/`SkeletonCard`. No `Skeleton` export. `BlockRefEmbed` + `ArtifactThreadsSummary` need single bars. | **Add** `Skeleton` single-bar export (design open-Q1 resolved: export it). |
| `Avatar` "3 of 16 sites" | Verified adopted: `AgentEditDialog`, `WorkTeam`, `AgentProfile`. Bypasses: `WorkTeam:802` (24px member chip), `WorkBet:1141`, `RecipientPicker:187,219`. **Inventory is CLOSED, not narrowed-by-abandonment:** the spec's "~16" was the original review's loose count; the other ~10 implied sites (Sidebar nav, NotificationPopover urgency dots, SetupFlow) were checked and are either not-an-avatar (Sidebar/NotificationPopover render no identity chip) or intentional-keep. SetupFlow grep shows only focus-shadow rgba, no avatar chip. | Migrate the 3 bypass sites + `deriveInitials`. |
| NotificationPopover avatar bypass | NotificationPopover uses urgency **dots**, no person avatar. No Avatar bypass there. | Drop from Avatar list; its row reimpl yields to AG6. |
| "4 initials variants" | **Re-verified: 3 distinct algorithms, not "4 variants of slice".** (a) `.slice(0,2).toUpperCase()` — `WorkTeam:610`, `AgentEditDialog:139`, `AgentProfile:129`; (b) bare `.slice(0,2)` no uppercase — `RecipientPicker:188,220`; (c) **word-initials** `split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()).join("")` — `WorkBet:1145`. | `deriveInitials(name)` unifies to the canonical **slice(0,2)** algorithm (see E5). RecipientPicker gains uppercase (cosmetic, same data). **WorkBet's rendered initials change** from word-initials to slice — e.g. team "Growth Team" → "GT" becomes "GR". Documented intentional consolidation per AC1 "identical rendering everywhere"; flagged in AC1 visual review. |
| `SessionActivityPanel` raw DaisyUI tabs | Verified `tabs tabs-bordered tabs-xs` at line 233. `TabBar` exists. | Migrate to `TabBar`. |
| 24px triage / 32px overflow touch targets | Verified: triage `KnowledgeList:331,356,381` (24px), `SessionActivityPanel:213` (24px); overflow `KnowledgeDetail:412`, `WorkBet:955` (32px, both `aria-haspopup="menu"` → AG5 Menu triggers). | Touch-target repairs ride along (AQ-015) via the `min-h-[44px] xl:min-h-[<dense>]` mechanism (see Touch-target repairs §). **Overflow triggers stay `<button>` — hit-area expansion ONLY, no `<Button>` swap** (would breach AG5). |
| AC1 "presence signal" (identity identical incl. presence) | Verified: `Avatar.tsx` exposes `size` + `agent` (forest-green chrome) only — NO presence/online affordance. Presence lives OUTSIDE the chip: `RecipientPicker:200` renders a separate "Live" pill; `SessionActivityPanel:196` a "Live session" pill; both are AI4 live-dots. | **Decision: presence is OUT of Avatar's scope** — Avatar stays a dumb identity renderer (concept rejection list: derivation/affordances live outside the chip). AC1's "presence signal" is satisfied by the existing per-surface AI4 live pills, which AI5 does not touch. NO 4th Avatar extension. See AC1 verification row. |

---

## Primitive extensions (exact API)

### E1 — `Skeleton` single-bar (new DS export)
`packages/design-system/src/Skeleton.tsx` — add:
```ts
export interface SkeletonProps { width?: string; height?: string; ariaLabel: string; className?: string; dataTestId?: string; }
export function Skeleton(props: SkeletonProps): JSX.Element
```
Uses the existing `SKELETON_BAR` const (the `--accent`-free `animate-[skeleton-pulse_1.8s...]` animation). Default `height="32px"`, `width="100%"`. Export from `index.ts`. Stories: add `SingleBar`, `SingleBarNarrow`.

### E2 — `EmptyState` `compact` prop
`packages/design-system/src/EmptyState.tsx` — add `compact?: boolean` (default false). When true: `p-[18px]`, no `max-w`, no 48px icon block (optional inline 16px icon before title allowed), title 15px/600, description 13px `mb-[12px]`. Per `approved.md` Decision 1 table. Stories: add `Compact`, `CompactWithAction`.

### E3 — `ErrorState` `compact` prop
`packages/design-system/src/ErrorState.tsx` — add `compact?: boolean`. When true: `p-[18px]`, no `max-w`, **no shadow**, `surface-page` (not elevated), no 48px icon block, 15px title / 13px desc, retry pill `px-[12px] py-[7px]` with `min-h-[44px] xl:min-h-[30px]` (AQ-015 touch floor ≤1024px, dense inline ≥1280px — same mechanism as ScopePicker pills, see approved.md touch note), detail mono block 12px. Stories: add `Compact`, `CompactWithRetry`.

### E4 — `ScopePicker` (new DS Tier-1 primitive)
`packages/design-system/src/ScopePicker.tsx`:
```ts
export interface ScopePickerOption { id: string; label: string; disabled?: boolean; }
export interface ScopePickerProps {
  options: ScopePickerOption[];
  value: string | null;            // active id; null = "All" (filter mode)
  onChange: (id: string | null) => void;
  mode?: "select" | "filter";      // default "select"
  ariaLabel: string;
  disabledTitle?: string;          // tooltip for disabled pills (single string — closure: only "team" is ever disabled, one reason)
  testIdPrefix: string;            // REQUIRED. Per-pill testid = `${testIdPrefix}-${id}`. One of the 4 mapped prefixes below — preserves every behavioral test.
  dataTestId?: string;             // container testid (e.g. "knowledge-scope-pills")
}
export function ScopePicker(props: ScopePickerProps): JSX.Element
```
- `role="radiogroup"`; each pill `role="radio"` + `aria-checked`. Per-pill **`data-testid={`${testIdPrefix}-${id}`}` AND `data-active={isActive ? "true" : "false"}`** — both are asserted by existing tests; ScopePicker MUST emit both unchanged.
- Active = `bg-[var(--accent-primary-dim)]` + `border-[1.5px] border-[var(--accent-primary)]` + `text-[var(--accent-primary)]`. Inactive = transparent + `border-[1.5px] border-[var(--border-default)]` + `text-secondary`. Disabled = inactive + `opacity-40 cursor-not-allowed` + `aria-disabled`.
- **Focus (NEW — design WARNING fix):** each pill `focus-visible:outline focus-visible:outline-[2px] focus-visible:outline-[var(--accent-primary)] focus-visible:outline-offset-[2px]` (Button's convention, `clickable.ts`). The hand-rolled pills ship `outline:none` today — migrating MUST add this ring (fixes a latent a11y defect).
- Pills `px-[12px] py-[4px] rounded-[var(--r-pill)] text-[12px] font-[500]`, container `gap-[6px] flex-wrap`. **Touch target (mechanism pinned — see below):** `min-h-[44px] xl:min-h-[24px]`.
- In `mode="filter"`: the "All" option (id with `filterKinds=null`) is active when `value === null`.
- **`--accent-primary-dim` resolves the hardcoded `rgba(22,118,79,0.08)`** at the 3 pill sites (the 4th, ScopeChangeDialog, is a Select with no tint literal).
- Stories: `FilterMode`, `SelectMode`, `WithDisabledOption`, `Focused` (focus ring visible), `MobileTouchTarget` (1024px frame, 44px verified).

**testIdPrefix mapping (all 4 call sites — pin each, or tests break):**

| Call site | `mode` | `testIdPrefix` | container `dataTestId` | existing tests that assert it |
|---|---|---|---|---|
| `KnowledgeList:599` (filter) | `"filter"` | `"scope-pill"` | `"knowledge-scope-pills"` | `U9-knowledge-scope-pills.test.tsx`, `AD6-knowledge-simplification.test.tsx`, `W3-knowledge.test.tsx` |
| `KnowledgeCreate:220` | `"select"` | `"scope-pill-create"` | — | `KnowledgeCreate.af13.test.tsx`, `AD6-knowledge-simplification.test.tsx` |
| `KnowledgeCreateDialog:192` | `"select"` | `"scope-pill-dialog"` | — | `AD3-KnowledgeCreateDialog-scope.test.tsx` |
| `ScopeChangeDialog:162` (was `<Select>`) | `"select"` | `"scope-pill-change"` (NEW — none today) | — | none today; new behavioral test may be added in red phase |

> **Touch-target mechanism (design WARNING fix — DO NOT use bare `min-h-[44px]`):** naive `min-h-[44px]` on a `py-[4px]` pill makes a 44px-tall lozenge with huge gaps and breaks the dense row + AC4 desktop/mobile parity. The canonical Hearth mechanism (`Select.tsx:44` `@lore AG5 fix-1`) is `min-h-[44px] xl:min-h-[24px]`: the 44px floor holds up to and **including** 1024px (Tailwind `lg:` = `min-width:1024px` applies AT 1024 and would prematurely shrink, so use `xl:` = 1280px+ to restore dense height). The AQ-015 gate is the K8 e2e (`packages/web/e2e/touch-targets.spec.ts`) measuring `getBoundingClientRect()` at viewport **1024px** with a fine pointer — therefore `[@media(pointer:coarse)]` would NOT satisfy the gate and a pseudo-element `::before` overlay is harder to verify; the viewport `xl:` override is the proven, gate-passing approach. Desktop (≥1280px) renders the dense 24px pill (AC4 parity preserved); 1024px and below render the 44px touch row.

> **NOTE for builder:** `scope-labels.ts` keeps owning the option vocabulary. ScopePicker maps `SCOPE_PILL_OPTIONS`/`SCOPE_CREATE_OPTIONS` → `ScopePickerOption[]` at each call site (one-line `.map`). The locked-scope display in `KnowledgeCreateDialog` (`lockedScopeKind`, :186–189) stays a read-only `Tag`/span — NOT ScopePicker.

### E5 — `deriveInitials` shared utility
`packages/web/src/utils/initials.ts`:
```ts
// Canonical algorithm: trim → first 2 chars of the trimmed string → uppercase. NOT word-initials.
//   deriveInitials("Ada Lovelace") === "AD"   (slice, not "AL")
//   deriveInitials("  x ")        === "X"
//   deriveInitials("")            === "?"
export function deriveInitials(name: string): string
```
**Canonical algorithm = `slice(0,2)`** (the dominant form across 5 of 6 sites). Chosen over word-initials because it is the majority behavior and AC1 demands one identical rendering everywhere.

**Sites whose rendered initials change (must be in AC1 visual review):**

| Site | Current algorithm | Current output (e.g. "Growth Team") | After `deriveInitials` | Delta |
|---|---|---|---|---|
| `WorkBet:1145` | word-initials `split→w[0]` | "GT" | "GR" | **CHANGES** — intentional consolidation, document in PR + AC1 review |
| `RecipientPicker:188,220` | bare `.slice(0,2)` (no upper) | "gr" | "GR" | case-only (gains uppercase) |
| `WorkTeam:610`, `AgentEditDialog:139`, `AgentProfile:129` | `.slice(0,2).toUpperCase()` | "GR" | "GR" | none (identical) |

Unit-tested (the four cases above + the WorkBet delta). Lives in `web`, not DS — DS `Avatar` stays a dumb renderer taking pre-derived `initials`, per concept rejection list.

---

## Bypass-site inventory (builder checklist — verified file:line)

### Avatar (migrate to `<Avatar>` + `deriveInitials`)
- [ ] `pages/WorkTeam.tsx:802` — 24px member chip `w-[24px] h-[24px] rounded-full … text-[9px]`, **hardcodes `background: "rgba(22,118,79,0.08)"` at :803** → `<Avatar size="sm" agent>` (closest size sm=28px; confirm visual; member chip). The Avatar migration removes this tint literal; if any wrapper still needs the tint, use `--accent-primary-dim`.
- [ ] `pages/WorkBet.tsx:1141` — `w-[28px] h-[28px] rounded-full bg-surface-container text-[11px]` + `.slice(0,2)` at 1146 → `<Avatar size="sm" initials={deriveInitials(name)} />`.
- [ ] `components/RecipientPicker.tsx:187` (list) + `:219` (selected) — `w-[28px] h-[28px] rounded-full … uppercase` + `.slice(0,2)` (186,220) → `<Avatar size="sm" initials={deriveInitials(name)} />`.

### Initials derivation (replace with `deriveInitials`)
- [ ] `pages/WorkTeam.tsx:610`, `pages/AgentEditDialog.tsx:139`, `pages/AgentProfile.tsx:129` — already `<Avatar>` callers; swap the local `.slice(0,2).toUpperCase()` for `deriveInitials(name)`.
- [ ] `pages/WorkBet.tsx:1146`, `components/RecipientPicker.tsx:186,220` — covered by Avatar migrations above.

### Button (migrate hand-rolled + DaisyUI `btn` → `<Button>`)
Hand-rolled pill buttons (NOT dialog footers, NOT AG5 menus):
- [ ] `pages/KnowledgeDetail.tsx:705,713,783` (action pills). **NOT `:412`** — that is an AG5 menu trigger (`aria-haspopup="menu"`), touch-target only, see below.
- [ ] `pages/KnowledgeList.tsx:1078,1113` (accent pills).
- [ ] `pages/KnowledgeCreate.tsx:154,163` (Cancel/Create pills).
- [ ] `pages/Conversations.tsx:310,507,541` (pill buttons).
- [ ] `pages/NotFound.tsx:39,43` (BTN_CLASS constants → `<Button variant>`).
- [ ] `pages/WorkPortfolio.tsx:305,340` — **multi-select toggle filters** (`Set` add/delete, `aria-pressed`) → NOT ScopePicker (ScopePicker is single-select radiogroup). Migrate to `<Button>` only if button-role-appropriate; if Tag-shaped, leave + justify (builder judgment on the Button shape). **Independent of that: see mandatory tint sweep below — `:307` and `:342` hardcode the rgba and MUST be swapped to `--accent-primary-dim` regardless of the Button decision.**
- [ ] `components/CurationSuggestionCard.tsx:46,54` (`btn btn-xs btn-primary/ghost`).

DaisyUI `btn` sites — migrate where they're standalone action buttons; **KEEP** where they are: (a) Dialog footers in AI2 surfaces, (b) overflow-menu triggers feeding AG5 Menu. Builder verifies each:
- Candidate migrate: `WorkTeam:256,725`, `WorkRoutine:179,250,259,271,280,291`, `AgentProfile:146,225`, `WorkPortfolio:246,410`, `WorkBet:322,330,466,474,1049,1294,1372,1380`.
- KEEP (dialog footer / AG5 menu trigger): `KnowledgeCreateDialog:135,143`, `ScopeChangeDialog:138,146`, `BetCreateDialog:119,127`, `RoutineCreateDialog:136,144`, any `btn-ghost btn-xs` that is the trigger of an AG5 `<Menu>`. **Builder must grep each btn site's surrounding context and record migrate/keep + reason in the PR.**

### Skeleton (migrate to `Skeleton`/`SkeletonList`)
- [ ] `components/ArtifactThreadsSummary.tsx:35` — `animate-pulse h-4 …` → `<Skeleton height="16px" width="33%" ariaLabel="Loading discussions" />`.
- [ ] `components/BlockRefEmbed.tsx:45` — `h-[32px] … animate-pulse` → `<Skeleton height="32px" ariaLabel="Loading block reference" />`.
- DO NOT touch live-pulse dots (AI4 yield).

### EmptyState / ErrorState compact (adopt compact variant)
- [ ] `components/ArtifactThreadsSummary.tsx:83` — `No artifact discussions yet.` → `<EmptyState compact title="No discussions" description="…" />`.
- [ ] `components/SessionActivityPanel.tsx:269` — `No activity yet` → `<EmptyState compact … />`.
- [ ] `components/BlockRefEmbed.tsx` error/missing rows → `<ErrorState compact … />` (verify copy parity).

### TabBar (migrate raw DaisyUI tabs)
- [ ] `components/SessionActivityPanel.tsx:233` — `tabs tabs-bordered tabs-xs` → `<TabBar>` (All | Tools | Reasoning | Cost). Preserve `activeFilter` state + `aria-selected`.

### ScopePicker (replace 4 forks — 3 pill rows + 1 Select)
- [ ] `pages/KnowledgeList.tsx:599` — filter pill row (hardcodes rgba :619) → `<ScopePicker mode="filter" testIdPrefix="scope-pill" dataTestId="knowledge-scope-pills" ariaLabel="Filter by scope" …>`. Preserve `knowledge-scope-indicator` sr-only span (:630).
- [ ] `pages/KnowledgeCreate.tsx:220` — create radiogroup (hardcodes rgba :241) → `<ScopePicker mode="select" testIdPrefix="scope-pill-create" ariaLabel="Scope" disabledTitle="Join a team to use team-scoped knowledge" …>`.
- [ ] `pages/knowledge/KnowledgeCreateDialog.tsx:192` — **ALREADY a create pill row** (hardcodes rgba :213, testid `scope-pill-dialog`) → `<ScopePicker mode="select" testIdPrefix="scope-pill-dialog" ariaLabel="Scope" disabledTitle="…" …>`. Keep the `lockedScopeKind` read-only span branch (:186–189) unchanged — only the `:191` else-branch (the pill `radiogroup`) becomes ScopePicker.
- [ ] `pages/knowledge/ScopeChangeDialog.tsx:162` — the ONLY `<Select>` → `<ScopePicker mode="select" testIdPrefix="scope-pill-change" ariaLabel="Scope kind" disabledTitle="…" …>` (AC requires the pill group everywhere; replaces the AG5 Select **only for scope**, per concept — scope-picker is AI5-owned). New testid prefix `scope-pill-change` (none exists today); red-phase may add a behavioral test asserting it.

### Tint sweep (AQ-008 — swap `rgba(22,118,79,0.08)` → `var(--accent-primary-dim)` everywhere)
Verified literals in tree (`grep "rgba(22,118,79,0.08)"`, excluding tests). The ScopePicker migration removes the 3 scope-site literals; these remaining sites are **independent mandatory swaps** — do NOT leave to builder judgment:
- [ ] `pages/WorkPortfolio.tsx:307` and `:342` — toggle-filter active class `bg-[rgba(22,118,79,0.08)]` → `bg-[var(--accent-primary-dim)]`. Independent of the Button-shape decision.
- [ ] `pages/WorkTeam.tsx:803` — inline `style={{ background: "rgba(22,118,79,0.08)" }}` → removed by Avatar migration (or `--accent-primary-dim` if a tint wrapper remains).
- [ ] Scope sites (`KnowledgeList:619`, `KnowledgeCreate:241`, `KnowledgeCreateDialog:213`) — removed by ScopePicker migration (ScopePicker uses the token internally).
- **AC4/AC2 grep gate:** after the sweep, zero `rgba(22,118,79,0.08)` literals remain in `packages/web/src` source (tests excluded).

### Touch-target repairs (AQ-015 — mechanism: `min-h-[44px] xl:min-h-[<dense>]`)
The K8 gate (`packages/web/e2e/touch-targets.spec.ts`) measures `getBoundingClientRect()` at viewport **1024px**. Tailwind `lg:` = `min-width:1024px` applies AT 1024 and would prematurely shrink — use `xl:` (1280px+) to restore the dense visual so the 44px floor holds up to and including 1024px (`@lore AG5 fix-1`, `Select.tsx:44`).
- [ ] Triage 24px: `KnowledgeList.tsx:331,356,381`, `SessionActivityPanel.tsx:213` → `min-h-[44px] min-w-[44px] xl:min-h-[24px] xl:min-w-[24px]`. Visual 24px glyph preserved at desktop. (`<Button>` icon variant acceptable ONLY if these are plain action buttons, not menu triggers — verify each.)
- [ ] **Overflow 32px (AG5 menu triggers — hit-area ONLY, NO `<Button>` swap):** `KnowledgeDetail.tsx:412`, `WorkBet.tsx:955` both carry `aria-haspopup="menu"` → they feed an AG5 Menu. Stay a `<button>`; add `min-h-[44px] min-w-[44px] xl:min-h-[32px] xl:min-w-[32px]`. Converting either to `<Button>` would breach the AG5 boundary — do NOT.
- [ ] `AssistantOverlay.tsx:355`, `AssistantAttachButton.tsx:38` (24px) — confirm/repair with the same `min-h-[44px] xl:min-h-[<dense>]` mechanism if ≤1024px reachable.

### Documented-intentional bypasses — STAY (do NOT migrate; preserve lore)
- [ ] `shell/Sidebar.tsx` raw nav buttons — E2E selectors + density per its `@lore`. **KEEP.**
- [ ] `shell/HostThreadSection.tsx:246` empty state — `role="status"` conflict with surrounding live region (lore at line 246–258). **KEEP** the hand-rolled `No discussion yet.`; do NOT swap for `EmptyState`.

---

## Acceptance-criteria → verification mapping

| AC | Proof method |
|---|---|
| AC1 — identity renders identically (≥4 surfaces, agent-vs-human, presence) | Playwright multi-surface screenshot: one agent in `RecipientPicker`, `WorkTeam`, `WorkBet`, `AgentProfile` → review identical Avatar anatomy + agent green styling. **Presence:** AC1's "presence signal" is OUT of Avatar's scope (decided in §reconciliation) — it is the per-surface AI4 "Live" pill (RecipientPicker:200, SessionActivityPanel:198), which AI5 leaves untouched; the screenshot review confirms the Live pill still renders alongside the migrated Avatar, identically across surfaces that have a live session. Unit test `deriveInitials` (incl. the WorkBet "GT"→"GR" delta). |
| AC2 — buttons share one treatment per role; no hand-rolled stylings remain | ESLint/grep gate: no `bg-[var(--accent-primary)] text-[var(--text-on-accent)]…rounded-[var(--r-pill)]` hand-rolled pill outside DS + outside documented-keep list. Playwright screenshot of primary/secondary/ghost on 3 surfaces. |
| AC3 — one loading family; compact empty/error via variants | Playwright: trigger loading on `ArtifactThreadsSummary` + `BlockRefEmbed` → same `skeleton-pulse` animation. **Grep gate (deterministic allowlist):** the ONLY permitted `animate-pulse` survivors are the 3 live-dots — `Conversations.tsx:316`, `SessionActivityPanel.tsx:198`, `RecipientPicker.tsx:200`; every other `animate-pulse` in `packages/web/src` must be gone (migrated to `skeleton-pulse` via `Skeleton`). Component test: `EmptyState`/`ErrorState` `compact` renders panel anatomy AND the full-variant tests stay green (see protectedTests). |
| AC4 — scope picker one implementation in all 4 locations | Playwright screenshot of ScopePicker from all 4 entry points (KnowledgeList filter, KnowledgeCreate, KnowledgeCreateDialog, ScopeChangeDialog) → pixel-identical chrome at the same breakpoint. Grep: zero `rgba(22,118,79,0.08)` literals remain in `packages/web/src` source; zero local scope-pill className blocks (all 4 sites now render `<ScopePicker>`). Behavioral tests for the 4 prefixes (`scope-pill`/`scope-pill-create`/`scope-pill-dialog`/`scope-pill-change`) + `data-active` stay green. |
| AC5 — 44px touch targets on touched surfaces ≤1024px | Playwright `boundingBox()` measurement of triage (24px sites) + overflow (32px sites) + ScopePicker pills at 1024px → height/width ≥44. (AQ-015 lint already enforces.) |
| AC6 — 2 intentional bypasses stay + carry justification; no new undocumented bypass | Grep: `Sidebar` nav buttons + `HostThreadSection` empty unchanged; their `@lore` intact. ESLint reuse gate (AG5's `no-handrolled-*` family) catches new bypasses. |

---

## Ordered task list (builder executes top-to-bottom)

**Phase A — DS extensions (land with stories first; nothing depends on web yet):**
1. `Skeleton.tsx` add `Skeleton` single-bar + export + stories.
2. `EmptyState.tsx` add `compact` + stories.
3. `ErrorState.tsx` add `compact` + stories.
4. `ScopePicker.tsx` new primitive + export + stories. Verify `--accent-primary-dim` exists in `tokens.css` (AI6 owns adding tints, but `--accent-primary-dim` already exists — confirm; if absent, BLOCK and coordinate, do not hardcode).
5. `packages/web/src/utils/initials.ts` `deriveInitials` + unit test.
6. Run `npm run check` + DS stories render at `/designsystem`. Gate.

**Phase B — web adoption (per inventory checklist, group by primitive to keep diffs reviewable):**
7. Avatar + initials migrations (WorkTeam, WorkBet, RecipientPicker; swap initials in the 3 existing Avatar callers).
8. Skeleton migrations (ArtifactThreadsSummary, BlockRefEmbed).
9. EmptyState/ErrorState compact adoption (ArtifactThreadsSummary, SessionActivityPanel, BlockRefEmbed).
10. TabBar migration (SessionActivityPanel).
11. ScopePicker migration — all 4 sites with the pinned `testIdPrefix` map (`scope-pill`/`scope-pill-create`/`scope-pill-dialog`/`scope-pill-change`); preserve `data-active`+`aria-checked`. 3 are pill rows, 1 (ScopeChangeDialog) was a `<Select>`.
12. Tint sweep — swap every remaining `rgba(22,118,79,0.08)` → `--accent-primary-dim` (WorkPortfolio:307,342; WorkTeam:803 via Avatar; scope sites handled by ScopePicker). Grep-verify zero literals remain.
13. Button migrations (per migrate/keep checklist; record each btn-site decision). Overflow menu triggers (KnowledgeDetail:412, WorkBet:955) are NOT in this step.
14. Touch-target repairs via `min-h-[44px] xl:min-h-[<dense>]` (triage 24px, overflow 32px menu-triggers hit-area-only).

**Phase C — verify:**
15. `npm run check` + `npm run lint` + `npm run test` green (incl. all protectedTests).
16. Playwright multi-surface screenshots for AC1/AC3/AC4 + boundingBox for AC5 (incl. the 1024px K8 touch-target spec).
17. Grep gates: AC4 (zero `rgba(22,118,79,0.08)` literals, no local scope-pill blocks), AC3 (only the 3 allowlisted live-dots keep `animate-pulse`), AC6 (intentional bypasses + `@lore` intact).

---

## Risks / ambiguities

- **WorkPortfolio toggle filters (307,342)** — multi-select (`Set`, `aria-pressed`), NOT ScopePicker (single-select). Button-shape migration is builder judgment; but the **tint swap at :307/:342 is mandatory** (see Tint sweep), not judgment.
- **Avatar size mismatch** — bypass chips are 24/28px; `Avatar size="sm"` = 28px. The 24px `WorkTeam:802` member chip gets 28px (4px larger) — acceptable consolidation; flag in PR for visual review. Do NOT add a 24px Avatar size (size scale is closed).
- **WorkBet initials delta** — `slice(0,2)` changes WorkBet's team initials from word-initials ("GT") to slice ("GR"). Intentional per AC1 "identical everywhere"; document in PR + AC1 visual review (already in E5 + §reconciliation).
- **ScopePicker replacing AG5 `<Select>` (ScopeChangeDialog only)** — intentional, concept-sanctioned (scope-picker is AI5-owned, always-visible pill group, distinct from AG5 dropdowns). Reviewer should not flag as an AG5 boundary breach. The other 3 scope sites were already pill rows (no Select involved).
- **Overflow menu triggers (KnowledgeDetail:412, WorkBet:955)** — `aria-haspopup="menu"` → AG5 Menu. Hit-area expansion only; NO `<Button>` swap (would breach AG5).
- **`--accent-primary-dim` token** — confirmed referenced elsewhere (resolves to `rgba(22,118,79,0.08)`, `tokens.css:165`); if it does not resolve, that's an AI1/AI6 gap — BLOCK, do not hardcode.

## Security & abuse cases
N/A — presentation-only adoption sweep. No new inputs, routes, secrets, paths, or outbound URLs. No data or behavior changes (track scope rule + AI5 constraint).

## protectedTests
**Scope-pill testid + `data-active` preservation (ScopePicker migration must keep all green):**
- `packages/web/src/__tests__/U9-knowledge-scope-pills.test.tsx` — `scope-pill-*` + `knowledge-scope-pills` container.
- `packages/web/src/__tests__/AD6-knowledge-simplification.test.tsx` — `scope-pill-*` and `scope-pill-create-*` + `data-active` attrs.
- `packages/web/src/__tests__/KnowledgeCreate.af13.test.tsx` — `scope-pill-create-*`.
- `packages/web/src/pages/__tests__/W3-knowledge.test.tsx` — `scope-pill-*`.
- `packages/web/src/pages/knowledge/__tests__/AD3-KnowledgeCreateDialog-scope.test.tsx` — `scope-pill-dialog-*`.

**DS full-variant contract (compact prop must NOT break these):**
- `packages/web/src/__tests__/EmptyState.test.tsx` — line ~91 asserts 48px icon container absent when no icon; line ~99 freezes default icon bg = `rgba(22, 118, 79, 0.08)`. Adding `compact` must leave both full-variant assertions green. Stories alone don't gate this.
- `packages/web/src/__tests__/ErrorState.test.tsx` — full-variant shadow/surface/anatomy assertions.

**Boundary / intentional-keep:**
- `packages/web/src/shell/__tests__/HostThreadSection.*.test.tsx` — intentional empty-state stays.
- `packages/web/src/__tests__/WorkBet.AF12.test.tsx` — live-dot/status (AI4 boundary).
- Any `Sidebar.test.tsx` asserting raw nav buttons.

## sharedFiles
- `packages/design-system/src/index.ts` (new exports: `Skeleton`, `ScopePicker`).
- `packages/design-system/src/EmptyState.tsx`, `ErrorState.tsx`, `Skeleton.tsx` (DS primitives — AI6 may also touch; AI6 not started, low overlap risk).
- `packages/web/src/utils/scope-labels.ts` (read-only consumer; not modified).
