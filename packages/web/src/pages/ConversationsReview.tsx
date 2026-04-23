/**
 * Conversations/Review page — composes ArtifactView + ReviewHeader from Tier 3.
 * Shows the selected review item's artifact + verdict header.
 * Thread selection is handled by the Submenu, not duplicated here.
 *
 * @lore J4 AC: Reasoning block renders before the artifact for every review.
 * Metadata strip + related history populate the ArtifactView. Single-key
 * A/R/X/S/P shortcuts pre-fill a pending verdict; Enter confirms.
 */
import { ErrorState, SkeletonList } from "@hyperidle/design-system";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { ReasoningBlock } from "../components/ReasoningBlock";
import type {
	ArtifactMetadata,
	ArtifactViewProps,
	RelatedHistoryEntry,
} from "../shell/ArtifactView";
import { ArtifactView } from "../shell/ArtifactView";
import type { VerdictAction } from "../shell/ReviewHeader";
import { ReviewHeader } from "../shell/ReviewHeader";

interface MockReviewItem {
	id: string;
	title: string;
	snippet: string;
	timestamp: string;
	proposer: string;
	artifact: ArtifactViewProps;
	reasoning: string[];
	metadata: ArtifactMetadata;
	relatedHistory: RelatedHistoryEntry[];
	blocking: boolean;
}

const MOCK_REVIEWS: MockReviewItem[] = [
	{
		id: "r1",
		title: "Auth flow implementation",
		snippet: "Added login/signup endpoints with JWT tokens",
		timestamp: "2m ago",
		proposer: "Developer Agent",
		blocking: true,
		reasoning: [
			"Scanned packages/server/src/routes for an existing auth router.",
			"Confirmed Hono JWT middleware is already a workspace dependency.",
			"Wired signup + login handlers into the existing user repository.",
			"Added integration tests covering happy-path JWT issuance.",
			"Verified tsc + biome + vitest all green before opening the review.",
		],
		metadata: {
			status: "pending",
			sla: "2h left",
			routing: "Backend Agent",
		},
		relatedHistory: [
			{ id: "h1", label: "Previous login spike", timestamp: "3d ago" },
			{ id: "h2", label: "Auth design doc", timestamp: "1w ago" },
		],
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
		blocking: false,
		reasoning: [
			"Compared weekly cost roll-up against the raw daily ledger.",
			"Spotted an off-by-one at ISO week boundaries.",
			"Replaced the ad-hoc groupBy with `date_trunc('week', ...)`.",
		],
		metadata: {
			status: "ok",
			sla: "24h left",
			routing: "Analyst Agent",
		},
		relatedHistory: [{ id: "h3", label: "Prior cost dashboard", timestamp: "2d ago" }],
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

/** Keys that pre-fill a verdict. Mirrors the primary + pause shortcut set. */
const PREFILL_KEYS: Record<string, VerdictAction> = {
	a: "approve",
	r: "request-changes",
	x: "reject",
	s: "snooze",
	p: "pause",
};

const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function ConversationsReview(): JSX.Element {
	const [selectedId, setSelectedId] = useState<string>(MOCK_REVIEWS[0].id);
	const [loading] = useState(false);
	const [error] = useState<string | null>(null);
	const [pendingVerdict, setPendingVerdict] = useState<VerdictAction | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);

	const selected = MOCK_REVIEWS.find((r) => r.id === selectedId) ?? MOCK_REVIEWS[0];

	// Expose setSelectedId for parent Submenu integration
	void setSelectedId;

	const commitVerdict = useCallback((_action: VerdictAction): void => {
		// Mock verdict — real API wiring deferred
	}, []);

	const handleVerdict = useCallback(
		(action: VerdictAction): void => {
			// Direct click commits immediately.
			commitVerdict(action);
			setPendingVerdict(null);
		},
		[commitVerdict],
	);

	// @lore J4 AC: single-key A/R/X/S/P pre-fill a pending verdict; Enter
	// confirms. Guard against typing in inputs.
	useEffect(() => {
		const handler = (e: KeyboardEvent): void => {
			const target = e.target as HTMLElement | null;
			if (target && (INPUT_TAGS.has(target.tagName) || target.isContentEditable)) {
				return;
			}
			const key = e.key.toLowerCase();
			const prefill = PREFILL_KEYS[key];
			if (prefill) {
				// Pause only valid on blocking reviews
				if (prefill === "pause" && !selected.blocking) return;
				setPendingVerdict(prefill);
				return;
			}
			if (e.key === "Enter" && pendingVerdict) {
				commitVerdict(pendingVerdict);
				setPendingVerdict(null);
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [pendingVerdict, commitVerdict, selected.blocking]);

	if (loading) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="conversations-review-page">
				<SkeletonList rows={3} ariaLabel="Loading review" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="conversations-review-page">
				<ErrorState title="Failed to load review" description={error} />
			</div>
		);
	}

	return (
		<div
			ref={rootRef}
			className="flex flex-col gap-0 h-full"
			data-testid="conversations-review-page"
		>
			<ReviewHeader
				proposer={{
					name: selected.proposer,
					timestamp: selected.timestamp,
				}}
				onVerdict={handleVerdict}
				blocking={selected.blocking}
			/>
			{pendingVerdict && (
				<output
					data-testid="pending-verdict"
					className="block px-3 py-1 text-xs font-mono bg-[var(--surface-ghost)] text-[var(--text-mid)] border-b border-[var(--border-default)]"
				>
					Pending: {pendingVerdict} — press Enter to confirm
				</output>
			)}
			<div className="flex-1 overflow-y-auto">
				<ReasoningBlock steps={selected.reasoning} />
				<div className="p-3">
					<ArtifactView
						{...selected.artifact}
						metadata={selected.metadata}
						relatedHistory={selected.relatedHistory}
					/>
				</div>
			</div>
		</div>
	);
}
