# Architecture — AG3: Bet authoring is block editing

**Fixed inputs:** `plans/AG3/concept.md` (no new nouns; established contracts), `plans/AG3/design/approved.md` (full-page parity, single variant). The visual contract, component vocabulary, and interaction grammar are not re-litigated here.

## Required reading (engineer, before implementing)

- `plans/AG3/design/approved.md` — the locked design.
- `plans/AG3/concept.md` — the five established contracts.
- `packages/web/src/pages/KnowledgeCreate.tsx` — the parity chassis to copy.
- `packages/web/src/pages/WorkBet.tsx:1391-1464` — bet *edit* parity (preserve, don't touch).
- `packages/web/src/pages/work/BetCreateDialog.tsx` — the modal being replaced (delete).
- `packages/web/src/pages/WorkPortfolio.tsx:72,86,243-251,400-417,491-500` — BOTH entry points (toolbar `:247` + empty-state CTA `:411`), `useTeams()` source (`:72` `const { data: teamsData } = useTeams()`, `:86` `teamsData?.teams ?? []`), and the dialog render (`:491-500`) with its `teams` prop-pass (`:499`) + `refreshBets()` in `onCreated` (`:497`).
- `packages/web/src/pages/KnowledgeDetail.tsx:823-833` — knowledge *edit* surface, to confirm AC3 edit-parity (see Plan reconciliation appetite/parity rows).
- `packages/web/src/router.tsx:73-85` — route registration (mirror `/knowledge/new`).
- `packages/server/src/routes/bets.ts:47-65,562-627` — `createBetSchema` + POST handler (NO change needed).
- `docs/blocks/canonical-shapes.md` — `deriveBlocks` contract.

## Summary of the change

Replace `BetCreateDialog` (modal) with a full-page `WorkBetCreate` page at route `work/bet/new`, reusing the `KnowledgeCreate` chassis and the shared `BodyEditor`. Re-point **both** "New bet" entry points in `WorkPortfolio` (the toolbar button `:247` AND the empty-state CTA `:411`) from opening a dialog to navigating to the route, then delete the dialog and all its wiring (`dialogOpen` state, `BetCreateDialog` import, render at `:491-500`, `teams` prop-pass `:499`, `refreshBets()` in `onCreated` `:497`). Bet *edit* (in `WorkBet`) already has experience-parity with knowledge edit — untouched (see AC3). No API, schema, or storage change. Frontend-only.

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "same editor in three places: bet create dialog, bet detail edit, knowledge create/edit" | Confirmed: all use `BodyEditor`. Bet create = `BetCreateDialog.tsx:164`, bet edit = `WorkBet.tsx:1433`, knowledge create = `KnowledgeCreate.tsx:194`, knowledge detail edit similar. | Reuse `BodyEditor` as-is on the new page. |
| Bet *editing* needs new parity work | **Already at experience-parity, and VERIFIED frame-parity with knowledge edit.** Bet edit `WorkBet.tsx:1431-1451` = bare `<div className="flex flex-col gap-2">` → `BodyEditor variant="full" minHeight="200px"` + `bet-save-indicator` (Saving/Saved/Save failed), **no bordered frame**. Knowledge edit `KnowledgeDetail.tsx:823-833` = bare `<div className="flex flex-col gap-[12px]">` → `BodyEditor variant="full" minHeight="200px"`, **also no bordered frame**. The bordered `border-[1.5px] … p-[18px]` frame + `minHeight="260px"` is a *create-surface* convention (`KnowledgeCreate.tsx:190-202`), NOT an *edit* convention. | Preserve bet edit untouched; visual-test it for AC3/AC8. The work is create-only. **AC3 is scoped to experience-parity (both edit surfaces = full-page `BodyEditor variant="full"` + `minHeight="200px"` + live save indicator, no frame), explicitly NOT create-chassis frame-parity** — they already match by construction. See AC3 row + Risk #5 for the rationale and the side-by-side the reviewer must judge against. |
| Bet create collects team + appetite | Dialog collects team (`Select`, multi-team only); appetite was **removed** from create (`@lore R2`, `BetCreateDialog.tsx:18-20`: "appetite fields removed per spec. Submit payload no longer includes costAppetite"). | New page: team aside (same auto-resolve), appetite **added back as optional** in the aside. API already supports it. **Builder must add a `@lore` note in `WorkBetCreate.tsx` recording WHY appetite returns** (see task #3 + the `@lore` directive below) so a future cleanup agent does not re-remove it citing R2. |
| Bet creation API must be preserved/evolved compatibly | POST `/api/bets` `createBetSchema` is `.strict()` and already accepts `teamId`, `description`, optional `costAppetite` (WireMoney\|null), `doneCondition?`, `hypothesis?`. | **No API change.** Sending `costAppetite` at create is already valid. Backward compatible by construction. |
| Title is typed (like knowledge) | Bet title is **derived** via `deriveTitle`/`deriveTitleFromPitch(pitch, betId)` (`packages/shared/src/format/bet.ts`). Dialog shows a derived "Title preview". | Header shows a read-only derived title preview, not an input (design decision #6, locked). Pass `""` as betId for preview (dialog does this). |
| teams passed as prop | As a route page (no parent passing props), must fetch teams. `WorkPortfolio` uses `useTeams()` (`hooks/useTeams`): `const { data: teamsData } = useTeams()` then `teamsData?.teams ?? []`. `useTeams()` returns `{ data: TeamListResponse \| null, loading, error }`; `TeamListResponse.teams` is the array. | `WorkBetCreate` calls `useTeams()` directly (no `overrideTeams` prop — the page is self-sufficient). Tests provide an MSW/QueryClient stub for `/api/teams` (see Risk #3). |
| `work/bet/new` route exists | Does not exist; `work/bet/:betId` does (`router.tsx:80`). | Add `work/bet/new` **before** `work/bet/:betId`. Static-over-dynamic ranking makes ordering safe, but explicit order mirrors `/knowledge/new` precedence and is defensive. |

No spec/concept contradictions. No migration needed (no schema/column/table change).

## Acceptance criteria + verification

| # | Criterion | Verification method |
|---|---|---|
| AC1 | Creating a bet uses a full-page surface with `BodyEditor` (`variant="full"`) and the same block capabilities + Create action, not a dialog box. | Component test: render `WorkBetCreate` in `MemoryRouter` at `/work/bet/new`; assert `data-testid="bet-create-page"` present, a `BodyEditor` (contenteditable) present, NO `Dialog` role; `BetCreateDialog` no longer imported anywhere (grep / removed file). |
| AC2 | "New bet" navigates to the full-page route (no dialog opens). | Component test: render `WorkPortfolio`, click `new-bet-btn`, assert navigation to `/work/bet/new` (route spy / location). E2E: click → URL is `/work/bet/new`. |
| AC3 | Editing an existing bet matches knowledge edit (preserved). **Parity scope = experience, not create-chassis frame.** | Both edit surfaces are already structurally identical (VERIFIED): bet edit `WorkBet.tsx:1431-1451` and knowledge edit `KnowledgeDetail.tsx:823-833` are each a bare `<div>` wrapping `BodyEditor variant="full" minHeight="200px"` + a live save indicator, with NO bordered editor frame. AC3 "matches" means *this* (full-page block editor + autosave indicator), NOT the create-chassis bordered `260px` frame. Verification: existing `WorkBet` edit/description tests stay green (protected); E2E captures bet-detail edit screenshot beside knowledge-detail edit — reviewer judges experience-parity against the explicit definition above, not frame-identity with the create page. |
| AC4 | Bet-specific commitments (team, appetite) set during create without crowding the writing surface; bet cannot be created without required commitments (team). | Component test: aside renders team control (multi-team) + appetite group in `bet-create-commitments`; Create disabled until body non-empty AND team resolved; with one team, team auto-resolves (no picker), Create enabled on body. **Empty appetite ⇒ field omitted from payload (uncapped bet); appetite only added when `amt > 0`** — asserted by inspecting the POST body (mock `apiFetch`). |
| AC5 | Content authored renders identically in bet detail — blocks/headings/anchored-discussion preserved. | Integration: POST `/api/bets` with markdown (headings + list) via the page's payload shape; GET bet; `deriveBlocks(description,{kind:"bet",id})` yields the same blocks the detail view renders. E2E: create with headings/lists → detail view shows them via `bet-pitch`. |
| AC6 | Abandoning creation mid-write leaves no half-created bet. | Integration/E2E: open `/work/bet/new`, type body, leave without Create; assert bet count unchanged (no POST fired). Unit: page fires POST only in `handleCreate`. **Cancel-when-dirty confirm (decided, Risk #2):** unit asserts Cancel with empty body navigates with no confirm/no POST; Cancel with content shows confirm and only navigates on accept, still no POST; browser-back is never intercepted. |
| AC7 | Bets created via new flow appear like pre-change bets on team screen + portfolio. | Integration: created bet has `status:"draft"`, derived title, same row shape; existing portfolio/team tests stay green. |
| AC8 | Journey visually tested via Playwright at desktop width; screenshots beside knowledge authoring; zero hard-rule violations vs `.claude/rules/aesthetic-quality.md`. | E2E spec `AG3-bet-authoring.spec.ts`: create flow (open, write headings+lists, set commitments, commit) + edit flow; screenshots captured alongside knowledge create/edit; design-critique/visual review on screenshots. |

## Files

**New:**
- `packages/web/src/pages/WorkBetCreate.tsx` — the full-page create page.
- `packages/web/src/pages/WorkBetCreate.stories.tsx` — states (empty, writing, single-team, multi-team, submitting, error).
- `packages/web/src/__tests__/WorkBetCreate.test.tsx` — component tests (AC1, AC4, AC6).
- `packages/web/e2e/AG3-bet-authoring.spec.ts` — E2E + screenshots (AC8) (path per existing e2e convention; verify dir).

**Modified:**
- `packages/web/src/router.tsx` — add `{ path: "work/bet/new", element: <WorkBetCreate /> }` before `work/bet/:betId`; import `WorkBetCreate`.
- `packages/web/src/pages/WorkPortfolio.tsx` — re-point **BOTH** `setDialogOpen(true)` call sites to `navigate("/work/bet/new")`:
  - **toolbar button** `:247` (`data-testid="new-bet-btn"`, label "New bet")
  - **empty-state CTA** `:411` (inside `data-testid="create-bet-cta"`, label exactly "Create bet" — preserve label + selector; only the handler changes, per `@lore AG2 CRITICAL-2/3` at `:402-405`).
  Then delete all dialog wiring that becomes dead: `BetCreateDialog` import, `dialogOpen`/`setDialogOpen` state, the `<BetCreateDialog … />` render (`:491-500`), the `teams.map(...)` prop-pass (`:499`), and `refreshBets()` in `onCreated` (`:497`). The new page navigates straight to `/work/bet/:id` on success, so portfolio no longer refreshes on create — **verify `refreshBets` has no other consumer** before removing it (if it's used elsewhere, keep the function, just drop the dialog's call). Add `useNavigate` if absent. **Failure mode this guards:** re-pointing only `:247` while deleting `setDialogOpen` leaves `:411` referencing a deleted setter → TS build failure / dead handler.

**Deleted (migration):**
- `packages/web/src/pages/work/BetCreateDialog.tsx`
- `packages/web/src/pages/work/BetCreateDialog.stories.tsx`
- `packages/web/src/__tests__/BetCreateDialog.test.tsx` — migrate its still-relevant assertions (team auto-resolve, BodyEditor present, required-field gating, submit payload) into `WorkBetCreate.test.tsx`; delete the file.

**Unchanged (assert preserved):** `packages/server/src/routes/bets.ts`, `packages/web/src/pages/WorkBet.tsx` (edit surface), `docs/blocks/*`, all bet derivation.

## Component contract — WorkBetCreate

```tsx
// No props — fetches its own data, like every route page (mirrors KnowledgeCreate,
// which takes no props either). The page is self-sufficient; tests stub /api/teams
// via MSW/QueryClient rather than injecting an overrideTeams prop (see Risk #3).
export function WorkBetCreate(): JSX.Element;
```

Internal state (mirrors `KnowledgeCreate` + `BetCreateDialog`):
```ts
const [body, setBody] = useState("");            // markdown from BodyEditor
const [teamId, setTeamId] = useState("");        // multi-team select value
const [appetiteAmount, setAppetiteAmount] = useState(""); // optional
const [appetiteCurrency, setAppetiteCurrency] = useState("USD");
const [submitting, setSubmitting] = useState(false);
const [error, setError] = useState<string | null>(null);

// useTeams() is called unconditionally (rules of hooks). Matches WorkPortfolio:72,86.
const { data: teamsData } = useTeams();           // { data: TeamListResponse | null, ... }
const teams = teamsData?.teams ?? [];             // TeamListResponse.teams
const singleTeam = teams.length === 1;
const resolvedTeamId = singleTeam ? (teams[0]?.id ?? "") : teamId;
const derivedTitle = body.trim() ? deriveTitleFromPitch(body, "") : "";
// .length > 0 keeps canCreate a boolean (string && would return the last operand),
// mirroring KnowledgeCreate.tsx:69.
const canCreate = resolvedTeamId.trim().length > 0 && body.trim().length > 0 && !submitting;
```

POST payload (unchanged API, `createBetSchema`):
```ts
const payload: Record<string, unknown> = { teamId: resolvedTeamId, description: body.trim() };
const amt = Number.parseFloat(appetiteAmount);
if (Number.isFinite(amt) && amt > 0) {
  payload.costAppetite = {
    minor: Math.round(amt * 10 ** scaleForCurrency(appetiteCurrency as WireMoney["currency"])),
    currency: appetiteCurrency,
  };
}
// POST /api/bets → 201 { id, ... }; on ok: navigate(`/work/bet/${created.id}`)
```
`scaleForCurrency` + `CURRENCY_CODES` imported from `@hyperidle/shared` (already used in `WorkBet.tsx`). `Select`, `Input`, `BodyEditor` from `@hyperidle/design-system`.

## Ordered tasks

1. **Red — component tests.** `WorkBetCreate.test.tsx`: page renders with `bet-create-page`, `BodyEditor` present, no Dialog; Create disabled when body empty; enabled when body+team resolved; single-team auto-resolves; appetite optional; POST fired only on Create (mock `apiFetch`); navigates to `/work/bet/:id` on 201; error line on non-ok. Migrate relevant `BetCreateDialog.test.tsx` assertions. (AC1, AC4, AC6, AC7)
2. **Red — entry-point test.** `WorkPortfolio`: BOTH the toolbar `new-bet-btn` (`:247`) AND the empty-state `create-bet-cta` (`:411`) navigate to `/work/bet/new` (mock navigate). Assert NO dialog opens for either. (AC2)
3. **Green — build `WorkBetCreate.tsx`.** Copy `KnowledgeCreate` chassis; swap scope aside for team+appetite aside; derived-title preview header; wire POST. **Two additions the verbatim copy does NOT give you:**
   - **Responsive collapse (must be added, not inherited).** `KnowledgeCreate.tsx:176` body is a flat `flex gap-[24px] items-start` with a fixed-width aside — no responsive switch. The design promises a mobile single-column stack (editor full-width, commitments below). Implement it explicitly: body container `flex flex-col sm:flex-row gap-[24px] items-start`, aside `w-full sm:w-[240px]`. Inputs ≥16px at ≤768px (AQ-005); pill padding gives ≥44px touch targets (AQ-015). Do NOT "fix" `KnowledgeCreate`'s own missing collapse here — out of scope; flag it in the retro if noticed.
   - **`@lore` for appetite restoration.** Add a `@lore` comment in `WorkBetCreate.tsx`: *"Appetite returns to create. `@lore R2` stripped it from the cramped `BetCreateDialog` ('Submit payload no longer includes costAppetite'); AG3 restores it because the full-page aside has room and AC4 names team+appetite as create-time commitments. `createBetSchema` already accepts optional `costAppetite` (WireMoney|null) — no API change. Empty amount ⇒ field omitted ⇒ uncapped bet. Do not re-remove citing R2."*
   (AC1, AC4, AC5, AC7)
4. **Green — router.** Add route before `:betId`; import page. (AC2)
5. **Green — WorkPortfolio.** Re-point BOTH call sites (`:247` toolbar + `:411` empty-state CTA) to `navigate("/work/bet/new")`, preserving the CTA's `create-bet-cta` selector and "Create bet" label. Remove dialog wiring + import (`dialogOpen` state, `<BetCreateDialog>` render `:491-500`, `teams` prop-pass `:499`); drop `refreshBets()` from the dialog's `onCreated` (`:497`) — verify `refreshBets` has no other consumer before deleting the function itself. (AC2)
6. **Migration — delete BetCreateDialog** + stories + test (after assertions migrated). Grep for any remaining import.
7. **Stories.** `WorkBetCreate.stories.tsx` for all states (visual-polish input).
8. **E2E + screenshots.** `AG3-bet-authoring.spec.ts`: create + edit flows; screenshots beside knowledge create/edit. (AC8, AC3)
9. **Verify.** `npm run check && npm run lint && npm run test`, then `test:e2e` for the spec.

## Design-it-twice — page data source

**A. `useTeams()` inside the page (chosen).** Page is self-sufficient like a route page should be; matches `WorkPortfolio`'s own source. Trade-off: a second `useTeams` fetch when arriving from portfolio (cheap, cached-ish, no global store today — same as `WorkBet`'s double `useHostThread`, accepted v1). Reject reason for B below.
**B. Pass teams via route state / context.** Avoids refetch. Reject: couples the route to its caller, breaks deep-link/refresh to `/work/bet/new` (teams undefined on hard load), more wiring. A's refetch is negligible; self-sufficiency wins.

## Security & abuse cases

- **Rate-limit on POST:** N/A new surface — reuses existing POST `/api/bets` with its existing `requireBoundary({ kind: "public-data" })`; no new endpoint, no new limit needed.
- **Input-trust boundary (agent-authored field):** N/A — create is human-initiated UI; body is human markdown, already sanitized by the block render pipeline (existing). No agent input path added.
- **Secret handling:** N/A — no credential surface.
- **Path traversal:** N/A — no path input.
- **SSRF:** N/A — no outbound URL.
- **Client-trust:** team existence + field validation already enforced server-side in the unchanged handler (`bets.ts:572-579` team check; `createBetSchema.strict()` rejects unknown fields). Frontend gating is UX, not security; server remains authoritative.

## route-checklist

| Route | File | Action |
|---|---|---|
| `work/bet/new` | `packages/web/src/router.tsx` | add (before `work/bet/:betId`) |
| `work/bet/:betId` | `packages/web/src/router.tsx` | unchanged; verify still matches after `new` added |
| POST `/api/bets` | `packages/server/src/routes/bets.ts` | unchanged; verify contract preserved (no edit) |

## protectedTests

- `packages/web/src/__tests__/KnowledgeCreate.af13.test.tsx` — knowledge authoring unchanged (out of scope).
- `packages/web/src/__tests__/KnowledgeDetail.edit.test.tsx` — knowledge edit unchanged.
- Existing `WorkBet` edit/description tests (e.g. `packages/web/src/__tests__/WorkBet.description.test.tsx`) — bet edit parity preserved.
- Existing `WorkPortfolio` tests — only the New-bet navigation assertion changes; outcome/filter assertions must not change.
- `packages/web/e2e/R2-work-first-landing.spec.ts` — asserts the empty-state CTA (`create-bet-cta`, label `/create bet/i`). The CTA **visibility/selector/label MUST stay** (`@lore AG2 CRITICAL-2/3`, `WorkPortfolio.tsx:402-405`). But this spec has **dialog-coupled tests that the deletion will break** — they must be updated in task #5, NOT just left:
  - `AC7 — Clicking 'Create bet' CTA opens BetCreateDialog` (`:235`, asserts `getByRole("dialog")`) → **shift to "navigates to `/work/bet/new`"** (assert URL, not dialog).
  - `AC6 — … no product selector … / no appetite … fields` (`:246`, `:261`) assert dialog *internals* via `getByRole("dialog")`. These describe a deleted surface. **Re-target to the new page** (`/work/bet/new`): single-team ⇒ no team picker; appetite is now PRESENT (AC4) so the old "no appetite fields" assertion is obsolete — replace it with an assertion that the appetite group renders in `bet-create-commitments`. Treat these as protected-by-intent: their *user-facing guarantee* survives, their *mechanism* (dialog) does not.
- `packages/web/e2e/AG2-portfolio-arrival.spec.ts` — references `create-bet-cta` (`:231`) and `new-bet-btn` (`:268,:313`). CTA + button visibility (AC-4 frame invariant) MUST stay green unchanged. But `AC-1: clicking 'Create bet' CTA opens BetCreateDialog` (`:247`, asserts `getByRole("dialog")` at `:249`) → **shift to "navigates to `/work/bet/new`"**. Update in task #5.
- Server bet tests — API contract unchanged.

(`BetCreateDialog.test.tsx` is NOT protected — it is intentionally deleted after assertion migration.)

## sharedFiles

- `packages/web/src/router.tsx` — route addition.
- `packages/web/src/pages/WorkPortfolio.tsx` — entry-point edit.

## Risks / ambiguities

1. **E2E directory/convention.** `packages/web/e2e/*.spec.ts` confirmed (AG1/AG2/L14/L16/R2 specs live there). Resolved — no longer a risk.
2. **Cancel-when-dirty confirm — DECIDED (was design open Q1).** Build it: a lightweight confirm on Cancel/breadcrumb when `body.trim()` is non-empty (mirrors the old dialog's `isDirty` guard at `BetCreateDialog.tsx:113`); do NOT intercept browser-back (native back stays unblocked — a route-page win). Rationale: losing typed content on a misclick is a UX regression vs. the dialog even though abandon is data-safe. This is now a planned task, not a mid-green builder choice. Add a unit test: Cancel with empty body navigates immediately (no confirm); Cancel with content shows confirm and only navigates on accept; neither path fires a POST (folds into AC6).
3. **`useTeams` in tests.** No `overrideTeams` prop — the page calls `useTeams()` unconditionally. Component tests must stub `/api/teams` (MSW / QueryClient wrapper, same harness `KnowledgeCreate`/`WorkPortfolio` tests already use) so the hook resolves without real network. Document the stub helper in the test file.
4. **Title preview vs no-title bets.** If body has no leading heading, `deriveTitle` falls back to first line / id behavior — header preview shows "Untitled bet" until content exists. Verify `deriveTitle("", "")` behavior is non-throwing (it is; used by dialog).
5. **AC3 frame parity — RESOLVED to experience-parity (was the critique's WARNING).** Read both edit surfaces cold: bet edit `WorkBet.tsx:1431-1451` and knowledge edit `KnowledgeDetail.tsx:823-833` are each a bare `<div>` → `BodyEditor variant="full" minHeight="200px"` + live save indicator, NEITHER wrapped in the bordered `border-[1.5px] … p-[18px]` create-frame. They already match. The bordered `260px` frame is a *create-chassis* convention only. AC3 is therefore scoped to experience-parity (full-page block editor + autosave indicator), explicitly NOT frame-identity with the create page — no edit-surface engineering needed. The Phase 4 reviewer judges AC3/AC8 against this definition; the side-by-side it must compare is bet-edit ↔ knowledge-edit (both frameless `200px`), not bet-edit ↔ bet-create.
