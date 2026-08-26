/**
 * Codex's model list comes from codex's own cache on the real machine.
 *
 * The unit tests use a captured copy of that file; this one reads the actual
 * one, so a change in codex's format shows up here rather than silently
 * emptying the model list in production.
 */

import { describe, expect, test } from "vitest";
import { discoverLocalHarnesses } from "../harness-discovery.js";
import { requireHarness } from "./require-harness.js";

requireHarness("codex");

describe("codex models, read from the real cache", () => {
	test("the installed codex offers models, each with its own reasoning levels", async () => {
		const result = await discoverLocalHarnesses({ env: process.env });
		const models = result.codex.models ?? [];

		expect(models.length).toBeGreaterThan(0);

		for (const model of models) {
			expect(model.id.length).toBeGreaterThan(0);
			const option = model.options[0];
			if (!option) continue;
			expect(option.key).toBe("model_reasoning_effort");
			const control = option.control;
			expect(control.kind).toBe("select");
			if (control.kind === "select") {
				expect(control.choices.length).toBeGreaterThan(0);
			}
		}

		// At least one model declares a reasoning option — if none did, the parser
		// would be silently reading nothing useful and still "passing".
		expect(models.some((m) => m.options.length > 0)).toBe(true);
	}, 60_000);
});
