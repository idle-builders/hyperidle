/**
 * L7 — PauseSessionButton.
 *
 * Renders on each running-session row in `WorkBet` and `WorkTeam`.
 * Click opens a `KillSwitchDialog` (verb=`session_pause`); on confirm
 * the parent's `onPause` hook posts to `/api/sessions/:id/pause`.
 *
 * @lore L7 (AC4 + plan §8): when the factory is paused (`factoryPaused`
 * prop), the per-session Pause button is disabled — the founder must
 * resume the factory first. Per-session Resume IS also disabled while
 * the factory is paused: factory-resume must run first (it auto-
 * restores kill-paused sessions), and a mid-session pause stays paused
 * until the factory is running again. The L7 server tests pin this
 * "factory_resume must run first" ordering.
 */
import { useState } from "react";
import { KillSwitchDialog } from "./KillSwitchDialog";

export interface PauseSessionButtonProps {
	session: { id: string; state: "active" | "paused"; agentName: string };
	onPause: (input: { reason: string }) => Promise<void> | void;
	onResume: () => Promise<void> | void;
	factoryPaused?: boolean;
}

export function PauseSessionButton(props: PauseSessionButtonProps): JSX.Element {
	const [dialogOpen, setDialogOpen] = useState(false);

	if (props.session.state === "paused") {
		return (
			<button
				type="button"
				className="btn btn-xs btn-outline"
				onClick={() => void props.onResume()}
				disabled={props.factoryPaused}
				title={props.factoryPaused ? "Resume the factory first" : undefined}
			>
				Resume
			</button>
		);
	}

	return (
		<>
			<button
				type="button"
				className="btn btn-xs btn-outline btn-error"
				onClick={() => setDialogOpen(true)}
				disabled={props.factoryPaused}
			>
				Pause
			</button>
			{dialogOpen ? (
				<KillSwitchDialog
					open
					verb="session_pause"
					target={{ id: props.session.id, name: props.session.agentName }}
					blastRadius={`This will pause ${props.session.agentName}'s session at the next checkpoint.`}
					mode="press_hold"
					onConfirm={async (input) => {
						await props.onPause(input);
						setDialogOpen(false);
					}}
					onCancel={() => setDialogOpen(false)}
				/>
			) : null}
		</>
	);
}
