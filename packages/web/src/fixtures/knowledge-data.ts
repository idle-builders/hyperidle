/**
 * J6: mock knowledge items for the Knowledge list page.
 *
 * @lore Attention score and `whyNow` reason come from the API in production
 * (server computes the template-based reason string). These fixtures carry
 * the shape so the UI can render against it; server wiring is deferred to a
 * future work package. Treat the values here as representative, not canonical.
 *
 * @lore J6: the "practice" scope is the default landing (no ?scope= param).
 * The 5 original fixture titles from the pre-J6 KnowledgeList sit in the
 * practice scope so the protected KnowledgeList tests continue to pass
 * without modification.
 */
import type {
	KnowledgeKind,
	KnowledgeLayer,
	KnowledgeScope,
	KnowledgeStatus,
	KnowledgeTopicHealth,
} from "@hyperidle/shared";

export interface MockKnowledgeItem {
	id: string;
	title: string;
	layer: KnowledgeLayer;
	kind: KnowledgeKind;
	status: KnowledgeStatus;
	timestamp: string;
	scope: KnowledgeScope;
	topic: string;
	/**
	 * 0..100 — higher means more urgent human attention.
	 * Server-computed in production; mock values below.
	 */
	attentionScore: number;
	/**
	 * Template-based "Why now" reason string. Max 60 chars per AC; truncated
	 * with ellipsis in the UI when exceeded. Server emits this.
	 */
	whyNow: string;
}

export interface MockCurationSuggestion {
	id: string;
	scope: KnowledgeScope;
	topic: string;
	/** Headline action, e.g. "Merge these 3 items?" */
	action: string;
	/** One-line supporting detail (truncated in the UI if long). */
	detail: string;
}

/**
 * Practice scope carries the 5 original pre-J6 titles so the protected
 * KnowledgeList tests continue to pass without modification. Product and
 * Factory scopes provide additional items so scope filtering, topic
 * grouping, and triage sort can all be demonstrated.
 */
export const MOCK_KNOWLEDGE_ITEMS: ReadonlyArray<MockKnowledgeItem> = [
	// Practice scope — Architecture (original pre-J6 items)
	{
		id: "k1",
		title: "Architecture Decision: Auth Strategy",
		layer: "L0",
		kind: "decision",
		status: "active",
		timestamp: "1d ago",
		scope: "practice",
		topic: "Architecture",
		attentionScore: 10,
		whyNow: "Recently validated, no action needed",
	},
	{
		id: "k2",
		title: "API Rate Limiting Best Practices",
		layer: "L1",
		kind: "pattern",
		status: "active",
		timestamp: "2d ago",
		scope: "practice",
		topic: "Architecture",
		attentionScore: 12,
		whyNow: "Applied 4 times this cycle",
	},
	// Practice scope — Research
	{
		id: "k3",
		title: "User Interview Notes Q1",
		layer: "L0",
		kind: "brief",
		status: "stale",
		timestamp: "2w ago",
		scope: "practice",
		topic: "Research",
		attentionScore: 68,
		whyNow: "Contradicted by kb-c1",
	},
	// Practice scope — Component Library
	{
		id: "k4",
		title: "Component Library Guidelines",
		layer: "L1",
		kind: "principle",
		status: "active",
		timestamp: "3d ago",
		scope: "practice",
		topic: "Component Library",
		attentionScore: 15,
		whyNow: "Applied 12 times this cycle",
	},
	// Practice scope — Process (needs_human so Triage is default)
	{
		id: "k5",
		title: "Sprint Retro Outcomes",
		layer: "L2",
		kind: "reflection",
		status: "provisional",
		timestamp: "5h ago",
		scope: "practice",
		topic: "Process",
		attentionScore: 32,
		whyNow: "Pending validation from cycle review",
	},
	// Practice scope — Process (additional items to demonstrate grouping)
	{
		id: "k6",
		title: "Review Queue Triage Heuristics",
		layer: "L1",
		kind: "principle",
		status: "needs_human",
		timestamp: "5h ago",
		scope: "practice",
		topic: "Process",
		attentionScore: 92,
		whyNow: "3 new observations since review",
	},
	// Practice scope — Architecture (stale item to drive topic health)
	{
		id: "k7",
		title: "Legacy Service Mesh Pattern",
		layer: "L1",
		kind: "pattern",
		status: "stale",
		timestamp: "2w ago",
		scope: "practice",
		topic: "Architecture",
		attentionScore: 74,
		whyNow: "Unused for 2 cycles",
	},
	// Product scope — Onboarding
	{
		id: "k8",
		title: "Welcome Email Copy Principle",
		layer: "L1",
		kind: "principle",
		status: "needs_human",
		timestamp: "6h ago",
		scope: "product",
		topic: "Onboarding",
		attentionScore: 85,
		whyNow: "Awaiting sign-off from brand-voice agent",
	},
	{
		id: "k9",
		title: "Activation Funnel Snapshot",
		layer: "L0",
		kind: "brief",
		status: "active",
		timestamp: "1d ago",
		scope: "product",
		topic: "Onboarding",
		attentionScore: 40,
		whyNow: "Used by 3 bets this cycle",
	},
	// Product scope — UI Kit
	{
		id: "k10",
		title: "Deprecated Button Variants",
		layer: "L2",
		kind: "anti_pattern",
		status: "archived",
		timestamp: "1mo ago",
		scope: "product",
		topic: "UI Kit",
		attentionScore: 5,
		whyNow: "Archived — see replacement",
	},
	// Factory scope — Governance
	{
		id: "k11",
		title: "Agent Autonomy Policy",
		layer: "L0",
		kind: "decision",
		status: "active",
		timestamp: "1w ago",
		scope: "factory",
		topic: "Governance",
		attentionScore: 18,
		whyNow: "Under amendment review",
	},
	{
		id: "k12",
		title: "Cost Cap Escalation Protocol",
		layer: "L1",
		kind: "pattern",
		status: "needs_human",
		timestamp: "1d ago",
		scope: "factory",
		topic: "Governance",
		attentionScore: 78,
		whyNow: "Breached 2 caps this cycle",
	},
	// Factory scope — Agents
	{
		id: "k13",
		title: "Architect Agent Brief",
		layer: "L0",
		kind: "brief",
		status: "active",
		timestamp: "2d ago",
		scope: "factory",
		topic: "Agents",
		attentionScore: 22,
		whyNow: "Cited by 8 tasks",
	},
];

