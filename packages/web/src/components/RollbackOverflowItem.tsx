/**
 * L7 — RollbackOverflowItem.
 *
 * Overflow-menu entry for the thread-level rollback verb. Renders only
 * for committed verdicts on reversible artifacts (AC3). Click opens a
 * `KillSwitchDialog` (verb=`rollback`, mode=`reason_only`) — rationale
 * is the only friction since rollback is scope-limited to one thread.
 *
 * @lore L7 (S3): the dialog used to be inlined here (~70 lines of
 * duplicate chrome). It now reuses `KillSwitchDialog` via the
 * `reason_only` mode so a11y, escape paths, and styling stay aligned.
 *
 * Until L9 ships `artifact.reversibility`, callers pass
 * `reversible: true` for every committed verdict — the server-side
 * guard returns 410 for the `not_reversible_yet` cases.
 */
import type { RecoveryOutcome } from "@hyperidle/shared";
import { useState } from "react";
import { KillSwitchDialog } from "./KillSwitchDialog";

export interface RollbackOverflowItemProps {
	verdict: {
		id: string;
		state: "committed" | "draft";
		reversible: boolean;
		threadId: string;
	};
	onRollback: (input: { reason: string }) => Promise<{ outcome: RecoveryOutcome }>;
}

export function RollbackOverflowItem(props: RollbackOverflowItemProps): JSX.Element | null {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	if (props.verdict.state !== "committed" || !props.verdict.reversible) {
		return null;
	}

	async function handleConfirm(input: { reason: string }): Promise<void> {
		if (submitting) return;
		setSubmitting(true);
		try {
			await props.onRollback(input);
			setDialogOpen(false);
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
				<KillSwitchDialog
					open
					verb="rollback"
					target={{ id: props.verdict.id, name: "verdict" }}
					blastRadius="This will roll back the most recent verdict on this thread."
					mode="reason_only"
					reasonPlaceholder="Why are you rolling this back?"
					confirmDisabled={submitting}
					onConfirm={handleConfirm}
					onCancel={() => {
						if (submitting) return;
						setDialogOpen(false);
					}}
				/>
			) : null}
		</>
	);
}
