/**
 * `hearth-config.ts`'s `RULE_SEVERITY` table must name every rule the plugin exports, exactly once,
 * with a severity of off/warn/error in each scope — a rule off in every scope with no dedicated
 * `eslint.config.ts` block runs on zero files and reads as healthy forever.
 */

import { describe, expect, it } from "vitest";
import { configs, DEDICATED_BLOCK_RULES, RULE_SEVERITY } from "../hearth-config.js";
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
			expect(
				allowed.has(severity.designSystem),
				`${name}.designSystem = ${severity.designSystem}`,
			).toBe(true);
		}
	});

	it("never sets a rule to off in every scope unless it has a dedicated eslint.config.ts block", () => {
		for (const [name, severity] of Object.entries(RULE_SEVERITY)) {
			const bothOff = severity.coreUi === "off" && severity.designSystem === "off";
			const hasDedicatedBlock = DEDICATED_BLOCK_RULES.has(name);
			expect(
				bothOff && !hasDedicatedBlock,
				`${name} is off in both scopes and has no dedicated block — either wire it at error/warn in at least one scope, add it to DEDICATED_BLOCK_RULES with a dedicated eslint.config.ts block, or delete the rule`,
			).toBe(false);
		}
	});

	it("builds a hearth config with a core-ui block and a design-system block", () => {
		expect(configs.hearth.length).toBeGreaterThanOrEqual(2);
		const coreUiBlock = configs.hearth.find((c) =>
			(c.files as string[] | undefined)?.some((f) => f.includes("layers/core-ui/src")),
		);
		const designSystemBlock = configs.hearth.find((c) =>
			(c.files as string[] | undefined)?.some((f) => f.includes("layers/core-ui/src/ds")),
		);
		expect(coreUiBlock).toBeDefined();
		expect(designSystemBlock).toBeDefined();
		expect(coreUiBlock?.rules?.["design/radius-token-only"]).toBe("error");
		expect(coreUiBlock?.rules?.["design/no-handrolled-control"]).toBe("error");
		expect(coreUiBlock?.rules?.["design/no-handrolled-chip"]).toBe("error");
		expect(coreUiBlock?.rules?.["design/no-hardcoded-color"]).toBe("error");
		expect(coreUiBlock?.rules?.["design/no-off-grid-spacing"]).toBe("error");
		expect(coreUiBlock?.rules?.["design/shadow-token-only"]).toBe("error");
		expect(designSystemBlock?.rules?.["design/radius-token-only"]).toBe("error");
		expect(designSystemBlock?.rules?.["design/no-off-grid-spacing"]).toBe("error");
		expect(designSystemBlock?.rules?.["design/shadow-token-only"]).toBe("error");
		// no-handrolled-control and no-handrolled-chip are deliberately OFF for
		// design-system — ds/ is where control and chip chrome is BUILT.
		expect(designSystemBlock?.rules?.["design/no-handrolled-control"]).toBeUndefined();
		expect(designSystemBlock?.rules?.["design/no-handrolled-chip"]).toBeUndefined();
	});
});
