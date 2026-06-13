# Approved design — AG3: Bet authoring is block editing

**Class:** routine. **Chosen:** Full-page parity (single variant). **Aggregate critique:** 8.4/10.
**Input contract to `/architecture`.** The architect does not re-decide hierarchy, component vocabulary, or interaction grammar below.

## The decision in one paragraph

Replace the cramped `BetCreateDialog` modal with a full-page bet-create surface at route `work/bet/new`, mounting the shared `BodyEditor` in the exact same page chassis the knowledge create surface (`KnowledgeCreate` / `/knowledge/new`) already uses: bordered header (breadcrumb + derived-title preview + Cancel/Create) over a centered two-column body (editor left, a commitments aside right holding team + optional appetite via the AG5 `Select`). Bet *edit* already has parity in `WorkBet` and is preserved untouched. Nothing is persisted until the explicit Create POST, so abandoning is structurally lossless (no half-created bet).

## Scope clarification (load-bearing)

- **Create is the work.** `BetCreateDialog` → new full-page route. This is the same migration Knowledge already did (dialog → `/knowledge/new`).
- **Edit is already done — at *experience*-parity, verified.** `WorkBet.tsx:1431-1451` renders the pitch through `BodyEditor variant="full" minHeight="200px"` + autosave indicator, in a bare `<div>` with NO bordered frame. Knowledge *edit* (`KnowledgeDetail.tsx:823-833`) is structurally identical — bare `<div>`, `minHeight="200px"`, no frame. They already match. The bordered `260px` frame is a *create-chassis* convention only; edit surfaces do not use it. AC3 "matches knowledge edit" = this experience-parity, NOT frame-identity with the create page. Preserve; do not rebuild; do not add a frame. Visual-test bet-edit ↔ knowledge-edit side-by-side per the AC.

## Route & entry point

- New route `work/bet/new` → `WorkBetCreate` page, registered **before** `work/bet/:betId` in `router.tsx` (mirror `/knowledge/new` before `/knowledge/:knowledgeId`).
- `WorkPortfolio` "New bet" button: `onClick` changes from `setDialogOpen(true)` to `navigate("/work/bet/new")`.
- Delete `BetCreateDialog.tsx`, its stories, and update/migrate its tests to the new page.

## Component mapping

