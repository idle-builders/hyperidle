/**
 * The declared action list — six modules, eighteen names, from
 * search_tasks / open_task / edit_task to search_users / open_user /
 * edit_user — is projected onto every door: mounted on HTTP, registered on
 * MCP, reachable from the UI. This rule is the mechanical proof, over the
 * census plus a handful of scans this file owns (route registrations, tool
 * literals, the event-bus vocabulary).
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

/**
 * Every declared action's name, scanned from its declaration rather than
 * hand-typed — clauses 2–4 all derive their populations from the tree, and a
 * hardcoded list here would be the one clause that cannot go red while
 * empty (B8): a fourth action added later and never wired to the UI would
 * leave this loop iterating nothing, and a rename would leave a stale name
 * clause 1 reports as unreachable for the wrong reason.
 */
const ACTION_DECLARATIONS_DIR = "framework/domain-model/src/actions/";
const ACTION_NAME_LINE = /\bname:\s*["']([a-z][a-z0-9_]*)["']/g;

function scanDeclaredActionNames(
	census: Census,
	readFile: (path: string) => string,
): readonly string[] {
	const files = census.files.filter(
		(f) =>
			f.kind === "production" &&
			f.path.startsWith(ACTION_DECLARATIONS_DIR) &&
			/\.tsx?$/.test(f.path) &&
			!f.path.endsWith(".d.ts"),
	);
	const names = new Set<string>();
	for (const f of files) {
		let source: string;
		try {
			source = readFile(f.path);
		} catch (error) {
			if (error instanceof Error && error.message.includes("ENOENT")) continue;
			throw error;
		}
		for (const match of source.matchAll(ACTION_NAME_LINE)) {
			if (match[1]) names.add(match[1]);
		}
	}
	if (names.size === 0) {
		throw new Error(
			`actions-projected: found zero declared action names under ${ACTION_DECLARATIONS_DIR} — the directory moved, or every action declaration lost its "name:" property.`,
		);
	}
	return [...names];
}

/**
 * The twenty-six registrations that realise the twenty-six plumbing doors —
 * internal seams, auth, health. A route, never an action.
 *
 * @lore `GET /sessions/:sessionId` (a live core-api caller,
 * `port.sessions.getById`) and `POST /runs/stop-for-tasks` (a live core-api
 * caller, `task-actions.ts`'s kill path) moved here from `LEGACY_ROUTES` —
 * both are `AgentOrchestrationPort` seams with a real caller left, which is
 * what this list means; neither is an action, since core may not call an
 * orchestration action.
 *
 * @lore BC5 §6 (T4): `folders`/`connections` added seven new rows for eight
 * new doors — `folders.give` reuses the existing
 * `POST .../filesystems/:id/injections/persist` row under a second
 * capability name, one row realising two doors, same idiom the two moved
 * rows above already established.
 */
const PLUMBING_ROUTES: readonly string[] = [
	"layers/core-api/src/routes/auth.ts|POST /ws-token",
	"layers/core-api/src/routes/auth.ts|POST /worker-token",
	"layers/core-api/src/app.ts|GET /health",
	"layers/core-api/src/routes/health.ts|GET /health",
	"layers/core-api/src/routes/health.ts|GET /auth",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /intents",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /review-links",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /review-verdicts",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /runs/end-for-handoff",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|GET /run-config/:agentId",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /run-config/batch",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|PATCH /run-config/:agentId",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|GET /filesystems/:id/team",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /filesystems/:id/injections/persist",
	"layers/agent-execution/harness-registry/src/mcp/mcp-route.ts|POST /mcp/:token/return-status",
	"layers/agent-orchestration/src/routes/agent-orchestration-sessions.ts|GET /sessions/:sessionId",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /runs/stop-for-tasks",
	// `folders`/`connections` cross the port the way `runConfig`
	// already does. `folders.give` is `POST .../filesystems/:id/injections/persist`
	// above under a second capability name — no new row for it.
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /folders/list",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /folders",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /folders/:id/remove",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /folders/:id/take",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|GET /connections/:userId",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /connections/:userId",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /connections/:userId/:id/remove",
	"layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|POST /connections/:userId/:id/withhold",
	// @lore BC5 T11 (architecture.md §0.1 clause 3): `SetupFlow.tsx` needs
	// folder detail (git repo? which branch?) BEFORE a folder exists to
	// register — a plumbing lookup, not an action. Moved from LEGACY_ROUTES.
	"layers/agent-orchestration/src/routes/filesystems.ts|POST /inspect-path",
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

/** The six platform events — extension surface, never an object door. */
const PLATFORM_EVENTS: readonly string[] = [
	"agent_run_admission_failed",
	"agent_run_lifecycle_changed",
	"sandbox_writeback_changes_detected",
	"tool_call_recorded",
	"propagation_applied",
	"propagation_failed",
];

/**
 * Every route registered in a production file that is neither a declared
 * action route nor one of the eighteen plumbing doors. Re-derived after the
 * unreachable-route deletion on main removed fourteen of the 107 entries
 * this rule started with, `coach.ts`/`hints.ts` wholesale among them, so
 * those rows shrank ahead of this item. Only shrinks: an entry whose route is gone is a
 * finding, so the deletion and the row land in the same PR. Includes the
 * three remaining socket/protocol transports (mcp-route, worker-ingress,
 * ws) — each is a socket/protocol handshake, not a request/response route,
 * so it stays a shrink-list entry rather than becoming plumbing or an
 * action today. `session-stream-ws`'s
 * own row left with the file: the second websocket is deleted, and
 * `session:<id>` now rides the `ws` row already on this list.
 */
const LEGACY_ROUTES: readonly string[] = [
	"layers/agent-execution/harness-registry/src/mcp/mcp-route.ts|ALL /mcp/:token",
	"layers/agent-orchestration/run-orchestration/src/worker-ingress.ts|GET /ws/worker",
	"layers/core-api/src/routes/search.ts|GET /",
	"layers/core-api/src/routes/ws.ts|GET /ws",
];

/**
 * Every tool name declared in a production `ToolDefinition` literal that is
 * not an action. Re-derived after the attention-engine deletion on main
 * removed `run_knowledge_sweep`/`score_attention` with it, so
 * those two entries shrank ahead of this item.
 *
 * @lore BC5 T11: `add_agent`/`create_team` — the last two hand-written tools
 * `tool-definitions.ts` carried — are gone with the `org` package they
 * scaffolded through; only `return_status` (the tool twin of the
 * `POST /mcp/:token/return-status` plumbing route — never an object action)
 * is left in the hand-written catalog.
 */
const LEGACY_TOOLS: readonly string[] = ["return_status"];

/**
 * Every `EVENT_TYPES` member that is neither one of the nine object events
 * nor one of the seven platform events. Re-derived after the dead-event
 * deletion on main removed five of these entirely (`thread_archived`,
 * `dependency_met`, `knowledge_accessed`, `work_selection_requested`,
 * `routine_fired`), so they shrank ahead of this item.
 *
 * @lore BC5 T7b: `task_state_changed`, `thread_created`,
 * `thread_message_appended`, `thread_resolved`, `thread_reopened` and
 * `notification` are gone from `EVENT_TYPES` itself now — their last
 * listener is gone; the nine object events carry the same change. Six rows
 * shrank ahead of this comment for the same reason the five before them did.
 *
 * @lore BC5 T11: `team_created`/`agent_added`/`user_created` are gone from
 * `EVENT_TYPES` too — their emitters were the `org`/`teams-routes`/`users`
 * routes, all deleted; `user.created`/`user.changed` (the object events)
 * carry the same change now. `session_*` stay (D-e3zm2j) — the plumbing by
 * which a run reports back to its task.
 */
const LEGACY_EVENTS: readonly string[] = [
	"session_started",
	"session_ended",
	"session_not_returned",
];

/**
 * Actions declared in `framework/domain-model/src/actions/` that are not yet
 * wired to a `call(...)` or `useAction(...)` site in the UI (core-ui is a static preview in the
 * design-restart branch; wiring to live data happens screen by screen in
 * subsequent commits). Only shrinks: once an action gains a UI call site,
 * its entry must be removed in the same PR. A wired action left here is a finding.
 */
const UNIMPLEMENTED_UI_ACTIONS: readonly string[] = ["edit_plugin", "stop_session"];

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
 * Every `name: "<snake_case>"` property with an `inputSchema` in the same object
 * literal, within ten lines — i.e. every hand-written `ToolDefinition` literal.
 */
const TOOL_NAME_LINE = /\bname:\s*["']([a-z][a-z0-9_]*)["']/;
const INPUT_SCHEMA_LINE = /\binputSchema\b/;

/** The text up to where the enclosing object literal closes. */
function sameObjectLiteral(text: string): string {
	let depth = 0;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === "{") depth++;
		else if (ch === "}" && --depth < 0) return text.slice(0, i);
	}
	return text;
}

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
			const line = lines[i] ?? "";
			const rest = [
				line.slice((nameMatch.index ?? 0) + nameMatch[0].length),
				...lines.slice(i + 1, i + 11),
			].join("\n");
			if (INPUT_SCHEMA_LINE.test(sameObjectLiteral(rest))) {
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
	// `[a-z_.]+` — widened for the nine dotted object-event names: a plain
	// `[a-z_]+` stops at the dot and reports "task" instead of "task.created",
	// which OBJECT_EVENTS never matches.
	return [...block[1].matchAll(/["'`]([a-z_.]+)["'`]/g)].map((m) => m[1] ?? "");
}

/** A `call("<name>"` or `useAction("<name>"` reference — the UI's two ways of reaching an action. */
function buildCallSiteMatcher(name: string): RegExp {
	return new RegExp(`(?:\\bcall|\\buseAction)\\(\\s*["'\`]${name}["'\`]`);
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
			const declaredActionNames = scanDeclaredActionNames(census, readFile);

			// -- clause 1: every action name is reachable from the UI ------------
			const uiFiles = census.files.filter(
				(f) =>
					f.kind === "production" &&
					f.path.startsWith("layers/core-ui/src/") &&
					/\.tsx?$/.test(f.path),
			);
			const unimplementedUiSet = new Set(UNIMPLEMENTED_UI_ACTIONS);
			for (const name of UNIMPLEMENTED_UI_ACTIONS) {
				if (!declaredActionNames.includes(name)) {
					findings.push({
						ruleId: "actions-projected",
						severity: "error",
						message: `UNIMPLEMENTED_UI_ACTIONS entry "${name}" is no longer a declared action — delete the entry in the same PR that removed the action`,
						world: "production",
					});
				}
			}
			for (const name of declaredActionNames) {
				const matcher = buildCallSiteMatcher(name);
				const reachable = uiFiles.some((f) => {
					try {
						return matcher.test(readFile(f.path));
					} catch (error) {
						if (error instanceof Error && error.message.includes("ENOENT")) return false;
						throw error;
					}
				});
				if (reachable && unimplementedUiSet.has(name)) {
					findings.push({
						ruleId: "actions-projected",
						severity: "error",
						message: `action "${name}" is now reachable from the UI — remove it from UNIMPLEMENTED_UI_ACTIONS in actions-projected.ts`,
						world: "production",
					});
				} else if (!(reachable || unimplementedUiSet.has(name))) {
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
			const declaredActionSet = new Set(declaredActionNames);
			for (const [name, path] of toolFound) {
				if (declaredActionSet.has(name) || legacyToolSet.has(name)) continue;
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
