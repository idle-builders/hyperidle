import { createContext, type JSX, type ReactNode, useContext } from "react";
import { clickableProps } from "./clickable.js";
import { dsProps } from "./ds-attrs.js";

// ---------------------------------------------------------------------------
// ItemListContext — Row reads variant from its containing ItemList (if any)
// ---------------------------------------------------------------------------

export interface ItemListContextValue {
	variant: "contained" | "flush" | "boxed";
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
	 * Disables the button-branch row (real `disabled` attribute — button
	 * only receives an `onClick` handler in that branch, see the wrapper
	 * heuristic above). A clickable row with no destination (e.g. a "need"
	 * with no linked artifact) is a dead control without this; a plain
	 * static row (no `onClick`) has no button to disable, so this is a
	 * no-op there.
	 */
	disabled?: boolean;
	/**
	 * @lore: navigation rows must be real links — ⌘-click, middle-click, copy-link, hover-preview require <a href>; actions in this mode must be display-only
	 */
	href?: string;
	selected?: boolean;
	/** escape hatch; default heuristic (§nested-button) is correct without it */
	as?: "button" | "div" | "li";
	"data-testid"?: string;
	/** DocumentList triage keyboard focus */
	"data-focused"?: string;
	/**
	 * Renders with a permanent subtle radius and no list-row bottom
	 * separator — for a standalone nav-style row used outside a bordered
	 * list (e.g. a sidebar popover trigger sitting among other rounded nav
	 * rows), as opposed to Row's default list-row shape (square corners
	 * except when `selected`, a bottom separator between rows).
	 */
	rounded?: boolean;
	/**
	 * Accessible name override — for a row whose visible `title` is hidden
	 * at some breakpoint (e.g. icon-only below a width), so the row still
	 * has a name for assistive tech regardless of what's visually shown.
	 */
	"aria-label"?: string;
	/** For a row that toggles a popover/panel it owns. */
	"aria-expanded"?: boolean;
}

// ---------------------------------------------------------------------------
// Shared cell renderer — single implementation for all wrapper branches
// ---------------------------------------------------------------------------

