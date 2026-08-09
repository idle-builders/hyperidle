// AE6 RED — Kind registry and Kind Definition unit tests.
// Source of truth: plans/AE6/architecture.md §11 AC-1, AC-2, AC-3
//
// These tests will FAIL until the green phase creates the implementation.

import { describe, expect, it } from "vitest";
// These imports will fail until the implementation exists.
import {
	ARTIFACT_KINDS,
	codeKind,
	dataKind,
	getKindDefinition,
	htmlKind,
	imageKind,
	isRegisteredKind,
	type KindDefinition,
	textKind,
	urlKind,
} from "../kinds/registry.js";

// -------------------------------------------------------------------
// AC-1: Kind registry functions work for registered / unregistered kinds
// -------------------------------------------------------------------

describe("ARTIFACT_KINDS (AE6: 6 fundamental kinds)", () => {
	it("contains exactly the 6 fundamental kinds", () => {
		expect(ARTIFACT_KINDS).toEqual(["text", "code", "image", "data", "html", "url"]);
	});

	it("does NOT contain old business-domain kinds", () => {
		expect(ARTIFACT_KINDS).not.toContain("code_diff");
		expect(ARTIFACT_KINDS).not.toContain("contract");
		expect(ARTIFACT_KINDS).not.toContain("unknown_kind");
		expect(ARTIFACT_KINDS).not.toContain("drafted_email");
	});
});

describe("getKindDefinition", () => {
	it("returns a KindDefinition for each of the 6 registered kinds", () => {
		for (const kind of ["text", "code", "image", "data", "html", "url"]) {
			const def = getKindDefinition(kind);
			expect(def).toBeDefined();
			expect(def?.kind).toBe(kind);
		}
	});

	it("returns undefined for an unregistered kind", () => {
		expect(getKindDefinition("blog_post")).toBeUndefined();
		expect(getKindDefinition("unknown_kind")).toBeUndefined();
		expect(getKindDefinition("internet_meme")).toBeUndefined();
	});
});

describe("isRegisteredKind", () => {
	it("returns true for each of the 6 registered kinds", () => {
		expect(isRegisteredKind("text")).toBe(true);
		expect(isRegisteredKind("code")).toBe(true);
		expect(isRegisteredKind("image")).toBe(true);
		expect(isRegisteredKind("data")).toBe(true);
		expect(isRegisteredKind("html")).toBe(true);
		expect(isRegisteredKind("url")).toBe(true);
	});

	it("returns false for unregistered kinds", () => {
		expect(isRegisteredKind("blog_post")).toBe(false);
		expect(isRegisteredKind("unknown_kind")).toBe(false);
		expect(isRegisteredKind("code_diff")).toBe(false);
		expect(isRegisteredKind("contract")).toBe(false);
	});
});

// -------------------------------------------------------------------
// AC-2: Each Kind Definition has all required members
// -------------------------------------------------------------------

describe("KindDefinition interface — all 6 kinds have required members", () => {
	const allKinds: KindDefinition[] = [textKind, codeKind, imageKind, dataKind, htmlKind, urlKind];

	for (const def of allKinds) {
		it(`${def.kind} kind has a kind string`, () => {
			expect(typeof def.kind).toBe("string");
			expect(def.kind.length).toBeGreaterThan(0);
		});

		it(`${def.kind} kind has a previewSchema`, () => {
			expect(def.previewSchema).toBeDefined();
			// Zod schemas expose a parse method
			expect(typeof def.previewSchema.parse).toBe("function");
		});

		it(`${def.kind} kind has a displayTitle function`, () => {
			expect(typeof def.displayTitle).toBe("function");
		});

		it(`${def.kind} kind has a summarize function`, () => {
			expect(typeof def.summarize).toBe("function");
		});
	}
});

// -------------------------------------------------------------------
// Preview schema validation per kind
// -------------------------------------------------------------------

describe("text kind preview schema", () => {
	it("validates correct text preview data", () => {
		const result = textKind.previewSchema.safeParse({ kind: "text", body: "Hello world" });
		expect(result.success).toBe(true);
	});

	it("validates text preview with optional format", () => {
		const result = textKind.previewSchema.safeParse({
			kind: "text",
			body: "Some content",
			format: "markdown",
		});
		expect(result.success).toBe(true);
	});

	it("rejects text preview missing body", () => {
		const result = textKind.previewSchema.safeParse({ kind: "text" });
		expect(result.success).toBe(false);
	});

	it("rejects text preview with wrong kind discriminant", () => {
		const result = textKind.previewSchema.safeParse({
			kind: "code",
			body: "some text",
		});
		expect(result.success).toBe(false);
	});
});

