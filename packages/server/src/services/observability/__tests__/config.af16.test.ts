/**
 * AF16 T14 — Observability config default-on (RED).
 *
 * buildConfig with empty kv → enabled=true, adapter="console".
 * buildConfig with {enabled:"false"} → enabled=false.
 *
 * Z8-100.
 */

import { describe, expect, it } from "vitest";
// @lore AF16 T14: buildConfig is not exported from config.ts currently.
// We need to export it (or test via readObservabilityConfig with a mock db)
// to assert on the default. The plan says: flip default to true when unset.
// For now we test the observable API: if we call with empty DB, enabled defaults true.
// We test buildConfig directly after it is exported.
import { buildObservabilityConfig } from "../config.js";

describe("AF16 T14 — Observability buildConfig defaults (Z8-100)", () => {
	it("empty kv map → enabled=true, adapter='console'", () => {
		const cfg = buildObservabilityConfig(new Map());
		expect(cfg.enabled).toBe(true);
		expect(cfg.adapter).toBe("console");
	});

	it("{enabled:'false'} → enabled=false (explicit opt-out)", () => {
		const cfg = buildObservabilityConfig(new Map([["observability.enabled", "false"]]));
		expect(cfg.enabled).toBe(false);
	});

	it("{enabled:'true'} → enabled=true", () => {
		const cfg = buildObservabilityConfig(new Map([["observability.enabled", "true"]]));
		expect(cfg.enabled).toBe(true);
	});
});
