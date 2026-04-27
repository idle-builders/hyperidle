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
 *
 * @lore L6: request-changes is a verdict like any other — once the composer
 * submits successfully, we route through the same `commitVerdict` path that
 * mounts the L4 UndoToast. The composer is just an extra capture step in
 * front of the same commit.
 *
 * @lore L4/L6 Esc precedence: when the request-changes composer is open,
 * the composer's local Esc handler runs first (its `onKeyDown` calls
 * `stopPropagation()`). Only when the composer is closed does the page-
 * level capture-phase Esc reach the L4 UndoToast dismiss path. The order
 * matters: composer-Esc (closes composer) > toast-Esc (dismisses toast).
 */
import {
	DEFAULT_UNDO_WINDOW_SECONDS,
	DEFAULT_VERDICT_DOUBLE_CLICK,
	type RecoveryOutcome,
	type VerdictAction,
} from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { ReasoningBlock } from "../components/ReasoningBlock";
import { RollbackOverflowItem } from "../components/RollbackOverflowItem";
import { UndoToast } from "../components/UndoToast";
import { useRecoveryFetch } from "../hooks/useRecoveryFetch";
import { useUndoTimer } from "../hooks/useUndoTimer";
import type {
	ArtifactMetadata,
	ArtifactViewProps,
	RelatedHistoryEntry,
} from "../shell/ArtifactView";
import { ArtifactView } from "../shell/ArtifactView";
import type { InlineCommentDraft, RequestChangesPayload } from "../shell/RequestChangesComposer";
import { RequestChangesComposer } from "../shell/RequestChangesComposer";
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
	/**
	 * @lore L7 AC3: gates the Rollback overflow item. Reflects the
	 * artifact's `reversibility` metadata that ships in L9; until then
	 * the page seeds `true` for every committed verdict so the overflow
	 * item is reachable in the integration surface.
	 */
	reversible: boolean;
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
		reversible: true,
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
		reversible: false,
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
	/**
	 * @lore L6: verdict-specific headline copy. When the verdict is
	 * `request-changes`, the L6 spec prescribes
	 * "Changes requested with N inline comments." (or a singular form,
	 * or a no-comments form). For all other verdicts the toast falls
	 * back to the generic L4 "Verdict committed" string.
	 */
	message?: string;
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
	const recoveryFetch = useRecoveryFetch();
	const [selectedId] = useState<string>(MOCK_REVIEWS[0].id);
	const [pendingVerdict, setPendingVerdict] = useState<VerdictAction | null>(null);
	const [toast, setToast] = useState<ToastState | null>(null);
	// @lore L6: composer state lives at the page level so the global
	// keymap can gate single-key pre-fill while the composer owns the user's
	// attention.
	const [composerOpen, setComposerOpen] = useState(false);
	const [drafts, setDrafts] = useState<InlineCommentDraft[]>([]);
	const [submitError, setSubmitError] = useState<string | null>(null);
	// @lore L6 design C5: stash the trigger element on open so we can
	// restore focus to it on close (Esc / Cancel / Submit).
	const composerTriggerRef = useRef<HTMLElement | null>(null);

	const selected = MOCK_REVIEWS.find((r) => r.id === selectedId) ?? MOCK_REVIEWS[0];

	// L7 AC3: rollback is reachable from the more-actions overflow once a
	// verdict has been committed on a reversible artifact. We track the
	// committed state at the page level so the overflow item gates on it.
	const [verdictCommitted, setVerdictCommitted] = useState(false);
	const [rollbackToast, setRollbackToast] = useState<{
		outcome: RecoveryOutcome;
	} | null>(null);

	const handleRollback = useCallback(
		async (input: { reason: string }): Promise<{ outcome: RecoveryOutcome }> => {
			try {
				const res = await recoveryFetch.post(
					`/api/threads/${encodeURIComponent(selected.id)}/verdict/rollback`,
					{ reason: input.reason },
				);
				if (!res.ok) {
					setRollbackToast({ outcome: "failed" });
					return { outcome: "failed" };
				}
				const body = (await res.json()) as { outcome: RecoveryOutcome };
				setRollbackToast({ outcome: body.outcome });
				return { outcome: body.outcome };
			} catch {
				setRollbackToast({ outcome: "failed" });
				return { outcome: "failed" };
			}
		},
		[selected.id, recoveryFetch],
	);

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

	const mountToast = useCallback(
		(action: VerdictAction, message?: string): void => {
			cancelUndoTimer();
			const auditRowId = `mock-${selected.id}-${Date.now()}`;
			setToast({
				decision: action,
				itemId: selected.id,
				threadId: selected.id,
				auditRowId,
				agentActed: false,
				message,
			});
			setPendingVerdict(null);
			// L7 AC3: a committed verdict unlocks the Rollback overflow
			// item (still gated on `selected.reversible`).
			setVerdictCommitted(true);
			startUndoTimer();
		},
		[selected.id, cancelUndoTimer, startUndoTimer],
	);

	const openComposer = useCallback((): void => {
		setSubmitError(null);
		setPendingVerdict(null);
		// @lore L6 design C5: capture the active element (most often the
		// "Request changes" toolbar button) so we can restore focus to it
		// once the composer closes.
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			composerTriggerRef.current = document.activeElement;
		}
		setComposerOpen(true);
	}, []);

	const handlePrefill = useCallback(
		(action: VerdictAction): void => {
			if (action === "pause" && !selected.blocking) return;
			// @lore L6: Request-changes is the only verdict whose first-click
			// goes straight to a composer (the composer IS the pre-fill).
			// Snooze/Approve/Reject still require the L4 pre-fill→confirm
			// double-click contract.
			if (action === "request-changes") {
				openComposer();
				return;
			}
			setPendingVerdict(action);
		},
		[selected.blocking, openComposer],
	);

	const handleCommit = useCallback(
		(action: VerdictAction): void => {
			if (action === "pause" && !selected.blocking) return;
			// @lore L6: request-changes never commits directly — it routes
			// through the composer first (which then calls handleSubmit →
			// commitRequestChanges → mountToast).
			if (action === "request-changes") {
				openComposer();
				return;
			}
			// L4: replace any in-flight toast — see file-level @lore.
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
			mountToast(action);
		},
		[selected.blocking, mountToast, openComposer],
	);

	const handleAddComment = useCallback(
		(lineKey: string, lineIndex: number, preview: string): void => {
			setDrafts((prev) => {
				if (prev.some((d) => d.lineKey === lineKey)) return prev;
				return [...prev, { lineKey, lineIndex, preview, body: "" }];
			});
			// @lore L6 DoD-fix: only open the composer if it is not already
			// mounted. Calling `openComposer()` while it is open re-runs the
			// composer's "reset on open" effect (clears the summary input)
			// and races the next pointer-event in real browsers. The
			// composer is designed to stay mounted while drafts are added —
			// the underlying diff remains clickable thanks to
			// `pointer-events: none` on the modal wrapper (see
			// RequestChangesComposer @lore "DoD-fix").
			if (!composerOpen) {
				openComposer();
			}
		},
		[composerOpen, openComposer],
	);

	const handleChangeDraft = useCallback((lineKey: string, body: string): void => {
		setDrafts((prev) => prev.map((d) => (d.lineKey === lineKey ? { ...d, body } : d)));
	}, []);

	const handleRemoveDraft = useCallback((lineKey: string): void => {
		setDrafts((prev) => prev.filter((d) => d.lineKey !== lineKey));
	}, []);

	const restoreFocusToTrigger = useCallback((): void => {
		const trigger = composerTriggerRef.current;
		composerTriggerRef.current = null;
		if (trigger && typeof trigger.focus === "function") {
			trigger.focus();
		}
	}, []);

	const handleCancel = useCallback((): void => {
		setComposerOpen(false);
		setDrafts([]);
		setSubmitError(null);
		restoreFocusToTrigger();
	}, [restoreFocusToTrigger]);

	const handleSubmit = useCallback(
		(payload: RequestChangesPayload): void => {
			const itemId = selected.id;
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
					restoreFocusToTrigger();
					// @lore L6 review CRIT-2: request-changes is a verdict;
					// verdicts get the L4 UndoToast. Mount the same toast a
					// keyboard-driven Approve would mount.
					// @lore L6 spec: the toast headline is verdict-specific —
					// "Changes requested with N inline comments." (or
					// "with no inline comments" / "1 inline comment"). Read
					// from the just-submitted payload, not from `drafts`,
					// because we cleared `drafts` above.
					const n = payload.inlineComments.length;
					const noun = n === 1 ? "inline comment" : "inline comments";
					const message =
						n === 0
							? "Changes requested with no inline comments."
							: `Changes requested with ${n} ${noun}.`;
					mountToast("request-changes", message);
				} catch {
					// @lore L6: collapse network and !res.ok into one user-friendly
					// message; HTTP status codes never leak into product UI.
					setSubmitError("Could not submit changes. Please try again.");
				}
			})();
		},
		[selected.id, restoreFocusToTrigger, mountToast],
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
			// @lore L7 (AI8): identity now flows from `useMe()` via
			// `useRecoveryFetch`, so a CPO-committed verdict resolves to
			// the CPO's id. The server still enforces
			// `latest.approverId === c.get("actorId")` so cross-founder
			// undos still 403.
			const res = await recoveryFetch.post(
				`/api/threads/${encodeURIComponent(threadId)}/verdict/undo`,
				{ itemId },
			);
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
	}, [toast, cancelUndoTimer, recoveryFetch]);

	const handleDismiss = useCallback((): void => {
		cancelUndoTimer();
		setToast(null);
	}, [cancelUndoTimer]);

	// @lore J4/L4/L6: single keydown listener with branching on
	// composer/toast state.
	//   - While the composer is open, return early so the composer's
	//     local Esc / Cmd+Enter handlers (which `stopPropagation`) own
	//     the keyboard. THIS BRANCH RUNS BEFORE THE TOAST BRANCH on
	//     purpose: composer-Esc takes priority over toast-Esc, so a
	//     composer opened on top of an undo toast still closes the
	//     composer first.
	//   - While the toast is visible (and composer closed), U undoes and
	//     Esc dismisses (capture phase to win against any bubble-phase
	//     listeners).
	//   - Otherwise, single-key A/R/X/S/P pre-fill a pending verdict and
	//     Enter confirms. Inputs are guarded throughout. R on a
	//     text_diff thread opens the composer instead of pre-filling.
	useEffect(() => {
		const handler = (e: KeyboardEvent): void => {
			const target = e.target;
			if (target instanceof HTMLElement) {
				if (INPUT_TAGS.has(target.tagName) || target.isContentEditable) return;
			}
			if (composerOpen) {
				return;
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
					return;
				}
			}
			const key = e.key.toLowerCase();
			const prefill = PREFILL_KEYS[key];
			if (prefill) {
				// @lore L6 review W1: only fire the R-shortcut when no other
				// modal is open. Settings overlay etc. set
				// `[role="dialog"][aria-modal="true"]`; if any such dialog
				// (other than our own composer, which we already handled
				// above) is mounted, suppress single-key pre-fill so R does
				// not stack composers underneath an unrelated dialog.
				if (
					prefill === "request-changes" &&
					typeof document !== "undefined" &&
					document.querySelector('[role="dialog"][aria-modal="true"]')
				) {
					return;
				}
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
				handleCommit(pendingVerdict);
			}
		};
		document.addEventListener("keydown", handler, true);
		return () => document.removeEventListener("keydown", handler, true);
	}, [
		toast,
		handleUndo,
		handleDismiss,
		pendingVerdict,
		handleCommit,
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
				onPrefill={handlePrefill}
				onCommit={handleCommit}
				pendingVerdict={pendingVerdict}
				verdictDoubleClick={verdictDoubleClick}
				blocking={selected.blocking}
				reversibility={selected.reversible}
				extraOverflowItems={
					<RollbackOverflowItem
						verdict={{
							id: `verdict-${selected.id}`,
							state: verdictCommitted ? "committed" : "draft",
							reversible: selected.reversible,
							threadId: selected.id,
						}}
						onRollback={handleRollback}
					/>
				}
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
				<UndoToast
					visible={true}
					threadId={toast.threadId}
					windowSeconds={undoTimer.secondsLeft}
					totalSeconds={undoWindowSeconds}
					agentActed={toast.agentActed}
					auditRowId={toast.auditRowId}
					onUndo={handleUndo}
					onDismiss={handleDismiss}
					message={toast.message}
				/>
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
			{rollbackToast ? (
				<output
					role="status"
					data-testid="rollback-outcome-toast"
					className="fixed bottom-4 right-4 z-50 rounded-[var(--r2)] border border-[var(--border-default)] bg-base-200 px-4 py-2 text-sm shadow-[var(--float)]"
				>
					{`Rollback ${rollbackToast.outcome}.`}
					<button
						type="button"
						className="ml-3 text-xs underline"
						onClick={() => setRollbackToast(null)}
					>
						Dismiss
					</button>
				</output>
			) : null}
		</div>
	);
}