// AM5 K4b: code schema purified from {file,hunks} to {path,lang,text}
describe("code kind preview schema", () => {
	it("validates correct code preview data (pure {path,lang,text} shape)", () => {
		const result = codeKind.previewSchema.safeParse({
			kind: "code",
			path: "src/index.ts",
			lang: "typescript",
			text: "const x = 1;",
		});
		expect(result.success).toBe(true);
	});

	it("validates code preview with null lang", () => {
		const result = codeKind.previewSchema.safeParse({
			kind: "code",
			path: "src/app.ts",
			lang: null,
			text: "export default function App() { return null; }",
		});
		expect(result.success).toBe(true);
	});

	it("rejects code preview missing path", () => {
		const result = codeKind.previewSchema.safeParse({ kind: "code", lang: "ts", text: "x" });
		expect(result.success).toBe(false);
	});

	it("rejects code preview missing text", () => {
		const result = codeKind.previewSchema.safeParse({ kind: "code", path: "x.ts", lang: null });
		expect(result.success).toBe(false);
	});

	it("rejects old {file,hunks} shape (K0 violation removed)", () => {
		const result = codeKind.previewSchema.safeParse({
			kind: "code",
			file: "src/index.ts",
			hunks: [],
		});
		expect(result.success).toBe(false);
	});
});

describe("image kind preview schema", () => {
	it("validates correct image preview data", () => {
		const result = imageKind.previewSchema.safeParse({
			kind: "image",
			url: "https://example.com/img.png",
			width: 800,
			height: 600,
		});
		expect(result.success).toBe(true);
	});

	it("validates image preview with optional alt", () => {
		const result = imageKind.previewSchema.safeParse({
			kind: "image",
			url: "https://example.com/img.png",
			width: 800,
			height: 600,
			alt: "Screenshot of dashboard",
		});
		expect(result.success).toBe(true);
	});

	it("rejects image preview missing url", () => {
		const result = imageKind.previewSchema.safeParse({ kind: "image", width: 800, height: 600 });
		expect(result.success).toBe(false);
	});

	it("rejects image preview missing dimensions", () => {
		const result = imageKind.previewSchema.safeParse({
			kind: "image",
			url: "https://example.com/img.png",
		});
		expect(result.success).toBe(false);
	});
});

describe("data kind preview schema", () => {
	it("validates correct data preview with headlines", () => {
		const result = dataKind.previewSchema.safeParse({
			kind: "data",
			headlines: [{ label: "DAU", value: "1.2k" }],
		});
		expect(result.success).toBe(true);
	});

	it("validates data preview with optional rows and charts", () => {
		const result = dataKind.previewSchema.safeParse({
			kind: "data",
			headlines: [{ label: "Count", value: "42" }],
			rows: [{ metric: "value" }],
			charts: [{ label: "Trend", values: [1, 2, 3] }],
		});
		expect(result.success).toBe(true);
	});

	it("rejects data preview with missing headlines", () => {
		const result = dataKind.previewSchema.safeParse({ kind: "data" });
		expect(result.success).toBe(false);
	});
});

describe("html kind preview schema", () => {
	it("validates correct html preview data", () => {
		const result = htmlKind.previewSchema.safeParse({
			kind: "html",
			html: "<div>Hello</div>",
		});
		expect(result.success).toBe(true);
	});

	it("validates html preview with optional title", () => {
		const result = htmlKind.previewSchema.safeParse({
			kind: "html",
			html: "<div>Dashboard</div>",
			title: "Q4 Dashboard",
		});
		expect(result.success).toBe(true);
	});

	it("rejects html preview missing html field", () => {
		const result = htmlKind.previewSchema.safeParse({ kind: "html" });
		expect(result.success).toBe(false);
	});
});

describe("url kind preview schema", () => {
	it("validates correct url preview data", () => {
		const result = urlKind.previewSchema.safeParse({
			kind: "url",
			url: "https://example.com/service",
		});
		expect(result.success).toBe(true);
	});

	it("validates url preview with optional status fields", () => {
		const result = urlKind.previewSchema.safeParse({
			kind: "url",
			url: "https://example.com/service",
			status: "ok",
			statusLabel: "Healthy",
		});
		expect(result.success).toBe(true);
	});

	it("rejects url preview with invalid status value", () => {
		const result = urlKind.previewSchema.safeParse({
			kind: "url",
			url: "https://example.com",
			status: "healthy", // not in enum
		});
		expect(result.success).toBe(false);
	});

	it("rejects url preview missing url", () => {
		const result = urlKind.previewSchema.safeParse({ kind: "url" });
		expect(result.success).toBe(false);
	});
});

// -------------------------------------------------------------------
// summarize and displayTitle delegation
// -------------------------------------------------------------------

