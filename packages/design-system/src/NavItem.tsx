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
	/**
	 * @lore border-none sets border-style:none which prevents border-l-2 from
	 * showing. Use border-0 instead — keeps border-style:solid from preflight
	 * so the selected left border renders. bg-transparent must also be
	 * conditional to avoid conflicting with the selected bg-[var(--surface-4)].
	 */
	const baseClasses =
		"relative flex w-full items-center gap-2 text-left min-h-[var(--density-row-h)] py-[var(--density-pad-y)] px-[var(--density-pad-x)] text-[length:var(--density-text)] text-[var(--text-hi)] rounded-[var(--r1)] border-0 cursor-pointer transition-[background] duration-[var(--motion-fast)] ease-[ease]";

	const stateClasses = selected
		? "bg-[var(--surface-4)] border-l-2 border-l-[var(--primary)]"
		: "bg-transparent hover:bg-[var(--surface-2)]";

	return (
		<li>
			<button type="button" className={`${baseClasses} ${stateClasses}`} onClick={onClick}>
				{icon && (
					<span
						className={`inline-flex items-center shrink-0 ${selected ? "text-[var(--primary)]" : "text-[var(--text-lo)]"}`}
					>
						{icon}
					</span>
				)}
				<span className="flex-1">{label}</span>
				{count != null && (
					<span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded-[var(--r-pill)] bg-[var(--surface-ghost)] font-[var(--mono)] text-[10px] font-medium text-[var(--text-mid)]">
						{count}
					</span>
				)}
			</button>
		</li>
	);
}
