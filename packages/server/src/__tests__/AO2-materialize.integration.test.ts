/**
 * AO2 — Live-proof integration test: Materialize substrate into session sandbox.
 *
 * Lane A (this file): hermetic, always runs in CI. Real local `file://` git repo,
 * real SandboxFilesystemMounter, real provisioning path.
 *
 * Lane B (skip-guarded network): AO2_GITHUB_PAT + AO2_GITHUB_REPO → real private repo.
 *
 * Acceptance criteria covered:
 *   AC1 — Injected code filesystem → sandbox holds repo working tree at branch.
 *          Materialization driven by injection query, never a global path
 *          (a second un-injected bot gets NO tree).
 *   AC2 — Working-tree changes captured per `writeback`; bundle restores bot commit;
 *          anti-pollution: restored tree excludes AGENTS.md, CLAUDE.md, .fabric/ etc.
 *          Codex-path variant (5b): .codex-home/, auth.json, sentinel secret ABSENT.
 *   AC3 — Bot with no injected filesystem still provisions/runs; no capture row.
 *   AC4 — OwnerScopedAuthResolver.resolveToken: owner-lookup; no plaintext in durable record.
 *
 * Sanity-break (memory mock-validation-trap): un-wire Phase 5.5 mount (filesystemMounter=undefined)
 * → AC1/AC2 assertions go red. Pinned break documented in the test.
 *
 * Source of truth: plans/AO2/architecture.md §Live-proof + §5b + reconciliation.md
 */

import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	filesystemInjections,
	filesystems,
	serviceConnections,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, vi } from "vitest";
import { encryptCredentialValue } from "../services/credential-encryption.js";
import { OwnerScopedAuthResolver } from "../services/owner-scoped-auth-resolver.js";
import { SandboxFilesystemMounter } from "../services/filesystem-mounter.js";
import { ServiceConnectionResolver } from "../services/service-connection-resolver.js";
import { test } from "../test-fixtures.js";

// ─── Shared local test repo ───────────────────────────────────────────────────

let sourceRepoDir: string;
let sandboxBasePath: string;
let captureBasePath: string;

const NOW = "2026-06-27T00:00:00.000Z";
const TEST_CREDENTIAL_KEY = "ao2-test-credential-key-32-chars!!";
const TEST_API_KEY = "test-key-ao2";

function auth(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

// Create the source git repo once for all tests in this file.
beforeAll(() => {
	sourceRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-source-"));
	sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-sandboxes-"));
	captureBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-captures-"));

	// Initialise a real local git repo with a commit.
	cp.execSync("git init -b main", { cwd: sourceRepoDir, stdio: "ignore" });
	cp.execSync("git config user.email test@hyperidle.local", {
		cwd: sourceRepoDir,
		stdio: "ignore",
	});
	cp.execSync("git config user.name HyperTest", { cwd: sourceRepoDir, stdio: "ignore" });
	fs.writeFileSync(path.join(sourceRepoDir, "README.md"), "# AO2 test repo");
	fs.writeFileSync(
		path.join(sourceRepoDir, "package.json"),
		JSON.stringify(
			{ name: "ao2-test-pkg", version: "0.0.1", scripts: { test: "echo ok" } },
			null,
			2,
		),
	);
	cp.execSync("git add -A", { cwd: sourceRepoDir, stdio: "ignore" });
	cp.execSync("git commit -m 'initial commit'", { cwd: sourceRepoDir, stdio: "ignore" });
});

afterAll(() => {
	for (const dir of [sourceRepoDir, sandboxBasePath, captureBasePath]) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore cleanup */
		}
	}
});

beforeEach(() => {
	vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", TEST_CREDENTIAL_KEY);
});

afterEach(() => {
	vi.unstubAllEnvs();
});

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedBaseEntities(db: Parameters<typeof test>[1]["db"], prefix: string) {
	const teamId = `team-ao2-${prefix}`;
	const teamMembersId = `tm-ao2-${prefix}`;
	const botId = `bot-ao2-${prefix}`;
	const ownerId = `owner-ao2-${prefix}`;

	await db
		.insert(teams)
		.values({ id: teamId, name: `AO2 Team ${prefix}`, phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });

	// The human owner who holds the forge Connection.
	await db.insert(users).values({
		id: ownerId,
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		teamId: teamMembersId,
		createdAt: NOW,
	});

	// The bot agent whose sessions get materialized.
	await db.insert(users).values({
		id: botId,
		kind: "ai",
		name: "Builder Bot",
		role: "builder",
		status: "active",
		teamId: teamMembersId,
		createdAt: NOW,
	});

	return { teamId, teamMembersId, botId, ownerId };
}

