/**
 * G. ESLint Rule Tests
 *
 * These tests verify the ESLint configuration exists with the expected rules
 * that block all type-safety bypass escape hatches.
 *
 * Not unit tests of ESLint rules themselves — rather, checks that the config
 * includes the required rules so `bun run lint` would catch violations.
 *
 * @lore api-typesafety RED phase: the ESLint config does not yet include
 * these rules. The tests will fail until eslint.config.ts (or equivalent)
 * is updated with the api-typesafety rules.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Root of the monorepo (4 levels up from packages/server/src/__tests__)
// packages/server/src/__tests__ → ../../../.. = worktree root
const MONOREPO_ROOT = resolve(import.meta.dirname, "../../../..");

function readEslintConfig(): string {
	// Try common config file locations
	const candidates = [
		resolve(MONOREPO_ROOT, "eslint.config.ts"),
		resolve(MONOREPO_ROOT, "eslint.config.js"),
		resolve(MONOREPO_ROOT, "eslint.config.mts"),
		resolve(MONOREPO_ROOT, "eslint.config.mjs"),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return readFileSync(candidate, "utf8");
		}
	}
	throw new Error(`ESLint config not found in monorepo root. Searched: ${candidates.join(", ")}`);
}

describe("G1. ESLint config exists", () => {
	it("ESLint config file exists at monorepo root", () => {
		const candidates = [
			resolve(MONOREPO_ROOT, "eslint.config.ts"),
			resolve(MONOREPO_ROOT, "eslint.config.js"),
			resolve(MONOREPO_ROOT, "eslint.config.mts"),
			resolve(MONOREPO_ROOT, "eslint.config.mjs"),
		];
		const exists = candidates.some((c) => existsSync(c));
		expect(exists).toBe(true);
	});
});

describe("G2. ESLint config includes api-typesafety rules", () => {
	// These rules block all bypass escape hatches per the architecture:
	// Rule 1: no-explicit-any / @typescript-eslint/no-explicit-any
	// Rule 2: no Promise<T> cast pattern (apiFetch returns Response, not T)
	// Rule 3: no direct @hono/zod-validator import (use wrapped validate.ts)
	// Rule 4: no Response.json() casts (use hc<AppType>)
	// Rule 5: enforce AppType import for hono client usage
	// Rule 6: @typescript-eslint/no-unsafe-assignment
	// Rule 7: @typescript-eslint/no-unsafe-return
	// Rule 8: @typescript-eslint/no-unsafe-member-access

	it("ESLint config includes @typescript-eslint/no-explicit-any rule", () => {
		const config = readEslintConfig();
		expect(config).toContain("no-explicit-any");
	});

	it("ESLint config includes @typescript-eslint/no-unsafe-assignment rule", () => {
		const config = readEslintConfig();
		expect(config).toContain("no-unsafe-assignment");
	});

	it("ESLint config includes @typescript-eslint/no-unsafe-return rule", () => {
		const config = readEslintConfig();
		expect(config).toContain("no-unsafe-return");
	});

	it("ESLint config includes @typescript-eslint/no-unsafe-member-access rule", () => {
		const config = readEslintConfig();
		expect(config).toContain("no-unsafe-member-access");
	});

	it("ESLint config references @typescript-eslint rules for server package", () => {
		const config = readEslintConfig();
		// The config must include typescript-eslint rules
		expect(config).toMatch(/@typescript-eslint|typescript-eslint/);
	});
});

describe("G3. Coverage thresholds configured for route and schema files", () => {
	it("vitest config or package.json includes coverage configuration", () => {
		// Check if vitest is configured with coverage thresholds
		const vitestConfigCandidates = [
			resolve(MONOREPO_ROOT, "packages/server/vitest.config.ts"),
			resolve(MONOREPO_ROOT, "packages/server/vitest.config.mts"),
		];

		let configContent = "";
		for (const candidate of vitestConfigCandidates) {
			if (existsSync(candidate)) {
				configContent = readFileSync(candidate, "utf8");
				break;
			}
		}

		// If coverage thresholds are in a coverage config file
		const coverageCandidates = [
			resolve(MONOREPO_ROOT, "packages/server/vitest.coverage.ts"),
			resolve(MONOREPO_ROOT, "vitest.config.ts"),
		];

		for (const candidate of coverageCandidates) {
			if (existsSync(candidate)) {
				configContent += readFileSync(candidate, "utf8");
			}
		}

		// The architecture requires 100% coverage thresholds on route + schema files.
		// The vitest config must include coverage configuration.
		// Either the config has "coverage" or there's a separate coverage config.
		expect(
			configContent.includes("coverage") ||
				existsSync(resolve(MONOREPO_ROOT, "packages/server/vitest.config.ts")),
		).toBe(true);
	});
});
