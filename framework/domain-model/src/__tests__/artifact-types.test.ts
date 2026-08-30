// AE6 — Updated type & runtime tests for the Artifact primitive.
// Source of truth: plans/AE6/architecture.md §11, plans/AE6/concept.md.
//
// Replaces the L3 test suite (13-kind closed enum) with the AE6 6-kind open system.

import { describe, expect, it } from "vitest";
import {
	ARTIFACT_KINDS,
	type Artifact,
	type ArtifactFilterAxis,
	type ArtifactKind,
	type ArtifactPage,
	type ArtifactPreview,
	artifactDisplayTitle,
	isRegisteredKind,
	summarizePreview,
} from "../types/artifact.js";

describe("ARTIFACT_KINDS (AE6: 6 fundamental kinds)", () => {
	it("contains exactly the 6 fundamental kinds", () => {
		expect(ARTIFACT_KINDS).toEqual(["text", "code", "image", "data", "html", "url"]);
	});

	it("does NOT contain old business-domain kinds", () => {
		// Old 13-kind enum is retired per AE6.
		const kindList = ARTIFACT_KINDS as readonly string[];
		expect(kindList).not.toContain("code_diff");
		expect(kindList).not.toContain("contract");
		expect(kindList).not.toContain("unknown_kind");
		expect(kindList).not.toContain("drafted_email");
	});

	it("ArtifactKind is the literal union of ARTIFACT_KINDS", () => {
		// Compile-time: assigning a tuple element to ArtifactKind verifies the types match.
		const k: ArtifactKind = "text";
		const Check: ArtifactKind = ARTIFACT_KINDS[0]!;
		expect(k).toBeDefined();
		expect(Check).toBeDefined();
	});

	it("rejects unknown values via type narrowing", () => {
		// @ts-expect-error — 'internet_meme' is not in ARTIFACT_KINDS
		const _bad: ArtifactKind = "internet_meme";
	});
});

describe("ArtifactPreview discriminated union (6 kinds)", () => {
	it("each of the 6 kinds has a preview variant", () => {
		const kinds = ARTIFACT_KINDS;
		for (const kind of kinds) {
			const preview = makeFixturePreview(kind);
			expect(preview.kind).toBe(kind);
		}
	});

	it("ArtifactPreview discriminant covers the 6 fundamental kinds", () => {
		type PreviewKind = ArtifactPreview["kind"];
		// old kinds must NOT be in ArtifactPreview
		// @ts-expect-error — unknown_kind has no preview variant
		const _bad: PreviewKind = "unknown_kind";
		// @ts-expect-error — code_diff is retired
		const _bad2: PreviewKind = "code_diff";
	});
});

describe("Artifact canonical wire shape (AE6)", () => {
	it("requires the documented fields including label", () => {
		const a: Artifact = {
			id: "art_01",
			producingTaskId: "task_01",
			producingTaskTitle: "Draft services agreement",
			kind: "text",
			label: "contract",
			preview: {
				kind: "text",
				body: "This is the contract body.",
			},
			threadCount: 0,
			createdAt: "2026-06-08T00:00:00.000Z",
		};
		expect(a.kind).toBe("text");
		expect(a.label).toBe("contract");
	});

	it("label is nullable — can be null", () => {
		const a: Artifact = {
			id: "art_02",
			producingTaskId: "task_01",
			producingTaskTitle: "Code review",
			kind: "code",
			label: null,
			preview: null,
			threadCount: 0,
			createdAt: "2026-06-08T00:00:00.000Z",
		};
		expect(a.label).toBeNull();
	});

	it("kind is string (open vocabulary) — accepts unregistered kinds", () => {
		const a: Artifact = {
			id: "art_03",
			producingTaskId: "task_01",
			producingTaskTitle: "Blog post",
			kind: "blog_post", // unregistered kind — still accepted by open type
			label: null,
			preview: null,
			threadCount: 0,
			createdAt: "2026-06-08T00:00:00.000Z",
		};
		expect(a.kind).toBe("blog_post");
	});

	it("ArtifactPage exposes items + nextCursor", () => {
		const page: ArtifactPage = { items: [], nextCursor: null };
		expect(page.items).toEqual([]);
	});

	it("ArtifactFilterAxis is a discriminated union over the 3 axes (BB1: bet axis removed)", () => {
		// @lore BB1: the "bet" axis is deleted — artifacts formerly scoped to a bet
		// are now scoped to the root task that replaced it ("task" axis).
		const axes: ArtifactFilterAxis[] = [
			{ axis: "task", taskId: "t1" },
			{ axis: "product", teamId: "p1" },
			{ axis: "portfolio" },
		];
		expect(axes).toHaveLength(3);
	});
});

