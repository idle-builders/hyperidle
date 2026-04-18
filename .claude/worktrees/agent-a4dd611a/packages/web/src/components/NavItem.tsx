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
			{/* biome-ignore lint/a11y/useValidAnchor: DaisyUI menu requires li>a pattern */}
			<a
				href="#"
				className={`flex items-center gap-2 ${selectedClasses}`}
				onClick={(e) => {
					e.preventDefault();
					onClick?.();
				}}
			>
				{icon}
				<span>{label}</span>
				{count != null && <span className="badge badge-sm">{count}</span>}
			</a>
		</li>
	);
}
