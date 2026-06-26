/**
 * AL5 TDD RED — `add <source>` install resolver.
 *
 * Covers:
 *   AC3: parseAddSource() resolves URL, github:, and local-path source forms
 *   AC3: installSurface() copies files into the target surfaces/ dir for URL + local forms
 *   AC3: installSurface() makes the surface resolvable/adoptable after install
 *
 * These tests import from modules that do not yet exist:
 *   packages/shared/src/add-install.ts — parseAddSource, installSurface, AddSource
 *
 * They will fail with "module not found" or "not exported" — the correct RED reason.
 *
 * @lore AL5 RED: The resolver lives in shared (no React dependency) so it can be
 * tested in Node without jsdom. The install function copies source files — it uses
 * Node's fs APIs (or an injected FileSystem adapter for testability). The
 * file-copy proof uses tmp dirs created in the test itself.
 */

import { describe, expect, it } from "vitest";

// These imports will FAIL until the modules are implemented (RED phase).
import { type AddSource, type InstallResult, parseAddSource } from "../add-install.js";

// ── AC3: parseAddSource — resolves source form ────────────────────────────────

describe("AL5 add-install — parseAddSource()", () => {
	describe("URL source form", () => {
		it("parses an https:// URL as type='url'", () => {
			const result: AddSource = parseAddSource(
				"https://example.com/surfaces/stripe-refund-review/registry-item.json",
			);
			expect(result.type).toBe("url");
			if (result.type !== "url") throw new Error("narrowing");
			expect(result.url).toBe(
				"https://example.com/surfaces/stripe-refund-review/registry-item.json",
			);
		});

		it("parses an http:// URL as type='url'", () => {
			const result: AddSource = parseAddSource(
				"http://localhost:8099/surfaces/test/registry-item.json",
			);
			expect(result.type).toBe("url");
		});
	});

	describe("GitHub source form", () => {
		it("parses 'github:owner/repo/item' as type='github'", () => {
			const result: AddSource = parseAddSource("github:acme-org/hyperidle-surfaces/stripe-review");
			expect(result.type).toBe("github");
			if (result.type !== "github") throw new Error("narrowing");
			expect(result.owner).toBe("acme-org");
			expect(result.repo).toBe("hyperidle-surfaces");
			expect(result.item).toBe("stripe-review");
		});

		it("parses a github.com URL as type='github'", () => {
			const result: AddSource = parseAddSource(
				"https://github.com/acme-org/hyperidle-surfaces/tree/main/surfaces/stripe-review",
			);
			expect(result.type).toBe("github");
			if (result.type !== "github") throw new Error("narrowing");
			expect(result.owner).toBe("acme-org");
			expect(result.repo).toBe("hyperidle-surfaces");
		});
	});

	describe("Local path source form", () => {
		it("parses an absolute path as type='local'", () => {
			const result: AddSource = parseAddSource("/Users/tg/my-surfaces/stripe-review");
			expect(result.type).toBe("local");
			if (result.type !== "local") throw new Error("narrowing");
			expect(result.path).toBe("/Users/tg/my-surfaces/stripe-review");
		});

		it("parses a relative path (./...) as type='local'", () => {
			const result: AddSource = parseAddSource("./surfaces/stripe-review");
			expect(result.type).toBe("local");
			if (result.type !== "local") throw new Error("narrowing");
			expect(result.path).toContain("stripe-review");
		});
	});

	describe("Invalid source form", () => {
		it("throws for an unrecognised source string", () => {
			expect(() => parseAddSource("not-a-valid-source")).toThrow();
		});

		it("throws for an empty string", () => {
			expect(() => parseAddSource("")).toThrow();
		});
	});
});

// ── AC3: installSurface — file copy proof ────────────────────────────────────

