// AU21 §6 Decision G (recorder unification) — `review`'s local
// `ReviewAgentWorkIntentRecorder`/`ReviewAgentWorkIntentRecord` mirror is
// deleted from `ports.ts`; `ReviewPorts.intentRecorder` now types directly
// off `@hyperidle/work-intent-port`'s canonical `AgentWorkIntentRecorder<WriteExecutor>`,
// and the exported `ReviewAgentWorkIntentInput` contract narrows the shared
// `AgentWorkIntentRecorderInput` union to `reengagement` via `Extract`
// (rather than re-declaring its own shape). Compile-time equality check
// (`expectTypeOf`, `tsc`-gated, same convention as `artifact-types.test.ts`):
// fails to COMPILE if `ports.ts` ever reintroduces a narrower local shape.

import type { WriteExecutor } from "@hyperidle/db";
import type {
	AgentWorkIntentRecorderInput,
	AgentWorkIntentRecorder as SharedAgentWorkIntentRecorder,
} from "@hyperidle/work-intent-port";
import { describe, expectTypeOf, it } from "vitest";
import type { ReviewAgentWorkIntentInput, ReviewPorts } from "../ports.js";

describe("review's AgentWorkIntentRecorder port equals the shared canonical recorder type", () => {
	it("ReviewPorts.intentRecorder is exactly @hyperidle/work-intent-port's AgentWorkIntentRecorder<WriteExecutor>", () => {
		expectTypeOf<ReviewPorts["intentRecorder"]>().toEqualTypeOf<
			SharedAgentWorkIntentRecorder<WriteExecutor>
		>();
	});

	it("ReviewAgentWorkIntentInput is the reengagement member of the shared AgentWorkIntentRecorderInput union", () => {
		expectTypeOf<ReviewAgentWorkIntentInput>().toEqualTypeOf<
			Extract<AgentWorkIntentRecorderInput, { kind: "reengagement" }>
		>();
	});
});
