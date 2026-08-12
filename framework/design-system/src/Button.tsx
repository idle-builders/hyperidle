/**
 * Button — Tier 0 foundation primitive.
 *
 * Four variants: primary, secondary, ghost, destructive.
 * Three sizes: default, sm, icon.
 * Uses forwardRef for focus management, tooltips, and popovers.
 *
 * @lore W2 S3: Only Button has forwardRef among the Tier 0 primitives.
 * Consumers need ref for focus management (tooltips, popovers, programmatic focus).
 * No other Tier 0 primitive currently needs ref forwarding.
 * @lore W2: No DaisyUI — custom CSS matching Button.html pixel-for-pixel.
 * @lore W2: hearth-internal-padding — vertical padding (10px default, 7px sm)
 * is optically tuned, not on the 6px grid. This is the AQ-001 form exemption.
 *
 * @lore AZ7 Set 1: `amber` deleted — zero production uses (combined-round.md
 * §1.2, Trade-off 2). `size="icon"` added — AQ-003 "one size per component":
 * a square 32×32 control (44×44 touch floor below `lg`, matching `sm`/`default`'s
 * existing pattern) whose entire label is its icon. This is the migration
 * target for ~20 hand-rolled icon buttons measured at 16–32px across core-ui
 * (combined-round.md §2 Set 1) — they get visibly larger; that is a deliberate,
 * founder-approved visual change (Trade-off 3), not a regression.
 */

// hearth-internal-padding

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
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
	primary:
		"bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-primary-hover)] hover:border-[var(--accent-primary-hover)]",
	// @lore AZ7 Set 3: hover tint corrected from --surface-page to
	// --accent-primary-dim — the closed fill set gives --surface-page exactly
	// one job (the page canvas) and --accent-primary-dim the hover/selected
	// tint job (combined-round.md §2 Set 3, "Two consequences").
	secondary:
		"bg-[var(--surface-elevated)] border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--accent-primary-dim)]",
	ghost:
		"bg-transparent border-transparent text-[var(--accent-deep)] hover:bg-[var(--accent-primary-dim)]",
	destructive:
		"bg-[var(--status-error)] border-[var(--status-error)] text-[var(--text-on-accent)] hover:bg-[var(--status-error-hover)] hover:border-[var(--status-error-hover)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{ variant = "primary", size = "default", className = "", children, disabled, ...rest },
	ref,
): JSX.Element {
	// @lore POLISH-060 A3: AQ-015 requires touch targets ≥ 44px at ≤ 1024px.
	// On desktop (lg: = 1024px+) we relax with a smaller min-height so settings
	// forms don't read too tall. The 44px floor stays at smaller viewports via
	// Tailwind's mobile-first order: min-h-[44px] is the base; lg:min-h-[N]
	// overrides at 1024px+. No JS needed — pure responsive utility.
	const sizeClass =
		size === "sm"
			? "text-[12px] py-[7px] px-[12px] min-h-[44px] lg:min-h-[32px]"
			: size === "icon"
				? "p-0 w-[44px] h-[44px] min-h-[44px] lg:w-[32px] lg:h-[32px] lg:min-h-[32px] text-[13px]"
				: "text-[13px] py-[10px] px-[18px] min-h-[44px] lg:min-h-[36px]";

	const variantClass = VARIANT_CLASSES[variant];

	return (
		<button
			ref={ref}
			{...dsProps("Button", "0")}
			type={rest.type ?? "button"}
			disabled={disabled}
			className={[
				"inline-flex items-center justify-center gap-[6px] rounded-[var(--r-pill)] border-[1.5px] font-medium cursor-pointer",
				"active:scale-[0.97]",
				"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]",
				"disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
				"transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
				sizeClass,
				variantClass,
				className,
			].join(" ")}
			{...rest}
		>
			{children}
		</button>
	);
});
