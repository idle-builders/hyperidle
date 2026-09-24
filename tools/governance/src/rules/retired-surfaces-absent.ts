/**
 * Routes, tools and events that were retired from the platform must not return.
 *
 * The platform shed a set of HTTP routes, two agent tools and seven event types in one
 * deliberate pass. Each was either dead (no caller, no subscriber) or replaced by a simpler
 * mechanism. Every symbol here is a tombstone: if it reappears in production code the old
 * surface has come back and needs to be removed again.
 *
 * @lore this is a RULE, not a test. The acceptance criterion is a static property of the
 * production tree — "these identifiers are absent" — and `.claude/rules/testing.md` is explicit
 * that a test imports code and asserts on behaviour while a property of the source belongs in the
 * linter. Grepping the filesystem from a `*.test.ts` would be a lint rule wearing a test's name.
 *
 * @lore the banned list names SYMBOLS and EVENT STRINGS, never bare route-path words that survive
 * in legitimate contexts. Two routes were only partly removed: GET /conversations/items (the
 * collection endpoint) — POST, GET /:id and PATCH /:id all stayed, so banning the path string
 * would be a false positive; instead the dead seam symbol `findItemByReasoningMarker` on
 * CoreApiWorkPort is banned. Similarly for /hints — the symbol `createHintRoutes` is banned.
 * For /coach the symbol `createCoachRoutes` is banned. Wholly-deleted surfaces are represented by
 * the unique function or type name that only existed to serve that surface.
 *
 * @lore `bet_revised` and `bet_state_changed` are combined in one token: both event types were
 * already removed as TypeScript types before this pass; `bet_state_changed` survived as a live
 * string literal in a validator set, and the combined regex catches it while also guarding against
 * `bet_revised` reappearing as code (it currently only lives in comments, which are stripped).
 *
 * @lore scoped to the PRODUCTION world only. Development files (tests, stories, eval scenarios)
 * legitimately reference old names in fixture data, seeding helpers and scenario descriptors.
 * The strip-comments pass means historical @lore notes in surviving code do not trigger findings.
 */

import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census } from "../lib/repo-census.js";

export interface RetiredSurfacesAbsentInput {
	readonly readFile: (path: string) => string;
}

/**
 * Each entry names a symbol that only existed to serve a retired surface.
 * The `why` field explains which surface the symbol represents so future readers can trace it.
 */
