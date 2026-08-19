# design-system — destroyer verdict (framework)

## Where does this package go?

**Verdict: DISSOLVE → `layers/core-ui`**

One real code consumer. Measured with `rg -a -l "@hyperidle/design-system" layers framework applications tools`:

- `layers/core-ui` — the only package that imports code from it. Every page, shell, and component.
- `framework/domain-model/src/team.ts` — a **comment only** (@lore explaining why it deliberately does NOT import the `Status` type). Not a consumer.
- `tools/eslint-plugin-design`, `tools/repo-gates` — **strings and paths only**: lint messages that mention the package name, `TARGET_DIRS` path prefixes, the typecheck-gate leaf pre-build list, census package sets. No rule imports a runtime symbol from it. The census tool even carries its **own copy** of `TYPOGRAPHY_ROLES`/`MOTION_PROFILES` rather than importing them.
- `applications/*` — zero imports. Web/desktop consume `core-ui`, never design-system directly.

A "framework" package with one consumer is a package boundary invented for tidiness. Move `framework/design-system/src/*` into `layers/core-ui/src/ds/` (components keep their `.stories.tsx` siblings — the require-stories-sibling rule already covers core-ui component dirs), move `tokens.css` with it, delete the package. Bonus kills that fall out for free: the design-system leaf pre-build special case in `tools/repo-gates/src/typecheck-gate.ts` (AF5 lore — existed only so core-ui tests could resolve dist types), the 30-line dual dependency/devDependency tiptap list in its `package.json`, and the 251-line barrel `index.ts`.

