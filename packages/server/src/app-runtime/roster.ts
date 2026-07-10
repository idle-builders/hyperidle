/**
 * AK6 — app runtime: roster composition for scaffoldAgents.
 *
 * `composeRoster` maps the three server-side creation triggers to
 * `AgentScaffoldSpec[]`. App runtime reads `systemPrompt` from the
 * `factorySettings.system_template:<role>` rows that applyFactoryBootstrap
 * seeds, so creation surfaces do not hard-code personas.
 *
 * factory_bootstrap is NOT a trigger here (it runs at the leaf/desktop layer
 * with no registry — see Phase 3a, FactoryRosterSpec injection seam).
 *
 * @lore AK6: app-runtime `scaffoldAgents` is the preservation-critical path.
 * It must reproduce today's agents + personas UNCHANGED (AC4 golden). The
 * pre-AK6 route read `defaultRoster(functions)` → per role, read
 * `factorySettings.system_template:<role>`. This implementation faithfully
 * reproduces that selection.
 *
 * @lore AK6: BUILTIN_ASSISTANT_SYSTEM_PROMPT moved here from
 * packages/server/src/routes/users.ts and assistant.ts. The persona content
 * is now app-owned runtime data. The creation surfaces
 * no longer hard-code it.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { factorySettings } from "@hyperidle/db";
import { AGENT_ROLE_CATALOG, defaultRoster } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { AgentScaffoldSpec, ScaffoldRequest } from "./contracts.js";

/**
 * The app-owned assistant persona.
 * Moved here from packages/server/src/routes/users.ts and assistant.ts.
 * This prompt belongs to app-runtime composition, not route handlers.
 *
 * @lore AK6: R5 verification: runAssistantTurn reads the row's `systemPrompt`
 * value (not this const). Moving the const here keeps the persisted value
 * identical under the app runtime.
 */
export const APP_ASSISTANT_SYSTEM_PROMPT =
	"You are a helpful AI assistant. Be concise, direct, and thoughtful in your responses.";

/**
 * Read `factorySettings.system_template:<role>` for a given role.
 * Returns null if not found (graceful degradation — agents with no template
 * get systemPrompt: null, which is valid).
 */
async function readTemplate(db: HyperIdleDb, role: string): Promise<string | null> {
	const [row] = await db
		.select({ value: factorySettings.value })
		.from(factorySettings)
		.where(eq(factorySettings.key, `system_template:${role}`))
		.limit(1);
	return row?.value ?? null;
}

/**
 * Compose the agent roster for a creation trigger.
 *
 * Covers the 3 server-side creation surfaces only (factory_bootstrap is the
 * FactoryRosterSpec injection seam — handled separately).
 */
export async function composeRoster(
	db: HyperIdleDb,
	req: ScaffoldRequest,
): Promise<readonly AgentScaffoldSpec[]> {
	switch (req.trigger) {
		case "team_scaffold": {
			// Reproduce pre-AK6 behavior: defaultRoster(functions) → per role, template lookup.
			const roles = defaultRoster(req.functions ?? []);
			const specs: AgentScaffoldSpec[] = [];
			for (const role of roles) {
				const catalogEntry = AGENT_ROLE_CATALOG.find((e) => e.role === role);
				const label = catalogEntry?.label ?? role;
				const hasTemplate = catalogEntry?.hasTemplate ?? false;
				const agentCategory = catalogEntry?.category ?? "team";
				const systemPrompt = hasTemplate ? await readTemplate(db, role) : null;

				specs.push({
					role,
					name: `${req.teamName ?? "Team"} ${label}`,
					agentCategory,
					systemPrompt,
				});
			}
			return specs;
		}
		case "agent_added": {
			if (req.role === null) {
				throw new Error("agent_added trigger requires a role");
			}
			const catalogEntry = AGENT_ROLE_CATALOG.find((e) => e.role === req.role);
			const agentCategory = catalogEntry?.category ?? "team";
			const systemPrompt = catalogEntry?.hasTemplate ? await readTemplate(db, req.role) : null;
			// Pass caller-supplied name through; synthesize only when null.
			const name = req.name ?? `${req.teamName ?? "Agent"} ${req.role}`;
			return [
				{
					role: req.role,
					name,
					agentCategory,
					systemPrompt,
				},
			];
		}
		case "user_assistant": {
			return [
				{
					role: "assistant",
					name: req.ownerUserName ? `${req.ownerUserName}'s Assistant` : "Assistant",
					agentCategory: "individual",
					// App runtime supplies the builtin assistant persona.
					systemPrompt: APP_ASSISTANT_SYSTEM_PROMPT,
					idHint: req.ownerUserId ? `ast-${req.ownerUserId}` : undefined,
				},
			];
		}
	}
}
