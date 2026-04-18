/**
 * Knowledge/Detail page — shows a single knowledge item detail.
 * Uses KeyValue (Tier 1) and DaisyUI primitives for layout.
 */
import type { KnowledgeStatus } from "@hyperidle/shared";
import type { JSX } from "react";
import { useParams } from "react-router-dom";
import { KeyValue } from "../components/KeyValue";
import type { Status } from "../components/StatusChip";
import { StatusChip } from "../components/StatusChip";
import { Tag } from "../components/Tag";

/** Maps domain KnowledgeStatus to presentation Status for StatusChip rendering. */
function knowledgeStatusToChipStatus(status: KnowledgeStatus): Status {
	switch (status) {
		case "active":
		case "validated":
			return "healthy";
		case "stale":
			return "behind";
		case "archived":
			return "done";
		case "provisional":
		case "needs_human":
			return "paused";
		default:
			return "healthy";
	}
}

interface MockKnowledgeDetail {
	id: string;
	title: string;
	layer: string;
	kind: string;
	status: KnowledgeStatus;
	timestamp: string;
	content: string;
	source: string;
}

const MOCK_DETAILS: Record<string, MockKnowledgeDetail> = {
	k1: {
		id: "k1",
		title: "Architecture Decision: Auth Strategy",
		layer: "company",
		kind: "belief",
		status: "active",
		timestamp: "1d ago",
		content:
			"JWT-based authentication with refresh tokens. Access tokens expire in 15 minutes. Refresh tokens in 7 days. All tokens stored in httpOnly cookies, never localStorage.",
		source: "Architecture review session, Architect Agent",
	},
	k2: {
		id: "k2",
		title: "API Rate Limiting Best Practices",
		layer: "product",
		kind: "fact",
		status: "active",
		timestamp: "2d ago",
		content:
			"Rate limiting at 100 requests/minute per API key. Sliding window algorithm. Returns 429 with Retry-After header. Exemptions for internal service accounts.",
		source: "API design document, Developer Agent",
	},
};

const FALLBACK_DETAIL: MockKnowledgeDetail = {
	id: "unknown",
	title: "Unknown Knowledge Item",
	layer: "unknown",
	kind: "unknown",
	status: "provisional",
	timestamp: "—",
	content: "This knowledge item was not found.",
	source: "—",
};

export function KnowledgeDetail(): JSX.Element {
	const { knowledgeId } = useParams<{ knowledgeId: string }>();
	const item = (knowledgeId && MOCK_DETAILS[knowledgeId]) || FALLBACK_DETAIL;
	const loading = false;
	const error: string | null = null;

	if (loading) {
		return (
			<div className="flex flex-col gap-3 h-full max-w-2xl" data-testid="knowledge-detail-page">
				<div className="skeleton h-6 w-3/4" />
				<div className="skeleton h-4 w-1/2" />
				<div className="skeleton h-32 w-full" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col gap-3 h-full max-w-2xl" data-testid="knowledge-detail-page">
				<div role="alert" className="alert alert-error text-sm">
					{error}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3 h-full max-w-2xl" data-testid="knowledge-detail-page">
			<div className="flex items-center gap-2">
				<h1 className="text-sm font-semibold">{item.title}</h1>
				<Tag label={item.layer} />
				<Tag label={item.kind} />
				<StatusChip status={knowledgeStatusToChipStatus(item.status)} />
			</div>

			<div className="flex flex-col gap-2">
				<KeyValue label="Source" value={item.source} />
				<KeyValue label="Updated" value={item.timestamp} />
			</div>

			<div className="bg-base-200 rounded p-3">
				<p className="text-sm leading-relaxed">{item.content}</p>
			</div>
		</div>
	);
}