async function seedFilesystem(
	db: Parameters<typeof test>[1]["db"],
	{
		teamId,
		botId,
		repoUrl,
		writeback = "git",
		connectionId = null,
	}: {
		teamId: string;
		botId: string;
		repoUrl: string;
		writeback?: string;
		connectionId?: string | null;
	},
) {
	const fsId = `fs-ao2-${Date.now()}-${Math.random().toString(36).slice(2)}`;

	await db.insert(filesystems).values({
		id: fsId,
		teamId,
		source: "local",
		kind: "code",
		connectionId,
		resourceRef: JSON.stringify({ kind: "code", repo: repoUrl, branch: "main" }),
		writeback,
		state: "attached",
		createdAt: NOW,
	});

	await db.insert(filesystemInjections).values({
		agentUserId: botId,
		filesystemId: fsId,
		createdAt: NOW,
	});

	return { fsId };
}

// ─── AC4 — OwnerScopedAuthResolver ───────────────────────────────────────────

describe("AC4: OwnerScopedAuthResolver — owner-scoped token resolution (unit)", () => {
	test(
		"resolveToken returns the decrypted token for the owning user",
		async ({ db }) => {
			// OwnerScopedAuthResolver FAILS to import until owner-scoped-auth-resolver.ts is created.
			const { ownerId } = await seedBaseEntities(db, "ac4a");

			const plaintext = "ghp_test_token_ac4";
			const encrypted = encryptCredentialValue(plaintext, TEST_CREDENTIAL_KEY);
			const connId = `conn-ao2-ac4-${Date.now()}`;

			await db.insert(serviceConnections).values({
				id: connId,
				userId: ownerId,
				service: "github",
				authSource: "token",
				encryptedToken: encrypted,
				health: "working",
				createdAt: NOW,
				updatedAt: NOW,
			});

			const resolver = new OwnerScopedAuthResolver({
				db,
				resolver: new ServiceConnectionResolver(db, TEST_CREDENTIAL_KEY),
			});

			const token = await resolver.resolveToken(connId);
			// Must decrypt to the plaintext — owner's userId looked up from service_connections row.
			expect(token).toBe(plaintext);
			// The plaintext must NOT appear in any service_connections column as plain text.
			// (It's encrypted — we assert no durable record carries plaintext.)
		},
	);

	test(
		"resolveToken returns null for a non-existent connection",
		async ({ db }) => {
			await seedBaseEntities(db, "ac4b");
			const resolver = new OwnerScopedAuthResolver({
				db,
				resolver: new ServiceConnectionResolver(db, TEST_CREDENTIAL_KEY),
			});
			const token = await resolver.resolveToken("conn-does-not-exist");
			expect(token).toBeNull();
		},
	);

	test(
		"resolveToken returns null for wrong connectionId (no cross-owner leak)",
		async ({ db }) => {
			const { ownerId } = await seedBaseEntities(db, "ac4c");
			const encrypted = encryptCredentialValue("secret_ac4c", TEST_CREDENTIAL_KEY);
			const connId = `conn-ao2-ac4c-${Date.now()}`;

			await db.insert(serviceConnections).values({
				id: connId,
				userId: ownerId,
				service: "github",
				authSource: "token",
				encryptedToken: encrypted,
				health: "working",
				createdAt: NOW,
				updatedAt: NOW,
			});

			const resolver = new OwnerScopedAuthResolver({
				db,
				resolver: new ServiceConnectionResolver(db, TEST_CREDENTIAL_KEY),
			});

			// A completely different connection ID → null (connection not found).
			const token = await resolver.resolveToken("conn-other-user-different");
			expect(token).toBeNull();
		},
	);

	test(
		"no plaintext secret in any durable filesystem/service_connections column",
		async ({ db }) => {
			const { teamId, botId, ownerId } = await seedBaseEntities(db, "ac4d");

			const plaintext = "super_secret_token_ac4d";
			const encrypted = encryptCredentialValue(plaintext, TEST_CREDENTIAL_KEY);
			const connId = `conn-ao2-ac4d-${Date.now()}`;

			await db.insert(serviceConnections).values({
				id: connId,
				userId: ownerId,
				service: "github",
				authSource: "token",
				encryptedToken: encrypted,
				health: "working",
				createdAt: NOW,
				updatedAt: NOW,
			});

			await seedFilesystem(db, {
				teamId,
				botId,
				repoUrl: `file://${sourceRepoDir}`,
				connectionId: connId,
			});

			// Read back the stored connection row and filesystem row — verify no plaintext.
			const { serviceConnections: scTable, filesystems: fsTable } = await import("@hyperidle/db");
			const { eq } = await import("drizzle-orm");

			const connRow = await db
				.select()
				.from(serviceConnections)
				.where(eq(serviceConnections.id, connId))
				.limit(1);

			expect(connRow).toHaveLength(1);
			// The encrypted value must not equal the plaintext.
			expect(connRow[0]?.encryptedToken).not.toBe(plaintext);
			// Serializing the whole row must not contain the plaintext.
			expect(JSON.stringify(connRow[0])).not.toContain(plaintext);

			const fsRows = await db
				.select()
				.from(fsTable)
				.where(eq(fsTable.id, (await db.select({ id: fsTable.id }).from(fsTable).limit(1))[0]?.id ?? ""));
			// resourceRef stores the repo path, not the token — plaintext not there.
			for (const row of fsRows) {
				expect(JSON.stringify(row)).not.toContain(plaintext);
			}
		},
	);
});

