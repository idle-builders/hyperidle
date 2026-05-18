/**
 * N5 — Homebrew cask formula validation tests
 *
 * AC coverage:
 *   AC8: Homebrew cask with name, desc, homepage, version, sha256, URL, livecheck.
 *   AC9: Release workflow updates cask formula (version + sha256).
 *   AC10: brew uninstall preserves userData. --zap clause for full purge.
 *
 * The cask formula lives in homebrew/Casks/hyperidle.rb (in THIS repo).
 * The update-cask workflow lives in homebrew/.github/workflows/update-cask.yml.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const CASK_PATH = path.join(REPO_ROOT, "homebrew", "Casks", "hyperidle.rb");
const UPDATE_WORKFLOW_PATH = path.join(
	REPO_ROOT,
	"homebrew",
	".github",
	"workflows",
	"update-cask.yml",
);

function readCask(): string {
	return fs.readFileSync(CASK_PATH, "utf-8");
}

function readUpdateWorkflow(): string {
	return fs.readFileSync(UPDATE_WORKFLOW_PATH, "utf-8");
}

describe("homebrew/Casks/hyperidle.rb — file existence (AC8)", () => {
	it("cask formula file exists at homebrew/Casks/hyperidle.rb", () => {
		expect(fs.existsSync(CASK_PATH)).toBe(true);
	});
});

describe("homebrew/Casks/hyperidle.rb — required fields (AC8)", () => {
	it("has cask name 'hyperidle'", () => {
		const cask = readCask();
		expect(cask).toMatch(/cask\s+["']hyperidle["']/);
	});

	it("has version field", () => {
		const cask = readCask();
		expect(cask).toMatch(/version\s+["']/);
	});

	it("has sha256 field for arm64", () => {
		const cask = readCask();
		expect(cask).toMatch(/sha256\s+["']/);
		expect(cask).toMatch(/arm64/);
	});

	it("has sha256 field for x64", () => {
		const cask = readCask();
		expect(cask).toMatch(/sha256\s+["']/);
		expect(cask).toMatch(/x64/);
	});

	it("has URL pointing to GitHub releases with version interpolation", () => {
		const cask = readCask();
		expect(cask).toMatch(/url\s+["']/i);
		expect(cask).toMatch(/github\.com\/hyperidle\/hyperidle\/releases/);
		expect(cask).toMatch(/#\{version\}/);
	});

	it("has name field (AC8 — display name)", () => {
		const cask = readCask();
		expect(cask).toMatch(/name\s+["']HyperIdle["']/);
	});

	it("has desc field (AC8 — description)", () => {
		const cask = readCask();
		expect(cask).toMatch(/desc\s+["']/);
		// Must be a meaningful description, not empty
		const descMatch = /desc\s+["']([^"']+)["']/.exec(cask);
		expect(descMatch).not.toBeNull();
		if (descMatch) {
			expect(descMatch[1].length).toBeGreaterThan(5);
		}
	});

	it("has homepage pointing to hyperidle GitHub repo", () => {
		const cask = readCask();
		expect(cask).toMatch(/homepage\s+["']/);
		expect(cask).toMatch(/github\.com\/hyperidle/);
	});

	it("has livecheck block (AC8 — brew upgrade auto-detects new releases)", () => {
		const cask = readCask();
		expect(cask).toMatch(/livecheck\s+do/);
	});

	it("livecheck uses github_latest strategy (auto-detects GitHub releases)", () => {
		const cask = readCask();
		expect(cask).toMatch(/strategy\s*:github_latest/);
	});
});

describe("homebrew/Casks/hyperidle.rb — architecture support (AC8)", () => {
	it("uses Hardware::CPU.arm? to select the correct DMG for the user's CPU", () => {
		const cask = readCask();
		expect(cask).toMatch(/Hardware::CPU\.arm\?/);
	});

	it("serves arm64 DMG to Apple Silicon users", () => {
		const cask = readCask();
		expect(cask).toMatch(/arm64\.dmg/);
	});

	it("serves x64 DMG to Intel users", () => {
		const cask = readCask();
		expect(cask).toMatch(/x64\.dmg/);
	});
});

describe("homebrew/Casks/hyperidle.rb — install/uninstall (AC10)", () => {
	it("installs HyperIdle.app", () => {
		const cask = readCask();
		expect(cask).toMatch(/app\s+["']HyperIdle\.app["']/);
	});

	it("does NOT have uninstall clause that removes Application Support (AC10 — userData preserved)", () => {
		const cask = readCask();
		// brew uninstall without --zap must preserve ~/Library/Application Support/HyperIdle
		// There should be no uninstall_postflight or uninstall block removing AppSupport
		expect(cask).not.toMatch(/uninstall_postflight[\s\S]*?Application Support/);
		expect(cask).not.toMatch(/uninstall do[\s\S]*?Application Support/);
	});

	it("has zap clause for full purge (AC10 — brew uninstall --zap removes everything)", () => {
		const cask = readCask();
		expect(cask).toMatch(/zap\s+trash\s*:/);
	});

	it("zap clause includes Application Support/HyperIdle (AC10 — removes database on zap)", () => {
		const cask = readCask();
		expect(cask).toMatch(/Application Support\/HyperIdle/);
	});

	it("zap clause includes Logs/HyperIdle (AC10 — removes logs on full purge)", () => {
		const cask = readCask();
		expect(cask).toMatch(/Logs\/HyperIdle/);
	});

	it("zap clause includes Preferences/com.hyperidle.app.plist (AC10 — removes preferences on full purge)", () => {
		const cask = readCask();
		expect(cask).toMatch(/com\.hyperidle\.app\.plist/);
	});
});

describe("homebrew/.github/workflows/update-cask.yml — cask update automation (AC9)", () => {
	it("update-cask.yml exists at homebrew/.github/workflows/update-cask.yml", () => {
		expect(fs.existsSync(UPDATE_WORKFLOW_PATH)).toBe(true);
	});

	it("triggers on repository_dispatch event type update-cask", () => {
		const wf = readUpdateWorkflow();
		expect(wf).toMatch(/repository_dispatch/);
		expect(wf).toMatch(/update-cask/);
	});

	it("updates version in cask formula (AC9)", () => {
		const wf = readUpdateWorkflow();
		expect(wf).toMatch(/version/i);
		// Must have a sed or replacement command
		expect(wf).toMatch(/sed\s+-i/);
	});

	it("updates arm64 sha256 in cask formula (AC9)", () => {
		const wf = readUpdateWorkflow();
		expect(wf).toMatch(/arm64/);
		expect(wf).toMatch(/sha256/);
	});

	it("updates x64 sha256 in cask formula (AC9)", () => {
		const wf = readUpdateWorkflow();
		expect(wf).toMatch(/x64/);
	});

	it("creates a PR for the formula update (AC9 — not a direct push)", () => {
		const wf = readUpdateWorkflow();
		expect(wf).toMatch(/create-pull-request/);
	});

	it("receives payload from client_payload (github.event.client_payload)", () => {
		const wf = readUpdateWorkflow();
		expect(wf).toMatch(/client_payload/);
	});
});
