# Delete batch — `fw-design-system`

22 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `ArtifactEmbed` | DEV-ONLY (/_dev/artifacts) | Only door is the dev demo route; prod embeds use Fold+ReferenceChip. |
| 2 | `DialogPortalRoot` | DEAD | Zero mounts anywhere; AppShell calls ensureOverlayRoot directly. Its doc comment lies. |
| 3 | `Toast` | DEAD | Zero renders; core-ui's ToastRegion is the real toast system. Second way, no users. |
| 4 | `getDiffRenderer` | DEAD | Zero callers; ReviewCodeDiff imports CodeDeltaRenderer directly. One-entry registry. |
| 5 | `dsShellProps` | INTERNAL (ThreadShell only) | One caller; core-ui shells hand-write the literal anyway. ThreadShell writes the attr inline. |
| 6 | `ArtifactEmbedProps` |  | Dies with ArtifactEmbed. |
| 7 | `ToastProps` |  | Dies with Toast. |
| 8 | `DiffRendererProps` |  | Dies with getDiffRenderer. |
| 9 | `DiffRendererComponent` |  | Dies with getDiffRenderer. |
| 10 | `DsTier` |  | Tier taxonomy nothing reads at runtime. |
| 11 | `DsSource` |  | Same. |
| 12 | `DsShellAttrs` |  | Dies with dsShellProps. |
| 13 | `TypographyRole` |  | Dies with token-profiles.ts — zero runtime consumers. |
| 14 | `MotionProfile` |  | Same. |
| 15 | `BorderWidthProfile` |  | Same. |
| 16 | `TYPOGRAPHY_ROLES` | DEAD (own file + own test only) | Whole token-profiles.ts is a JS mirror of tokens.css nothing imports; census has its own copy. |
| 17 | `TYPE_STYLE` | DEAD | Zero consumers; components use type- CSS classes. |
| 18 | `AVATAR_INITIAL_STYLE` | DEAD | Zero consumers anywhere — Avatar doesn't even use it. |
| 19 | `MOTION_PROFILES` | DEAD | Lint enforces motion via regex, not this const. |
| 20 | `MOTION_STYLE` | DEAD | Zero consumers. |
| 21 | `BORDER_WIDTH_PROFILES` | DEAD | Zero consumers. |
| 22 | `BORDER_WIDTH_STYLE` | DEAD | Zero consumers. |
