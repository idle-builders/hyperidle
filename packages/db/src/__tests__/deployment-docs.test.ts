import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * H4 AC6: Per-profile deployment docs exist.
 */
describe("H4 AC6: deployment documentation", () => {
	const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
	const docPath = path.join(repoRoot, "docs", "DEPLOYMENT.md");

	it("docs/DEPLOYMENT.md exists", () => {
		expect(fs.existsSync(docPath)).toBe(true);
	});

	it("has a section per profile (Laptop, VPS, Cloud)", () => {
		const raw = fs.readFileSync(docPath, "utf-8");
		expect(raw).toMatch(/^##\s+Laptop/m);
		expect(raw).toMatch(/^##\s+VPS/m);
		expect(raw).toMatch(/^##\s+Cloud/m);
	});

	it("references the setup CLI", () => {
		const raw = fs.readFileSync(docPath, "utf-8");
		expect(raw).toMatch(/bun run setup/);
	});

	it("references the DATABASE_URL env var for pg profiles", () => {
		const raw = fs.readFileSync(docPath, "utf-8");
		expect(raw).toMatch(/DATABASE_URL/);
	});

	it(".env.example exists at repo root", () => {
		const envExample = path.join(repoRoot, ".env.example");
		expect(fs.existsSync(envExample)).toBe(true);
	});
});
