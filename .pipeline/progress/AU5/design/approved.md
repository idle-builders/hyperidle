# AU5 Approved Design

## Chosen Variant

Variant B, Trigger Workbench, with the category overview from Variant A and provenance language from Variant C.

## Component Mapping

- Mount as a new Settings section titled `Agent behavior`.
- Use `SplitView` for list/detail editing with `useUiPreference("settings.agentBehavior", 0.42)`.
- Origin pane:
  - Category summary row set for Agents, Triggers, Routines, Skills, Tools, MCP.
  - Event-family filter rows for Task accepted, Assistant message, Routine fired, Bet decomposition, Knowledge action, Proposed call granted.
  - `ItemList` + `Row`; selected rows use Row selected state.
- Main list:
  - Trigger rows use `Row`, `StatusChip`, `Tag`, and compact mono cells for event kind or source id.
  - Non-trigger category rows reuse `Row` with kind tag, active value summary, and origin state chip.
- Detail pane:
  - Header: item name, kind, origin state, override state.
  - Read-only `KeyValue` block: event/kind, active value, default value where safe, origin, value source.
  - Edit block: `Select`, `Input`/textarea primitive, `Toggle`, and `Button` where that kind supports editing.
  - Link block to existing Settings Agents, Agent backends, Connections, or routine editor when canonical edit lives elsewhere.

## Copy And Labels

- Section title: `Agent behavior`
- Header copy: `Inspect and edit the configuration that controls agent work.`
- Trigger fallback row: `Default eligible agent · no event-specific prompt`
- Built-in origin: `Built-in HyperIdle`
- Plugin origin enabled: `<Plugin name> plugin`
- User-owned: `User-owned`
- Override state: `User override active`
- Disabled origin with no override: `Inactive: plugin disabled`
- Disabled origin with override: `Override still runs`
- Removed origin: `Needs attention: origin removed`

## All States

- Loading: `SkeletonList` for category/event rail and primary rows.
- Empty all config: `EmptyState compact`, title `No agent behavior configuration`, description `Defaults still attach eligible agents when no trigger matches.`
- Empty filtered event: `EmptyState compact`, title `No trigger rules for this event`, description `The fallback still uses the default eligible agent with no event-specific prompt.`
- Error: `ErrorState compact`, description `Could not load agent behavior configuration.`
- Populated: event rail, rows, selected detail.
- Disabled origin: row remains visible with amber `StatusChip` and explanatory subtitle.
- Removed origin: row remains visible with amber/error state depending on whether an override remains active.
- Save pending: primary button disabled with busy text; current row stays selected.
- Save error: inline compact error in detail pane; row list not discarded.
- Overflow: left rail and detail pane scroll independently.

## Behavior And Motion

- Selecting an event filters trigger rows.
- Selecting a row opens the detail pane in `split` mode.
- Escape folds detail pane to `fold-back`.
- Enter/Space activates focused rows.
- Save reloads the selected item and keeps focus in the detail pane.
- Reset override appears only when `valueSource="user_override"` and the default origin is enabled or still inspectable.
- Motion uses `--motion-fast` for row hover/save state and `SplitView` built-in seam behavior.

## Responsive

- Desktop: split list/detail.
- Tablet: split defaults to 45/55 and allows fold/full controls.
- Mobile/narrow: category/event selector stacks above rows; selected row opens a full-width detail panel with back action.

## Rejected List

- No separate admin console.
- No plugin marketplace/install UI.
- No Fabric/Strategy vocabulary.
- No display of secret values.
- No per-agent autonomy dial.
- No trigger quality/eval/tuning surface.
- No bulk-edit grid as first screen.

## Open Questions For Architecture

- Whether AU2 exposes all six configuration kinds through one resolved-config endpoint or kind-specific endpoints.
- Whether AU4 trigger history is available as a route in AU5 or only service-level history.
- Which existing routine editor route/component is canonical for schedule editing by AU5 build time.
- Whether tool and MCP config have safe editable fields beyond enable/disable, labels, and server URL references.