const BANNED: readonly { readonly token: RegExp; readonly why: string }[] = [
	// ---- Routes: symbols that identify each deleted HTTP endpoint --------------------------------

	{
		// GET /threads/inbox — deleted; this seam method was its only backend door.
		token: /\blistInboxBySenderExclusion\b/,
		why: "GET /threads/inbox was retired — the inbox rollup surface is gone",
	},
	{
		// GET /conversations/items (collection endpoint) — deleted; POST, GET /:id and PATCH /:id
		// all stayed. Banning the path string would be a false positive on surviving routes.
		// The dead seam `CoreApiWorkPort.findItemByReasoningMarker` is the unique identifier.
		// It also existed in the attention service (deleted in the same pass).
		token: /\bfindItemByReasoningMarker\b/,
		why: "GET /conversations/items (collection) was retired — its seam symbol must not return",
	},
	{
		// PATCH /knowledge/:id/attention-score — deleted with the attention engine.
		token: /\battentionScoreSchema\b/,
		why: "PATCH /knowledge/:id/attention-score was retired with the attention engine",
	},
	{
		// POST /knowledge/:id/recompute-attention — deleted with the attention engine.
		token: /\brecomputeAttentionScoreForKnowledgeItem\b/,
		why: "POST /knowledge/:id/recompute-attention was retired with the attention engine",
	},
	{
		// POST /knowledge/sweep — deleted; its sole backend function was `runKnowledgeSweep`.
		// The tool `run_knowledge_sweep` is covered by makeRunKnowledgeSweepTool below.
		token: /\bmakeRunKnowledgeSweepTool\b/,
		why: "POST /knowledge/sweep and the run_knowledge_sweep tool were retired",
	},
	{
		// GET /knowledge/triage-count — deleted (founder ruled the triage badge goes with it).
		// `countKnowledgeItems` was the import alias that only this route used.
		token: /\bcountKnowledgeItems\b/,
		why: "GET /knowledge/triage-count was retired — the triage badge surface is gone",
	},
	{
		// GET /org/team-members/:id — deleted; this view type was its only response shape.
		token: /\bOrgTeamMembersByIdView\b/,
		why: "GET /org/team-members/:id was retired — its seam type must not return",
	},
	{
		// POST /org/scaffolded-agents — deleted; this schema was the sole validator.
		token: /\bpersistScaffoldedAgentsSchema\b/,
		why: "POST /org/scaffolded-agents was retired — its validation schema must not return",
	},
	{
		// GET /notifications/config + PATCH /notifications/config — both deleted.
		// `NotificationConfigPatch` was the patch-body type exclusive to these routes.
		token: /\bNotificationConfigPatch\b/,
		why: "GET+PATCH /notifications/config were retired — the config-patch type must not return",
	},
	{
		// GET /agent-orchestration/runs/latest-outcomes — deleted.
		token: /\blistLatestOutcomeByTask\b/,
		why: "GET /runs/latest-outcomes was retired — its backing function must not return",
	},
	{
		// GET /coach — deleted; the whole handler file died with the route.
		token: /\bcreateCoachRoutes\b/,
		why: "GET /coach was retired — it duplicated the live /assistant surface",
	},
	{
		// GET /hints + POST /hints/:id/dismiss — deleted with the hint_progress table.
		token: /\bcreateHintRoutes\b/,
		why: "GET /hints and POST /hints/:id/dismiss were retired with the hint_progress table",
	},
	{
		// The hint-progress backing functions, exported from @hyperidle/user.
		// These only existed to serve the deleted hint routes.
		token: /\blistDismissedHints\b/,
		why: "hint dismissal surface was retired — its backing function must not return",
	},

	// ---- Routes: path fragments for wholly-deleted routes ----------------------------------------
	//
	// @lore paths are banned only where the fragment is distinctive and cannot collide with any
	// surviving route. Generic fragments ("/sweep", "/config", "/inbox", "/coach") are left to
	// their unique symbol tokens above; a path collision with a surviving route would produce a
	// false positive on day one of deletion. The symbol tokens already guarantee those surfaces
	// cannot return, so the path tokens here are belt-and-suspenders tombstones for the clearly
	// unique fragments.

	// Path tokens below are added for routes whose unique path fragment can appear WITHOUT their
	// symbol companion (e.g. the router.post line has only the path, not the schema name).
	// @lore PASSENGER CANDIDATES — two path tokens were dropped because their companion symbol
	// fires first on every line that contains them:
	//   /attention-score — always co-occurs with `attentionScoreSchema` on the same line;
	//     `attentionScoreSchema` fires first (earlier in the array) and breaks.
	//   /scaffolded-agents — always co-occurs with `persistScaffoldedAgentsSchema`;
	//     same reason. Both symbol tokens already guarantee those surfaces cannot return.

	{
		// POST /knowledge/:id/recompute-attention — the router.post line has only the path string,
		// not `recomputeAttentionScoreForKnowledgeItem`. Path fires independently.
		token: /\/recompute-attention\b/,
		why: "POST /knowledge/:id/recompute-attention was retired with the attention engine",
	},
	{
		// GET /knowledge/triage-count — distinctive fragment.
		token: /\/triage-count\b/,
		why: "GET /knowledge/triage-count was retired — the triage badge surface is gone",
	},
	{
		// GET /org/team-members/:id — distinctive fragment (unlike /teams which survives).
		// The path router.get("/team-members/:teamMembersId",...) appears alone without OrgTeamMembersByIdView.
		token: /\/team-members\b/,
		why: "GET /org/team-members/:id was retired — its path fragment must not return",
	},
	{
		// GET /agent-orchestration/runs/latest-outcomes — distinctive fragment.
		// The router.get("/runs/latest-outcomes",...) line appears alone without listLatestOutcomeByTask.
		token: /\/latest-outcomes\b/,
		why: "GET /runs/latest-outcomes was retired — its path fragment must not return",
	},
	{
		// GET /hints + POST /hints/:id/dismiss — mounted at /hint-progress in app.ts.
		// The mount path /hint-progress also appears in barrel re-exports (users/src/index.ts)
		// without the `createHintRoutes` symbol.
		token: /\/hint-progress\b/,
		why: "GET /hints and POST /hints/:id/dismiss were retired — the /hint-progress mount must not return",
	},

	// ---- Tools: literal tool names and their factory symbols ------------------------------------

	{
		// score_attention tool name — banned as the registered name in the tool registry.
		// The factory symbol `makeScoreAttentionTool` is also banned above.
		token: /\bscore_attention\b/,
		why: "the score_attention agent tool was retired with the attention engine",
	},
	{
		// score_attention tool — factory symbol deleted with the attention engine.
		token: /\bmakeScoreAttentionTool\b/,
		why: "the score_attention agent tool was retired with the attention engine",
	},
	{
		// run_knowledge_sweep tool name — banned as the registered name in the tool registry.
		// The factory symbol `makeRunKnowledgeSweepTool` is also banned above.
		token: /\brun_knowledge_sweep\b/,
		why: "POST /knowledge/sweep and the run_knowledge_sweep tool were retired",
	},

	// ---- Events: string literals and type names for the seven deleted event types ---------------

	{
		// bet_revised and bet_state_changed — both event types were deleted (bet is now a root
		// task). `bet_state_changed` survived as a live string literal in a validator; the combined
		// regex catches it and also guards against `bet_revised` returning as code.
		token: /\bbet_revised\b|\bbet_state_changed\b/,
		why: "bet_revised and bet_state_changed event types were retired — a bet is now a root task",
	},
	{
		// dependency_met event — deleted; nothing emitted it.
		token: /\bdependency_met\b/,
		why: "the dependency_met event type was retired — it had no emitter",
	},
	{
		// thread_archived event — deleted; nothing emitted it.
		token: /\bthread_archived\b/,
		why: "the thread_archived event type was retired — it had no emitter",
	},
	{
		// work_selection_requested event — deleted; nothing emitted it.
		token: /\bwork_selection_requested\b/,
		why: "the work_selection_requested event type was retired — it had no emitter",
	},
	{
		// routine_fired event — deleted; the scheduler no longer fires it.
		token: /\broutine_fired\b/,
		why: "the routine_fired event type was retired — the scheduler no longer emits it",
	},
	{
		// knowledge_accessed event — deleted; the knowledge read route no longer emits it.
		token: /\bknowledge_accessed\b/,
		why: "the knowledge_accessed event type was retired — the knowledge read route no longer emits it",
	},
];

