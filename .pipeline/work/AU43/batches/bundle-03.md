# Delete bundle 3 — fw-design-system

22 convicted rows across 1 package(s).

| # | Package | Symbol | Reach | Why convicted |
|---|---|---|---|---|
| 1 | fw-design-system | `ArtifactEmbed` | DEV-ONLY (/_dev/artifacts) | Only door is the dev demo route; prod embeds use Fold+ReferenceChip. |
| 2 | fw-design-system | `DialogPortalRoot` | DEAD | Zero mounts anywhere; AppShell calls ensureOverlayRoot directly. Its doc comment lies. |
| 3 | fw-design-system | `Toast` | DEAD | Zero renders; core-ui's ToastRegion is the real toast system. Second way, no users. |
| 4 | fw-design-system | `getDiffRenderer` | DEAD | Zero callers; ReviewCodeDiff imports CodeDeltaRenderer directly. One-entry registry. |
| 5 | fw-design-system | `dsShellProps` | INTERNAL (ThreadShell only) | One caller; core-ui shells hand-write the literal anyway. ThreadShell writes the attr inline. |
| 6 | fw-design-system | `ArtifactEmbedProps` |  | Dies with ArtifactEmbed. |
| 7 | fw-design-system | `ToastProps` |  | Dies with Toast. |
| 8 | fw-design-system | `DiffRendererProps` |  | Dies with getDiffRenderer. |
| 9 | fw-design-system | `DiffRendererComponent` |  | Dies with getDiffRenderer. |
| 10 | fw-design-system | `DsTier` |  | Tier taxonomy nothing reads at runtime. |
| 11 | fw-design-system | `DsSource` |  | Same. |
| 12 | fw-design-system | `DsShellAttrs` |  | Dies with dsShellProps. |
| 13 | fw-design-system | `TypographyRole` |  | Dies with token-profiles.ts — zero runtime consumers. |
| 14 | fw-design-system | `MotionProfile` |  | Same. |
| 15 | fw-design-system | `BorderWidthProfile` |  | Same. |
| 16 | fw-design-system | `TYPOGRAPHY_ROLES` | DEAD (own file + own test only) | Whole token-profiles.ts is a JS mirror of tokens.css nothing imports; census has its own copy. |
| 17 | fw-design-system | `TYPE_STYLE` | DEAD | Zero consumers; components use type- CSS classes. |
| 18 | fw-design-system | `AVATAR_INITIAL_STYLE` | DEAD | Zero consumers anywhere — Avatar doesn't even use it. |
| 19 | fw-design-system | `MOTION_PROFILES` | DEAD | Lint enforces motion via regex, not this const. |
| 20 | fw-design-system | `MOTION_STYLE` | DEAD | Zero consumers. |
| 21 | fw-design-system | `BORDER_WIDTH_PROFILES` | DEAD | Zero consumers. |
| 22 | fw-design-system | `BORDER_WIDTH_STYLE` | DEAD | Zero consumers. |