describe("isRegisteredKind", () => {
	it("returns true for each of the 6 registered kinds", () => {
		for (const kind of ARTIFACT_KINDS) {
			expect(isRegisteredKind(kind)).toBe(true);
		}
	});

	it("returns false for old business-domain kinds", () => {
		expect(isRegisteredKind("code_diff")).toBe(false);
		expect(isRegisteredKind("contract")).toBe(false);
		expect(isRegisteredKind("unknown_kind")).toBe(false);
	});

	it("returns false for arbitrary strings", () => {
		expect(isRegisteredKind("blog_post")).toBe(false);
		expect(isRegisteredKind("internet_meme")).toBe(false);
	});
});

describe("summarizePreview (6 registered kinds)", () => {
	it("returns a non-empty string for every registered kind", () => {
		for (const kind of ARTIFACT_KINDS) {
			const preview = makeFixturePreview(kind);
			const out = summarizePreview(preview);
			expect(out).toBeTypeOf("string");
			expect((out ?? "").length).toBeGreaterThan(0);
		}
	});

	it("returns null when preview is null", () => {
		expect(summarizePreview(null)).toBeNull();
	});

	it("returns the kind string for unregistered kinds", () => {
		const out = summarizePreview({ kind: "blog_post", title: "hello" });
		expect(out).toBe("blog_post");
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

	it("uses file path as title for code kind", () => {
		const a: Pick<Artifact, "preview" | "producingTaskTitle"> = {
			preview: { kind: "code", path: "src/index.ts", lang: "typescript", text: "const x = 1;" },
			producingTaskTitle: "code review",
		};
		expect(artifactDisplayTitle(a)).toBe("src/index.ts");
	});

	it("uses html title for html kind with title", () => {
		const a: Pick<Artifact, "preview" | "producingTaskTitle"> = {
			preview: { kind: "html", html: "<div/>", title: "Q4 Dashboard" },
			producingTaskTitle: "build dashboard",
		};
		expect(artifactDisplayTitle(a)).toBe("Q4 Dashboard");
	});

	it("falls back to task title when kind has no displayTitle logic", () => {
		const a: Pick<Artifact, "preview" | "producingTaskTitle"> = {
			preview: { kind: "text", body: "Hello world" },
			producingTaskTitle: "draft email",
		};
		// text kind returns null from displayTitle — falls back to task title
		expect(artifactDisplayTitle(a)).toBe("draft email");
	});
});

// --- helpers ---

function makeFixturePreview(kind: ArtifactKind): ArtifactPreview {
	switch (kind) {
		case "text":
			return { kind: "text", body: "Hello world" };
		case "code":
			return { kind: "code", path: "src/index.ts", lang: "typescript", text: "const x = 1;" };
		case "image":
			return { kind: "image", url: "https://example.com/img.png", width: 800, height: 600 };
		case "data":
			return { kind: "data", headlines: [{ label: "DAU", value: "1.2k" }] };
		case "html":
			return { kind: "html", html: "<div>hello</div>" };
		case "url":
			return { kind: "url", url: "https://example.com" };
	}
}
