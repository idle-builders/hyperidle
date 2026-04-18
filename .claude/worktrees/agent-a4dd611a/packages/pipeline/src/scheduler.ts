import { createLogger } from "@hyperidle/shared";
import { filterStories, loadManifest, validateDependencies } from "./manifest.js";
import { initProgress, loadProgress, updateStory } from "./progress.js";
import { runStory } from "./runner.js";
import { appendOutput, initStream, setStories, updateFeedStatus } from "./store.js";
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

			// Only send stories that aren't done — don't make the agent re-check completed work
			const pendingIds = stream.storyIds.filter((id) => !done.has(id));
			const prompt = pendingIds.join(" ");
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
	appendOutput(
		"_summary",
		`Pipeline complete: ${doneCount}/${stories.length} done, ${blockedCount} blocked`,
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

	// Initialize the stream feed (one feed per agent/stream, not per story)
	const pendingStoryIds = stream.storyIds.filter((id) => !done.has(id));
	initStream(stream.name, pendingStoryIds);

	appendOutput(stream.name, `${streamLabel}: starting ${pendingStoryIds.length} stories`);

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

	const MAX_REAL_ATTEMPTS = 3;
	const MAX_CRASH_RETRIES = 5;
	let realAttempts = 0;
	let crashRetries = 0;

	while (realAttempts < MAX_REAL_ATTEMPTS && crashRetries < MAX_CRASH_RETRIES) {
		// Snapshot story statuses before the agent runs
		const statusBefore = new Map(
			stream.storyIds.map((id) => {
				const s = state.stories.find((st) => st.id === id);
				return [id, s?.status ?? "pending"] as const;
			}),
		);

		await runStory({
			streamName: stream.name,
			storyId: prompt,
			cwd,
			interactive,
			onOutput: (text) => {
				appendOutput(stream.name, text);
			},
		});

		// Read the progress file the AGENT wrote — only the agent decides "done"
		const postProgress = loadProgress();
		const agentDone = new Set(
			postProgress?.stories.filter((s) => s.status === "done").map((s) => s.id) ?? [],
		);

		// Sync: if the agent marked stories as done, update our in-memory state
		for (const id of stream.storyIds) {
			if (!done.has(id) && agentDone.has(id)) {
				const agentStory = postProgress?.stories.find((s) => s.id === id);
				if (agentStory) {
					const existing = state.stories.find((s) => s.id === id);
					if (existing) Object.assign(existing, agentStory);
				}
				done.add(id);
			}
		}
		// Update stream feed status based on story progress
		setStories(state.stories);

		// Check if all stories in this stream are done
		const allDone = stream.storyIds.every((id) => done.has(id));
		if (allDone) {
			updateFeedStatus(stream.name, "done");
			appendOutput(stream.name, `${streamLabel}: all done!`);
			break;
		}

		// Determine if the agent actually made progress (any status changed)
		const madeProgress = stream.storyIds.some((id) => {
			const before = statusBefore.get(id);
			const after = postProgress?.stories.find((s) => s.id === id)?.status;
			return after !== undefined && after !== before;
		});

		if (madeProgress) {
			realAttempts++;
		} else {
			crashRetries++;
			log.warn(
				`${streamLabel}: session ended without progress (crash retry ${crashRetries}/${MAX_CRASH_RETRIES})`,
			);
		}

		const remaining = stream.storyIds.filter((id) => !done.has(id));

		if (realAttempts >= MAX_REAL_ATTEMPTS) {
			// Real attempts exhausted — mark remaining as blocked
			for (const id of remaining) {
				updateStory(state, id, {
					status: "blocked",
					error: `Agent failed to complete after ${realAttempts} real attempts`,
					blockedReason: `Story not completed after ${realAttempts} attempts where the agent made progress`,
					needsHuman: true,
				});
			}
			updateFeedStatus(stream.name, "blocked");
			appendOutput(
				stream.name,
				`${streamLabel}: blocked after ${realAttempts} real attempts (${crashRetries} crash retries).`,
			);
		} else {
			// Retry — re-mark first incomplete story as in_progress
			appendOutput(
				stream.name,
				`${streamLabel}: retrying. Real attempts: ${realAttempts}/${MAX_REAL_ATTEMPTS}, crash retries: ${crashRetries}/${MAX_CRASH_RETRIES}`,
			);
			for (const id of remaining) {
				updateStory(state, id, { status: "in_progress" });
				setStories(state.stories);
				break;
			}
		}
	}

	setStories(state.stories);
}
