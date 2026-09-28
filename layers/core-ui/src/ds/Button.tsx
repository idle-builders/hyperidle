/**
 * Button — Tier 0 foundation primitive.
 *
 * Four variants: primary, secondary, ghost, destructive.
 * Three sizes: default, sm, icon.
 * Uses forwardRef for focus management, tooltips, and popovers.
 */
// @lore: Button forwardRef — focus management for tooltips, popovers, and programmatic focus; Input carries forwardRef for the same reason
// @lore: hearth-internal-padding — vertical padding (10px default, 7px sm) is optically tuned, not on the 6px grid

import { forwardRef, type JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "primary" | "secondary" | "ghost" | "destructive";
	/**
	 * `"icon"` — a square control whose entire label is its icon. The caller
	 * MUST pass `aria-label` (or `title` + `aria-hidden` icon children) — the
	 * button has no text content for assistive tech to read otherwise.
	 */
	size?: "sm" | "default" | "icon";
	/**
	 * `"accent"` (default) is ghost's original text-link look
	 * (`--accent-deep`). `"neutral"` swaps it for `--text-secondary` — for a
	 * ghost button that is a plain icon/utility affordance, not a primary
	 * accent action. `"danger"` swaps it for `--status-error` — for a
	 * ghost-shaped destructive text action (e.g. an inline "Delete") that
	 * should not carry the `destructive` variant's solid fill. Only affects
	 * the `ghost` variant.
	 */
	tone?: "accent" | "neutral" | "danger";
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
	primary:
		"border-width-thin bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-primary-hover)] hover:border-[var(--accent-primary-hover)]",
	secondary:
		"border-width-thin bg-[var(--surface-elevated)] border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--accent-primary-dim)]",
	ghost:
		"bg-transparent border-transparent text-[var(--accent-deep)] hover:bg-[var(--accent-primary-dim)]",
	// @lore: destructive fill — --status-error fails WCAG AA on dark (3.42:1); --status-error-hover used as fill (white text: 4.67:1); hover darkens 20% (6.64:1)
	destructive:
		"border-width-thin bg-[var(--status-error-hover)] border-[var(--status-error-hover)] text-[#ffffff] hover:bg-[color-mix(in_oklab,var(--status-error-hover)_80%,#000000)] hover:border-[color-mix(in_oklab,var(--status-error-hover)_80%,#000000)]",
};

const GHOST_NEUTRAL_CLASS =
	"bg-transparent border-transparent text-[var(--text-secondary)] hover:bg-[var(--accent-primary-dim)]";

const GHOST_DANGER_CLASS =
	"bg-transparent border-transparent text-[var(--status-error)] hover:bg-[color-mix(in_oklab,var(--status-error)_8%,transparent)]";

const GHOST_TONE_CLASS: Record<"neutral" | "danger", string> = {
	neutral: GHOST_NEUTRAL_CLASS,
	danger: GHOST_DANGER_CLASS,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{
		variant = "primary",
		size = "default",
		tone = "accent",
		className = "",
		children,
		disabled,
		...rest
	},
	ref,
): JSX.Element {
	// @lore: min-[1025px]: breakpoint — Tailwind lg: fires at 1024px (off-by-one); relaxes strictly above it so ≥44px touch floor holds through 1024px inclusive
	const sizeClass =
		size === "sm"
			? "py-[7px] px-[12px] min-h-[44px] min-[1025px]:min-h-[32px]"
			: size === "icon"
				? "p-0 w-[44px] h-[44px] min-h-[44px] min-[1025px]:w-[32px] min-[1025px]:h-[32px] min-[1025px]:min-h-[32px]"
				: "py-[10px] px-[18px] min-h-[44px] min-[1025px]:min-h-[36px]";

	const variantClass =
		variant === "ghost" && tone !== "accent" ? GHOST_TONE_CLASS[tone] : VARIANT_CLASSES[variant];

	return (
		<button
			data-az16-profile="control"
			ref={ref}
			{...dsProps("Button", "0")}
			type={rest.type ?? "button"}
			disabled={disabled}
			className={`type-control ${[
				"inline-flex items-center justify-center gap-[6px] rounded-[var(--r-pill)]   cursor-pointer",
				"active:scale-[0.97]",
				"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]",
				"disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
				"",
				sizeClass,
				variantClass,
				className,
			].join(" ")}`}
			{...rest}
		>
			{children}
		</button>
	);
});
