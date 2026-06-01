/**
 * Button — Tier 0 foundation primitive.
 *
 * Five variants: primary, secondary, ghost, destructive, amber.
 * Two sizes: default, sm.
 * Uses forwardRef for focus management, tooltips, and popovers.
 *
 * @lore W2 S3: Only Button has forwardRef among the Tier 0 primitives.
 * Consumers need ref for focus management (tooltips, popovers, programmatic focus).
 * No other Tier 0 primitive currently needs ref forwarding.
 * @lore W2: No DaisyUI — custom CSS matching Button.html pixel-for-pixel.
 * @lore W2: hearth-internal-padding — vertical padding (10px default, 7px sm)
 * is optically tuned, not on the 6px grid. This is the AQ-001 form exemption.
 */

// hearth-internal-padding

import { forwardRef, type JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "primary" | "secondary" | "ghost" | "destructive" | "amber";
	size?: "sm" | "default";
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
	primary:
		"bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-primary-hover)] hover:border-[var(--accent-primary-hover)]",
	secondary:
		"bg-[var(--surface-elevated)] border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-page)]",
	ghost:
		"bg-transparent border-transparent text-[var(--accent-primary)] hover:bg-[rgba(22,118,79,0.06)]",
	destructive:
		"bg-[var(--status-error)] border-[var(--status-error)] text-[var(--text-on-accent)] hover:bg-[#c53e30] hover:border-[#c53e30]",
	amber:
		"bg-[var(--accent-secondary)] border-[var(--accent-secondary)] text-[var(--text-on-accent)] hover:bg-[#b86305] hover:border-[#b86305]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{ variant = "primary", size = "default", className = "", children, disabled, ...rest },
	ref,
): JSX.Element {
	const sizeClass =
		size === "sm" ? "text-[12px] py-[7px] px-[12px]" : "text-[13px] py-[10px] px-[18px]";

	const variantClass = VARIANT_CLASSES[variant];

	return (
		<button
			ref={ref}
			{...dsProps("Button", "0")}
			type={rest.type ?? "button"}
			disabled={disabled}
			className={[
				"inline-flex items-center justify-center gap-[6px] rounded-full border-[1.5px] font-medium cursor-pointer",
				"active:scale-[0.97]",
				"focus-visible:outline focus-visible:outline-[2px] focus-visible:outline-[var(--accent-primary)] focus-visible:outline-offset-[2px]",
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
