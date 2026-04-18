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
const FOCUS_CLASSES = "cursor-pointer focus-visible:ring-1 focus-visible:ring-primary";

/**
 * Returns accessibility-correct props for making a div behave as a clickable button.
 * Adds role="button", keyboard handling (Enter + Space with preventDefault), tabIndex,
 * and a merged className that includes cursor-pointer + focus-visible:ring utilities.
 *
 * @lore Space key preventDefault is intentional — without it, the browser scrolls the page
 * when Space is pressed on a focused div[role=button], which is the wrong behavior.
 *
 * @lore I4 KB2: the helper now accepts an optional caller `className` and merges it
 * with the focus utilities, so future agents cannot forget to add the focus ring.
 */
export function clickableProps(
	onClick?: () => void,
	callerClassName?: string,
): ClickableResult | (Pick<ClickableResult, "className"> & Record<string, never>) {
	if (!onClick) {
		// Even when not interactive, return the caller's className so the
		// helper is the single point where className is built. The empty-
		// object fallback (no className) preserves prior behaviour for
		// call sites that pass neither argument.
		return callerClassName ? ({ className: callerClassName } as Pick<ClickableResult, "className">) : {};
	}
	const className = callerClassName ? `${callerClassName} ${FOCUS_CLASSES}` : FOCUS_CLASSES;
	return {
		role: "button" as const,
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
