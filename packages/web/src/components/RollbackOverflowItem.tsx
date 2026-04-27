/**
 * L7 — RollbackOverflowItem.
 *
 * Overflow-menu entry for the thread-level rollback verb. Renders only
 * for committed verdicts on reversible artifacts (AC3). Click opens a
 * confirm dialog with a reason input and a "Confirm rollback" button;
 * on confirm we await the server's outcome enum and surface it through
 * the resolved promise so the parent can toast
 * `succeeded` / `partially` / `failed`.
 *
 * @lore L7: rollback uses a lighter-weight confirmation than the
 * factory kill switch. The kill-switch type-to-confirm / press-and-hold
 * gate guards an irreversible factory-wide pause; rollback is
 * scope-limited to one thread and rationale alone is sufficient.
 *
 * Until L9 ships `artifact.reversibility`, callers pass
 * `reversible: true` for every committed verdict — the server-side
 * guard returns 410 for the `not_reversible_yet` cases.
 */
import { RATIONALE_MAX_CHARS, type RecoveryOutcome } from "@hyperidle/shared";
import { useId, useState } from "react";

export interface RollbackOverflowItemProps {
	verdict: {
		id: string;
		state: "committed" | "draft";
		reversible: boolean;
		threadId: string;
	};
	onRollback: (input: { reason: string }) => Promise<{ outcome: RecoveryOutcome }>;
}

export function RollbackOverflowItem(
	props: RollbackOverflowItemProps,
): JSX.Element | null {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const reasonId = useId();

	if (props.verdict.state !== "committed" || !props.verdict.reversible) {
		return null;
	}

	const reasonValid = reason.trim().length > 0 && reason.length <= RATIONALE_MAX_CHARS;

	async function onConfirm(): Promise<void> {
		if (!reasonValid) return;
		setSubmitting(true);
		try {
			await props.onRollback({ reason });
			setDialogOpen(false);
			setReason("");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<>
			<button
				type="button"
				role="menuitem"
				data-variant="destructive"
				className="block w-full rounded px-3 py-2 text-left text-error hover:bg-error/10"
				onClick={() => setDialogOpen(true)}
			>
				Rollback
			</button>
			{dialogOpen ? (
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Rollback verdict"
					className="fixed inset-0 z-50 flex items-center justify-center bg-base-300/60 p-4"
				>
					<div className="w-full max-w-md space-y-4 rounded-lg border border-base-300 bg-base-100 p-5 shadow-md">
						<header>
							<h2 className="text-base font-semibold">Rollback verdict</h2>
							<p className="text-sm text-[var(--text-mid)]">
								This will roll back the most recent verdict on this thread.
							</p>
						</header>
						<div className="space-y-2">
							<label htmlFor={reasonId} className="block text-sm font-medium">
								Reason
							</label>
							<textarea
								id={reasonId}
								className="textarea textarea-bordered w-full text-base"
								maxLength={RATIONALE_MAX_CHARS}
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								placeholder="Why are you rolling this back?"
								required
							/>
							<p className="text-xs text-[var(--text-lo)]">
								{reason.length}/{RATIONALE_MAX_CHARS}
							</p>
						</div>
						<footer className="flex items-center justify-end gap-2 pt-2">
							<button
								type="button"
								className="btn btn-ghost btn-sm"
								onClick={() => {
									setDialogOpen(false);
									setReason("");
								}}
								disabled={submitting}
							>
								Cancel
							</button>
							<button
								type="button"
								className="btn btn-error btn-sm min-h-11"
								onClick={() => void onConfirm()}
								disabled={!reasonValid || submitting}
							>
								Confirm rollback
							</button>
						</footer>
					</div>
				</div>
			) : null}
		</>
	);
}
