// L3 RED — type & runtime closure tests for the Artifact primitive.
// Source of truth: plans/L3/architecture.md §3, §10 Q4.
//
// The implementation does not yet exist; this test file references the
// modules and exports the production code must publish.

import { describe, expect, expectTypeOf, it } from "vitest";
import {
	ARTIFACT_KINDS,
	type Artifact,
	type ArtifactCostFromSession,
	type ArtifactFilterAxis,
	type ArtifactKind,
	type ArtifactPage,
	type ArtifactPreview,
	artifactDisplayTitle,
	summarizePreview,
} from "../types/artifact.js";

describe("ARTIFACT_KINDS closure", () => {
	it("contains exactly the 12 canonical kinds + unknown_kind", () => {
		expect(ARTIFACT_KINDS).toEqual([
			"code_diff",
			"deck",
			"contract",
			"dashboard",
			"screenshot",
			"drafted_email",
			"design",
			"data_analysis",
			"decision",
			"running_service",
			"comm_draft",
			"verification",
			"unknown_kind",
		]);
	});

	it("ArtifactKind is the literal union of ARTIFACT_KINDS", () => {
		const k: ArtifactKind = "code_diff";
		expectTypeOf(k).toEqualTypeOf<ArtifactKind>();
		expectTypeOf<(typeof ARTIFACT_KINDS)[number]>().toEqualTypeOf<ArtifactKind>();
	});

	it("rejects unknown values via type narrowing", () => {
		// @ts-expect-error — 'internet_meme' is not in ARTIFACT_KINDS
		const _bad: ArtifactKind = "internet_meme";
	});
});

describe("ArtifactPreview discriminated union", () => {
	it("each of the 12 recognised kinds has a variant (excluding unknown_kind)", () => {
		const kinds = ARTIFACT_KINDS.filter((k) => k !== "unknown_kind");
		// Construct one fixture per recognised kind. If a kind is missing
		// from the union, the cast inside the switch will fail tsc.
		for (const kind of kinds) {
			const preview = makeFixturePreview(kind as Exclude<ArtifactKind, "unknown_kind">);
			expect(preview.kind).toBe(kind);
		}
	});

	it("ArtifactPreview discriminant is a strict subset of ArtifactKind", () => {
		// unknown_kind must NOT be a member of ArtifactPreview['kind'].
		type PreviewKind = ArtifactPreview["kind"];
		expectTypeOf<PreviewKind>().not.toEqualTypeOf<ArtifactKind>();
		const _ok: PreviewKind = "code_diff";
		// @ts-expect-error — unknown_kind has no preview variant
		const _bad: PreviewKind = "unknown_kind";
	});
});

describe("Artifact canonical wire shape", () => {
	it("requires the documented fields", () => {
		const a: Artifact = {
			id: "art_01",
			producingTaskId: "task_01",
			producingTaskTitle: "Draft email to investors",
			kind: "drafted_email",
			preview: {
				kind: "drafted_email",
				to: ["a@b.co"],
				subject: "Hi",
				bodyExcerpt: "Hello",
			},
			cost: {
				money: { minor: 42, currency: "USD" },
				tokens: { byTier: { haiku: { prompt: 8000, completion: 4400 } } },
			},
			threadCount: 0,
			createdAt: "2026-04-28T00:00:00.000Z",
		};
		expect(a.kind).toBe("drafted_email");
	});

	it("ArtifactPage exposes items + nextCursor", () => {
		const page: ArtifactPage = { items: [], nextCursor: null };
		expect(page.items).toEqual([]);
	});

	it("ArtifactFilterAxis is a discriminated union over the 4 axes", () => {
		const axes: ArtifactFilterAxis[] = [
			{ axis: "task", taskId: "t1" },
			{ axis: "bet", betId: "b1" },
			{ axis: "product", productId: "p1" },
			{ axis: "portfolio" },
		];
		expect(axes).toHaveLength(4);
	});
});

describe("ArtifactCostFromSession forward-compat shape", () => {
	it("carries WireMoney and TokenUsage (L17 structured cost types)", () => {
		const cost: ArtifactCostFromSession = { money: null, tokens: null };
		expect(cost.money).toBeNull();
		expect(cost.tokens).toBeNull();
		expectTypeOf<ArtifactCostFromSession["money"]>().toEqualTypeOf<
			import("../types/money.js").WireMoney | null
		>();
		expectTypeOf<ArtifactCostFromSession["tokens"]>().toEqualTypeOf<
			import("../types/money.js").TokenUsage | null
		>();
	});
});

describe("summarizePreview (exhaustive over 12 kinds)", () => {
	it("returns a non-empty string for every recognised kind", () => {
		const recognised = ARTIFACT_KINDS.filter((k) => k !== "unknown_kind");
		for (const kind of recognised) {
			const preview = makeFixturePreview(kind as Exclude<ArtifactKind, "unknown_kind">);
			const out = summarizePreview(preview);
			expect(out).toBeTypeOf("string");
			expect((out ?? "").length).toBeGreaterThan(0);
		}
	});

	it("returns null when preview is null", () => {
		expect(summarizePreview(null)).toBeNull();
	});
});

describe("artifactDisplayTitle", () => {
	it("falls back to producing task title when preview is null", () => {
		const a: Pick<Artifact, "preview" | "producingTaskTitle"> = {
			preview: null,
			producingTaskTitle: "ship invoice",
		};
		expect(artifactDisplayTitle(a)).toBe("ship invoice");
	});

	it("uses preview-derived title for kinds that carry one", () => {
		const a: Pick<Artifact, "preview" | "producingTaskTitle"> = {
			preview: { kind: "decision", claim: "go with option A", rationale: "cheaper" },
			producingTaskTitle: "decide",
		};
		expect(artifactDisplayTitle(a)).toBe("go with option A");
	});
});

// --- helpers ---------------------------------------------------------

function makeFixturePreview(kind: Exclude<ArtifactKind, "unknown_kind">): ArtifactPreview {
	switch (kind) {
		case "code_diff":
			return { kind: "code_diff", file: "src/x.ts", hunks: [] };
		case "deck":
			return { kind: "deck", slideCount: 12, firstSlideTitle: "Intro" };
		case "contract":
			return { kind: "contract", parties: ["A", "B"], title: "MSA" };
		case "dashboard":
			return { kind: "dashboard", metrics: [{ label: "DAU", value: "1.2k" }] };
		case "screenshot":
			return { kind: "screenshot", imageUrl: "https://x", width: 1, height: 1 };
		case "drafted_email":
			return { kind: "drafted_email", to: ["a@b"], subject: "S", bodyExcerpt: "B" };
		case "design":
			return { kind: "design", imageUrl: "https://x", width: 1, height: 1 };
		case "data_analysis":
			return { kind: "data_analysis", findings: ["x"] };
		case "decision":
			return { kind: "decision", claim: "c", rationale: "r" };
		case "running_service":
			return {
				kind: "running_service",
				url: "https://x",
				status: "ok",
				statusLabel: "OK",
			};
		case "comm_draft":
			return { kind: "comm_draft", channel: "#x", firstMessage: "hi" };
		case "verification":
			return { kind: "verification", suite: "unit", passed: 10, failed: 0 };
	}
}
