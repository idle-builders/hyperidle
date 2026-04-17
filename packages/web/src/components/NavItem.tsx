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
				className={`flex w-full items-center gap-2 text-left ${selectedClasses}`}
				onClick={onClick}
			>
				{icon}
				<span>{label}</span>
				{count != null && <span className="badge badge-sm">{count}</span>}
			</button>
		</li>
	);
}
