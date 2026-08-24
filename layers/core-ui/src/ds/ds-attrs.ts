/**
 * K2 markers. `dsProps` for Tier 0+1+2 components.
 *
 * @lore K2: tier values are STRINGS ("0", "1", "2", "3") — DOM attributes are always strings.
 * @lore W2: Tier 0 added for foundation primitives (Avatar, Button, Input, etc.). These are
 * the lowest-level Hearth atoms that Tier 1+ components consume. Using "0" is not possible
 * with the old DsTier type ("1"|"2") — extended here. dsProps accepts "0" for W2 primitives.
 * @lore AU43 bundle-03: DsTier, DsSource, DsShellAttrs, dsShellProps deleted — type aliases were
 * compile-time only (no runtime consumers); dsShellProps only caller was ThreadShell (now inlined).
 */

export interface DsAttrs {
	"data-ds-component": string;
	"data-ds-tier": "0" | "1" | "2" | "3";
	"data-ds-source": "design-system" | "web-shell";
}

/**
 * Tier 0+1+2 marker. Spread on outermost JSX element.
 *
 * @lore K2: Tier 3 shells previously used `dsShellProps` (now deleted); they inline the
 * three attrs directly: data-ds-shell, data-ds-tier="3", data-ds-source="web-shell".
 * @lore W2: Tier 0 is for foundation primitives (Avatar, Button, Input, etc.).
 */
export function dsProps(name: string, tier: "0" | "1" | "2"): DsAttrs {
	return {
		"data-ds-component": name,
		"data-ds-tier": tier,
		"data-ds-source": "design-system",
	};
}
