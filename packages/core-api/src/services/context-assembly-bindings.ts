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

import type { ContextAssemblyPorts } from "@hyperidle/context-assembly";
import { createContextAssemblyOps } from "@hyperidle/context-assembly";
import { startWatcher } from "@hyperidle/filesystems";
import {
	countTokens,
	DEFAULT_KNOWLEDGE_BUDGET,
	list,
	loadScoringWeights,
	rankAndBudget,
} from "@hyperidle/knowledge";
import { getTeamById } from "@hyperidle/org";
import { getRoutineById } from "@hyperidle/routine";
import { getUserById } from "@hyperidle/users";
import { getBetById, getTaskById } from "@hyperidle/work";

const contextAssemblyPorts: ContextAssemblyPorts = {
	knowledge: {
		list: (db, filters) => list(db, filters),
		rankAndBudget: async (db, items, scoringContext) => {
			const weights = await loadScoringWeights(db);
			return rankAndBudget(
				[...items],
				{ ...scoringContext, taskTags: [...scoringContext.taskTags] },
				weights,
				DEFAULT_KNOWLEDGE_BUDGET,
			);
		},
		countTokens,
	},
	work: {
		getTaskById,
		getBetById,
	},
	users: {
		getUserById,
	},
	routine: {
		getRoutineById,
	},
	filesystems: {
		startWatcher,
	},
	org: {
		getTeamById,
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
} from "@hyperidle/context-assembly";
export {
	buildTemplateVariables,
	EMITTED_ROOTS_AGENTS_MD,
	EMITTED_ROOTS_CONTEXT_ASSEMBLY,
	stripFrontmatter,
	substituteTemplateVars,
} from "@hyperidle/context-assembly";
