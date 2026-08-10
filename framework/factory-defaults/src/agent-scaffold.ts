import type { UserRole } from "@hyperidle/domain-model";
import { AGENT_ROLE_CATALOG, defaultRoster } from "@hyperidle/domain-model";
import { readSystemPromptTemplateForRole } from "./system-prompt-templates.js";

/**
 * AU21 §6 Decision F1 fold — `agent-selection`'s `resolveScaffoldSpecs` /
 * `scaffoldSpecs` traced to be PURE (never reads its own injected
 * `AgentSelectionDeps`, never reads the old `ScaffoldRequest.db`/`teamId`/
 * `teamMembersId`). Per the founder's own framing ("not sure how much this
 * is selection but it seems this is similar to the task trigger — its a
 * very simple configuration part. Not sure if that's a service but if so
 * its a light one"): it is not a Service capability at all, just a plain
 * function.
 *
 * @lore AU29: moved from `framework/db/src/agent-scaffold.ts` into
 * `framework/factory-defaults`. It folded into `@hyperidle/db` originally because that
 * package already owned `system-prompt-templates.ts` and already depended on
 * `@hyperidle/factory-defaults` — but this function touches no database (no SQL, no
 * schema, no connection), which is exactly the `db:util` ANOMALY
 * `tools/governance/architecture.json` flagged since AU28. Now that
 * `system-prompt-templates.ts` has moved to `framework/factory-defaults` too (same
 * commit), this function's only import moves with it and both land in the
 * package that actually describes them: pure string/config substrate.
 *
 * The unused `db`/`teamId`/`teamMembersId` fields are dropped from this
 * request shape — a genuine simplification (the old function never read
 * them), not a behavior change.
 */
export interface AgentScaffoldRequest {
	readonly trigger: "team_scaffold" | "agent_added" | "user_assistant";
	readonly teamName: string | null;
	readonly functions: readonly string[] | null;
	readonly role: UserRole | null;
	readonly name: string | null;
	readonly ownerUserId: string | null;
	readonly ownerUserName: string | null;
}

export interface AgentScaffoldSpec {
	readonly role: UserRole;
	readonly name: string;
	readonly agentCategory: "team" | "strategy" | "individual";
	readonly systemPrompt: string | null;
	readonly idHint?: string;
}

const APP_ASSISTANT_SYSTEM_PROMPT =
	"You are a helpful AI assistant. Be concise, direct, and thoughtful in your responses.";

/**
 * Resolve the agent scaffold specs for one of the three known triggers.
 * Pure — no DB access, no injected deps; the only I/O is the sandboxed
 * `readSystemPromptTemplateForRole` filesystem read (path-traversal-closed
 * by construction, see that function's own doc comment).
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