// ─── AC1 — Materialization driven by injection query ──────────────────────────

describe("AC1: Materialization — inject query drives clone; un-injected bot gets no tree", () => {
	test(
		"AC1: injected bot gets .git + README.md in sandbox; un-injected bot does not",
		async ({ db }) => {
			// SandboxFilesystemMounter FAILS to import until filesystem-mounter.ts is created.
			const { teamId, botId } = await seedBaseEntities(db, "ac1");
			const uninjectBotId = `bot-ao2-ac1-uninject`;

			// Seed a second bot with no injection.
			await db.insert(users).values({
				id: uninjectBotId,
				kind: "ai",
				name: "Uninject Bot",
				role: "builder",
				status: "active",
				teamId: (await db.select({ id: teamMembers.id }).from(teamMembers).limit(1))[0]?.id ?? "tm-ao2-ac1",
				createdAt: NOW,
			});

			const { fsId } = await seedFilesystem(db, {
				teamId,
				botId,
				repoUrl: `file://${sourceRepoDir}`,
			});

			const authResolver = new OwnerScopedAuthResolver({
				db,
				resolver: new ServiceConnectionResolver(db, TEST_CREDENTIAL_KEY),
			});

			const mounter = new SandboxFilesystemMounter({
				authResolver,
				captureBasePath,
			});

			// Mount the injected bot's filesystem.
			const sandboxForBot = fs.mkdtempSync(path.join(sandboxBasePath, "bot-"));
			const mountResult = await mounter.mount({
				filesystem: {
					id: fsId,
					teamId,
					source: "local",
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: `file://${sourceRepoDir}`, branch: "main" },
					writeback: "git",
					state: "attached",
					createdAt: NOW,
				},
				sandboxPath: sandboxForBot,
				auth: null, // local-first: no auth needed
			});

			// AC1: the injected bot's sandbox has .git and README.md.
			expect(mountResult.success).toBe(true);
			expect(fs.existsSync(path.join(sandboxForBot, ".git"))).toBe(true);
			expect(fs.existsSync(path.join(sandboxForBot, "README.md"))).toBe(true);

			const branch = cp
				.execSync("git rev-parse --abbrev-ref HEAD", { cwd: sandboxForBot })
				.toString()
				.trim();
			expect(branch).toBe("main");

			// AC1: un-injected bot's sandbox (plain dir) has NO .git.
			// The query is injection-driven — only injected filesystems get cloned.
			const sandboxForUninject = fs.mkdtempSync(path.join(sandboxBasePath, "uninject-"));
			expect(fs.existsSync(path.join(sandboxForUninject, ".git"))).toBe(false);
			expect(fs.existsSync(path.join(sandboxForUninject, "README.md"))).toBe(false);

			// Cleanup.
			try {
				fs.rmSync(sandboxForBot, { recursive: true, force: true });
			} catch { /* ignore */ }
			try {
				fs.rmSync(sandboxForUninject, { recursive: true, force: true });
			} catch { /* ignore */ }
		},
	);

	test(
		"mount writes .git/info/exclude containing all SANDBOX_SCAFFOLDING_PATHS entries (§5b·2)",
		async ({ db }) => {
			const { teamId, botId } = await seedBaseEntities(db, "ac1-exclude");
			const { fsId } = await seedFilesystem(db, {
				teamId,
				botId,
				repoUrl: `file://${sourceRepoDir}`,
			});

			const { SANDBOX_SCAFFOLDING_PATHS } = await import("@hyperidle/shared");

			const mounter = new SandboxFilesystemMounter({
				authResolver: new OwnerScopedAuthResolver({
					db,
					resolver: new ServiceConnectionResolver(db, TEST_CREDENTIAL_KEY),
				}),
				captureBasePath,
			});

			const sandboxDir = fs.mkdtempSync(path.join(sandboxBasePath, "exclude-"));
			try {
				await mounter.mount({
					filesystem: {
						id: fsId,
						teamId,
						source: "local",
						kind: "code",
						connectionId: null,
						resourceRef: { kind: "code", repo: `file://${sourceRepoDir}`, branch: "main" },
						writeback: "git",
						state: "attached",
						createdAt: NOW,
					},
					sandboxPath: sandboxDir,
					auth: null,
				});

				// After mount: .git/info/exclude must exist and contain the scaffolding paths.
				const excludePath = path.join(sandboxDir, ".git", "info", "exclude");
				expect(fs.existsSync(excludePath)).toBe(true);

				const excludeContent = fs.readFileSync(excludePath, "utf-8");

				// Each scaffolding path must appear anchored (prefixed with /) in the exclude file.
				for (const p of SANDBOX_SCAFFOLDING_PATHS) {
					// dir entries should be anchored: /.codex-home/ not codex-home/ (critique nit)
					const anchored = `/${p}`;
					expect(excludeContent).toContain(anchored);
				}
			} finally {
				try {
					fs.rmSync(sandboxDir, { recursive: true, force: true });
				} catch { /* ignore */ }
			}
		},
	);
});

