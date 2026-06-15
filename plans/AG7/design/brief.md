# AG7 Design Brief

```
DESIGN-CLASS: routine  ref=Input,Select,Toggle,Button,Skeleton,ErrorState,EmptyState,Row,StatusChip,Tag  pattern=SettingsPage(existing)
```

## Classification rationale
- **Existing component reference:** YES — every needed element maps to a catalogued primitive (Input, Select, Toggle, Button, Skeleton, ErrorState, EmptyState, Row/ItemList, StatusChip, Tag).
- **Pattern match:** YES — the SettingsPage stacked layout + SectionTitle pattern already exists and ships; Backend section is a fully-compliant reference baseline.
- → **routine.** No variant exploration; the design is the consistency-target mapping. Single approved direction in `approved.md`, rejected directions enumerated there.

## User task
A founder scrolls Settings top-to-bottom configuring the product. The decision they make per section: "change this setting and trust it saved." What wastes their time / erodes trust: ten sections that look built by different people — five label sizes, three dropdown styles, hand-rolled loaders, DaisyUI palette leaks, an undersized input. AG7 makes them feel designed by one hand.

## Reuse inventory (hard gate — zero NEW)
| Needed element | Component | Status |
|---|---|---|
| Section header | `SectionTitle` (local, SettingsPage) | exists |
| Text/number/url/password field | `Input` | exists |
| Textarea | `Input textarea` | exists (adopted AH3) |
| Dropdown | `Select` (AG5) | exists |
| Boolean | `Toggle` | exists |
| Action button | `Button` | exists |
| Loading | `Skeleton` / `SkeletonList` | exists |
| Pane error | `ErrorState compact` | exists |
| Pane empty | `EmptyState compact` | exists |
| List row / table | `Row` / `ItemList` (AG6) | exists |
| Labeled status | `StatusChip` | exists (used by Credentials) |
| Tag/role chip | `Tag` | exists |

**NEW components: none.** Every divergence resolves to an existing primitive.

## Settled (no probe needed — spec/rules/code already answer)
- Layout, section set, IA: fixed (W3, out of scope).
- Card-vs-flat rule: defined in concept, confirmed in approved §2.
- Behavior/persistence: unchanged (spec constraint).
- Tokens: Hearth only, AQ rules (lint-enforced).

## The full target lives in `approved.md`.
