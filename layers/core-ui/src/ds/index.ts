// @hyperidle/design-system — barrel export

// ── AI4: Re-export AgentOperationalStatus type (lives in shared, needed by ds consumers) ──
export type { AgentOperationalStatus } from "@hyperidle/domain-model";
// ── Artifact view family (closed: 3 sub-primitives + 3 layouts; L3) ──
// @lore AU21 Increment 14a: ArtifactCostChip deleted along with the rest of
// the cost feature — no replacement.
// @lore AU43 bundle-03: ArtifactEmbed deleted — only door was /_dev/artifacts (DEV-ONLY).
export type { ArtifactFrameProps } from "./ArtifactFrame.js";
export { ArtifactFrame } from "./ArtifactFrame.js";
// ── Tier 0: Foundation primitives (W2) ──
export type { AvatarGroupProps, AvatarProps } from "./Avatar.js";
export { Avatar, AvatarGroup } from "./Avatar.js";
// @lore BB1: BetCard deleted — tasks are now the one work primitive.
// ── Tier 2: Block primitive (L2) ──
export type { BlockProps, BlockSlots } from "./Block.js";
export { Block } from "./Block.js";
export type {
	BlockAction,
	BlockActionsPopoverProps,
} from "./BlockActionsPopover.js";
export { BlockActionsPopover } from "./BlockActionsPopover.js";
export type { BlockHandleProps } from "./BlockHandle.js";
export { BlockHandle } from "./BlockHandle.js";
// ── T1: BodyEditor — TipTap WYSIWYG editor ──
export type { BodyEditorProps } from "./BodyEditor.js";
export { BodyEditor } from "./BodyEditor.js";
// ── AG4: Breadcrumb — Tier 1 DS nav orientation strip ──
export type { BreadcrumbProps, BreadcrumbSegment } from "./Breadcrumb.js";
export { Breadcrumb } from "./Breadcrumb.js";
export type { ButtonProps } from "./Button.js";
export { Button } from "./Button.js";
// ── AM5: base-primitive content foundations (the block-payload layer, promoted
// to first-class DS foundations so each is individually reviewable). The diff is
// NOT in here (K0) — it lives in the Review composition. ──
export type { CodePayloadProps } from "./block/CodePayload.js";
export { CodePayload } from "./block/CodePayload.js";
export { DividerPayload } from "./block/DividerPayload.js";
export type { AuthoredOutlineContext, HeadingPayloadProps } from "./block/HeadingPayload.js";
export { HeadingPayload, headingIdentityMatches } from "./block/HeadingPayload.js";
export type { HtmlPayloadProps } from "./block/HtmlPayload.js";
export { HtmlPayload } from "./block/HtmlPayload.js";
export type { ImagePayloadProps } from "./block/ImagePayload.js";
export { ImagePayload } from "./block/ImagePayload.js";
export { renderInline } from "./block/inline.js";
export type { ListPayloadProps } from "./block/ListPayload.js";
export { ListPayload } from "./block/ListPayload.js";
export type { ParagraphPayloadProps } from "./block/ParagraphPayload.js";
export { ParagraphPayload } from "./block/ParagraphPayload.js";
export type { QuotePayloadProps } from "./block/QuotePayload.js";
export { QuotePayload } from "./block/QuotePayload.js";
export type { TablePayloadProps } from "./block/TablePayload.js";
export { TablePayload } from "./block/TablePayload.js";
export type { CheckboxProps } from "./Checkbox.js";
export { Checkbox } from "./Checkbox.js";
export type { CommentRowProps, CommentRowSender } from "./CommentRow.js";
export { CommentRow } from "./CommentRow.js";
export type { ComposerProps, ComposerSubmitInput } from "./Composer.js";
export { Composer } from "./Composer.js";
// ── Support ──
export { clickableProps } from "./clickable.js";
// ── AI2: Dialog primitive + behavioral hook ──
// @lore AU43 bundle-03: DialogPortalRoot deleted — zero mounts; AppShell calls ensureOverlayRoot directly.
export type { DialogLayer, DialogProps, DialogSize } from "./Dialog.js";
export { Dialog } from "./Dialog.js";
// ── AM5: DS diff core — (code,diff) structural renderer (K2b) ──
// @lore AU43 bundle-03: getDiffRenderer/DiffRendererComponent/DiffRendererProps deleted —
// ReviewCodeDiff imports CodeDeltaRenderer directly; the registry had one entry and zero callers.
export type { CodeDelta, CodeDeltaProps, DiffLineRef } from "./diff/code-delta-renderer.js";
export { CodeDeltaRenderer } from "./diff/code-delta-renderer.js";
// ── DOM markers (K2) ──
// @lore AU43 bundle-03: DsShellAttrs/DsTier/DsSource/dsShellProps deleted — only consumer was
// ThreadShell (now inlined) + SidebarV2.stories; tier taxonomy is compile-time only.
export type { DsAttrs } from "./ds-attrs.js";
export { dsProps } from "./ds-attrs.js";
export type { EmptyStateProps } from "./EmptyState.js";
// ── Utility Components ──
export { EmptyState } from "./EmptyState.js";
export type { ErrorStateProps } from "./ErrorState.js";
export { ErrorState } from "./ErrorState.js";
// ── AM1: Fold — calm collapse-to-summary device ──
export type { FoldProps } from "./Fold.js";
export { Fold } from "./Fold.js";
export type { InputProps } from "./Input.js";
export { Input } from "./Input.js";
// ── AG6: Row + ItemList + RowDot shared list-row primitives ──
export type { ItemListEmpty, ItemListError, ItemListProps } from "./ItemList.js";
export { ItemList } from "./ItemList.js";
export type { KeyValueProps } from "./KeyValue.js";
export { KeyValue } from "./KeyValue.js";
export type { KnowledgeRowProps } from "./KnowledgeRow.js";
export { KnowledgeRow } from "./KnowledgeRow.js";
// ── AM5: KpiStat + Sparkline — extracted base primitives from data-renderer ──
export type { KpiStatMetric, KpiStatProps } from "./KpiStat.js";
export { KpiStat } from "./KpiStat.js";
// ── AI4 Task 5: LiveDot — promoted from WorkTask/TaskSheet ──
export { LiveDot } from "./LiveDot.js";
export type { MenuItem, MenuProps } from "./Menu.js";
export { Menu } from "./Menu.js";
export type { NavItemProps } from "./NavItem.js";
export { NavItem } from "./NavItem.js";
export type { NotificationRowProps } from "./NotificationRow.js";
export { NotificationRow } from "./NotificationRow.js";
export type { PageFrameProps } from "./PageFrame.js";
export { PageFrame } from "./PageFrame.js";
// ── AI7: PageHeader — canonical page-title strip (Tier 1) ──
export type { PageHeaderProps } from "./PageHeader.js";
export { PageHeader, pageTitleClassName, paneTitleClassName } from "./PageHeader.js";
// ── AZ2: PageScaffold — canonical page scroll contract (Tier 1) ──
export type { PageScaffoldProps } from "./PageScaffold.js";
export { PageScaffold } from "./PageScaffold.js";
export type { ProgressProps } from "./Progress.js";
export { Progress } from "./Progress.js";
// U8: PitchCard deleted from design-system exports.
// ── AM1: ReferenceChip — single shared attachment/reference primitive ──
export type { ReferenceChipKind, ReferenceChipMode, ReferenceChipProps } from "./ReferenceChip.js";
export { ReferenceChip } from "./ReferenceChip.js";
export type {
	RichMessageCardAction,
	RichMessageCardProps,
	RichMessageCardResolved,
	RichMessageCardSender,
	RichMessageCardState,
} from "./RichMessageCard.js";
export { RichMessageCard } from "./RichMessageCard.js";
export type { RoleComboboxProps, RoleOption } from "./RoleCombobox.js";
export { RoleCombobox } from "./RoleCombobox.js";
export type { ItemListContextValue, RowCell, RowProps } from "./Row.js";
export { ItemListContext, Row } from "./Row.js";
export type { RowDeleteActionProps } from "./RowDeleteAction.js";
export { RowDeleteAction } from "./RowDeleteAction.js";
export type { RowDotProps, RowTone } from "./RowDot.js";
export { RowDot, TONE_COLOR } from "./RowDot.js";
export type { ScopePickerOption, ScopePickerProps } from "./ScopePicker.js";
export { ScopePicker } from "./ScopePicker.js";
export type { SearchFieldProps } from "./SearchField.js";
export { SearchField } from "./SearchField.js";
// ── AI7: SectionLabel — canonical uppercase section heading (Tier 1) ──
export type { SectionLabelProps } from "./SectionLabel.js";
export { SectionLabel } from "./SectionLabel.js";
export type { SelectProps } from "./Select.js";
export { Select } from "./Select.js";
export type { SkeletonCardProps, SkeletonListProps, SkeletonProps } from "./Skeleton.js";
export { Skeleton, SkeletonCard, SkeletonList } from "./Skeleton.js";
export type { SparklineProps } from "./Sparkline.js";
export { Sparkline } from "./Sparkline.js";
export type { FoldMode, SplitViewProps } from "./SplitView.js";
export { SplitView } from "./SplitView.js";
export type { Status, StatusChipProps } from "./StatusChip.js";
// ── Tier 1: Primitives ──
export { StatusChip } from "./StatusChip.js";
// @lore BB1: BET_STATUS_MAP and betStatusToStatus removed — bet vocabulary gone
export {
	AGENT_OPERATIONAL_STATUS_MAP,
	agentOperationalStatusToStatus,
	KNOWLEDGE_STATUS_MAP,
	knowledgeStatusToStatus,
	ROUTINE_STATE_MAP,
	routineStateToStatus,
	SESSION_OUTCOME_MAP,
	sessionOutcomeToStatus,
	TASK_OUTCOME_VERDICT_STATUS,
	TASK_STATE_MAP,
	taskOutcomeVerdictToStatus,
	taskStateToStatus,
} from "./status-mapping.js";
export type { TabBarProps } from "./TabBar.js";
export { TabBar } from "./TabBar.js";
export type { TagProps } from "./Tag.js";
export { Tag } from "./Tag.js";
export type { TaskCardProps } from "./TaskCard.js";
export { TaskCard } from "./TaskCard.js";
// ── L1a Thread primitive components (stubs during write-tests phase) ──
export type {
	ThreadHostBannerParticipant,
	ThreadHostBannerProps,
} from "./ThreadHostBanner.js";
export { ThreadHostBanner } from "./ThreadHostBanner.js";
export type { ThreadRowProps } from "./ThreadRow.js";
// ── Tier 2: Row primitives ──
export { ThreadRow } from "./ThreadRow.js";
export type {
	ThreadShellAppendInput,
	ThreadShellIdentity,
	ThreadShellProps,
} from "./ThreadShell.js";
export { computeSenderGrouping, ThreadShell } from "./ThreadShell.js";
// @lore AU43 bundle-03: Toast deleted — zero renders; core-ui ToastRegion is the real system.
export type { ToggleProps } from "./Toggle.js";
export { Toggle } from "./Toggle.js";
export type { TagKind, TagKindMeta } from "./tag-kinds.js";
export { TAG_KIND_ICONS } from "./tag-kinds.js";
// @lore AU43 bundle-03: token-profiles.ts deleted — entire file was a JS mirror of tokens.css
// that nothing imported at runtime; components use type-<role> CSS classes directly.
// Census has its own copy; lint enforces profiles via regex, not these consts.
export type { UseDialogBehavior, UseDialogBehaviorOptions } from "./useDialogBehavior.js";
export { ensureOverlayRoot, useDialogBehavior } from "./useDialogBehavior.js";
