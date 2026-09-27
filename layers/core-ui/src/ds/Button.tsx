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
 * a square 32×32 control (44×44 touch floor at ≤1024px, matching `sm`/`default`'s
 * existing pattern) whose entire label is its icon. This is the migration
 * target for ~20 hand-rolled icon buttons measured at 16–32px across core-ui
 * (plan.md §2 Set 1) — they get visibly larger; that is a deliberate,
 * founder-approved visual change (Trade-off 3), not a regression.
 *
 * @lore control/chip migration fix (maintainer decision, 2026-09-26): every
 * variant painted a `border-[color]` utility but never a border-WIDTH
 * utility — `border-[var(--x)]` sets only border-color, so every "bordered"
 * variant rendered with a 0px border regardless of color. All four variants
 * now carry `border-width-thin`; primary/destructive were already
 * same-color-as-fill so this is invisible there, but secondary's border was
 * always meant to show. `tone="neutral"` is a second, small addition: ghost's
 * text was always `--accent-deep` (an accent-colored "text link" look);
 * `neutral` swaps it for `--text-secondary` for the many icon/utility ghost
 * buttons across core-ui that are not a primary accent affordance. Sites
 * that previously reached for a per-call `style={{...}}` override to fake a
 * border or a neutral text color use these two fixes instead — see the
 * control/chip migration commit for the full list of affected callers.
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
	// @lore AZ7 Set 3: hover tint corrected from --surface-page to
	// --accent-primary-dim — the closed fill set gives --surface-page exactly
	// one job (the page canvas) and --accent-primary-dim the hover/selected
	// tint job (plan.md §2 Set 3, "Two consequences").
	secondary:
		"border-width-thin bg-[var(--surface-elevated)] border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--accent-primary-dim)]",
	ghost:
		"bg-transparent border-transparent text-[var(--accent-deep)] hover:bg-[var(--accent-primary-dim)]",
	// @lore UI-066: --status-error (#dc4a3a light) on --text-on-accent (#2a2415) = 3.42:1 — FAILS
	// WCAG AA (4.5:1 required for normal text). Fix: use --status-error-hover (#c53e30, both
	// modes) as the fill (white text achieves 4.67:1 ✓). Hover darkens the fill 20% toward
	// black (6.64:1 ✓). --status-error stays unchanged for icon/badge use.
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
	// @lore AQ-015 requires touch targets ≥ 44px at viewports ≤ 1024px wide.
	// Tailwind's `lg:` breakpoint fires AT 1024px (min-width: 1024px), which
	// made every Button 32/36px exactly at the 1024px boundary the rule
	// still covers — an off-by-one. `min-[1025px]:` relaxes strictly ABOVE
	// 1024px instead, so the 44px floor holds through 1024px inclusive and
	// only desktop widths above it get the smaller, less-tall sizing.
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
