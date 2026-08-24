/**
 * AG6: Shared list-row primitive for all agent/routine/knowledge rows.
 *
 * Anatomy: [lead?] [title+subtitle flex-1] [cells[] shrink-0] [actions? shrink-0]
 *
 * Wrapper-element heuristic (nested-button a11y rule — HARD constraint):
 *   onClick + no actions → <button type="button">
 *   onClick + actions present → <div role="button" tabIndex=0 + Enter/Space handler
 *   onClick absent → plain <div> (or <li> via as="li" / ItemList as="ul")
 *   as prop overrides the heuristic.
 *
 * @lore AG6: The nested-button constraint comes from AB2 S4/W4 — a real <button>
 * wrapping inner <button> elements is invalid HTML and breaks screen readers.
 * div[role=button] + tabIndex + onKeyDown gives equivalent keyboard a11y.
 *
 * @lore AG6: Hover/focus/motion come from clickableProps (clickable.ts) — do NOT
 * hardcode rgba hover colors. The AQ-008/AQ-018 lint rules flag hardcoded colors.
 * clickableProps bundles the correct color-mix token + focus ring + motion.
 */

import { createContext, type JSX, type ReactNode, useContext } from "react";
import { clickableProps } from "./clickable.js";
import { dsProps } from "./ds-attrs.js";

// ---------------------------------------------------------------------------
// ItemListContext — Row reads variant from its containing ItemList (if any)
// ---------------------------------------------------------------------------

export interface ItemListContextValue {
	variant: "contained" | "flush";
	as: "div" | "ul";
}

export const ItemListContext = createContext<ItemListContextValue>({
	variant: "contained",
	as: "div",
});

// ---------------------------------------------------------------------------
// RowCell
// ---------------------------------------------------------------------------

export interface RowCell {
	content: ReactNode;
	/** px fixed width; default auto */
	width?: number;
	/** default "end" */
	align?: "start" | "end";
	/** → tabular-nums (AQ-006) */
	numeric?: boolean;
	/** px breakpoint — cell hidden below it (mobile) */
	hideBelow?: number;
	"data-testid"?: string;
}

// ---------------------------------------------------------------------------
// RowProps
// ---------------------------------------------------------------------------

export interface RowProps {
	/** REQUIRED, primary, flex-1 truncate */
	title: ReactNode;
	/** tertiary line, truncate */
	subtitle?: ReactNode;
	/** RowDot | Avatar | icon circle; omitted → NO placeholder (AQ-113) */
	lead?: ReactNode;
	/** trailing meta cells */
	cells?: RowCell[];
	/** trailing buttons; presence triggers div[role=button] wrapper */
	actions?: ReactNode;
	onClick?: () => void;
	/**
	 * When set, the whole row renders as an <a href> link so ⌘-click,
	 * middle-click, "copy link" and hover-preview all work natively.
	 * Actions in this mode MUST be display-only (no nested <button>/<a>).
	 *
	 * @lore UI-080: navigation rows that change the address must be real links,
	 * not buttons with programmatic navigate() calls.
	 */
	href?: string;
	selected?: boolean;
	/** escape hatch; default heuristic (§nested-button) is correct without it */
	as?: "button" | "div" | "li";
	"data-testid"?: string;
	/** KnowledgeList triage keyboard focus */
	"data-focused"?: string;
}

// ---------------------------------------------------------------------------
// Shared cell renderer — single implementation for all wrapper branches (W1/W2)
// ---------------------------------------------------------------------------

