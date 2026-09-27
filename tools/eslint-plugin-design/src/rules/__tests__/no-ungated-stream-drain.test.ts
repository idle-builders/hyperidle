/**
 * Tests for the no-ungated-stream-drain rule.
 *
 * Three classification paths are verified:
 *   (a) return-observe-only marker + observe present → valid (no error)
 *   (b) return-observe-only marker but observe MISSING → missingObserve error
 *   (c) No marker + ungated drain (no observe, no evaluateReturn) → missingObserve error
 *
 * Additionally covers the existing classifications:
 *   (d) Turn-drain with observe + evaluateReturn → valid
 *   (e) Turn-drain with observe but no evaluateReturn → missingEvaluateReturn
 *   (f) return-relay → valid (no gate needed)
 *   (g) return-exempt → valid (no gate needed)
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noUngatedStreamDrain } from "../no-ungated-stream-drain.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-ungated-stream-drain", noUngatedStreamDrain, {
	valid: [
		// (a) return-observe-only marker + observe present → valid
		{
			filename: "/repo/packages/server/src/services/assistant-turn.ts",
			code: `
import { adapter } from "./adapter";
import { gate } from "./gate";
async function drainStreamEvents() {
	const stream = adapter.streamEvents(handle);
	// return-observe-only: assistant turn compliant-by-construction; verdict deferred to caller (concept §4.4).
	for await (const event of stream) {
		gate.observe(event);
	}
}
`,
		},

		// (d) Turn-drain with observe + evaluateReturn in same function → valid
		{
			filename: "/repo/packages/server/src/services/session-provisioning.ts",
			code: `
import { harness } from "./harness";
import { returnGate } from "./gate";
async function runTurn() {
	for await (const event of harness.streamEvents(harnessHandle)) {
		returnGate.observe(event);
	}
	evaluateReturn(returnGate, "completed");
}
`,
		},

		// (f) return-relay → valid (no gate needed)
		{
			filename: "/repo/packages/server/src/services/bet-decomposition.ts",
			code: `
async function relayEvents() {
	// return-relay
	for await (const event of adapter.streamEvents(handle)) {
		yield event;
	}
}
`,
		},

		// (g) return-exempt → valid (no gate needed)
		{
			filename: "/repo/packages/server/src/services/config-extractor.ts",
			code: `
async function extractConfig() {
	// return-exempt: internal-extraction drain
	for await (const event of adapter.streamEvents(handle)) {
		process(event);
	}
}
`,
		},
	],

	invalid: [
		// (b) return-observe-only marker but observe MISSING → still errors (observe is mandatory)
		{
			filename: "/repo/packages/server/src/services/assistant-turn.ts",
			code: `
async function drainStreamEvents() {
	const stream = adapter.streamEvents(handle);
	// return-observe-only: verdict deferred to caller.
	for await (const event of stream) {
		process(event);
	}
}
`,
			errors: [{ messageId: "missingObserve" }],
		},

		// (c) No marker, ungated drain (no observe, no evaluateReturn) → missingObserve
		{
			filename: "/repo/packages/server/src/services/new-feature.ts",
			code: `
async function newFeature() {
	for await (const event of adapter.streamEvents(handle)) {
		process(event);
	}
}
`,
			errors: [{ messageId: "missingObserve" }],
		},

		// (e) Turn-drain: observe present but evaluateReturn absent → missingEvaluateReturn
		{
			filename: "/repo/packages/server/src/services/new-feature.ts",
			code: `
async function newFeature() {
	for await (const event of adapter.streamEvents(handle)) {
		returnGate.observe(event);
	}
}
`,
			errors: [{ messageId: "missingEvaluateReturn" }],
		},
	],
});
