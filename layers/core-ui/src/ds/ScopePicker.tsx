/**
 * ScopePicker — Tier 1 document-scope picker.
 *
 * Consolidates 3 hand-rolled scope pill rows + 1 DaisyUI Select into ONE
 * radiogroup-of-pills primitive (one implementation in all 4 locations).
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
	/** Container testid passthrough (e.g. "document-scope-pills"). */
	dataTestId?: string;
}

const PILL_BASE =
	"inline-flex items-center justify-center px-[12px] py-[4px] min-h-[44px] xl:min-h-[24px] rounded-[var(--r-pill)] border-width-default focus-visible:outline focus-visible:outline-[2px] focus-visible:outline-[var(--accent-deep)] focus-visible:outline-offset-[2px]";

// @lore UI-007: cursor is computed per-pill inline — never included in a shared
// constant that applies to both enabled and disabled pills. Tailwind resolves
// conflicting cursor-* classes by CSS stylesheet order (cursor-pointer comes
// after cursor-not-allowed alphabetically → wins when both are present). The only
// safe fix is to ensure cursor-pointer is physically absent from disabled pills'
// class list, which means building it conditionally rather than from a shared const.
// Same principle for hover:text-* — a disabled control must not respond to hover.
const PILL_ACTIVE =
	"bg-[var(--accent-primary-dim)] border-[var(--accent-deep)] text-[var(--accent-deep)]";

const PILL_INACTIVE = "bg-transparent border-[var(--border-default)] text-[var(--text-secondary)]";

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
							// UI-007: cursor and hover are conditional so they are ABSENT from
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
