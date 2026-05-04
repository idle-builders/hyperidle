/**
 * L15 — TaskRequestMenu (Tier-2 design-system component).
 *
 * Three-dot trigger that opens a dropdown for requesting a state change OR
 * opening the task's attached thread. The menu is the only mutation
 * affordance on Team Board task cards after L15 strips drag.
 *
 * Source of truth: `plans/L15-plan.md` §4.1, approved.md §1-§7.
 *
 * @lore L15 plan §4.1 / CONFUSION-B: target labels (Start/Resume/Block/Done/
 * Abandon/Review) are designer-owned but live in `@hyperidle/shared`'s
 * `verbLabelFor` so the menu UI and the posted message text agree on a
 * single vocabulary.
 */

import type { TaskState } from "@hyperidle/shared";
import { requestableStatesFor, verbLabelFor } from "@hyperidle/shared";
import {
	type JSX,
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { dsProps } from "./ds-attrs";

export interface TaskRequestSubmission {
	readonly targetState: TaskState | null;
	readonly note: string | null;
}

export interface TaskRequestMenuProps {
	readonly taskId: string;
	readonly currentState: TaskState;
	readonly onSubmitRequest: (req: TaskRequestSubmission) => Promise<void>;
	readonly onOpenThread: () => void;
}

// L15 architecture review C2: read-after-write feedback. After a successful
// submit, show an inline confirmation in the menu for this many ms before
// auto-closing and restoring focus. This satisfies AC-2/AC-5 without the
// full Toast infrastructure.
const CONFIRMATION_HOLD_MS = 1600;

export function TaskRequestMenu({
	taskId,
	currentState,
	onSubmitRequest,
	onOpenThread,
}: TaskRequestMenuProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [confirmation, setConfirmation] = useState<string | null>(null);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const targets = requestableStatesFor(currentState);

	const close = useCallback((restoreFocus: boolean): void => {
		setOpen(false);
		setError(null);
		setConfirmation(null);
		if (confirmTimerRef.current !== null) {
			clearTimeout(confirmTimerRef.current);
			confirmTimerRef.current = null;
		}
		if (restoreFocus) {
			triggerRef.current?.focus();
		}
	}, []);

	useEffect(() => {
		if (!open) return;
		function onKey(e: globalThis.KeyboardEvent): void {
			if (e.key === "Escape") {
				e.stopPropagation();
				close(true);
			}
		}
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, close]);

	useEffect(
		() => () => {
			if (confirmTimerRef.current !== null) {
				clearTimeout(confirmTimerRef.current);
				confirmTimerRef.current = null;
			}
		},
		[],
	);

	const handleTriggerClick = useCallback((e: MouseEvent<HTMLButtonElement>): void => {
		e.stopPropagation();
		setOpen((p) => !p);
	}, []);

	const submit = useCallback(
		async (target: TaskState | null): Promise<void> => {
			if (submitting || confirmation !== null) return;
			const trimmed = note.trim();
			const noteValue = trimmed === "" ? null : trimmed;
			if (target === null && noteValue === null) {
				return;
			}
			setSubmitting(true);
			setError(null);
			try {
				await onSubmitRequest({ targetState: target, note: noteValue });
				setNote("");
				// Arch C2: inline read-after-write feedback. Hold the menu open
				// briefly with the confirmation visible, then auto-close.
				setConfirmation("Sent — agent will decide.");
				if (confirmTimerRef.current !== null) {
					clearTimeout(confirmTimerRef.current);
				}
				confirmTimerRef.current = setTimeout(() => {
					confirmTimerRef.current = null;
					close(true);
				}, CONFIRMATION_HOLD_MS);
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : "Failed to send");
			} finally {
				setSubmitting(false);
			}
		},
		[note, onSubmitRequest, submitting, confirmation, close],
	);

	const handleNoteKey = useCallback(
		(e: KeyboardEvent<HTMLInputElement>): void => {
			if (e.key === "Enter") {
				e.preventDefault();
				void submit(null);
			}
		},
		[submit],
	);

	const handleOpenThread = useCallback((): void => {
		onOpenThread();
		close(true);
	}, [onOpenThread, close]);

	return (
		<div {...dsProps("TaskRequestMenu", "2")} className="relative inline-flex">
			<button
				ref={triggerRef}
				type="button"
				aria-label="Request a change to this task"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={handleTriggerClick}
				className="btn btn-ghost btn-xs btn-square min-h-[44px] min-w-[44px]"
			>
				<span aria-hidden className="inline-block">
					…
				</span>
			</button>
			{open ? (
				<div
					role="menu"
					aria-label="Task request options"
					className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-[var(--r2)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-[4px] shadow-lg flex flex-col gap-[4px]"
				>
					{error ? (
						<div role="alert" className="alert alert-error alert-sm text-[13px] m-[4px]">
							<span>{error}</span>
							<button type="button" className="btn btn-ghost btn-xs" onClick={() => setError(null)}>
								Dismiss
							</button>
						</div>
					) : null}
					{confirmation ? (
						<div
							role="status"
							aria-live="polite"
							data-testid="task-request-confirmation"
							className="text-[13px] text-[var(--text)] px-[12px] py-[8px] rounded-[var(--r1)] bg-[var(--surface-ghost)] m-[4px]"
						>
							{confirmation}
						</div>
					) : null}
					{targets.map((target) => {
						const label = verbLabelFor(currentState, target);
						return (
							<button
								key={target}
								type="button"
								role="menuitem"
								disabled={submitting || confirmation !== null}
								onClick={() => {
									void submit(target);
								}}
								className="text-left text-[13px] text-[var(--text)] px-[12px] py-[8px] rounded-[var(--r1)] hover:bg-[var(--surface-ghost)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] disabled:opacity-50"
							>
								{label}
							</button>
						);
					})}
					<div className="px-[8px] py-[4px]">
						<label
							htmlFor={`task-request-note-${taskId}`}
							className="text-[11px] uppercase tracking-wider text-[var(--text-lo)] block mb-[4px]"
						>
							Note for the agent
						</label>
						<input
							id={`task-request-note-${taskId}`}
							type="text"
							value={note}
							onChange={(e) => setNote(e.target.value)}
							onKeyDown={handleNoteKey}
							placeholder="Optional context"
							className="input input-bordered input-sm w-full text-[16px]"
						/>
					</div>
					<button
						type="button"
						role="menuitem"
						onClick={handleOpenThread}
						className="text-left text-[13px] text-[var(--text)] px-[12px] py-[8px] rounded-[var(--r1)] hover:bg-[var(--surface-ghost)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] flex items-center justify-between"
					>
						<span>Open thread</span>
						<span aria-hidden className="font-mono text-[11px] text-[var(--text-lo)]">
							↵
						</span>
					</button>
					<div
						aria-disabled
						className="px-[12px] py-[6px] text-[11px] text-[var(--text-lo)] border-t border-[var(--border-subtle)] mt-[2px]"
					>
						Agent decides whether to honor the request.
					</div>
				</div>
			) : null}
		</div>
	);
}
