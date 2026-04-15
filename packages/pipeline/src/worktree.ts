import { execSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const WORKTREE_DIR = ".worktrees";

export function createWorktree(storyId: string, branchName: string, cwd: string): string {
	const worktreePath = resolve(cwd, WORKTREE_DIR, storyId);

	// Clean up any previous worktree/branch for this story
	if (existsSync(worktreePath)) {
		try {
			exec(`git worktree remove "${worktreePath}" --force`, cwd);
		} catch {
			rmSync(worktreePath, { recursive: true, force: true });
		}
	}

	// Delete branch if it exists from a previous run
	try {
		exec(`git branch -D "${branchName}"`, cwd);
	} catch {
		// Branch doesn't exist — fine
	}

	// Prune stale worktree references
	try {
		exec("git worktree prune", cwd);
	} catch {
		// Ignore
	}

	// Create worktree with new branch from main
	exec(`git worktree add "${worktreePath}" -b "${branchName}" main`, cwd);

	// Install dependencies in worktree
	exec("bun install --frozen-lockfile", worktreePath);

	return worktreePath;
}

export function removeWorktree(storyId: string, cwd: string): void {
	const worktreePath = resolve(cwd, WORKTREE_DIR, storyId);

	if (existsSync(worktreePath)) {
		try {
			exec(`git worktree remove "${worktreePath}" --force`, cwd);
		} catch {
			rmSync(worktreePath, { recursive: true, force: true });
		}
	}

	exec("git worktree prune", cwd);
}

export function cleanOrphanedWorktrees(cwd: string): void {
	try {
		exec("git worktree prune", cwd);
	} catch {
		// Ignore
	}

	const dir = resolve(cwd, WORKTREE_DIR);
	if (!existsSync(dir)) return;

	for (const entry of readdirSync(dir)) {
		const path = resolve(dir, entry);
		try {
			exec(`git worktree remove "${path}" --force`, cwd);
		} catch {
			rmSync(path, { recursive: true, force: true });
		}
	}
}

export function mergeWorktree(storyId: string, branchName: string, cwd: string): void {
	exec("git checkout main", cwd);
	exec(`git merge --squash "${branchName}"`, cwd);
	exec(`git commit -m "feat(${storyId}): merge from pipeline"`, cwd);
	removeWorktree(storyId, cwd);

	// Delete the branch after merge
	try {
		exec(`git branch -D "${branchName}"`, cwd);
	} catch {
		// Already deleted
	}
}

function exec(cmd: string, cwd: string): string {
	return execSync(cmd, { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
}
