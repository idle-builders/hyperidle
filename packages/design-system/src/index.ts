// @hyperidle/design-system — barrel export

// ── Artifact view family (closed: 4 sub-primitives + 4 layouts; L3) ──
export type { ArtifactCostChipProps } from "./ArtifactCostChip.js";
export { ArtifactCostChip } from "./ArtifactCostChip.js";
export type { ArtifactEmbedProps } from "./ArtifactEmbed.js";
export { ArtifactEmbed } from "./ArtifactEmbed.js";
export type { ArtifactGalleryCardProps } from "./ArtifactGalleryCard.js";
export { ArtifactGalleryCard } from "./ArtifactGalleryCard.js";
export type { ArtifactKindBadgeProps } from "./ArtifactKindBadge.js";
export { ArtifactKindBadge } from "./ArtifactKindBadge.js";
export type { ArtifactPreviewProps } from "./ArtifactPreview.js";
export { ArtifactPreview } from "./ArtifactPreview.js";
export type { ArtifactPreviewSurfaceProps } from "./ArtifactPreviewSurface.js";
export { ArtifactPreviewSurface } from "./ArtifactPreviewSurface.js";
export type { ArtifactStackItemProps } from "./ArtifactStackItem.js";
export { ArtifactStackItem } from "./ArtifactStackItem.js";
export type { ArtifactTimestampProps } from "./ArtifactTimestamp.js";
export { ArtifactTimestamp } from "./ArtifactTimestamp.js";
export type { BetCardLeadAvatar, BetCardProps } from "./BetCard.js";
export { BetCard } from "./BetCard.js";
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
export type { CommentRowProps, CommentRowSender } from "./CommentRow.js";
export { CommentRow } from "./CommentRow.js";
export type { ComposerProps, ComposerSubmitInput } from "./Composer.js";
export { Composer } from "./Composer.js";
// ── Support ──
export { clickableProps } from "./clickable.js";
// ── DOM markers (K2) ──
export type { DsAttrs, DsShellAttrs, DsSource, DsTier } from "./ds-attrs.js";
export { dsProps, dsShellProps } from "./ds-attrs.js";
export type { EmptyStateProps } from "./EmptyState.js";
// ── Utility Components ──
export { EmptyState } from "./EmptyState.js";
export type { ErrorStateProps } from "./ErrorState.js";
export { ErrorState } from "./ErrorState.js";
export type { KeyValueProps } from "./KeyValue.js";
export { KeyValue } from "./KeyValue.js";
export type { KnowledgeRowProps } from "./KnowledgeRow.js";
export { KnowledgeRow } from "./KnowledgeRow.js";
export type { NavItemProps } from "./NavItem.js";
export { NavItem } from "./NavItem.js";
export type { NotificationRowProps } from "./NotificationRow.js";
export { NotificationRow } from "./NotificationRow.js";
// U8: PitchCard deleted from design-system exports.
export type {
	RichMessageCardAction,
	RichMessageCardProps,
	RichMessageCardResolved,
	RichMessageCardSender,
	RichMessageCardState,
} from "./RichMessageCard.js";
export { RichMessageCard } from "./RichMessageCard.js";
export type { SearchFieldProps } from "./SearchField.js";
export { SearchField } from "./SearchField.js";
export type { SkeletonCardProps, SkeletonListProps } from "./Skeleton.js";
export { SkeletonCard, SkeletonList } from "./Skeleton.js";
export type { Status, StatusChipProps } from "./StatusChip.js";
// ── Tier 1: Primitives ──
export { StatusChip } from "./StatusChip.js";
export {
	BET_STATUS_MAP,
	betStatusToStatus,
	KNOWLEDGE_STATUS_MAP,
	knowledgeStatusToStatus,
	SESSION_OUTCOME_MAP,
	sessionOutcomeToStatus,
	TASK_STATE_MAP,
	taskStateToStatus,
} from "./status-mapping.js";
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
export type { TagKind, TagKindMeta } from "./tag-kinds.js";
export { TAG_KIND_ICONS } from "./tag-kinds.js";
