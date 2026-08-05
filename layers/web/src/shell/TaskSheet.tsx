/**
 * TaskSheet.tsx — Right-anchored drawer (desktop) / bottom-sheet (mobile) that
 * lets a human request a task state change or view the task's attached thread.
 *
 * Design: Variant C from plans/L15/design/approved.md (scored 79/90).
 *
 * @lore L18: The "Open thread" button is replaced by an inline
 * `<HostThreadSection hostKind="task" hostId={task.id} inline />` for
 * the discussion thread. The three props `resolveThreadId`, `postRequest`,
 * `onNavigateToThread` were marked @deprecated but AM5 T9 verified they are
 * LIVE: resolveThreadId+onNavigateToThread power the "Open thread" button
 * (AC §621) and postRequest powers intent submission. @deprecated removed.
 *
 * @lore No `useToast` hook is used here (none exists in layers/web/src/).
 * Success and error feedback are rendered inline in the sheet via
 * `role="status"` / `role="alert"` regions (architecture §C, critique R2).
 *
 * @lore Focus management: we snapshot `document.activeElement` at open time
 * (not via a triggerRef passed from WorkTeam) because TaskSheet is a shell
 * component — the trigger lives in Kanban, two layers away. Snapshotting at
 * the moment the sheet opens is idiomatic and requires no prop threading. The
 * restored element must be focusable; if it isn't (e.g. the task card doesn't
 * have tabIndex) we fall back to document.body silently.
 */
import {
	LiveDot,
	StatusChip,
	sessionOutcomeToStatus,
	useDialogBehavior,
} from "@hyperidle/design-system";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { ArtifactSection } from "../components/ArtifactSection.js";
import { type TaskSession, useTaskSessions } from "../hooks/useTaskSessions.js";
import { isValidHarnessUrl } from "../lib/url-utils.js";
import { HostThreadSection } from "./HostThreadSection.js";

/**
 * KanbanTask type — moved inline from Kanban.tsx (deleted in U9 AC-10).
 * @lore U9: Canvas and Kanban components removed. KanbanTask is the task
 * shape used by TaskSheet. Moved here to break the import dependency before
 * deleting Kanban.tsx.
 */
export interface KanbanTask {
	id: string;
	title: string;
	owner: string;
	state: import("@hyperidle/shared").TaskState;
	betTag?: string;
	// L19: latest session metadata (all optional — callers that don't have session data don't break)
	latestSessionOutcome?: import("@hyperidle/shared").SessionOutcome | null;
	latestSessionTokensInput?: number | null;
	latestSessionTokensOutput?: number | null;
	latestSessionHarnessUrl?: string | null;
	/**
	 * M3 D4: agent participant id for HostThreadSection on the task detail view.
	 * Null/undefined means no agent is assigned.
	 */
	ownerAgentId?: string | null;
}

/**
 * L19: Formats token counts for compact display.
 * 1500 → "1.5k", 1_500_000 → "1.5M", 500 → "500".
 */
function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

export interface TaskSheetProps {
	task: KanbanTask | null;
	open: boolean;
	onClose: () => void;
	/**
	 * @lore AM5 T9 VERIFY: marked @deprecated in L18, but verified LIVE — still
	 * used by handleOpenThread (resolves the task thread for "Open thread" nav)
	 * and handleSendRequest (posts intent messages). WorkBet.tsx and stories both
	 * pass this. Not a candidate for removal without consolidating those code paths.
	 */
	resolveThreadId: (taskId: string) => Promise<string>;
	/**
	 * @lore AM5 T9 VERIFY: marked @deprecated in L18, but verified LIVE — still
	 * used by handleSendRequest to post intent messages on the task thread.
	 */
	postRequest: (threadId: string, text: string, clientKey: string) => Promise<void>;
	/**
	 * @lore AM5 T9 VERIFY: marked @deprecated in L18, but verified LIVE — still
	 * used by handleOpenThread for "Open thread" navigation to /conversations/:id.
	 */
	onNavigateToThread: (threadId: string) => void;
}

/**
 * Closed intent vocabulary — matches approved.md table.
 */
