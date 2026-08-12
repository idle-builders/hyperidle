/**
 * AV2 — RoleCombobox: catalog-plus-custom role picker.
 *
 * The ONE net-new control AV2 introduces (Phase-0 gate = `build`). Replaces the
 * closed `AGENT_ROLE_CATALOG` <Select> in the agent editor: the user filters the
 * known catalog roles by label/description AND can commit an arbitrary new role
 * string. Known roles render their friendly label; a custom role renders its raw
 * string. This is UI-only — `role` is already an open `users.role` string
 * (see plans/AV2/requirements.md §5); no data-model change.
 *
 * Presentational: options + value + onChange in, local open/highlight/filter
 * state, callbacks. Production wiring (fetching the catalog, save routing) is the
 * builder's job.
 *
 * @lore AV2: catalog-plus-custom, NOT free-form and NOT a closed select. The
 * catalog carries load-bearing metadata (label, description, category) we keep
 * for known roles; the free-text commit is the additive escape hatch. See
 * requirements.md §5 for the pinned-noun rationale (rejection list included).
 *
 * a11y: role="combobox" on the field, aria-expanded, a listbox popover with
 * aria-activedescendant tracking the highlighted option. Enter commits the
 * highlighted catalog option, or the typed custom string when nothing matches.
 */

import type React from "react";
import { type JSX, useId, useMemo, useRef, useState } from "react";
import { dsProps } from "./ds-attrs.js";

export interface RoleOption {
	/** the raw role string persisted to users.role */
	role: string;
	/** friendly label (from AGENT_ROLE_CATALOG) */
	label: string;
	/** one-line description (from AGENT_ROLE_CATALOG) */
	description?: string;
}

export interface RoleComboboxProps {
	/** known catalog roles */
	options: readonly RoleOption[];
	/** current role string (may be a custom value not in options) */
	value: string;
	onChange: (role: string) => void;
	/** disables the control (e.g. the Assistant row keeps role="assistant") */
	disabled?: boolean;
	id?: string;
	"data-testid"?: string;
}

/** friendly label for a role string, or the raw string when it is custom. */
function displayLabel(value: string, options: readonly RoleOption[]): string {
	return options.find((o) => o.role === value)?.label ?? value;
}

// @lore AV2: ListboxOption is extracted as a named component so biome-ignore
// comments for a11y/useKeyWithClickEvents and a11y/useFocusableInteractive can
// appear directly before the JSX element — inline suppression inside .map()
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

export function RoleCombobox({
	options,
	value,
	onChange,
	disabled = false,
	id,
	"data-testid": dataTestId,
}: RoleComboboxProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [highlight, setHighlight] = useState(0);
	const generatedId = useId();
	const listId = `${id ?? generatedId}-list`;
	const inputRef = useRef<HTMLInputElement>(null);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (q === "") return options;
		return options.filter(
			(o) =>
				o.label.toLowerCase().includes(q) ||
				o.role.toLowerCase().includes(q) ||
				(o.description?.toLowerCase().includes(q) ?? false),
		);
	}, [options, query]);

	// Show the "use new role" affordance when the typed query is non-empty and
	// doesn't exactly match a known role label or role string.
	const trimmed = query.trim();
	const exactMatch = options.some(
		(o) => o.label.toLowerCase() === trimmed.toLowerCase() || o.role === trimmed,
	);
	const showCustom = trimmed !== "" && !exactMatch;
	const totalItems = filtered.length + (showCustom ? 1 : 0);

	function commit(role: string): void {
		onChange(role);
		setOpen(false);
		setQuery("");
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
				if (opt) commit(opt.role);
			} else if (showCustom) {
				commit(trimmed);
			}
		} else if (e.key === "Escape") {
			setOpen(false);
			setQuery("");
		}
	}

	return (
		<div
			{...dsProps("RoleCombobox", "1")}
			data-testid={dataTestId}
			className="relative flex flex-col gap-[6px]"
		>
			<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
				Role
			</span>

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
				// @lore AZ7 review-round-2 NB-3: was `bg-[var(--surface-page)]` on both
				// this trigger and the popover's filter input below — the same Set 3
				// second-job defect B3 fixed on SearchField. Both are Input-set
				// chrome (this component ships as `dsInputLike` in the AZ7
				// measurement scanner), so both move to `--surface-elevated`
				// together — leaving one fixed and one not would make a single
				// component internally inconsistent about its own fill.
				className={`flex h-[36px] items-center justify-between gap-[9px] rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[9px] text-left text-[13px] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] ${
					disabled
						? "cursor-not-allowed text-[var(--text-tertiary)] opacity-70"
						: "text-[var(--text-primary)] hover:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
				}`}
			>
				<span className="truncate">{displayLabel(value, options)}</span>
				<span className="shrink-0 text-[var(--text-tertiary)]">
					<ChevronIcon />
				</span>
			</button>

			{/* Popover */}
			{open && !disabled && (
				<div className="absolute left-0 right-0 top-[62px] z-20 flex flex-col overflow-hidden rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-elevated)]">
					<div className="border-b border-[var(--border-subtle)] p-[6px]">
						<input
							ref={inputRef}
							type="text"
							value={query}
							onChange={(e) => {
								setQuery(e.target.value);
								setHighlight(0);
							}}
							onKeyDown={onKeyDown}
							placeholder="Filter roles or type a new one…"
							aria-label="Filter or define a role"
							aria-activedescendant={`${listId}-opt-${highlight}`}
							className="w-full rounded-[var(--r-subtle)] bg-[var(--surface-elevated)] px-[9px] py-[6px] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none max-md:text-[16px]"
						/>
					</div>

					<ul
						id={listId}
						// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: ul[role=listbox] is the standard ARIA pattern for a combobox popover
						role="listbox"
						aria-label="Roles"
						className="max-h-[280px] overflow-auto p-[3px]"
					>
						{filtered.map((opt, i) => (
							<ListboxOption
								key={opt.role}
								id={`${listId}-opt-${i}`}
								highlight={i === highlight}
								onMouseEnter={() => setHighlight(i)}
								onClick={() => commit(opt.role)}
								className={`flex cursor-pointer flex-col gap-[3px] rounded-[var(--r-subtle)] px-[9px] py-[6px] ${
									i === highlight ? "bg-[var(--surface-container)]" : ""
								}`}
							>
								<span className="text-[13px] font-[500] text-[var(--text-primary)]">
									{opt.label}
								</span>
								{opt.description ? (
									<span className="text-[12px] text-[var(--text-tertiary)]">{opt.description}</span>
								) : null}
							</ListboxOption>
						))}

						{showCustom ? (
							<ListboxOption
								id={`${listId}-opt-${filtered.length}`}
								highlight={highlight === filtered.length}
								onMouseEnter={() => setHighlight(filtered.length)}
								onClick={() => commit(trimmed)}
								className={`flex items-center gap-[6px] rounded-[var(--r-subtle)] border-t border-[var(--border-subtle)] px-[9px] py-[6px] ${
									highlight === filtered.length ? "bg-[var(--surface-container)]" : ""
								}`}
							>
								<span className="text-[13px] text-[var(--accent-deep)]">＋</span>
								<span className="text-[13px] text-[var(--text-primary)]">
									Use new role: <span className="font-[600]">{trimmed}</span>
								</span>
							</ListboxOption>
						) : null}
					</ul>
				</div>
			)}
		</div>
	);
}
