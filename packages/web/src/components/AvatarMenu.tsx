/**
 * L7 — AvatarMenu (red phase stub).
 *
 * INTENTIONALLY UNIMPLEMENTED — see KillSwitchDialog.tsx note.
 */

export interface AvatarMenuProps {
	actor: { id: string; name: string; role: "CEO" | "CPO" };
	onPauseFactory: () => void;
	onOpenSettings: () => void;
	onSignOut: () => void;
}

export function AvatarMenu(_props: AvatarMenuProps): null {
	return null;
}