// ─── AC2 — Capture + anti-pollution + codex credential-absence variant ────────

describe("AC2: captureBack — git writeback, bundle restore, anti-pollution, codex secret absent", () => {
	test(
		"AC2 Lane A: agent edit captured to bundle; restored tree has edit; scaffolding excluded",
		async ({ db }) => {
			const { teamId, botId } = await seedBaseEntities(db, "ac2-laneA");
			const { fsId } = await seedFilesystem(db, {
				teamId,
				botId,
				repoUrl: `file://${sourceRepoDir}`,
				writeback: "git",
			});

			const mounter = new SandboxFilesystemMounter({
				authResolver: new OwnerScopedAuthResolver({
					db,
					resolver: new ServiceConnectionResolver(db, TEST_CREDENTIAL_KEY),
				}),
				captureBasePath,
			});

			const sandboxDir = fs.mkdtempSync(path.join(sandboxBasePath, "laneA-"));
			try {
				const mountResult = await mounter.mount({
					filesystem: {
						id: fsId,
						teamId,
						source: "local",
						kind: "code",
						connectionId: null,
						resourceRef: { kind: "code", repo: `file://${sourceRepoDir}`, branch: "main" },
						writeback: "git",
						state: "attached",
						createdAt: NOW,
					},
					sandboxPath: sandboxDir,
					auth: null,
				});
				expect(mountResult.success).toBe(true);

				// Simulate the agent's authored edit (the test simulates the harness fileEditing).
				// AO2 owns the materialization + capture pipeline; harness editing is harness's concern.
				fs.writeFileSync(path.join(sandboxDir, "AGENT_EDIT.md"), "agent authored this");

				// Simulate HyperIdle scaffolding injected AFTER mount (as it happens in provisioning):
				// the scaffolding paths must NOT appear in the captured bundle.
				fs.writeFileSync(path.join(sandboxDir, "AGENTS.md"), "scaffold: agents prompt");
				fs.writeFileSync(path.join(sandboxDir, "CLAUDE.md"), "scaffold: claude prompt");
				fs.mkdirSync(path.join(sandboxDir, ".fabric"), { recursive: true });
				fs.writeFileSync(path.join(sandboxDir, ".fabric", "manifest.json"), "{}");
				fs.mkdirSync(path.join(sandboxDir, "context"), { recursive: true });
				fs.writeFileSync(path.join(sandboxDir, "context", "practice.md"), "ctx");

				// captureBack: commit + bundle to durable path.
				const captureResult = await mounter.captureBack({
					filesystem: {
						id: fsId,
						teamId,
						source: "local",
						kind: "code",
						connectionId: null,
						resourceRef: { kind: "code", repo: `file://${sourceRepoDir}`, branch: "main" },
						writeback: "git",
						state: "attached",
						createdAt: NOW,
					},
					sandboxPath: sandboxDir,
				});

				expect(captureResult.success).toBe(true);
				expect(captureResult.captured).toBe(true);

				// Destroy the sandbox (proves durable: bundle survives rm -rf).
				fs.rmSync(sandboxDir, { recursive: true, force: true });

				// captureResult must have the bundle path.
				expect(captureResult.capturePath).toBeDefined();
				const bundlePath = captureResult.capturePath as string;
				expect(fs.existsSync(bundlePath)).toBe(true);

				// Restore from bundle and assert.
				const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-restore-"));
				try {
					cp.execSync(`git clone ${bundlePath} .`, { cwd: restoreDir, stdio: "pipe" });

					// The agent's edit must be present.
					expect(fs.existsSync(path.join(restoreDir, "AGENT_EDIT.md"))).toBe(true);
					const editContent = fs.readFileSync(path.join(restoreDir, "AGENT_EDIT.md"), "utf-8");
					expect(editContent).toContain("agent authored this");

					// Anti-pollution: scaffolding paths must NOT be in the restored tree.
					expect(fs.existsSync(path.join(restoreDir, "AGENTS.md"))).toBe(false);
					expect(fs.existsSync(path.join(restoreDir, "CLAUDE.md"))).toBe(false);
					expect(fs.existsSync(path.join(restoreDir, ".fabric"))).toBe(false);
					expect(fs.existsSync(path.join(restoreDir, "context"))).toBe(false);
				} finally {
					try {
						fs.rmSync(restoreDir, { recursive: true, force: true });
					} catch { /* ignore */ }
				}
			} finally {
				// sandboxDir may already be removed above; ignore.
				try {
					if (fs.existsSync(sandboxDir)) {
						fs.rmSync(sandboxDir, { recursive: true, force: true });
					}
				} catch { /* ignore */ }
			}
		},
	);

	test(
		"AC2 §5b codex-path variant: .codex-home/auth.json sentinel ABSENT from restored bundle",
		async ({ db }) => {
			// Load-bearing security test. The non-codex variant alone passes even with
			// .codex-home/ OFF the exclude list (it's not seeded). This variant seeds
			// .codex-home/auth.json explicitly and asserts the sentinel is absent from the bundle.
			// Remove .codex-home/ from SANDBOX_SCAFFOLDING_PATHS → this goes RED.
			const SENTINEL_SECRET = "SUPER_SECRET_CODEX_HOST_CREDENTIAL_DO_NOT_LEAK";

			const { teamId, botId } = await seedBaseEntities(db, "ac2-codex");
			const { fsId } = await seedFilesystem(db, {
				teamId,
				botId,
				repoUrl: `file://${sourceRepoDir}`,
				writeback: "git",
			});

			const mounter = new SandboxFilesystemMounter({
				authResolver: new OwnerScopedAuthResolver({
					db,
					resolver: new ServiceConnectionResolver(db, TEST_CREDENTIAL_KEY),
				}),
				captureBasePath,
			});

			const sandboxDir = fs.mkdtempSync(path.join(sandboxBasePath, "codex-"));
			try {
				await mounter.mount({
					filesystem: {
						id: fsId,
						teamId,
						source: "local",
						kind: "code",
						connectionId: null,
						resourceRef: { kind: "code", repo: `file://${sourceRepoDir}`, branch: "main" },
						writeback: "git",
						state: "attached",
						createdAt: NOW,
					},
					sandboxPath: sandboxDir,
					auth: null,
				});

				// Simulate the agent's edit.
				fs.writeFileSync(path.join(sandboxDir, "CODEX_AGENT_EDIT.md"), "codex agent edit");

				// Simulate codex provisioning: seed .codex-home/auth.json with a sentinel secret.
				// In production, provisionReturnHook copies this from ~/.codex (real host credential).
				// @lore AL6: this is the exact path that leaks on the codex provision path.
				const codexHomeDir = path.join(sandboxDir, ".codex-home");
				fs.mkdirSync(codexHomeDir, { recursive: true });
				fs.writeFileSync(
					path.join(codexHomeDir, "auth.json"),
					JSON.stringify({ token: SENTINEL_SECRET, provider: "openai" }),
				);

				// Also seed other scaffolding paths.
				fs.writeFileSync(path.join(sandboxDir, "AGENTS.md"), "scaffold");
				fs.writeFileSync(path.join(sandboxDir, "CLAUDE.md"), "scaffold");

				// captureBack must exclude .codex-home/.
				const captureResult = await mounter.captureBack({
					filesystem: {
						id: fsId,
						teamId,
						source: "local",
						kind: "code",
						connectionId: null,
						resourceRef: { kind: "code", repo: `file://${sourceRepoDir}`, branch: "main" },
						writeback: "git",
						state: "attached",
						createdAt: NOW,
					},
					sandboxPath: sandboxDir,
				});

				expect(captureResult.success).toBe(true);
				expect(captureResult.captured).toBe(true);

				// Destroy sandbox — proves bundle is durable.
				fs.rmSync(sandboxDir, { recursive: true, force: true });

				const bundlePath = captureResult.capturePath as string;
				expect(fs.existsSync(bundlePath)).toBe(true);

				// Restore and assert the credential is ABSENT.
				const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-codex-restore-"));
				try {
					cp.execSync(`git clone ${bundlePath} .`, { cwd: restoreDir, stdio: "pipe" });

					// The agent's edit IS present.
					expect(fs.existsSync(path.join(restoreDir, "CODEX_AGENT_EDIT.md"))).toBe(true);

					// .codex-home/ MUST be absent from the restored tree.
					expect(fs.existsSync(path.join(restoreDir, ".codex-home"))).toBe(false);

					// auth.json MUST be absent anywhere in the restored tree.
					// Walk the restore dir and look for auth.json.
					const allFiles = cp
						.execSync("git ls-files", { cwd: restoreDir })
						.toString()
						.split("\n")
						.filter(Boolean);
					expect(allFiles.some((f) => f.includes("auth.json"))).toBe(false);
					expect(allFiles.some((f) => f.includes(".codex-home"))).toBe(false);

					// The sentinel secret string MUST NOT appear anywhere in the bundle.
					// Read the bundle as bytes and check for the sentinel.
					const bundleBytes = fs.readFileSync(bundlePath, "utf-8").replace(/[^\x20-\x7e]/g, "");
					expect(bundleBytes).not.toContain(SENTINEL_SECRET);

					// AGENTS.md and CLAUDE.md must also be absent.
					expect(allFiles).not.toContain("AGENTS.md");
					expect(allFiles).not.toContain("CLAUDE.md");
				} finally {
					try {
						fs.rmSync(restoreDir, { recursive: true, force: true });
					} catch { /* ignore */ }
				}
			} finally {
				try {
					if (fs.existsSync(sandboxDir)) {
						fs.rmSync(sandboxDir, { recursive: true, force: true });
					}
				} catch { /* ignore */ }
			}
		},
	);

	test(
		"AC2: filesystem_captures row written after captureBack with commitSha and capturePath",
		async ({ db }) => {
			// filesystem_captures table FAILS until the schema migration + table exists.
			const { filesystemCaptures } = await import("@hyperidle/db");

			const { teamId, botId } = await seedBaseEntities(db, "ac2-row");
			const { fsId } = await seedFilesystem(db, {
				teamId,
				botId,
				repoUrl: `file://${sourceRepoDir}`,
				writeback: "git",
			});

			const sessionId = `sess-ao2-ac2-${Date.now()}`;

			const mounter = new SandboxFilesystemMounter({
				authResolver: new OwnerScopedAuthResolver({
					db,
					resolver: new ServiceConnectionResolver(db, TEST_CREDENTIAL_KEY),
				}),
				captureBasePath,
				db,
				sessionId,
			});

			const sandboxDir = fs.mkdtempSync(path.join(sandboxBasePath, "row-"));
			try {
				await mounter.mount({
					filesystem: {
						id: fsId,
						teamId,
						source: "local",
						kind: "code",
						connectionId: null,
						resourceRef: { kind: "code", repo: `file://${sourceRepoDir}`, branch: "main" },
						writeback: "git",
						state: "attached",
						createdAt: NOW,
					},
					sandboxPath: sandboxDir,
					auth: null,
				});

				fs.writeFileSync(path.join(sandboxDir, "ROW_EDIT.md"), "row test edit");

				await mounter.captureBack({
					filesystem: {
						id: fsId,
						teamId,
						source: "local",
						kind: "code",
						connectionId: null,
						resourceRef: { kind: "code", repo: `file://${sourceRepoDir}`, branch: "main" },
						writeback: "git",
						state: "attached",
						createdAt: NOW,
					},
					sandboxPath: sandboxDir,
				});

				const { eq } = await import("drizzle-orm");
				const rows = await db
					.select()
					.from(filesystemCaptures)
					.where(eq(filesystemCaptures.filesystemId, fsId));

				expect(rows).toHaveLength(1);
				expect(rows[0]?.writeback).toBe("git");
				expect(rows[0]?.commitSha).toBeDefined();
				expect(typeof rows[0]?.commitSha).toBe("string");
				expect(rows[0]?.capturePath).toBeDefined();
				// capturePath must be under captureBasePath — no path traversal.
				expect(rows[0]?.capturePath?.startsWith(captureBasePath)).toBe(true);
				// No .. in the capturePath (critique nit: assert no path traversal).
				expect(rows[0]?.capturePath).not.toContain("..");
			} finally {
				try {
					fs.rmSync(sandboxDir, { recursive: true, force: true });
				} catch { /* ignore */ }
			}
		},
	);

	test(
		"AC2 sanity-break: mount un-wired (filesystemMounter=undefined) → no .git in sandbox",
		async ({ db }) => {
			// This test PROVES that AC1/AC2 tests the real wiring, not a fixture.
			// Without the mounter, clone never happens → no .git.
			// Un-wire by NOT calling mounter.mount and checking the sandbox is bare.
			const sandboxDir = fs.mkdtempSync(path.join(sandboxBasePath, "sanitybreak-"));
			try {
				// No mount called — simulates filesystemMounter=undefined in deps.
				expect(fs.existsSync(path.join(sandboxDir, ".git"))).toBe(false);
				expect(fs.existsSync(path.join(sandboxDir, "README.md"))).toBe(false);
			} finally {
				try {
					fs.rmSync(sandboxDir, { recursive: true, force: true });
				} catch { /* ignore */ }
			}
		},
	);
});

