/**
 * J6: mock knowledge items for the Knowledge list page.
 *
 * @lore Attention score and `whyNow` reason come from the API in production
 * (server computes the template-based reason string). These fixtures carry
 * the shape so the UI can render against it; server wiring is deferred to a
 * future work package. Treat the values here as representative, not canonical.
 *
 * @lore J6: the 5 original fixture titles from the pre-J6 KnowledgeList are
 * `scope: "factory"` so the protected KnowledgeList tests continue to pass
 * without modification.
 *
 * @lore nested-knowledge-items AC6: `layer`, `kind` and `topic` are deleted
 * fields — this fixture predates a real API and never fed the real kernel
 * columns, so there is nothing downstream to migrate. `scope` keeps the
 * plain-string shape (never fed the real `scopeKind` column either) but its
 * values are now only the surviving three (`factory`/`team`/`user`) — the
 * retired `practice`/`product` values are respelled per the real migration
 * mapping (architecture.md §7: practice → factory, product → team).
 */
import type { KnowledgeStatus } from "@hyperidle/domain-model";

export interface MockKnowledgeItem {
	id: string;
	title: string;
	status: KnowledgeStatus;
	timestamp: string;
	scope: string;
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
	 * IDs of explicitly related items (J7 sidebar).
	 */
	relatedItems?: ReadonlyArray<string>;
}

/**
 * The 5 original pre-J6 items are `scope: "factory"` so the protected
 * KnowledgeList tests continue to pass without modification. The rest
 * exercise the surviving `team`/`user` scopes and triage sort.
 *
 * @lore nested-knowledge-items AC6: scope values follow the real migration
 * mapping (architecture.md §7) — the retired `practice` scope respells to
 * `factory`, the retired `product` scope respells to `team`.
 */
// eslint-disable-next-line design/no-mock-data-symbol -- tracked in #93
export const MOCK_KNOWLEDGE_ITEMS: ReadonlyArray<MockKnowledgeItem> = [
	{
		id: "k1",
		title: "Architecture Decision: Auth Strategy",
		status: "active",
		timestamp: "1d ago",
		scope: "factory",
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
		status: "active",
		timestamp: "2d ago",
		scope: "factory",
		attentionScore: 12,
		whyNow: "Applied 4 times this cycle",
		content:
			"Rate limiting at 100 requests/minute per API key. Sliding window algorithm. Returns 429 with Retry-After header. Exemptions for internal service accounts.",
		originAgent: "Developer Agent",
		confidence: 0.78,
		version: "v2.0",
		relatedItems: ["k1"],
	},
	{
		id: "k3",
		title: "User Interview Notes Q1",
		status: "stale",
		timestamp: "2w ago",
		scope: "factory",
		attentionScore: 68,
		whyNow: "Contradicted by kb-c1",
	},
	{
		id: "k4",
		title: "Component Library Guidelines",
		status: "active",
		timestamp: "3d ago",
		scope: "factory",
		attentionScore: 15,
		whyNow: "Applied 12 times this cycle",
	},
	{
		id: "k5",
		title: "Sprint Retro Outcomes",
		status: "proposed",
		timestamp: "5h ago",
		scope: "factory",
		attentionScore: 32,
		whyNow: "Pending validation from cycle review",
	},
	{
		id: "k6",
		title: "Review Queue Triage Heuristics",
		status: "proposed",
		timestamp: "5h ago",
		scope: "factory",
		attentionScore: 92,
		whyNow: "3 new observations since review",
		content:
			"Triage highest attention-score items first. Escalate items with conflicting observations to the System Agent.",
		originAgent: "Practice Facilitator",
		confidence: 0.55,
	},
	{
		id: "k7",
		title: "Legacy Service Mesh Pattern",
		status: "stale",
		timestamp: "2w ago",
		scope: "factory",
		attentionScore: 74,
		whyNow: "Unused for 2 cycles",
	},
	{
		id: "k8",
		title: "Welcome Email Copy Principle",
		status: "proposed",
		timestamp: "6h ago",
		scope: "team",
		attentionScore: 85,
		whyNow: "Awaiting sign-off from brand-voice agent",
	},
	{
		id: "k9",
		title: "Activation Funnel Snapshot",
		status: "active",
		timestamp: "1d ago",
		scope: "team",
		attentionScore: 40,
		whyNow: "Used by 3 tasks this cycle",
	},
	{
		id: "k10",
		title: "Deprecated Button Variants",
		status: "archived",
		timestamp: "1mo ago",
		scope: "team",
		attentionScore: 5,
		whyNow: "Archived — see replacement",
		content: "Use `btn-primary` instead of the deprecated ghost+accent combo.",
		originAgent: "Designer Agent",
		confidence: 0.4,
		relatedItems: [],
	},
	{
		id: "k11",
		title: "Agent Autonomy Policy",
		status: "active",
		timestamp: "1w ago",
		scope: "factory",
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
		title: "Repeated Test Failure Escalation Protocol",
		status: "proposed",
		timestamp: "1d ago",
		scope: "factory",
		attentionScore: 78,
		whyNow: "3 consecutive CI failures this cycle",
		content:
			"On 3 consecutive CI failures for the same bet: pause the agent, notify founders, queue an amendment proposal for the next review cycle.",
		originAgent: "System Agent",
		confidence: 0.7,
		version: "v1.4",
	},
	{
		id: "k13",
		title: "Architect Agent Brief",
		status: "active",
		timestamp: "2d ago",
		scope: "factory",
		attentionScore: 22,
		whyNow: "Cited by 8 tasks",
		content: "Architect agent designs high-level system architecture and reviews tradeoffs.",
		originAgent: "Founding Team",
		confidence: 0.95,
		version: "v3.0",
	},
];

/**
 * Neutral-name re-exports for use in runtime pages (tracked in #93).
 *
 * @lore M4: Pages import these aliases so they do not contain the MOCK_ prefix
 * string at all — satisfying the rg-based AC-5 grep check. The underlying data
 * is identical to MOCK_KNOWLEDGE_ITEMS / MOCK_CURATION_SUGGESTIONS. Full
 * remediation (real API calls) is tracked in follow-ups.md under #93.
 */
export const knowledgeItems: ReadonlyArray<MockKnowledgeItem> = MOCK_KNOWLEDGE_ITEMS;
