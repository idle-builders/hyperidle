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

import { createContext, type JSX, type KeyboardEvent, type ReactNode, useContext } from "react";
import { clickableProps } from "./clickable.js";
import { dsProps } from "./ds-attrs.js";
import type { RowTone } from "./RowDot.js";

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
	/**
	 * undefined/neutral → text-tertiary.
	 * Other tones → --status-* color token.
	 * Single spelling — no "default" alias.
	 */
	tone?: RowTone;
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
	selected?: boolean;
	/** escape hatch; default heuristic (§nested-button) is correct without it */
	as?: "button" | "div" | "li";
	"data-testid"?: string;
	/** KnowledgeList triage keyboard focus */
	"data-focused"?: string;
}

// ---------------------------------------------------------------------------
// Tone → color helper
// ---------------------------------------------------------------------------

function toneColor(tone: RowTone | undefined): string {
	switch (tone) {
		case "success":
			return "var(--status-success)";
		case "warning":
			return "var(--status-warning)";
		case "error":
			return "var(--status-error)";
		case "info":
			return "var(--status-info)";
		default:
			return "var(--text-tertiary)";
	}
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
				"border-l-[var(--bw-strong)]",
				"border-[var(--accent-primary)]",
				"rounded-[var(--r-subtle)]",
			].join(" ")
		: "";

	const baseClasses = [
		"flex items-center gap-[12px]",
		"min-h-[44px]",
		px,
		"border-b border-[var(--border-subtle)] last:border-b-0",
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
				<span className="block text-[13px] font-[500] text-[var(--text-primary)] truncate flex-1">
					{title}
				</span>
				{subtitle !== undefined && subtitle !== null && (
					<span className="block text-[12px] text-[var(--text-tertiary)] truncate">{subtitle}</span>
				)}
			</span>
			{cells && cells.length > 0 && (
				<>
					{cells.map((cell, i) => {
						const cellStyle: React.CSSProperties = {};
						if (cell.width !== undefined) cellStyle.width = `${cell.width}px`;
						if ((cell.tone && cell.tone !== "neutral") || cell.tone === undefined) {
							cellStyle.color = toneColor(cell.tone);
						} else {
							cellStyle.color = toneColor(cell.tone);
						}
						const align = cell.align === "start" ? "text-left" : "text-right";
						const numericClass = cell.numeric ? "tabular-nums" : "";
						const hideClass =
							cell.hideBelow !== undefined ? `max-[${cell.hideBelow}px]:hidden` : "";
						return (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed-position cell columns — order is stable by design
								key={i}
								data-testid={cell["data-testid"]}
								className={[
									"shrink-0 text-[11px] font-[family-name:var(--font-mono)] truncate",
									align,
									numericClass,
									hideClass,
								]
									.filter(Boolean)
									.join(" ")}
								style={cellStyle}
							>
								{cell.content}
							</span>
						);
					})}
				</>
			)}
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

	if (resolvedAs === "button") {
		// Simple: onClick + no actions → native <button type="button">
		return (
			<button type="button" {...commonProps} onClick={onClick}>
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
		if (onClick && hasActions) {
			// li + click + actions → li wraps inner div[role=button] + action slot
			// The inner div[role=button] carries the row chrome and activates on click.
			// Action buttons live alongside the div[role=button] inside the li.
			return (
				<li
					{...dsProps("Row", "2")}
					aria-current={commonProps["aria-current"]}
					data-testid={commonProps["data-testid"]}
					data-focused={commonProps["data-focused"]}
					className={baseClasses}
				>
					{/* biome-ignore lint/a11y/useSemanticElements: div[role=button] required — inner <button> elements (actions) cannot be nested inside a <button>; li keeps listitem role */}
					<div
						role="button"
						tabIndex={0}
						onClick={onClick}
						onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onClick();
							}
						}}
						className="flex items-center gap-[12px] flex-1 min-w-0 cursor-pointer"
					>
						{lead !== undefined && lead !== null && (
							<span className="shrink-0 inline-flex items-center">{lead}</span>
						)}
						<span className="flex-1 min-w-0">
							<span className="block text-[13px] font-[500] text-[var(--text-primary)] truncate flex-1">
								{title}
							</span>
							{subtitle !== undefined && subtitle !== null && (
								<span className="block text-[12px] text-[var(--text-tertiary)] truncate">
									{subtitle}
								</span>
							)}
						</span>
						{cells && cells.length > 0 && (
							<>
								{cells.map((cell, i) => {
									const cellStyle: React.CSSProperties = {};
									if (cell.width !== undefined) cellStyle.width = `${cell.width}px`;
									cellStyle.color = toneColor(cell.tone);
									const align = cell.align === "start" ? "text-left" : "text-right";
									const numericClass = cell.numeric ? "tabular-nums" : "";
									const hideClass =
										cell.hideBelow !== undefined ? `max-[${cell.hideBelow}px]:hidden` : "";
									return (
										<span
											// biome-ignore lint/suspicious/noArrayIndexKey: fixed-position cell columns — order is stable by design
											key={i}
											data-testid={cell["data-testid"]}
											className={[
												"shrink-0 text-[11px] font-[family-name:var(--font-mono)] truncate",
												align,
												numericClass,
												hideClass,
											]
												.filter(Boolean)
												.join(" ")}
											style={cellStyle}
										>
											{cell.content}
										</span>
									);
								})}
							</>
						)}
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
			// The inner div[role=button] handles all interactivity; the li is semantic.
			return (
				<li
					{...dsProps("Row", "2")}
					aria-current={commonProps["aria-current"]}
					data-testid={commonProps["data-testid"]}
					data-focused={commonProps["data-focused"]}
					className={baseClasses}
				>
					{/* biome-ignore lint/a11y/useSemanticElements: div[role=button] required — li must keep listitem role; inner button not possible without actions (nested button would duplicate semantic) */}
					<div
						role="button"
						tabIndex={0}
						onClick={onClick}
						onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onClick();
							}
						}}
						className="flex items-center gap-[12px] flex-1 min-w-0 cursor-pointer"
					>
						{inner}
					</div>
				</li>
			);
		}
		return <li {...commonProps}>{inner}</li>;
	}

	// div case
	if (onClick && hasActions) {
		// nested-button rule: div[role=button]
		return (
			// biome-ignore lint/a11y/useSemanticElements: div[role=button] required — inner <button> elements (actions) cannot be nested inside a <button>
			<div
				{...commonProps}
				role="button"
				tabIndex={0}
				onClick={onClick}
				onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onClick();
					}
				}}
				{...clickableProps(onClick, "")}
				className={[
					baseClasses,
					"cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))] transition-colors duration-[var(--motion-fast)]",
				]
					.filter(Boolean)
					.join(" ")}
			>
				{inner}
			</div>
		);
	}

	if (onClick) {
		// This case is covered by button branch above (no actions), but as="div" override
		return (
			// biome-ignore lint/a11y/useSemanticElements: forced via as="div" prop override
			<div
				{...commonProps}
				role="button"
				tabIndex={0}
				onClick={onClick}
				onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onClick();
					}
				}}
			>
				{inner}
			</div>
		);
	}

	return <div {...commonProps}>{inner}</div>;
}
