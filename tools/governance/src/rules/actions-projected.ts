/**
 * The task action list — search_tasks / open_task / edit_task — is
 * projected onto every door: mounted on HTTP, registered on MCP, reachable
 * from the UI. This rule is the mechanical proof, over the census plus a
 * handful of scans this file owns (route registrations, tool literals, the
 * event-bus vocabulary).
 *
 * `src/` is the engine's own source and grows by design — `no-per-file-
 * allowances`'s closed set is scoped to `tools/governance/`'s own root, not
 * here. This module therefore carries its own data as constants rather than
 * a registry file, per `tools/governance/README.md`.
 *
 * Three constants are vocabulary that does not shrink (PLUMBING_ROUTES,
 * OBJECT_EVENTS, PLATFORM_EVENTS). Three are shrink lists — a census of what
 * exists that is not yet an action: LEGACY_ROUTES, LEGACY_TOOLS,
 * LEGACY_EVENTS. An entry whose subject is gone is itself a finding, so the
 * deletion and the list edit land in the same PR that clears it.
 */

import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census } from "../lib/repo-census.js";

export interface ActionsProjectedInput {
	readonly readFile: (path: string) => string;
}

/** The task action list, as declared in `@hyperidle/domain-model`. */
const TASK_ACTION_NAMES: readonly string[] = ["search_tasks", "open_task", "edit_task"];

/**
 * The seventeen registrations that realise the sixteen plumbing doors —
 * internal seams, auth, health. A route, never an action.
 */
const PLUMBING_ROUTES: readonly string[] = [
	"layers/core-api/src/routes/auth.ts|GET /me",
	"layers/core-api/src/routes/auth.ts|POST /ws-token",
	"layers/core-api/src/routes/auth.ts|POST /worker-token",
	"layers/core-api/src/app.ts|GET /health",
	"layers/core-api/src/routes/health.ts|GET /health",
	"layers/core-api/src/routes/health.ts|GET /auth",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /intents",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /review-verdicts",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|GET /requests/pending-intents",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /requests/explicit-starts/:startId/fail",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /runs/end-for-handoff",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|GET /run-config/:agentId",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /run-config/batch",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|PATCH /run-config/:agentId",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|GET /filesystems/:id/team",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /filesystems/:id/injections/persist",
	"layers/agent-execution/harness-registry/src/mcp/mcp-route.ts|POST /mcp/:token/return-status",
];

/** The nine object events — task/thread/document/user, edit-in/changed-out. */
const OBJECT_EVENTS: readonly string[] = [
	"task.created",
	"task.changed",
	"thread.created",
	"thread.message",
	"thread.changed",
	"document.created",
	"document.changed",
	"user.created",
	"user.changed",
];

/** The eight platform events — extension surface, never an object door. */
const PLATFORM_EVENTS: readonly string[] = [
	"agent_work_intent_recorded",
	"agent_run_admission_failed",
	"agent_run_lifecycle_changed",
	"session_handoff_completed",
	"sandbox_writeback_changes_detected",
	"tool_call_recorded",
	"propagation_applied",
	"propagation_failed",
];

/**
 * Every route registered in a production file at efa28dd59 that is neither
 * a task action route nor one of the sixteen plumbing doors. 107 entries.
 * Only shrinks: an entry whose route is gone is a finding, so the deletion
 * and the row land in the same PR. Includes the four socket/protocol
 * transports (mcp-route, worker-ingress, ws, session-stream-ws) and the two
 * "delete outright" routes (coach, hints) — see this rule's own doc comment
 * and the architecture doc §7 for why each stays a shrink-list entry rather
 * than becoming plumbing or an action today.
 */
