/**
 * Breadcrumb — Tier 1 DS component.
 *
 * Router-agnostic orientation strip for detail screens.
 * Renders a <nav aria-label="Breadcrumb"> flex row at 13px (--text-sm).
 *
 */

import type { ComponentType, JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs.js";

export interface BreadcrumbSegment {
	/** Display label. */
	label: string;
	/** Route path. Omit for the current (non-link) segment. */
	to?: string;
	/** data-testid passthrough on the rendered link element. */
	testId?: string;
}

export interface BreadcrumbProps {
	/** Ordered list of path segments, last being the current page. */
	segments: readonly [BreadcrumbSegment, ...BreadcrumbSegment[]];
	/** Optional slot rendered before the first segment (e.g. NavHistoryCluster). */
	leading?: ReactNode;
	/**
	 * Router-aware link component injected from the consumer.
	 * Web passes RR's <Link>; stories pass plain <a> or custom stub.
	 * Falls back to plain <a> when omitted.
	 */
	LinkComponent?: ComponentType<{
		to: string;
		className?: string;
		children: ReactNode;
		"data-testid"?: string;
		"data-breadcrumb-role"?: "root" | "intermediate" | "current";
	}>;
}

const LINK_CLASS =
	"text-[color:var(--text-secondary)] hover:text-[color:var(--accent-primary)] " +
	"" +
	"focus-visible:outline focus-visible:outline-[2px] focus-visible:outline-[color:var(--accent-primary)] focus-visible:outline-offset-[2px]";

const CURRENT_CLASS = "text-[color:var(--text-primary)]";

export function Breadcrumb({ segments, leading, LinkComponent }: BreadcrumbProps): JSX.Element {
	const Link =
		LinkComponent ??
		function FallbackLink({
			to,
			className,
			children,
			...rest
		}: {
			to: string;
			className?: string;
			children: ReactNode;
			"data-testid"?: string;
			"data-breadcrumb-role"?: "root" | "intermediate" | "current";
		}): JSX.Element {
			return (
				<a href={to} className={className} {...rest}>
					{children}
				</a>
			);
		};

	const items: ReactNode[] = [];

	if (leading) {
		items.push(
			<span key="leading" className="inline-flex shrink-0 items-center">
				{leading}
			</span>,
		);
	}

	segments.forEach((seg, i) => {
		const isLast = i === segments.length - 1;
		const isFirst = i === 0;
		const isMiddle = !(isFirst || isLast);
		const role = isFirst && !isLast ? "root" : isLast ? "current" : "intermediate";

		if (i > 0) {
			items.push(
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: segments is the breadcrumb path for this render — static and positional, never reordered.
					key={`sep-${i}`}
					aria-hidden="true"
					className="shrink-0 text-[color:var(--text-secondary)] select-none mx-[3px]"
				>
					/
				</span>,
			);
		}

		if (seg.to !== undefined && !isLast) {
			items.push(
				<Link
					// biome-ignore lint/suspicious/noArrayIndexKey: segments is the breadcrumb path for this render — static and positional, never reordered.
					key={`seg-${i}`}
					to={seg.to}
					className={[LINK_CLASS, isMiddle ? "min-w-0 max-w-[120px] truncate" : "shrink-0"]
						.filter(Boolean)
						.join(" ")}
					data-breadcrumb-role={role}
					{...(seg.testId ? { "data-testid": seg.testId } : {})}
				>
					{seg.label}
				</Link>,
			);
		} else {
			items.push(
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: segments is the breadcrumb path for this render — static and positional, never reordered.
					key={`seg-${i}`}
					className={[
						isLast ? CURRENT_CLASS : "text-[color:var(--text-secondary)]",
						isLast ? "min-w-[6ch] max-w-[180px] flex-1 truncate" : "min-w-0 max-w-[120px] truncate",
					]
						.filter(Boolean)
						.join(" ")}
					{...(isLast ? { "aria-current": "page" as const } : {})}
					data-breadcrumb-role={role}
					{...(seg.testId ? { "data-testid": seg.testId } : {})}
				>
					{seg.label}
				</span>,
			);
		}
	});

	return (
		<nav
			aria-label="Breadcrumb"
			className="type-small flex min-w-0 flex-nowrap items-center overflow-hidden "
			{...dsProps("Breadcrumb", "1")}
		>
			{items}
		</nav>
	);
}