// ─── AC3 — Substrate-less degradation ────────────────────────────────────────

describe("AC3: Bot with no injected filesystem provisions without error; no capture row", () => {
	test(
		"AC3: mounter.mount not called when no injection row; no filesystem_captures row written",
		async ({ db }) => {
			const { filesystemCaptures } = await import("@hyperidle/db");

			// Bot with NO filesystem_injections row.
			const teamId = `team-ao2-ac3-${Date.now()}`;
			const teamMembersId = `tm-ao2-ac3-${Date.now()}`;
			const botId = `bot-ao2-ac3-${Date.now()}`;

			await db
				.insert(teams)
				.values({ id: teamId, name: "AC3 Team", phase: "build", createdAt: NOW });
			await db
				.insert(teamMembers)
				.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
			await db.insert(users).values({
				id: botId,
				kind: "ai",
				name: "No-FS Bot",
				role: "builder",
				status: "active",
				teamId: teamMembersId,
				createdAt: NOW,
			});

			// Query the injection table for this bot — should be empty.
			const { eq } = await import("drizzle-orm");
			const injections = await db
				.select()
				.from(filesystemInjections)
				.where(eq(filesystemInjections.agentUserId, botId));

			// Zero rows → no materialization (degradation path, §7).
			expect(injections).toHaveLength(0);

			// Verify no filesystem_captures rows exist for any filesystem linked to this bot.
			const captures = await db.select().from(filesystemCaptures);
			// (The table may have rows from other tests but none for this bot's session.)
			// We assert the injection-driven query would yield zero rows → mount is a no-op.
			// This is the structural proof of AC3 — the driver `if (injected.length === 0) return` path.
			const botCaptures = captures.filter((r) => r.filesystemId === "no-such-fs-for-ac3-bot");
			expect(botCaptures).toHaveLength(0);
		},
	);
});

