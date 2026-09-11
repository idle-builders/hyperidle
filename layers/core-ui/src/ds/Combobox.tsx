/**
 * Combobox — a trigger button that opens a popover with a filter input and a
 * listbox, full keyboard handling (ArrowUp/Down, Enter, Escape) and
 * `aria-activedescendant` tracking the highlighted option.
 *
 * Two option-sourcing modes, chosen by whether the caller passes
 * `onQueryChange`:
 *  - client-filtered (no `onQueryChange`): `options` is the full catalog,
 *    filtered by the typed query against `label`/`id`/`description`.
 *  - server-driven (`onQueryChange` passed): `options` is exactly what
 *    renders — the caller narrows it (e.g. from a search endpoint) and reads
 *    the typed query via `onQueryChange`.
 *
 * `allowCustomValue` adds a pinned "use what you typed" row when the query
 * matches no option — for pickers whose value is an open string (e.g. a
 * role). Leave it off for pickers whose value must be one of `options`.
 *
 * While `loading` or `error` is set, the popover shows only that status row —
 * ArrowUp/ArrowDown/Enter are inert and `aria-activedescendant` is omitted,
 * so a server-driven caller's still-in-flight options can never be
 * navigated to or committed as if they were the current query's results.
 *
 * a11y: `role="combobox"` on the trigger, `aria-expanded`, a listbox popover
 * with `aria-activedescendant` on the filter input. The trigger's accessible
 * name comes from `label` via a real `<label htmlFor>` pointing at the
 * trigger's `id` (generated with `useId()` when the caller doesn't pass one)
 * — a `<span>` next to a `<button>` gives the button no name at all.
 */

import type React from "react";
import { type JSX, useEffect, useId, useMemo, useRef, useState } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ComboboxOption {
	/** persisted value */
	id: string;
	/** friendly display text */
	label: string;
	/** one-line description shown under the label in the popover */
	description?: string;
}

export interface ComboboxProps {
	options: readonly ComboboxOption[];
	value?: string;
	onChange: (value: string) => void;
	/** label rendered above the closed trigger, associated to it via `<label htmlFor>` — this is what gives the trigger its accessible name. Omit when the caller renders its own label and points it at the trigger via `id`. */
	label?: string;
	/** placeholder for the closed trigger (when empty/hidden) and the popover's filter input. */
	placeholder?: string;
	/** accessible name for the listbox. */
	listAriaLabel?: string;
	/** accessible name for the popover's filter input. */
	inputAriaLabel?: string;
	disabled?: boolean;
	id?: string;
	/** seeds the popover open on mount instead of closed — for a picker whose whole point is instant search (e.g. RecipientPicker), where hiding the field behind a click would cost the person the ability to type immediately. */
	defaultOpen?: boolean;
	/** lets the user commit typed text that matches no option. */
	allowCustomValue?: boolean;
	/** text before the typed value in the custom-value row, e.g. "Use new role: ". */
	customValuePrefix?: string;
	/** fires on every keystroke in the filter input. Passing this switches to server-driven mode — see the docblock above. */
	onQueryChange?: (query: string) => void;
	/** shows a loading row in the popover instead of options. */
	loading?: boolean;
	/** shows an error row in the popover instead of options. */
	error?: string | null;
	/** shown when there is nothing to offer and no custom-value row. */
	emptyMessage?: string;
}

function triggerText(
	value: string,
	options: readonly ComboboxOption[],
	placeholder: string | undefined,
): string {
	if (value === "") return placeholder ?? "";
	return options.find((o) => o.id === value)?.label ?? value;
}

// ListboxOption is extracted as a named component so biome-ignore comments
// for a11y/useKeyWithClickEvents and a11y/useFocusableInteractive can appear
// directly before the JSX element — inline suppression inside .map()
// callbacks is not reliably honored by Biome (JSX block context issue).
interface ListboxOptionProps {
	id: string;
	highlight: boolean;
	onMouseEnter: () => void;
	onClick: () => void;
	children: React.ReactNode;
	className?: string;
}
function ListboxOption({
	id,
	highlight,
	onMouseEnter,
	onClick,
	children,
	className,
}: ListboxOptionProps): JSX.Element {
	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the parent combobox field's onKeyDown (aria-activedescendant pattern)
		// biome-ignore lint/a11y/useFocusableInteractive: focus stays on input; aria-activedescendant points here (standard combobox pattern, no tabIndex needed)
		<div
			id={id}
			role="option"
			aria-selected={highlight}
			onMouseEnter={onMouseEnter}
			onClick={onClick}
			className={className}
		>
			{children}
		</div>
	);
}

