/**
 * Design System Sync Map
 *
 * Maps each component to its HTML URL (served on :8098) and
 * its story hash on the live app (:5173/designsystem#ComponentName).
 *
 * Used by sync-check.ts to screenshot and diff both representations.
 */

export interface SyncEntry {
	name: string;
	htmlPath: string;
	storyHash: string;
	tier: 1 | 2;
	description: string;
}

export const SYNC_MAP: SyncEntry[] = [
	// ── Tier 1: Primitives ──
	{
		name: "StatusChip",
		htmlPath: "/StatusChip.html",
		storyHash: "StatusChip",
		tier: 1,
		description: "6-state status indicator dot + label",
	},
	{
		name: "Tag",
		htmlPath: "/Tag.html",
		storyHash: "Tag",
		tier: 1,
		description: "Flat badge with optional kind tint",
	},
	{
		name: "KeyValue",
		htmlPath: "/KeyValue.html",
		storyHash: "KeyValue",
		tier: 1,
		description: "Mono label + value pair (inline/stacked)",
	},
	{
		name: "NavItem",
		htmlPath: "/NavItem.html",
		storyHash: "NavItem",
		tier: 1,
		description: "Icon + text + count menu item",
	},
	{
		name: "SearchField",
		htmlPath: "/SearchField.html",
		storyHash: "SearchField",
		tier: 1,
		description: "Input with search icon + kbd hint",
	},

	// ── Tier 2: Blocks ──
	{
		name: "ThreadRow",
		htmlPath: "/ThreadRow.html",
		storyHash: "ThreadRow",
		tier: 2,
		description: "Avatar + title + status conversation row",
	},
	{
		name: "BetCard",
		htmlPath: "/BetCard.html",
		storyHash: "BetCard",
		tier: 2,
		description: "Product card with progress + status",
	},
	{
		name: "PitchCard",
		htmlPath: "/PitchCard.html",
		storyHash: "PitchCard",
		tier: 2,
		description: "Pitch with kind tag + appetite",
	},
	{
		name: "TaskCard",
		htmlPath: "/TaskCard.html",
		storyHash: "TaskCard",
		tier: 2,
		description: "Task with status + optional bet tag",
	},
	{
		name: "KnowledgeRow",
		htmlPath: "/KnowledgeRow.html",
		storyHash: "KnowledgeRow",
		tier: 2,
		description: "Knowledge item with layer + category",
	},
	{
		name: "NotificationRow",
		htmlPath: "/NotificationRow.html",
		storyHash: "NotificationRow",
		tier: 2,
		description: "Notification with severity + action",
	},

	// ── Utility ──
	{
		name: "EmptyState",
		htmlPath: "/EmptyState.html",
		storyHash: "EmptyState",
		tier: 1,
		description: "Centered empty state placeholder",
	},
	{
		name: "ErrorState",
		htmlPath: "/ErrorState.html",
		storyHash: "ErrorState",
		tier: 1,
		description: "Error alert with optional retry",
	},
	{
		name: "Skeleton",
		htmlPath: "/Skeleton.html",
		storyHash: "Skeleton",
		tier: 1,
		description: "Loading placeholder shapes",
	},
];