const REQUEST_INTENTS = [
	{ id: "blocked", label: "Move to BLOCKED", template: "Request: move to BLOCKED." },
	{ id: "in_progress", label: "Unblock and resume", template: "Request: unblock and resume." },
	{ id: "done", label: "Mark DONE", template: "Request: mark DONE." },
	{ id: "hold", label: "Put on HOLD", template: "Request: put on HOLD." },
	{ id: "killed", label: "Stop (kill)", template: "Request: stop (kill)." },
] as const;

type IntentId = (typeof REQUEST_INTENTS)[number]["id"];

type FeedbackStatus = { kind: "success"; text: string } | { kind: "error"; text: string } | null;

/** Selects all focusable elements inside a container (standard A11y candidate set). */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(
		container.querySelectorAll<HTMLElement>(
			'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
		),
	).filter((el) => !el.hasAttribute("disabled") && el.tabIndex >= 0);
}

// AI4 Task 8: Local LiveDot removed — promoted to @hyperidle/design-system.
// @lore AF12 fulfilled: promotion complete. Import LiveDot from design-system above.

/**
 * Renders one session row: title/agent + live-dot/status label.
 *
 * @lore AF12: mirrors WorkTask's `SessionRow` but omits the harness link +
 * effectiveness score for density (design §Surface 4). The status label
 * preserves the raw-status fallback — `isActive ? "Active" : isDone ? "Done" :
 * status` — so a cascade-stopped session renders the non-blank label "stopped",
 * never an empty cell (the load-bearing AC4 guarantee).
 */
function SessionRow({ id, title, agent, status }: TaskSession): JSX.Element {
	const isActive = status === "active";
	const isDone = status === "done" || status === "completed";
	return (
		<div
			key={id}
			data-testid="task-sheet-session-row"
			className="flex items-center gap-[12px] py-[12px] border-b border-[var(--border-subtle)] last:border-b-0"
		>
			<div className="flex-1 min-w-0">
				<div className="text-[14px] font-[500] text-[var(--text-primary)] truncate">{title}</div>
				<div className="text-[12px] text-[var(--text-tertiary)] truncate mt-[2px]">{agent}</div>
			</div>
			<div className="flex items-center gap-[6px] shrink-0">
				{isActive && <LiveDot />}
				<span className="text-[12px] font-[500] text-[var(--text-secondary)]">
					{isActive ? "Active" : isDone ? "Done" : status}
				</span>
			</div>
		</div>
	);
}

/**
 * Sessions section for the TaskSheet (AF12 AC4). Handles all four states:
 * loading, error, empty (non-blank "No sessions yet."), and populated.
 */
function TaskSheetSessions({ taskId }: { taskId: string }): JSX.Element {
	const { data, isLoading, error } = useTaskSessions(taskId);

	return (
		<div className="border-b border-[var(--border-subtle)]">
			<div className="flex items-center px-4 pt-3 pb-1">
				<span className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-tertiary)]">
					Sessions
				</span>
			</div>
			{isLoading ? (
				<p className="text-xs text-[var(--text-tertiary)] px-4 py-2">Loading sessions…</p>
			) : error ? (
				<p role="alert" className="text-sm text-error px-4 py-2">
					Couldn't load sessions.
				</p>
			) : !data || data.sessions.length === 0 ? (
				<p className="text-[13px] text-[var(--text-tertiary)] px-4 py-2">No sessions yet.</p>
			) : (
				<div className="px-4 pb-2">
					{data.sessions.map((s) => (
						<SessionRow key={s.id} {...s} />
					))}
				</div>
			)}
		</div>
	);
}

