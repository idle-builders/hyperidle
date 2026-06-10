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
 */

import type { JSX } from "react";

export const Good = (): JSX.Element => (
	<button
		type="button"
		onClick={() => {}}
		className="rounded-2xl bg-surface-1 text-text-hi p-[12px] gap-[6px] text-[14px] shadow-sm"
	>
		Good
	</button>
);
