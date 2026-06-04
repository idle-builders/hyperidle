import type { EvalScenario } from "../types.js";
import { coordinationTaskScenario } from "./coordination-task.js";
import { costBoundedTaskScenario } from "./cost-bounded-task.js";
import { handoffTaskScenario } from "./handoff-task.js";
import { knowledgeTaskScenario } from "./knowledge-task.js";
import { synthesisTaskScenario } from "./synthesis-task.js";

export const allScenarios: readonly EvalScenario[] = [
	knowledgeTaskScenario,
	coordinationTaskScenario,
	synthesisTaskScenario,
	handoffTaskScenario,
	costBoundedTaskScenario,
] as const;