export function TaskSheet({
	task,
	open,
	onClose,
	// @lore AM5 T9: These three props were marked @deprecated in L18 but are
	// LIVE — resolveThreadId+onNavigateToThread for "Open thread", postRequest
	// for intent submission. @deprecated annotations removed (AM5 T9 verified).
	resolveThreadId: ResolveThreadId,
	postRequest: PostRequest,
	onNavigateToThread,
}: TaskSheetProps): JSX.Element | null {
	const [selectedIntent, setSelectedIntent] = useState<IntentId | null>(null);
	const [note, setNote] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [status, setStatus] = useState<FeedbackStatus>(null);
	const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// @lore AI2: Migrated to useDialogBehavior with modal=false, layer="drawer".
	// modal=false: TaskSheet is a non-modal drawer — no scrim, no backdrop dismiss.
	// Esc is caught at document level (non-modal divs don't receive keyboard events
	// unless focused). behavior.requestDismiss() routes through the guard rule.
	// Layer "drawer" (--z-drawer=30) replaces the old hardcoded z-50 class.
	const behavior = useDialogBehavior({ open, onClose, modal: false, layer: "drawer" });
	const overlayProps = behavior.getOverlayProps();

	// @lore Focus restoration: capture the active element the moment the sheet
	// opens (before any DOM mutation) so we can restore it on close. We use a
	// ref (not state) because it never needs to trigger a re-render.
	const priorFocusRef = useRef<Element | null>(null);
	const dialogRef = useRef<HTMLDivElement | null>(null);

	// Capture focus and move it into the dialog when the sheet opens.
	useEffect(() => {
		if (open) {
			// Snapshot the trigger element before focus moves.
			priorFocusRef.current = document.activeElement;

			// Move focus to the first radio in the intent group after the DOM paints.
			const raf = requestAnimationFrame(() => {
				if (!dialogRef.current) return;
				const focusables = getFocusableElements(dialogRef.current);
				// Find first radio — it is focus-destination per design §Keyboard navigation.
				const firstRadio = focusables.find(
					(el) => el instanceof HTMLInputElement && el.type === "radio",
				);
				const target = firstRadio ?? focusables[0];
				target?.focus();
			});
			return () => cancelAnimationFrame(raf);
		}
		// Sheet closed: restore focus to the element that was active when it opened.
		if (priorFocusRef.current instanceof HTMLElement) {
			priorFocusRef.current.focus();
		}
		priorFocusRef.current = null;
	}, [open]);

	// Reset form state whenever the sheet closes or a new task is opened.
	useEffect(() => {
		if (!open) {
			setSelectedIntent(null);
			setNote("");
			setSubmitting(false);
			setStatus(null);
			if (closeTimerRef.current) {
				clearTimeout(closeTimerRef.current);
				closeTimerRef.current = null;
			}
		}
	}, [open]);

	// Cleanup on unmount.
	useEffect(() => {
		return () => {
			if (closeTimerRef.current) {
				clearTimeout(closeTimerRef.current);
			}
		};
	}, []);

	// @lore AI2: Esc is caught at document level for non-modal surfaces (the drawer
	// div won't receive keyboard events unless focused). behavior.requestDismiss()
	// routes through the unified guard rule (AC-1). Replaces the old bare onClose().
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				behavior.requestDismiss();
			}
		};
		document.addEventListener("keydown", handler);
		return () => {
			document.removeEventListener("keydown", handler);
		};
	}, [open, behavior.requestDismiss]);

	// Focus trap: intercept Tab/Shift-Tab and cycle within the dialog.
	// @lore AI2: TaskSheet keeps its hand-rolled Tab-cycling trap (not focus-trap-react)
	// because it is non-modal. The onKeyDown handler from getOverlayProps() handles Esc;
	// Tab cycling is added on top via a separate callback. Both are merged in the div.
	const handleDialogKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>): void => {
			// Let the behavior hook handle Escape
			overlayProps.onKeyDown(e);
			// Handle Tab cycling
			if (e.key !== "Tab" || !dialogRef.current) return;
			const focusables = getFocusableElements(dialogRef.current);
			if (focusables.length === 0) return;

			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			if (first === undefined || last === undefined) return;

			if (e.shiftKey) {
				if (document.activeElement === first) {
					e.preventDefault();
					last.focus();
				}
			} else if (document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		},
		[overlayProps],
	);

	if (!(task && open)) {
		return null;
	}

	const intentTemplate = REQUEST_INTENTS.find((i) => i.id === selectedIntent)?.template ?? null;

	/**
	 * L18/L15: "Open thread" — resolves (or creates) the task thread, then
	 * navigates to the full thread view in /conversations/:threadId. AC §621 requires
	 * this affordance to remain even after the thread is rendered inline.
	 *
	 * @lore L9: navigation target updated from /conversations/chat to
	 * /conversations/:threadId (canonical URL). The actual navigate call is
	 * delegated through onNavigateToThread which is set by WorkTeam.tsx.
	 *
	 * @lore L18: Uses the deprecated `resolveThreadId` prop (still wired in
	 * WorkTeam) and `_onNavigateToThread`. Both props are kept for backwards-compat
	 * specifically for this affordance.
	 */
	async function handleOpenThread(): Promise<void> {
		if (!task) return;
		try {
			const threadId = await ResolveThreadId(task.id);
			onNavigateToThread(threadId);
		} catch {
			// Swallow: navigation to thread is best-effort.
		}
	}

	async function handleSendRequest(): Promise<void> {
		if (!intentTemplate || submitting || !task) return;

		setSubmitting(true);
		setStatus(null);

		const text = note.trim() ? `${intentTemplate} ${note.trim()}` : intentTemplate;
		// Mint a fresh clientKey per click (L1 idempotency contract).
		// @lore L18: The send request path posts a plain message on the task thread
		// via HostThreadSection. This legacy form handler remains for the intent
		// radiogroup until the TaskSheet UX is fully consolidated.
		const clientKey = crypto.randomUUID();

		try {
			// @lore L18: Legacy resolveThreadId usage retained here for the REQUEST
			// form path. The inline thread for discussion is handled by HostThreadSection.
			const threadId = await ResolveThreadId(task.id);
			await PostRequest(threadId, text, clientKey);
			setStatus({ kind: "success", text: "Sent." });
			// Auto-close after ~800ms per design.
			closeTimerRef.current = setTimeout(() => {
				onClose();
			}, 800);
		} catch {
			setStatus({ kind: "error", text: "Couldn't send — try again." });
			setSubmitting(false);
		}
	}

	function handleIntentChange(id: IntentId): void {
		setSelectedIntent((prev) => (prev === id ? null : id));
		// Clear status when intent changes so the feedback slot is fresh.
		setStatus(null);
	}

	return (
		<div
			ref={dialogRef}
			role={overlayProps.role}
			aria-modal={overlayProps["aria-modal"]}
			aria-labelledby="task-sheet-title"
			data-testid="task-sheet"
			data-dialog-layer={overlayProps["data-dialog-layer"]}
			// Mobile: bottom-sheet (inset-x-0 bottom-0 max-h-[85vh] rounded-t-[var(--r-default)])
			// sm+: right-anchored drawer (~360px wide)
			// @lore The responsive classes implement the design/approved.md Mobile section:
			// small viewports get a bottom-sheet; desktop gets a right drawer. Both share
			// the same component — Tailwind responsive prefixes do the layout switching.
			// @lore AI2: z-50 removed; z-layer now via --z-drawer token in style prop (AC-3).
			className="fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-[var(--r-default)] flex flex-col w-full bg-[var(--surface-container)] border-t border-[var(--border-subtle)] shadow-lg sm:inset-y-0 sm:right-0 sm:bottom-auto sm:left-auto sm:max-w-[min(640px,90vw)] sm:max-h-screen sm:rounded-none sm:border-t-0 sm:border-l"
			style={{ zIndex: overlayProps.style.zIndex }}
			onKeyDown={handleDialogKeyDown}
		>
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
				<span className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-tertiary)]">
					Task
				</span>
				<button type="button" aria-label="Close" className="btn btn-ghost btn-xs" onClick={onClose}>
					✕
				</button>
			</div>

			{/* Scrollable body — dialog content may exceed viewport height */}
			<div className="flex-1 overflow-y-auto">
				{/* Task summary */}
				<div className="px-4 py-3 border-b border-[var(--border-subtle)]">
					<p id="task-sheet-title" className="text-base font-medium text-[var(--text-primary)]">
						{task.title}
					</p>
					<div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-tertiary)]">
						<span>{task.owner}</span>
						{task.betTag && <span>· {task.betTag}</span>}
					</div>
				</div>

				{/* L12: single artifact preview — BEFORE discussion per architecture plan. */}
				<div className="px-4 py-2">
					<ArtifactSection filter={{ axis: "task", taskId: task.id }} layout="single" limit={1} />
				</div>

				{task.latestSessionOutcome && (
					<div
						data-testid="task-session-metadata"
						className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-subtle)] text-xs font-mono text-[var(--text-tertiary)]"
					>
						<StatusChip status={sessionOutcomeToStatus(task.latestSessionOutcome)} />
						{(task.latestSessionTokensInput != null || task.latestSessionTokensOutput != null) && (
							<>
								<span aria-hidden>|</span>
								<span>
									{formatTokens(task.latestSessionTokensInput ?? 0)} in /{" "}
									{formatTokens(task.latestSessionTokensOutput ?? 0)} out
								</span>
							</>
						)}
						{task.latestSessionHarnessUrl && isValidHarnessUrl(task.latestSessionHarnessUrl) && (
							<>
								<span aria-hidden>|</span>
								<a
									href={task.latestSessionHarnessUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="text-[var(--accent-primary)] hover:underline"
									aria-label="Open session in harness (opens in new tab)"
								>
									Open in harness
								</a>
							</>
						)}
					</div>
				)}

				{/* AF12: Sessions section — task's session history with live indicators. */}
				<TaskSheetSessions taskId={task.id} />

				{/* Inline thread — L18: thread is inline; "Open thread" affordance navigates
			    to the full thread view (AC §621: the L15 affordance must still work). */}
				<div className="border-b border-[var(--border-subtle)]">
					<div className="flex items-center justify-between px-4 pt-3 pb-1">
						<span className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-tertiary)]">
							Discussion
						</span>
						<button
							type="button"
							className="btn btn-ghost btn-xs text-xs"
							onClick={() => void handleOpenThread()}
						>
							Open thread
						</button>
					</div>
					{/* M3 D4: pass the task's ownerAgentId so HostThreadSection includes
					    the agent as a thread participant when the thread is created. */}
					<HostThreadSection
						hostKind="task"
						hostId={task.id}
						inline
						agentId={task.ownerAgentId ?? null}
					/>
				</div>

				{/* Request section */}
				<div className="flex flex-col gap-3 px-4 py-4">
					<p className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-tertiary)]">
						REQUEST
					</p>

					{/* Intent radiogroup */}
					<div role="radiogroup" aria-label="Request intent" className="flex flex-col gap-1">
						{REQUEST_INTENTS.map((intent) => (
							<label
								key={intent.id}
								className="flex items-center gap-2 min-h-[44px] px-3 rounded cursor-pointer hover:bg-[var(--surface-elevated)]"
							>
								<input
									type="radio"
									name="request-intent"
									value={intent.id}
									checked={selectedIntent === intent.id}
									onChange={() => handleIntentChange(intent.id)}
									disabled={submitting}
									className="radio radio-sm"
								/>
								<span className="text-sm text-[var(--text-primary)]">{intent.label}</span>
							</label>
						))}
					</div>

					{/* Optional note */}
					<label className="flex flex-col gap-1">
						<span className="text-xs text-[var(--text-tertiary)]">Note (optional)</span>
						<textarea
							className="textarea textarea-bordered text-base resize-none h-20"
							placeholder="What should the agent know?"
							value={note}
							onChange={(e) => {
								setNote(e.target.value);
								setStatus(null);
							}}
							disabled={submitting}
						/>
					</label>

					{/* Inline feedback region — one DOM slot, mutually exclusive states */}
					{status?.kind === "success" ? (
						<div role="status" aria-live="polite" className="text-sm text-success">
							{status.text}
						</div>
					) : status?.kind === "error" ? (
						<div role="alert" aria-live="assertive" className="text-sm text-error">
							{status.text}
						</div>
					) : null}

					{/* Send request button */}
					<button
						type="button"
						className="btn btn-primary btn-sm w-full"
						disabled={!selectedIntent || submitting}
						aria-disabled={!selectedIntent || submitting}
						onClick={() => void handleSendRequest()}
					>
						{submitting ? <span className="loading loading-spinner loading-xs" /> : null}
						Send request
					</button>
				</div>
			</div>
		</div>
	);
}
