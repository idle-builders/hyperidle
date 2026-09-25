/**
 * Integration tests for the plugin installer (BA9a).
 *
 * Uses real PGlite DB via @hyperidle/db/test-fixtures.
 * Covers AC1–AC10 as runtime behavior assertions.
 *
 * AC4 (containment) is covered by plugin-containment.test.ts as a unit test
 * (no DB needed — it's a pure path utility).
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginConfigurationDefaults, plugins } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect } from "vitest";
import { listConfiguration, writeConfigurationOverride } from "../plugin-configuration.js";
import {
	disablePlugin,
	enablePlugin,
	installPlugin,
	listInstalledPlugins,
	pluginContributionKey,
	removePlugin,
	restorePluginContribution,
} from "../plugin-installer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

const tempDirs: string[] = [];

function makeTempDir(suffix: string): string {
	const dir = join(
		tmpdir(),
		`ba9a-test-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

function makePluginDir(
	name: string,
	contributions?: Array<{ kind: string; key: string; value: Record<string, unknown> }>,
): string {
	const dir = makeTempDir(name);
	const manifest = {
		$schema: VALID_SCHEMA,
		name,
		version: "1.0.0",
		description: `Test plugin ${name}`,
		...(contributions
			? {
					extensions: {
						"io.hyperidle": { contributions },
					},
				}
			: {}),
	};
	writeFileSync(join(dir, "plugin.json"), JSON.stringify(manifest), "utf8");
	return dir;
}

function makeGitRepo(pluginDir: string): string {
	// Create a bare git repo from the plugin dir and return a file:// URL
	const repoDir = makeTempDir("repo");
	execFileSync("git", ["init", repoDir], { stdio: "pipe" });
	execFileSync("git", ["-C", repoDir, "config", "user.email", "test@test.com"], { stdio: "pipe" });
	execFileSync("git", ["-C", repoDir, "config", "user.name", "Test"], { stdio: "pipe" });
	// Copy plugin.json into the repo dir
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
// AC1: Install from folder, git URL, zip
// ---------------------------------------------------------------------------

describe("AC1 — install from folder", () => {
	test("installs from a folder and writes plugins + defaults rows", async ({ db }) => {
		const pluginDir = makePluginDir("test-plugin-folder", [
			{ kind: "agent", key: "my-agent", value: { name: "My Agent" } },
		]);

		const result = await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.plugin.id).toBe("test-plugin-folder");
		expect(result.plugin.state).toBe("enabled");

		// plugins row exists
		const pluginRows = await db.select().from(plugins).where(eq(plugins.id, "test-plugin-folder"));
		expect(pluginRows).toHaveLength(1);

		// defaults row exists with namespaced key
		const defaultRows = await db
			.select()
			.from(pluginConfigurationDefaults)
			.where(eq(pluginConfigurationDefaults.pluginId, "test-plugin-folder"));
		expect(defaultRows).toHaveLength(1);
		expect(defaultRows[0]?.key).toBe("test-plugin-folder/my-agent");
		expect(defaultRows[0]?.kind).toBe("agent");
	});
});

describe("AC1 — install from git URL", () => {
	test("installs from a file:// git URL and writes rows", async ({ db }) => {
		const pluginDir = makePluginDir("test-plugin-git", [
			{ kind: "skill", key: "my-skill", value: { description: "My Skill" } },
		]);
		const gitUrl = makeGitRepo(pluginDir);

		const result = await installPlugin(db, {
			source: { kind: "git", url: gitUrl },
			scope: { kind: "factory", teamId: null },
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.plugin.id).toBe("test-plugin-git");

		const defaultRows = await db
			.select()
			.from(pluginConfigurationDefaults)
			.where(eq(pluginConfigurationDefaults.pluginId, "test-plugin-git"));
		expect(defaultRows).toHaveLength(1);
		expect(defaultRows[0]?.key).toBe("test-plugin-git/my-skill");
	});
});

describe("AC1 — install from zip", () => {
	test("installs from a zip file and writes rows", async ({ db }) => {
		const pluginDir = makePluginDir("test-plugin-zip", [
			{ kind: "tool", key: "my-tool", value: { description: "My Tool" } },
		]);
		const zipPath = makeZip(pluginDir);

		const result = await installPlugin(db, {
			source: { kind: "zip", path: zipPath },
			scope: { kind: "factory", teamId: null },
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.plugin.id).toBe("test-plugin-zip");

		const defaultRows = await db
			.select()
			.from(pluginConfigurationDefaults)
			.where(eq(pluginConfigurationDefaults.pluginId, "test-plugin-zip"));
		expect(defaultRows).toHaveLength(1);
		expect(defaultRows[0]?.key).toBe("test-plugin-zip/my-tool");
	});
});

// ---------------------------------------------------------------------------
// AC2: Scope recorded and visible
// ---------------------------------------------------------------------------

describe("AC2 — scope", () => {
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
// AC3: Manifest validation
// ---------------------------------------------------------------------------

describe("AC3 — manifest validation", () => {
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
// AC5: Contributions appear as editable config; user override wins
// ---------------------------------------------------------------------------

describe("AC5 — editable configuration", () => {
	test("contribution appears in listConfiguration after install", async ({ db }) => {
		const pluginDir = makePluginDir("config-plugin", [
			{ kind: "agent", key: "config-agent", value: { name: "Config Agent" } },
		]);
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});

		const items = await listConfiguration(db, { kind: "agent" });
		const key = pluginContributionKey("config-plugin", "config-agent");
		const item = items.find((i) => i.key === key);

		expect(item).toBeDefined();
		expect(item?.activeValue).toMatchObject({ name: "Config Agent" });
		expect(item?.origin.pluginId).toBe("config-plugin");
		expect(item?.valueSource).toBe("default");
	});

	test("user override wins over plugin default", async ({ db }) => {
		const pluginDir = makePluginDir("override-plugin", [
			{ kind: "agent", key: "override-agent", value: { name: "Default Name" } },
		]);
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});

		const key = pluginContributionKey("override-plugin", "override-agent");
		await writeConfigurationOverride(db, {
			kind: "agent",
			key,
			value: { name: "User Name" },
		});

		const items = await listConfiguration(db, { kind: "agent" });
		const item = items.find((i) => i.key === key);

		expect(item).toBeDefined();
		expect(item?.activeValue).toMatchObject({ name: "User Name" });
		expect(item?.userValue).toMatchObject({ name: "User Name" });
		expect(item?.defaultValue).toMatchObject({ name: "Default Name" });
	});
});

// ---------------------------------------------------------------------------
// AC6: Detached + restore
// ---------------------------------------------------------------------------

describe("AC6 — detached and restore", () => {
	test("contribution is detached after user edit", async ({ db }) => {
		const pluginDir = makePluginDir("detach-plugin", [
			{ kind: "agent", key: "detach-agent", value: { name: "Original" } },
		]);
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});

		const key = pluginContributionKey("detach-plugin", "detach-agent");
		await writeConfigurationOverride(db, {
			kind: "agent",
			key,
			value: { name: "Edited" },
		});

		const items = await listConfiguration(db, { kind: "agent" });
		const item = items.find((i) => i.key === key);

		// Detached = valueSource is user_override (not default)
		expect(item?.valueSource).toBe("user_override");
	});

	test("restoring returns to default — no longer detached", async ({ db }) => {
		const pluginDir = makePluginDir("restore-plugin", [
			{ kind: "agent", key: "restore-agent", value: { name: "Original" } },
		]);
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});

		const key = pluginContributionKey("restore-plugin", "restore-agent");
		await writeConfigurationOverride(db, {
			kind: "agent",
			key,
			value: { name: "Edited" },
		});

		await restorePluginContribution(db, {
			pluginName: "restore-plugin",
			manifestKey: "restore-agent",
			kind: "agent",
		});

		const items = await listConfiguration(db, { kind: "agent" });
		const item = items.find((i) => i.key === key);

		expect(item?.valueSource).toBe("default");
		expect(item?.activeValue).toMatchObject({ name: "Original" });
	});
});

// ---------------------------------------------------------------------------
// AC7: Disable / enable / remove
// ---------------------------------------------------------------------------

describe("AC7 — disable, enable, remove", () => {
	test("disabling stops contributions from applying (active=false)", async ({ db }) => {
		const pluginDir = makePluginDir("disable-plugin", [
			{ kind: "agent", key: "dis-agent", value: { name: "Disabled Agent" } },
		]);
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});

		await disablePlugin(db, "disable-plugin");

		const items = await listConfiguration(db, { kind: "agent" });
		const key = pluginContributionKey("disable-plugin", "dis-agent");
		const item = items.find((i) => i.key === key);

		expect(item).toBeDefined();
		// active=false when plugin disabled and no user override
		expect(item?.active).toBe(false);
	});

	test("re-enabling makes contributions active again", async ({ db }) => {
		const pluginDir = makePluginDir("reenable-plugin", [
			{ kind: "agent", key: "re-agent", value: { name: "Agent" } },
		]);
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});
		await disablePlugin(db, "reenable-plugin");
		await enablePlugin(db, "reenable-plugin");

		const items = await listConfiguration(db, { kind: "agent" });
		const key = pluginContributionKey("reenable-plugin", "re-agent");
		const item = items.find((i) => i.key === key);
		expect(item?.active).toBe(true);
	});

	test("removing clears defaults and marks plugin removed", async ({ db }) => {
		const pluginDir = makePluginDir("remove-plugin", [
			{ kind: "agent", key: "rem-agent", value: { name: "Removed Agent" } },
		]);
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});

		await removePlugin(db, "remove-plugin");

		// defaults deleted
		const defaultRows = await db
			.select()
			.from(pluginConfigurationDefaults)
			.where(eq(pluginConfigurationDefaults.pluginId, "remove-plugin"));
		expect(defaultRows).toHaveLength(0);

		// plugin row has state=removed
		const pluginRows = await db.select().from(plugins).where(eq(plugins.id, "remove-plugin"));
		expect(pluginRows[0]?.state).toBe("removed");

		// not in listInstalledPlugins
		const list = await listInstalledPlugins(db);
		expect(list.find((p) => p.id === "remove-plugin")).toBeUndefined();
	});

	test("remove with user override — override survives with defaultId=null", async ({ db }) => {
		const pluginDir = makePluginDir("remove-override-plugin", [
			{ kind: "agent", key: "rov-agent", value: { name: "Agent" } },
		]);
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});

		const key = pluginContributionKey("remove-override-plugin", "rov-agent");
		await writeConfigurationOverride(db, {
			kind: "agent",
			key,
			value: { name: "User Value" },
		});

		await removePlugin(db, "remove-override-plugin");

		// The user's override should still exist but now be user-owned (defaultId=null)
		const items = await listConfiguration(db, { kind: "agent" });
		const item = items.find((i) => i.key === key);
		// The override is now user-owned (orphaned from plugin)
		expect(item).toBeDefined();
		expect(item?.valueSource).toBe("user_owned");
		expect(item?.activeValue).toMatchObject({ name: "User Value" });
	});
});

// ---------------------------------------------------------------------------
// AC8: Two plugins with same manifest key — no collision
// ---------------------------------------------------------------------------

describe("AC8 — two plugins with same manifest key", () => {
	test("keys are namespaced — no override collision", async ({ db }) => {
		const pluginADir = makePluginDir("plugin-a", [
			{ kind: "agent", key: "shared-agent", value: { name: "From A" } },
		]);
		const pluginBDir = makePluginDir("plugin-b", [
			{ kind: "agent", key: "shared-agent", value: { name: "From B" } },
		]);

		await installPlugin(db, {
			source: { kind: "folder", path: pluginADir },
			scope: { kind: "factory", teamId: null },
		});
		await installPlugin(db, {
			source: { kind: "folder", path: pluginBDir },
			scope: { kind: "factory", teamId: null },
		});

		const keyA = pluginContributionKey("plugin-a", "shared-agent");
		const keyB = pluginContributionKey("plugin-b", "shared-agent");
		expect(keyA).not.toBe(keyB);

		// User edits plugin-a's contribution
		await writeConfigurationOverride(db, {
			kind: "agent",
			key: keyA,
			value: { name: "User A" },
		});

		const items = await listConfiguration(db, { kind: "agent" });
		const itemA = items.find((i) => i.key === keyA);
		const itemB = items.find((i) => i.key === keyB);

		// Plugin A is detached (user override)
		expect(itemA?.valueSource).toBe("user_override");
		expect(itemA?.activeValue).toMatchObject({ name: "User A" });

		// Plugin B is unaffected (still default)
		expect(itemB?.valueSource).toBe("default");
		expect(itemB?.activeValue).toMatchObject({ name: "From B" });
	});
});

// ---------------------------------------------------------------------------
// AC9: builtin reserved
// ---------------------------------------------------------------------------

describe("AC9 — builtin reserved", () => {
	test("builtin is not in listInstalledPlugins", async ({ db }) => {
		const list = await listInstalledPlugins(db);
		expect(list.find((p) => p.id === "builtin")).toBeUndefined();
	});

	test("cannot install a plugin with name 'builtin'", async ({ db }) => {
		const dir = makeTempDir("builtin-attempt");
		writeFileSync(
			join(dir, "plugin.json"),
			JSON.stringify({ $schema: VALID_SCHEMA, name: "builtin" }),
			"utf8",
		);
		const result = await installPlugin(db, {
			source: { kind: "folder", path: dir },
			scope: { kind: "factory", teamId: null },
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toMatch(/reserved/i);
		}
	});
});

// ---------------------------------------------------------------------------
// AC10: Reinstall (update)
// ---------------------------------------------------------------------------

describe("AC10 — reinstall updates defaults, leaves detached alone", () => {
	test("reinstall updates version and default values", async ({ db }) => {
		const pluginDir = makePluginDir("reinstall-plugin", [
			{ kind: "agent", key: "the-agent", value: { name: "v1" } },
		]);
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});

		// Update manifest in-place for v2
		writeFileSync(
			join(pluginDir, "plugin.json"),
			JSON.stringify({
				$schema: VALID_SCHEMA,
				name: "reinstall-plugin",
				version: "2.0.0",
				extensions: {
					"io.hyperidle": {
						contributions: [{ kind: "agent", key: "the-agent", value: { name: "v2" } }],
					},
				},
			}),
			"utf8",
		);

		const result = await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.plugin.version).toBe("2.0.0");

		const key = pluginContributionKey("reinstall-plugin", "the-agent");
		const items = await listConfiguration(db, { kind: "agent" });
		const item = items.find((i) => i.key === key);
		expect(item?.activeValue).toMatchObject({ name: "v2" });
	});

	test("detached item stays detached after reinstall", async ({ db }) => {
		const pluginDir = makePluginDir("detach-reinstall", [
			{ kind: "agent", key: "d-agent", value: { name: "v1" } },
		]);
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});

		const key = pluginContributionKey("detach-reinstall", "d-agent");
		await writeConfigurationOverride(db, {
			kind: "agent",
			key,
			value: { name: "User value" },
		});

		// Reinstall with v2
		writeFileSync(
			join(pluginDir, "plugin.json"),
			JSON.stringify({
				$schema: VALID_SCHEMA,
				name: "detach-reinstall",
				version: "2.0.0",
				extensions: {
					"io.hyperidle": {
						contributions: [{ kind: "agent", key: "d-agent", value: { name: "v2" } }],
					},
				},
			}),
			"utf8",
		);
		await installPlugin(db, {
			source: { kind: "folder", path: pluginDir },
			scope: { kind: "factory", teamId: null },
		});

		const items = await listConfiguration(db, { kind: "agent" });
		const item = items.find((i) => i.key === key);

		// User value still wins
		expect(item?.valueSource).toBe("user_override");
		expect(item?.activeValue).toMatchObject({ name: "User value" });
		// Default updated
		expect(item?.defaultValue).toMatchObject({ name: "v2" });
	});
});
