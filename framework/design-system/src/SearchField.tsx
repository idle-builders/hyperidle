import { forwardRef, type JSX } from "react";
import { dsProps } from "./ds-attrs";

export interface SearchFieldProps {
	placeholder?: string;
	value?: string;
	onChange?: (value: string) => void;
	loading?: boolean;
	shortcutKey?: string;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
	{ placeholder, value, onChange, loading = false, shortcutKey },
	ref,
): JSX.Element {
	return (
		<div {...dsProps("SearchField", "1")} className="relative flex w-full items-center">
			<span className="pointer-events-none absolute left-[8px] flex items-center text-[var(--text-tertiary)]">
				{loading ? (
					<span className="inline-block h-[14px] w-[14px] rounded-[var(--r-pill)] border-2 border-[var(--border-subtle)] border-t-[var(--accent-primary)] animate-spin" />
				) : (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						className="h-[16px] w-[16px]"
						aria-hidden="true"
					>
						<title>Search</title>
						<path
							fillRule="evenodd"
							d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
							clipRule="evenodd"
						/>
					</svg>
				)}
			</span>
			<input
				ref={ref}
				type="text"
				// @lore AZ7 B3 (review round 1): fill was --surface-container (a recessed
				// fill, wrong job for an input — Set 3 gives text inputs
				// --surface-elevated, combined-round.md §2 Set 3 + §5.1) with a focus
				// state that swapped to --surface-page, giving the page-canvas token a
				// second job on focus (the same defect fixed on Button's hover tint).
				// Matches Input.tsx's pattern: one fill, border + ring for focus.
				className="w-full h-[32px] pl-[36px] pr-[48px] bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-[var(--r-default)] font-[family-name:var(--font-sans)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--motion-ease)] focus:border-[var(--accent-deep)] focus:shadow-[0_0_0_3px_var(--accent-primary-dim)] focus:outline-hidden"
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange?.(e.target.value)}
			/>
			<span className="absolute right-[8px] flex items-center gap-[3px]">
				{value && (
					<button
						type="button"
						className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-[var(--r-subtle)] bg-transparent text-[var(--text-tertiary)] text-[12px] cursor-pointer border-none p-0 transition-[background,color] duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] hover:text-[var(--text-secondary)]"
						aria-label="clear"
						onClick={() => onChange?.("")}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.5"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				)}
				{shortcutKey && (
					/* @lore K7 / AESTHETICS.md § Typography row "Body size (default)":
					   text-[10px] → text-[11px] (off-scale). The 56px right-inset on the
					   input above is a designer-call exception (audit B.1.5) — it is the
					   geometric minimum required to clear the clear-button + gap + kbd. */
					<kbd className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-[3px] rounded-[var(--r-subtle)] bg-[var(--surface-elevated)] text-[var(--text-tertiary)] font-[family-name:var(--font-mono)] text-[11px] font-medium">
						{shortcutKey}
					</kbd>
				)}
			</span>
		</div>
	);
});
