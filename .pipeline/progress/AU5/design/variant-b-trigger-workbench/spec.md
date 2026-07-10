# Variant B: Trigger Workbench

## User Task

A product operator starts from an event and verifies which agent will run, which prompt source applies, and whether the rule is default, plugin-provided, or user-overridden.

## Component Composition

- `SplitView` with occasion/event rail as origin and trigger detail as destination.
- Event rail uses grouped `ItemList` rows: Task, Assistant, Routine, Decomposition, Knowledge, Proposed call.
- Trigger rows use `Row`, `RowDot`, `StatusChip`, and `Tag`.
- Detail uses a compact flow strip: Event -> Trigger -> Agent -> Prompt -> Request evidence.
- Edit controls use `Select`, `Input`, `Button`, and `Toggle` only in the detail pane.

## Information Hierarchy

1. Event that can cause agent work.
2. Rule/fallback that matches it.
3. Agent and prompt source selected by the rule.

## States

- Empty: "No trigger rules yet. Defaults still attach eligible agents."
- Loading: event groups skeleton.
- Error: compact load failure with retry.
- Populated: selected event group plus trigger rows.
- Overflow: event groups remain sticky; trigger rows scroll.

## Behavior

- Selecting an event filters the rule list.
- Selecting a trigger opens detail.
- Keyboard: Arrow Up/Down moves rows, Enter opens detail, Escape closes detail.
- Prompt edits mark the row as user override after save.
- Disabled origin rows remain visible and non-matching unless a user override remains active.

## Responsive Adaptation

On mobile, the event group acts as a segmented list above trigger rows. Detail is a full-screen panel.

## Signature

The surface explains automation as a cause/effect workbench, making triggers the front door.

## Trade-offs

Best for trigger clarity, weaker for broad skills/tools/MCP management because those become secondary tabs or linked categories.

