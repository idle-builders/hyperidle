// L3 review D-B5 — bridge mapping coverage.
import type { Artifact } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import { artifactToViewProps } from "../shell/artifactToView.js";

const BASE: Omit<Artifact, "kind" | "preview"> = {
	id: "a",
	producingTaskId: "t",
	producingTaskTitle: "T",
	cost: { money: null, tokens: null },
	threadCount: 0,
	createdAt: "2026-04-28T00:00:00.000Z",
};

describe("artifactToViewProps", () => {
	it("returns null when preview is null", () => {
		const a: Artifact = { ...BASE, kind: "decision", preview: null };
		expect(artifactToViewProps(a)).toBeNull();
	});

	it("maps code_diff → text_diff with translated line types", () => {
		const a: Artifact = {
			...BASE,
			kind: "code_diff",
			preview: {
				kind: "code_diff",
				file: "src/foo.ts",
				hunks: [
					{
						header: "@@ -1 +1 @@",
						lines: [
							{ kind: "add", text: "new line" },
							{ kind: "del", text: "old line" },
							{ kind: "ctx", text: "context" },
						],
					},
				],
			},
		};
		const props = artifactToViewProps(a);
		expect(props?.shape).toBe("text_diff");
		if (props?.shape === "text_diff") {
			expect(props.data.hunks[0]?.lines.map((l) => l.type)).toEqual([
				"addition",
				"deletion",
				"context",
			]);
		}
	});

	it("maps dashboard → data_metrics", () => {
		const a: Artifact = {
			...BASE,
			kind: "dashboard",
			preview: { kind: "dashboard", metrics: [{ label: "MRR", value: "$12k" }] },
		};
		const props = artifactToViewProps(a);
		expect(props?.shape).toBe("data_metrics");
	});

	it("returns null for kinds with no mapping (e.g. decision)", () => {
		const a: Artifact = {
			...BASE,
			kind: "decision",
			preview: { kind: "decision", claim: "c", rationale: "r" },
		};
		expect(artifactToViewProps(a)).toBeNull();
	});
});
