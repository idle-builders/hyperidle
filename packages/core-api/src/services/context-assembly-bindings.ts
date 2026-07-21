/**
 * @lore AU19 Increment 3 (context-assembly finalize): `@hyperidle/context-assembly`'s
 * `createContextAssemblyOps` needs injected `knowledge`/`work`/`users`/`routine`/
 * `filesystems`/`org` ports (Mechanism C — `context-assembly` never imports
 * another Service). This module builds the bound singleton ONCE, at the
 * composition root, so every real call site (`session-lifecycle-bindings.ts`'s
 * `contextAssembly` port and `__tests__/R7-knowledge-e2e.integration.test.ts`)
 * imports the already-wired functions unchanged — same factory-curry idiom as
 * `cost-bindings.ts`/`dispatch-bindings.ts`/`session-lifecycle-bindings.ts`.
 *
 * `knowledge.rankAndBudget` collapses `@hyperidle/knowledge`'s
 * `loadScoringWeights(db)` + `rankAndBudget(items, scoringContext, weights,
 * DEFAULT_KNOWLEDGE_BUDGET)` into the one port method
 * `ports.ts`/`context-assembly.ts` calls — see `@hyperidle/context-assembly`'s
 * `ports.ts` top `@lore` for the collapsed-call-shape reasoning (same idiom
 * `dispatch`'s `recomputeAttentionForCandidates` established).
 *
 * `org: { getTeamById }` added Increment 3 (teams table-ownership
 * remediation, 2026-07-15 founder ruling) — `session-context.ts` used to
 * `.from(teams)` directly; `teams` IS `org`-owned (architecture.md §4 line
 * 69), not `UNOWNED_SHARED_TABLES`.
 */

import type { WriteExecutor } from "@hyperidle/db";
import { startWatcher } from "@hyperidle/filesystems";
import { list, rank } from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import { getRoutine } from "@hyperidle/routine";
import type { ContextAssemblyPorts } from "@hyperidle/run-orchestration";
import { createContextAssemblyOps } from "@hyperidle/run-orchestration";
import { findUser } from "@hyperidle/users";
import * as work from "@hyperidle/work";

const contextAssemblyPorts: ContextAssemblyPorts = {
	knowledge: {
		list: (db, filters) => list(db, filters),
		rankAndBudget: (db, items, scoringContext) =>
			rank(db, [...items], { ...scoringContext, taskTags: [...scoringContext.taskTags] }),
		countTokens: (text) => Math.ceil(Buffer.byteLength(text, "utf8") / 4),
	},
	work: {
		getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
		getBetById: (exec: WriteExecutor, id: string) => work.get(exec, "bet", id),
	},
	users: {
		getUserById: (db, id) => findUser(db, { id }),
	},
	routine: {
		getRoutineById: getRoutine,
	},
	filesystems: {
		startWatcher,
	},
	org: {
		getTeamById: (db, id) => getTeam(db, { id }),
	},
};

export const contextAssemblyOps = createContextAssemblyOps(contextAssemblyPorts);

export const {
	assembleContext,
	assembleAgentContext,
	beginAgentWriteback,
	buildSessionContextData,
	buildRoutineSessionContextData,
	buildSessionContext,
	assemblePrompt,
	assembleRoutinePrompt,
	composeAssistantPrompt,
	writeSandboxAgentsMd,
} = contextAssemblyOps;

export type {
	ContextAssemblyConfig,
	ContextAssemblyResult,
	Manifest,
	ManifestEntry,
	PromptCompositionInput,
	PromptCompositionResult,
	RoutineSessionContextConfig,
	RoutineSessionContextData,
	SessionContextConfig,
	SessionContextData,
	ToolSummary,
} from "@hyperidle/run-orchestration";
export {
	buildTemplateVariables,
	EMITTED_ROOTS_AGENTS_MD,
	EMITTED_ROOTS_CONTEXT_ASSEMBLY,
	stripFrontmatter,
	substituteTemplateVars,
} from "@hyperidle/run-orchestration";
