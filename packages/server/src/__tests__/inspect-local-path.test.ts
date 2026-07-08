/**
 * AV1 — inspectLocalPath unit tests
 *
 * AC3: Folder registered as filesystem with detected branch.
 * Tests use createFakeGitRunner for injection (no real git).
 */

import type { GitRunner } from "@hyperidle/fabric";
import { describe, expect, it } from "vitest";
import { inspectLocalPath } from "../services/inspect-local-path.js";

function makeFakeRunner(isInsideWorkTree: boolean, branch: string | null): GitRunner {
	return {
		async init() {},
		async add() {},
		async rm() {},
		async commit() {
			return "sha";
		},
		async push() {},
		async diffCached() {
			return true;
		},
		async revParseIsInsideWorkTree() {
			return isInsideWorkTree;
		},
		async configSet() {},
		async remoteAdd() {},
		async lsFiles() {
			return [];
		},
		async statusPorcelain() {
			return [];
		},
		async lsRemote() {
			return { reachable: true };
		},
		async clone() {},
		async bundle() {},
		async worktreeAdd() {},
		async worktreeRemove() {},
		async fetch() {},
		async checkout() {},
		async restoreStaged() {},
		async currentBranch() {
			return branch;
		},
	};
}

describe("inspectLocalPath", () => {
	it("returns {exists:false, isGitRepo:false, branch:null} for non-existent path", async () => {
		const result = await inspectLocalPath("/no/such/path/xyz123", {
			gitRunnerFactory: () => makeFakeRunner(false, null),
		});
		expect(result.exists).toBe(false);
		expect(result.isGitRepo).toBe(false);
		expect(result.branch).toBeNull();
	});

	it("returns isGitRepo:true and branch when runner reports inside work tree with a branch", async () => {
		// Use the temp dir which definitely exists
		const result = await inspectLocalPath("/tmp", {
			gitRunnerFactory: () => makeFakeRunner(true, "main"),
		});
		expect(result.exists).toBe(true);
		expect(result.isGitRepo).toBe(true);
		expect(result.branch).toBe("main");
	});

	it("returns isGitRepo:false for non-git dir", async () => {
		const result = await inspectLocalPath("/tmp", {
			gitRunnerFactory: () => makeFakeRunner(false, null),
		});
		expect(result.exists).toBe(true);
		expect(result.isGitRepo).toBe(false);
		expect(result.branch).toBeNull();
	});

	it("returns branch:null when runner reports no resolvable branch (empty repo / detached HEAD)", async () => {
		const result = await inspectLocalPath("/tmp", {
			gitRunnerFactory: () => makeFakeRunner(true, null),
		});
		expect(result.exists).toBe(true);
		expect(result.isGitRepo).toBe(true);
		expect(result.branch).toBeNull();
	});

	it("never throws — returns safe defaults on git runner error", async () => {
		// Path exists (/tmp) but runner throws → catch returns exists:true, isGitRepo:false
		const result = await inspectLocalPath("/tmp", {
			gitRunnerFactory: () => {
				throw new Error("Runner factory error");
			},
		});
		// exists:true because stat(path) succeeded; isGitRepo:false because runner threw
		expect(result.exists).toBe(true);
		expect(result.isGitRepo).toBe(false);
		expect(result.branch).toBeNull();
	});
});
