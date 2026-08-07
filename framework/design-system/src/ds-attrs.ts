/**
 * K2 markers. `dsProps` for Tier 0+1+2 components, `dsShellProps` for Tier 3 shells.
 *
 * @lore K2: tier values are STRINGS ("0", "1", "2", "3") — DOM attributes are always strings.
 * @lore W2: Tier 0 added for foundation primitives (Avatar, Button, Input, etc.). These are
 * the lowest-level Hearth atoms that Tier 1+ components consume. Using "0" is not possible
 * with the old DsTier type ("1"|"2") — extended here. dsProps accepts "0" for W2 primitives.
 */

export type DsTier = "0" | "1" | "2" | "3";

export type DsSource = "design-system" | "web-shell";

export interface DsAttrs {
	"data-ds-component": string;
	"data-ds-tier": DsTier;
	"data-ds-source": DsSource;
}

export interface DsShellAttrs {
	"data-ds-shell": string;
	"data-ds-tier": "3";
	"data-ds-source": "web-shell";
}

/**
 * Tier 0+1+2 marker. Spread on outermost JSX element.
 *
 * @lore K2: Tier 3 shells use `dsShellProps` — different namespace by design (K4 inspector contract).
 * @lore W2: Tier 0 is for foundation primitives (Avatar, Button, Input, etc.).
 */
export function dsProps(name: string, tier: "0" | "1" | "2"): DsAttrs {
	return {
		"data-ds-component": name,
		"data-ds-tier": tier,
		"data-ds-source": "design-system",
	};
}

/**
 * Tier 3 shell marker. Spread on outermost JSX element of shell regions.
 *
 * @lore K2: shells use `data-ds-shell` (not `data-ds-component`) and source `web-shell` so the
 * K4 inspector can distinguish shell regions from design-system primitives.
 */
export function dsShellProps(name: string): DsShellAttrs {
	return {
		"data-ds-shell": name,
		"data-ds-tier": "3",
		"data-ds-source": "web-shell",
	};
}
