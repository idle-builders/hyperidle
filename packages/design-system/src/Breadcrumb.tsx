/**
 * Breadcrumb — Tier 1 DS component.
 *
 * Router-agnostic orientation strip for detail screens.
 * Renders a <nav aria-label="Breadcrumb"> flex row at 13px (--text-sm).
 *
 * @lore AG4: Router-agnostic via injected LinkComponent — no react-router
 * import in design-system. Web passes RR's <Link>; stories pass plain <a>.
 *
 * @lore AQ-010: Link segments use --text-secondary (≥4.5:1), NOT --text-tertiary
 * (2.85:1 — decorative-only per @lore U3 tokens.css:159). Tertiary does not
 * clear WCAG AA for interactive content.
 *
 * @lore AG4: Middle segments (not first, not last) get max-w-[120px] truncate
 * to prevent long team/bet names from overflowing the nav row.
 *
 * @lore AG4: Link :focus-visible ring is explicit — `outline: 2px solid
 * var(--accent-primary); outline-offset: 2px` — because link segments are
 * plain <a> elements, not DS Buttons, and receive no ring by default.
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
	segments: ReadonlyArray<BreadcrumbSegment>;
	/** Optional slot rendered before the first segment (e.g. NavHistoryCluster). */
	leading?: ReactNode;
	/**
	 * Router-aware link component injected from the consumer.
	 * Web passes RR's <Link>; stories pass plain <a> or custom stub.
	 * Falls back to plain <a> when omitted.
	 */
	// biome-ignore lint/style/useNamingConvention: PascalCase required — prop is used directly as JSX component, React requires PascalCase for JSX element rendering
	LinkComponent?: ComponentType<{
		to: string;
		className?: string;
		children: ReactNode;
		// biome-ignore lint/style/useNamingConvention: HTML data attribute; hyphen is required by the spec
		"data-testid"?: string;
	}>;
}

const LINK_CLASS =
	"text-[color:var(--text-secondary)] hover:text-[color:var(--accent-primary)] " +
	"transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] " +
	"focus-visible:outline focus-visible:outline-[2px] focus-visible:outline-[color:var(--accent-primary)] focus-visible:outline-offset-[2px]";

const CURRENT_CLASS = "text-[color:var(--text-primary)]";

// @lore LG1: breadcrumb separator class extracted so separator span fits on one line — required for biome-ignore lint anchor to work (comment must immediately precede the line containing key={i}).
const SEP_CLASS = "text-[color:var(--text-secondary)] select-none mx-[3px]";

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
			<span key="leading" className="inline-flex items-center">
				{leading}
			</span>,
		);
	}

	segments.forEach((seg, i) => {
		const isLast = i === segments.length - 1;
		const isFirst = i === 0;
		const isMiddle = !(isFirst || isLast);

		if (i > 0) {
			items.push(
				// biome-ignore lint/suspicious/noArrayIndexKey: breadcrumb segments are positionally stable, never reordered/filtered
				<span key={`sep-${i}`} aria-hidden="true" className={SEP_CLASS}>
					/
				</span>,
			);
		}

		if (seg.to !== undefined && !isLast) {
			// @lore LG1: extract linkCls/testIdAttr so <Link> fits on one line — required for biome-ignore anchor.
			const linkCls = [LINK_CLASS, isMiddle ? "max-w-[120px] truncate" : ""]
				.filter(Boolean)
				.join(" ");
			const testIdAttr = seg.testId ? { "data-testid": seg.testId } : {};
			items.push(
				// biome-ignore lint/suspicious/noArrayIndexKey: breadcrumb segments are positionally stable, never reordered/filtered
				<Link key={`seg-${i}`} to={seg.to} className={linkCls} {...testIdAttr}>
					{seg.label}
				</Link>,
			);
		} else {
			// @lore LG1: extract curCls so <span> fits on one line — required for biome-ignore anchor.
			const curCls = [CURRENT_CLASS, isLast && !isFirst ? "max-w-[180px] truncate" : ""]
				.filter(Boolean)
				.join(" ");
			items.push(
				// biome-ignore lint/suspicious/noArrayIndexKey: breadcrumb segments are positionally stable, never reordered/filtered
				<span key={`seg-${i}`} className={curCls} aria-current="page">
					{seg.label}
				</span>,
			);
		}
	});

	return (
		<nav
			aria-label="Breadcrumb"
			className="flex items-center text-[13px] flex-wrap"
			{...dsProps("Breadcrumb", "1")}
		>
			{items}
		</nav>
	);
}
