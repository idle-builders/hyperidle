// @lore: min-h-[44px] xl:min-h-[24px] — 44px floor holds at ≤1024px (touch target); xl: restores dense 24px so all 4 sites are pixel-identical

// @lore: vocabulary NOT in this component — callers map SCOPE_PILL_OPTIONS/SCOPE_CREATE_OPTIONS to ScopePickerOption[]; ScopePicker is a dumb renderer

import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ScopePickerOption {
	id: string;
	label: string;
	disabled?: boolean;
}

export interface ScopePickerProps {
	options: ScopePickerOption[];
	/** Active option id; null = "All" (filter mode). */
	value: string | null;
	onChange: (id: string | null) => void;
	/** "select" (single active) | "filter" (supports null/"All"). Default "select". */
	mode?: "select" | "filter";
	ariaLabel: string;
	/** Tooltip shown on disabled pills (single reason — only "team" is disabled). */
	disabledTitle?: string;
	/** REQUIRED. Per-pill testid = `${testIdPrefix}-${id}`. */
	testIdPrefix: string;
	/** Container testid passthrough (e.g. "document-scope-pills"). */
	dataTestId?: string;
}

// Exported so ScopePickerToggle (below) — a single on/off pill with real
// toggle-button semantics — can share the exact same look, not a lookalike.
export const PILL_BASE =
	"inline-flex items-center justify-center px-[12px] py-[4px] min-h-[44px] xl:min-h-[24px] rounded-[var(--r-pill)] border-width-default focus-visible:outline focus-visible:outline-[2px] focus-visible:outline-[var(--accent-deep)] focus-visible:outline-offset-[2px]";

// @lore: cursor set per-pill not via base — Tailwind resolves cursor-pointer after cursor-not-allowed alphabetically; absent is the only safe fix for disabled
export const PILL_ACTIVE =
	"bg-[var(--accent-primary-dim)] border-[var(--accent-deep)] text-[var(--accent-deep)]";

export const PILL_INACTIVE =
	"bg-transparent border-[var(--border-default)] text-[var(--text-secondary)]";

export function ScopePicker({
	options,
	value,
	onChange,
	mode = "select",
	ariaLabel,
	disabledTitle,
	testIdPrefix,
	dataTestId,
}: ScopePickerProps): JSX.Element {
	// @lore: filter mode — first option active when value is null; select mode null never matches
	const activeId = value ?? (mode === "filter" ? (options[0]?.id ?? null) : null);

	return (
		<div
			{...dsProps("ScopePicker", "1")}
			role="radiogroup"
			aria-label={ariaLabel}
			data-testid={dataTestId}
			className="flex flex-wrap items-center gap-[6px]"
		>
			{options.map((option) => {
				const isActive = option.id === activeId;
				const isDisabled = option.disabled ?? false;
				return (
					// biome-ignore lint/a11y/useSemanticElements: WAI-ARIA APG's styled radio-group pattern — a native <input type="radio"> can't be restyled as this pill button.
					<button
						key={option.id}
						type="button"
						role="radio"
						aria-checked={isActive}
						aria-disabled={isDisabled}
						disabled={isDisabled}
						title={isDisabled ? disabledTitle : undefined}
						data-testid={`${testIdPrefix}-${option.id}`}
						data-active={isActive ? "true" : "false"}
						onClick={() => {
							if (isDisabled) return;
							// @lore: filter mode emits null for the first option so caller clears its filter rather than filtering to "all".
							onChange(mode === "filter" && option.id === options[0]?.id ? null : option.id);
						}}
						className={`type-control ${[
							PILL_BASE,
							isActive ? PILL_ACTIVE : PILL_INACTIVE,
							// cursor and hover are conditional so they are ABSENT from
							// the disabled pill's class list. Tailwind resolves cursor-pointer
							// after cursor-not-allowed in the stylesheet, so having both present
							// always renders pointer — the only safe fix is omission.
							isDisabled
								? "opacity-40 cursor-not-allowed"
								: `cursor-pointer${isActive ? "" : " hover:text-[var(--text-primary)]"}`,
						].join(" ")}`}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}

// @lore: ScopePickerToggle uses aria-pressed not role=radio — one-radio radiogroup is un-uncheckable; aria-pressed matches boolean filter semantics

export interface ScopePickerToggleProps {
	label: string;
	pressed: boolean;
	onToggle: () => void;
	"data-testid"?: string;
}

export function ScopePickerToggle({
	label,
	pressed,
	onToggle,
	"data-testid": dataTestId,
}: ScopePickerToggleProps): JSX.Element {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			data-testid={dataTestId}
			data-active={pressed ? "true" : "false"}
			onClick={onToggle}
			className={`type-control ${[
				PILL_BASE,
				pressed ? PILL_ACTIVE : PILL_INACTIVE,
				`cursor-pointer${pressed ? "" : " hover:text-[var(--text-primary)]"}`,
			].join(" ")}`}
		>
			{label}
		</button>
	);
}
