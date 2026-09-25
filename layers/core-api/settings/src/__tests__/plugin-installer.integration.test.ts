/**
 * Integration tests for the plugin installer.
 *
 * Uses real PGlite DB via @hyperidle/db/test-fixtures. Covers install from
 * every source, scope, manifest validation, the enable/disable/remove
 * lifecycle, and the MCP servers a session reads from an install's folder.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plugins } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect } from "vitest";
import {
	disablePlugin,
	enablePlugin,
	getPluginMcpContributions,
	installPlugin,
	listInstalledPlugins,
	removePlugin,
} from "../plugin-installer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

const tempDirs: string[] = [];

function makeTempDir(suffix: string): string {
	const dir = join(
		tmpdir(),
		`plugin-installer-test-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(dir, { recursive: true });
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {}
	}
	tempDirs.length = 0;
});

function makePluginDir(name: string): string {
	const dir = makeTempDir(name);
	const manifest = {
		$schema: VALID_SCHEMA,
		name,
		version: "1.0.0",
		description: `Test plugin ${name}`,
	};
	writeFileSync(join(dir, "plugin.json"), JSON.stringify(manifest), "utf8");
	return dir;
}

function makeGitRepo(pluginDir: string): string {
	// Create a repo from the plugin dir and return a file:// URL
	const repoDir = makeTempDir("repo");
	execFileSync("git", ["init", repoDir], { stdio: "pipe" });
	execFileSync("git", ["-C", repoDir, "config", "user.email", "test@test.com"], { stdio: "pipe" });
	execFileSync("git", ["-C", repoDir, "config", "user.name", "Test"], { stdio: "pipe" });
	const manifestContent = readFileSync(join(pluginDir, "plugin.json"), "utf8");
	writeFileSync(join(repoDir, "plugin.json"), manifestContent, "utf8");
	execFileSync("git", ["-C", repoDir, "add", "."], { stdio: "pipe" });
	execFileSync("git", ["-C", repoDir, "commit", "-m", "init"], { stdio: "pipe" });
	return `file://${repoDir}`;
}

function makeZip(pluginDir: string): string {
	const zipPath = join(makeTempDir("zip-out"), "plugin.zip");
	execFileSync("zip", ["-r", zipPath, "."], { cwd: pluginDir, stdio: "pipe" });
	return zipPath;
}

// ---------------------------------------------------------------------------
// Install from folder, repository URL, zip
// ---------------------------------------------------------------------------

describe("install from a folder", () => {
	test("installs from a folder and writes the plugins row", async ({ db }) => {
		const pluginDir = makePluginDir("test-plugin-folder");

		const result = await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.plugin.id).toBe("test-plugin-folder");
		expect(result.plugin.state).toBe("enabled");

		const pluginRows = await db.select().from(plugins).where(eq(plugins.id, "test-plugin-folder"));
		expect(pluginRows).toHaveLength(1);
	});
});

describe("install from a repository URL", () => {
	test("installs from a file:// repository URL and writes the plugins row", async ({ db }) => {
		const gitUrl = makeGitRepo(makePluginDir("test-plugin-repo"));

		const result = await installPlugin(db, {
			source: { kind: "git", url: gitUrl },
			scope: { kind: "factory", teamId: null },
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.plugin.id).toBe("test-plugin-repo");
		const pluginRows = await db.select().from(plugins).where(eq(plugins.id, "test-plugin-repo"));
		expect(pluginRows).toHaveLength(1);
	});
});

describe("install from a zip", () => {
	test("installs from a zip file and writes the plugins row", async ({ db }) => {
		const zipPath = makeZip(makePluginDir("test-plugin-zip"));

		const result = await installPlugin(db, {
			source: { kind: "zip", path: zipPath },
			scope: { kind: "factory", teamId: null },
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.plugin.id).toBe("test-plugin-zip");
		const pluginRows = await db.select().from(plugins).where(eq(plugins.id, "test-plugin-zip"));
		expect(pluginRows).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// Scope recorded and visible
// ---------------------------------------------------------------------------

describe("scope", () => {
	test("factory scope is recorded and returned by listInstalledPlugins", async ({ db }) => {
		const pluginDir = makePluginDir("scope-factory");
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});

		const list = await listInstalledPlugins(db);
		const plugin = list.find((p) => p.id === "scope-factory");
		expect(plugin).toBeDefined();
		expect(plugin?.scope.kind).toBe("factory");
		expect(plugin?.scope.teamId).toBeNull();
	});

	test("team scope with teamId is recorded and returned", async ({ db }) => {
		const pluginDir = makePluginDir("scope-team");
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "team", teamId: "team-abc" },
		});

		const list = await listInstalledPlugins(db);
		const plugin = list.find((p) => p.name === "scope-team");
		expect(plugin?.id).toBe("scope-team@team-abc");
		expect(plugin).toBeDefined();
		expect(plugin?.scope.kind).toBe("team");
		expect(plugin?.scope.teamId).toBe("team-abc");
	});

	test("rejects install when scope is team but teamId is missing", async ({ db }) => {
		const pluginDir = makePluginDir("scope-bad");
		const result = await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "team", teamId: null },
		});
		expect(result.ok).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------

describe("manifest validation", () => {
	test("rejects manifest with wrong $schema — reason includes expected URL", async ({ db }) => {
		const dir = makeTempDir("bad-schema");
		writeFileSync(
			join(dir, "plugin.json"),
			JSON.stringify({ $schema: "https://wrong.url", name: "bad-plugin" }),
			"utf8",
		);
		const result = await installPlugin(db, {
			source: { kind: "folder", path: dir },
			scope: { kind: "factory", teamId: null },
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toMatch(/\$schema/);
			expect(result.reason).toContain("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
		}
	});

	test("rejects manifest without $schema", async ({ db }) => {
		const dir = makeTempDir("no-schema");
		writeFileSync(join(dir, "plugin.json"), JSON.stringify({ name: "bad-plugin" }), "utf8");
		const result = await installPlugin(db, {
			source: { kind: "folder", path: dir },
			scope: { kind: "factory", teamId: null },
		});
		expect(result.ok).toBe(false);
	});

	test("succeeds with warning on unknown top-level field", async ({ db }) => {
		const dir = makeTempDir("unknown-field");
		writeFileSync(
			join(dir, "plugin.json"),
			JSON.stringify({ $schema: VALID_SCHEMA, name: "warn-plugin", unknownField: true }),
			"utf8",
		);
		const result = await installPlugin(db, {
			source: { kind: "folder", path: dir },
			scope: { kind: "factory", teamId: null },
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			const warn = result.plugin.warnings.find((w) => w.code === "UNKNOWN_TOP_LEVEL_FIELD");
			expect(warn).toBeDefined();
		}
	});

	test("succeeds with warning when extensions is not an object", async ({ db }) => {
		const dir = makeTempDir("bad-extensions");
		writeFileSync(
			join(dir, "plugin.json"),
			JSON.stringify({ $schema: VALID_SCHEMA, name: "warn-ext", extensions: "not-an-object" }),
			"utf8",
		);
		const result = await installPlugin(db, {
			source: { kind: "folder", path: dir },
			scope: { kind: "factory", teamId: null },
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			const warn = result.plugin.warnings.find((w) => w.code === "NON_OBJECT_EXTENSIONS");
			expect(warn).toBeDefined();
		}
	});
});

// ---------------------------------------------------------------------------
// Disable / enable / remove / reinstall
// ---------------------------------------------------------------------------

describe("disable, enable, remove, reinstall", () => {
	test("disable then enable flips the plugin's state", async ({ db }) => {
		const pluginDir = makePluginDir("toggle-plugin");
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});

		await disablePlugin(db, "toggle-plugin");
		let list = await listInstalledPlugins(db);
		expect(list.find((p) => p.id === "toggle-plugin")?.state).toBe("disabled");

		await enablePlugin(db, "toggle-plugin");
		list = await listInstalledPlugins(db);
		expect(list.find((p) => p.id === "toggle-plugin")?.state).toBe("enabled");
	});

	test("removing marks the plugin removed and drops it from the list", async ({ db }) => {
		const pluginDir = makePluginDir("remove-plugin");
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});

		await removePlugin(db, "remove-plugin");

		const pluginRows = await db.select().from(plugins).where(eq(plugins.id, "remove-plugin"));
		expect(pluginRows[0]?.state).toBe("removed");
		const list = await listInstalledPlugins(db);
		expect(list.find((p) => p.id === "remove-plugin")).toBeUndefined();
	});

	test("reinstall updates the version", async ({ db }) => {
		const pluginDir = makePluginDir("reinstall-plugin");
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});
		writeFileSync(
			join(pluginDir, "plugin.json"),
			JSON.stringify({ $schema: VALID_SCHEMA, name: "reinstall-plugin", version: "2.0.0" }),
			"utf8",
		);

		const result = await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.plugin.version).toBe("2.0.0");
	});
});

// ---------------------------------------------------------------------------
// MCP servers — read from the install's own folder when a session asks
// ---------------------------------------------------------------------------

function makeMcpPluginDir(name: string, servers: Record<string, unknown>): string {
	const dir = makePluginDir(name);
	writeFileSync(join(dir, "mcp.json"), JSON.stringify(servers), "utf8");
	return dir;
}

describe("MCP servers a session reads", () => {
	test("an installed plugin's mcp.json reaches the session from its install folder", async ({
		db,
	}) => {
		const pluginsBaseDir = makeTempDir("plugins-base");
		const pluginDir = makeMcpPluginDir("mcp-plugin", {
			bridge: { command: "${PLUGIN_ROOT}/bin/bridge", args: ["--stdio"] },
		});
		const result = await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
			pluginsBaseDir,
		});
		expect(result.ok).toBe(true);
		const installPath = join(pluginsBaseDir, "mcp-plugin");

		const rows = await getPluginMcpContributions(db, null);
		expect(rows.map(({ key, installPath }) => ({ key, installPath }))).toEqual([
			{ key: "mcp-plugin/bridge", installPath },
		]);
		expect(JSON.parse(rows[0]?.defaultValueJson ?? "null")).toEqual({
			command: "${PLUGIN_ROOT}/bin/bridge",
			args: ["--stdio"],
		});

		// The install folder is the source of truth: a server added to it
		// after install reaches the next session without a reinstall.
		writeFileSync(
			join(installPath, "mcp.json"),
			JSON.stringify({
				bridge: { command: "${PLUGIN_ROOT}/bin/bridge", args: ["--stdio"] },
				search: { url: "https://search.example/mcp" },
			}),
			"utf8",
		);
		const after = await getPluginMcpContributions(db, null);
		expect(after.map((r) => r.key).sort()).toEqual(["mcp-plugin/bridge", "mcp-plugin/search"]);
	});

	test("a team install's servers reach only that team; disabled and removed installs none", async ({
		db,
	}) => {
		const pluginsBaseDir = makeTempDir("plugins-base");
		const teamDir = makeMcpPluginDir("team-mcp", { tool: { url: "https://team.example/mcp" } });
		await installPlugin(db, {
			source: { kind: "folder", path: teamDir },
			scope: { kind: "team", teamId: "team-a" },
			pluginsBaseDir,
		});
		const factoryDir = makeMcpPluginDir("factory-mcp", {
			tool: { url: "https://all.example/mcp" },
		});
		await installPlugin(db, {
			source: { kind: "folder", path: factoryDir },
			scope: { kind: "factory", teamId: null },
			pluginsBaseDir,
		});

		const keysFor = async (teamId: string | null) =>
			(await getPluginMcpContributions(db, teamId)).map((r) => r.key).sort();

		expect(await keysFor("team-a")).toEqual(["factory-mcp/tool", "team-mcp/tool"]);
		expect(await keysFor("team-b")).toEqual(["factory-mcp/tool"]);
		expect(await keysFor(null)).toEqual(["factory-mcp/tool"]);

		await disablePlugin(db, "team-mcp@team-a");
		expect(await keysFor("team-a")).toEqual(["factory-mcp/tool"]);

		await removePlugin(db, "factory-mcp");
		expect(await keysFor("team-a")).toEqual([]);
	});

	test("an install with no folder contributes no servers", async ({ db }) => {
		const pluginDir = makeMcpPluginDir("folderless-mcp", { tool: { url: "https://x.example" } });
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});
		expect(await getPluginMcpContributions(db, null)).toEqual([]);
	});
});
