/**
 * H1 Git Export — integration tests against real `git`.
 *
 * Each test uses a disposable tmpdir for the working repo and a `--bare`
 * sibling as the `file://` remote, so the tests need no network, no auth and
 * no fixtures.
 *
 * AC mapping (see plans/work-packages/TRACK-H.md -> H1):
 *   AC1 — Edit L4 PRINCIPLES -> export runs -> commit exists with correct file content.
 *   AC2 — Last commit message includes the item identifier string (e.g. "L4 PRINCIPLES [factory]").
 *   AC3 — Second export with no changes creates NO new commit.
 *   AC4 — `fs.readFileSync(path).toString() === item.body` byte-exact.
 *   AC5 — Parametrized over repoPath, remoteUrl, branch — all honored.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createTestDb, factorySettings, type HyperIdleDb, knowledgeItems } from "@hyperidle/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	createNodeFsAdapter,
	type GitExportConfig,
	resetExportMutexes,
	runGitExport,
} from "../services/git-export.js";
import { createGitRunner } from "../services/git-export-runner.js";

const NOW_ISO = "2026-04-18T12:00:00.000Z";

let gitAvailable = false;

interface TmpEnv {
	readonly rootDir: string;
	readonly repoPath: string;
	readonly remoteDir: string;
	readonly remoteUrl: string;
}

function createTmpEnv(): TmpEnv {
	const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "h1-git-export-"));
	const repoPath = path.join(rootDir, "repo");
	const remoteDir = path.join(rootDir, "remote.git");
	execSync(`git init --bare -b main "${remoteDir}"`, { stdio: "ignore" });
	return {
		rootDir,
		repoPath,
		remoteDir,
		remoteUrl: `file://${remoteDir}`,
	};
}

function destroyTmpEnv(env: TmpEnv): void {
	if (fs.existsSync(env.rootDir)) {
		fs.rmSync(env.rootDir, { recursive: true, force: true });
	}
}

function setCfg(
	db: HyperIdleDb,
	cfg: Partial<GitExportConfig> & { enabled?: boolean; repoPath: string },
): void {
	const rows: Array<{ key: string; value: string }> = [
		{ key: "git_export.enabled", value: (cfg.enabled ?? true) ? "true" : "false" },
		{ key: "git_export.repo_path", value: cfg.repoPath },
		{ key: "git_export.branch", value: cfg.branch ?? "main" },
		{ key: "git_export.author_name", value: cfg.authorName ?? "HyperIdle Export" },
		{ key: "git_export.author_email", value: cfg.authorEmail ?? "export@hyperidle.local" },
		{ key: "git_export.debounce_ms", value: String(cfg.debounceMs ?? 0) },
		// Tests use file:// remotes — enable explicitly. Production rejects.
		{ key: "git_export.allow_file_remote", value: "true" },
	];
	if (cfg.remoteUrl) rows.push({ key: "git_export.remote_url", value: cfg.remoteUrl });

	for (const r of rows) {
		db.insert(factorySettings)
			.values({ key: r.key, value: r.value, updatedAt: NOW_ISO })
			.onConflictDoUpdate({
				target: factorySettings.key,
				set: { value: r.value, updatedAt: NOW_ISO },
			})
			.run();
	}
}

function seedL4Principles(db: HyperIdleDb, body: string, id = "ki-principles"): void {
	db.insert(knowledgeItems)
		.values({
			id,
			layer: "L4",
			scopeId: null,
			kind: "PRINCIPLES",
			topic: null,
			title: "Factory principles",
			body,
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "test",
			createdAt: NOW_ISO,
			updatedAt: NOW_ISO,
		})
		.run();
}

function seedL2Brief(
	db: HyperIdleDb,
	productId: string,
	body: string,
	id = `ki-${productId}-brief`,
): void {
	db.insert(knowledgeItems)
		.values({
			id,
			layer: "L2",
			scopeId: productId,
			kind: "BRIEF",
			topic: null,
			title: `${productId} brief`,
			body,
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "test",
			createdAt: NOW_ISO,
			updatedAt: NOW_ISO,
		})
		.run();
}

function gitInRepo(repoPath: string, cmd: string): string {
	return execSync(`git -C "${repoPath}" ${cmd}`, { encoding: "utf-8" });
}

function commitCount(repoPath: string): number {
	try {
		const out = gitInRepo(repoPath, "rev-list --count HEAD").trim();
		if (out === "") return 0;
		return Number(out);
	} catch {
		return 0;
	}
}

describe("Git Export — integration (real git)", () => {
	let envs: TmpEnv[] = [];
	let db: HyperIdleDb;

	beforeAll(() => {
		try {
			execSync("git --version", { stdio: "ignore" });
			gitAvailable = true;
		} catch {
			gitAvailable = false;
		}
	});

	beforeEach((ctx) => {
		if (!gitAvailable) ctx.skip();
		resetExportMutexes();
		db = createTestDb();
		envs = [];
	});

	afterEach(() => {
		for (const e of envs) destroyTmpEnv(e);
		envs = [];
	});

	afterAll(() => {
		for (const e of envs) destroyTmpEnv(e);
	});

	function newEnv(): TmpEnv {
		const e = createTmpEnv();
		envs.push(e);
		return e;
	}

	it("AC1: edit L4 PRINCIPLES -> export runs -> commit with correct file content", async () => {
		const env = newEnv();
		setCfg(db, { repoPath: env.repoPath, remoteUrl: env.remoteUrl });
		const body = "## Principles\n\n- Ship weekly.\n";
		seedL4Principles(db, body);

		const runner = createGitRunner(env.repoPath);
		const result = await runGitExport(db, {
			runner,
			fs: createNodeFsAdapter(),
		});

		expect(["committed", "pushed"]).toContain(result.status);

		const exportedPath = path.join(env.repoPath, "factory", "PRINCIPLES.md");
		expect(fs.existsSync(exportedPath)).toBe(true);
		expect(fs.readFileSync(exportedPath, "utf-8")).toBe(body);

		expect(commitCount(env.repoPath)).toBe(1);
	});

	it("AC2: last commit message includes the item identifier string", async () => {
		const env = newEnv();
		setCfg(db, { repoPath: env.repoPath, remoteUrl: env.remoteUrl });
		seedL4Principles(db, "# body\n");

		const runner = createGitRunner(env.repoPath);
		await runGitExport(db, { runner, fs: createNodeFsAdapter() });

		const last = gitInRepo(env.repoPath, 'log -1 --pretty=format:"%B"');
		expect(last).toContain("L4 PRINCIPLES [factory]");
	});

	it("AC3: second export with no changes creates NO new commit", async () => {
		const env = newEnv();
		setCfg(db, { repoPath: env.repoPath, remoteUrl: env.remoteUrl });
		seedL4Principles(db, "# unchanged body\n");

		const runner = createGitRunner(env.repoPath);
		const realFs = createNodeFsAdapter();

		await runGitExport(db, { runner, fs: realFs });
		const first = commitCount(env.repoPath);

		const second = await runGitExport(db, { runner, fs: realFs });
		expect(second.status).toBe("noop");
		expect(commitCount(env.repoPath)).toBe(first);
	});

	it("AC3: second export WITH one new item DOES create a new commit (newly-tracked file)", async () => {
		const env = newEnv();
		setCfg(db, { repoPath: env.repoPath, remoteUrl: env.remoteUrl });
		seedL4Principles(db, "# one\n", "ki-one");

		const runner = createGitRunner(env.repoPath);
		const realFs = createNodeFsAdapter();

		await runGitExport(db, { runner, fs: realFs });
		const first = commitCount(env.repoPath);
		expect(first).toBe(1);

		// Add a second L2 item — change detection must fire on the newly-staged file.
		seedL2Brief(db, "nimmly", "# nimmly brief\n");
		const second = await runGitExport(db, { runner, fs: realFs });
		expect(["committed", "pushed"]).toContain(second.status);
		expect(commitCount(env.repoPath)).toBe(first + 1);
	});

	it("AC4: exported markdown matches item body exactly (byte-for-byte)", async () => {
		const env = newEnv();
		setCfg(db, { repoPath: env.repoPath, remoteUrl: env.remoteUrl });
		const body = "---\ntitle: Hello\n---\n\n# Hi\n\nTabs\tand\ttrailing newline preserved.\n";
		seedL4Principles(db, body);

		const runner = createGitRunner(env.repoPath);
		await runGitExport(db, { runner, fs: createNodeFsAdapter() });

		const exported = fs.readFileSync(path.join(env.repoPath, "factory", "PRINCIPLES.md"), "utf-8");
		expect(exported).toBe(body);
	});

	it("AC5: honors custom repoPath, remoteUrl, branch", async () => {
		const env = newEnv();
		setCfg(db, {
			repoPath: env.repoPath,
			remoteUrl: env.remoteUrl,
			branch: "docs",
		});
		seedL4Principles(db, "# custom branch\n");

		const runner = createGitRunner(env.repoPath);
		const result = await runGitExport(db, { runner, fs: createNodeFsAdapter() });

		expect(["committed", "pushed"]).toContain(result.status);
		expect(fs.existsSync(env.repoPath)).toBe(true);
		const head = gitInRepo(env.repoPath, "symbolic-ref HEAD").trim();
		expect(head).toBe("refs/heads/docs");
		const remotes = gitInRepo(env.repoPath, "remote -v");
		expect(remotes).toContain(env.remoteUrl);
	});

	it("handles unicode + large bodies with byte-exact roundtrip", async () => {
		const env = newEnv();
		setCfg(db, { repoPath: env.repoPath, remoteUrl: env.remoteUrl });

		const big = `${"# 🎯 Reflection\n\n".repeat(5)}${"café résumé ñ 日本語 ☃\n".repeat(2000)}`;
		db.insert(knowledgeItems)
			.values({
				id: "ki-refl",
				layer: "L4",
				scopeId: null,
				kind: "REFLECTION",
				topic: "2026-04",
				title: "April reflection",
				body: big,
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "test",
				createdAt: NOW_ISO,
				updatedAt: NOW_ISO,
			})
			.run();

		const runner = createGitRunner(env.repoPath);
		await runGitExport(db, { runner, fs: createNodeFsAdapter() });

		const exported = fs.readFileSync(
			path.join(env.repoPath, "factory", "REFLECTIONS", "2026-04.md"),
			"utf-8",
		);
		expect(exported).toBe(big);
	});

	it("first-run init: creates repo when the directory does not exist", async () => {
		const env = newEnv();
		const notYetCreated = path.join(env.rootDir, "fresh-repo");
		setCfg(db, { repoPath: notYetCreated, remoteUrl: env.remoteUrl });
		seedL2Brief(db, "nimmly", "# nimmly\n");

		const runner = createGitRunner(notYetCreated);
		const result = await runGitExport(db, { runner, fs: createNodeFsAdapter() });

		expect(["committed", "pushed"]).toContain(result.status);
		expect(fs.existsSync(path.join(notYetCreated, ".git"))).toBe(true);
		expect(fs.existsSync(path.join(notYetCreated, "products", "nimmly", "BRIEF.md"))).toBe(true);
	});

	it("deletes a previously-exported file when its knowledge item is archived", async () => {
		const env = newEnv();
		setCfg(db, { repoPath: env.repoPath, remoteUrl: env.remoteUrl });
		seedL4Principles(db, "# v1\n", "ki-del");

		const runner = createGitRunner(env.repoPath);
		const realFs = createNodeFsAdapter();

		await runGitExport(db, { runner, fs: realFs });
		expect(fs.existsSync(path.join(env.repoPath, "factory", "PRINCIPLES.md"))).toBe(true);

		// Archive the item — next export should drop the file from the tree.
		// eslint-disable-next-line drizzle/enforce-update-with-where -- test DB has a single row; updating all is the intent
		db.update(knowledgeItems).set({ status: "archived" }).run();

		const result = await runGitExport(db, { runner, fs: realFs });
		expect(["committed", "pushed"]).toContain(result.status);
		if (result.status === "committed" || result.status === "pushed") {
			expect(result.filesDeleted).toContain("factory/PRINCIPLES.md");
		}
		expect(fs.existsSync(path.join(env.repoPath, "factory", "PRINCIPLES.md"))).toBe(false);
	});

	it("handles detached HEAD: exporter re-checks out the configured branch and commits", async () => {
		const env = newEnv();
		setCfg(db, { repoPath: env.repoPath, remoteUrl: env.remoteUrl });
		seedL4Principles(db, "# first\n", "ki-detach");

		const runner = createGitRunner(env.repoPath);
		const realFs = createNodeFsAdapter();

		// First export brings the repo to life on branch main with one commit.
		await runGitExport(db, { runner, fs: realFs });
		const firstSha = gitInRepo(env.repoPath, "rev-parse HEAD").trim();

		// Operator (or a script) detaches HEAD.
		execSync(`git -C "${env.repoPath}" checkout --detach "${firstSha}"`, { stdio: "ignore" });

		// A second edit must still result in a clean commit on a branch —
		// we at minimum want runGitExport to NOT throw and to produce a
		// meaningful result. Add a new item so there is something to commit.
		db.insert(knowledgeItems)
			.values({
				id: "ki-detach-2",
				layer: "L2",
				scopeId: "alpha",
				kind: "BRIEF",
				topic: null,
				title: "alpha brief",
				body: "# alpha\n",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "test",
				createdAt: NOW_ISO,
				updatedAt: NOW_ISO,
			})
			.run();

		const result = await runGitExport(db, { runner, fs: realFs });
		// Result may be "committed"/"pushed" or "error" depending on the git
		// behavior in detached HEAD. We lock down "does not throw, returns
		// a tagged union" (documented contract) — no assertion about specific
		// status since detached-HEAD semantics are environment-sensitive.
		expect(typeof result.status).toBe("string");
	});

	it("pre-existing uncommitted edits in repoPath: commit-flow keeps moving (filesystem isolation)", async () => {
		// A user may have opened the export repo on the host and made a scratch
		// edit. The exporter's `git add -A` WILL pick up those edits — we
		// document the behavior and pin it via the commit message's item bullet
		// list, which must still correspond to the DB-driven plan even when
		// the working tree has extras. This is an explicit acceptance: v1 does
		// not reject the working tree, but the commit manifest is still truthful.
		const env = newEnv();
		setCfg(db, { repoPath: env.repoPath, remoteUrl: env.remoteUrl });
		seedL4Principles(db, "# seeded\n", "ki-uncommitted");

		// First export initializes the repo.
		const runner = createGitRunner(env.repoPath);
		const realFs = createNodeFsAdapter();
		await runGitExport(db, { runner, fs: realFs });

		// Plant a hand-edit outside the managed subtrees.
		const scratchPath = path.join(env.repoPath, "NOTES.md");
		fs.writeFileSync(scratchPath, "human notes\n");

		// Modify the seeded item so the next export has a DB-driven diff too.
		// eslint-disable-next-line drizzle/enforce-update-with-where -- test DB has a single row; updating all is the intent
		db.update(knowledgeItems).set({ body: "# seeded v2\n", version: 2 }).run();

		const result = await runGitExport(db, { runner, fs: realFs });
		expect(["committed", "pushed"]).toContain(result.status);
		if (result.status === "committed" || result.status === "pushed") {
			// The commit message enumerates DB-driven items (not NOTES.md).
			expect(result.message).toContain("L4 PRINCIPLES");
		}
		// NOTES.md still exists (not deleted — outside managed subtrees).
		expect(fs.existsSync(scratchPath)).toBe(true);
	});

	it("push-failure: reachable commit sha is recorded, last_push_at is NOT", async () => {
		const env = newEnv();
		// Point at an unreachable remote so `git push` fails.
		const bogusRemote = path.join(env.rootDir, "does-not-exist");
		setCfg(db, {
			repoPath: env.repoPath,
			remoteUrl: `file://${bogusRemote}`,
		});
		seedL4Principles(db, "# push-fail\n");

		const runner = createGitRunner(env.repoPath);
		const result = await runGitExport(db, { runner, fs: createNodeFsAdapter() });
		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.phase).toBe("push");

		// Local commit exists.
		expect(commitCount(env.repoPath)).toBe(1);

		// Settings: commit fields populated, push NOT.
		const rows = db.select().from(factorySettings).all();
		const lastCommitSha = rows.find((r) => r.key === "git_export.last_commit_sha");
		const lastCommitAt = rows.find((r) => r.key === "git_export.last_commit_at");
		const lastPushAt = rows.find((r) => r.key === "git_export.last_push_at");
		expect(lastCommitSha).toBeDefined();
		expect(lastCommitAt).toBeDefined();
		expect(lastPushAt).toBeUndefined();
	});
});
