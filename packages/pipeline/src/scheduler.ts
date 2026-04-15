import { createLogger } from "@hyperidle/shared";
import { filterStories, getReadyStories, loadManifest, validateDependencies } from "./manifest.js";
import { initProgress, loadProgress, updateStory } from "./progress.js";
import { runStory } from "./runner.js";
import { appendOutput, initFeed, setStories, updateFeedStatus } from "./store.js";
import type { PipelineOptions, PipelineState, Story } from "./types.js";
import {
	cleanOrphanedWorktrees,
	createWorktree,
	mergeWorktree,
	removeWorktree,
} from "./worktree.js";

const log = createLogger({ pkg: "pipeline" });
const MAX_ATTEMPTS = 3;

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

	const state = initProgress(target, stories);
	cleanOrphanedWorktrees(cwd);

	// Publish stories to the UI store
	setStories(state.stories);

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
		const ready = getReadyStories(stories, done, inProgress, blocked);

		if (activeJobs.size === 0 && ready.length === 0) break;

		while (activeJobs.size < concurrency && ready.length > 0) {
			const story = ready.shift();
			if (!story) break;
			inProgress.add(story.id);

			const job = processStory(story, state, options, done, inProgress, blocked);
			activeJobs.set(story.id, job);
			job.then(() => activeJobs.delete(story.id));
		}

		if (activeJobs.size > 0) {
			await Promise.race(activeJobs.values());
		}
	}

	const doneCount = state.stories.filter((s) => s.status === "done" && targetIds.has(s.id)).length;
	const blockedCount = state.stories.filter(
		(s) => (s.status === "blocked" || s.status === "failed") && targetIds.has(s.id),
	).length;
	const totalCost = state.stories.reduce((sum, s) => sum + s.cost, 0);

	appendOutput(
		"_summary",
		`Pipeline complete: ${doneCount}/${stories.length} done, ${blockedCount} blocked, $${totalCost.toFixed(4)}`,
	);
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

	initFeed(story.id);
	appendOutput(story.id, `Starting: ${story.title}`);
	updateStory(state, story.id, {
		status: "in_progress",
		startedAt: new Date().toISOString(),
	});
	setStories(state.stories);

	let worktreePath: string | null = null;

	try {
		appendOutput(story.id, "Creating worktree...");
		worktreePath = createWorktree(story.id, branchName, cwd);
		updateStory(state, story.id, { worktree: worktreePath, branch: branchName });
		appendOutput(story.id, "Worktree ready. Running agent...");

		const result = await runStory({
			storyId: story.id,
			cwd: worktreePath,
			interactive,
		});

		updateStory(state, story.id, {
			sessionId: result.sessionId,
			cost: result.cost,
			attempts: (state.stories.find((s) => s.id === story.id)?.attempts ?? 0) + 1,
		});

		if (result.success) {
			await withMergeLock(async () => {
				appendOutput(story.id, "Merging to main...");
				mergeWorktree(story.id, branchName, cwd);
			});

			updateStory(state, story.id, {
				status: "done",
				completedAt: new Date().toISOString(),
			});
			updateFeedStatus(story.id, "done", result.cost);
			done.add(story.id);
			appendOutput(story.id, `Done! Cost: $${result.cost.toFixed(4)}`);
		} else {
			appendOutput(story.id, `Failed: ${result.error}`);
			handleFailure(story, state, result.error, blocked, cwd, worktreePath);
		}
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		appendOutput(story.id, `Error: ${errorMsg}`);
		handleFailure(story, state, errorMsg, blocked, cwd, worktreePath);
	} finally {
		inProgress.delete(story.id);
		setStories(state.stories);
	}
}

function handleFailure(
	story: Story,
	state: PipelineState,
	error: string | null,
	blocked: Set<string>,
	cwd: string,
	worktreePath: string | null,
): void {
	const storyProgress = state.stories.find((s) => s.id === story.id);
	const attempts = (storyProgress?.attempts ?? 0) + 1;

	// Clean up worktree on failure
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
		updateFeedStatus(story.id, "blocked");
		blocked.add(story.id);
	} else {
		updateStory(state, story.id, {
			status: "pending",
			attempts,
			error,
		});
		updateFeedStatus(story.id, "pending");
	}
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40);
}
