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
		<div className="relative flex items-center">
			<span className="pointer-events-none absolute left-2">
				{loading ? (
					<span className="loading loading-spinner loading-xs" />
				) : (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						className="h-4 w-4 text-[var(--text-lo)]"
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
				className="input input-sm w-full pl-8 pr-16"
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange?.(e.target.value)}
			/>
			<span className="absolute right-2 flex items-center gap-1">
				{value && (
					<button
						type="button"
						className="btn btn-ghost btn-xs"
						aria-label="clear"
						onClick={() => onChange?.("")}
					>
						&#x2715;
					</button>
				)}
				{shortcutKey && <kbd className="kbd kbd-xs">{shortcutKey}</kbd>}
			</span>
		</div>
	);
});
