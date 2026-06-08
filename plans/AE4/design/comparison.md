# AE4 Design Comparison

## Anti-convergence check

| Axis | Variant A (Drawer) | Variant B (Bottom Tabs) | Different? |
|---|---|---|---|
| **Hierarchy** | Primary = content, secondary = mobile header, tertiary = sidebar (hidden) | Primary = content, secondary = tab bar (always visible), tertiary = header | Yes |
| **Density** | Full viewport for content; drawer is an overlay, zero permanent nav chrome | Content minus ~104px (48px header + 56px tab bar) permanent chrome | Yes |
| **State strategy** | Two states: drawer open / closed. Main pane unchanged. | One state: tabs always visible. View switching is instant, not modal. | Yes |
| **Motion** | Drawer slide-in + scrim fade (240ms); closing animation | No nav animation; view content transitions only | Yes |
| **Action surface** | Nav verbs in drawer (hidden until opened) | Nav verbs in tab bar (always exposed) | Yes |
| **Composition** | Sidebar component reused unchanged; wrapper adds drawer behavior | Sidebar not rendered; new TabBar shell element + restructured header | Yes |

Variants differ on 6/6 axes. Anti-convergence satisfied.

## Side-by-side comparison

| Dimension | Variant A: Drawer Sidebar | Variant B: Bottom Tab Bar |
|---|---|---|
| **Signature** | Familiar drawer pattern; sidebar slides from left | Native-feel tab bar at bottom; always-on badges |
| **Component count** | +0 design-system, +2 shell elements (MobileHeader, drawer wrapper) | +0 design-system, +2 shell elements (MobileTopHeader, MobileTabBar) |
| **Density** | Maximum — full viewport for content, no persistent chrome except 48px header | High — content minus 104px for header + tabs, but badges always visible |
| **Primary action surface** | Verdict buttons in ThreadShell (bottom of message stream) | Same — verdict buttons in ThreadShell. Plus: view-switching in tab bar |
| **State strategy** | Binary: drawer open/closed. Main pane layout unchanged. | Single state: tabs always visible. No modal navigation. |
| **Motion budget** | Drawer: 240ms slide + scrim fade. Moderate. | Near-zero for navigation. Tabs switch instantly. |
| **Best at** | Maximum content space. Conceptual parity with desktop. Low code diff. | Quick view switching. Always-visible badges for triage awareness. Thumb-reachable nav. |
| **Worst at** | View switching requires 3 taps. Badges hidden until drawer opened. Hamburger in worst thumb zone. | Loses sidebar sub-items (thread shortcuts, team list). CoC trigger displaced. 104px permanently consumed. |

## Scoring (in-session Phase 2 critique)

Scoring against the 9 design dimensions:

| Dimension | A: Drawer | B: Tabs | Notes |
|---|---|---|---|
| 1. Hierarchy | 7 | 8 | B: tab bar + badges provide persistent orientation; A: navigation hidden behind drawer |
| 2. Spacing/density | 8 | 7 | A: more content space; B: tab bar consumes permanent vertical space |
| 3. Typography | 7 | 7 | Both use same type scale; mobile header titles truncate identically |
| 4. Color/tokens | 8 | 8 | Both use Hearth tokens exclusively |
| 5. Coherence | 8 | 6 | A: same sidebar everywhere; B: different nav paradigm on mobile vs desktop |
| 6. States | 7 | 8 | B: simpler — no modal drawer state to manage. A: drawer open/close adds complexity |
| 7. Accessibility | 7 | 8 | B: persistent tabs are WAI-ARIA tablist. A: focus-trap drawer needs careful management |
| 8. Anti-slop | 8 | 7 | A: no new visual elements; B: tab bar is familiar but adds a permanent element |
| 9. Premium polish | 7 | 7 | Both are clean; neither introduces Hearth signature elements beyond what exists |
| **Total** | **67/90** | **66/90** | Essentially tied |

## Analysis

The scores are nearly equal because these are both well-understood mobile patterns with clear trade-offs. The decision comes down to two factors:

1. **The primary user task.** The founder opens the app to review and unblock agents. This means: land on Conversations, read thread, tap verdict. View-switching is secondary. Variant A gives more screen space to the thread content. Variant B's tab bar occupies space that doesn't help the primary flow.

2. **Desktop parity.** The CLAUDE.md rule says "Desktop is the primary form factor." The docs currently say "desktop-only." Variant A maintains a single mental model (sidebar navigation). Variant B introduces a second paradigm. For v1 mobile, minimizing new patterns is the safer choice.

3. **Implementation complexity.** Variant A requires wrapping the existing Sidebar in a drawer + adding a mobile header. Variant B requires NOT rendering the Sidebar + building a tab bar + relocating CoC trigger + managing sub-navigation that the sidebar handles. A has lower implementation risk.

4. **Badge visibility.** Variant B's always-visible badge counts are a genuine advantage. However, the mobile header in Variant A can also surface a badge (e.g., a dot on the hamburger icon indicating "items need attention"). This narrows the gap.