## Consumers (measured, not assumed)

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-ui` | Everything — components, hooks, status mapping, tokens.css | Yes. It is the only importer. It owns this. |
| `framework/domain-model` | Nothing (comment reference only) | n/a |
| `tools/eslint-plugin-design` | Nothing at runtime — path strings + message text | Yes — update `TARGET_DIRS` strings on move |
| `tools/repo-gates` | Nothing at runtime — path strings, own copies of profile lists | Yes — delete the ds leaf-build entry on move |

## If written today, from scratch

A `ds/` folder inside core-ui: ~45 rendered components with stories (Button, Input, Dialog+useDialogBehavior, Row/ItemList, PageHeader/PageScaffold, thread stack, block renderer, artifact renderer, status mapping, Skeleton/Empty/Error states). No package, no barrel, no tier taxonomy, no JS token mirrors, no renderer registries with one entry. Internal helpers stay module-private instead of being exported for tests.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 22 |
| MERGE | 2 |
| SIMPLIFY | 57 |
| KEEP | 170 |

Surface: 251 exports → package deleted (100% of the package boundary); 170 of 251 symbols survive as core-ui modules, 57 of those drop off the public surface (module-internal after the move), 22 symbols + 2 merges die outright. Public importable surface 251 → ~113 (55% cut).

## Feature-level kills

1. **`Toast` component** — zero renders anywhere. core-ui ships its own `shell/ToastRegion` with its own toast UI; this is the second way that lost. Dies with `ToastProps` and its story.
2. **`DialogPortalRoot`** — zero mounts in any layer or application. `AppShell` calls `ensureOverlayRoot()` directly; the component's own doc comment claiming "the app shell also calls this via DialogPortalRoot" is false. Dies with its story; fix the stale comment in `useDialogBehavior.ts:74`.
3. **`ArtifactEmbed`** — only render site is the dev demo route `/_dev/artifacts` (`layers/core-ui/src/pages/_dev/ArtifactDemo.tsx`, router.tsx:110). Production thread embeds use `Fold`+`ReferenceChip` (`parts/embeds.tsx`) and artifact surfaces use `ArtifactPreview`/`GalleryCard`/`StackItem` (`ArtifactSection.tsx`). A component whose only door is a demo page is a demo, not a feature. Dies with `ArtifactEmbedProps`, its story, and its `tokens.css` class.
4. **Diff-renderer registry (`diff/select-diff.tsx`)** — `getDiffRenderer(kind)` has zero callers; `ReviewCodeDiff.tsx` imports `CodeDeltaRenderer` directly. A registry with one entry and no lookups. Dies with `DiffRendererProps`/`DiffRendererComponent`.
5. **`token-profiles.ts` — the whole runtime module** — `TYPE_STYLE`, `TYPOGRAPHY_ROLES`, `AVATAR_INITIAL_STYLE`, `MOTION_PROFILES`, `MOTION_STYLE`, `BORDER_WIDTH_PROFILES`, `BORDER_WIDTH_STYLE` and their three types have **zero runtime consumers** — not one component in design-system or core-ui imports them (verified content-level: only the defining file matches). Components use the `type-*` / `--motion-*` CSS classes from `tokens.css`; the lint rules enforce via regex; the census tool has its own copy of the lists. This is a parallel JS mirror of the CSS tokens that nothing reads. Dies with its AZ16 test.
6. **The DS tier/source instrumentation taxonomy** — `dsProps(name, tier)` / `dsShellProps` stamp `data-ds-component`/`data-ds-tier`/`data-ds-source` for a "K4 inspector" that never shipped as product. Runtime readers: none. Actual readers: e2e selectors (dev), the require-ds-attribute lint rule, the census gate. core-ui already hand-writes bare `data-ds-component` literals in a dozen places (SessionView.tsx etc.), so the helper isn't even the single way. Keep the *name* attribute as the e2e selector convention; delete tier, source, `dsShellProps`, `DsTier`, `DsSource`, `DsShellAttrs`.
7. **Exported-for-test internals** — `computeSenderGrouping`, `clickableProps`, `filterSlashItems`, `SLASH_MENU_ITEMS`, `clampFrameHeight`, `escapeSrcdocAttribute`, `buildArtifactDocument`, 7 of the 8 status maps: each export exists only so a test can import it (several say so in their own @lore). Un-export all; tests exercise the public door instead.
8. **The block-payload "promotion"** — 10 payload components + `renderInline` were barrel-exported "so each is individually reviewable" (a process reason, not a product one). Production reaches them exclusively through `renderPayload`/`Block`. All become internal modules of the block renderer.

## Full method audit

Reach tags: `UI:<n files>` = imported by n core-ui production files (the only door into this package); `INTERNAL` = only other design-system modules; `DEV-ONLY` = only stories/tests/dev routes; `DEAD` = nothing. All DEAD/DEV-ONLY rows confirmed with `rg -a` across layers/framework/applications/tools.

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `ArtifactEmbed` | DEV-ONLY (/_dev/artifacts) | DELETE | Only door is the dev demo route; prod embeds use Fold+ReferenceChip. |
| 2 | `ArtifactFrame` | INTERNAL (compose-artifact-body) | SIMPLIFY | Sandboxed-iframe renderer for html artifacts — keep, un-export; only the artifact composer uses it. |
| 3 | `ArtifactGalleryCard` | UI:1 (ArtifactSection) | KEEP | Artifact gallery is a shipped surface. |
| 4 | `ArtifactKindBadge` | UI:1 (KnowledgeList) | KEEP | Rendered in knowledge list. |
| 5 | `ArtifactPreview` | UI:2 (ArtifactPermalink, ArtifactSection) | KEEP | The artifact rendering door. |
| 6 | `ArtifactPreviewSurface` | INTERNAL (4 artifact components) | SIMPLIFY | Shared internal surface; un-export. |
| 7 | `ArtifactStackItem` | UI:1 (ArtifactSection) | KEEP | Stack layout in artifact section. |
| 8 | `ArtifactTimestamp` | INTERNAL (4 artifact components) | SIMPLIFY | Internal date chip; un-export. |
| 9 | `Avatar` | UI:8 | KEEP | Foundation primitive, everywhere. |
| 10 | `AvatarGroup` | UI:2 | KEEP | Used in team/thread rows. |
| 11 | `BetCard` | UI:4 | KEEP | Bets are a core primitive. |
| 12 | `Block` | UI:10 | KEEP | Block is a core content primitive. |
| 13 | `BlockActionsPopover` | UI:2 | KEEP | Block actions door. |
| 14 | `BlockHandle` | UI:1 (KnowledgeBody) | KEEP | Block discussion handle. |
| 15 | `BodyEditor` | UI:6 | KEEP | The WYSIWYG editor — core authoring. |
| 16 | `Breadcrumb` | UI:11 | KEEP | Nav orientation, everywhere. |
| 17 | `Checkbox` | UI:1 (ReviewCodeDiff) | KEEP | Form primitive, custom CSS, in use. |
| 18 | `CommentRow` | UI:3 | KEEP | Conversation rendering core. |
| 19 | `Composer` | UI:5 | KEEP | Message input — core. |
| 20 | `Dialog` | UI:7 | KEEP | The overlay primitive. |
| 21 | `DialogPortalRoot` | DEAD | DELETE | Zero mounts anywhere; AppShell calls ensureOverlayRoot directly. Its doc comment lies. |
| 22 | `DiscardConfirmStrip` | INTERNAL (Dialog only) | MERGE | One consumer; fold into Dialog.tsx. |
| 23 | `EmptyState` | UI:24 | KEEP | Most-used state component. |
| 24 | `ErrorState` | UI:26 | KEEP | Most-used state component. |
| 25 | `Fold` | UI:4 | KEEP | Thread embed collapse device. |
| 26 | `ItemList` | UI:11 | KEEP | List container primitive. |
| 27 | `KeyValue` | UI:6 | KEEP | Detail-pane primitive. |
| 28 | `KnowledgeRow` | UI:5 | KEEP | Knowledge list row. |
| 29 | `KpiStat` | INTERNAL (compose-artifact-body) | SIMPLIFY | Only the data-artifact renderer uses it; un-export. |
| 30 | `LiveDot` | UI:3 | KEEP | Agent activity indicator. |
| 31 | `Menu` | UI:4 | KEEP | Popover menu primitive. |
| 32 | `NavItem` | UI:1 (Sidebar) | KEEP | The sidebar nav row. |
| 33 | `NotificationRow` | UI:2 | KEEP | Notification surface row. |
| 34 | `PageFrame` | INTERNAL (PageHeader, PageScaffold) | SIMPLIFY | Layout shim two siblings share; un-export. |
| 35 | `PageHeader` | UI:20 | KEEP | Canonical page title strip, lint-enforced. |
| 36 | `PageScaffold` | UI:19 | KEEP | Canonical scroll contract, lint-enforced. |
| 37 | `Progress` | UI:1 (WorkBet) | KEEP | Bet progress bar. |
| 38 | `ReferenceChip` | UI:5 | KEEP | Attachment/reference primitive. |
| 39 | `RichMessageCard` | UI:1 (Conversations) | KEEP | Blocking-message card in the core conversation surface. |
| 40 | `RoleCombobox` | UI:1 (AgentEditor) | KEEP | Agent role picker. |
| 41 | `Row` | UI:15 | KEEP | The list-row primitive. |
| 42 | `RowDot` | UI:3 | KEEP | Row status dot. |
| 43 | `ScopePicker` | UI:4 | KEEP | Knowledge scope control. |
| 44 | `SectionLabel` | UI:7 | KEEP | Canonical section heading. |
| 45 | `Select` | UI:15 | KEEP | Form primitive, everywhere. |
| 46 | `Skeleton` | UI:3 | KEEP | Loading primitive. |
| 47 | `SkeletonList` | UI:14 | KEEP | Loading primitive, everywhere. |
| 48 | `SkeletonCard` | UI:6 | KEEP | Loading primitive. |
| 49 | `Sparkline` | INTERNAL (compose-artifact-body) | SIMPLIFY | Only the data-artifact renderer uses it; un-export. |
| 50 | `SplitView` | UI:8 | KEEP | AV4 split-pane — shipped core layout. |
| 51 | `StatusChip` | UI:18 | KEEP | The status primitive. |
| 52 | `TabBar` | UI:1 (SessionActivityPanel) | KEEP | Session panel tabs. |
| 53 | `Tag` | UI:8 | KEEP | Tag primitive. |
| 54 | `TaskCard` | UI:3 | KEEP | Tasks are a core primitive. |
| 55 | `ThreadHostBanner` | INTERNAL (ThreadShell, ThreadRow) | SIMPLIFY | Only thread internals render it; un-export. |
| 56 | `ThreadRow` | UI:4 | KEEP | Conversation list row — core. |
| 57 | `computeSenderGrouping` | INTERNAL (ThreadShell) + TEST-ONLY export | SIMPLIFY | Un-export; the export exists for one core-ui test and forced the typecheck-gate leaf-build hack (AF5). |
| 58 | `ThreadShell` | UI:5 | KEEP | The thread surface — core. |
| 59 | `Toast` | DEAD | DELETE | Zero renders; core-ui's ToastRegion is the real toast system. Second way, no users. |
| 60 | `Toggle` | UI:4 | KEEP | Settings switch primitive. |
| 61 | `clampFrameHeight` | INTERNAL + TEST-ONLY export | SIMPLIFY | Same-module helper exported for tests; un-export. |
| 62 | `escapeSrcdocAttribute` | INTERNAL (same file) | SIMPLIFY | Same-file helper; drop the export keyword. |
| 63 | `buildArtifactDocument` | INTERNAL (same file) + TEST-ONLY export | SIMPLIFY | Only buildArtifactSrcdoc calls it; un-export. |
| 64 | `buildArtifactSrcdoc` | INTERNAL (ArtifactFrame) | KEEP | The CSP+sandbox srcdoc builder — isolation is the artifact security model. |
| 65 | `CodePayload` | INTERNAL (renderPayload) | SIMPLIFY | Reached only via renderPayload; un-export from barrel. |
| 66 | `DividerPayload` | INTERNAL (renderPayload) | SIMPLIFY | Same — un-export. |
| 67 | `headingIdentityMatches` | UI:3 (ArtifactPermalink, 2 review pages) | KEEP | Real dedup logic at three doors. |
| 68 | `HeadingPayload` | INTERNAL (renderPayload; the core-ui "hit" is a CSS comment) | SIMPLIFY | Un-export. |
| 69 | `HtmlPayload` | INTERNAL (renderPayload) | SIMPLIFY | Un-export. |
| 70 | `ImagePayload` | INTERNAL (renderPayload) | SIMPLIFY | Un-export. |
| 71 | `ListPayload` | INTERNAL (renderPayload) | SIMPLIFY | Un-export. |
| 72 | `ParagraphPayload` | INTERNAL (renderPayload) | SIMPLIFY | Un-export. |
| 73 | `QuotePayload` | INTERNAL (renderPayload) | SIMPLIFY | Un-export. |
| 74 | `TablePayload` | INTERNAL (renderPayload) | SIMPLIFY | Un-export. |
| 75 | `UnknownPayload` | INTERNAL | KEEP | Already internal; the never-crash fallback. |
| 76 | `renderInline` | INTERNAL (payload modules) | SIMPLIFY | Un-export from barrel. |
| 77 | `renderPayload` | UI:1 (BlockRefEmbed) + INTERNAL (Block) | KEEP | The block-payload door. |
| 78 | `buildFullExtensions` | INTERNAL (useBodyEditor) | KEEP | Editor wiring, already internal. |
| 79 | `buildMiniExtensions` | INTERNAL (useBodyEditor) | KEEP | Mini editor variant wiring, already internal. |
| 80 | `FloatingToolbar` | INTERNAL (BodyEditor) | KEEP | Editor internal, already internal. |
| 81 | `filterSlashItems` | INTERNAL (same file) + TEST-ONLY export | SIMPLIFY | @lore admits it's exported for tests; un-export. |
| 82 | `buildSlashMenuExtension` | INTERNAL (extensions) | KEEP | Editor internal, already internal. |
| 83 | `useBodyEditor` | INTERNAL (BodyEditor) | KEEP | Editor internal, already internal. |
| 84 | `clickableProps` | INTERNAL (7 components) + TEST-ONLY export | SIMPLIFY | Un-export from barrel; its dedicated core-ui test dies with the export. |
| 85 | `CodeDeltaRenderer` | UI:1 (ReviewCodeDiff) | KEEP | The code diff renderer for reviews. |
| 86 | `getDiffRenderer` | DEAD | DELETE | Zero callers; ReviewCodeDiff imports CodeDeltaRenderer directly. One-entry registry. |
| 87 | `dsProps` | INTERNAL (50 files); attrs read by e2e/lint/census only | SIMPLIFY | Keep as `dsProps(name)` emitting only data-ds-component (e2e selector); delete tier+source theater. |
| 88 | `dsShellProps` | INTERNAL (ThreadShell only) | DELETE | One caller; core-ui shells hand-write the literal anyway. ThreadShell writes the attr inline. |
| 89 | `ArtifactUnrenderable` | INTERNAL (compose-artifact-body) | KEEP | Already internal; honest never-crash fallback for unknown kinds. |
| 90 | `composeArtifactBody` | INTERNAL (ArtifactPreviewSurface); zero external prod importers | SIMPLIFY | Barrel export nobody imports; un-export. |
| 91 | `taskStateToStatus` | UI:2 | KEEP | Domain→chip mapping at real doors. |
| 92 | `knowledgeStatusToStatus` | UI:2 | KEEP | Same. |
| 93 | `betStatusToStatus` | UI:2 | KEEP | Same. |
| 94 | `sessionOutcomeToStatus` | UI:1 | KEEP | Same. |
| 95 | `routineStateToStatus` | UI:2 | KEEP | Same. |
| 96 | `betOutcomeVerdictToStatus` | UI:1 | KEEP | Same. |
| 97 | `taskOutcomeVerdictToStatus` | UI:1 | KEEP | Same. |
| 98 | `agentOperationalStatusToStatus` | UI:2 | KEEP | Same. |
| 99 | `ensureOverlayRoot` | UI:1 (AppShell) + INTERNAL | KEEP | The real overlay-root mechanism (replaces DialogPortalRoot). |
| 100 | `useDialogBehavior` | UI:4 | KEEP | The dialog behavior contract, lint-enforced. |

## Types / DI ports

Verdicts follow the owning component unless noted. "un-export" = survives as module-internal type after the dissolve.

| Declaration | Verdict | Reason |
|---|---|---|
| `ArtifactEmbedProps` | DELETE | Dies with ArtifactEmbed. |
| `ArtifactFrameProps` | SIMPLIFY | Un-export with ArtifactFrame. |
| `ArtifactGalleryCardProps` | KEEP | Rides its component. |
| `ArtifactKindBadgeProps` | KEEP | Rides its component. |
| `ArtifactPreviewProps` | KEEP | Rides its component. |
| `ArtifactPreviewSurfaceProps` | SIMPLIFY | Un-export with its component. |
| `ArtifactStackItemProps` | KEEP | Rides its component. |
| `ArtifactTimestampProps` | SIMPLIFY | Un-export with its component. |
| `AvatarProps` | KEEP | Rides its component. |
| `AvatarGroupProps` | KEEP | Rides its component. |
| `BetCardLeadAvatar` | KEEP | Rides BetCard. |
| `BetCardAvatarGroup` | KEEP | Already internal. |
| `BetCardProps` | KEEP | Rides BetCard; 16 members is prop bloat but every one is rendered. |
| `BlockSlots` | KEEP | Rides Block. |
| `BlockProps` | KEEP | Rides Block. |
| `BlockAction` | KEEP | Rides BlockActionsPopover. |
| `BlockActionsPopoverProps` | KEEP | Rides its component. |
| `BlockHandleProps` | KEEP | Rides its component. |
| `BodyEditorProps` | KEEP | Rides its component. |
| `BreadcrumbSegment` | KEEP | Rides Breadcrumb. |
| `BreadcrumbProps` | KEEP | Rides Breadcrumb. |
| `ButtonProps` | KEEP | Rides Button. |
| `CheckboxProps` | KEEP | Rides Checkbox. |
| `CommentRowSender` | KEEP | Rides CommentRow. |
| `CommentRowRichSlots` | KEEP | Already internal. |
| `CommentRowProps` | KEEP | Rides CommentRow. |
| `ComposerSubmitInput` | KEEP | Rides Composer. |
| `ComposerProps` | KEEP | Rides Composer. |
| `DialogSize` | KEEP | Rides Dialog. |
| `DialogProps` | KEEP | Rides Dialog. |
| `DiscardConfirmStripProps` | MERGE | Folds into Dialog.tsx with its component. |
| `EmptyStateProps` | KEEP | Rides its component. |
| `ErrorStateProps` | KEEP | Rides its component. |
| `FoldProps` | KEEP | Rides Fold. |
| `InputProps` | KEEP | Rides Input. |
| `ItemListEmpty` | KEEP | Rides ItemList. |
| `ItemListError` | KEEP | Rides ItemList. |
| `ItemListProps` | KEEP | Rides ItemList. |
| `KeyValueProps` | KEEP | Rides KeyValue. |
| `KnowledgeRowSignals` | KEEP | Already internal. |
| `KnowledgeRowProps` | KEEP | Rides KnowledgeRow. |
| `KpiStatProps` | SIMPLIFY | Un-export with KpiStat. |
| `MenuItem` | KEEP | Rides Menu. |
| `MenuProps` | KEEP | Rides Menu. |
| `NavItemProps` | KEEP | Rides NavItem. |
| `NotificationRowProps` | KEEP | Rides its component. |
| `PageFrameProps` | SIMPLIFY | Un-export with PageFrame. |
| `PageHeaderProps` | KEEP | Rides PageHeader. |
| `PageScaffoldProps` | KEEP | Rides PageScaffold. |
| `ProgressProps` | KEEP | Rides Progress. |
| `ReferenceChipKind` | KEEP | Rides ReferenceChip. |
| `ReferenceChipMode` | KEEP | Rides ReferenceChip. |
| `ReferenceChipProps` | KEEP | Rides ReferenceChip. |
| `RichMessageCardSender` | KEEP | Rides RichMessageCard. |
| `RichMessageCardAction` | KEEP | Rides RichMessageCard. |
| `RichMessageCardState` | KEEP | Rides RichMessageCard. |
| `RichMessageCardResolved` | KEEP | Rides RichMessageCard. |
| `RichMessageCardProps` | KEEP | Rides RichMessageCard. |
| `RoleOption` | KEEP | Rides RoleCombobox. |
| `RoleComboboxProps` | KEEP | Rides RoleCombobox. |
| `ItemListContextValue` | SIMPLIFY | Internal Row↔ItemList contract; un-export with ItemListContext. |
| `RowCell` | KEEP | Rides Row. |
| `RowProps` | KEEP | Rides Row. |
| `RowTone` | KEEP | Rides RowDot. |
| `RowDotProps` | KEEP | Rides RowDot. |
| `ScopePickerOption` | KEEP | Rides ScopePicker. |
| `ScopePickerProps` | KEEP | Rides ScopePicker. |
| `SearchFieldProps` | KEEP | Rides SearchField. |
| `SectionLabelProps` | KEEP | Rides SectionLabel. |
| `SelectProps` | KEEP | Rides Select. |
| `SkeletonListProps` | KEEP | Rides Skeleton family. |
| `SkeletonProps` | KEEP | Rides Skeleton family. |
| `SkeletonCardProps` | KEEP | Rides Skeleton family. |
| `SparklineProps` | SIMPLIFY | Un-export with Sparkline. |
| `FoldMode` | KEEP | Rides SplitView (prod:8). |
| `SplitViewProps` | KEEP | Rides SplitView. |
| `Status` | KEEP | The chip status vocabulary, used across core-ui signatures. |
| `StatusChipProps` | KEEP | Rides StatusChip. |
| `TabBarProps` | KEEP | Rides TabBar. |
| `TagProps` | KEEP | Rides Tag. |
| `TaskCardProps` | KEEP | Rides TaskCard. |
| `ThreadHostBannerParticipant` | SIMPLIFY | Un-export with ThreadHostBanner. |
| `ThreadHostBannerProps` | SIMPLIFY | Un-export with ThreadHostBanner. |
| `ThreadAvatarItem` | KEEP | Already internal. |
| `ThreadRowProps` | KEEP | Rides ThreadRow. |
| `ThreadShellIdentity` | KEEP | Rides ThreadShell. |
| `ThreadShellAppendInput` | KEEP | Rides ThreadShell. |
| `ThreadShellProps` | KEEP | Rides ThreadShell. |
| `ToastProps` | DELETE | Dies with Toast. |
| `ToggleProps` | KEEP | Rides Toggle. |
| `CodePayloadProps` | SIMPLIFY | Un-export with its payload. |
| `HeadingPayloadProps` | SIMPLIFY | Un-export with its payload. |
| `AuthoredOutlineContext` | SIMPLIFY | No production importer outside the payload chain; un-export. |
| `HtmlPayloadProps` | SIMPLIFY | Un-export with its payload. |
| `ImagePayloadProps` | SIMPLIFY | Un-export with its payload. |
| `ListPayloadProps` | SIMPLIFY | Un-export with its payload. |
| `ParagraphPayloadProps` | SIMPLIFY | Un-export with its payload. |
| `QuotePayloadProps` | SIMPLIFY | Un-export with its payload. |
| `TablePayloadProps` | SIMPLIFY | Un-export with its payload. |
| `UnknownPayloadProps` | KEEP | Already internal. |
| `SlashMenuItem` | KEEP | Already internal. |
| `UseBodyEditorOptions` | KEEP | Already internal. |
| `CodeDelta` | KEEP | Rides CodeDeltaRenderer (review diff door). |
| `DiffLineRef` | KEEP | Rides CodeDeltaRenderer. |
| `CodeDeltaProps` | KEEP | Rides CodeDeltaRenderer. |
| `DiffRendererProps` | DELETE | Dies with getDiffRenderer. |
| `DiffRendererComponent` | DELETE | Dies with getDiffRenderer. |
| `DsTier` | DELETE | Tier taxonomy nothing reads at runtime. |
| `DsSource` | DELETE | Same. |
| `DsAttrs` | SIMPLIFY | Shrinks to `{ "data-ds-component": string }`. |
| `DsShellAttrs` | DELETE | Dies with dsShellProps. |
| `UnrenderableReason` | KEEP | Already internal. |
| `ArtifactUnrenderableProps` | KEEP | Already internal. |
| `TagKind` | KEEP | Rides Tag's public prop. |
| `TagKindMeta` | SIMPLIFY | Internal to tag-kinds; un-export. |
| `TypographyRole` | DELETE | Dies with token-profiles.ts — zero runtime consumers. |
| `MotionProfile` | DELETE | Same. |
| `BorderWidthProfile` | DELETE | Same. |
| `DialogLayer` | KEEP | Rides useDialogBehavior. |
| `UseDialogBehaviorOptions` | KEEP | Rides useDialogBehavior. |
| `UseDialogBehavior` | KEEP | Rides useDialogBehavior. |

## Const / enum audit

| Declaration | Reach | Verdict | Reason |
|---|---|---|---|
| `Button` | UI:43 | KEEP | Most-used primitive in the app. |
| `Input` | UI:20 | KEEP | Form primitive, everywhere. |
| `pageTitleClassName` | UI:1 (KnowledgeCreate editable title) | KEEP | Documented composition door. |
| `paneTitleClassName` | INTERNAL (PageHeader only) | SIMPLIFY | Symmetry export nobody imports; un-export. Same class string as pageTitleClassName — collapse to one const. |
| `ItemListContext` | INTERNAL (Row, ItemList) | SIMPLIFY | Internal contract; un-export. |
| `TONE_COLOR` | INTERNAL (same file) | SIMPLIFY | RowDot's private data; un-export. |
| `SearchField` | UI:3 | KEEP | Search primitive. |
| `ARTIFACT_FRAME_SANDBOX` | INTERNAL | KEEP | The artifact isolation policy — core security model. |
| `ARTIFACT_FRAME_CSP` | INTERNAL | KEEP | Same. |
| `ARTIFACT_SIZE_CHANGED_METHOD` | INTERNAL (build-srcdoc ↔ ArtifactFrame) | KEEP | Frame resize protocol constant. |
| `FRAME_INITIAL_HEIGHT` | INTERNAL | KEEP | Frame sizing. |
| `FRAME_MIN_HEIGHT` | INTERNAL | KEEP | Frame sizing. |
| `FRAME_MAX_HEIGHT` | INTERNAL | KEEP | Frame sizing. |
| `SLASH_MENU_ITEMS` | INTERNAL (same file) + TEST-ONLY export | SIMPLIFY | @lore admits exported for tests; un-export. |
| `TASK_STATE_MAP` | INTERNAL (its function) | SIMPLIFY | Un-export; the function is the door. |
| `KNOWLEDGE_STATUS_MAP` | INTERNAL | SIMPLIFY | Same. |
| `BET_STATUS_MAP` | INTERNAL | SIMPLIFY | Same. |
| `SESSION_OUTCOME_MAP` | UI:1 (AgentProfile) | KEEP | AgentProfile iterates the outcome vocabulary. |
| `ROUTINE_STATE_MAP` | INTERNAL | SIMPLIFY | Un-export; the function is the door. |
| `BET_OUTCOME_VERDICT_STATUS` | INTERNAL | SIMPLIFY | Same. |
| `TASK_OUTCOME_VERDICT_STATUS` | INTERNAL | SIMPLIFY | Same. |
| `AGENT_OPERATIONAL_STATUS_MAP` | INTERNAL | SIMPLIFY | Same. |
| `TAG_KIND_ICONS` | INTERNAL (Tag.tsx only) | SIMPLIFY | Un-export; only Tag reads it (typecheck-gate lore about web importing it is stale — tests only). |
| `TYPOGRAPHY_ROLES` | DEAD (own file + own test only) | DELETE | Whole token-profiles.ts is a JS mirror of tokens.css nothing imports; census has its own copy. |
| `TYPE_STYLE` | DEAD | DELETE | Zero consumers; components use `type-*` CSS classes. |
| `AVATAR_INITIAL_STYLE` | DEAD | DELETE | Zero consumers anywhere — Avatar doesn't even use it. |
| `MOTION_PROFILES` | DEAD | DELETE | Lint enforces motion via regex, not this const. |
| `MOTION_STYLE` | DEAD | DELETE | Zero consumers. |
| `BORDER_WIDTH_PROFILES` | DEAD | DELETE | Zero consumers. |
| `BORDER_WIDTH_STYLE` | DEAD | DELETE | Zero consumers. |

## Holes this leaves

1. **Package deletion mechanics** — `tools/repo-gates/src/typecheck-gate.ts` drops design-system from its leaf pre-build list (a simplification, not a hole); `tools/eslint-plugin-design` `TARGET_DIRS`/path guards (require-stories-sibling, no-handrolled-*, motion-profile-only's RoleCombobox carve-out) respell to the new core-ui path; `design-css-gate`/`design-profile-census` package sets shrink to core-ui. All string edits.
2. **tokens.css** — the `./tokens.css` package export moves into core-ui and `layers/core-ui/src/index.css` imports it relatively. AZ7 lore warns Tailwind @source globs silently die — re-verify painted output after the move.
3. **Deleting the tier/source attrs** — the `require-ds-attribute` lint rule and `design-profile-census` must drop tier/source checks (name-only). E2E selectors on `data-ds-component` keep working; any spec asserting `data-ds-tier`/`data-ds-source` (accessibility/census-flavored specs) needs re-anchoring.
4. **ArtifactEmbed deletion** — the `/_dev/artifacts` demo route loses its embed row; `__e2e__/artifact-embed-no-chrome.spec.ts` must re-target the real embed path (Fold+ReferenceChip in threads) or die with the demo.
5. **Un-exporting test-only symbols** — the dedicated tests for `computeSenderGrouping`, `clickableProps`, `filterSlashItems`, status maps, and the AZ16 token-profiles test either move into the owning module's test file (same-package relative imports are fine post-dissolve) or die. After the dissolve this is moot for most: core-ui tests can import any module relatively.
6. **token-profiles deletion** — if a future component wants JS-side typography styles, it re-derives from tokens.css. Today nothing does; the lint rules that mention `TYPE_STYLE.<role>` in their message text need reworded messages.
7. **Toast/DialogPortalRoot deletion** — no functional hole; ToastRegion and ensureOverlayRoot already carry production. Stale doc comment in `useDialogBehavior.ts` gets fixed.
8. **framework→framework reach** — dissolving removes design-system from the framework surface entirely; the AU34 framework-surfaces model loses one package (a shrink, no migration risk beyond the import respell of ~130 core-ui files, mechanical codemod by exported name per AU34 lessons).
