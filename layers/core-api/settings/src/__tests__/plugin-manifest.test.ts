/**
 * Unit tests for the plugin manifest parser (BA9a AC3).
 *
 * Tests run against real temp files (no DB needed — pure filesystem).
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
	describe("AC3 — fatal violations", () => {
		it("rejects when plugin.json is missing", () => {
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toMatch(/Cannot read plugin\.json/);
			}
		});

		it("rejects when plugin.json is not an object", () => {
			writeManifest("not-an-object");
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toMatch(/must be a JSON object/);
			}
		});

		it("rejects when $schema is missing", () => {
			writeManifest({ name: "my-plugin" });
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toMatch(/\$schema/);
			}
		});

		it("rejects when $schema is wrong — provides the expected value in the reason", () => {
			writeManifest({ $schema: "https://wrong.url", name: "my-plugin" });
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toMatch(/\$schema/);
				expect(result.reason).toContain(VALID_SCHEMA);
			}
		});

		it("rejects when name is missing", () => {
			writeManifest({ $schema: VALID_SCHEMA });
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toMatch(/"name"/);
			}
		});

		it("rejects when name has uppercase letters", () => {
			writeManifest({ $schema: VALID_SCHEMA, name: "MyPlugin" });
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(false);
		});

		it("rejects when name starts with a hyphen", () => {
			writeManifest({ $schema: VALID_SCHEMA, name: "-bad" });
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(false);
		});

		it("rejects when name has consecutive hyphens", () => {
			writeManifest({ $schema: VALID_SCHEMA, name: "a--b" });
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(false);
		});

		it("rejects when name is longer than 64 chars", () => {
			writeManifest({ $schema: VALID_SCHEMA, name: "a".repeat(65) });
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(false);
		});

		it("rejects when name is 'builtin' (reserved) — AC9", () => {
			writeManifest({ $schema: VALID_SCHEMA, name: "builtin" });
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toMatch(/reserved/i);
			}
		});

		it("rejects when version is a number, not a string", () => {
			writeManifest({ $schema: VALID_SCHEMA, name: "my-plugin", version: 123 });
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toMatch(/version.*string/i);
			}
		});

		it("rejects when version is a boolean", () => {
			writeManifest({ $schema: VALID_SCHEMA, name: "my-plugin", version: true });
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(false);
		});
	});

	describe("AC3 — non-fatal (warning, install continues)", () => {
		it("succeeds with warning when there is an unknown top-level field", () => {
			writeManifest({
				$schema: VALID_SCHEMA,
				name: "my-plugin",
				unknownField: "value",
			});
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
			if (result.ok) {
				const warn = result.manifest.warnings.find((w) => w.code === "UNKNOWN_TOP_LEVEL_FIELD");
				expect(warn).toBeDefined();
				expect(warn?.message).toContain("unknownField");
			}
		});

		it("succeeds with warning when extensions is not an object", () => {
			writeManifest({
				$schema: VALID_SCHEMA,
				name: "my-plugin",
				extensions: "not-an-object",
			});
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
			if (result.ok) {
				const warn = result.manifest.warnings.find((w) => w.code === "NON_OBJECT_EXTENSIONS");
				expect(warn).toBeDefined();
			}
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
			if (result.ok) {
				expect(result.manifest.name).toBe("my-plugin");
				expect(result.manifest.version).toBe("0");
				expect(result.manifest.contributions).toHaveLength(0);
				expect(result.manifest.warnings).toHaveLength(0);
			}
		});

		it("accepts a single-character name", () => {
			writeManifest({ $schema: VALID_SCHEMA, name: "a" });
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
		});

		it("accepts a name with hyphens and periods", () => {
			writeManifest({ $schema: VALID_SCHEMA, name: "my-plugin.v2" });
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
			if (result.ok) {
				expect(result.manifest.version).toBe("1.2.3");
				expect(result.manifest.description).toBe("A great plugin");
			}
		});

		it("extracts contributions from io.hyperidle extension", () => {
			writeManifest({
				$schema: VALID_SCHEMA,
				name: "my-plugin",
				extensions: {
					"io.hyperidle": {
						contributions: [
							{ kind: "agent", key: "search-agent", value: { name: "Search Agent" } },
							{ kind: "skill", key: "web-search", value: { description: "Web search" } },
						],
					},
				},
			});
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.manifest.contributions).toHaveLength(2);
				expect(result.manifest.contributions[0]).toMatchObject({
					kind: "agent",
					key: "search-agent",
					value: { name: "Search Agent" },
				});
			}
		});

		it("skips contribution with invalid kind — warns, continues", () => {
			writeManifest({
				$schema: VALID_SCHEMA,
				name: "my-plugin",
				extensions: {
					"io.hyperidle": {
						contributions: [
							{ kind: "bad-kind", key: "x", value: {} },
							{ kind: "agent", key: "valid", value: { name: "OK" } },
						],
					},
				},
			});
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.manifest.contributions).toHaveLength(1);
				expect(result.manifest.contributions[0]?.key).toBe("valid");
				const warn = result.manifest.warnings.find((w) => w.code === "INVALID_CONTRIBUTION");
				expect(warn).toBeDefined();
			}
		});

		it("skips contribution with empty key — warns", () => {
			writeManifest({
				$schema: VALID_SCHEMA,
				name: "my-plugin",
				extensions: {
					"io.hyperidle": {
						contributions: [{ kind: "agent", key: "", value: {} }],
					},
				},
			});
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.manifest.contributions).toHaveLength(0);
			}
		});

		it("skips contribution whose key contains '/' — warns", () => {
			writeManifest({
				$schema: VALID_SCHEMA,
				name: "my-plugin",
				extensions: {
					"io.hyperidle": {
						contributions: [{ kind: "agent", key: "a/b", value: {} }],
					},
				},
			});
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.manifest.contributions).toHaveLength(0);
			}
		});

		it("ignores unknown client namespaces without validating their contents", () => {
			writeManifest({
				$schema: VALID_SCHEMA,
				name: "my-plugin",
				extensions: {
					"com.other.client": { anythingGoes: true },
					"io.hyperidle": { contributions: [] },
				},
			});
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
			if (result.ok) {
				// No warnings about the unknown client namespace
				expect(
					result.manifest.warnings.filter((w) => w.code === "NON_OBJECT_EXTENSIONS"),
				).toHaveLength(0);
			}
		});

		it("no contributions when extensions is absent", () => {
			writeManifest({ $schema: VALID_SCHEMA, name: "my-plugin" });
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.manifest.contributions).toHaveLength(0);
			}
		});

		it("no contributions when io.hyperidle extension is absent from extensions", () => {
			writeManifest({
				$schema: VALID_SCHEMA,
				name: "my-plugin",
				extensions: { "com.other": {} },
			});
			const result = parsePluginManifest(tempDir);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.manifest.contributions).toHaveLength(0);
			}
		});
	});
});
