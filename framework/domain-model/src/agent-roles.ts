export { AGENT_CATEGORIES, type AgentCategory } from "./types.js";

/**
 * AB0: catalog entry for a known agent role.
 */
/**
 * @lore BA9g: `AGENT_ROLE_CATALOG` is DELETED — 17 hardcoded roles the product
 * had opinions about, offered by the picker whether or not any agent had them,
 * while a role a plugin or a person introduced was never offered back. Founder
 * ruling: "the roles catalog shouldn't be hardcoded, but based of what really
 * exists, a plugin or user should be able to introduce a new role with a new
 * agent. but also reuse an existing role during agent creation."
 *
 * A role is a string on an agent. The roles in use are the distinct roles among
 * the agents you can see, which is what the picker offers; typing a new one
 * introduces it. `roleLabel` derives a display name from the string, so nothing
 * needs a registry to render.
 *
 * `communityForRole` went with it. It mapped 16 roles onto four communities to
 * rank which practice knowledge a session loads — but nothing ever scoped
 * knowledge to a community name: the demo world scopes it by ROLE (`builder`,
 * `qa_engineer`, `growth`), so the exact-community branch never fired and the
 * fuzzy role-substring branch did all the work. The practice is the role.
 */

/**
 * Map a role id to a human-readable display label.
 *
 * - Catalog hit → entry.label (e.g. "product_manager" → "Product Manager").
 * - Unknown role → title-case the raw string, splitting on `_`, `-`, or whitespace
 *   (e.g. "growth_hacker" → "Growth Hacker"). Supports open-vocab user-defined roles.
 * - Empty/blank input → returns "" (caller handles fallback, e.g. scopeKindToLabel).
 *
 * Pure function, no side effects.
 *
 * @lore AV3 A1: Used by resolveScopeName to display the role a practice-scoped
 * document belongs to. Supports open-vocab roles beyond the catalog.
 */
export function roleLabel(role: string): string {
	const trimmed = role.trim();
	if (!trimmed) return "";

	// Title-case: split on underscore, hyphen, or whitespace; capitalize each word.
	return trimmed
		.split(/[_\s-]+/)
		.filter((w) => w.length > 0)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

/**
 * @lore BA9g: `defaultRoster(functions)` is DELETED, and with it the idea that a
 * team comes with a set of roles. It mapped a team's declared functions through
 * this catalog and produced a Builder, a Product Manager, a QA Engineer on team
 * creation. Founder ruling: "the entire roster concept should be removed from
 * the core… a new team is just a single empty agent. and then you improve that
 * team with plugins." The roles themselves live in the `role-personas` plugin.
 *
 * Written when the catalog was expected to survive as vocabulary. It did not:
 * the same batch deleted `AGENT_ROLE_CATALOG`, `communityForRole`,
 * `teamFunctions` and `hasTemplate` outright (see the block above). A role is a
 * string on an agent; `roleLabel` derives a display name from it, and the
 * practice an agent belongs to is its role.
 */
