/**
 * Conversations/Review page — composes ArtifactView + ReviewHeader from Tier 3.
 * Shows the selected review item's artifact + verdict header.
 * Thread selection is handled by the Submenu, not duplicated here.
 *
 * @lore J4 AC: Reasoning block renders before the artifact for every review.
 * Metadata strip + related history populate the ArtifactView. Single-key
 * A/R/X/S/P shortcuts pre-fill a pending verdict; Enter confirms.
 *
 * @lore L4: orchestrates the click-parity + undo-toast flow. ReviewHeader's
 * `onPrefill`/`onCommit` are split so a mouse click follows the same
 * pre-fill confirm as the keyboard path. After commit, `UndoToast` is
 * mounted with a `useUndoTimer`-driven countdown. The page-level capture-
 * phase keydown handler binds `U` to undo and `Esc` to dismiss while the
 * toast is visible — only then. The handler defers to the existing
 * `PREFILL_KEYS` map otherwise.
 *
 * @lore L4 toast stacking: a fresh commit cancels the previous toast
 * (replace, not stack). The previous verdict's window simply ends; we do
 * NOT auto-undo the previous commit.
 */
import {
	DEFAULT_UNDO_WINDOW_SECONDS,
	DEFAULT_VERDICT_DOUBLE_CLICK,
	type VerdictAction,
} from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { ReasoningBlock } from "../components/ReasoningBlock";
import { UndoToast } from "../components/UndoToast";
import { useUndoTimer } from "../hooks/useUndoTimer";
import type {
	ArtifactMetadata,
	ArtifactViewProps,
	RelatedHistoryEntry,
} from "../shell/ArtifactView";
import { ArtifactView } from "../shell/ArtifactView";
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

/**
 * Keys that pre-fill a verdict. Single source of truth for the verdict
 * keymap — covers the 4 primaries (A/R/X/S), Pause (P, blocking-only), and
 * the keyboard-mappable secondaries (C/I/E). The header no longer registers
 * its own keydown listener, so all global verdict shortcuts live here.
 */
const PREFILL_KEYS: Record<string, VerdictAction> = {
	a: "approve",
	r: "request-changes",
	x: "reject",
	s: "snooze",
	p: "pause",
	c: "comment",
	i: "inline-comment",
	e: "edit",
};

const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

interface ToastState {
	decision: VerdictAction;
	itemId: string;
	threadId: string;
	auditRowId: string;
	agentActed: boolean;
}

/**
 * @lore L4 default-settings: until the wider settings reader lands, the
 * page reads shared defaults (`DEFAULT_*` from `@hyperidle/shared`).
 * SettingsPanel persists user-picked values into `factory_settings` and
 * the server snapshots `undo_window_seconds` per `responses` row; the
 * page's runtime countdown will read the persisted value once the wider
 * settings hook lands.
 */