// @lore AZ7 E7 / Set 5: RowCell.tone (and the toneColor ladder it drove) is
// deleted — a status/tone shown in a cell was a THIRD status channel
// alongside StatusChip and RowDot, with one call site (WorkTeam.tsx's
// agent-status cell, plan.md §1.6 finding #1). A cell that needs
// tinted content now colors its own `content` ReactNode directly (e.g. wraps
// it in a `<span className="text-[var(--status-error)]">`), or — for an
// actual status word — renders a <StatusChip> as the cell content. Deleting
// the prop is stronger than any lint rule could be (E7): every remaining use
// is now a compile error, not a lint finding.
function renderCell(cell: RowCell, i: number): JSX.Element {
	const cellStyle: React.CSSProperties = {};
	if (cell.width !== undefined) cellStyle.width = `${cell.width}px`;
	const align = cell.align === "start" ? "text-left" : "text-right";
	const numericClass = cell.numeric ? "tabular-nums" : "";
	const hideClass = cell.hideBelow !== undefined ? `max-[${cell.hideBelow}px]:hidden` : "";
	return (
		<span
			// biome-ignore lint/suspicious/noArrayIndexKey: fixed-position cell columns — order is stable by design
			key={i}
			data-testid={cell["data-testid"]}
			className={`type-data ${[
				"shrink-0   text-[var(--text-tertiary)] truncate",
				align,
				numericClass,
				hideClass,
			]
				.filter(Boolean)
				.join(" ")}`}
			style={cellStyle}
		>
			{cell.content}
		</span>
	);
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

export function Row({
	title,
	subtitle,
	lead,
	cells,
	actions,
	onClick,
	href,
	selected = false,
	as: asProp,
	"data-testid": dataTestId,
	"data-focused": dataFocused,
}: RowProps): JSX.Element {
	const { variant } = useContext(ItemListContext);

	// padding: flush variant → px-[24px]; contained → px-[6px]
	const px = variant === "flush" ? "px-[24px]" : "px-[6px]";

	// selected state classes
	const selectedClasses = selected
		? [
				"bg-[var(--surface-elevated)]",
				"shadow-[var(--shadow-subtle)]",
				"border-width-strong-l",
				"border-[var(--accent-deep)]",
				"rounded-[var(--r-subtle)]",
			].join(" ")
		: "";

	const baseClasses = [
		"flex items-center gap-[12px]",
		"min-h-[44px]",
		px,
		"border-width-thin-b border-[var(--border-subtle)] last:border-none",
		selectedClasses,
	]
		.filter(Boolean)
		.join(" ");

	// Determine wrapper element via heuristic
	const hasActions = actions !== undefined && actions !== null;

	// resolve which tag to use
	const resolvedAs =
		asProp ?? (onClick && !hasActions ? "button" : hasActions && onClick ? "div" : "div");

	const inner = (
		<>
			{lead !== undefined && lead !== null && (
				<span className="shrink-0 inline-flex items-center">{lead}</span>
			)}
			<span className="flex-1 min-w-0">
				<span className="type-small block   text-[var(--text-primary)] truncate flex-1">
					{title}
				</span>
				{subtitle !== undefined && subtitle !== null && (
					<span className="type-metadata block  text-[var(--text-tertiary)] truncate">
						{subtitle}
					</span>
				)}
			</span>
			{cells && cells.length > 0 && <>{cells.map((cell, i) => renderCell(cell, i))}</>}
			{actions !== undefined && actions !== null && (
				<span className="shrink-0 flex gap-[3px]">{actions}</span>
			)}
		</>
	);

	const commonProps = {
		...dsProps("Row", "2"),
		"aria-current": selected ? ("true" as const) : undefined,
		"data-testid": dataTestId,
		"data-focused": dataFocused,
		className: baseClasses,
	};

	// W2 fix: clickableProps is the single source of hover+focus+motion for ALL
	// interactive branches. The button branch gets it via merged className; the
	// li>div[role=button] branches get it via spread; the div+actions branch no
	// longer hand-rolls the utilities.
	//
	// @lore AG6 W2: previously only the div+actions branch applied clickableProps
	// (and even that discarded the className by hand-rolling duplicates). The
	// button and li>div branches had zero hover/focus. Now every interactive
	// wrapper goes through clickableProps(onClick, baseClasses) — one path to rule them all.
	const clickable = onClick ? clickableProps(onClick, baseClasses) : null;

	// UI-080: href takes priority — renders a real anchor link so ⌘-click,
	// middle-click, "copy link" and hover-preview work natively. Actions must be
	// display-only (no nested <button>/<a>) when href is used.
	if (href) {
		return (
			<a
				href={href}
				{...commonProps}
				className={`w-full text-left ${clickable?.className ?? baseClasses}`}
			>
				{inner}
			</a>
		);
	}

	if (resolvedAs === "button") {
		// Simple: onClick + no actions → native <button type="button">
		// W2 fix: button also gets hover/focus classes from clickableProps.
		// UI-060: w-full added so the button fills its container (matches the
		// li-branch inner div which already has w-full on the layout class).
		return (
			<button
				type="button"
				{...commonProps}
				className={`w-full text-left ${clickable?.className ?? baseClasses}`}
				onClick={onClick}
			>
				{inner}
			</button>
		);
	}

	if (resolvedAs === "li") {
		// <li> wrapper — preserves listitem role so getAllByRole("listitem") works.
		//
		// @lore AG6: li MUST NOT have role="button" — that overrides the implicit
		// listitem role and breaks querySelectorAll / getAllByRole("listitem"). The
		// architecture specifies: li + onClick + actions → li wrapping inner
		// div[role=button] (matches original KnowledgeList triage pattern). The li
		// stays semantic; the div[role=button] handles row-level interactivity.
		//
		// @lore AD9 (Row hover fix): The <li> holds ONLY the separator border-b +
		// listitem role. Layout (px padding, min-h, flex, gap) and hover surface all
		// move onto a w-full inner div so the hover background fills edge-to-edge
		// instead of being inset inside the li's px-[24px]. This matches the <button>
		// branch behaviour and fixes WorkOverview / KnowledgeList / WorkTeam li-rows.
		// The li separator classes ("border-width-thin-b border-[var(--border-subtle)] last:border-none")
		// stay on the li so the row divider is always full-width.

		// Separator classes stay on <li>; all layout/padding/hover move to the inner div.
		const liSeparatorClass = "border-width-thin-b border-[var(--border-subtle)] last:border-none";

		// @lore AD9 W1 (review fix): The inner div must NOT inherit the separator classes
		// (border-b / last:border-b-0) from baseClasses — those stay on the <li> only.
		// clickable?.className = baseClasses + FOCUS_CLASSES, so building innerClickableClass
		// from it leaks the separator onto the inner div AND duplicates flex/gap/px/min-h.
		// Fix: build innerClickableClass by calling clickableProps with only the layout classes
		// (no separator) so the inner div = w-full layout + FOCUS_CLASSES only.
		const liInnerLayoutWithActions = `flex-1 min-w-0 flex items-center gap-[12px] ${px} min-h-[44px]`;
		const liInnerLayout = `w-full flex items-center gap-[12px] ${px} min-h-[44px]`;

		if (onClick && hasActions) {
			// li + click + actions → li wraps inner div[role=button] + action slot.
			// AD9 fix: inner div is w-full + carries px padding + min-h so hover is edge-to-edge.
			const innerClickableClass =
				clickableProps(onClick, liInnerLayoutWithActions).className ?? liInnerLayoutWithActions;
			return (
				<li
					{...dsProps("Row", "2")}
					aria-current={commonProps["aria-current"]}
					data-testid={commonProps["data-testid"]}
					data-focused={commonProps["data-focused"]}
					className={["flex items-center", liSeparatorClass, selectedClasses]
						.filter(Boolean)
						.join(" ")}
				>
					{/* biome-ignore lint/a11y/useSemanticElements: div[role=button] required — inner <button> elements (actions) cannot be nested inside a <button>; li keeps listitem role */}
					<div {...clickableProps(onClick, "")} className={innerClickableClass}>
						{lead !== undefined && lead !== null && (
							<span className="shrink-0 inline-flex items-center">{lead}</span>
						)}
						<span className="flex-1 min-w-0">
							<span className="type-small block   text-[var(--text-primary)] truncate flex-1">
								{title}
							</span>
							{subtitle !== undefined && subtitle !== null && (
								<span className="type-metadata block  text-[var(--text-tertiary)] truncate">
									{subtitle}
								</span>
							)}
						</span>
						{cells && cells.length > 0 && <>{cells.map((cell, i) => renderCell(cell, i))}</>}
					</div>
					{actions !== undefined && actions !== null && (
						<span className="shrink-0 flex gap-[3px]">{actions}</span>
					)}
				</li>
			);
		}
		if (onClick) {
			// li + click + NO actions → li wraps inner div[role=button] so the li keeps
			// its implicit listitem role (getAllByRole("listitem") must still find it).
			//
			// @lore AG6: DO NOT put role="button" on the <li> itself — that overrides
			// the listitem role and breaks getAllByRole("listitem") in tests and AT.
			// @lore AD9 (Row hover fix): inner div is w-full + carries full layout
			// (px padding, min-h, flex, gap) so the hover fill is edge-to-edge. The
			// li only holds the separator border-b. See AD9 lore block above.
			// @lore AD9: data-testid and data-focused move to the inner div (the
			// interactive element). Tests and E2E that query by testid will therefore
			// find the div[role=button] which actually handles the click — clicking it
			// triggers onClick. The li keeps only dsProps + aria-current + listitem role.
			// @lore AD9 W1 (review fix): use liInnerLayout (no separator) — see W1 lore above.
			const innerClickableClass = clickableProps(onClick, liInnerLayout).className ?? liInnerLayout;
			return (
				<li
					{...dsProps("Row", "2")}
					aria-current={commonProps["aria-current"]}
					className={[liSeparatorClass, selectedClasses].filter(Boolean).join(" ")}
				>
					{/* biome-ignore lint/a11y/useSemanticElements: div[role=button] required — li must keep listitem role; inner button not possible without actions (nested button would duplicate semantic) */}
					<div
						{...clickableProps(onClick, "")}
						className={innerClickableClass}
						data-testid={commonProps["data-testid"]}
						data-focused={commonProps["data-focused"]}
					>
						{inner}
					</div>
				</li>
			);
		}
		// li + NO onClick (static list item)
		return (
			<li
				{...dsProps("Row", "2")}
				aria-current={commonProps["aria-current"]}
				data-testid={commonProps["data-testid"]}
				data-focused={commonProps["data-focused"]}
				className={baseClasses}
			>
				{inner}
			</li>
		);
	}

	// div case
	if (onClick && hasActions) {
		// nested-button rule: div[role=button]
		// W2 fix: spread clickableProps directly — no hand-rolled duplicate utilities,
		// no discarded className. commonProps className is overridden by clickableProps.
		return (
			// biome-ignore lint/a11y/useSemanticElements: div[role=button] required — inner <button> elements (actions) cannot be nested inside a <button>
			<div {...commonProps} {...clickableProps(onClick, baseClasses)}>
				{inner}
			</div>
		);
	}

	if (onClick) {
		// This case is covered by button branch above (no actions), but as="div" override
		// W2 fix: route through clickableProps for consistent hover/focus.
		return (
			// biome-ignore lint/a11y/useSemanticElements: forced via as="div" prop override
			<div {...commonProps} {...clickableProps(onClick, baseClasses)}>
				{inner}
			</div>
		);
	}

	return <div {...commonProps}>{inner}</div>;
}
