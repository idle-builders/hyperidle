import type { HTMLAttributes, KeyboardEvent } from "react";

type ClickableResult = Pick<
	HTMLAttributes<HTMLDivElement>,
	"role" | "onClick" | "onKeyDown" | "tabIndex" | "className"
>;

const FOCUS_CLASSES =
	"cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]";

// @lore: Space key preventDefault on div[role=button] — without it browser scrolls page on Space; Enter/Space both fire onClick
export function clickableProps(
	onClick?: () => void,
	callerClassName?: string,
): Partial<ClickableResult> {
	if (!onClick) {
		return callerClassName ? { className: callerClassName } : {};
	}
	const className = callerClassName ? `${callerClassName} ${FOCUS_CLASSES}` : FOCUS_CLASSES;
	return {
		role: "button",
		onClick,
		onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				onClick();
			}
		},
		tabIndex: 0,
		className,
	};
}
