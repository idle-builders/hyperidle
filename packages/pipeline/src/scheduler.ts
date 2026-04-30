import { createLogger } from "@hyperidle/shared";
import {
	filterStories,
	loadManifest,
	MANIFEST_RELATIVE_PATH,
	validateDependencies,
} from "./manifest.js";
import {
	initProgress,
	loadAllProgress,
	loadProgress,
	loadStoryProgress,
	updateStory,
} from "./progress.js";
import { runStory } from "./runner.js";
import { appendOutput, initGroup, setStories, updateFeedStatus } from "./store.js";
import type { PipelineOptions, Story } from "./types.js";

const log = createLogger({ pkg: "pipeline" });

// @lore Cap the size of a batched-S group at 4 stories. The agreed upper
// bound is also "or 2h estimated work, whichever first," but we don't track
// time estimates per story today — by the S-definition (≤30min) four stories
// sums to ~2h naturally, so the count cap is the operative limit.
export const MAX_BATCHED_GROUP_SIZE = 4;
export const MAX_ATTEMPTS_PER_STORY = 3;

export type GroupLane = "solo" | "batched";

export interface Group {
	name: string;
	storyIds: string[];
	track: string;
	lane: GroupLane;
}

/**
 * Pure: split a list of ready stories into groups for dispatch.
 *
 * - M and L stories → one solo group each.
 * - S stories from the same track batch into groups of up to
 *   MAX_BATCHED_GROUP_SIZE, but never with an intra-group dependency
 *   (those split into separate groups so the agent doesn't have to enforce
 *   ordering).
 *
 * Cross-track grouping is forbidden: an S group always shares a single
 * track so the agent's warm context is on one area of the codebase.
 */
export function buildGroups(ready: readonly Story[]): Group[] {
	const groups: Group[] = [];

	// Solo lane: one group per non-S story
	for (const story of ready) {
		if (story.complexity !== "S") {
			groups.push({
				name: story.id,
				storyIds: [story.id],
				track: story.track,
				lane: "solo",
			});
		}
	}

	// Batched lane: S stories grouped by track, bin-packed up to size cap,
	// no intra-group deps.
	const sByTrack = new Map<string, Story[]>();
	for (const story of ready) {
		if (story.complexity !== "S") continue;
		const list = sByTrack.get(story.track) ?? [];
		list.push(story);
		sByTrack.set(story.track, list);
	}

	for (const [track, stories] of sByTrack) {
		let batchIndex = 1;
		const remaining = [...stories];
		while (remaining.length > 0) {
			const batch: Story[] = [];
			const batchIds = new Set<string>();
			for (let i = 0; i < remaining.length; i++) {
				if (batch.length >= MAX_BATCHED_GROUP_SIZE) break;
				const candidate = remaining[i];
				if (!candidate) continue;
				const hasIntraDep = candidate.dependencies.some((d) => batchIds.has(d));
				if (hasIntraDep) continue;
				const intraDependent = remaining.some(
					(other) =>
						other !== candidate &&
						batchIds.has(other.id) &&
						other.dependencies.includes(candidate.id),
				);
				if (intraDependent) continue;
				batch.push(candidate);
				batchIds.add(candidate.id);
			}
			for (const taken of batch) {
				const idx = remaining.indexOf(taken);
				if (idx >= 0) remaining.splice(idx, 1);
			}
			groups.push({
				name: `${track}:S${batchIndex}`,
				storyIds: batch.map((b) => b.id),
				track,
				lane: "batched",
			});
			batchIndex++;
		}
	}

	return groups;
}

interface SchedulerSnapshot {
	done: Set<string>;
	blocked: Set<string>;
	inProgress: Set<string>;
	pending: Set<string>;
	attemptsById: Map<string, number>;
}

function snapshot(stories: readonly Story[]): SchedulerSnapshot {
	const progressById = new Map(loadAllProgress().map((p) => [p.id, p]));
	const done = new Set<string>();
	const blocked = new Set<string>();
	const inProgress = new Set<string>();
	const pending = new Set<string>();
	const attemptsById = new Map<string, number>();
	for (const story of stories) {
		const p = progressById.get(story.id);
		const status = p?.status ?? "pending";
		attemptsById.set(story.id, p?.attempts ?? 0);
		if (status === "done") done.add(story.id);
		else if (status === "blocked" || status === "failed") blocked.add(story.id);
		else if (status === "in_progress") inProgress.add(story.id);
		else pending.add(story.id);
	}
	return { done, blocked, inProgress, pending, attemptsById };
}