/** Remove block and line comments so historical prose does not trip the rule. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Source files this rule can meaningfully read. */
function isSource(path: string): boolean {
	return /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts");
}

export function retiredSurfacesAbsent(input: RetiredSurfacesAbsentInput): Rule {
	const { readFile } = input;

	const population = (census: Census): readonly string[] =>
		census.files.filter((f) => f.kind === "production" && isSource(f.path)).map((f) => f.path);

	return {
		id: "retired-surfaces-absent",
		description:
			"routes, tools and events retired from the platform must not return to production code",
		scope: population,
		minScope: 1,
		evaluate: (census: Census): readonly Finding[] => {
			const findings: Finding[] = [];
			for (const path of population(census)) {
				let source: string;
				try {
					source = readFile(path);
				} catch (error) {
					if (error instanceof Error && error.message.includes("ENOENT")) continue;
					throw error;
				}
				const lines = stripComments(source).split("\n");
				for (const [i, line] of lines.entries()) {
					for (const { token, why } of BANNED) {
						if (token.test(line)) {
							findings.push({
								ruleId: "retired-surfaces-absent",
								severity: "error",
								message: `${line.trim().slice(0, 100)} — ${why}`,
								path,
								line: i + 1,
								world: "production",
							});
							break;
						}
					}
				}
			}
			return findings;
		},
	};
}