/**
 * Mock curation suggestions. These render as distinct action-oriented cards
 * in the Triage tab (J6 AC: "visually distinct from KnowledgeRows").
 */
export const MOCK_CURATION_SUGGESTIONS: ReadonlyArray<MockCurationSuggestion> = [
	{
		id: "cs1",
		scope: "practice",
		topic: "Architecture",
		action: "Merge these 3 items?",
		detail: "Auth Strategy, Rate Limiting, Legacy Mesh overlap on access-control concerns",
	},
	{
		id: "cs2",
		scope: "product",
		topic: "Onboarding",
		action: "No coverage for topic Activation in 2 cycles",
		detail: "Consider creating a brief for activation flow patterns",
	},
	{
		id: "cs3",
		scope: "factory",
		topic: "Governance",
		action: "Consolidate duplicate cost-cap policies?",
		detail: "2 items describe overlapping escalation rules",
	},
];

/**
 * Topics available per scope, used by the scope browser / NavItems.
 * @lore J6: derived from the fixture list so topics stay in sync with items.
 */
export function topicsForScope(
	scope: KnowledgeScope,
	items: ReadonlyArray<MockKnowledgeItem> = MOCK_KNOWLEDGE_ITEMS,
): Array<{ topic: string; itemCount: number; staleCount: number; health: KnowledgeTopicHealth }> {
	const groups = groupItemsByTopic(items.filter((i) => i.scope === scope));
	return groups.map((g) => ({
		topic: g.topic,
		itemCount: g.items.length,
		staleCount: g.staleCount,
		health: g.health,
	}));
}

/**
 * Derive topic health from the share of stale items in the group.
 * 0 stale => fresh, < 50% => some_stale, >= 50% => mostly_stale.
 *
 * @lore J6: "stale" here is *visual*-stale — status === "stale". This is a
 * UI presentation rule, not an authoritative knowledge-lifecycle judgement.
 */
export function deriveTopicHealth(totalCount: number, staleCount: number): KnowledgeTopicHealth {
	if (totalCount === 0 || staleCount === 0) return "fresh";
	const ratio = staleCount / totalCount;
	if (ratio >= 0.5) return "mostly_stale";
	return "some_stale";
}

/**
 * Group items by topic, preserving the original fixture order within each
 * group. Returns a stable-ordered list so tests and UI match.
 */
export function groupItemsByTopic(items: ReadonlyArray<MockKnowledgeItem>): Array<{
	topic: string;
	items: ReadonlyArray<MockKnowledgeItem>;
	staleCount: number;
	health: KnowledgeTopicHealth;
}> {
	const byTopic = new Map<string, MockKnowledgeItem[]>();
	for (const item of items) {
		const bucket = byTopic.get(item.topic);
		if (bucket) {
			bucket.push(item);
		} else {
			byTopic.set(item.topic, [item]);
		}
	}
	return Array.from(byTopic.entries()).map(([topic, topicItems]) => {
		const staleCount = topicItems.filter((i) => i.status === "stale").length;
		return {
			topic,
			items: topicItems,
			staleCount,
			health: deriveTopicHealth(topicItems.length, staleCount),
		};
	});
}
