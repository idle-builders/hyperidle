/**
 * N5 — desktop-release.yml GitHub Actions workflow validation tests
 *
 * AC coverage:
 *   AC6: Developer ID cert + API key as CI secrets, never committed/logged.
 *   AC7: desktop-release.yml runs on manual dispatch, produces signed DMG, uploads to release.
 *   AC9: Release workflow updates cask formula via PR to tap repo.
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
	it("triggers on manual workflow_dispatch with version input", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/on\s*:/);
		expect(wf).toMatch(/workflow_dispatch\s*:/);
		expect(wf).toMatch(/version\s*:/);
	});

	it("has a bump type selector (patch/minor/major)", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/bump\s*:/);
		expect(wf).toMatch(/patch/);
		expect(wf).toMatch(/minor/);
		expect(wf).toMatch(/major/);
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

	it("references APPLE_ID as a secret (notarization via Apple ID + app-specific password)", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/secrets\.APPLE_ID/);
	});

	it("references APPLE_APP_SPECIFIC_PASSWORD as a secret", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/secrets\.APPLE_APP_SPECIFIC_PASSWORD/);
	});

	it("references APPLE_TEAM_ID as a secret", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/secrets\.APPLE_TEAM_ID/);
	});

	it("does NOT echo any secret values (AC6 — secrets must never appear in logs)", () => {
		const wf = readWorkflow();
		expect(wf).not.toMatch(/echo\s+\$\{\{\s*secrets\./);
		expect(wf).not.toMatch(/echo\s+["']?\$CSC_LINK/);
		expect(wf).not.toMatch(/echo\s+["']?\$CSC_KEY_PASSWORD/);
		expect(wf).not.toMatch(/echo\s+["']?\$APPLE_ID["']?\s/);
	});
});

describe("desktop-release.yml — build job steps (AC7)", () => {
	it("has a build job", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/\bjobs\b/);
		expect(wf).toMatch(/\bbuild\b\s*:/);
	});

	it("builds arm64 only on macos-latest (Apple Silicon)", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/macos-latest/);
		expect(wf).toMatch(/--arm64/);
		expect(wf).not.toMatch(/macos-13/);
		expect(wf).not.toMatch(/--x64/);
	});

	it("installs bun dependencies", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/bun install/);
	});

	it("builds the web SPA before bundling desktop", () => {
		const wf = readWorkflow();
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
		expect(wf).toMatch(/\.dmg/);
		expect(wf).toMatch(/release/i);
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

	it("uses sha256sum not shasum (ubuntu-latest has sha256sum, not shasum)", () => {
		const wf = readWorkflow();
		expect(wf).not.toMatch(/shasum\s+-a\s+256/);
		expect(wf).toMatch(/sha256sum/);
	});

	it("polls for DMG before computing checksum", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/arm64\.dmg/);
		expect(wf).toMatch(/curl.*-sILf/);
	});

	it("sends version and arm64 sha256 in dispatch payload (AC9)", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/version/);
		expect(wf).toMatch(/arm64_sha/);
	});
});
