/**
 * TaskSheet.tsx — Right-anchored drawer (desktop) / bottom-sheet (mobile) that
 * lets a human request a task state change or navigate to the task's attached thread.
 *
 * Design: Variant C from plans/L15/design/approved.md (scored 79/90).
 *
 * @lore Task ↔ thread resolution is N+1 for now — every Sheet open that
 * calls resolveThreadId issues a fresh request. The list endpoint already
 * supports `(host_kind=task, host_id=<id>)` filtering; a bet-detail-style
 * preload could come in L18, but for L15 the Sheet is opened on demand
 * and one round-trip is acceptable.
 *
 * @lore No `useToast` hook is used here (none exists in packages/web/src/).
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
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import type { KanbanTask } from "./Kanban";

export interface TaskSheetProps {
	task: KanbanTask | null;
	open: boolean;
	onClose: () => void;
	/**
	 * Resolves (or creates) the attached thread for a task and returns its id.
	 * Wired by WorkTeam to the threads API via task-threads.ts.
	 */
	resolveThreadId: (taskId: string) => Promise<string>;
	/**
	 * Posts a plain request message on the resolved thread.
	 * Wired by WorkTeam to postRequestMessage from task-threads.ts.
	 */
	postRequest: (threadId: string, text: string, clientKey: string) => Promise<void>;
	/**
	 * Navigate to the conversations chat surface for a thread id.
	 * Wired by WorkTeam to react-router's useNavigate.
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

export function TaskSheet({
	task,
	open,
	onClose,
	resolveThreadId,
	postRequest,
	onNavigateToThread,
}: TaskSheetProps): JSX.Element | null {
	const [selectedIntent, setSelectedIntent] = useState<IntentId | null>(null);
	const [note, setNote] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [status, setStatus] = useState<FeedbackStatus>(null);
	const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

	// ESC closes the sheet.
	useEffect(() => {
		if (!open) return;
		function handleKeyDown(e: KeyboardEvent): void {
			if (e.key === "Escape") {
				onClose();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [open, onClose]);

	// Focus trap: intercept Tab/Shift-Tab and cycle within the dialog.
	const handleDialogKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>): void => {
		if (e.key !== "Tab" || !dialogRef.current) return;
		const focusables = getFocusableElements(dialogRef.current);
		if (focusables.length === 0) return;

		const first = focusables[0];
		const last = focusables[focusables.length - 1];

		if (e.shiftKey) {
			// Shift+Tab: if focus is at the first element, wrap to last.
			if (document.activeElement === first) {
				e.preventDefault();
				last.focus();
			}
		} else if (document.activeElement === last) {
			// Tab: if focus is at the last element, wrap to first.
			e.preventDefault();
			first.focus();
		}
	}, []);

	if (!(task && open)) {
		return null;
	}

	const intentTemplate = REQUEST_INTENTS.find((i) => i.id === selectedIntent)?.template ?? null;

	async function handleSendRequest(): Promise<void> {
		if (!intentTemplate || submitting || !task) return;

		setSubmitting(true);
		setStatus(null);

		const text = note.trim() ? `${intentTemplate} ${note.trim()}` : intentTemplate;
		// Mint a fresh clientKey per click (L1 idempotency contract).
		const clientKey = crypto.randomUUID();

		try {
			const threadId = await resolveThreadId(task.id);
			await postRequest(threadId, text, clientKey);
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

	async function handleOpenThread(): Promise<void> {
		if (!task) return;
		try {
			const threadId = await resolveThreadId(task.id);
			onNavigateToThread(threadId);
		} catch {
			setStatus({ kind: "error", text: "Couldn't open thread — try again." });
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
			role="dialog"
			aria-modal="true"
			aria-labelledby="task-sheet-title"
			// Mobile: bottom-sheet (inset-x-0 bottom-0 max-h-[85vh] rounded-t-[var(--r3)])
			// sm+: right-anchored drawer (~360px wide)
			// @lore The responsive classes implement the design/approved.md Mobile section:
			// small viewports get a bottom-sheet; desktop gets a right drawer. Both share
			// the same component — Tailwind responsive prefixes do the layout switching.
			className="fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-[var(--r3)] flex flex-col w-full bg-[var(--surface-2)] border-t border-[var(--border-lo)] shadow-lg z-50 sm:inset-y-0 sm:right-0 sm:bottom-auto sm:left-auto sm:max-w-[360px] sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-l"
			onKeyDown={handleDialogKeyDown}
		>
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-lo)]">
				<span className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-lo)]">
					Task
				</span>
				<button type="button" aria-label="Close" className="btn btn-ghost btn-xs" onClick={onClose}>
					✕
				</button>
			</div>

			{/* Task summary */}
			<div className="px-4 py-3 border-b border-[var(--border-lo)]">
				<p id="task-sheet-title" className="text-base font-medium text-[var(--text-hi)]">
					{task.title}
				</p>
				<div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-lo)]">
					<span>{task.owner}</span>
					{task.betTag && <span>· {task.betTag}</span>}
					{task.cost && <span>· {task.cost}</span>}
				</div>
			</div>

			{/* Open thread button */}
			<div className="px-4 py-3 border-b border-[var(--border-lo)]">
				<button
					type="button"
					className="btn btn-ghost btn-sm w-full"
					disabled={submitting}
					onClick={() => void handleOpenThread()}
				>
					Open thread
				</button>
			</div>

			{/* Request section */}
			<div className="flex flex-col gap-3 px-4 py-4 flex-1 overflow-y-auto">
				<p className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-lo)]">
					REQUEST
				</p>

				{/* Intent radiogroup */}
				<div role="radiogroup" aria-label="Request intent" className="flex flex-col gap-1">
					{REQUEST_INTENTS.map((intent) => (
						<label
							key={intent.id}
							className="flex items-center gap-2 min-h-[44px] px-3 rounded cursor-pointer hover:bg-[var(--surface-3)]"
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
							<span className="text-sm text-[var(--text-hi)]">{intent.label}</span>
						</label>
					))}
				</div>

				{/* Optional note */}
				<label className="flex flex-col gap-1">
					<span className="text-xs text-[var(--text-lo)]">Note (optional)</span>
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
	);
}
