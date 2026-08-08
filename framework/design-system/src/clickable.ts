import type { HTMLAttributes, KeyboardEvent } from "react";

type ClickableResult = Pick<
	HTMLAttributes<HTMLDivElement>,
	"role" | "onClick" | "onKeyDown" | "tabIndex" | "className"
>;

/**
 * I4 KB2: every clickable surface gets a focus-visible ring so keyboard
 * users can see where they are. We append the focus utilities (and
 * cursor-pointer) so the helper is a single source of truth — call sites
 * pass their own classes via the second argument and the helper merges.
 */
const FOCUS_CLASSES =
	"cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))] transition-colors duration-[var(--motion-fast)]";

/**
 * Returns accessibility-correct props for making a div behave as a clickable button.
 * Adds role="button", keyboard handling (Enter + Space with preventDefault), tabIndex,
 * and a merged className that includes cursor-pointer + focus-visible:ring utilities.
 *
 * When `onClick` is omitted the helper returns only the caller-supplied className
 * (or nothing) — a non-interactive div needs no role/tabIndex/handlers.
 *
 * @lore Space key preventDefault is intentional — without it, the browser scrolls the page
 * when Space is pressed on a focused div[role=button], which is the wrong behavior.
 *
 * @lore I4 KB2: the helper accepts an optional caller `className` and merges it
 * with the focus utilities, so future agents cannot forget to add the focus ring.
 */
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
