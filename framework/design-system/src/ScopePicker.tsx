/**
 * ScopePicker — AI5 E4: Tier 1 knowledge-scope picker.
 *
 * Consolidates 3 hand-rolled scope pill rows + 1 DaisyUI Select into ONE
 * radiogroup-of-pills primitive (AC4 "one implementation in all 4 locations").
 *
 * @lore AI5: The hand-rolled pills shipped `outline:none` (latent a11y gap)
 * and hardcoded `rgba(240,196,25,0.14)`. This primitive adds the
 * `focus-visible` ring (Button/`clickable.ts` convention) and uses the
 * `--accent-primary-dim` token, killing 3 tint literals.
 *
 * @lore AI5 AQ-015: per-pill touch mechanism is `min-h-[44px] xl:min-h-[24px]`,
 * NOT a bare min-h. The 44px floor holds up to and including 1024px (where the
 * K8 e2e gate measures `getBoundingClientRect()`); `xl:` (≥1280px) restores the
 * dense 24px pill so all 4 sites are pixel-identical at the same breakpoint and
 * the dense filter/create rows are preserved. Mirrors `Select.tsx` `@lore AG5 fix-1`.
 *
 * @lore AI5: vocabulary is NOT restated here — callers map
 * `SCOPE_PILL_OPTIONS` / `SCOPE_CREATE_OPTIONS` (scope-labels.ts) →
 * `ScopePickerOption[]`. ScopePicker is a dumb renderer.
 */

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
	/** Container testid passthrough (e.g. "knowledge-scope-pills"). */
	dataTestId?: string;
}

const PILL_BASE =
	"inline-flex items-center justify-center px-[12px] py-[4px] min-h-[44px] xl:min-h-[24px] rounded-[var(--r-pill)] border-[var(--bw-default)] focus-visible:outline focus-visible:outline-[2px] focus-visible:outline-[var(--accent-deep)] focus-visible:outline-offset-[2px]";

// @lore UI-007: cursor-pointer lives on the enabled state classes (PILL_ACTIVE / PILL_INACTIVE),
// NOT in PILL_BASE. Previously PILL_BASE carried cursor-pointer and PILL_DISABLED added
// cursor-not-allowed — but Tailwind resolves both classes via stylesheet order, not HTML
// order, so cursor-pointer sometimes won. Moving cursor-pointer out of the base ensures
// disabled pills never inherit the pointer cursor.
const PILL_ACTIVE =
	"bg-[var(--accent-primary-dim)] border-[var(--accent-deep)] text-[var(--accent-deep)] cursor-pointer";

const PILL_INACTIVE =
	"bg-transparent border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer";

const PILL_DISABLED = "opacity-40 cursor-not-allowed";

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
	// @lore AI5: in filter mode the first option (id with filterKinds=null,
	// e.g. "all") is active when value is null. In select mode null never
	// matches any option.
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
							// @lore AI5: filter mode emits null for the "All" pill so the
							// caller clears its filter rather than filtering to "all".
							onChange(mode === "filter" && option.id === options[0]?.id ? null : option.id);
						}}
						className={`type-control ${[
							PILL_BASE,
							isActive ? PILL_ACTIVE : PILL_INACTIVE,
							isDisabled ? PILL_DISABLED : "",
						].join(" ")}`}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}
