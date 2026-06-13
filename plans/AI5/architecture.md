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
| **AG5** (dropdowns/Select/Menu) | **DONE** (merged: PR #273, ESLint `no-handrolled-select`) | Do NOT touch overflow-menu triggers or `<Select>`. The scope **dropdowns** in ScopeChangeDialog/KnowledgeCreateDialog currently use `<Select>` — see Decision below: ScopePicker replaces them with the pill group (this is AI5's scope-picker AC, not an AG5 dropdown). All `btn btn-ghost btn-xs` overflow triggers feeding a Menu stay. |
| **AG6** (item-row/table primitive) | **NOT STARTED** (no progress file) | Do NOT migrate `KnowledgeList`'s inline `KnowledgeListRow` (line ~200, explicitly replaces DS `KnowledgeRow`) nor `NotificationPopover`'s inline notification row (reimplements DS `NotificationRow`). Both are **rows** → AG6 owns. The spec named these; they YIELD. |
| **AG7** (Settings consistency) | **NOT STARTED** (no progress file) | Do NOT touch any file under `packages/web/src/settings/` or Settings panes. |
| **AI4** (one status language / live-pulse) | merged baseline | The `animate-pulse` 5–6px dots in `Conversations.tsx:316`, `SessionActivityPanel.tsx:198`, `RecipientPicker.tsx:200` are **live-activity pulses**, not skeletons — AI4 territory. Do NOT convert them to Skeleton. |
| **AI2** (dialog) | merged | Dialog footer `btn btn-xs btn-ghost/primary` inside `Dialog` surfaces are dialog chrome. AI5 migrates them to `Button` **only where it doesn't fight the Dialog footer contract** — see Button task; default is migrate, but keep `min-h-[44px]` and Dialog `footer` slot wiring. |

**Net effect of yields:** the two spec-named row reimplementations (KnowledgeList, NotificationPopover) are explicitly OUT for AI5 — they belong to AG6. AI5's row work is therefore the avatar/button/state/scope atoms *inside* whatever rows exist, not the row container.

---

## Plan reconciliation (spec ⇆ verified tree)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "scope-picker copy-paste in 4 files" | Verified 4: `KnowledgeList`, `KnowledgeCreate` (pill rows) + `ScopeChangeDialog`, `KnowledgeCreateDialog` (DaisyUI `<Select>`). TaskSheet radiogroup is *request-intent*, not scope. | ScopePicker primitive replaces all 4; the 2 Selects become pill groups. |
| `Skeleton` single-bar primitive | DS exports only `SkeletonList`/`SkeletonCard`. No `Skeleton` export. `BlockRefEmbed` + `ArtifactThreadsSummary` need single bars. | **Add** `Skeleton` single-bar export (design open-Q1 resolved: export it). |
| `Avatar` "3 of 16 sites" | Verified adopted: `AgentEditDialog`, `WorkTeam`, `AgentProfile`. Bypasses: `WorkTeam:802` (24px member chip), `WorkBet:1141`, `RecipientPicker:187,219`. | Migrate the 3 bypass sites + `deriveInitials`. |
| NotificationPopover avatar bypass | NotificationPopover uses urgency **dots**, no person avatar. No Avatar bypass there. | Drop from Avatar list; its row reimpl yields to AG6. |
| "4 initials variants" | Dominant `.slice(0,2).toUpperCase()` ×4 (`WorkTeam`, `AgentEditDialog`, `AgentProfile`, `WorkBet`); `RecipientPicker` uses bare `.slice(0,2)` (no uppercase). | `deriveInitials(name)` unifies; RecipientPicker gains uppercase (cosmetic improvement, identical data). |
| `SessionActivityPanel` raw DaisyUI tabs | Verified `tabs tabs-bordered tabs-xs` at line 233. `TabBar` exists. | Migrate to `TabBar`. |
| 24px triage / 32px overflow touch targets | Verified: triage `KnowledgeList:331,356,381` (24px), `SessionActivityPanel:213` (24px); overflow `KnowledgeDetail:412`, `WorkBet:955` (32px). | Touch-target repairs ride along (AQ-015). |

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
`packages/design-system/src/ErrorState.tsx` — add `compact?: boolean`. When true: `p-[18px]`, no `max-w`, **no shadow**, `surface-page` (not elevated), no 48px icon block, 15px title / 13px desc, retry pill `px-[12px] py-[7px]` with `min-h-[44px]` (AQ-015), detail mono block 12px. Stories: add `Compact`, `CompactWithRetry`.

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
  disabledTitle?: string;          // tooltip for disabled pills
  testIdPrefix?: string;           // "scope-pill" | "scope-pill-create" — preserves E2E selectors
  dataTestId?: string;             // container testid (e.g. "knowledge-scope-pills")
}
export function ScopePicker(props: ScopePickerProps): JSX.Element
```
- `role="radiogroup"`; each pill `role="radio"` + `aria-checked`; per-pill `data-testid={`${testIdPrefix}-${id}`}`.
- Active = `bg-[var(--accent-primary-dim)]` + `border-[1.5px] border-[var(--accent-primary)]` + `text-[var(--accent-primary)]`. Inactive = transparent + `border-default` + `text-secondary`. Disabled = `opacity-40 cursor-not-allowed`.
- Pills `px-[12px] py-[4px] rounded-[var(--r-pill)] text-[12px] font-[500]`, container `gap-[6px] flex-wrap`, `min-h-[44px]` hit area on each pill at `≤1024px` (AQ-015) — visual `py-[4px]` preserved.
- In `mode="filter"`: the "All" option (id with `filterKinds=null`) is active when `value === null`.
- **`--accent-primary-dim` resolves the hardcoded `rgba(22,118,79,0.08)`** at all 4 sites.
- Stories: `FilterMode`, `SelectMode`, `WithDisabledOption`, `MobileTouchTarget`.

> **NOTE for builder:** `scope-labels.ts` keeps owning the option vocabulary. ScopePicker maps `SCOPE_PILL_OPTIONS`/`SCOPE_CREATE_OPTIONS` → `ScopePickerOption[]` at each call site (one-line `.map`). The locked-scope display in `KnowledgeCreateDialog` (`lockedScopeKind`) stays a read-only `Tag` — NOT ScopePicker.

### E5 — `deriveInitials` shared utility
`packages/web/src/utils/initials.ts`:
```ts
export function deriveInitials(name: string): string  // trims, first 1–2 chars, uppercase; "" → "?"
```
Replaces `.slice(0,2).toUpperCase()` (×4) and bare `.slice(0,2)` (RecipientPicker). Unit-tested. (Lives in `web`, not DS — DS `Avatar` stays a dumb renderer taking pre-derived `initials`, per concept rejection list.)

---

## Bypass-site inventory (builder checklist — verified file:line)

### Avatar (migrate to `<Avatar>` + `deriveInitials`)
- [ ] `pages/WorkTeam.tsx:802` — 24px member chip `w-[24px] h-[24px] rounded-full … text-[9px]` → `<Avatar size="sm" agent>` (closest size sm=28px; confirm visual; member chip).
- [ ] `pages/WorkBet.tsx:1141` — `w-[28px] h-[28px] rounded-full bg-surface-container text-[11px]` + `.slice(0,2)` at 1146 → `<Avatar size="sm" initials={deriveInitials(name)} />`.
- [ ] `components/RecipientPicker.tsx:187` (list) + `:219` (selected) — `w-[28px] h-[28px] rounded-full … uppercase` + `.slice(0,2)` (186,220) → `<Avatar size="sm" initials={deriveInitials(name)} />`.

### Initials derivation (replace with `deriveInitials`)
- [ ] `pages/WorkTeam.tsx:610`, `pages/AgentEditDialog.tsx:139`, `pages/AgentProfile.tsx:129` — already `<Avatar>` callers; swap the local `.slice(0,2).toUpperCase()` for `deriveInitials(name)`.
- [ ] `pages/WorkBet.tsx:1146`, `components/RecipientPicker.tsx:186,220` — covered by Avatar migrations above.

### Button (migrate hand-rolled + DaisyUI `btn` → `<Button>`)
Hand-rolled pill buttons (NOT dialog footers, NOT AG5 menus):
- [ ] `pages/KnowledgeDetail.tsx:705,713,783` (action pills), `:412` (32px overflow icon-btn — see touch-targets).
- [ ] `pages/KnowledgeList.tsx:1078,1113` (accent pills).
- [ ] `pages/KnowledgeCreate.tsx:154,163` (Cancel/Create pills).
- [ ] `pages/Conversations.tsx:310,507,541` (pill buttons).
- [ ] `pages/NotFound.tsx:39,43` (BTN_CLASS constants → `<Button variant>`).
- [ ] `pages/WorkPortfolio.tsx:305,340` (filter pills — confirm these aren't ScopePicker-shaped; they're portfolio filters, migrate to Button or leave if Tag-shaped — builder judgment, justify if skipped).
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

### ScopePicker (replace 4 forks)
- [ ] `pages/KnowledgeList.tsx:600` — filter pill row → `<ScopePicker mode="filter" testIdPrefix="scope-pill" dataTestId="knowledge-scope-pills" …>`. Preserve `knowledge-scope-indicator` sr-only span.
- [ ] `pages/KnowledgeCreate.tsx:220` — create radiogroup → `<ScopePicker mode="select" testIdPrefix="scope-pill-create" disabledTitle="Join a team to use team-scoped knowledge" …>`.
- [ ] `pages/knowledge/ScopeChangeDialog.tsx:162` — `<Select>` → `<ScopePicker mode="select" …>` (the AC requires the pill group everywhere; this replaces the AG5 Select **only for scope**, per concept — scope-picker is AI5-owned, not an AG5 dropdown).
- [ ] `pages/knowledge/KnowledgeCreateDialog.tsx` (scope block ~183) → `<ScopePicker mode="select">`; keep the `lockedScopeKind` read-only `Tag` branch unchanged.

### Touch-target repairs (AQ-015, ≤1024px ≥44px)
- [ ] Triage 24px: `KnowledgeList.tsx:331,356,381`, `SessionActivityPanel.tsx:213` → add `min-h-[44px] min-w-[44px]` at `≤1024px` (or `Button` icon variant if it carries the hit-area). Keep visual 24px glyph.
- [ ] Overflow 32px: `KnowledgeDetail.tsx:412`, `WorkBet.tsx:955` → `≥44px` hit area at `≤1024px`.
- [ ] `AssistantOverlay.tsx:355`, `AssistantAttachButton.tsx:38` (24px) — confirm/repair if ≤1024px reachable.

### Documented-intentional bypasses — STAY (do NOT migrate; preserve lore)
- [ ] `shell/Sidebar.tsx` raw nav buttons — E2E selectors + density per its `@lore`. **KEEP.**
- [ ] `shell/HostThreadSection.tsx:246` empty state — `role="status"` conflict with surrounding live region (lore at line 246–258). **KEEP** the hand-rolled `No discussion yet.`; do NOT swap for `EmptyState`.

---

## Acceptance-criteria → verification mapping

| AC | Proof method |
|---|---|
| AC1 — identity renders identically (≥4 surfaces, agent-vs-human, presence) | Playwright multi-surface screenshot: one agent in `RecipientPicker`, `WorkTeam`, `WorkBet`, `AgentProfile` → review identical Avatar anatomy + agent green styling. Unit test `deriveInitials`. |
| AC2 — buttons share one treatment per role; no hand-rolled stylings remain | ESLint/grep gate: no `bg-[var(--accent-primary)] text-[var(--text-on-accent)]…rounded-[var(--r-pill)]` hand-rolled pill outside DS + outside documented-keep list. Playwright screenshot of primary/secondary/ghost on 3 surfaces. |
| AC3 — one loading family; compact empty/error via variants | Playwright: trigger loading on `ArtifactThreadsSummary` + `BlockRefEmbed` → same `skeleton-pulse` animation. Grep: no bare `animate-pulse` skeleton (live-dots allowlisted). Component test: `EmptyState`/`ErrorState` `compact` renders panel anatomy. |
| AC4 — scope picker one implementation in all 4 locations | Playwright screenshot of ScopePicker from all 4 entry points → pixel-identical chrome. Grep: no `rgba(22,118,79,0.08)` literal remains; zero local scope-pill className blocks. |
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
11. ScopePicker migration (KnowledgeList, KnowledgeCreate, ScopeChangeDialog, KnowledgeCreateDialog) — preserve all `data-testid`s.
12. Button migrations (per migrate/keep checklist; record each btn-site decision).
13. Touch-target repairs (triage 24px, overflow 32px).

**Phase C — verify:**
14. `npm run check` + `npm run lint` + `npm run test` green.
15. Playwright multi-surface screenshots for AC1/AC3/AC4 + boundingBox for AC5.
16. Grep gates for AC2/AC4/AC6 (no hardcoded rgba, no local scope-pill, intentional bypasses intact).

---

## Risks / ambiguities

- **WorkPortfolio filter pills (305,340)** — may be Tag-shaped portfolio filters, not Buttons. Builder judgment; if not a Button role, leave + justify (not a bypass).
- **Avatar size mismatch** — bypass chips are 24/28px; `Avatar size="sm"` = 28px. The 24px `WorkTeam:802` member chip gets 28px (4px larger) — acceptable consolidation; flag in PR for visual review. Do NOT add a 24px Avatar size (resist scope creep; the size scale is closed).
- **ScopePicker replacing AG5 `<Select>`** — this is intentional and concept-sanctioned (scope-picker is AI5-owned, the always-visible pill group, distinct from AG5 dropdowns). Reviewer should not flag as an AG5 boundary breach.
- **`--accent-primary-dim` token** — confirmed referenced elsewhere; if it does not resolve, that's an AI1/AI6 gap — BLOCK, do not hardcode.

## Security & abuse cases
N/A — presentation-only adoption sweep. No new inputs, routes, secrets, paths, or outbound URLs. No data or behavior changes (track scope rule + AI5 constraint).

## protectedTests
- `packages/web/src/__tests__/U9-knowledge-scope-pills.test.tsx` — scope pill assertions; must stay green (testid preservation).
- `packages/web/src/__tests__/KnowledgeList.*.test.tsx`, `KnowledgeCreate.*.test.tsx` — scope-pill testids.
- `packages/web/src/shell/__tests__/HostThreadSection.*.test.tsx` — intentional empty-state stays.
- `packages/web/src/__tests__/WorkBet.AF12.test.tsx` — live-dot/status (AI4 boundary).
- Any `Sidebar.test.tsx` asserting raw nav buttons.

## sharedFiles
- `packages/design-system/src/index.ts` (new exports: `Skeleton`, `ScopePicker`).
- `packages/design-system/src/EmptyState.tsx`, `ErrorState.tsx`, `Skeleton.tsx` (DS primitives — AI6 may also touch; AI6 not started, low overlap risk).
- `packages/web/src/utils/scope-labels.ts` (read-only consumer; not modified).
