/**
 * U5 — Shared Types + Frontend Type Sweep validation tests.
 *
 * These tests assert the acceptance criteria for U5:
 *   1. Shim files have been deleted (useProduct.ts, useProducts.ts, SettingsProducts.tsx).
 *   2. WorkProduct.tsx has been renamed to WorkTeam.tsx.
 *   3. BetDetail type exports correct shape: description not pitch, no product field, has atRisk.
 *   4. Settings types export TeamSetting (not ProductSetting).
 *   5. No "product" in domain sense remains across packages/web/src.
 *
 * This is a structural / shape test — not a runtime behavior test. It verifies
 * the rename is complete by inspecting the file system and type exports.
 *
 * @lore U5: These tests are written in the RED phase. They will all fail until
 * the green phase implementation is complete. The structural assertions use
 * fs.existsSync so they run without importing the files under test.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Resolve the packages/web/src root relative to this test file.
const SRC = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// AC1: Shim files must NOT exist after U5
// ---------------------------------------------------------------------------

describe("U5 AC1: shim files deleted", () => {
	it("useProduct.ts does not exist", () => {
		const shimPath = path.join(SRC, "hooks", "useProduct.ts");
		expect(fs.existsSync(shimPath), `shim still exists: ${shimPath}`).toBe(false);
	});

	it("useProducts.ts does not exist", () => {
		const shimPath = path.join(SRC, "hooks", "useProducts.ts");
		expect(fs.existsSync(shimPath), `shim still exists: ${shimPath}`).toBe(false);
	});

	it("SettingsProducts.tsx does not exist", () => {
		const shimPath = path.join(SRC, "settings", "SettingsProducts.tsx");
		expect(fs.existsSync(shimPath), `shim still exists: ${shimPath}`).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// AC2: WorkProduct.tsx renamed to WorkTeam.tsx
// ---------------------------------------------------------------------------

describe("U5 AC2: WorkProduct.tsx renamed to WorkTeam.tsx", () => {
	it("WorkProduct.tsx does not exist", () => {
		const oldPath = path.join(SRC, "pages", "WorkProduct.tsx");
		expect(fs.existsSync(oldPath), `old file still exists: ${oldPath}`).toBe(false);
	});

	it("WorkTeam.tsx exists", () => {
		const newPath = path.join(SRC, "pages", "WorkTeam.tsx");
		expect(fs.existsSync(newPath), `renamed file missing: ${newPath}`).toBe(true);
	});

	it("WorkProduct.stories.tsx does not exist", () => {
		const oldPath = path.join(SRC, "pages", "WorkProduct.stories.tsx");
		expect(fs.existsSync(oldPath), `old file still exists: ${oldPath}`).toBe(false);
	});

	it("WorkTeam.stories.tsx exists", () => {
		const newPath = path.join(SRC, "pages", "WorkTeam.stories.tsx");
		expect(fs.existsSync(newPath), `renamed file missing: ${newPath}`).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AC3: BetDetail type shape — description not pitch, no product field, has atRisk
// ---------------------------------------------------------------------------

describe("U5 AC3: BetDetail type shape", () => {
	it("BetDetail has 'description' field (not 'pitch')", async () => {
		const { MOCK_BETS } = await import("../pages/__fixtures__/work-bet-fixtures");
		const bet = MOCK_BETS.b1;
		// After U5: description replaces pitch
		expect("description" in bet).toBe(true);
		expect("pitch" in bet).toBe(false);
	});

	it("BetDetail has 'atRisk' boolean field", async () => {
		const { MOCK_BETS } = await import("../pages/__fixtures__/work-bet-fixtures");
		const bet = MOCK_BETS.b1;
		expect("atRisk" in bet).toBe(true);
		expect(typeof bet.atRisk).toBe("boolean");
	});

	it("BetDetail does NOT have a 'product' field", async () => {
		const { MOCK_BETS } = await import("../pages/__fixtures__/work-bet-fixtures");
		const bet = MOCK_BETS.b1;
		// The 'product' field should have been removed; only 'team' remains.
		expect("product" in bet).toBe(false);
	});

	it("BetDetail still has 'team' field", async () => {
		const { MOCK_BETS } = await import("../pages/__fixtures__/work-bet-fixtures");
		const bet = MOCK_BETS.b1;
		expect("team" in bet).toBe(true);
		expect(typeof bet.team).toBe("string");
	});
});

// ---------------------------------------------------------------------------
// AC4: Settings types export TeamSetting (not ProductSetting)
// ---------------------------------------------------------------------------

describe("U5 AC4: settings-types exports TeamSetting", () => {
	it("exports TeamSetting interface", async () => {
		// Dynamic import to check the named export exists
		const settingsTypes = await import("../settings/settings-types");
		// TypeScript types are erased at runtime, but we can check the module doesn't
		// reference old names by ensuring no ProductSetting key in exports.
		// The actual shape check happens via TypeScript compilation (npm run check).
		// Here we verify the module loads without error (imports resolved).
		expect(settingsTypes).toBeDefined();
	});

	it("settings-types.ts does not contain 'ProductSetting' identifier", () => {
		const filePath = path.join(SRC, "settings", "settings-types.ts");
		const content = fs.readFileSync(filePath, "utf-8");
		// ProductSetting should not appear as a type definition (allow lore comments)
		const lines = content.split("\n");
		const codeLines = lines.filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"));
		const hasProductSetting = codeLines.some((line) => line.includes("ProductSetting"));
		expect(hasProductSetting).toBe(false);
	});

	it("settings-types.ts contains 'mutedTeams' (not 'mutedProducts')", () => {
		const filePath = path.join(SRC, "settings", "settings-types.ts");
		const content = fs.readFileSync(filePath, "utf-8");
		expect(content).toContain("mutedTeams");
		// Allow lore-comment references to old name; disallow code references
		const lines = content.split("\n");
		const codeLines = lines.filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"));
		const hasMutedProducts = codeLines.some((line) => line.includes("mutedProducts"));
		expect(hasMutedProducts).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// AC5: No domain-sense "product" references in packages/web/src
// ---------------------------------------------------------------------------

/**
 * Scan a directory recursively and return all .ts/.tsx files.
 */
function collectSourceFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			// Skip node_modules
			if (entry.name === "node_modules") continue;
			results.push(...collectSourceFiles(fullPath));
		} else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
			results.push(fullPath);
		}
	}
	return results;
}

/**
 * Domain-sense "product" patterns that must NOT appear in code after U5.
 * These are exact patterns targeting the old domain concept.
 *
 * Exclusions (legitimate uses to ignore):
 *   - @lore comments (document history)
 *   - "production" / "productivity" (different words)
 *   - axis: "product" in ArtifactFilterAxis (a scope value from shared, not the entity)
 *   - Knowledge scope references ("Knowledge.*product")
 *   - Lines entirely commented out (// or * comment lines)
 *   - This very test file
 */
function isDomainProductLine(line: string, filePath: string): boolean {
	// Skip this test file itself
	if (filePath.includes("U5-type-sweep.test.ts")) return false;

	const trimmed = line.trim();

	// Skip pure comment lines
	if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;

	// Skip lines with @lore (documentation of the rename history)
	if (line.includes("@lore")) return false;

	// Strip inline comments (keep code part only)
	const codePart = line.split("//")[0] ?? line;

	// Legitimate uses:
	// - "production", "productivity" words
	if (/\bproducti(?:on|vity)\b/i.test(codePart)) return false;

	// - axis: "product" (ArtifactFilterAxis scope value)
	if (/axis.*['"]\s*product\s*['"]/.test(codePart)) return false;

	// - API endpoint paths /api/products (server backward compat, URLs not renamed in U5)
	if (/['"]\/?api\/products/.test(codePart)) return false;

	// - "My Product" string literal in SetupFlow (UI copy, not renamed in U5)
	if (/["']My Product["']/.test(codePart)) return false;

	// - "Add product" or similar UI copy strings (not renamed in U5 scope)
	if (/["'][^"']*\bproduct\b[^"']*["']/.test(codePart) && !codePart.includes("useProduct") && !codePart.includes("ProductSetting") && !codePart.includes("WorkProduct") && !codePart.includes("PortfolioProduct") && !codePart.includes("product:") && !codePart.includes(".product")) return false;

	// Check for domain-sense product patterns (code identifiers, not just the word in strings)
	const domainPatterns = [
		/\buseProduct\b/,           // hook name
		/\buseProducts\b/,          // hook name
		/\bWorkProduct\b/,          // component name
		/\bPortfolioProduct\b/,     // interface name
		/\bProductSetting\b/,       // type name
		/\bmutedProducts\b/,        // field name
		/\bproductId\b/,            // param name
		/\bproductsData\b/,         // variable name
		/\bProductDetail\b/,        // type name (from shared)
		/\.product\b/,              // property access (bet.product, w.product)
		/\bproduct:/,               // object key assignment (product: "something")
		/\bproduct\s*=\s*/,         // variable assignment
	];

	return domainPatterns.some((pattern) => pattern.test(codePart));
}

describe("U5 AC5: no domain-sense 'product' references in packages/web/src", () => {
	it("no domain product identifiers in .ts/.tsx source files", () => {
		const files = collectSourceFiles(SRC);
		const violations: Array<{ file: string; line: number; content: string }> = [];

		for (const filePath of files) {
			const content = fs.readFileSync(filePath, "utf-8");
			const lines = content.split("\n");
			lines.forEach((line, idx) => {
				if (isDomainProductLine(line, filePath)) {
					violations.push({
						file: filePath.replace(SRC + "/", ""),
						line: idx + 1,
						content: line.trim(),
					});
				}
			});
		}

		if (violations.length > 0) {
			const report = violations
				.map((v) => `  ${v.file}:${v.line}: ${v.content}`)
				.join("\n");
			expect.fail(`Found ${violations.length} domain-sense 'product' reference(s):\n${report}`);
		}

		expect(violations).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// AC6: BetCard in design-system uses 'team' prop (not 'product')
// ---------------------------------------------------------------------------

describe("U5 AC6: design-system BetCard uses 'team' prop", () => {
	it("BetCard.tsx does not have 'product' as a prop name in BetCardProps", () => {
		const betCardPath = path.resolve(
			SRC,
			"..",
			"..",
			"design-system",
			"src",
			"BetCard.tsx",
		);
		const content = fs.readFileSync(betCardPath, "utf-8");
		// The props interface should have 'team' not 'product'
		expect(content).toContain("team: string");
		// The old prop name should not appear in code (allow lore comments)
		const lines = content.split("\n");
		const codeLines = lines.filter(
			(line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"),
		);
		const hasProductProp = codeLines.some(
			(line) => /\bproduct\s*:/.test(line) || /\bproduct\s*,/.test(line),
		);
		expect(hasProductProp).toBe(false);
	});
});
