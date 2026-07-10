# Variant C: Source Ledger

## User Task

A product operator audits configuration by origin, understands which plugin or built-in default contributed each item, and resolves disabled/missing origin states.

## Component Composition

- Full-width provenance ledger using grouped `ItemList`/`Row` blocks.
- Group headers use `SectionLabel`: Built-in HyperIdle, Product OS plugin, Growth plugin, User-owned.
- Rows use `StatusChip` for origin health and `Tag` for configuration kind.
- Detail drawer uses `KeyValue`, `Button`, `Select`, `Input`, and `Toggle`.

## Information Hierarchy

1. Origin health and source ownership.
2. Configuration items contributed by that origin.
3. Active value and override status.

## States

- Empty: "No plugin-provided configuration."
- Loading: group skeletons.
- Error: compact error inside the ledger.
- Populated: grouped origin sections.
- Overflow: group headers stay visible as the page scrolls; row details open inline or in a drawer.

## Behavior

- Clicking a source group filters to affected items.
- Disabled-origin rows show whether a user override still runs.
- Reset override appears only for overridden rows.
- Edit supported fields in a row drawer; unsupported fields link to existing Settings areas.

## Responsive Adaptation

Single-column ledger on all widths; row details expand inline on mobile.

## Signature

The origin ledger makes provenance the primary object: operators can answer "what came from this plugin and what still runs?"

## Trade-offs

Excellent for provenance and plugin disable/remove states, but weaker for everyday trigger editing because event cause/effect is one level down.

