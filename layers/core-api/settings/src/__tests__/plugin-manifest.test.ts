/**
 * The plugin manifest parser: fatal violations refuse the install, some
 * shapes only warn, and valid manifests parse cleanly. Runs against real
 * temp files (no DB needed — pure filesystem).
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parsePluginManifest } from "../plugin-manifest.js";

const VALID_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

let tempDir: string;

beforeEach(() => {
	tempDir = join(tmpdir(), `manifest-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

function writeManifest(content: unknown): void {
	writeFileSync(join(tempDir, "plugin.json"), JSON.stringify(content), "utf8");
}

describe("parsePluginManifest", () => {
	describe("fatal violations", () => {
		it.each([
			["plugin.json is missing", undefined, /Cannot read plugin\.json/],
			["plugin.json is not an object", "not-an-object", /must be a JSON object/],
			["$schema is missing", { name: "my-plugin" }, /\$schema/],
			[
				"$schema is wrong — reason names the expected value",
				{ $schema: "https://wrong.url", name: "my-plugin" },
				VALID_SCHEMA,
			],
			["name is missing", { $schema: VALID_SCHEMA }, /"name"/],
			["name has uppercase letters", { $schema: VALID_SCHEMA, name: "MyPlugin" }, null],
			["name starts with a hyphen", { $schema: VALID_SCHEMA, name: "-bad" }, null],
			["name has consecutive hyphens", { $schema: VALID_SCHEMA, name: "a--b" }, null],
			["name is longer than 64 chars", { $schema: VALID_SCHEMA, name: "a".repeat(65) }, null],
			[
				"version is a number, not a string",
				{ $schema: VALID_SCHEMA, name: "my-plugin", version: 123 },
				/version.*string/i,
			],
			["version is a boolean", { $schema: VALID_SCHEMA, name: "my-plugin", version: true }, null],
		] as const)("rejects when %s", (_desc, content, reasonMatch) => {
			if (content !== undefined) writeManifest(content);
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("expected a fatal violation");
			if (!reasonMatch) return;
			expect(result.reason).toMatch(reasonMatch);
		});
	});

	describe("non-fatal (warning, install continues)", () => {
		it("succeeds with warning when there is an unknown top-level field", () => {
			writeManifest({
				$schema: VALID_SCHEMA,
				name: "my-plugin",
				unknownField: "value",
			});
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error("expected a successful parse");
			const warn = result.manifest.warnings.find((w) => w.code === "UNKNOWN_TOP_LEVEL_FIELD");
			expect(warn).toBeDefined();
			expect(warn?.message).toContain("unknownField");
		});

		it("succeeds with warning when extensions is not an object", () => {
			writeManifest({
				$schema: VALID_SCHEMA,
				name: "my-plugin",
				extensions: "not-an-object",
			});
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error("expected a successful parse");
			const warn = result.manifest.warnings.find((w) => w.code === "NON_OBJECT_EXTENSIONS");
			expect(warn).toBeDefined();
		});

		it("succeeds with warning when extensions is an array", () => {
			writeManifest({
				$schema: VALID_SCHEMA,
				name: "my-plugin",
				extensions: [1, 2, 3],
			});
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
		});
	});

	describe("valid manifests", () => {
		it("parses a minimal valid manifest", () => {
			writeManifest({ $schema: VALID_SCHEMA, name: "my-plugin" });
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error("expected a successful parse");
			expect(result.manifest.name).toBe("my-plugin");
			expect(result.manifest.version).toBe("0");
			expect(result.manifest.warnings).toHaveLength(0);
		});

		it.each([
			["a single-character name", "a"],
			["a name with hyphens and periods", "my-plugin.v2"],
		])("accepts %s", (_desc, name) => {
			writeManifest({ $schema: VALID_SCHEMA, name });
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
		});

		it("parses version and description", () => {
			writeManifest({
				$schema: VALID_SCHEMA,
				name: "my-plugin",
				version: "1.2.3",
				description: "A great plugin",
			});
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error("expected a successful parse");
			expect(result.manifest.version).toBe("1.2.3");
			expect(result.manifest.description).toBe("A great plugin");
		});

		it("ignores unknown client namespaces without validating their contents", () => {
			writeManifest({
				$schema: VALID_SCHEMA,
				name: "my-plugin",
				extensions: {
					"com.other.client": { anythingGoes: true },
					"io.hyperidle": { agents: [] },
				},
			});
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error("expected a successful parse");
			// No warnings about the unknown client namespace
			expect(
				result.manifest.warnings.filter((w) => w.code === "NON_OBJECT_EXTENSIONS"),
			).toHaveLength(0);
		});
	});
});
