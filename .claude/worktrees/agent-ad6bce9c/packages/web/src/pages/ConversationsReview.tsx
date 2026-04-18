/**
 * Conversations/Review page — composes ArtifactView + ReviewHeader from Tier 3.
 * Shows the selected review item's artifact + verdict header.
 * Thread selection is handled by the Submenu, not duplicated here.
 */
import { type JSX, useCallback, useState } from "react";
import type { ArtifactViewProps } from "../shell/ArtifactView";
import { ArtifactView } from "../shell/ArtifactView";
import { ReviewHeader } from "../shell/ReviewHeader";
import type { VerdictAction } from "../shell/ReviewHeader";

interface MockReviewItem {
	id: string;
	title: string;
	snippet: string;
	timestamp: string;
	proposer: string;
	artifact: ArtifactViewProps;
}

const MOCK_REVIEWS: MockReviewItem[] = [
	{
		id: "r1",
		title: "Auth flow implementation",
		snippet: "Added login/signup endpoints with JWT tokens",
		timestamp: "2m ago",
		proposer: "Developer Agent",
		artifact: {
			shape: "text_diff",
			data: {
				hunks: [
					{
						header: "@@ -1,3 +1,5 @@",
						lines: [
							{ type: "context", content: "import { Hono } from 'hono';" },
							{ type: "addition", content: "import { jwt } from 'hono/jwt';" },
							{ type: "addition", content: "import { authMiddleware } from './auth';" },
							{ type: "context", content: "" },
							{ type: "deletion", content: "// TODO: add auth" },
						],
					},
				],
			},
		},
	},
	{
		id: "r2",
		title: "Dashboard metrics update",
		snippet: "Updated cost tracking with weekly aggregation",
		timestamp: "15m ago",
		proposer: "Analyst Agent",
		artifact: {
			shape: "data_metrics",
			data: {
				headlines: [
					{ label: "Total Cost", value: "$284.50" },
					{ label: "Tasks Done", value: "42" },
					{ label: "Avg Cycle", value: "2.3h" },
				],
				charts: [{ label: "Daily Spend", values: [12, 15, 8, 22, 18, 14, 20] }],
			},
		},
	},
];

export function ConversationsReview(): JSX.Element {
	const [selectedId, setSelectedId] = useState<string>(MOCK_REVIEWS[0].id);
	const [loading] = useState(false);
	const [error] = useState<string | null>(null);

	const selected = MOCK_REVIEWS.find((r) => r.id === selectedId) ?? MOCK_REVIEWS[0];

	// Expose setSelectedId for parent Submenu integration
	void setSelectedId;

	const handleVerdict = useCallback((_action: VerdictAction): void => {
		// Mock verdict — real API wiring deferred
	}, []);

	if (loading) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="conversations-review-page">
				<div className="skeleton h-12 w-full" />
				<div className="skeleton h-32 w-full" />
				<div className="skeleton h-4 w-3/4" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="conversations-review-page">
				<div role="alert" className="alert alert-error text-sm">
					{error}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-0 h-full" data-testid="conversations-review-page">
			<ReviewHeader
				proposer={{
					name: selected.proposer,
					timestamp: selected.timestamp,
				}}
				onVerdict={handleVerdict}
			/>
			<div className="flex-1 overflow-y-auto p-3">
				<ArtifactView {...selected.artifact} />
			</div>
		</div>
	);
}
