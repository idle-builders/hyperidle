/**
 * Button — Tier 0 foundation primitive.
 *
 * Four variants: primary, secondary, ghost, destructive.
 * Three sizes: default, sm, icon.
 * Uses forwardRef for focus management, tooltips, and popovers.
 *
 * @lore W2 S3: Button carries forwardRef for focus management (tooltips,
 * popovers, programmatic focus). Input gained the same for the same reason —
 * a consumer needing programmatic focus is what triggers this, not which
 * primitive it is.
 * @lore W2: No DaisyUI — custom CSS matching Button.html pixel-for-pixel.
 * @lore W2: hearth-internal-padding — vertical padding (10px default, 7px sm)
 * is optically tuned, not on the 6px grid. This is the AQ-001 form exemption.
 *
 * @lore AZ7 Set 1: `amber` deleted — zero production uses (plan.md
 * §1.2, Trade-off 2). `size="icon"` added — AQ-003 "one size per component":
 * a square 32×32 control (44×44 touch floor below `lg`, matching `sm`/`default`'s
 * existing pattern) whose entire label is its icon. This is the migration
 * target for ~20 hand-rolled icon buttons measured at 16–32px across core-ui
 * (plan.md §2 Set 1) — they get visibly larger; that is a deliberate,
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
	// tint job (plan.md §2 Set 3, "Two consequences").
	secondary:
		"bg-[var(--surface-elevated)] border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--accent-primary-dim)]",
	ghost:
		"bg-transparent border-transparent text-[var(--accent-deep)] hover:bg-[var(--accent-primary-dim)]",
	// @lore UI-066: --status-error (#dc4a3a light) on --text-on-accent (#2a2415) = 3.42:1 — FAILS
	// WCAG AA (4.5:1 required for normal text). Fix: use --status-error-hover (#c53e30, both
	// modes) as the fill (white text achieves 4.67:1 ✓). Hover darkens the fill 20% toward
	// black (6.64:1 ✓). --status-error stays unchanged for icon/badge use.
	destructive:
		"bg-[var(--status-error-hover)] border-[var(--status-error-hover)] text-[#ffffff] hover:bg-[color-mix(in_oklab,var(--status-error-hover)_80%,#000000)] hover:border-[color-mix(in_oklab,var(--status-error-hover)_80%,#000000)]",
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
			? "py-[7px] px-[12px] min-h-[44px] lg:min-h-[32px]"
			: size === "icon"
				? "p-0 w-[44px] h-[44px] min-h-[44px] lg:w-[32px] lg:h-[32px] lg:min-h-[32px]"
				: "py-[10px] px-[18px] min-h-[44px] lg:min-h-[36px]";

	const variantClass = VARIANT_CLASSES[variant];

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
