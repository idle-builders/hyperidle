import { createLogger } from "@hyperidle/shared";
import { filterStories, loadManifest, validateDependencies } from "./manifest.js";
import { initProgress, loadProgress, updateStory } from "./progress.js";
import { runStory } from "./runner.js";
import { appendOutput, initFeed, setStories, updateFeedStatus } from "./store.js";
import type { PipelineOptions, Story } from "./types.js";

const log = createLogger({ pkg: "pipeline" });

interface Stream {
	name: string;
	storyIds: string[];
}

/**
 * Group stories into parallel streams. Stories in the same track run
 * sequentially within a stream. Independent tracks run in parallel.
 */
function buildStreams(stories: Story[]): Stream[] {
	const tracks = new Map<string, string[]>();
	for (const s of stories) {
		const list = tracks.get(s.track) ?? [];
		list.push(s.id);
		tracks.set(s.track, list);
	}
	return [...tracks.entries()].map(([track, ids]) => ({
		name: track,
		storyIds: ids,
	}));
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
	setStories(state.stories);

	const fullProgress = loadProgress();
	const done = new Set([
		...state.stories.filter((s) => s.status === "done").map((s) => s.id),
		...(fullProgress?.stories.filter((s) => s.status === "done").map((s) => s.id) ?? []),
	]);

	const streams = buildStreams(stories);

	// Filter out streams where all stories are already done
	const activeStreams = streams.filter((s) => s.storyIds.some((id) => !done.has(id)));

	log.info(
		`${activeStreams.length} streams: ${activeStreams.map((s) => `${s.name}(${s.storyIds.length})`).join(", ")}`,
	);

	// Run streams in parallel up to concurrency limit
	const running = new Map<string, Promise<void>>();
	const queue = [...activeStreams];

	while (queue.length > 0 || running.size > 0) {
		while (running.size < concurrency && queue.length > 0) {
			const stream = queue.shift();
			if (!stream) break;

			const prompt = stream.storyIds.join(" ");
			const job = runStream(stream, prompt, state, options, done);
			running.set(stream.name, job);
			job.then(() => running.delete(stream.name));
		}

		if (running.size > 0) {
			await Promise.race(running.values());
		}
	}

	const targetIds = new Set(stories.map((s) => s.id));
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

/**
 * Run a stream of stories as a single agent session.
 * The agent gets all story IDs and processes them sequentially,
 * creating worktrees internally via the pipeline skill.
 */
async function runStream(
	stream: Stream,
	prompt: string,
	state: ReturnType<typeof initProgress>,
	options: PipelineOptions,
	done: Set<string>,
): Promise<void> {
	const { cwd, interactive } = options;
	const streamLabel = `Stream ${stream.name}`;

	// Initialize feeds for all stories in the stream
	for (const id of stream.storyIds) {
		if (!done.has(id)) initFeed(id);
	}

	appendOutput(
		stream.storyIds[0] ?? stream.name,
		`${streamLabel}: starting ${stream.storyIds.length} stories`,
	);

	// Mark first pending story as in_progress
	for (const id of stream.storyIds) {
		if (!done.has(id)) {
			updateStory(state, id, {
				status: "in_progress",
				startedAt: new Date().toISOString(),
			});
			setStories(state.stories);
			break;
		}
	}

	const result = await runStory({
		storyId: prompt,
		cwd,
		interactive,
		onOutput: (text) => {
			// Route output to the appropriate story feed
			// Try to detect which story is active from the output
			const activeStory = stream.storyIds.find(
				(id) => state.stories.find((s) => s.id === id)?.status === "in_progress",
			);
			if (activeStory) appendOutput(activeStory, text);
		},
	});

	// On completion, mark all stories based on result
	if (result.success) {
		for (const id of stream.storyIds) {
			if (!done.has(id)) {
				updateStory(state, id, {
					status: "done",
					completedAt: new Date().toISOString(),
					cost: result.cost / stream.storyIds.length,
				});
				updateFeedStatus(id, "done", result.cost / stream.storyIds.length);
				done.add(id);
			}
		}
		appendOutput(
			stream.storyIds[0] ?? stream.name,
			`${streamLabel}: all done! Cost: $${result.cost.toFixed(4)}`,
		);
	} else {
		// Find which story failed (last in_progress one)
		const failedId = stream.storyIds.find(
			(id) => state.stories.find((s) => s.id === id)?.status === "in_progress",
		);
		if (failedId) {
			updateStory(state, failedId, {
				status: "blocked",
				error: result.error,
				blockedReason: result.error,
				needsHuman: true,
			});
			updateFeedStatus(failedId, "blocked");
			appendOutput(failedId, `Failed: ${result.error}`);
		}
	}

	setStories(state.stories);
}
