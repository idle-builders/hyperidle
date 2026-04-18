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

	// Security hardening: the shipped template must NOT contain real-looking
	// defaults for sensitive fields. Operators who copy the file wholesale
	// should fail loudly (compose `:?` + CHANGE_ME placeholder) rather than
	// silently deploy with a weak default.
	it(".env.example uses CHANGE_ME placeholders for sensitive values", () => {
		const envExample = path.join(repoRoot, ".env.example");
		const raw = fs.readFileSync(envExample, "utf-8");

		// Warning header must be present so a reader who only skims the top
		// sees the security stance.
		expect(raw).toMatch(/SECURITY/);
		expect(raw).toMatch(/never commit/i);

		// Sensitive keys must use CHANGE_ME_* placeholders, never a real
		// default. The old `change-me` placeholder is rejected in favour of
		// the louder CHANGE_ME_STRONG_* form.
		expect(raw).toMatch(/POSTGRES_PASSWORD=CHANGE_ME_/);
		expect(raw).toMatch(/HYPERIDLE_API_KEY=CHANGE_ME_/);

		// Negative: the old weak default must not leak back in.
		expect(raw).not.toMatch(/POSTGRES_PASSWORD=hyperidle\b/);
		expect(raw).not.toMatch(/POSTGRES_PASSWORD=change-me\b/);
	});
});
