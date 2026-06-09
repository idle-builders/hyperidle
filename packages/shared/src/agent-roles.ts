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
	readonly teamFunctions: readonly string[];
	readonly hasTemplate: boolean;
}

/**
 * AB0: known team functions. Open vocabulary -- users can add custom functions.
 */
export const TEAM_FUNCTIONS = [
	"development",
	"product",
	"design",
	"marketing",
	"sales",
	"operations",
	"support",
	"research",
] as const;

export type TeamFunction = (typeof TEAM_FUNCTIONS)[number];

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
		teamFunctions: ["development"],
		hasTemplate: true,
	},
	{
		role: "designer",
		label: "Designer",
		category: "team",
		description: "Product designer. UX research, interaction design, visual design.",
		community: "product",
		teamFunctions: ["design"],
		hasTemplate: true,
	},
	{
		role: "product_manager",
		label: "Product Manager",
		category: "team",
		description: "Team lead. Shapes pitches, coordinates cycles, decomposes bets.",
		community: "product",
		teamFunctions: ["product"],
		hasTemplate: true,
	},
	{
		role: "qa_engineer",
		label: "QA Engineer",
		category: "team",
		description: "Quality assurance. Test plans, regression testing, bug triage.",
		community: "building",
		teamFunctions: ["development"],
		hasTemplate: true,
	},
	{
		role: "growth",
		label: "Growth",
		category: "team",
		description: "Marketer. Landing pages, content, email, SEO, analytics.",
		community: "growth",
		teamFunctions: ["marketing"],
		hasTemplate: true,
	},
	{
		role: "brand_voice",
		label: "Brand Voice",
		category: "team",
		description: "Brand guardian. Tone, messaging, style consistency.",
		community: "growth",
		teamFunctions: ["marketing"],
		hasTemplate: false,
	},
	{
		role: "ops",
		label: "Ops",
		category: "team",
		description: "SRE and operations. Deploys, monitors, handles incidents.",
		community: "ops",
		teamFunctions: ["operations"],
		hasTemplate: true,
	},
	{
		role: "support",
		label: "Support",
		category: "team",
		description: "Customer support. Ticket triage, knowledge base, escalation.",
		community: "ops",
		teamFunctions: ["support"],
		hasTemplate: false,
	},
	{
		role: "sales",
		label: "Sales",
		category: "team",
		description: "Sales specialist. Lead qualification, outreach, pipeline.",
		community: "growth",
		teamFunctions: ["sales"],
		hasTemplate: false,
	},
	{
		role: "content",
		label: "Content Writer",
		category: "team",
		description: "Content creation. Blog posts, documentation, social media.",
		community: "growth",
		teamFunctions: ["marketing"],
		hasTemplate: false,
	},
	{
		role: "data_analyst",
		label: "Data Analyst",
		category: "team",
		description: "Analytics and insights. Data pipelines, dashboards, reporting.",
		community: "product",
		teamFunctions: ["research"],
		hasTemplate: false,
	},
	// Strategy agents
	// @lore AD8c: renamed from practice_facilitator to facilitator. All existing
	// DB rows with role='practice_facilitator' must be migrated manually for production;
	// for pre-production the seed handles fresh databases. See architecture Risk 1.
	{
		role: "facilitator",
		label: "Facilitator",
		category: "strategy",
		description:
			"L3 facilitator. Runs practice meetings, synthesizes findings, monitors knowledge decay.",
		community: "ops",
		teamFunctions: [],
		hasTemplate: true,
	},
	{
		role: "scout",
		label: "Scout",
		category: "strategy",
		description: "Analyst. Finds and evaluates market opportunities.",
		community: "product",
		teamFunctions: [],
		hasTemplate: false,
	},
	{
		role: "infra",
		label: "Infra Agent",
		category: "strategy",
		description: "SRE. Maintains shared infrastructure.",
		community: "ops",
		teamFunctions: [],
		hasTemplate: false,
	},
	{
		role: "platform",
		label: "Platform Agent",
		category: "strategy",
		description: "DX engineer. Maintains shared tools, templates, CI/CD.",
		community: "building",
		teamFunctions: [],
		hasTemplate: false,
	},
	// Individual agents
	// @lore AD8a: label + category + description updated (personal → individual, display name → System Agent).
	// role string "chief_of_staff" stays — AD8b renames it to "assistant". // @lore AD8a
	// hasTemplate false because docs/souls/chief-of-staff.md is deleted in AD8a. // @lore AD8a
	// AD8b creates a new assistant.md soul and sets hasTemplate back to true.
	{
		role: "chief_of_staff",
		label: "System Agent",
		category: "individual",
		description: "Transitional system agent. AD8b replaces with per-user assistant.",
		community: "ops",
		teamFunctions: [],
		hasTemplate: false,
	},
];

/**
 * Lookup a role catalog entry by role string. Returns undefined for unknown roles.
 */
export function findRoleCatalogEntry(role: string): AgentRoleCatalogEntry | undefined {
	return AGENT_ROLE_CATALOG.find((entry) => entry.role === role);
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
 * Compute the default agent roster for a set of team functions.
 * Returns deduplicated role strings sorted alphabetically.
 */
export function defaultRoster(functions: readonly string[]): readonly string[] {
	const functionSet = new Set(functions);
	const roles = new Set<string>();
	for (const entry of AGENT_ROLE_CATALOG) {
		if (entry.category === "team" && entry.teamFunctions.some((f) => functionSet.has(f))) {
			roles.add(entry.role);
		}
	}
	return [...roles].sort();
}
