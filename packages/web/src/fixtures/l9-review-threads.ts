/**
 * L9 — Review-thread fixtures for the four artifact kinds.
 *
 * Keyed by `?thread=` URL parameter; consumed by ConversationsReview when
 * the route carries one of these IDs. Each fixture supplies metadata
 * (kind, riskTier, reversibility, blastRadius, sandboxResult, etc.) and
 * the per-kind payload so ArtifactKindRenderer can render the matching
 * view end-to-end.
 *
 * @lore L9: kept separate from ConversationsReview's J4 MOCK_REVIEWS so
 * the two artifact pipelines (kind-based renderer dispatch vs shape-based
 * ArtifactView) stay independently inspectable.
 */

import type {
	ActionSummaryPayload,
	ArtifactMetadataExtended,
	FileLeasePayload,
	PermissionRequestPayload,
	SkillChangePayload,
} from "@hyperidle/shared";

interface L9ReviewThreadBase {
	id: string;
	proposer: string;
	timestamp: string;
	blocking: boolean;
	reasoning: string[];
	metadata: ArtifactMetadataExtended;
}

export type L9ReviewThread =
	| (L9ReviewThreadBase & { kind: "action_summary"; payload: ActionSummaryPayload })
	| (L9ReviewThreadBase & { kind: "skill_change"; payload: SkillChangePayload })
	| (L9ReviewThreadBase & { kind: "file_lease"; payload: FileLeasePayload })
	| (L9ReviewThreadBase & { kind: "permission_request"; payload: PermissionRequestPayload });

export const L9_REVIEW_THREADS: Record<string, L9ReviewThread> = {
	"l9-action-summary": {
		id: "l9-action-summary",
		kind: "action_summary",
		proposer: "Deploy Agent",
		timestamp: "5m ago",
		blocking: false,
		reasoning: [
			"Built hyperidle-web v2.4.1 from main.",
			"Verified sandbox passed end-to-end.",
			"Cost estimate within weekly budget.",
		],
		metadata: {
			kind: "action_summary",
			riskTier: "high",
			reversibility: true,
			costEstimate: 18,
			blastRadius: { agents: [], teams: [], products: ["hyperidle-web"] },
			sandboxResult: "passed",
			status: "pending",
			sla: "2h left",
			routing: "Deploy Agent",
		},
		payload: {
			actionType: "deploy",
			summary: "Deploy hyperidle-web v2.4.1 to prod",
			impactList: [
				{ label: "Affected products", value: "hyperidle-web" },
				{ label: "User-facing", value: "yes" },
				{ label: "Rollback ETA", value: "4m" },
			],
			confirmToken: "deploy",
		},
	},
	"l9-action-summary-critical": {
		id: "l9-action-summary-critical",
		kind: "action_summary",
		proposer: "Deploy Agent",
		timestamp: "1m ago",
		blocking: true,
		reasoning: ["Sandbox passed but blast radius covers all products."],
		metadata: {
			kind: "action_summary",
			riskTier: "critical",
			reversibility: false,
			costEstimate: 240,
			blastRadius: { agents: [], teams: [], products: ["hyperidle-web", "hyperidle-api"] },
			sandboxResult: "passed",
			status: "pending",
			sla: "30m left",
			routing: "Deploy Agent",
		},
		payload: {
			actionType: "deploy",
			summary: "Deploy hyperidle-api v3.0.0 to prod (irreversible)",
			impactList: [
				{ label: "Affected products", value: "hyperidle-web, hyperidle-api" },
				{ label: "User-facing", value: "yes" },
				{ label: "Reversible", value: "no" },
			],
			confirmToken: "deploy",
		},
	},
	"l9-skill-change": {
		id: "l9-skill-change",
		kind: "skill_change",
		proposer: "Practice Facilitator",
		timestamp: "20m ago",
		blocking: false,
		reasoning: [
			"Reviewed test-rerun policy for doc-only PRs.",
			"Architect/Developer/Builder all share the skill.",
		],
		metadata: {
			kind: "skill_change",
			riskTier: "high",
			reversibility: true,
			costEstimate: 3,
			blastRadius: {
				agents: ["Architect", "Developer", "Builder"],
				teams: [],
				products: [],
			},
			sandboxResult: "passed",
			status: "pending",
			sla: "1d left",
			routing: "Practice Facilitator",
		},
		payload: {
			skillId: "skill:tests-on-typo",
			diff: {
				before: "Always rerun tests after typo fixes",
				after: "Skip tests when only comments change",
			},
			agentImpacts: [
				{ agentName: "Architect", behaviorChange: "no behavioral change" },
				{ agentName: "Developer", behaviorChange: "30% faster on doc-only PRs" },
				{ agentName: "Builder", behaviorChange: "30% faster on doc-only PRs" },
			],
			rolloutPolicy: null,
		},
	},
	"l9-file-lease": {
		id: "l9-file-lease",
		kind: "file_lease",
		proposer: "Architect",
		timestamp: "12m ago",
		blocking: true,
		reasoning: ["Two agents claimed the same file path within the lease window."],
		metadata: {
			kind: "file_lease",
			riskTier: "medium",
			reversibility: true,
			costEstimate: 1,
			blastRadius: {
				agents: ["Developer", "Builder"],
				teams: [],
				products: ["hyperidle-web"],
			},
			sandboxResult: "n/a",
			status: "pending",
			sla: "30m left",
			routing: "Architect",
		},
		payload: {
			filePath: "packages/web/src/pages/Auth.tsx",
			agentA: {
				name: "Developer",
				artifactSnippet: "+import { Auth } from '...'\n+function Auth() { return null }",
			},
			agentB: {
				name: "Builder",
				artifactSnippet: "+export function Auth() { return null }",
			},
		},
	},
	"l9-permission-request": {
		id: "l9-permission-request",
		kind: "permission_request",
		proposer: "Builder",
		timestamp: "8m ago",
		blocking: false,
		reasoning: ["Last 12 deploys all green; agent requests step up."],
		metadata: {
			kind: "permission_request",
			riskTier: "high",
			reversibility: true,
			costEstimate: null,
			blastRadius: { agents: ["Builder"], teams: [], products: [] },
			sandboxResult: null,
			status: "pending",
			sla: "1d left",
			routing: "CPO",
		},
		payload: {
			requesterAgentId: "agent:builder",
			requesterAgentName: "Builder",
			skillId: "deploy",
			currentLevel: 2,
			requestedLevel: 3,
			justification: "Last 12 deploys all green, 0 rollbacks. Trust earned.",
		},
	},
};

export function getL9ReviewThread(id: string | null): L9ReviewThread | null {
	if (!id) return null;
	return L9_REVIEW_THREADS[id] ?? null;
}
