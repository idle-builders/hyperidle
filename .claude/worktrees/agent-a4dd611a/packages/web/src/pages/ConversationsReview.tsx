/**
 * Conversations/Review page — composes ArtifactView + ReviewHeader from Tier 3.
 * Shows a list of review items; selecting one shows the artifact + verdict header.
 */
import { type JSX, useCallback, useState } from "react";
import { ThreadRow } from "../components/ThreadRow";
import type { ArtifactViewProps } from "../shell/ArtifactView";
import { ArtifactView } from "../shell/ArtifactView";
import { ReviewHeader } from "../shell/ReviewHeader";
import type { VerdictAction } from "../shell/ReviewHeader";

const AVATAR_PLACEHOLDER =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23374151'/%3E%3C/svg%3E";

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

	const selected = MOCK_REVIEWS.find((r) => r.id === selectedId) ?? MOCK_REVIEWS[0];

	const handleVerdict = useCallback((_action: VerdictAction): void => {
		// Mock verdict — real API wiring deferred
	}, []);

	return (
		<div className="flex flex-col gap-0 h-full" data-testid="conversations-review-page">
			<ReviewHeader
				proposer={{
					name: selected.proposer,
					timestamp: selected.timestamp,
				}}
				onVerdict={handleVerdict}
			/>
			<div className="flex flex-1 min-h-0">
				{/* Thread list sidebar */}
				<div className="w-72 border-r border-base-300 overflow-y-auto flex-shrink-0">
					{MOCK_REVIEWS.map((review) => (
						<ThreadRow
							key={review.id}
							avatarUrl={AVATAR_PLACEHOLDER}
							title={review.title}
							snippet={review.snippet}
							timestamp={review.timestamp}
							kind="review"
							unread={review.id === "r1"}
							onClick={() => setSelectedId(review.id)}
						/>
					))}
				</div>
				{/* Artifact view */}
				<div className="flex-1 overflow-y-auto p-3">
					<ArtifactView {...selected.artifact} />
				</div>
			</div>
		</div>
	);
}
