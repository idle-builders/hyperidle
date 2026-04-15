import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const WORKTREE_DIR = ".worktrees";

export function createWorktree(storyId: string, branchName: string, cwd: string): string {
	const worktreePath = resolve(cwd, WORKTREE_DIR, storyId);

	if (existsSync(worktreePath)) {
		removeWorktree(storyId, cwd);
	}

	// Create worktree with new branch from main
	exec(`git worktree add "${worktreePath}" -b "${branchName}" main`, cwd);

	// Install dependencies in worktree
	exec("bun install --frozen-lockfile", worktreePath);

	return worktreePath;
}

export function removeWorktree(storyId: string, cwd: string): void {
	const worktreePath = resolve(cwd, WORKTREE_DIR, storyId);

	if (!existsSync(worktreePath)) return;

	// Remove worktree
	try {
		exec(`git worktree remove "${worktreePath}" --force`, cwd);
	} catch {
		// Worktree may already be gone
	}

	// Delete branch if it exists and was merged
	const branchName = getBranchForWorktree(worktreePath, cwd);
	if (branchName) {
		try {
			exec(`git branch -d "${branchName}"`, cwd);
		} catch {
			// Branch may not exist or not be merged
		}
	}
}

export function cleanOrphanedWorktrees(cwd: string): void {
	try {
		exec("git worktree prune", cwd);
	} catch {
		// Ignore errors
	}

	const dir = resolve(cwd, WORKTREE_DIR);
	if (!existsSync(dir)) return;

	// List remaining worktree directories and remove them
	const { readdirSync } = require("node:fs") as typeof import("node:fs");
	for (const entry of readdirSync(dir)) {
		const path = resolve(dir, entry);
		try {
			exec(`git worktree remove "${path}" --force`, cwd);
		} catch {
			// Already cleaned
		}
	}
}

export function mergeWorktree(storyId: string, branchName: string, cwd: string): void {
	// Switch to main and squash merge
	exec("git checkout main", cwd);
	exec(`git merge --squash "${branchName}"`, cwd);
	exec(`git commit -m "feat(${storyId}): merge from pipeline"`, cwd);

	// Clean up
	removeWorktree(storyId, cwd);
}

function getBranchForWorktree(worktreePath: string, cwd: string): string | null {
	try {
		const output = exec("git worktree list --porcelain", cwd);
		const lines = output.split("\n");
		for (let i = 0; i < lines.length; i++) {
			if (lines[i]?.startsWith(`worktree ${worktreePath}`)) {
				const branchLine = lines[i + 2];
				if (branchLine?.startsWith("branch refs/heads/")) {
					return branchLine.replace("branch refs/heads/", "");
				}
			}
		}
	} catch {
		// Ignore
	}
	return null;
}

function exec(cmd: string, cwd: string): string {
	return execSync(cmd, { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
}