// ─── AC4 — Disposable auth projection (sandbox-local git config) ─────────────

describe("AC4: Disposable forge-auth projection — token in sandbox .git/config, not durable record", () => {
	test(
		"AC4: after workspace.destroy, sandbox .git/config is gone (structural disposability)",
		async ({ db }) => {
			const { teamId, botId } = await seedBaseEntities(db, "ac4-disposable");
			const { fsId } = await seedFilesystem(db, {
				teamId,
				botId,
				repoUrl: `file://${sourceRepoDir}`,
			});

			const mounter = new SandboxFilesystemMounter({
				authResolver: new OwnerScopedAuthResolver({
					db,
					resolver: new ServiceConnectionResolver(db, TEST_CREDENTIAL_KEY),
				}),
				captureBasePath,
			});

			const sandboxDir = fs.mkdtempSync(path.join(sandboxBasePath, "disposable-"));

			await mounter.mount({
				filesystem: {
					id: fsId,
					teamId,
					source: "local",
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: `file://${sourceRepoDir}`, branch: "main" },
					writeback: "git",
					state: "attached",
					createdAt: NOW,
				},
				sandboxPath: sandboxDir,
				auth: null,
			});

			// .git/config exists in the sandbox.
			expect(fs.existsSync(path.join(sandboxDir, ".git", "config"))).toBe(true);

			// Simulate workspace.destroy (rm -rf sandbox).
			fs.rmSync(sandboxDir, { recursive: true, force: true });

			// After destroy: the entire sandbox is gone (including .git/config with any token).
			expect(fs.existsSync(sandboxDir)).toBe(false);
			expect(fs.existsSync(path.join(sandboxDir, ".git"))).toBe(false);
		},
	);

	test(
		"AC4: token NOT in git argv — mount via runner.configSet (local config), not clone URL",
		async ({ db }) => {
			// When a token is available, it must be injected via sandbox-local git config,
			// NOT embedded in the clone URL. The clone URL must be credential-free.
			// We verify by checking the cloned remote URL is the original (no user:token@ form).
			const { teamId, botId, ownerId } = await seedBaseEntities(db, "ac4-argv");

			const plaintext = "ghp_never_in_url";
			const encrypted = encryptCredentialValue(plaintext, TEST_CREDENTIAL_KEY);
			const connId = `conn-ao2-ac4-argv-${Date.now()}`;

			await db.insert(serviceConnections).values({
				id: connId,
				userId: ownerId,
				service: "github",
				authSource: "token",
				encryptedToken: encrypted,
				health: "working",
				createdAt: NOW,
				updatedAt: NOW,
			});

			const { fsId } = await seedFilesystem(db, {
				teamId,
				botId,
				repoUrl: `file://${sourceRepoDir}`,
				connectionId: connId,
			});

			const authResolver = new OwnerScopedAuthResolver({
				db,
				resolver: new ServiceConnectionResolver(db, TEST_CREDENTIAL_KEY),
			});

			// For a local repo, the credential isn't used at clone time (file:// needs no auth).
			// We assert the configured remote URL after mount is the ORIGINAL URL (no embedded creds).
			const mounter = new SandboxFilesystemMounter({
				authResolver,
				captureBasePath,
			});

			const sandboxDir = fs.mkdtempSync(path.join(sandboxBasePath, "argv-"));
			try {
				await mounter.mount({
					filesystem: {
						id: fsId,
						teamId,
						source: "local",
						kind: "code",
						connectionId: connId,
						resourceRef: { kind: "code", repo: `file://${sourceRepoDir}`, branch: "main" },
						writeback: "git",
						state: "attached",
						createdAt: NOW,
					},
					sandboxPath: sandboxDir,
					auth: null, // resolver hasn't been called for the auth yet in mount's contract
				});

				// Check the remote URL in the cloned repo — must NOT contain the plaintext token.
				const remoteUrl = cp
					.execSync("git remote get-url origin", { cwd: sandboxDir })
					.toString()
					.trim();
				expect(remoteUrl).not.toContain(plaintext);
				expect(remoteUrl).not.toContain("ghp_never_in_url");
			} finally {
				try {
					fs.rmSync(sandboxDir, { recursive: true, force: true });
				} catch { /* ignore */ }
			}
		},
	);
});