describe("summarize delegation via getKindDefinition", () => {
	it("summarizes a text kind preview", () => {
		const def = getKindDefinition("text");
		expect(def).toBeDefined();
		const summary = def?.summarize({ kind: "text", body: "Hello world" });
		expect(typeof summary).toBe("string");
		expect((summary ?? "").length).toBeGreaterThan(0);
	});

	it("summarizes a code kind preview", () => {
		const def = getKindDefinition("code");
		// AM5 K4b: code schema purified to {path,lang,text}
		const summary = def?.summarize({
			kind: "code",
			path: "src/index.ts",
			lang: null,
			text: "const x = 1;",
		});
		expect(typeof summary).toBe("string");
	});

	it("summarizes an image kind preview", () => {
		const def = getKindDefinition("image");
		const summary = def?.summarize({
			kind: "image",
			url: "https://example.com/img.png",
			width: 800,
			height: 600,
		});
		expect(typeof summary).toBe("string");
	});

	it("summarizes a data kind preview", () => {
		const def = getKindDefinition("data");
		const summary = def?.summarize({
			kind: "data",
			headlines: [{ label: "DAU", value: "1.2k" }],
		});
		expect(typeof summary).toBe("string");
	});

	it("summarizes an html kind preview", () => {
		const def = getKindDefinition("html");
		const summary = def?.summarize({ kind: "html", html: "<div>hello</div>", title: "My Page" });
		expect(typeof summary).toBe("string");
	});

	it("summarizes a url kind preview", () => {
		const def = getKindDefinition("url");
		const summary = def?.summarize({
			kind: "url",
			url: "https://example.com",
			status: "ok",
			statusLabel: "OK",
		});
		expect(typeof summary).toBe("string");
	});

	it("returns null for null preview input", () => {
		const def = getKindDefinition("text");
		const summary = def?.summarize(null);
		expect(summary).toBeNull();
	});
});

describe("displayTitle delegation via getKindDefinition", () => {
	it("returns a title or null for text kind preview", () => {
		const def = getKindDefinition("text");
		const title = def?.displayTitle({ kind: "text", body: "Some text" });
		// Either returns a string or null (null means fall back to task title)
		expect(title === null || typeof title === "string").toBe(true);
	});

	it("returns the path as title for code kind preview", () => {
		const def = getKindDefinition("code");
		// AM5 K4b: code schema purified to {path,lang,text}
		const title = def?.displayTitle({
			kind: "code",
			path: "src/index.ts",
			lang: null,
			text: "const x = 1;",
		});
		expect(title).toBe("src/index.ts");
	});

	it("returns null for preview that has no obvious title", () => {
		const def = getKindDefinition("image");
		const title = def?.displayTitle({ kind: "image", url: "https://x", width: 1, height: 1 });
		// image preview has no title field — expect null
		expect(title).toBeNull();
	});
});

// -------------------------------------------------------------------
// AC-3: OLD_KIND_MAP covers all 13 old kinds
// -------------------------------------------------------------------

describe("OLD_KIND_MAP covers all 13 old kinds", () => {
	it("contains all 13 old kinds as keys", async () => {
		const { OLD_KIND_MAP } = await import("../kinds/old-kind-map.js");

		const expectedOldKinds = [
			"code_diff",
			"contract",
			"drafted_email",
			"decision",
			"data_analysis",
			"comm_draft",
			"deck",
			"dashboard",
			"screenshot",
			"design",
			"verification",
			"running_service",
			"unknown_kind",
		];

		for (const oldKind of expectedOldKinds) {
			expect(OLD_KIND_MAP).toHaveProperty(oldKind);
		}
	});

	it("maps each old kind to a new fundamental kind", async () => {
		const { OLD_KIND_MAP } = await import("../kinds/old-kind-map.js");
		const fundamentalKinds = new Set(["text", "code", "image", "data", "html", "url"]);

		for (const [oldKind, mapping] of Object.entries(OLD_KIND_MAP)) {
			expect(
				fundamentalKinds.has(mapping.kind),
				`${oldKind} -> ${mapping.kind} is not fundamental`,
			).toBe(true);
		}
	});

	it("maps code_diff to code with null label", async () => {
		const { OLD_KIND_MAP } = await import("../kinds/old-kind-map.js");
		expect(OLD_KIND_MAP["code_diff"]).toEqual({ kind: "code", label: null });
	});

	it("maps contract to text with label 'contract'", async () => {
		const { OLD_KIND_MAP } = await import("../kinds/old-kind-map.js");
		expect(OLD_KIND_MAP["contract"]).toEqual({ kind: "text", label: "contract" });
	});

	it("maps unknown_kind to text with null label", async () => {
		const { OLD_KIND_MAP } = await import("../kinds/old-kind-map.js");
		expect(OLD_KIND_MAP["unknown_kind"]).toEqual({ kind: "text", label: null });
	});
});

// -------------------------------------------------------------------
// Read-time normalization of old preview shapes
// -------------------------------------------------------------------

// AM5 K4b: the {file,hunks} forward-compat is no longer needed — the pre-alpha purge
// removes the old shape entirely. The test is updated to document the new rejection behavior.
describe("read-time normalization: old preview shapes", () => {
	it("code kind REJECTS old code_diff-style preview with file + hunks (K4b purge)", () => {
		// After AM5 K4b, the old {file,hunks} shape is no longer accepted.
		// Existing code_diff artifacts are migrated; the schema is the pure content shape.
		const result = codeKind.previewSchema.safeParse({
			kind: "code",
			file: "src/index.ts",
			hunks: [],
		});
		expect(result.success).toBe(false);
	});
});
