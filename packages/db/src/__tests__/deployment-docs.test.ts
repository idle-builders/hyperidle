import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * H4 AC6: Per-profile deployment docs exist.
 * Docs restructured: docs/DEPLOYMENT.md → docs/deployment/ directory with
 * per-profile files (laptop.md, vps.md, cloud.md, etc.).
 */
describe("H4 AC6: deployment documentation", () => {
	const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
	const deployDir = path.join(repoRoot, "docs", "deployment");

	it("docs/deployment/ directory exists with per-profile files", () => {
		expect(fs.existsSync(deployDir)).toBe(true);
		expect(fs.existsSync(path.join(deployDir, "laptop.md"))).toBe(true);
		expect(fs.existsSync(path.join(deployDir, "vps.md"))).toBe(true);
		expect(fs.existsSync(path.join(deployDir, "cloud.md"))).toBe(true);
		expect(fs.existsSync(path.join(deployDir, "index.md"))).toBe(true);
	});

	it("has a section per profile (Laptop, VPS, Cloud)", () => {
		const laptop = fs.readFileSync(path.join(deployDir, "laptop.md"), "utf-8");
		const vps = fs.readFileSync(path.join(deployDir, "vps.md"), "utf-8");
		const cloud = fs.readFileSync(path.join(deployDir, "cloud.md"), "utf-8");
		expect(laptop).toMatch(/^##\s+Laptop/m);
		expect(vps).toMatch(/^##\s+VPS/m);
		expect(cloud).toMatch(/^##\s+Cloud/m);
	});

	it("references the setup CLI", () => {
		const laptop = fs.readFileSync(path.join(deployDir, "laptop.md"), "utf-8");
		const vps = fs.readFileSync(path.join(deployDir, "vps.md"), "utf-8");
		const cloud = fs.readFileSync(path.join(deployDir, "cloud.md"), "utf-8");
		const combined = laptop + vps + cloud;
		expect(combined).toMatch(/bun run setup/);
	});

	it("references the DATABASE_URL env var for pg profiles", () => {
		const vps = fs.readFileSync(path.join(deployDir, "vps.md"), "utf-8");
		const cloud = fs.readFileSync(path.join(deployDir, "cloud.md"), "utf-8");
		const combined = vps + cloud;
		expect(combined).toMatch(/DATABASE_URL/);
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
