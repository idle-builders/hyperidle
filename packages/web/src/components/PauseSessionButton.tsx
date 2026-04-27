/**
 * L7 — PauseSessionButton (red phase stub).
 *
 * INTENTIONALLY UNIMPLEMENTED — see KillSwitchDialog.tsx note.
 */

export interface PauseSessionButtonProps {
	session: { id: string; state: "running" | "paused"; agentName: string };
	onPause: (input: { reason: string }) => Promise<void> | void;
	onResume: () => Promise<void> | void;
	factoryPaused?: boolean;
}

export function PauseSessionButton(_props: PauseSessionButtonProps): null {
	return null;
}
