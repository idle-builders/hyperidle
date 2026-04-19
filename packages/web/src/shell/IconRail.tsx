import type { JSX } from "react";
import { VIEW_ICONS, VIEW_IDS } from "./shell-types";
import type { ViewId } from "./shell-types";
import { useRovingFocus } from "./use-roving-focus";

export interface IconRailProps {
	activeView: ViewId;
	onViewChange: (view: ViewId) => void;
	onAvatarClick?: () => void;
	avatarUrl?: string;
	/**
	 * Per-view unread count. Missing key or 0 means no dot.
	 * J2: the value originates from `SUBMENU_CONFIG` in AppShell — a single
	 * source of truth shared with the Submenu consumers.
	 */
	unreadByView?: Partial<Record<ViewId, number>>;
}

export function IconRail({
	activeView,
	onViewChange,
	onAvatarClick,
	avatarUrl,
	unreadByView,
}: IconRailProps): JSX.Element {
	const { getItemProps } = useRovingFocus({
		itemCount: VIEW_IDS.length,
		onSelect: (index) => {
			onViewChange(VIEW_IDS[index]);
		},
	});

	return (
		<nav aria-label="Main navigation" className="flex w-12 flex-col items-center gap-2 p-2">
			{VIEW_IDS.map((viewId, index) => {
				const { label, icon } = VIEW_ICONS[viewId];
				const isActive = viewId === activeView;
				const itemProps = getItemProps(index);
				const unread = unreadByView?.[viewId] ?? 0;
				const showDot = !isActive && unread > 0;
				// @lore J2 AC 63: append unread affordance to the existing label so
				// screen-reader users get the same signal as sighted users.
				const ariaLabel = showDot ? `${label} - ${unread} unread items` : label;

				return (
					<button
						key={viewId}
						type="button"
						className={`btn btn-ghost btn-sm relative ${isActive ? "btn-active bg-[var(--surface-4)]" : ""}`}
						aria-label={ariaLabel}
						title={label}
						aria-current={isActive ? "page" : undefined}
						onClick={() => onViewChange(viewId)}
						tabIndex={itemProps.tabIndex}
						onKeyDown={itemProps.onKeyDown}
						ref={itemProps.ref}
					>
						{isActive && (
							<span
								aria-hidden="true"
								className="absolute left-0 top-1 bottom-1 w-0.5 bg-[var(--primary)]"
							/>
						)}
						<span aria-hidden="true">{icon}</span>
						{showDot && (
							<span
								aria-hidden="true"
								className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-error"
							/>
						)}
					</button>
				);
			})}

			{onAvatarClick && (
				<button
					type="button"
					className="btn btn-ghost btn-sm btn-circle mt-auto"
					aria-label="User profile"
					title="User profile"
					onClick={onAvatarClick}
				>
					{avatarUrl ? (
						<img src={avatarUrl} alt="User avatar" className="h-6 w-6 rounded-full" />
					) : (
						<svg aria-hidden="true" width={16} height={16} viewBox="0 0 16 16" fill="currentColor">
							<circle cx="8" cy="5" r="3" />
							<path d="M2 14a6 6 0 0112 0H2z" />
						</svg>
					)}
				</button>
			)}
		</nav>
	);
}
