import { createLogger } from "@hyperidle/shared";
import { filterStories, getReadyStories, loadManifest, validateDependencies } from "./manifest.js";
import { initProgress, loadProgress, updateStory } from "./progress.js";
import { runStory } from "./runner.js";
import type { PipelineOptions, PipelineState, Story } from "./types.js";
import {
	cleanOrphanedWorktrees,
	createWorktree,
	mergeWorktree,
	removeWorktree,
} from "./worktree.js";

const log = createLogger({ pkg: "pipeline" });
const MAX_ATTEMPTS = 3;

// Mutex for serializing merges to main
let merging = false;
async function withMergeLock<T>(fn: () => Promise<T>): Promise<T> {
	while (merging) {
		await new Promise((r) => setTimeout(r, 500));
	}
	merging = true;
	try {
		return await fn();
	} finally {
		merging = false;
	}
}

export async function runPipeline(options: PipelineOptions): Promise<void> {
	const { target, concurrency, cwd } = options;
	const manifestPath = `${cwd}/docs/pipeline-manifest.yaml`;

	// Load and validate manifest
	const allStories = loadManifest(manifestPath);
	const stories = filterStories(allStories, target);

	if (stories.length === 0) {
		log.error(`No stories found for target: ${target}`);
		return;
	}

	const errors = validateDependencies(allStories);
	if (errors.length > 0) {
		log.error("Dependency errors in manifest:");
		for (const e of errors) log.error(`  ${e}`);
		return;
	}

	// Initialize progress (merges with existing)
	const state = initProgress(target, stories);

	// Clean up orphaned worktrees from previous crashed sessions
	cleanOrphanedWorktrees(cwd);

	log.info(`Pipeline starting: ${stories.length} stories, concurrency=${concurrency}`);

	// Include done stories from the full progress file (dependencies outside target)
	const fullProgress = loadProgress();
	const done = new Set([
		...state.stories.filter((s) => s.status === "done").map((s) => s.id),
		...(fullProgress?.stories.filter((s) => s.status === "done").map((s) => s.id) ?? []),
	]);
	const inProgress = new Set<string>();
	const blocked = new Set(
		state.stories.filter((s) => s.status === "blocked" || s.status === "failed").map((s) => s.id),
	);

	const targetIds = new Set(stories.map((s) => s.id));
	const activeJobs = new Map<string, Promise<void>>();

	while (true) {
		// Get stories ready to run (deps met, not done/blocked/in-progress)
		const ready = getReadyStories(stories, done, inProgress, blocked);

		// If nothing is running and nothing is ready, we're done
		if (activeJobs.size === 0 && ready.length === 0) {
			break;
		}

		// Launch stories up to concurrency limit
		while (activeJobs.size < concurrency && ready.length > 0) {
			const story = ready.shift();
			if (!story) break;
			inProgress.add(story.id);

			const job = processStory(story, state, options, done, inProgress, blocked);
			activeJobs.set(story.id, job);

			// When job finishes, remove from active
			job.then(() => activeJobs.delete(story.id));
		}

		// Wait for at least one job to finish
		if (activeJobs.size > 0) {
			await Promise.race(activeJobs.values());
		}
	}

	// Final summary
	const doneCount = state.stories.filter((s) => s.status === "done" && targetIds.has(s.id)).length;
	const blockedCount = state.stories.filter(
		(s) => (s.status === "blocked" || s.status === "failed") && targetIds.has(s.id),
	).length;
	const totalCost = state.stories.reduce((sum, s) => sum + s.cost, 0);

	log.info("═══════════════════════════════════════");
	log.info(`Pipeline complete: ${doneCount}/${stories.length} done, ${blockedCount} blocked`);
	log.info(`Total cost: $${totalCost.toFixed(4)}`);

	if (blockedCount > 0) {
		const blockedStories = state.stories.filter(
			(s) => (s.status === "blocked" || s.status === "failed") && targetIds.has(s.id),
		);
		log.warn("BLOCKED STORIES:");
		for (const s of blockedStories) {
			log.warn(`  ${s.id}: ${s.blockedReason ?? s.error ?? "unknown"}`);
			if (s.needsHuman) {
				log.warn("    NEEDS HUMAN INPUT");
			}
		}
	}
	log.info("═══════════════════════════════════════");
}

async function processStory(
	story: Story,
	state: PipelineState,
	options: PipelineOptions,
	done: Set<string>,
	inProgress: Set<string>,
	blocked: Set<string>,
): Promise<void> {
	const { cwd, interactive } = options;
	const branchName = `feat/${story.id.toLowerCase()}-${slugify(story.title)}`;

	log.info(`[${story.id}] Starting: ${story.title}`);
	updateStory(state, story.id, {
		status: "in_progress",
		startedAt: new Date().toISOString(),
	});

	let worktreePath: string | null = null;

	try {
		// Create worktree
		worktreePath = createWorktree(story.id, branchName, cwd);
		updateStory(state, story.id, { worktree: worktreePath, branch: branchName });
		log.info(`[${story.id}] Worktree ready at ${worktreePath}`);

		// Run the agent
		const result = await runStory({
			storyId: story.id,
			cwd: worktreePath,
			interactive,
			onOutput: (id, text) => {
				// Stream output with prefix
				for (const line of text.split("\n")) {
					if (line.trim()) {
						process.stdout.write(`[${id}] ${line}\n`);
					}
				}
			},
		});

		updateStory(state, story.id, {
			sessionId: result.sessionId,
			cost: result.cost,
			attempts: (state.stories.find((s) => s.id === story.id)?.attempts ?? 0) + 1,
		});

		if (result.success) {
			// Merge back to main (serialized)
			await withMergeLock(async () => {
				log.info(`[${story.id}] Merging to main...`);
				mergeWorktree(story.id, branchName, cwd);
			});

			updateStory(state, story.id, {
				status: "done",
				completedAt: new Date().toISOString(),
			});
			done.add(story.id);
			log.info(`[${story.id}] ✓ Done ($${result.cost.toFixed(4)})`);
		} else {
			handleFailure(story, state, result.error, done, inProgress, blocked, cwd, worktreePath);
		}
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		handleFailure(story, state, errorMsg, done, inProgress, blocked, cwd, worktreePath);
	} finally {
		inProgress.delete(story.id);
	}
}

function handleFailure(
	story: Story,
	state: PipelineState,
	error: string | null,
	_done: Set<string>,
	_inProgress: Set<string>,
	blocked: Set<string>,
	cwd: string,
	worktreePath: string | null,
): void {
	const storyProgress = state.stories.find((s) => s.id === story.id);
	const attempts = (storyProgress?.attempts ?? 0) + 1;

	if (worktreePath) {
		try {
			removeWorktree(story.id, cwd);
		} catch {
			// Ignore cleanup errors
		}
	}

	if (attempts >= MAX_ATTEMPTS) {
		updateStory(state, story.id, {
			status: "blocked",
			attempts,
			error,
			blockedReason: `Failed after ${attempts} attempts: ${error}`,
			needsHuman: true,
		});
		blocked.add(story.id);
		log.error(`[${story.id}] ✗ Blocked after ${attempts} attempts: ${error}`);
	} else {
		updateStory(state, story.id, {
			status: "pending",
			attempts,
			error,
		});
		log.warn(`[${story.id}] ✗ Attempt ${attempts} failed, will retry: ${error}`);
	}
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40);
}
