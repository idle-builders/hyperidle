# W2 Design Synthesis

## Chosen Direction: Bottom-Up Trickle

The single variant is the strongest (and only) candidate. Its core insight -- fix foundations first, let fixes cascade -- is the standard approach for design system work and is directly mandated by the workpackage spec ("Changes flow from the bottom up").

## Pulled-In Elements

From the rejected directions:

- **From C (Density-Last):** The concern about test stability during density removal is real. The density strip should be a single atomic commit that removes ALL density infrastructure and updates ALL references in one pass, rather than incremental removal that leaves the system in a half-density state. This means the density strip task is larger than a typical task but cannot be split without creating intermediate broken states.

- **From D (HTML-Driven Code Generation):** While full auto-generation is rejected, the builder should use the HTML files as literal reference documents -- reading the CSS values from the HTML and translating them to Tailwind utilities. The HTML props/API shape also informs the TSX props interface.

## Explicit Rejection List

These directions are settled and must NOT be re-litigated during architecture or implementation:

1. **No density system resurrection.** The entire density infrastructure (compact/default/comfortable) is removed. No "maybe keep it for later." AESTHETICS.md AQ-003 is explicit.

2. **No DaisyUI form primitives.** The new Input, Select, Toggle, Checkbox components use custom CSS (matching their HTML references), not DaisyUI's `.input`, `.select`, `.toggle`, `.checkbox` classes. The Hearth styling diverges significantly from DaisyUI defaults (16px radius on inputs, 6px checkbox radius, custom toggle dimensions).

3. **No Tooltip in W2.** Tooltip HTML exists but it requires a positioning system (portal, collision detection, arrow placement). It is not consumed by any other W2 component. Deferred to a follow-up workpackage.

4. **No new components beyond the 10 primitives.** The component budget is sacred. Avatar, AvatarGroup, Button, Input, Select, Toast, TabBar, Toggle, Checkbox, Progress are new. Nothing else gets added.

5. **No page rewrites.** Pages use existing architecture. Component fixes trickle up. Page-level changes are layout adjustments and component swaps, not structural rewrites.

6. **HTML files are NEVER modified for styling.** If there is a pixel diff, the TSX is wrong. This is the visual-parity.md rule.

## Open Questions for Architecture

1. **Export strategy for new primitives:** All 10 new primitives need barrel exports in `packages/design-system/src/index.ts`. Should they follow the same pattern as existing exports (named export + type export)?

2. **SettingsAppearance after density removal:** The settings page currently has density + theme toggles. After density removal, it's theme-only. Does the AppearanceSettings type simplify, or does it keep the Density type for migration?

3. **ESLint plugin changes:** Removing the density lint rules (use-density-tokens, no-density-tokens) also removes the density-allowlist.json. Do any other lint rules reference the allowlist? How do the remaining lint rules handle the transition from density tokens to --space-* tokens?

4. **ds:sync script wiring:** The root package.json has `"ds:sync"` pointing to a non-existent `sync-check` script. Should this be wired to the Playwright visual regression test directly, or should there be a wrapper script?

5. **Test deletion strategy:** Several E2E tests (density-toggle, responsive-density) and unit tests (density-tier, auto-density, useDensity) get deleted entirely. Other test files (foundation.test.ts, AppShell.test.tsx, settings-redesign.spec.ts, touch-targets.spec.ts) need surgical removal of density-specific assertions while preserving non-density tests. Should deleted test coverage be replaced with new tests (e.g., a test asserting "no density tokens in codebase")?
