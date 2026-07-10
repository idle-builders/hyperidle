DESIGN-CLASS: novel  ref=SettingsAgents/SettingsHarnesses split-view patterns  pattern=none

# AU5 Design Brief

## Task

Design a novel Settings configuration surface where a product operator can inspect and edit the app configuration that controls agent behavior: agents, skills, routines, triggers, tools, and MCP.

## Fixed Requirement

- Preserve current Settings page as the home. Do not create a separate admin console.
- Make origin, active value, and override state visible without teaching AU architecture.
- Trigger rows must show event, selected agent, prompt source, and default/plugin/user ownership.
- Disabled or removed plugin origins must be understandable.
- Existing Settings areas remain reachable.
- No Fabric or Strategy user-facing vocabulary.

## Product Read

The primary task is not bulk editing. It is answering "what will happen and why?" before making a targeted edit. The most common repeated action is inspecting trigger and provenance state, then changing a focused binding.

## Existing Contracts

- Settings is a stacked page centered at `max-w-[680px]`; richer subsections can use `SplitView` like Agents and Agent backends.
- Lists use `ItemList`/`Row`; status uses `StatusChip`; identity labels use `Tag`; forms use `Input`, `Select`, `Toggle`, `Checkbox`, and `Button`.
- Spacing follows the 3/6/9/12/18/24 px grid.
- Pure display lists are flush/contained rows; form expansions are cards.
- Secrets are never displayed.

## Variant Spread

- Variant A, Command Center: kind-first overview with a right detail pane. Best for broad inspection.
- Variant B, Trigger Workbench: event/automation first. Best for understanding what will run.
- Variant C, Source Ledger: origin/provenance first. Best for plugin disable/remove and override debugging.

## Human Concept Review Gate

AU5 is a novel surface and `DOC-CLASS: significant`; human concept review must review the approved design and guide draft before implementation.

