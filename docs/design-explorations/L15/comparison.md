# L15 — Variants Comparison

| Dimension | A — `quiet-menu` | B — `inspector-drawer` | C — `linear-palette` |
|---|---|---|---|
| **Signature** | `···` button reveals a menu | Click card → drawer expands inline below it | Focus card + `K` → command palette overlay |
| **Component count delta** | **+0** | **+1 Tier-3 region** (or +0 if treated as a layout pattern) | +0 |
| **Density at rest** | Card identical to today | Card identical to today | Card adds 1 monospace `K` chip on focus |
| **Primary action surface** | Per-card popover anchored to `···` | In-column drawer below selected card | Modal palette overlay anchored to card |
| **State strategy** | One canonical card layout; popover on demand | Card has selected/unselected variants; drawer is selection-derived | One canonical card layout; palette is a global overlay scoped to the focused card |
| **Motion budget** | 80ms popover fade | 150ms drawer height-expand (grid-template-rows) + 80ms verb-chip flash | 80ms palette fade-in + transform-Y |
| **Keyboard hot path to "request stop"** | Tab → Enter → S | Tab → Enter → Tab to verb chip → Enter | Tab → K → S → Enter |
| **Keyboard hot path to "open thread"** | Tab → Enter → O · ↵ | Tab → Enter → Tab through drawer to "Open full thread" link | Tab → K → ↓ ↓ ↓ ↵ |
| **Mouse hot path to "request stop"** | Hover card → click `···` → click "Request stop" (3 steps) | Click card → click "Request stop" chip (2 steps) | Hover card → click `···` → type or click "Request stop" (3 steps) |
| **Mouse hot path to "open thread"** | Hover card → click `···` → click "Open thread" (3 steps) | Click card → click "Open full thread →" (2 steps) | Hover card → click `···` → click "Open thread" (3 steps) |
| **Best at** | Component-budget discipline; quiet at rest; predictable | Hot-path speed for "see the thread"; verb discovery without recall | Keyboard power once learned; teaches agent-decides contract on every open |
| **Worst at** | Discoverability — `···` is invisible until hover | Component budget; layout reflow as drawer expands; mobile model differs from desktop | Pattern is heavier than the problem (palette overhead for 5–7 commands); two grammars (mouse menu vs keyboard palette) |
| **`/design-critique` score** | **7.6 / 10** | **6.7 / 10** (raises to ~7.5 if `TaskInspector` is treated as a layout pattern) | **6.4 / 10** |

## Anti-convergence audit

Variants differ on at least 3 of the 7 axes per pair:

|  | A vs B | A vs C | B vs C |
|---|---|---|---|
| Hierarchy | ✓ same first-glance, differs on second | ✓ both quiet-by-default | ✓ drawer-content-first vs palette-content-first |
| Density | ✓ A unchanged at rest, B adds drawer chrome on selection | ✓ A unchanged, C adds K chip on focus | ✓ B adds 280px+ drawer, C adds 360px palette overlay |
| State strategy | ✓ stable card vs selection-derived drawer | ✓ stable card vs focus-derived chip | ✓ selection vs focus |
| Action surface | ✓ popover vs in-column drawer | ✓ popover vs overlay modal | ✓ in-column drawer vs overlay modal |
| Composition | ✓ TaskCard + DaisyUI dropdown vs TaskCard + drawer block | ✓ TaskCard + dropdown vs TaskCard + palette modal | ✓ drawer vs modal |
| Copy register | ✓ flat verb list vs verbs + thread preview | ✓ flat verb list vs verbs with secondary-text contracts | ✓ verb chips inline vs commands with sub-labels |
| Motion | ✓ 80ms vs 150ms layout | ✓ 80ms vs 80ms (different choreography) | ✓ height-expand vs fade-translate |

All pairs differ on 6/7 axes. Spread is real.

## Side-by-side screenshots

- A — `quiet-menu/screenshot.png`
- B — `inspector-drawer/screenshot.png`
- C — `linear-palette/screenshot.png`