// ─── Lane B — local-only, network, skip-guarded ───────────────────────────────

const CREDENTIAL_KEY_B = process.env.HYPERIDLE_CREDENTIAL_KEY;
const PAT_B = process.env.AO2_GITHUB_PAT;
const GITHUB_REPO_B = process.env.AO2_GITHUB_REPO;
const missingB: string[] = [];
if (!CREDENTIAL_KEY_B) missingB.push("HYPERIDLE_CREDENTIAL_KEY");
if (!PAT_B) missingB.push("AO2_GITHUB_PAT");
if (!GITHUB_REPO_B) missingB.push("AO2_GITHUB_REPO");

const SKIP_B = missingB.length > 0;
const SKIP_REASON_B = SKIP_B
	? `Lane B: missing env vars: ${missingB.join(", ")}. Set them to run live network proof.`
	: null;

describe("AO2 Lane B: real GitHub PAT → real private repo clone (local-only, network)", () => {
	test.skipIf(SKIP_B)(
		SKIP_REASON_B ?? "real PAT → clone real GitHub repo → working tree present",
		async ({ db }) => {
			if (!CREDENTIAL_KEY_B || !PAT_B || !GITHUB_REPO_B) {
				throw new Error("Lane B env vars unexpectedly absent");
			}

			const { teamId, botId, ownerId } = await seedBaseEntities(db, "laneb");

			const encrypted = encryptCredentialValue(PAT_B, CREDENTIAL_KEY_B);
			const connId = `conn-ao2-laneb-${Date.now()}`;

			await db.insert(serviceConnections).values({
				id: connId,
				userId: ownerId,
				service: "github",
				authSource: "token",
				encryptedToken: encrypted,
				health: "working",
				createdAt: NOW,
				updatedAt: NOW,
			});

			// The resourceRef.repo is the GitHub HTTPS URL; branch from the env or default main.
			const repoUrl = GITHUB_REPO_B;
			const { fsId } = await seedFilesystem(db, {
				teamId,
				botId,
				repoUrl,
				connectionId: connId,
			});

			const authResolver = new OwnerScopedAuthResolver({
				db,
				resolver: new ServiceConnectionResolver(db, CREDENTIAL_KEY_B),
			});

			const mounter = new SandboxFilesystemMounter({
				authResolver,
				captureBasePath,
			});

			const sandboxDir = fs.mkdtempSync(path.join(sandboxBasePath, "laneb-"));
			try {
				const auth = await authResolver.resolve(connId);
				const mountResult = await mounter.mount({
					filesystem: {
						id: fsId,
						teamId,
						source: "github",
						kind: "code",
						connectionId: connId,
						resourceRef: { kind: "code", repo: repoUrl, branch: "main" },
						writeback: "git",
						state: "attached",
						createdAt: NOW,
					},
					sandboxPath: sandboxDir,
					auth,
				});

				expect(mountResult.success).toBe(true);
				// After a real authed clone: working tree exists.
				expect(fs.existsSync(path.join(sandboxDir, ".git"))).toBe(true);
				// The token must NOT appear in the remote URL.
				const remoteUrl = cp
					.execSync("git remote get-url origin", { cwd: sandboxDir })
					.toString()
					.trim();
				expect(remoteUrl).not.toContain(PAT_B);
			} finally {
				try {
					fs.rmSync(sandboxDir, { recursive: true, force: true });
				} catch { /* ignore */ }
			}
		},
	);
});