function renderCell(cell: RowCell, i: number): JSX.Element {
	const cellStyle: React.CSSProperties = {};
	if (cell.width !== undefined) cellStyle.width = `${cell.width}px`;
	const align = cell.align === "start" ? "text-left" : "text-right";
	const numericClass = cell.numeric ? "tabular-nums" : "";
	const hideClass = cell.hideBelow !== undefined ? `max-[${cell.hideBelow}px]:hidden` : "";
	return (
		<span
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
	disabled = false,
	href,
	selected = false,
	as: asProp,
	"data-testid": dataTestId,
	"data-focused": dataFocused,
	rounded = false,
	"aria-label": ariaLabel,
	"aria-expanded": ariaExpanded,
}: RowProps): JSX.Element {
	const { variant } = useContext(ItemListContext);

	// padding: contained → px-[6px]; flush/boxed (a boxed list's rows are
	// flush inside the box) → px-[24px]
	const px = variant === "contained" ? "px-[6px]" : "px-[24px]";

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

	// A standalone nav-style row (rounded) owns its own permanent radius and
	// has no list separator to draw; a list row keeps the separator and only
	// rounds when selected (selectedClasses, above).
	const shapeClasses = rounded
		? "rounded-[var(--r-subtle)]"
		: "border-width-thin-b border-[var(--border-subtle)] last:border-none";

	// A standalone nav-style row sits among sibling nav rows that compact to
	// 36px on desktop (Sidebar's SectionHeader/NotificationButton) — the
	// 44px AQ-015 touch floor stays for mobile/tablet, `min-[1025px]:`
	// (Button.tsx's lore explains the off-by-one at exactly 1024px)
	// restores the dense height. A list row has no such sibling convention
	// and stays 44px.
	const heightClasses = rounded ? "min-h-[44px] min-[1025px]:min-h-[36px]" : "min-h-[44px]";

	const baseClasses = [
		"flex items-center gap-[12px]",
		heightClasses,
		px,
		shapeClasses,
		selectedClasses,
	]
		.filter(Boolean)
		.join(" ");

	// Determine wrapper element via heuristic
	const hasActions = actions !== undefined && actions !== null;

	// resolve which tag to use
	const resolvedAs =
		asProp ?? (onClick && !hasActions ? "button" : hasActions && onClick ? "div" : "div");

	// A standalone nav-style row's title matches its sibling nav rows' own
	// text style (Sidebar's SectionHeader/FastNavItem both author
	// type-control directly, not Row's default type-small) rather than the
	// list-row title weight.
	const titleClass = rounded
		? "type-control block text-[var(--text-primary)] truncate flex-1"
		: "type-small block   text-[var(--text-primary)] truncate flex-1";

	const inner = (
		<>
			{lead !== undefined && lead !== null && (
				<span className="shrink-0 inline-flex items-center">{lead}</span>
			)}
			<span className="flex-1 min-w-0">
				<span className={titleClass}>{title}</span>
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
		"aria-label": ariaLabel,
		"aria-expanded": ariaExpanded,
		"data-testid": dataTestId,
		"data-focused": dataFocused,
		className: baseClasses,
	};

	// clickableProps is the single source of hover+focus+motion for ALL
	// interactive branches. The button branch gets it via merged className; the
	// li>div[role=button] branches get it via spread; the div+actions branch does
	// not hand-roll the utilities.
	//
	const clickable = onClick ? clickableProps(onClick, baseClasses) : null;

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
		// button gets hover/focus classes from clickableProps
		// w-full fills the container (matches li-branch inner div which has w-full on the layout class)
		return (
			<button
				type="button"
				{...commonProps}
				disabled={disabled}
				className={`w-full text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none ${clickable?.className ?? baseClasses}`}
				onClick={onClick}
			>
				{inner}
			</button>
		);
	}

	if (resolvedAs === "li") {
		// <li> wrapper — preserves listitem role so getAllByRole("listitem") works.
		//
		// @lore: li MUST NOT have role=button — overrides listitem role; li wraps inner div[role=button] for interactivity

		const liSeparatorClass = "border-width-thin-b border-[var(--border-subtle)] last:border-none";

		const liInnerLayoutWithActions = `flex-1 min-w-0 flex items-center gap-[12px] ${px} min-h-[44px]`;
		const liInnerLayout = `w-full flex items-center gap-[12px] ${px} min-h-[44px]`;

		if (onClick && hasActions) {
			// li + click + actions → li wraps inner div[role=button] + action slot.
			// Fix: inner div is w-full + carries px padding + min-h so hover is edge-to-edge.
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
			const innerClickableClass = clickableProps(onClick, liInnerLayout).className ?? liInnerLayout;
			return (
				<li
					{...dsProps("Row", "2")}
					aria-current={commonProps["aria-current"]}
					className={[liSeparatorClass, selectedClasses].filter(Boolean).join(" ")}
				>
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
		// @lore: actions are a sibling div, not inside the clickable div — nested button clicks reach outer onClick in Chromium despite stopPropagation; jsdom differs
		const divInnerLayoutWithActions = `flex-1 min-w-0 flex items-center gap-[12px] ${px} min-h-[44px]`;
		const innerClickableClass =
			clickableProps(onClick, divInnerLayoutWithActions).className ?? divInnerLayoutWithActions;
		return (
			<div
				{...dsProps("Row", "2")}
				aria-current={commonProps["aria-current"]}
				data-testid={commonProps["data-testid"]}
				data-focused={commonProps["data-focused"]}
				className={[
					"flex items-center",
					"border-width-thin-b border-[var(--border-subtle)] last:border-none",
					selectedClasses,
				]
					.filter(Boolean)
					.join(" ")}
			>
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
				<span className="shrink-0 flex gap-[3px]">{actions}</span>
			</div>
		);
	}

	if (onClick) {
		// This case is covered by button branch above (no actions), but as="div" override
		// routes through clickableProps for consistent hover/focus.
		return (
			<div {...commonProps} {...clickableProps(onClick, baseClasses)}>
				{inner}
			</div>
		);
	}

	return <div {...commonProps}>{inner}</div>;
}
