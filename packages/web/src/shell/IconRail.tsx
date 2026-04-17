import type { JSX } from "react";
import { VIEW_ICONS, VIEW_IDS } from "./shell-types";
import type { ViewId } from "./shell-types";
import { useRovingFocus } from "./use-roving-focus";

export interface IconRailProps {
	activeView: ViewId;
	onViewChange: (view: ViewId) => void;
	onAvatarClick?: () => void;
	avatarUrl?: string;
}

export function IconRail({
	activeView,
	onViewChange,
	onAvatarClick,
	avatarUrl,
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

				return (
					<button
						key={viewId}
						type="button"
						className={`btn btn-ghost btn-sm ${isActive ? "btn-active bg-[var(--surface-4)]" : ""}`}
						aria-label={label}
						title={label}
						aria-current={isActive ? "page" : undefined}
						onClick={() => onViewChange(viewId)}
						tabIndex={itemProps.tabIndex}
						onKeyDown={itemProps.onKeyDown}
						ref={itemProps.ref}
					>
						<span aria-hidden="true">{icon}</span>
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
