// AU21 §6 Decision G (recorder unification) — `work`'s local
// `AgentWorkIntentRecorder` mirror (`WorkAgentWorkIntentInput`/
// `WorkAgentWorkIntentRecord`/a local `AgentWorkIntentRecorder` interface) is
// deleted from `ports.ts`; every real caller now imports
// `@hyperidle/work-intent-port`'s canonical `AgentWorkIntentRecorder<WriteExecutor>`.
// This is a compile-time equality check (`expectTypeOf`, `tsc`-gated, same
// convention as `artifact-types.test.ts`): it fails to COMPILE (not merely to
// run) if `ports.ts` ever reintroduces a narrower local shape.

import type { WriteExecutor } from "@hyperidle/db";
import type { AgentWorkIntentRecorder as SharedAgentWorkIntentRecorder } from "@hyperidle/work-intent-port";
import { describe, expectTypeOf, it } from "vitest";
import type { TaskStateMachineDeps } from "../task-state-machine.js";

describe("work's AgentWorkIntentRecorder port equals the shared canonical recorder type", () => {
	it("TaskStateMachineDeps.workIntents is exactly @hyperidle/work-intent-port's AgentWorkIntentRecorder<WriteExecutor>", () => {
		expectTypeOf<TaskStateMachineDeps["workIntents"]>().toEqualTypeOf<
			SharedAgentWorkIntentRecorder<WriteExecutor>
		>();
	});
});
