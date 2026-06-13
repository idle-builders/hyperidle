# Variant A — In-pane header

**Thesis:** Stay close to what exists. Back/Forward live next to the breadcrumb, inside each detail screen's existing bordered header row. Nothing new appears at the app-shell level; list/index screens (portfolio, knowledge list, conversations) gain nothing — they're already top-of-hierarchy.

## User task
On a detail screen, the founder sees one header row: `[← →]  Work / Acme / Bet title`. Back/Forward step through history; the breadcrumb names the location and its segments are the Up affordance.

## Component composition
- **`Breadcrumb`** (NEW DS component) renders the `/`-separated trail. Replaces the four hand-rolled versions. Props: `segments: {label, to?}[]` (last segment has no `to` → current, non-link). Leading slot for the Back/Forward cluster.
- **Back/Forward**: two `Button variant="ghost"` icon-only, chevron-left / chevron-right SVG (same SVG as mobile back button). Forward hidden when no forward history; Back disabled (not hidden) when no back history — keeps layout stable, signals "you're at the start."
- Lives in the existing `<header className="... border-b ...">` of WorkBet/WorkTask/KnowledgeDetail; WorkTeam's `max-w-[960px]` header gets the same row.

## Information hierarchy
1. **Title row** (existing `h2`, 20px/600) — unchanged, the task-central content.
2. **Nav row** (above title, 13px) — `[Back][Fwd]` ghost buttons (text-tertiary, ~28px) then the breadcrumb trail. Breadcrumb links are `--text-tertiary`, hover `--accent-primary`; current segment `--text-primary`.
3. Status chips / overflow (existing) — unchanged on the right of the title row.

## States
- **Populated (detail screen):** full row as above.
- **Deep-link / no history:** Back button rendered but `disabled` (40% opacity, no hover, `aria-disabled`); Forward absent. Breadcrumb still fully present → upward path always works. No dead/misleading affordance.
- **List/index screen (portfolio, knowledge list, conversations list):** no nav row at all — these are roots, Back/Forward reachable only via keyboard (⌘[). Rationale: a root screen has no Up and usually no meaningful Back; showing a disabled cluster on every list is chrome noise (Principle: Content First, Chrome Last).
- **Loading:** header renders breadcrumb skeleton segment for the entity name; Back/Forward render immediately (history state is synchronous).
- **Overflow (long titles):** breadcrumb middle segments `truncate max-w-[120px]` (existing WorkTask pattern); Back/Forward never truncate.

## Behavior
- Back click → `navigate(-1)`. Forward click → `navigate(1)`.
- Keyboard (global, via `useNavShortcuts`): ⌘[ Back, ⌘] Forward, ⌘1/2/3 view switch. Guarded against input/textarea/contentEditable.
- Breadcrumb segment click → `navigate(to)` (explicit path = Up).
- Hover: ghost button bg `--surface-container`, motion-fast. Focus: visible ring on buttons + links.
- Motion: none beyond hover/focus color transitions (motion-fast).

## Mobile adaptation
Untouched. Mobile already has its back button in the 48px header (AppShell mobile branch). `Breadcrumb` component renders desktop-only here; mobile keeps its existing chevron. No regression.

## Signature
The nav cluster is *part of the content header* — it scrolls and sits with the title, not as separate global chrome. Feels like the screen owns its own way out.

## Trade-offs
- **Bad at:** list/index screens have no visible Back button (keyboard only). A user on the portfolio who jumped there via ⌘K can't click back — only ⌘[. (Mitigated: roots rarely need visible back; the founder's complaint was about drilling *into* detail screens.)
- Requires touching 4 page headers (+ WorkTeam's different layout). More edit surface than B.
- Back/Forward repeated per-screen conceptually; if a 5th detail screen is added, it must remember to include the cluster.
