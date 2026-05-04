/**
 * Conversations/Review page — composes ArtifactView + ReviewHeader from Tier 3.
 * Shows the selected review item's artifact + verdict header.
 * Thread selection is handled by the Submenu, not duplicated here.
 *
 * @lore J4 AC: Reasoning block renders before the artifact for every review.
 * Metadata strip + related history populate the ArtifactView. Single-key
 * A/R/X/S/P shortcuts pre-fill a pending verdict; Enter confirms.
 */
import { type JSX, useCallback, useEffect, useState } from "react";
import { ReasoningBlock } from "../components/ReasoningBlock";
import type {
	ArtifactMetadata,
	ArtifactViewProps,
	RelatedHistoryEntry,
} from "../shell/ArtifactView";
import { ArtifactView } from "../shell/ArtifactView";
import type { InlineCommentDraft, RequestChangesPayload } from "../shell/RequestChangesComposer";
import { RequestChangesComposer } from "../shell/RequestChangesComposer";
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
	const [selectedId] = useState<string>(MOCK_REVIEWS[0].id);
	const [pendingVerdict, setPendingVerdict] = useState<VerdictAction | null>(null);
	// @lore L6: composer state lives at the page level so the global
	// keymap can gate single-key pre-fill while the composer owns the user's
	// attention.
	const [composerOpen, setComposerOpen] = useState(false);
	const [drafts, setDrafts] = useState<InlineCommentDraft[]>([]);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [toast, setToast] = useState<string | null>(null);

	const selected = MOCK_REVIEWS.find((r) => r.id === selectedId) ?? MOCK_REVIEWS[0];

	const commitVerdict = useCallback(
		(action: VerdictAction): void => {
			const itemId = selected.id;
			(async () => {
				try {
					const res = await fetch("/api/conversations/responses", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ itemId, decision: action }),
					});
					if (!res.ok) {
						throw new Error("server-error");
					}
					setSubmitError(null);
				} catch {
					setSubmitError("Could not record verdict. Please try again.");
				}
			})();
		},
		[selected.id],
	);

	const openComposer = useCallback((): void => {
		setSubmitError(null);
		setPendingVerdict(null);
		setComposerOpen(true);
	}, []);

	const handleVerdict = useCallback(
		(action: VerdictAction): void => {
			if (action === "request-changes") {
				openComposer();
				return;
			}
			// Direct click commits immediately.
			commitVerdict(action);
			setPendingVerdict(null);
		},
		[commitVerdict, openComposer],
	);

	const handleAddComment = useCallback(
		(lineKey: string, lineIndex: number, preview: string): void => {
			setDrafts((prev) => {
				if (prev.some((d) => d.lineKey === lineKey)) return prev;
				return [...prev, { lineKey, lineIndex, preview, body: "" }];
			});
			openComposer();
		},
		[openComposer],
	);

	const handleChangeDraft = useCallback((lineKey: string, body: string): void => {
		setDrafts((prev) => prev.map((d) => (d.lineKey === lineKey ? { ...d, body } : d)));
	}, []);

	const handleRemoveDraft = useCallback((lineKey: string): void => {
		setDrafts((prev) => prev.filter((d) => d.lineKey !== lineKey));
	}, []);

	const handleCancel = useCallback((): void => {
		setComposerOpen(false);
		setDrafts([]);
		setSubmitError(null);
	}, []);

	const handleSubmit = useCallback(
		(payload: RequestChangesPayload): void => {
			const itemId = selected.id;
			const inlineCount = payload.inlineComments.length;
			(async () => {
				try {
					const res = await fetch("/api/conversations/responses", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							itemId,
							decision: "request-changes",
							summary: payload.summary,
							inline_comments: payload.inlineComments.map((c) => ({
								line_index: c.lineIndex,
								body: c.body,
							})),
						}),
					});
					if (!res.ok) {
						throw new Error("server-error");
					}
					setComposerOpen(false);
					setDrafts([]);
					setSubmitError(null);
					setToast(
						`Changes requested with ${inlineCount} inline ${inlineCount === 1 ? "comment" : "comments"}.`,
					);
				} catch {
					// @lore L6: collapse network and !res.ok into one user-friendly
					// message; HTTP status codes never leak into product UI.
					setSubmitError("Could not submit changes. Please try again.");
				}
			})();
		},
		[selected.id],
	);

	// @lore J4/L6 AC: single-key A/R/X/S/P pre-fill a pending verdict; Enter
	// confirms. R on a text_diff thread opens the composer instead of pre-filling.
	// While the composer is open, single-key pre-fill is fully suppressed so the
	// composer's local handlers (Esc / Cmd+Enter) can own the keyboard.
	useEffect(() => {
		const handler = (e: KeyboardEvent): void => {
			const target = e.target;
			if (
				target instanceof HTMLElement &&
				(INPUT_TAGS.has(target.tagName) || target.isContentEditable)
			) {
				return;
			}
			if (composerOpen) {
				return;
			}
			const key = e.key.toLowerCase();
			const prefill = PREFILL_KEYS[key];
			if (prefill) {
				// L6: R on a text_diff thread opens the composer instead of pre-fill.
				if (prefill === "request-changes" && selected.artifact.shape === "text_diff") {
					openComposer();
					return;
				}
				// Pause only valid on blocking reviews.
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
	}, [
		pendingVerdict,
		commitVerdict,
		selected.blocking,
		selected.artifact.shape,
		composerOpen,
		openComposer,
	]);

	return (
		<div className="flex flex-col gap-0 h-full" data-testid="conversations-review-page">
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
					{selected.artifact.shape === "text_diff" ? (
						<ArtifactView
							shape="text_diff"
							data={selected.artifact.data}
							metadata={selected.metadata}
							relatedHistory={selected.relatedHistory}
							onAddComment={handleAddComment}
						/>
					) : (
						<ArtifactView
							{...selected.artifact}
							metadata={selected.metadata}
							relatedHistory={selected.relatedHistory}
						/>
					)}
				</div>
			</div>
			{toast && (
				<output
					data-testid="request-changes-toast"
					className="fixed bottom-4 right-4 z-50 px-3 py-2 text-sm bg-base-200 border border-[var(--border-default)] shadow-[var(--float)]"
				>
					{toast}
				</output>
			)}
			<RequestChangesComposer
				open={composerOpen}
				drafts={drafts}
				onChangeDraft={handleChangeDraft}
				onRemoveDraft={handleRemoveDraft}
				onSubmit={handleSubmit}
				onCancel={handleCancel}
				errorMessage={submitError ?? undefined}
			/>
		</div>
	);
}
