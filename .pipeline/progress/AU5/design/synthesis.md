# AU5 Design Synthesis

## Strongest Base

Variant B, Trigger Workbench, is the strongest base. AU5's central user value is making agent automation inspectable: when an event happens, which rule matches, which agent acts, and which prompt/source applies. Starting from event families makes that tangible and aligns directly with AU4.

## Pull From Other Variants

- From Variant A: keep a six-category overview so agents, skills, routines, triggers, tools, and MCP are all reachable from one Settings area.
- From Variant C: reuse origin-state language and disabled-origin treatment: "Inactive", "Override runs", "Disabled origin", and "Removed origin".
- From Variant A: use `SplitView` because current Settings Agents and Agent backends already use it for dense list/detail editing.

## Rejected

- Reject a pure category-first command center as the primary shape; it hides the event-to-agent mental model.
- Reject a pure provenance ledger as the primary shape; plugin origin is important but not the operator's first question.
- Reject any separate admin console or plugin-management page.
- Reject Fabric/Strategy labels in empty states, row subtitles, errors, or docs.
- Reject editable secrets in this surface; Connections and credential surfaces remain the secret boundary.

## Approved Direction

Build a Settings "Agent behavior" section with a trigger-first workbench as the primary tab and a persistent category rail/summary for Agents, Skills, Routines, Triggers, Tools, and MCP. Trigger rows show event, matched rule/fallback, selected agent, prompt source, origin, and override state. Detail pane supports focused edits and links out to existing Settings editors where the canonical editor already exists.

