/**
 * N5 — desktop-release.yml GitHub Actions workflow validation tests
 *
 * The CI workflow is a lightweight distributor that:
 *   - Triggers on release:published (after local build/sign/notarize)
 *   - Downloads the signed DMG from the source release
 *   - Mirrors it to ambrovia/hyperidle-releases (public, for Homebrew)
 *   - Computes sha256 and dispatches Homebrew tap update
 *   - Runs on ubuntu-latest (no macOS minutes needed)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const WORKFLOW_PATH = path.join(REPO_ROOT, ".github", "workflows", "desktop-release.yml");

function readWorkflow(): string {
	return fs.readFileSync(WORKFLOW_PATH, "utf-8");
}

describe("desktop-release.yml exists", () => {
	it("workflow file exists at .github/workflows/desktop-release.yml", () => {
		expect(fs.existsSync(WORKFLOW_PATH)).toBe(true);
	});
});

describe("desktop-release.yml — trigger", () => {
	it("triggers on release published event", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/on\s*:/);
		expect(wf).toMatch(/release\s*:/);
		expect(wf).toMatch(/published/);
	});
});

describe("desktop-release.yml — distribute job", () => {
	it("runs on ubuntu-latest (no macOS minutes)", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/ubuntu-latest/);
		expect(wf).not.toMatch(/macos/);
	});

	it("downloads DMG from the source release", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/gh release download/);
		expect(wf).toMatch(/\.dmg/);
	});

	it("uploads DMG to the public releases repo", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/hyperidle-releases/);
		expect(wf).toMatch(/gh release create/);
	});

	it("computes sha256 checksum using sha256sum (not shasum)", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/sha256sum/);
		expect(wf).not.toMatch(/shasum\s+-a\s+256/);
	});

	it("dispatches Homebrew tap update via repository-dispatch", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/repository-dispatch/);
		expect(wf).toMatch(/homebrew/i);
		expect(wf).toMatch(/update-cask/);
	});

	it("sends version and arm64 sha256 in dispatch payload", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/version/);
		expect(wf).toMatch(/arm64_sha/);
	});

	it("references RELEASES_TOKEN and HOMEBREW_TAP_TOKEN as secrets (not hardcoded)", () => {
		const wf = readWorkflow();
		expect(wf).toMatch(/secrets\.RELEASES_TOKEN/);
		expect(wf).toMatch(/secrets\.HOMEBREW_TAP_TOKEN/);
	});

	it("does NOT reference signing or notarization secrets (handled locally)", () => {
		const wf = readWorkflow();
		expect(wf).not.toMatch(/secrets\.MAC_CERT/);
		expect(wf).not.toMatch(/secrets\.APPLE_ID/);
		expect(wf).not.toMatch(/secrets\.APPLE_APP_SPECIFIC_PASSWORD/);
		expect(wf).not.toMatch(/CSC_LINK/);
	});
});
