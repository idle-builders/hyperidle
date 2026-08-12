/**
 * Good fixture: passes every design/* rule.
 * Used by src/__tests__/fixtures.test.ts.
 *
 * Note: this file deliberately uses semantic tokens, on-grid spacing, the
 * Hearth closed radius scale (0/10/16/9999), and the Hearth closed type scale.
 * It is NOT a default-exported design-system component, so
 * design/require-ds-attribute does not fire. It is also not a design-system
 * or web/components path, so design/require-stories-sibling does not fire.
 *
 * U10 Hearth update: uses rounded-2xl (16px = --r-default, now on-scale) and
 * 6px-grid spacing values.
 *
 * AZ7 E6: radius-token-only replaced no-off-scale-radius and closed the
 * allowlist further — a NAMED radius class (rounded-2xl) is no longer
 * permitted even though 16px is on-scale; only rounded-none or a --r-* token
 * spelling passes. Updated to rounded-[var(--r-default)].
 */

import type { JSX } from "react";

export const Good = (): JSX.Element => (
	<button
		type="button"
		onClick={() => {}}
		className="rounded-[var(--r-default)] bg-surface-1 text-text-hi p-[12px] gap-[6px] text-[14px] shadow-sm"
	>
		Good
	</button>
);
