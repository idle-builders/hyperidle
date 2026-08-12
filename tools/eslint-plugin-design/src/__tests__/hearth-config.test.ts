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
			expect(
				allowed.has(severity.designSystem),
				`${name}.designSystem = ${severity.designSystem}`,
			).toBe(true);
		}
	});

	// AZ7 N9 (review round 1): the previous version of this test filtered a
	// LOCAL COPY of RULE_SEVERITY down by one key, then asserted the filtered
	// copy's key list differs from the full key list — true by construction
	// of `.filter()`, regardless of whether `rules` and `RULE_SEVERITY` were
	// ever actually in sync. It could not fail and proved nothing about the
	// totality guard. There is no type-level totality to break-test either
	// (`RULE_SEVERITY` is `Record<string, ScopedSeverity>`, not
	// `Record<keyof typeof rules, …>` — N10, left as recorded). The one
	// real check is the test above ("has exactly one severity entry per rule
	// …") — it re-derives both key lists from the live module exports on
	// every run, so it genuinely fails if a rule is ever added to `rules`
	// without a matching `RULE_SEVERITY` entry. Manually verified during
	// review: deleting an entry from `hearth-config.ts`'s `RULE_SEVERITY`
	// turns that test red at this file's line 18; reverting turns it green
	// again. A vitest unit test cannot mutate the imported module's static
	// shape to simulate that without editing source, so there is no way to
	// write a second, meaningfully different automated break-test for the
	// same property — hence deletion rather than a real replacement.

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
