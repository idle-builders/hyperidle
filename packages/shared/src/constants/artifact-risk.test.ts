/**
 * L9 — DEFAULT_RISK_TIER_BY_KIND. Per-artifact-kind risk-tier defaults,
 * overridable per-instance via `resolveRiskTier(kind, override)`.
 */
import { describe, expect, it } from "vitest";
import { ARTIFACT_KINDS } from "../types/artifact.js";
import { RISK_TIERS, type RiskTier } from "../types.js";
import { DEFAULT_RISK_TIER_BY_KIND, resolveRiskTier } from "./artifact-risk.js";

describe("L9: DEFAULT_RISK_TIER_BY_KIND", () => {
	it("keys every ArtifactKind exhaustively", () => {
		for (const k of ARTIFACT_KINDS) {
			expect(Object.hasOwn(DEFAULT_RISK_TIER_BY_KIND, k)).toBe(true);
		}
	});

	it("every value is a valid RiskTier", () => {
		for (const k of ARTIFACT_KINDS) {
			const v = (DEFAULT_RISK_TIER_BY_KIND as Record<string, RiskTier>)[k];
			expect(RISK_TIERS).toContain(v);
		}
	});

	it("does not introduce extra keys beyond ARTIFACT_KINDS", () => {
		const declared = new Set(ARTIFACT_KINDS as readonly string[]);
		const actual = new Set(Object.keys(DEFAULT_RISK_TIER_BY_KIND));
		for (const k of actual) {
			expect(declared.has(k)).toBe(true);
		}
	});

	it("action_summary defaults to 'high' (deploy / pricing / email blast)", () => {
		expect(DEFAULT_RISK_TIER_BY_KIND.action_summary).toBe("high");
	});

	it("skill_change defaults to 'high' (changes agent behavior)", () => {
		expect(DEFAULT_RISK_TIER_BY_KIND.skill_change).toBe("high");
	});

	it("file_lease defaults to 'medium' (collision resolution, low blast)", () => {
		expect(DEFAULT_RISK_TIER_BY_KIND.file_lease).toBe("medium");
	});

	it("permission_request defaults to 'high' (raising autonomy)", () => {
		expect(DEFAULT_RISK_TIER_BY_KIND.permission_request).toBe("high");
	});
});

describe("L9: resolveRiskTier(kind, override)", () => {
	it("returns override when provided", () => {
		expect(resolveRiskTier("file_lease", "critical")).toBe("critical");
		expect(resolveRiskTier("action_summary", "low")).toBe("low");
	});

	it("falls back to per-kind default when override is null or undefined", () => {
		expect(resolveRiskTier("action_summary", null)).toBe("high");
		expect(resolveRiskTier("file_lease", undefined)).toBe("medium");
	});
});
