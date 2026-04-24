import { forwardRef, type JSX } from "react";

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
		<div className="relative flex w-full items-center">
			<span className="pointer-events-none absolute left-[8px] flex items-center text-[var(--text-lo)]">
				{loading ? (
					<span className="inline-block h-[14px] w-[14px] rounded-full border-2 border-[var(--surface-5)] border-t-[var(--primary)] animate-spin" />
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
				className="w-full h-[32px] pl-[32px] pr-[56px] bg-[var(--surface-3)] border border-transparent rounded-[var(--r2)] font-[var(--ui)] text-[13px] text-[var(--text-hi)] placeholder:text-[var(--text-lo)] transition-[border-color,background] duration-[var(--motion-fast)] ease-[ease] focus:border-[var(--primary)] focus:bg-[var(--surface-2)] focus:outline-none"
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange?.(e.target.value)}
			/>
			<span className="absolute right-[8px] flex items-center gap-[4px]">
				{value && (
					<button
						type="button"
						className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-[var(--r1)] bg-transparent text-[var(--text-lo)] text-[12px] cursor-pointer border-none p-0 transition-[background,color] duration-[var(--motion-fast)] ease-[ease] hover:bg-[var(--surface-ghost)] hover:text-[var(--text-mid)]"
						aria-label="clear"
						onClick={() => onChange?.("")}
					>
						&#x2715;
					</button>
				)}
				{shortcutKey && (
					<kbd className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-[4px] rounded-[var(--r1)] bg-[var(--surface-5)] text-[var(--text-lo)] font-[var(--mono)] text-[10px] font-medium">
						{shortcutKey}
					</kbd>
				)}
			</span>
		</div>
	);
});
