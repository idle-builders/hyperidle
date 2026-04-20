// @hyperidle/design-system — barrel export

// ── Tier 1: Primitives ──
export { StatusChip } from "./StatusChip.js";
export type { Status, StatusChipProps } from "./StatusChip.js";

export { Tag } from "./Tag.js";
export type { TagProps } from "./Tag.js";

export { KeyValue } from "./KeyValue.js";
export type { KeyValueProps } from "./KeyValue.js";

export { NavItem } from "./NavItem.js";
export type { NavItemProps } from "./NavItem.js";

export { SearchField } from "./SearchField.js";
export type { SearchFieldProps } from "./SearchField.js";

// ── Tier 2: Blocks ──
export { ThreadRow } from "./ThreadRow.js";
export type { ThreadRowProps } from "./ThreadRow.js";

export { BetCard } from "./BetCard.js";
export type { BetCardProps, BetCardLeadAvatar } from "./BetCard.js";

export { PitchCard } from "./PitchCard.js";
export type { PitchCardProps } from "./PitchCard.js";

export { TaskCard } from "./TaskCard.js";
export type { TaskCardProps } from "./TaskCard.js";

export { KnowledgeRow } from "./KnowledgeRow.js";
export type { KnowledgeRowProps } from "./KnowledgeRow.js";

export { NotificationRow } from "./NotificationRow.js";
export type { NotificationRowProps } from "./NotificationRow.js";

// ── Utility Components ──
export { EmptyState } from "./EmptyState.js";
export type { EmptyStateProps } from "./EmptyState.js";

export { ErrorState } from "./ErrorState.js";
export type { ErrorStateProps } from "./ErrorState.js";

export { SkeletonList, SkeletonCard } from "./Skeleton.js";
export type { SkeletonListProps, SkeletonCardProps } from "./Skeleton.js";

// ── Support ──
export { clickableProps } from "./clickable.js";
export {
	taskStateToStatus,
	knowledgeStatusToStatus,
	betStatusToStatus,
	TASK_STATE_MAP,
	KNOWLEDGE_STATUS_MAP,
	BET_STATUS_MAP,
} from "./status-mapping.js";
export { TAG_KIND_ICONS } from "./tag-kinds.js";
export type { TagKind, TagKindMeta } from "./tag-kinds.js";
