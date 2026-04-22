import type { JSX, ReactNode } from "react";

export interface NavItemProps {
	label: string;
	icon?: ReactNode;
	count?: number;
	selected?: boolean;
	onClick?: () => void;
}

export function NavItem({
	label,
	icon,
	count,
	selected = false,
	onClick,
}: NavItemProps): JSX.Element {
	const selectedClasses = selected ? "bg-[var(--surface-4)] border-l-2 border-primary" : "";

	return (
		<li>
			<button
				type="button"
				className={`flex w-full items-center gap-2 text-left min-h-[var(--density-row-h)] py-[var(--density-pad-y)] text-[length:var(--density-text)] hover:bg-[var(--surface-ghost)] transition-colors duration-[var(--motion-fast)] focus-visible:ring-1 focus-visible:ring-primary ${selectedClasses}`}
				onClick={onClick}
			>
				{icon}
				<span>{label}</span>
				{count != null && <span className="badge badge-sm">{count}</span>}
			</button>
		</li>
	);
}