const LEGACY_ROUTES: readonly string[] = [
	"layers/agent-execution/harness-registry/src/mcp/mcp-route.ts|ALL /mcp/:token",
	"layers/agent-orchestration/run-orchestration/src/worker-ingress.ts|GET /ws/worker",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /runs/abort",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /runs/stop-for-tasks",
	"layers/agent-orchestration/src/routes/agent-orchestration-sessions.ts|GET /sessions/:sessionId",
	"layers/agent-orchestration/src/routes/agent-orchestration-sessions.ts|GET /runs/active-counts",
	"layers/agent-orchestration/src/routes/agent-orchestration-sessions.ts|GET /runs/latest-outcomes",
	"layers/agent-orchestration/src/routes/agent-orchestration-sessions.ts|GET /runs",
	"layers/agent-orchestration/src/routes/connections.ts|GET /",
	"layers/agent-orchestration/src/routes/connections.ts|POST /",
	"layers/agent-orchestration/src/routes/connections.ts|DELETE /:id",
	"layers/agent-orchestration/src/routes/connections.ts|POST /:id/validate",
	"layers/agent-orchestration/src/routes/filesystems.ts|POST /",
	"layers/agent-orchestration/src/routes/filesystems.ts|POST /inspect-path",
	"layers/agent-orchestration/src/routes/filesystems.ts|GET /",
	"layers/agent-orchestration/src/routes/filesystems.ts|GET /:id",
	"layers/agent-orchestration/src/routes/filesystems.ts|DELETE /:id",
	"layers/agent-orchestration/src/routes/filesystems.ts|DELETE /:id/injections/:agentUserId",
	"layers/agent-orchestration/src/routes/session-stream-ws.ts|GET /agent-orchestration/ws",
	"layers/agent-orchestration/src/routes/sessions.ts|GET /",
	"layers/agent-orchestration/src/routes/sessions.ts|GET /:id/activity",
	"layers/core-api/src/routes/agents.ts|GET /:id/profile",
	"layers/core-api/src/routes/agents.ts|GET /",
	"layers/core-api/src/routes/agents.ts|POST /",
	"layers/core-api/src/routes/agents.ts|PATCH /:id",
	"layers/core-api/src/routes/agents.ts|DELETE /:id",
	"layers/core-api/src/routes/assistant.ts|GET /",
	"layers/core-api/src/routes/coach.ts|GET /",
	"layers/core-api/src/routes/conversations.ts|GET /items",
	"layers/core-api/src/routes/conversations.ts|GET /items/:id",
	"layers/core-api/src/routes/conversations.ts|PATCH /items/:id",
	"layers/core-api/src/routes/conversations.ts|POST /items",
	"layers/core-api/src/routes/credentials.ts|GET /",
	"layers/core-api/src/routes/credentials.ts|PUT /:name",
	"layers/core-api/src/routes/credentials.ts|DELETE /:name",
	"layers/core-api/src/routes/credentials.ts|POST /:name/validate",
	"layers/core-api/src/routes/filesystems.ts|POST /:id/injections",
	"layers/core-api/src/routes/harnesses.ts|GET /",
	"layers/core-api/src/routes/harnesses.ts|POST /redetect",
	"layers/core-api/src/routes/hints.ts|GET /",
	"layers/core-api/src/routes/hints.ts|POST /:hintId/dismiss",
	"layers/core-api/src/routes/knowledge.ts|GET /",
	"layers/core-api/src/routes/knowledge.ts|GET /triage-count",
	"layers/core-api/src/routes/knowledge.ts|GET /:id",
	"layers/core-api/src/routes/knowledge.ts|POST /",
	"layers/core-api/src/routes/knowledge.ts|PATCH /:id",
	"layers/core-api/src/routes/knowledge.ts|POST /:id/merge",
	"layers/core-api/src/routes/knowledge.ts|POST /:id/split",
	"layers/core-api/src/routes/knowledge.ts|POST /:id/archive",
	"layers/core-api/src/routes/knowledge.ts|GET /:id/conflicts",
	"layers/core-api/src/routes/knowledge.ts|POST /:id/conflicts",
	"layers/core-api/src/routes/knowledge.ts|POST /:id/promote",
	"layers/core-api/src/routes/knowledge.ts|PATCH /:id/attention-score",
	"layers/core-api/src/routes/knowledge.ts|POST /:id/recompute-attention",
	"layers/core-api/src/routes/knowledge.ts|POST /:id/graduate",
	"layers/core-api/src/routes/knowledge.ts|POST /sweep",
	"layers/core-api/src/routes/notifications-routes.ts|GET /config",
	"layers/core-api/src/routes/notifications-routes.ts|PATCH /config",
	"layers/core-api/src/routes/notifications-routes.ts|GET /inbox",
	"layers/core-api/src/routes/notifications-routes.ts|POST /seen",
	"layers/core-api/src/routes/notifications-routes.ts|POST /:id/read",
	"layers/core-api/src/routes/notifications-routes.ts|GET /mute",
	"layers/core-api/src/routes/notifications-routes.ts|PUT /mute/:key",
	"layers/core-api/src/routes/org.ts|GET /",
	"layers/core-api/src/routes/org.ts|PUT /edges",
	"layers/core-api/src/routes/org.ts|DELETE /edges/:id",
	"layers/core-api/src/routes/org.ts|GET /review-recipients",
	"layers/core-api/src/routes/org.ts|GET /teams/:teamId",
	"layers/core-api/src/routes/org.ts|GET /teams/:teamId/membership",
	"layers/core-api/src/routes/org.ts|GET /team-members/:teamMembersId",
	"layers/core-api/src/routes/org.ts|POST /teams",
	"layers/core-api/src/routes/org.ts|POST /scaffolded-agents",
	"layers/core-api/src/routes/org.ts|POST /scaffold-request",
	"layers/core-api/src/routes/plugins.ts|GET /",
	"layers/core-api/src/routes/plugins.ts|POST /",
	"layers/core-api/src/routes/plugins.ts|POST /:id/enable",
	"layers/core-api/src/routes/plugins.ts|POST /:id/disable",
	"layers/core-api/src/routes/plugins.ts|DELETE /:id",
	"layers/core-api/src/routes/plugins.ts|POST /:id/contributions/restore",
	"layers/core-api/src/routes/recipients.ts|GET /",
	"layers/core-api/src/routes/reviews.ts|GET /:reviewMessageId",
	"layers/core-api/src/routes/routines-routes.ts|GET /event-types",
	"layers/core-api/src/routes/routines-routes.ts|POST /",
	"layers/core-api/src/routes/routines-routes.ts|GET /",
	"layers/core-api/src/routes/routines-routes.ts|DELETE /:id",
	"layers/core-api/src/routes/routines-routes.ts|GET /:id",
	"layers/core-api/src/routes/routines-routes.ts|PATCH /:id",
	"layers/core-api/src/routes/routines-routes.ts|POST /:id/trigger",
	"layers/core-api/src/routes/search.ts|GET /",
	"layers/core-api/src/routes/settings-agent-behavior.ts|GET /config",
	"layers/core-api/src/routes/settings-agent-behavior.ts|PATCH /config/:id",
	"layers/core-api/src/routes/teams-routes.ts|GET /",
	"layers/core-api/src/routes/teams-routes.ts|POST /",
	"layers/core-api/src/routes/teams-routes.ts|PATCH /:teamId",
	"layers/core-api/src/routes/teams-routes.ts|GET /:teamId",
	"layers/core-api/src/routes/threads.ts|POST /direct",
	"layers/core-api/src/routes/threads.ts|GET /inbox",
	"layers/core-api/src/routes/threads.ts|PATCH /:id",
	"layers/core-api/src/routes/threads.ts|GET /",
	"layers/core-api/src/routes/threads.ts|GET /:id",
	"layers/core-api/src/routes/threads.ts|POST /",
	"layers/core-api/src/routes/threads.ts|POST /:id/messages",
	"layers/core-api/src/routes/users.ts|POST /",
	"layers/core-api/src/routes/users.ts|GET /",
	"layers/core-api/src/routes/users.ts|GET /:id",
	"layers/core-api/src/routes/users.ts|PATCH /:id",
	"layers/core-api/src/routes/ws.ts|GET /ws",
];

