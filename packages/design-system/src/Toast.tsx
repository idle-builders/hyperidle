/**
 * Toast — Tier 0 foundation primitive.
 *
 * Four variants: success, error, warning, info.
 * Left border accent, icon circle, close button.
 *
 * @lore W2: No DaisyUI — custom CSS per Toast.html.
 * Left border is the one structural status signal in Hearth per AESTHETICS.md.
 */

import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ToastProps {
	variant: "success" | "error" | "warning" | "info";
	icon: ReactNode;
	title: string;
	message: string;
	onClose?: () => void;
}

const VARIANT_STYLES: Record<
	ToastProps["variant"],
	{ border: string; iconBg: string; iconText: string }
> = {
	success: {
		border: "border-l-[var(--status-success)]",
		iconBg: "bg-[var(--accent-primary-dim)]",
		iconText: "text-[var(--status-success)]",
	},
	error: {
		border: "border-l-[var(--status-error)]",
		iconBg: "bg-[var(--status-error-dim)]",
		iconText: "text-[var(--status-error)]",
	},
	warning: {
		border: "border-l-[var(--status-warning)]",
		iconBg: "bg-[var(--accent-secondary-dim)]",
		iconText: "text-[var(--status-warning)]",
	},
	info: {
		border: "border-l-[var(--status-info)]",
		iconBg: "bg-[var(--status-info-dim)]",
		iconText: "text-[var(--status-info)]",
	},
};

export function Toast({ variant, icon, title, message, onClose }: ToastProps): JSX.Element {
	const styles = VARIANT_STYLES[variant];

	return (
		<div
			{...dsProps("Toast", "0")}
			className={`bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] p-[12px] flex items-start gap-[9px] max-w-[380px] border-l-[1.5px] ${styles.border}`}
			role="alert"
			aria-live="polite"
		>
			{icon && (
				<div
					aria-hidden="true"
					className={`h-[20px] w-[20px] shrink-0 rounded-full flex items-center justify-center text-[12px] font-bold ${styles.iconBg} ${styles.iconText}`}
				>
					{icon}
				</div>
			)}
			<div className="flex flex-col gap-[3px] flex-1 min-w-0">
				<span className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</span>
				<span className="text-[13px] text-[var(--text-secondary)] leading-[1.55]">{message}</span>
			</div>
			{onClose && (
				<button
					type="button"
					aria-label="Close notification"
					onClick={onClose}
					className="shrink-0 text-[17px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] leading-none"
				>
					×
				</button>
			)}
		</div>
	);
}
