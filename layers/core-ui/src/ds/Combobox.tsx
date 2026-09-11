/**
 * Combobox — a trigger button that opens a popover with a filter input and a
 * listbox, full keyboard handling (ArrowUp/Down, Enter, Escape) and
 * `aria-activedescendant` tracking the highlighted option.
 *
 * Two option-sourcing modes:
 *  - client-filtered (default): `options` is the full catalog, filtered by the
 *    typed query against `label`/`id`/`description`.
 *  - server-driven (`filterOptions={false}`): `options` is exactly what
 *    renders — the caller narrows it (e.g. from a search endpoint) and reads
 *    the typed query via `onQueryChange`.
 *
 * `allowCustomValue` adds a pinned "use what you typed" row when the query
 * matches no option — for pickers whose value is an open string (e.g. a
 * role). Leave it off for pickers whose value must be one of `options`.
 *
 * `hideSelectedValue` keeps the closed trigger showing `placeholder` instead
 * of resolving `value` to a label — for a picker that hands each choice off
 * to a list the caller owns (e.g. a chip list) rather than holding one
 * persistent selection.
 *
 * a11y: `role="combobox"` on the trigger, `aria-expanded`, a listbox popover
 * with `aria-activedescendant` on the filter input.
 */

import type React from "react";
import { type JSX, useId, useMemo, useRef, useState } from "react";
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
	/** label rendered above the closed trigger. Omit when the caller renders its own label and points it at the trigger via `id`. */
	label?: string;
	/** placeholder for the closed trigger (when empty/hidden) and the popover's filter input. */
	placeholder?: string;
	/** accessible name for the listbox. */
	listAriaLabel?: string;
	/** accessible name for the popover's filter input. */
	inputAriaLabel?: string;
	disabled?: boolean;
	id?: string;
	"data-testid"?: string;
	/** lets the user commit typed text that matches no option. */
	allowCustomValue?: boolean;
	/** text before the typed value in the custom-value row, e.g. "Use new role: ". */
	customValuePrefix?: string;
	/** fires on every keystroke in the filter input. */
	onQueryChange?: (query: string) => void;
	/** false = `options` is already filtered by the caller; true (default) = Combobox filters `options` by the typed query itself. */
	filterOptions?: boolean;
	/** true = the closed trigger always shows `placeholder`, never a resolved `value`. */
	hideSelectedValue?: boolean;
	/** shows a loading row in the popover instead of options. */
	loading?: boolean;
	loadingMessage?: string;
	/** shows an error row in the popover instead of options. */
	error?: string | null;
	/** shown when there is nothing to offer and no custom-value row. */
	emptyMessage?: string;
}

function triggerText(
	value: string,
	options: readonly ComboboxOption[],
	hideSelectedValue: boolean,
	placeholder: string | undefined,
): string {
	if (hideSelectedValue || value === "") return placeholder ?? "";
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
	"data-testid": dataTestId,
	allowCustomValue = false,
	customValuePrefix = "Use: ",
	onQueryChange,
	filterOptions = true,
	hideSelectedValue = false,
	loading = false,
	loadingMessage = "Loading…",
	error = null,
	emptyMessage,
}: ComboboxProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [highlight, setHighlight] = useState(0);
	const generatedId = useId();
	const listId = `${id ?? generatedId}-list`;
	const inputRef = useRef<HTMLInputElement>(null);

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

	function commit(next: string): void {
		onChange(next);
		setOpen(false);
		setQueryAndNotify("");
		setHighlight(0);
	}

	function onKeyDown(e: React.KeyboardEvent): void {
		if (!open) {
			if (e.key === "ArrowDown" || e.key === "Enter") {
				setOpen(true);
			}
			return;
		}
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setHighlight((h) => Math.min(totalItems - 1, h + 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setHighlight((h) => Math.max(0, h - 1));
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (highlight < filtered.length) {
				const opt = filtered[highlight];
				if (opt) commit(opt.id);
			} else if (showCustom) {
				commit(trimmed);
			}
		} else if (e.key === "Escape") {
			setOpen(false);
			setQueryAndNotify("");
		}
	}

	return (
		<div
			{...dsProps("Combobox", "1")}
			data-testid={dataTestId}
			className="relative flex flex-col gap-[6px]"
		>
			{label && <span className="type-label uppercase text-[var(--text-tertiary)]">{label}</span>}

			{/* Closed field */}
			<button
				type="button"
				id={id}
				role="combobox"
				aria-expanded={open}
				aria-controls={listId}
				disabled={disabled}
				onClick={() => {
					if (disabled) return;
					setOpen((o) => !o);
					requestAnimationFrame(() => inputRef.current?.focus());
				}}
				className={`type-control border-width-thin flex h-[36px] items-center justify-between gap-[9px] rounded-[var(--r-subtle)] border-[var(--border-default)] bg-[var(--surface-elevated)] px-[9px] text-left ${
					disabled
						? "cursor-not-allowed text-[var(--text-tertiary)] opacity-70"
						: "text-[var(--text-primary)] hover:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
				}`}
			>
				<span className="truncate">
					{triggerText(value, options, hideSelectedValue, placeholder)}
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
							aria-activedescendant={`${listId}-opt-${highlight}`}
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
								{loadingMessage}
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
