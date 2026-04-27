/**
 * L9 — Artifact type contracts. Pins the type-level shapes for ArtifactKind,
 * SandboxResult, BlastRadius, ArtifactMetadataExtended, and the four
 * per-kind payload interfaces.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import {
	type ActionSummaryPayload,
	ARTIFACT_KINDS,
	type ArtifactKind,
	type ArtifactMetadataExtended,
	type BlastRadius,
	type FileLeasePayload,
	type PermissionRequestPayload,
	SANDBOX_RESULTS,
	type SandboxResult,
	type SkillChangePayload,
} from "../types/artifact.js";
import { RISK_TIERS, type RiskTier } from "../types.js";

describe("L9: RiskTier widened to include 'critical'", () => {
	it("RISK_TIERS includes all four tiers in canonical order", () => {
		expect(RISK_TIERS).toEqual(["low", "medium", "high", "critical"]);
	});

	it("RiskTier accepts 'critical' as a value", () => {
		const t: RiskTier = "critical";
		expect(t).toBe("critical");
	});

	it("RiskTier still accepts the original three", () => {
		const a: RiskTier = "low";
		const b: RiskTier = "medium";
		const c: RiskTier = "high";
		expect([a, b, c]).toEqual(["low", "medium", "high"]);
	});
});

describe("L9: ArtifactKind union", () => {
	it("ARTIFACT_KINDS contains the four L9 kinds", () => {
		expect(ARTIFACT_KINDS).toEqual([
			"action_summary",
			"skill_change",
			"file_lease",
			"permission_request",
		]);
	});

	it("ArtifactKind type is the literal union of those four values", () => {
		expectTypeOf<ArtifactKind>().toEqualTypeOf<
			"action_summary" | "skill_change" | "file_lease" | "permission_request"
		>();
	});
});

describe("L9: SandboxResult union", () => {
	it("SANDBOX_RESULTS contains 'passed' | 'failed' | 'n/a'", () => {
		expect(SANDBOX_RESULTS).toEqual(["passed", "failed", "n/a"]);
	});

	it("SandboxResult type is the literal union", () => {
		expectTypeOf<SandboxResult>().toEqualTypeOf<"passed" | "failed" | "n/a">();
	});
});

describe("L9: BlastRadius shape", () => {
	it("has agents, teams, products string-array fields", () => {
		const br: BlastRadius = { agents: ["a"], teams: ["t"], products: ["p"] };
		expect(br.agents).toEqual(["a"]);
		expect(br.teams).toEqual(["t"]);
		expect(br.products).toEqual(["p"]);
	});
});

describe("L9: ArtifactMetadataExtended", () => {
	it("carries the five new fields plus J4 strip fields", () => {
		const meta: ArtifactMetadataExtended = {
			kind: "action_summary",
			riskTier: "critical",
			reversibility: false,
			costEstimate: 120,
			blastRadius: { agents: [], teams: [], products: ["hyperidle-web"] },
			sandboxResult: "passed",
			status: "pending",
			sla: "2h left",
			routing: "Backend Agent",
		};
		expect(meta.kind).toBe("action_summary");
		expect(meta.riskTier).toBe("critical");
		expect(meta.reversibility).toBe(false);
		expect(meta.costEstimate).toBe(120);
		expect(meta.blastRadius.products).toContain("hyperidle-web");
		expect(meta.sandboxResult).toBe("passed");
	});

	it("permits null sandboxResult and null costEstimate", () => {
		const meta: ArtifactMetadataExtended = {
			kind: "permission_request",
			riskTier: "high",
			reversibility: true,
			costEstimate: null,
			blastRadius: { agents: [], teams: [], products: [] },
			sandboxResult: null,
			status: "pending",
			sla: "",
			routing: "",
		};
		expect(meta.costEstimate).toBeNull();
		expect(meta.sandboxResult).toBeNull();
	});
});

describe("L9: per-kind payload shapes", () => {
	it("ActionSummaryPayload carries actionType, summary, impactList, confirmToken", () => {
		const p: ActionSummaryPayload = {
			actionType: "deploy",
			summary: "Deploy hyperidle-web v2.4.1 to prod",
			impactList: [{ label: "Affected products", value: "hyperidle-web" }],
			confirmToken: "deploy",
		};
		expect(p.actionType).toBe("deploy");
		expect(p.confirmToken).toBe("deploy");
		expect(p.impactList[0]?.label).toBe("Affected products");
	});

	it("SkillChangePayload carries skillId, diff, agentImpacts, rolloutPolicy", () => {
		const p: SkillChangePayload = {
			skillId: "skill:test",
			diff: { before: "old", after: "new" },
			agentImpacts: [{ agentName: "Architect", behaviorChange: "no change" }],
			rolloutPolicy: { mode: "pin_version", value: "v3.2" },
		};
		expect(p.skillId).toBe("skill:test");
		expect(p.rolloutPolicy?.mode).toBe("pin_version");
	});

	it("SkillChangePayload accepts null rolloutPolicy", () => {
		const p: SkillChangePayload = {
			skillId: "skill:test",
			diff: { before: "x", after: "y" },
			agentImpacts: [],
			rolloutPolicy: null,
		};
		expect(p.rolloutPolicy).toBeNull();
	});

	it("FileLeasePayload carries filePath and two agent submissions", () => {
		const p: FileLeasePayload = {
			filePath: "packages/web/src/pages/Auth.tsx",
			agentA: { name: "Developer", artifactSnippet: "+import {...}" },
			agentB: { name: "Builder", artifactSnippet: "+export function" },
		};
		expect(p.filePath).toContain("Auth.tsx");
		expect(p.agentA.name).toBe("Developer");
		expect(p.agentB.name).toBe("Builder");
	});

	it("PermissionRequestPayload carries the L1 ladder fields and justification", () => {
		const p: PermissionRequestPayload = {
			requesterAgentId: "agent:builder",
			requesterAgentName: "Builder",
			skillId: "deploy",
			currentLevel: 2,
			requestedLevel: 3,
			justification: "Last 12 deploys all green",
		};
		expect(p.currentLevel).toBe(2);
		expect(p.requestedLevel).toBe(3);
		expect(p.justification).toContain("12 deploys");
	});
});
