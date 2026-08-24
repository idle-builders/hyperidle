import { AGENT_ROLE_CATALOG, defaultRoster } from "@hyperidle/domain-model";
import type { AgentScaffoldSpec } from "./scaffold-agents.js";
import { readSystemPromptTemplateForRole } from "./system-prompt-templates.js";

/**
 * @lore AU44 AU20-fd: moved from `framework/factory-defaults/src/agent-scaffold.ts`
 * into `@hyperidle/org` — the owning service that calls `persistScaffoldedAgents`.
 * `AgentScaffoldSpec` is now declared once (in `scaffold-agents.ts`); the duplicate
 * in `framework/factory-defaults` is deleted. `AgentScaffoldRequest` was not
 * barrel-exported from factory-defaults (zero external importers) so it is not
 * exported here either — it is inline to this module.
 *
 * The scaffold-request seam is widened: instead of agent-orchestration calling
 * `resolveAgentScaffoldSpecs` then `persistScaffoldedAgents`, orchestration now
 * passes a scaffold request through `POST /org/scaffold-request`; core-api
 * resolves internally. This is the only direction that keeps resolution in the
 * owning service.
 */

interface AgentScaffoldRequest {
	readonly trigger: "team_scaffold" | "agent_added" | "user_assistant";
	readonly teamName: string | null;
	readonly functions: readonly string[] | null;
	readonly role: string | null;
	readonly name: string | null;
	readonly ownerUserId: string | null;
	readonly ownerUserName: string | null;
}

const APP_ASSISTANT_SYSTEM_PROMPT =
	"You are a helpful AI assistant. Be concise, direct, and thoughtful in your responses.";

/**
 * Resolve the agent scaffold specs for one of the three known triggers.
 * Pure — no DB access; the only I/O is the sandboxed
 * `readSystemPromptTemplateForRole` filesystem read (path-traversal-closed
 * by construction).
 */
export function resolveAgentScaffoldSpecs(
	request: AgentScaffoldRequest,
): readonly AgentScaffoldSpec[] {
	switch (request.trigger) {
		case "team_scaffold": {
			const specs: AgentScaffoldSpec[] = [];
			for (const role of defaultRoster(request.functions ?? [])) {
				const entry = AGENT_ROLE_CATALOG.find((candidate) => candidate.role === role);
				specs.push({
					role,
					name: `${request.teamName ?? "Team"} ${entry?.label ?? role}`,
					agentCategory: entry?.category ?? "team",
					systemPrompt: entry?.hasTemplate ? readSystemPromptTemplateForRole(role) : null,
				});
			}
			return specs;
		}
		case "agent_added": {
			if (request.role === null) throw new Error("agent_added trigger requires a role");
			const entry = AGENT_ROLE_CATALOG.find((candidate) => candidate.role === request.role);
			return [
				{
					role: request.role,
					name: request.name ?? `${request.teamName ?? "Agent"} ${request.role}`,
					agentCategory: entry?.category ?? "team",
					systemPrompt: entry?.hasTemplate ? readSystemPromptTemplateForRole(request.role) : null,
				},
			];
		}
		case "user_assistant":
			return [
				{
					role: "assistant",
					name: request.ownerUserName ? `${request.ownerUserName}'s Assistant` : "Assistant",
					agentCategory: "individual",
					systemPrompt: APP_ASSISTANT_SYSTEM_PROMPT,
					idHint: request.ownerUserId ? `ast-${request.ownerUserId}` : undefined,
				},
			];
	}
}
