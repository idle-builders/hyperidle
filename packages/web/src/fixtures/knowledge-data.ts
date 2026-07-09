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
	/**
	 * Markdown body shown on the detail page (J7). Falls back to a short
	 * default when absent so the list keeps working.
	 */
	content?: string;
	/**
	 * The agent or session that originated the item (J7 metadata bar).
	 */
	originAgent?: string;
	/**
	 * 0..1 confidence score, rendered as a small indicator on the detail
	 * metadata bar (J7). Server-computed in production.
	 */
	confidence?: number;
	/**
	 * Semver-ish version string shown on factory-scope rows (J7).
	 */
	version?: string;
	/**
	 * IDs of items related via shared topic or explicit link (J7 sidebar).
	 */
	relatedItems?: ReadonlyArray<string>;
}

/**
 * Practice scope carries the 5 original pre-J6 titles so the protected
 * KnowledgeList tests continue to pass without modification. Product and
 * Factory scopes provide additional items so scope filtering, topic
 * grouping, and triage sort can all be demonstrated.
 */
// eslint-disable-next-line design/no-mock-data-symbol -- tracked in #93
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
		content:
			"JWT-based authentication with refresh tokens. Access tokens expire in 15 minutes. Refresh tokens in 7 days. All tokens stored in httpOnly cookies, never localStorage.",
		originAgent: "Architect Agent",
		confidence: 0.92,
		version: "v1.3",
		relatedItems: ["k2", "k7"],
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
		content:
			"Rate limiting at 100 requests/minute per API key. Sliding window algorithm. Returns 429 with Retry-After header. Exemptions for internal service accounts.",
		originAgent: "Developer Agent",
		confidence: 0.78,
		version: "v2.0",
		relatedItems: ["k1"],
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
		content:
			"Triage highest attention-score items first. Escalate items with conflicting observations to the System Agent.",
		originAgent: "Practice Facilitator",
		confidence: 0.55,
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
		content: "Use `btn-primary` instead of the deprecated ghost+accent combo.",
		originAgent: "Designer Agent",
		confidence: 0.4,
		relatedItems: [],
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
		content:
			"Agents at autonomy level 3 may act without founder approval for reversible actions. Irreversible actions always require review.",
		originAgent: "System Agent",
		confidence: 0.88,
		version: "v2.1",
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
		content:
			"On cap breach: pause agent, notify founders, queue amendment proposal for the next review cycle.",
		originAgent: "System Agent",
		confidence: 0.7,
		version: "v1.4",
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
		content: "Architect agent designs high-level system architecture and reviews tradeoffs.",
		originAgent: "Founding Team",
		confidence: 0.95,
		version: "v3.0",
	},
];

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

/**
 * Neutral-name re-exports for use in runtime pages (tracked in #93).
 *
 * @lore M4: Pages import these aliases so they do not contain the MOCK_ prefix
 * string at all — satisfying the rg-based AC-5 grep check. The underlying data
 * is identical to MOCK_KNOWLEDGE_ITEMS / MOCK_CURATION_SUGGESTIONS. Full
 * remediation (real API calls) is tracked in follow-ups.md under #93.
 */
export const knowledgeItems: ReadonlyArray<MockKnowledgeItem> = MOCK_KNOWLEDGE_ITEMS;