function ChevronIcon(): JSX.Element {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="m6 9 6 6 6-6" />
		</svg>
	);
}

export function Combobox({
	options,
	value = "",
	onChange,
	label,
	placeholder,
	listAriaLabel,
	inputAriaLabel,
	disabled = false,
	id,
	defaultOpen = false,
	allowCustomValue = false,
	customValuePrefix = "Use: ",
	onQueryChange,
	loading = false,
	error = null,
	emptyMessage,
}: ComboboxProps): JSX.Element {
	// Server-driven mode (see the docblock above): the caller owns `options`
	// and reads the typed query itself, so Combobox must not also filter it.
	const filterOptions = onQueryChange === undefined;
	const [open, setOpen] = useState(defaultOpen);
	const [query, setQuery] = useState("");
	const [highlight, setHighlight] = useState(0);
	const generatedId = useId();
	const triggerId = id ?? generatedId;
	const listId = `${triggerId}-list`;
	const inputRef = useRef<HTMLInputElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (open) inputRef.current?.focus();
	}, [open]);

	function setQueryAndNotify(next: string): void {
		setQuery(next);
		onQueryChange?.(next);
	}

	const filtered = useMemo(() => {
		if (!filterOptions) return options;
		const q = query.trim().toLowerCase();
		if (q === "") return options;
		return options.filter(
			(o) =>
				o.label.toLowerCase().includes(q) ||
				o.id.toLowerCase().includes(q) ||
				(o.description?.toLowerCase().includes(q) ?? false),
		);
	}, [options, query, filterOptions]);

	const trimmed = query.trim();
	const exactMatch = options.some(
		(o) => o.label.toLowerCase() === trimmed.toLowerCase() || o.id === trimmed,
	);
	const showCustom = allowCustomValue && trimmed !== "" && !exactMatch;
	const totalItems = filtered.length + (showCustom ? 1 : 0);
	const showStatusOnly = loading || error !== null;
	// Nothing is navigable/pickable while the loading or error row stands in
	// for the list — those rows aren't options, and any options still in
	// `filtered` belong to a query that isn't the current one.
	const hasNavigableOptions = !showStatusOnly && totalItems > 0;

	// @lore A caller in server-driven mode can narrow `options` (e.g. a
	// dependent filter elsewhere) while the typed query stays the same — the
	// query-change path already resets highlight to 0, but nothing else did.
	// Left unclamped, aria-activedescendant kept naming an option index that
	// no longer existed once the row it pointed at disappeared. Re-clamp on
	// every `totalItems` change so it always names a real option, or none.
	useEffect(() => {
		setHighlight((h) => Math.max(0, Math.min(totalItems - 1, h)));
	}, [totalItems]);

	function commit(next: string): void {
		onChange(next);
		setOpen(false);
		setQueryAndNotify("");
		setHighlight(0);
		triggerRef.current?.focus();
	}

	function moveHighlight(delta: number): void {
		setHighlight((h) => Math.max(0, Math.min(totalItems - 1, h + delta)));
	}

	function commitHighlighted(): void {
		if (highlight < filtered.length) {
			const opt = filtered[highlight];
			if (opt) commit(opt.id);
		} else if (showCustom) {
			commit(trimmed);
		}
	}

	function onKeyDown(e: React.KeyboardEvent): void {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			if (hasNavigableOptions) moveHighlight(1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			if (hasNavigableOptions) moveHighlight(-1);
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (hasNavigableOptions) commitHighlighted();
		} else if (e.key === "Escape") {
			setOpen(false);
			setQueryAndNotify("");
			triggerRef.current?.focus();
		}
	}

	const showingValue = value !== "";

	return (
		<div {...dsProps("Combobox", "1")} className="relative flex flex-col gap-[6px]">
			{label && (
				<label htmlFor={triggerId} className="type-label uppercase text-[var(--text-tertiary)]">
					{label}
				</label>
			)}

			{/* Closed field */}
			<button
				ref={triggerRef}
				type="button"
				id={triggerId}
				role="combobox"
				aria-expanded={open}
				aria-controls={listId}
				disabled={disabled}
				onClick={() => setOpen((o) => !o)}
				className={`type-control border-width-thin flex h-[36px] items-center justify-between gap-[9px] rounded-[var(--r-subtle)] border-[var(--border-default)] bg-[var(--surface-elevated)] px-[9px] text-left ${
					disabled
						? "cursor-not-allowed text-[var(--text-tertiary)] opacity-70"
						: "text-[var(--text-primary)] hover:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
				}`}
			>
				<span className={`truncate ${showingValue ? "" : "text-[var(--text-tertiary)]"}`}>
					{triggerText(value, options, placeholder)}
				</span>
				<span className="shrink-0 text-[var(--text-tertiary)]">
					<ChevronIcon />
				</span>
			</button>

			{/* Popover */}
			{open && !disabled && (
				<div className="border-width-thin absolute left-0 right-0 top-[62px] z-20 flex flex-col overflow-hidden rounded-[var(--r-default)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-elevated)]">
					<div className="border-width-thin-b  border-[var(--border-subtle)] p-[6px]">
						<input
							ref={inputRef}
							type="text"
							value={query}
							onChange={(e) => {
								setQueryAndNotify(e.target.value);
								setHighlight(0);
							}}
							onKeyDown={onKeyDown}
							placeholder={placeholder}
							aria-label={inputAriaLabel ?? placeholder ?? "Filter options"}
							{...(hasNavigableOptions
								? { "aria-activedescendant": `${listId}-opt-${highlight}` }
								: {})}
							className="type-input w-full rounded-[var(--r-subtle)] bg-[var(--surface-elevated)] px-[9px] py-[6px]  text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none "
						/>
					</div>

					<ul
						id={listId}
						// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: ul[role=listbox] is the standard ARIA pattern for a combobox popover
						role="listbox"
						aria-label={listAriaLabel ?? "Options"}
						className="max-h-[280px] overflow-auto p-[3px]"
					>
						{loading && (
							<div className="type-small px-[9px] py-[6px] text-[var(--text-tertiary)]">
								Loading…
							</div>
						)}
						{!loading && error !== null && (
							<div className="type-small px-[9px] py-[6px] text-[var(--status-error)]" role="alert">
								{error}
							</div>
						)}
						{!showStatusOnly && filtered.length === 0 && !showCustom && emptyMessage && (
							<div className="type-small px-[9px] py-[6px] text-[var(--text-tertiary)]">
								{emptyMessage}
							</div>
						)}

						{!showStatusOnly &&
							filtered.map((opt, i) => (
								<ListboxOption
									key={opt.id}
									id={`${listId}-opt-${i}`}
									highlight={i === highlight}
									onMouseEnter={() => setHighlight(i)}
									onClick={() => commit(opt.id)}
									className={`flex cursor-pointer flex-col gap-[3px] rounded-[var(--r-subtle)] px-[9px] py-[6px] ${
										i === highlight ? "bg-[var(--surface-container)]" : ""
									}`}
								>
									<span className="type-small   text-[var(--text-primary)]">{opt.label}</span>
									{opt.description ? (
										<span className="type-metadata  text-[var(--text-tertiary)]">
											{opt.description}
										</span>
									) : null}
								</ListboxOption>
							))}

						{!showStatusOnly && showCustom ? (
							<ListboxOption
								id={`${listId}-opt-${filtered.length}`}
								highlight={highlight === filtered.length}
								onMouseEnter={() => setHighlight(filtered.length)}
								onClick={() => commit(trimmed)}
								className={`flex items-center gap-[6px] rounded-[var(--r-subtle)]  border-[var(--border-subtle)] px-[9px] py-[6px] ${
									highlight === filtered.length ? "bg-[var(--surface-container)]" : ""
								}`}
							>
								<span className="type-small  text-[var(--accent-deep)]">＋</span>
								<span className="type-small  text-[var(--text-primary)]">
									{customValuePrefix}
									<span className="type-small ">{trimmed}</span>
								</span>
							</ListboxOption>
						) : null}
					</ul>
				</div>
			)}
		</div>
	);
}
