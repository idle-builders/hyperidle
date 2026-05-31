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
					<span className="inline-block h-[14px] w-[14px] rounded-full border-2 border-[var(--border-default)] border-t-[var(--accent-primary)] animate-spin" />
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
				className="w-full h-[32px] pl-[32px] pr-[56px] bg-[var(--surface-container)] border border-[var(--border-default)] rounded-[var(--r-default)] font-[family-name:var(--font-sans)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] transition-[border-color,background,box-shadow] duration-[var(--motion-fast)] ease-[ease] focus:border-[var(--accent-primary)] focus:bg-[var(--surface-page)] focus:shadow-[0_0_0_3px_var(--accent-primary-dim)] focus:outline-none"
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange?.(e.target.value)}
			/>
			<span className="absolute right-[8px] flex items-center gap-[4px]">
				{value && (
					<button
						type="button"
						className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-[var(--r-subtle)] bg-transparent text-[var(--text-tertiary)] text-[12px] cursor-pointer border-none p-0 transition-[background,color] duration-[var(--motion-fast)] ease-[ease] hover:bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] hover:text-[var(--text-secondary)]"
						aria-label="clear"
						onClick={() => onChange?.("")}
					>
						&#x2715;
					</button>
				)}
				{shortcutKey && (
					/* @lore K7 / AESTHETICS.md § Typography row "Body size (default)":
					   text-[10px] → text-[11px] (off-scale). The 56px right-inset on the
					   input above is a designer-call exception (audit B.1.5) — it is the
					   geometric minimum required to clear the clear-button + gap + kbd. */
					<kbd className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-[4px] rounded-[var(--r-subtle)] bg-[var(--surface-elevated)] text-[var(--text-tertiary)] font-[family-name:var(--font-mono)] text-[11px] font-medium">
						{shortcutKey}
					</kbd>
				)}
			</span>
		</div>
	);
});
