// AU21 §6 Decision G (recorder unification) — `work`'s local
// `AgentWorkIntentRecorder` mirror (`WorkAgentWorkIntentInput`/
// `WorkAgentWorkIntentRecord`/a local `AgentWorkIntentRecorder` interface) is
// deleted from `ports.ts`; every real caller now imports
// `@hyperidle/shared`'s canonical `AgentWorkIntentRecorder<WriteExecutor>`.
// This is a compile-time equality check (`expectTypeOf`, `tsc`-gated, same
// convention as `artifact-types.test.ts`): it fails to COMPILE (not merely to
// run) if `ports.ts` ever reintroduces a narrower local shape.

import type { WriteExecutor } from "@hyperidle/db";
import type { AgentWorkIntentRecorder as SharedAgentWorkIntentRecorder } from "@hyperidle/work-intent-port";
import { describe, expectTypeOf, it } from "vitest";
import type { WorkDeps } from "../ports.js";
import type { TaskStateMachineDeps } from "../task-state-machine.js";

describe("work's AgentWorkIntentRecorder port equals the shared canonical recorder type", () => {
	it("WorkDeps.workIntents is exactly @hyperidle/shared's AgentWorkIntentRecorder<WriteExecutor>", () => {
		expectTypeOf<WorkDeps["workIntents"]>().toEqualTypeOf<
			SharedAgentWorkIntentRecorder<WriteExecutor>
		>();
	});

	it("TaskStateMachineDeps.workIntents is exactly @hyperidle/shared's AgentWorkIntentRecorder<WriteExecutor>", () => {
		expectTypeOf<TaskStateMachineDeps["workIntents"]>().toEqualTypeOf<
			SharedAgentWorkIntentRecorder<WriteExecutor>
		>();
	});
});