function depsSatisfied(story: Story, done: ReadonlySet<string>): boolean {
	return story.dependencies.every((d) => done.has(d));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: scheduler loop with ready-queue, dispatch, retry caps, and deadlock detection is irreducibly stateful — splitting into helpers would just hide the loop, not simplify it
export async function runPipeline(options: PipelineOptions): Promise<void> {
	const { target, concurrency, cwd } = options;
	const manifestPath = `${cwd}/${MANIFEST_RELATIVE_PATH}`;

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

	const targetById = new Map(stories.map((s) => [s.id, s]));
	const inflight = new Set<string>();
	const running = new Map<string, Promise<void>>();

	while (true) {
		const snap = snapshot(allStories);

		// Finish condition: every target story is done, blocked, or in flight
		const remaining = stories.filter(
			(s) => !(snap.done.has(s.id) || snap.blocked.has(s.id) || inflight.has(s.id)),
		);

		if (remaining.length === 0 && running.size === 0) break;

		// Pick ready stories from `remaining`: deps satisfied, not blocked, in target
		const ready = remaining.filter((s) => depsSatisfied(s, snap.done));

		if (ready.length === 0) {
			if (running.size === 0) {
				// No work to do and nothing in flight — deadlock or partial completion
				log.warn(
					`Pipeline halted: ${remaining.length} stories cannot proceed (deps unmet or blocked)`,
				);
				for (const s of remaining) {
					log.warn(
						`  ${s.id} (deps: [${s.dependencies.join(", ")}], unmet: [${s.dependencies.filter((d) => !snap.done.has(d)).join(", ")}])`,
					);
				}
				break;
			}
			// wait for something to finish, then re-evaluate
			await Promise.race(running.values());
			continue;
		}

		const groups = buildGroups(ready);

		while (running.size < concurrency && groups.length > 0) {
			const group = groups.shift();
			if (!group) break;

			const exhausted = group.storyIds.filter(
				(id) => (snap.attemptsById.get(id) ?? 0) >= MAX_ATTEMPTS_PER_STORY,
			);
			if (exhausted.length > 0) {
				for (const id of exhausted) {
					const story = targetById.get(id);
					if (!story) continue;
					updateStory(state, id, {
						status: "blocked",
						blockedReason: `Exceeded ${MAX_ATTEMPTS_PER_STORY} attempts`,
						needsHuman: true,
					});
				}
				const liveIds = group.storyIds.filter((id) => !exhausted.includes(id));
				if (liveIds.length === 0) continue;
				group.storyIds = liveIds;
			}

			for (const id of group.storyIds) inflight.add(id);
			const job = runGroup(group, state, options).finally(() => {
				running.delete(group.name);
				for (const id of group.storyIds) inflight.delete(id);
			});
			running.set(group.name, job);
		}

		if (running.size === 0) {
			// No groups dispatched this tick (everything exhausted attempts) — exit
			break;
		}

		await Promise.race(running.values());
	}

	// Drain any stragglers
	if (running.size > 0) await Promise.all(running.values());

	const final = snapshot(allStories);
	const doneCount = stories.filter((s) => final.done.has(s.id)).length;
	const blockedCount = stories.filter((s) => final.blocked.has(s.id)).length;
	appendOutput(
		"_summary",
		`Pipeline complete: ${doneCount}/${stories.length} done, ${blockedCount} blocked`,
	);
}

async function runGroup(
	group: Group,
	state: ReturnType<typeof initProgress>,
	options: PipelineOptions,
): Promise<void> {
	const { cwd, interactive } = options;
	const label = group.lane === "batched" ? `Group ${group.name}` : `Story ${group.name}`;

	initGroup(group.name, group.storyIds);
	appendOutput(
		group.name,
		`${label}: starting ${group.storyIds.length} ${group.storyIds.length === 1 ? "story" : "stories"} (${group.lane})`,
	);

	for (const id of group.storyIds) {
		const existing = loadStoryProgress(id);
		const attempts = (existing?.attempts ?? 0) + 1;
		updateStory(state, id, {
			status: "in_progress",
			attempts,
			startedAt: existing?.startedAt ?? new Date().toISOString(),
		});
	}
	setStories(state.stories);

	const prompt = group.storyIds.join(" ");

	await runStory({
		groupName: group.name,
		storyId: prompt,
		cwd,
		interactive,
		onOutput: (text) => appendOutput(group.name, text),
	});

	// Read each story's per-story progress file — the agent owns that write.
	let allDone = true;
	for (const id of group.storyIds) {
		const sp = loadStoryProgress(id);
		if (!sp) continue;
		const liveStory = state.stories.find((s) => s.id === id);
		if (liveStory) Object.assign(liveStory, sp);

		if (sp.status === "done") continue;
		allDone = false;
		// Agent ended without finishing this story. Reset to pending so the
		// next tick can re-dispatch. attempts already counts this attempt; if
		// we hit MAX_ATTEMPTS_PER_STORY the scheduler flips it to blocked
		// before the next dispatch.
		if (sp.status === "in_progress") {
			updateStory(state, id, { status: "pending" });
		}
	}

	setStories(state.stories);
	updateFeedStatus(group.name, allDone ? "done" : "pending");
	appendOutput(
		group.name,
		`${label}: ${allDone ? "all done" : "session ended without completion"}`,
	);
}

export { loadProgress };
