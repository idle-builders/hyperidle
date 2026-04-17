import type { HTMLAttributes, KeyboardEvent } from "react";

type ClickableResult = Pick<
	HTMLAttributes<HTMLDivElement>,
	"role" | "onClick" | "onKeyDown" | "tabIndex"
>;

/**
 * Returns accessibility-correct props for making a div behave as a clickable button.
 * Adds role="button", keyboard handling (Enter + Space with preventDefault), and tabIndex.
 *
 * @lore Space key preventDefault is intentional — without it, the browser scrolls the page
 * when Space is pressed on a focused div[role=button], which is the wrong behavior.
 */
export function clickableProps(onClick?: () => void): ClickableResult | Record<string, never> {
	if (!onClick) return {};
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
	};
}
