/**
 * L7 — RollbackOverflowItem (red phase stub).
 *
 * INTENTIONALLY UNIMPLEMENTED — see KillSwitchDialog.tsx note.
 */
import type { RecoveryOutcome } from "@hyperidle/shared";

export interface RollbackOverflowItemProps {
	verdict: {
		id: string;
		state: "committed" | "draft";
		reversible: boolean;
		threadId: string;
	};
	onRollback: (input: { reason: string }) => Promise<{ outcome: RecoveryOutcome }>;
}

export function RollbackOverflowItem(_props: RollbackOverflowItemProps): null {
	return null;
}