/**
 * Every tool name declared in a production `ToolDefinition` literal that is
 * not an action. 17: the sixteen left in `tool-definitions.ts` once
 * `create_task`/`edit_task`/`handoff_to`/`log_task` are deleted, plus
 * `return_status` (the tool twin of the `POST /mcp/:token/return-status`
 * plumbing route — never an object action).
 */
const LEGACY_TOOLS: readonly string[] = [
	"add_agent",
	"create_artifact",
	"create_conflict_review",
	"create_item",
	"create_routine",
	"create_team",
	"merge_knowledge",
	"promote_knowledge",
	"reply",
	"run_knowledge_sweep",
	"score_attention",
	"send_message",
	"split_knowledge",
	"submit_review",
	"update_routine",
	"write_memory",
	"return_status",
];

/**
 * Every `EVENT_TYPES` member that is neither one of the nine object events
 * nor one of the eight platform events. 21 — `EVENT_TYPES`' twenty-nine
 * names minus the eight platform events (`task_state_changed` is the
 * pre-action task-changed shape, still emitted from `edit_task` until BC5).
 */
const LEGACY_EVENTS: readonly string[] = [
	"task_state_changed",
	"session_started",
	"session_ended",
	"session_not_returned",
	"thread_created",
	"thread_message_appended",
	"thread_resolved",
	"thread_reopened",
	"thread_archived",
	"item_created",
	"dependency_met",
	"knowledge_created",
	"knowledge_updated",
	"knowledge_archived",
	"knowledge_accessed",
	"team_created",
	"agent_added",
	"user_created",
	"work_selection_requested",
	"notification",
	"routine_fired",
];

