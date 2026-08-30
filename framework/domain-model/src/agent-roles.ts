import type { AgentCategory } from "./types.js";

export { AGENT_CATEGORIES, type AgentCategory } from "./types.js";

/**
 * AB0: catalog entry for a known agent role.
 */
export interface AgentRoleCatalogEntry {
	readonly role: string;
	readonly label: string;
	readonly category: AgentCategory;
	readonly description: string;
	readonly community: string;
}

/**
 * AB0: The canonical catalog of known agent roles. Open vocabulary --
 * agents can have roles not in this catalog (they get base tools and
 * no template). The catalog provides metadata for known roles.
 *
 * @lore AB0: This replaces USER_ROLES, KERNEL_USER_ROLES, and
 * FABRIC_USER_ROLES. The old kernel/fabric split was about system layer,
 * not agent category. The new category system (team/strategy/individual)
 * is the structural distinction.
 */
export const AGENT_ROLE_CATALOG: readonly AgentRoleCatalogEntry[] = [
	// Team agents
	{
		role: "builder",
		label: "Builder",
		category: "team",
		description: "Engineer. Implements features, writes code, tests, deploys.",
		community: "building",
	},
	{
		role: "designer",
		label: "Designer",
		category: "team",
		description: "Product designer. UX research, interaction design, visual design.",
		community: "product",
	},
	{
		role: "product_manager",
		label: "Product Manager",
		category: "team",
		description: "Team lead. Shapes pitches, coordinates cycles, decomposes bets.",
		community: "product",
	},
	{
		role: "qa_engineer",
		label: "QA Engineer",
		category: "team",
		description: "Quality assurance. Test plans, regression testing, bug triage.",
		community: "building",
	},
	{
		role: "growth",
		label: "Growth",
		category: "team",
		description: "Marketer. Landing pages, content, email, SEO, analytics.",
		community: "growth",
	},
	{
		role: "brand_voice",
		label: "Brand Voice",
		category: "team",
		description: "Brand guardian. Tone, messaging, style consistency.",
		community: "growth",
	},
	{
		role: "ops",
		label: "Ops",
		category: "team",
		description: "SRE and operations. Deploys, monitors, handles incidents.",
		community: "ops",
	},
	{
		role: "support",
		label: "Support",
		category: "team",
		description: "Customer support. Ticket triage, knowledge base, escalation.",
		community: "ops",
	},
	{
		role: "sales",
		label: "Sales",
		category: "team",
		description: "Sales specialist. Lead qualification, outreach, pipeline.",
		community: "growth",
	},
	{
		role: "content",
		label: "Content Writer",
		category: "team",
		description: "Content creation. Blog posts, documentation, social media.",
		community: "growth",
	},
	{
		role: "data_analyst",
		label: "Data Analyst",
		category: "team",
		description: "Analytics and insights. Data pipelines, dashboards, reporting.",
		community: "product",
	},
	// Factory-wide / cross-team agents
	// @lore AD8c: renamed from practice_facilitator to facilitator. All existing
	// DB rows with role='practice_facilitator' must be migrated manually for production;
	// for pre-production the seed handles fresh databases. See architecture Risk 1.
	// @lore BA9d: category changed from "strategy" (removed) to "individual". These
	// roles are factory-wide and not bound to one team; "individual" is the correct
	// category for non-team agents.
	{
		role: "facilitator",
		label: "Facilitator",
		category: "individual",
		description:
			"L3 facilitator. Runs practice meetings, synthesizes findings, monitors knowledge decay.",
		community: "ops",
	},
	{
		role: "scout",
		label: "Scout",
		category: "individual",
		description: "Analyst. Finds and evaluates market opportunities.",
		community: "product",
	},
	{
		role: "infra",
		label: "Infra Agent",
		category: "individual",
		description: "SRE. Maintains shared infrastructure.",
		community: "ops",
	},
	{
		role: "platform",
		label: "Platform Agent",
		category: "individual",
		description: "DX engineer. Maintains shared tools, templates, CI/CD.",
		community: "building",
	},
	// @lore BA9g: the role a new team's one agent carries. A team used to arrive
	// with a roster of jobs — Builder, Product Manager, QA Engineer — decided by
	// this catalog. It arrives with one agent now, and what that agent becomes is
	// yours to write or a plugin's to bring. This entry exists so it renders as
	// "Agent" rather than a raw string; it describes no job.
	{
		role: "agent",
		label: "Agent",
		category: "team",
		description: "A teammate. What it does is yours to define.",
		community: "ops",
	},
	// Individual agents
	// @lore AD8b: "chief_of_staff" role renamed to "assistant". Per-user personal assistant
	// with guardrails. One per human user, created at registration.
	{
		role: "assistant",
		label: "Assistant",
		category: "individual",
		description: "Per-user personal assistant. Acts on the user's behalf with guardrails.",
		community: "ops",
	},
];

/**
 * Lookup a role catalog entry by role string. Returns undefined for unknown roles.
 */
export function findRoleCatalogEntry(role: string): AgentRoleCatalogEntry | undefined {
	return AGENT_ROLE_CATALOG.find((entry) => entry.role === role);
}

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
 * knowledge item belongs to. Supports open-vocab roles beyond the catalog.
 */
export function roleLabel(role: string): string {
	const trimmed = role.trim();
	if (!trimmed) return "";

	const entry = findRoleCatalogEntry(trimmed);
	if (entry) return entry.label;

	// Title-case: split on underscore, hyphen, or whitespace; capitalize each word.
	return trimmed
		.split(/[_\s-]+/)
		.filter((w) => w.length > 0)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

/**
 * Get the practice community for a role. Falls back to "ops" for unknown roles.
 *
 * @lore AB0: Replaces the old ROLE_TO_COMMUNITY Record<UserRole, string>.
 * The old record required exhaustive keys matching the closed UserRole union.
 * This function works with open role strings via catalog lookup + fallback.
 */
export function communityForRole(role: string): string {
	const entry = findRoleCatalogEntry(role);
	return entry?.community ?? "ops";
}

/**
 * @lore BA9g: `defaultRoster(functions)` is DELETED, and with it the idea that a
 * team comes with a set of roles. It mapped a team's declared functions through
 * this catalog and produced a Builder, a Product Manager, a QA Engineer on team
 * creation. Founder ruling: "the entire roster concept should be removed from
 * the core… a new team is just a single empty agent. and then you improve that
 * team with plugins." The roles themselves live in the `role-personas` plugin.
 *
 * The catalog stays, as VOCABULARY: a plugin agent declares `role: "builder"`,
 * `roleLabel` renders it, and `communityForRole` scopes which knowledge a
 * session loads. What went with the roster is `teamFunctions` (which only
 * `defaultRoster` read) and `hasTemplate` (dead since the personas moved).
 */
