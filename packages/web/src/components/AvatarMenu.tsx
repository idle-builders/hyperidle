/**
 * L7 — AvatarMenu.
 *
 * Top-bar avatar dropdown that always exposes the kill switch as
 * "Pause Factory" (one of three entry points required by AC1). The
 * destructive item is keyboard-reachable and rendered with
 * `data-variant="destructive"` so design-lint can verify the styling
 * convention.
 *
 * @lore L7: the menu is a controlled disclosure (`useState`) rather
 * than the `<details>` element so we can return focus to the trigger
 * on close — required by AC6's modal-confirmation flow.
 *
 * @lore L7 integration: AppShell mounts AvatarMenu next to its
 * existing IconRail / mobile-avatar trigger by passing `controlled`
 * + `open` + `onOpenChange`. In the uncontrolled (default) story
 * the component renders its own trigger button so the design-system
 * page and unit tests can drive it standalone.
 */
import { useState } from "react";

export interface AvatarMenuProps {
	actor: { id: string; name: string; role: "CEO" | "CPO" };
	onPauseFactory: () => void;
	onOpenSettings: () => void;
	onSignOut: () => void;
	/**
	 * Controlled-mode signal. When omitted the component renders its
	 * own trigger button (uncontrolled). When provided the component
	 * suppresses the internal trigger and reads/writes open via the
	 * `open` + `onOpenChange` props instead.
	 */
	controlled?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

export function AvatarMenu(props: AvatarMenuProps): JSX.Element {
	const [internalOpen, setInternalOpen] = useState(false);
	const open = props.controlled ? Boolean(props.open) : internalOpen;
	const setOpen = (next: boolean): void => {
		if (props.controlled) {
			props.onOpenChange?.(next);
		} else {
			setInternalOpen(next);
		}
	};

	function close(): void {
		setOpen(false);
	}

	return (
		<div className="relative">
			{!props.controlled && (
				<button
					type="button"
					aria-label="Avatar menu"
					aria-haspopup="menu"
					aria-expanded={open}
					className="flex h-8 w-8 items-center justify-center rounded-full bg-base-200 text-sm font-medium uppercase"
					onClick={() => setOpen(!open)}
				>
					{props.actor.name.charAt(0)}
				</button>
			)}
			{open ? (
				<ul
					aria-label="Avatar menu"
					className="absolute right-0 mt-2 min-w-48 rounded-lg border border-base-300 bg-base-100 p-1 text-sm shadow-md z-50"
				>
					<li>
						<button
							type="button"
							role="menuitem"
							className="block w-full rounded px-3 py-2 text-left hover:bg-base-200"
							onClick={() => {
								close();
								props.onOpenSettings();
							}}
						>
							Settings
						</button>
					</li>
					<li>
						<button
							type="button"
							role="menuitem"
							data-variant="destructive"
							className="block w-full rounded px-3 py-2 text-left text-error hover:bg-error/10"
							onClick={() => {
								close();
								props.onPauseFactory();
							}}
						>
							Pause Factory
						</button>
					</li>
					<li>
						<button
							type="button"
							role="menuitem"
							className="block w-full rounded px-3 py-2 text-left hover:bg-base-200"
							onClick={() => {
								close();
								props.onSignOut();
							}}
						>
							Sign out
						</button>
					</li>
				</ul>
			) : null}
		</div>
	);
}