/** Path to the event-bus vocabulary this rule's clause 4 reads. */
const EVENT_TYPES_FILE = "framework/event-bus/src/events.ts";

function isProductionTsFile(f: { readonly kind: string; readonly path: string }): boolean {
	return f.kind === "production" && /\.tsx?$/.test(f.path) && !f.path.endsWith(".d.ts");
}

/**
 * Every `.<verb>(` call whose first string-literal argument starts with
 * `/`, across ALL production files — not a `routes/**` glob, and not
 * dependent on the receiver being named `router` (architecture doc §7
 * clause 2). The verb call and the literal may sit on different lines;
 * `\s*` between them (not `\s*?` on one line) covers that.
 */
const ROUTE_CALL = /\.(get|post|put|patch|delete|all)\(\s*["'](\/[^"']*)["']/g;

/** `path|VERB route` -> the file path, for locating a finding. */
function scanRouteRegistrations(
	files: readonly string[],
	readFile: (path: string) => string,
): ReadonlyMap<string, string> {
	const found = new Map<string, string>();
	for (const path of files) {
		let source: string;
		try {
			source = readFile(path);
		} catch (error) {
			if (error instanceof Error && error.message.includes("ENOENT")) continue;
			throw error;
		}
		for (const match of source.matchAll(ROUTE_CALL)) {
			const verb = match[1]?.toUpperCase();
			const route = match[2];
			if (!(verb && route)) continue;
			found.set(`${path}|${verb} ${route}`, path);
		}
	}
	return found;
}

/**
 * Every `name: "<snake_case>"` property in a production file within ten
 * lines of an `inputSchema:` property — i.e. every hand-written
 * `ToolDefinition` literal (architecture doc §7 clause 3).
 */
const TOOL_NAME_LINE = /\bname:\s*["']([a-z][a-z0-9_]*)["']/;
const INPUT_SCHEMA_LINE = /\binputSchema\b/;

function scanToolNames(
	files: readonly string[],
	readFile: (path: string) => string,
): ReadonlyMap<string, string> {
	const found = new Map<string, string>();
	for (const path of files) {
		let source: string;
		try {
			source = readFile(path);
		} catch (error) {
			if (error instanceof Error && error.message.includes("ENOENT")) continue;
			throw error;
		}
		const lines = source.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const nameMatch = lines[i]?.match(TOOL_NAME_LINE);
			if (!nameMatch?.[1]) continue;
			const window = lines.slice(i, Math.min(lines.length, i + 11)).join("\n");
			if (INPUT_SCHEMA_LINE.test(window)) {
				found.set(nameMatch[1], path);
			}
		}
	}
	return found;
}

/**
 * The compile-time-complete `EVENT_TYPES` array — parsed, not evaluated, so
 * this rule needs no runtime import of the event-bus package. A member not
 * listed here is a lint finding, never a silently missed emit site.
 */
function scanEventTypes(readFile: (path: string) => string): readonly string[] {
	const raw = readFile(EVENT_TYPES_FILE);
	const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
	const block = source.match(/export const EVENT_TYPES = \[([\s\S]*?)\] as const/);
	if (!block?.[1]) {
		throw new Error(
			`actions-projected: could not find EVENT_TYPES in ${EVENT_TYPES_FILE} — the file moved or its shape changed.`,
		);
	}
	return [...block[1].matchAll(/["'`]([a-z_]+)["'`]/g)].map((m) => m[1] ?? "");
}

/** A `call("<name>"` reference, the UI's one way of reaching an action. */
function buildCallSiteMatcher(name: string): RegExp {
	return new RegExp(`call\\(\\s*["'\`]${name}["'\`]`);
}

export function actionsProjected(input: ActionsProjectedInput): Rule {
	const { readFile } = input;

	const population = (census: Census): readonly string[] =>
		census.files.filter(isProductionTsFile).map((f) => f.path);

	return {
		id: "actions-projected",
		description:
			"every action is mounted, registered and UI-reachable; every route/tool/event is an action, plumbing, or a named legacy entry",
		scope: population,
		minScope: 1,
		evaluate: (census: Census): readonly Finding[] => {
			const findings: Finding[] = [];
			const productionFiles = population(census);

			// -- clause 1: every action name is reachable from the UI ------------
			const uiFiles = census.files.filter(
				(f) =>
					f.kind === "production" &&
					f.path.startsWith("layers/core-ui/src/") &&
					/\.tsx?$/.test(f.path),
			);
			for (const name of TASK_ACTION_NAMES) {
				const matcher = buildCallSiteMatcher(name);
				const reachable = uiFiles.some((f) => {
					try {
						return matcher.test(readFile(f.path));
					} catch (error) {
						if (error instanceof Error && error.message.includes("ENOENT")) return false;
						throw error;
					}
				});
				if (!reachable) {
					findings.push({
						ruleId: "actions-projected",
						severity: "error",
						message: `action "${name}" is not reachable from the UI — no call("${name}", …) site found under layers/core-ui/src/`,
						world: "production",
					});
				}
			}

			// -- clause 2: every route is an action, plumbing, or legacy ---------
			const routeFound = scanRouteRegistrations(productionFiles, readFile);
			const plumbingSet = new Set(PLUMBING_ROUTES);
			const legacyRouteSet = new Set(LEGACY_ROUTES);
			for (const [key, path] of routeFound) {
				if (plumbingSet.has(key) || legacyRouteSet.has(key)) continue;
				findings.push({
					ruleId: "actions-projected",
					severity: "error",
					message: `route "${key}" is not an action, a plumbing door, or a LEGACY_ROUTES entry — classify it in actions-projected.ts`,
					path,
					world: "production",
				});
			}
			for (const key of LEGACY_ROUTES) {
				if (!routeFound.has(key)) {
					findings.push({
						ruleId: "actions-projected",
						severity: "error",
						message: `LEGACY_ROUTES entry "${key}" no longer exists in the tree — delete the entry in the same PR that removed the route`,
						world: "production",
					});
				}
			}

			// -- clause 3: every tool is an action or legacy ----------------------
			const toolFound = scanToolNames(productionFiles, readFile);
			const legacyToolSet = new Set(LEGACY_TOOLS);
			const taskActionSet = new Set(TASK_ACTION_NAMES);
			for (const [name, path] of toolFound) {
				if (taskActionSet.has(name) || legacyToolSet.has(name)) continue;
				findings.push({
					ruleId: "actions-projected",
					severity: "error",
					message: `tool "${name}" is not an action or a LEGACY_TOOLS entry — classify it in actions-projected.ts`,
					path,
					world: "production",
				});
			}
			for (const name of LEGACY_TOOLS) {
				if (!toolFound.has(name)) {
					findings.push({
						ruleId: "actions-projected",
						severity: "error",
						message: `LEGACY_TOOLS entry "${name}" no longer exists in the tree — delete the entry in the same PR that removed the tool`,
						world: "production",
					});
				}
			}

			// -- clause 4: every event is classified -------------------------------
			const eventTypes = scanEventTypes(readFile);
			const objectEventSet = new Set(OBJECT_EVENTS);
			const platformEventSet = new Set(PLATFORM_EVENTS);
			const legacyEventSet = new Set(LEGACY_EVENTS);
			for (const type of eventTypes) {
				if (objectEventSet.has(type) || platformEventSet.has(type) || legacyEventSet.has(type)) {
					continue;
				}
				findings.push({
					ruleId: "actions-projected",
					severity: "error",
					message: `event type "${type}" is not classified as an object event, a platform event, or a LEGACY_EVENTS entry — classify it in actions-projected.ts`,
					path: EVENT_TYPES_FILE,
					world: "production",
				});
			}
			for (const type of LEGACY_EVENTS) {
				if (!eventTypes.includes(type)) {
					findings.push({
						ruleId: "actions-projected",
						severity: "error",
						message: `LEGACY_EVENTS entry "${type}" is no longer in EVENT_TYPES — delete the entry in the same PR that removed it`,
						path: EVENT_TYPES_FILE,
						world: "production",
					});
				}
			}

			return findings;
		},
	};
}