| Slot | Component | Props / notes |
|---|---|---|
| Page shell | page-level JSX (copy `KnowledgeCreate` layout) | `flex flex-col h-full`; `data-testid="bet-create-page"` |
| Breadcrumb | `<nav>` + `<Link>` | `Work / <team or "New"> / New`, to `/work/portfolio` |
| Title preview | read-only `<h2>` span, 20px/600 | live `deriveTitleFromPitch(body)`; fallback "Untitled bet" (tertiary). NOT an editable input. |
| Cancel | ghost pill | → `navigate("/work/portfolio")` |
| Create | accent pill | disabled until `body.trim()` non-empty AND team resolved; "Creating…" while submitting |
| Editor | `BodyEditor` (`@hyperidle/design-system`) | `variant="full"`, `minHeight="260px"`, placeholder `"Describe the bet — problem, appetite, no-gos…"`, `editable={!submitting}` |
| Editor frame | `<div>` | `border-[1.5px] border-[var(--border-default)] rounded-[var(--r-default)] p-[18px]` |
| Commitments aside | `<aside w-[240px]>` + card | `bg-[var(--surface-page)] rounded-[var(--r-default)] p-[18px]`; `data-testid="bet-create-commitments"` |
| Team | `Select` (AG5) when `>1` team; static line when 1 | `size="sm"`, `className="w-full"`; single-team auto-resolves (no picker) — matches dialog behavior. **Single-team static line must read as a labelled commitment** (uppercase 12px/600 "TEAM" label + value at equal visual weight to the appetite group), not bare inline text — so the one-team aside doesn't look empty/broken. |
| Appetite (optional) | currency `Select` + number `Input`, `flex gap-[6px]` row | shape from `AppetiteDialog` (`WorkBet.tsx:484-508`); empty ⇒ field omitted from payload (uncapped bet). **Appetite returns to create after `@lore R2` removed it from the cramped dialog — builder adds a `@lore` note recording why (see architecture.md task #3).** Helper "Leave blank for an uncapped bet" renders as 12px tertiary helper text below the row, NOT as a placeholder inside the number Input (survives focus). |
| Error | `<p role="alert">` above editor | `text-[12px] text-[var(--status-error)]` |

All spacing on the Hearth 6px grid (`{6,9,12,18,24}`). Radii `--r-default`/`--r-pill`. Colors via tokens only. Zero `NEW` components.

## States (all five + abandon)

- **Empty:** title "Untitled bet"; editor placeholder; Create disabled.
- **Writing:** title preview updates live; Create enables when body non-empty + team resolved.
- **Submitting:** Create → "Creating…", disabled; editor not editable.
- **Error:** `role="alert"` above editor; form stays usable (e.g. "Team 'x' not found", network error).
- **Success:** `navigate("/work/bet/<newId>")`.
- **Abandon:** Cancel / breadcrumb / browser-back leave with no POST → no bet row. Do NOT create a server-side draft on open.

## Behavior / motion / keyboard / a11y

- Mount focus → `BodyEditor` (writing is the primary act).
- Native browser back works (real route, not modal) — incidental win toward AG4's journey complaint.
- Control hover/focus use existing component states; transitions `--motion-fast`; honor `prefers-reduced-motion`.
- breadcrumb is a `nav[aria-label="Breadcrumb"]` landmark; errors `role="alert"`; mobile inputs ≥16px (AQ-005); pill vertical padding gives ≥44px touch targets on mobile (AQ-015).

## Mobile (three-tab layout)

Single column: editor full-width; commitments aside stacks below it.

**Implementation note (do not assume the copy delivers this):** the `KnowledgeCreate` chassis being copied has NO responsive collapse — `KnowledgeCreate.tsx:176` is a flat `flex gap-[24px] items-start` with a fixed `w-[240px]` aside that stays beside the editor at all widths. The mobile stack must be **added**, not inherited: body container `flex flex-col sm:flex-row gap-[24px] items-start`, aside `w-full sm:w-[240px]`. Inputs ≥16px font at ≤768px (AQ-005); pill vertical padding ≥44px touch targets (AQ-015). Do not retrofit `KnowledgeCreate` itself — out of AG3 scope.

## Rejected (do not re-litigate)

Bigger modal · inline commitments strip · two-step wizard · commitments-after-write modal · server-side draft-on-open · editable title input. Reasons in `synthesis.md`.

## Resolved questions (decisions, for the builder)

1. **Cancel-when-dirty confirm — YES.** Lightweight confirm on Cancel/breadcrumb when `body.trim()` non-empty (mirrors the old dialog's `isDirty` guard, `BetCreateDialog.tsx:113`); do NOT intercept native browser-back. Reason: misclick content-loss is a UX regression vs. the dialog even though abandon is data-safe. Tested under AC6 (architecture.md Risk #2).
2. **`WorkBetCreate` team source — `useTeams()` in the page, no prop.** The page calls `useTeams()` directly (unconditionally — rules of hooks), reading `teamsData?.teams ?? []` exactly as `WorkPortfolio.tsx:72,86` does. No `overrideTeams` prop; `KnowledgeCreate` takes no props either. Tests stub `/api/teams` via the existing MSW/QueryClient harness.
3. **API — confirmed, no change.** POST `/api/bets` (`createBetSchema`, `.strict()`, `bets.ts:47-65`) already accepts `teamId`, `description`, optional `costAppetite` (WireMoney|null), `doneCondition?`, `hypothesis?`. Sending appetite at create is valid today; empty appetite ⇒ field omitted ⇒ uncapped. Bets created before this change render unchanged.
