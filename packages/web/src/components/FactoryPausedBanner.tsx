/**
 * L7 — FactoryPausedBanner (red phase stub).
 *
 * INTENTIONALLY UNIMPLEMENTED — see KillSwitchDialog.tsx note.
 */
import type { FactoryStateResponse } from "@hyperidle/shared";

export interface FactoryPausedBannerProps {
	state: FactoryStateResponse;
	onResume: () => void;
}

export function FactoryPausedBanner(_props: FactoryPausedBannerProps): null {
	return null;
}