export function ConversationsReview(): JSX.Element {
	const [selectedId] = useState<string>(MOCK_REVIEWS[0].id);
	const [pendingVerdict, setPendingVerdict] = useState<VerdictAction | null>(null);
	const [toast, setToast] = useState<ToastState | null>(null);

	const selected = MOCK_REVIEWS.find((r) => r.id === selectedId) ?? MOCK_REVIEWS[0];

	const verdictDoubleClick = DEFAULT_VERDICT_DOUBLE_CLICK;
	const undoWindowSeconds = DEFAULT_UNDO_WINDOW_SECONDS;

	const handleExpire = useCallback((): void => {
		setToast(null);
	}, []);

	const undoTimer = useUndoTimer({
		windowSeconds: undoWindowSeconds,
		onExpire: handleExpire,
	});
	const { start: startUndoTimer, cancel: cancelUndoTimer } = undoTimer;

	const handlePrefill = useCallback(
		(action: VerdictAction): void => {
			if (action === "pause" && !selected.blocking) return;
			setPendingVerdict(action);
		},
		[selected.blocking],
	);

	const handleCommit = useCallback(
		(action: VerdictAction): void => {
			if (action === "pause" && !selected.blocking) return;
			// L4: replace any in-flight toast — see file-level @lore.
			cancelUndoTimer();
			const auditRowId = `mock-${selected.id}-${Date.now()}`;
			// @lore L4 AC-5 deferred orchestration: `agentActed` is hard-coded
			// to `false` here on purpose. Flipping it to `true` mid-toast
			// requires an event/poll on `items.agent_acted_at` that the page
			// does not own today — the agent-runtime ack writer ships in
			// D-track, which will also wire this signal. The component
			// contract for the swap is proven independently in
			// `packages/web/src/__tests__/UndoToast.test.tsx` ("agentActed=true
			// swaps Undo for a 'View what shipped' link…"); only the
			// page-level orchestration is deferred. Server-side, the 409
			// from `/verdict/undo` already returns `audit_row_id` so the
			// link target is ready when the page reads it.
			setToast({
				decision: action,
				itemId: selected.id,
				threadId: selected.id,
				auditRowId,
				agentActed: false,
			});
			setPendingVerdict(null);
			startUndoTimer();
		},
		[selected.id, selected.blocking, cancelUndoTimer, startUndoTimer],
	);

	// @lore L4 review (adversary C3): the page-level keydown listener
	// closes over `toast` (a useEffect dep) and the timer's `secondsLeft`
	// (not a dep). To avoid firing undo after the timer expired but before
	// React re-binds the listener, we read the *current* secondsLeft via
	// a ref and bail if it has reached 0. This eliminates the U-vs-expiry
	// race that would otherwise produce a silent 410 on the server.
	const secondsLeftRef = useRef<number>(undoWindowSeconds);
	useEffect(() => {
		secondsLeftRef.current = undoTimer.secondsLeft;
	}, [undoTimer.secondsLeft]);

	const handleUndo = useCallback(async (): Promise<void> => {
		if (!toast) return;
		// Race guard: do not POST after the toast's window has elapsed —
		// the server would reject with 410 and the user would see a
		// silent "nothing happened".
		if (secondsLeftRef.current <= 0) {
			cancelUndoTimer();
			setToast(null);
			return;
		}
		const { threadId, itemId } = toast;
		cancelUndoTimer();
		setToast(null);
		try {
			// @lore L4 review (security CRIT + LOW): identity is delivered
			// via the `X-Actor-Id` header — never as a body field. The
			// server's `verdictUndoSchema` is `.strict()` and rejects any
			// body `actorId` to prevent forging another actor's undo.
			//
			// Note: until the SPA-wide actor identification lands, we hard-
			// code `actor:ceo` here. The risk is bounded because the server
			// also enforces `latest.approverId === c.get("actorId")`; a
			// CPO-committed verdict will 403 from this caller.
			const res = await fetch(`/api/threads/${encodeURIComponent(threadId)}/verdict/undo`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Actor-Id": "actor:ceo",
				},
				body: JSON.stringify({ itemId }),
			});
			if (!res.ok) {
				// biome-ignore lint/suspicious/noConsole: observability surface — surface undo failures
				console.warn("[ConversationsReview] undo non-2xx", {
					status: res.status,
					threadId,
					itemId,
				});
			}
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: observability surface — surface undo failures
			console.error("[ConversationsReview] undo fetch failed", {
				message: err instanceof Error ? err.message : String(err),
			});
		}
	}, [toast, cancelUndoTimer]);

	const handleDismiss = useCallback((): void => {
		cancelUndoTimer();
		setToast(null);
	}, [cancelUndoTimer]);

	// @lore J4/L4: single keydown listener with branching on toast state.
	// While the toast is visible, U undoes and Esc dismisses (capture phase
	// to win against any bubble-phase listeners). Otherwise, single-key
	// A/R/X/S/P pre-fill a pending verdict and Enter confirms. Inputs are
	// guarded throughout.
	useEffect(() => {
		const handler = (e: KeyboardEvent): void => {
			const target = e.target;
			if (target instanceof HTMLElement) {
				if (INPUT_TAGS.has(target.tagName) || target.isContentEditable) return;
			}
			if (toast) {
				if (e.key === "u" || e.key === "U") {
					e.preventDefault();
					e.stopPropagation();
					void handleUndo();
					return;
				}
				if (e.key === "Escape") {
					e.preventDefault();
					e.stopPropagation();
					handleDismiss();
				}
				return;
			}
			const key = e.key.toLowerCase();
			const prefill = PREFILL_KEYS[key];
			if (prefill) {
				if (prefill === "pause" && !selected.blocking) return;
				setPendingVerdict(prefill);
				return;
			}
			if (e.key === "Enter" && pendingVerdict) {
				handleCommit(pendingVerdict);
			}
		};
		document.addEventListener("keydown", handler, true);
		return () => document.removeEventListener("keydown", handler, true);
	}, [toast, handleUndo, handleDismiss, pendingVerdict, handleCommit, selected.blocking]);

	return (
		<div className="flex flex-col gap-0 h-full" data-testid="conversations-review-page">
			<ReviewHeader
				proposer={{
					name: selected.proposer,
					timestamp: selected.timestamp,
				}}
				onPrefill={handlePrefill}
				onCommit={handleCommit}
				pendingVerdict={pendingVerdict}
				verdictDoubleClick={verdictDoubleClick}
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
			{toast && (
				<UndoToast
					visible={true}
					threadId={toast.threadId}
					windowSeconds={undoTimer.secondsLeft}
					totalSeconds={undoWindowSeconds}
					agentActed={toast.agentActed}
					auditRowId={toast.auditRowId}
					onUndo={handleUndo}
					onDismiss={handleDismiss}
				/>
			)}
		</div>
	);
}
