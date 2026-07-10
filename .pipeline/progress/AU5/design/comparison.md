# AU5 Design Comparison

| Dimension | Variant A: Command Center | Variant B: Trigger Workbench | Variant C: Source Ledger |
|---|---|---|---|
| Signature | Six behavior categories with detail pane | Event -> trigger -> agent -> prompt flow | Origin-grouped provenance ledger |
| Component count | Medium: SplitView, category rows, detail forms | Medium-high: event rail, trigger list, flow detail | Low-medium: grouped row ledger plus drawer |
| Density | Balanced, scans categories quickly | Highest for trigger inspection | Highest for provenance audit |
| Primary action surface | Category/item detail pane | Trigger detail pane | Origin row drawer |
| State strategy | One canonical split layout | Distinct event-filtered trigger states | Grouped origin states dominate |
| Motion budget | Split open/fold, row selection | Split open/fold, event filter, row selection | Inline/drawer expansion only |
| Best at | Showing all config kinds in one place | Explaining what will run and why | Explaining plugin/default/override ownership |
| Worst at | Trigger cause/effect is less prominent | Skills/tools/MCP feel secondary | Everyday trigger editing takes extra navigation |
| Phase-2 critique score | 8/10 | 9/10 | 7/10 |

## Screenshots

Mockups are self-contained HTML artifacts:

- `variant-a-command-center/mockup.html`
- `variant-b-trigger-workbench/mockup.html`
- `variant-c-source-ledger/mockup.html`

## Critique Notes

Variant A fits existing Settings patterns best and gives all six required categories equal dignity. Its risk is that the most important new concept, triggers, competes with lower-frequency configuration kinds.

Variant B best matches the product value of AU5: making hidden automation inspectable. It teaches cause/effect without saying architecture words and still leaves room for agents, skills, routines, tools, and MCP as adjacent category tabs/filters.

Variant C solves provenance most explicitly and should donate its disabled-origin language and origin grouping to the approved design. It is not the right base because AU5 is more often used to inspect behavior than to audit plugin inventory.

