/**
 * L7 — KillSwitchDialog (red phase stub).
 *
 * INTENTIONALLY UNIMPLEMENTED: this file exists only so that
 * `KillSwitchDialog.test.tsx` can resolve its import and fail on
 * logical assertions instead of import errors. The green phase
 * (write-code) will replace this stub with the real implementation.
 */
import type { KillSwitchConfirmMode } from "@hyperidle/shared";

export interface KillSwitchDialogProps {
	open: boolean;
	verb: "factory_pause" | "rollback" | "session_pause";
	target: { id: string; name: string };
	blastRadius: string;
	mode: KillSwitchConfirmMode;
	onConfirm: (input: { reason: string }) => Promise<void> | void;
	onCancel: () => void;
}

export function KillSwitchDialog(_props: KillSwitchDialogProps): null {
	return null;
}
