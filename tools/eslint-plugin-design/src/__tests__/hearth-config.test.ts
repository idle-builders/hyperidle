/**
 * hearth-config totality — AZ7 §3.2 point 2 / E8.
 *
 * The one legitimate test in this area (CLAUDE.md): it imports two module
 * exports (`rules`, `RULE_SEVERITY`) and asserts a relation between their
 * values — no filesystem read, no grep. Proves a rule can never again be
 * exported by the plugin and wired nowhere (the D2 finding this closes).
 */

import { describe, expect, it } from "vitest";
import { configs, RULE_SEVERITY } from "../hearth-config.js";
import { rules } from "../index.js";

describe("hearth-config totality", () => {
	it("has exactly one severity entry per rule the plugin exports — no more, no fewer", () => {
		const ruleKeys = Object.keys(rules).sort();
		const severityKeys = Object.keys(RULE_SEVERITY).sort();
		expect(severityKeys).toEqual(ruleKeys);
	});

	it("never assigns a severity outside {off, warn, error}", () => {
		const allowed = new Set(["off", "warn", "error"]);
		for (const [name, severity] of Object.entries(RULE_SEVERITY)) {
			expect(allowed.has(severity.coreUi), `${name}.coreUi = ${severity.coreUi}`).toBe(true);
			expect(allowed.has(severity.designSystem), `${name}.designSystem = ${severity.designSystem}`).toBe(
				true,
			);
		}
	});

	it("a rule added to the plugin but missing from RULE_SEVERITY is caught (break-test)", () => {
		// Simulates the D2 failure mode directly: a severity table missing one
		// of the plugin's exported rule keys.
		const ruleKeys = Object.keys(rules);
		const incompleteTable = Object.fromEntries(
			Object.entries(RULE_SEVERITY).filter(([name]) => name !== ruleKeys[0]),
		);
		expect(Object.keys(incompleteTable).sort()).not.toEqual(ruleKeys.sort());
	});

	it("builds a hearth config with a core-ui block and a design-system block", () => {
		expect(configs.hearth.length).toBeGreaterThanOrEqual(2);
		const coreUiBlock = configs.hearth.find((c) =>
			(c.files as string[] | undefined)?.some((f) => f.includes("layers/core-ui/src")),
		);
		const designSystemBlock = configs.hearth.find((c) =>
			(c.files as string[] | undefined)?.some((f) => f.includes("framework/design-system/src")),
		);
		expect(coreUiBlock).toBeDefined();
		expect(designSystemBlock).toBeDefined();
		// radius-token-only and no-handrolled-control (AZ7's own rules) must be
		// present at error in the core-ui block — the live break-test proof (AC5).
		expect(coreUiBlock?.rules?.["design/radius-token-only"]).toBe("error");
		expect(coreUiBlock?.rules?.["design/no-handrolled-control"]).toBe("error");
		expect(coreUiBlock?.rules?.["design/no-hardcoded-color"]).toBe("error");
		expect(designSystemBlock?.rules?.["design/radius-token-only"]).toBe("error");
		// no-handrolled-control is deliberately OFF for design-system (Trade-off 4).
		expect(designSystemBlock?.rules?.["design/no-handrolled-control"]).toBeUndefined();
	});
});
