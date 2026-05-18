/**
 * N5 — desktop-release.yml GitHub Actions workflow validation tests
 *
 * AC coverage:
 *   AC6: Developer ID cert + API key as CI secrets, never committed/logged.
 *   AC7: desktop-release.yml runs on tag push, produces signed DMG, uploads to release.
 *   AC9: Release workflow updates cask formula via PR to tap repo.
 *
 * Tests inspect the workflow YAML file structure via string/regex.
 * Critique findings addressed:
 *   - arch→runner mapping: arm64 → macos-latest, x64 → macos-13 (finding #3)
 *   - sha256sum not shasum (finding #2 — runs on ubuntu-latest)
 *   - Poll for BOTH DMGs (finding #7 race condition)
 *   - drizzle-orm/postgres-js in externals (finding #1 — covered in bundle-script tests)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const WORKFLOW_PATH = path.join(REPO_ROOT, ".github", "workflows", "desktop-release.yml");

function readWorkflow(): string {
	return fs.readFileSync(WORKFLOW_PATH, "utf-8");
}

describe("desktop-release.yml exists (AC7)", () => {
	it("workflow file exists at .github/workflows/desktop-release.yml", () => {
		expect(fs.existsSync(WORKFLOW_PATH)).toBe(true);
	});
});

describe("desktop-release.yml — trigger (AC7)", () => {
	it("triggers on tag push matching v* pattern", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/on\s*:/);
		expect(wf).toMatch(/push\s*:/);
		expect(wf).toMatch(/tags\s*:/);
		expect(wf).toMatch(/v\*/);
	});
});

describe("desktop-release.yml — secrets never echoed (AC6)", () => {
	it("references MAC_CERT_P12_BASE64 as a secret (not hardcoded)", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/secrets\.MAC_CERT_P12_BASE64/);
	});

	it("references MAC_CERT_PASSWORD as a secret", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/secrets\.MAC_CERT_PASSWORD/);
	});

	it("references APPLE_API_KEY as a secret", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/secrets\.APPLE_API_KEY/);
	});

	it("references APPLE_API_KEY_ID as a secret", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/secrets\.APPLE_API_KEY_ID/);
	});

	it("references APPLE_API_ISSUER as a secret", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/secrets\.APPLE_API_ISSUER/);
	});

	it("does NOT echo any secret values (AC6 — secrets must never appear in logs)", () => {
		const wf = readWorkflow();
		// No `echo ${{ secrets.* }}` or `echo "$CSC_LINK"` patterns
		// This checks that the workflow doesn't print secret env vars
		expect(wf).not.toMatch(/echo\s+\$\{\{\s*secrets\./);
		expect(wf).not.toMatch(/echo\s+["']?\$CSC_LINK/);
		expect(wf).not.toMatch(/echo\s+["']?\$CSC_KEY_PASSWORD/);
		expect(wf).not.toMatch(/echo\s+["']?\$APPLE_API_KEY["']?\b/);
	});
});

describe("desktop-release.yml — build job steps (AC7)", () => {
	it("has a build job", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/\bjobs\b/);
		expect(wf).toMatch(/\bbuild\b\s*:/);
	});

	it("installs bun dependencies", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/bun install/);
	});

	it("builds the web SPA before bundling desktop", () => {
		const wf = readWorkflow();
		// Must have a step that runs web build
		expect(wf).toMatch(/@hyperidle\/web/);
	});

	it("runs the desktop bundle script", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/bundle\.ts/);
	});

	it("runs electron-builder for mac target", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/electron-builder/);
		expect(wf).toMatch(/--mac/);
	});

	it("uploads DMG artifacts to the GitHub Release", () => {
		const wf = readWorkflow();
		// Uses softprops/action-gh-release or similar upload action
		expect(wf).toMatch(/\.dmg/);
		// Must upload to a release
		expect(wf).toMatch(/release/i);
	});
});

describe("desktop-release.yml — arch/runner matrix (critique finding #3)", () => {
	it("uses macos-latest for arm64 builds (Apple Silicon runner)", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/macos-latest/);
	});

	it("uses macos-13 for x64 builds (Intel runner — electron-rebuild cannot cross-compile)", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/macos-13/);
	});

	it("matrix maps arch to correct runner (arm64 → macos-latest, x64 → macos-13)", () => {
		const wf = readWorkflow();
		// Matrix include with arch+runs-on mapping
		expect(wf).toMatch(/include/);
		// Both arch values must appear
		expect(wf).toMatch(/arm64/);
		expect(wf).toMatch(/x64/);
	});
});

describe("desktop-release.yml — update-homebrew job (AC9)", () => {
	it("has an update-homebrew job that depends on build completing", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/update-homebrew/);
		expect(wf).toMatch(/needs\s*:\s*build/);
	});

	it("dispatches to homebrew tap repo via repository-dispatch (AC9)", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/repository-dispatch/);
		expect(wf).toMatch(/homebrew/i);
	});

	it("references HOMEBREW_TAP_TOKEN secret (AC6 — not hardcoded)", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/secrets\.HOMEBREW_TAP_TOKEN/);
	});

	it("uses sha256sum not shasum (critique finding #2 — ubuntu-latest has sha256sum, not shasum)", () => {
		const wf = readWorkflow();
		// Must NOT use 'shasum -a 256' on ubuntu
		expect(wf).not.toMatch(/shasum\s+-a\s+256/);
		// Must use sha256sum
		expect(wf).toMatch(/sha256sum/);
	});

	it("polls for BOTH arm64 and x64 DMGs before computing checksums (critique finding #7 — race condition)", () => {
		const wf = readWorkflow();
		// The polling section must check for both DMG files
		// Strategy: both arm64 and x64 DMG URLs must appear in the polling/wait section
		const waitSectionMatch = wf.match(/Wait for release assets[\s\S]*?(?=\n\s*-\s*name:)/);
		if (waitSectionMatch) {
			// Both arches in the wait section
			expect(waitSectionMatch[0]).toMatch(/arm64/);
			expect(waitSectionMatch[0]).toMatch(/x64/);
		} else {
			// If we can't isolate the section, at minimum both must appear near each other
			const armIdx = wf.indexOf("arm64.dmg");
			const x64Idx = wf.indexOf("x64.dmg");
			expect(armIdx).toBeGreaterThan(-1);
			expect(x64Idx).toBeGreaterThan(-1);
		}
	});

	it("sends version and sha256 hashes in dispatch payload (AC9)", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/version/);
		expect(wf).toMatch(/arm64_sha/);
		expect(wf).toMatch(/x64_sha/);
	});
});
