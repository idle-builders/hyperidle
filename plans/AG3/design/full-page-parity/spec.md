# Variant — "Full-page parity" (the chosen and only variant; routine port)

**Constraint:** zero new shapes. Reuse the live `KnowledgeCreate` (`/knowledge/new`) layout verbatim, swapping knowledge-specific commitments (scope pills) for bet-specific commitments (team, appetite) rendered with the AG5 `Select` primitive. The shape is whatever falls out of recombining what already ships.

**Thesis:** the founder said the two experiences must be identical. The fastest, most faithful way to make them identical is to mount the bet pitch in the exact same page chassis the knowledge body already uses. A proven pattern shortens nothing to learn — it IS the knowledge experience.

## User task

A founder creating a new bet writes the pitch as a document on a full-page surface, sets team + (optional) appetite without leaving the writing column, and commits with one Create action.

## Route

New route `work/bet/new` → `WorkBetCreate` page. Registered **before** `work/bet/:betId` in `router.tsx` so the static `new` segment is matched. (React Router v7 ranks static over dynamic, but explicit ordering is defensive and matches how `/knowledge/new` precedes `/knowledge/:knowledgeId` at `router.tsx:84-85`.)

Entry point: `WorkPortfolio` "New bet" button (`WorkPortfolio.tsx:244-251`) changes from `onClick={() => setDialogOpen(true)}` to `onClick={() => navigate("/work/bet/new")}` — the exact change Knowledge made (`KnowledgeList.tsx:1079`). `BetCreateDialog` is deleted.

## Component composition (every element named)

- **Page shell:** `<div className="flex flex-col h-full">` — same as `KnowledgeCreate`.
- **Bordered header** (`shrink-0 px-[24px] py-[18px] border-b border-[var(--border-subtle)]`):
  - Breadcrumb `<nav>`: `Work / <team name | "New bet">  / New` — `<Link to="/work/portfolio">`.
  - Title row: **derived title preview** (read-only `<h2>` / span, 20px/600, shows `deriveTitleFromPitch(body)` live, falls back to "Untitled bet") + actions: Cancel pill (ghost) + Create pill (`accent-primary`). Create disabled until `body.trim()` non-empty AND a team is resolved.
- **Scroll body** (`flex-1 overflow-y-auto`) → centered container (`max-w-[960px] mx-auto p-[24px] flex gap-[24px] items-start`):
  - **Left (editor column, `flex-1`):** error `role="alert"` line (if any) + bordered editor frame (`border-[1.5px] border-[var(--border-default)] rounded-[var(--r-default)] p-[18px]`) wrapping `BodyEditor` (`variant="full"`, `minHeight="260px"`, `placeholder="Describe the bet — problem, appetite, no-gos…"`). Identical frame to `KnowledgeCreate.tsx:190-202`.
  - **Right (commitments aside, `w-[240px] shrink-0`):** a single metadata card (`bg-[var(--surface-page)] rounded-[var(--r-default)] p-[18px] flex flex-col gap-[12px]`) holding:
    - **Team** group: uppercase 12px/600 label + `Select` (`@hyperidle/design-system`, `size="sm"`, `className="w-full"`). Rendered only when `teams.length > 1`; when one team, a static read-only line "Team · <name>" (no picker, matches the dialog's auto-resolve).
    - **Appetite (optional)** group: uppercase label + currency `Select` + number `Input` in a `flex gap-[6px]` row — same shape as `AppetiteDialog` (`WorkBet.tsx:484-508`). Empty = uncapped (sends `costAppetite: null`/omitted).

## Information hierarchy

1. The pitch the founder is writing (the editor column dominates, ~700px wide).
2. The derived title preview in the header (confirms what the bet will be called).
3. The Create action (top-right, accent).
4. Commitments aside (present, peripheral, never competes with the writing column).

## States

- **Empty (initial):** title preview "Untitled bet"; editor placeholder; Create disabled.
- **Writing:** title preview updates live from first heading/line; Create enables once body non-empty + team resolved.
- **Submitting:** Create button → "Creating…", disabled; editor `editable={false}`.
- **Error:** `role="alert"` line above the editor (e.g. "Team 'x' not found", network failure). Form stays usable.
- **Success:** navigate to `/work/bet/<newId>` (the bet detail), same as Knowledge navigates to the new item.
- **Abandon:** Cancel → `/work/portfolio`; breadcrumb or browser-back → leaves with no POST fired → no bet row created.

## Behavior / motion / keyboard

- Focus on mount: the `BodyEditor` (writing is the primary act). Matches a document-first feel.
- Hover/focus on pills + Select: existing component states (`--motion-fast` color transitions).
- Cancel and breadcrumb both route to `/work/portfolio`. Browser back works natively (full route, not a modal) — this also fixes part of the AG4 "one-way door" complaint for free.
- No dirty-guard prompt needed for navigation: nothing is persisted, so leaving is lossless-by-design from the system's view. (Optional nicety: a confirm on Cancel when body is non-empty, mirroring the dialog's `isDirty` guard — kept as an open question for architecture; not required by an AC.)

## Mobile

Single column: editor full-width, commitments aside stacks below (`flex-col` at `<sm`). Inputs ≥16px (AQ-005).

## Signature

The bet create surface is **pixel-indistinguishable in chassis from `/knowledge/new`** — same header band, same centered two-column body, same editor frame, same Cancel/Create pills. The only content difference is the aside (team + appetite instead of scope pills) and a derived (not typed) title. That indistinguishability IS the deliverable.

## Trade-offs / what this is bad at

- Inherits Knowledge's lack of optimistic-lock save parity — but that's explicitly out of scope (spec: register separately).
- The 240px aside is whitespace-heavy with only two short controls; acceptable because it matches the established Knowledge aside and keeps the writing column honest. (Considered and rejected: dropping the aside and putting commitments in a header strip — see synthesis rejection list.)