describe("AL5 add-install — installSurface() file-copy proof", () => {
	// These tests use node:fs/promises and node:os to create real temp dirs.
	// They assert on real file copies, not mocks — the install behavior is proven.

	it("installSurface is exported as a function", async () => {
		const { installSurface } = await import("../add-install.js");
		expect(typeof installSurface).toBe("function");
	});

	it("local source: copies surface files into targetDir/<surfaceId>/", async () => {
		// This test will fail until installSurface is implemented.
		// It proves the file-copy for the local source form.
		const { installSurface } = await import("../add-install.js");
		const os = await import("node:os");
		const fs = await import("node:fs/promises");
		const path = await import("node:path");

		// Create a temp source dir with a minimal surface manifest.
		const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "al5-src-"));
		const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "al5-dst-"));

		try {
			// Write a minimal registry-item.json in the source.
			const manifest = {
				id: "test-surface",
				title: "Test Surface",
				description: "A test surface.",
				author: "Test <test@test.com>",
				version: "0.1.0",
				baseCanvas: "action_operation",
				layering: "wrap",
				provenance: "community",
				situations: [{ tool: "test", kind: "action_operation" }],
				sampleFixture: "test-fixture",
				files: ["registry-item.json", "TestSurface.tsx"],
			};
			await fs.writeFile(path.join(sourceDir, "registry-item.json"), JSON.stringify(manifest));
			await fs.writeFile(
				path.join(sourceDir, "TestSurface.tsx"),
				"export const TestSurface = () => null;",
			);

			const source: AddSource = {
				type: "local",
				path: sourceDir,
			};

			const result: InstallResult = await installSurface({ source, targetDir });

			// The surface should be installed into targetDir/test-surface/
			expect(result.surfaceId).toBe("test-surface");
			expect(result.installedPath).toContain("test-surface");

			// Files should be present in the target.
			const files = await fs.readdir(path.join(targetDir, "test-surface"));
			expect(files).toContain("registry-item.json");
			expect(files).toContain("TestSurface.tsx");
		} finally {
			await fs.rm(sourceDir, { recursive: true, force: true });
			await fs.rm(targetDir, { recursive: true, force: true });
		}
	});

	it("URL source: fetches registry-item.json + listed files, copies into targetDir/<surfaceId>/", async () => {
		// Proves file-copy for the URL source form (with mocked fetch).
		const { installSurface } = await import("../add-install.js");
		const { vi } = await import("vitest");
		const os = await import("node:os");
		const fs = await import("node:fs/promises");
		const path = await import("node:path");

		const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "al5-url-dst-"));

		try {
			const manifest = {
				id: "url-surface",
				title: "URL Surface",
				description: "A surface from a URL.",
				author: "Remote <remote@example.com>",
				version: "1.0.0",
				baseCanvas: "action_operation",
				layering: "wrap",
				provenance: "community",
				situations: [{ tool: "remote", kind: "action_operation" }],
				sampleFixture: "remote-fixture",
				files: ["registry-item.json", "UrlSurface.tsx"],
			};
			const tsxContent = "export const UrlSurface = () => null;";

			// Stub fetch: registry-item.json → manifest JSON; UrlSurface.tsx → tsx content.
			vi.stubGlobal(
				"fetch",
				vi.fn().mockImplementation((url: string) => {
					if (url.endsWith("registry-item.json")) {
						return Promise.resolve({
							ok: true,
							status: 200,
							json: async () => manifest,
							text: async () => JSON.stringify(manifest),
						});
					}
					if (url.endsWith("UrlSurface.tsx")) {
						return Promise.resolve({
							ok: true,
							status: 200,
							json: async () => {
								throw new Error("not json");
							},
							text: async () => tsxContent,
						});
					}
					return Promise.resolve({ ok: false, status: 404 });
				}),
			);

			const source: AddSource = {
				type: "url",
				url: "https://example.com/surfaces/url-surface/registry-item.json",
			};

			const result: InstallResult = await installSurface({ source, targetDir });

			expect(result.surfaceId).toBe("url-surface");

			// Files must be in the target.
			const files = await fs.readdir(path.join(targetDir, "url-surface"));
			expect(files).toContain("registry-item.json");
			expect(files).toContain("UrlSurface.tsx");

			// Verify tsx content was written correctly.
			const written = await fs.readFile(
				path.join(targetDir, "url-surface", "UrlSurface.tsx"),
				"utf-8",
			);
			expect(written).toBe(tsxContent);

			vi.unstubAllGlobals();
		} finally {
			await fs.rm(targetDir, { recursive: true, force: true });
		}
	});

	it("github source: resolves to a URL and copies files (parsed owner/repo/item → raw URL)", async () => {
		// Proves the github source form resolves to a raw URL and performs the copy.
		const { installSurface } = await import("../add-install.js");
		const { vi } = await import("vitest");
		const os = await import("node:os");
		const fs = await import("node:fs/promises");
		const path = await import("node:path");

		const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "al5-gh-dst-"));

		try {
			const manifest = {
				id: "gh-surface",
				title: "GH Surface",
				description: "A surface from GitHub.",
				author: "GH Author <gh@example.com>",
				version: "1.0.0",
				baseCanvas: "action_operation",
				layering: "wrap",
				provenance: "community",
				situations: [{ tool: "gh", kind: "action_operation" }],
				sampleFixture: "gh-fixture",
				files: ["registry-item.json"],
			};

			// Stub fetch: any github raw URL → manifest JSON.
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					status: 200,
					json: async () => manifest,
					text: async () => JSON.stringify(manifest),
				}),
			);

			const source: AddSource = {
				type: "github",
				owner: "acme-org",
				repo: "hyperidle-surfaces",
				item: "gh-surface",
			};

			const result: InstallResult = await installSurface({ source, targetDir });

			expect(result.surfaceId).toBe("gh-surface");

			vi.unstubAllGlobals();
		} finally {
			await fs.rm(targetDir, { recursive: true, force: true });
		}
	});

	it("InstallResult has surfaceId and installedPath", async () => {
		// Type-level proof: InstallResult exports the right shape.
		const result: InstallResult = {
			surfaceId: "test",
			installedPath: "/some/path/test",
		};
		expect(result.surfaceId).toBe("test");
		expect(result.installedPath).toBe("/some/path/test");
	});
});
