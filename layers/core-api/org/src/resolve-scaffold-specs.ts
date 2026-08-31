import type { AgentScaffoldSpec } from "./scaffold-agents.js";

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
	// @lore BA9g: `systemPrompt` is always null here now. It used to be the role's
	// template, read off `docs/system-prompts/*.md` at scaffold time. Those files
	// moved into the `role-personas` plugin: HyperIdle ships a single agent with a
	// bare AGENTS.md, and a builder, a designer, a PM are things a plugin brings
	// rather than opinions the product holds. A scaffolded agent starts with no
	// identity; install a plugin, or write one.
	switch (request.trigger) {
		case "team_scaffold":
			// One agent. A team used to arrive with a roster — Builder, Product
			// Manager, QA Engineer — derived from its declared functions. Founder
			// ruling: "a new team is just a single empty agent. and then you improve
			// that team with plugins."
			return [
				{
					role: "agent",
					name: `${request.teamName ?? "Team"} Agent`,
					agentCategory: "team",
					systemPrompt: null,
				},
			];
		case "agent_added": {
			if (request.role === null) throw new Error("agent_added trigger requires a role");
			return [
				{
					role: request.role,
					name: request.name ?? `${request.teamName ?? "Agent"} ${request.role}`,
					// @lore BA9g: the category used to come off the role catalog. A role
					// is a string now; an agent added to a team is a team agent.
					agentCategory: "team",
					systemPrompt: null,
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
					ownerUserId: request.ownerUserId ?? undefined,
				},
			];
	}
}
