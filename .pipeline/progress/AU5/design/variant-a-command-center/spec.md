# Variant A: Command Center

## User Task

A product operator scans all agent-behavior configuration by kind, then opens one item to inspect origin, active value, and supported edits.

## Component Composition

- `SplitView` owns category list on the left and item detail on the right.
- Left pane uses `ItemList` + `Row` for six categories: Agents, Triggers, Routines, Skills, Tools, MCP.
- Category rows use `StatusChip` for attention count and `Tag` for origin mix.
- Item list uses `ItemList` + `Row`; selected row opens detail.
- Detail uses `KeyValue`, `StatusChip`, `Tag`, `Select`, `Input`, `Toggle`, and `Button`.

## Information Hierarchy

1. Category health: which behavior area needs attention.
2. Selected item active value and override state.
3. Origin/default details and edit controls.

## States

- Empty: `EmptyState compact`, "No behavior configuration yet."
- Loading: `SkeletonList` with category and row placeholders.
- Error: `ErrorState compact`, "Could not load agent behavior configuration."
- Populated: category list plus selected detail.
- Overflow: left item list scrolls independently; detail uses fixed header and scroll body.

## Behavior

- Row click selects item and opens split mode.
- Enter/Space activates focused row.
- Escape folds detail back.
- Save uses `motion-fast` button state, then reloads selected item.
- Origin chips are read-only; reset override is a secondary destructive action where supported.

## Responsive Adaptation

Below tablet width, category list becomes the primary view. Selecting a row navigates to a full-width detail panel with a back button.

## Signature

Six operational categories act as a command center, with attention counts and override counts visible before the user opens details.

## Trade-offs

Great overview, but trigger cause/effect is secondary because rows are grouped by configuration kind rather than event flow.

