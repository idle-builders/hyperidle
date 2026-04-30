import { describe, expect, it } from "vitest";
import { buildGroups, MAX_BATCHED_GROUP_SIZE } from "../scheduler.js";
import type { Story } from "../types.js";

function s(
	id: string,
	complexity: "S" | "M" | "L",
	track = id[0] ?? "X",
	deps: string[] = [],
): Story {
	return { id, title: id, track, complexity, dependencies: deps };
}

describe("buildGroups", () => {
	it("M stories each get their own solo group", () => {
		const groups = buildGroups([s("A1", "M"), s("A2", "M"), s("B1", "M")]);
		expect(groups.map((g) => ({ ids: g.storyIds, lane: g.lane }))).toEqual([
			{ ids: ["A1"], lane: "solo" },
			{ ids: ["A2"], lane: "solo" },
			{ ids: ["B1"], lane: "solo" },
		]);
	});

	it("L stories also get their own solo group (M and L share the solo lane)", () => {
		const groups = buildGroups([s("A1", "L")]);
		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({ storyIds: ["A1"], lane: "solo" });
	});

	it("S stories from the same track batch together", () => {
		const groups = buildGroups([s("A1", "S"), s("A2", "S"), s("A3", "S")]);
		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({
			storyIds: ["A1", "A2", "A3"],
			lane: "batched",
			track: "A",
		});
	});

	it("S stories from different tracks do NOT batch together", () => {
		const groups = buildGroups([s("A1", "S"), s("B1", "S"), s("A2", "S")]);
		const batched = groups.filter((g) => g.lane === "batched");
		expect(batched).toHaveLength(2);
		expect(batched.find((g) => g.track === "A")?.storyIds).toEqual(["A1", "A2"]);
		expect(batched.find((g) => g.track === "B")?.storyIds).toEqual(["B1"]);
	});

	it(`a batched group is capped at ${MAX_BATCHED_GROUP_SIZE} stories`, () => {
		const stories: Story[] = [];
		for (let i = 1; i <= MAX_BATCHED_GROUP_SIZE + 2; i++) stories.push(s(`A${i}`, "S"));
		const groups = buildGroups(stories);
		const batched = groups.filter((g) => g.lane === "batched");
		expect(batched).toHaveLength(2);
		expect(batched[0]?.storyIds).toHaveLength(MAX_BATCHED_GROUP_SIZE);
		expect(batched[1]?.storyIds).toHaveLength(2);
	});

	it("a batched group never contains stories with intra-group dependencies", () => {
		// A2 depends on A1; both are S in the same track. They MUST end up in
		// separate groups so the agent doesn't have to enforce ordering.
		const groups = buildGroups([s("A1", "S"), s("A2", "S", "A", ["A1"])]);
		const batched = groups.filter((g) => g.lane === "batched");
		expect(batched).toHaveLength(2);
		const idsPerGroup = batched.map((g) => g.storyIds);
		expect(idsPerGroup).toContainEqual(["A1"]);
		expect(idsPerGroup).toContainEqual(["A2"]);
	});

	it("group names are unique and descriptive", () => {
		const groups = buildGroups([
			s("A1", "M"),
			s("B1", "S"),
			s("B2", "S"),
			s("B3", "S"),
			s("B4", "S"),
			s("B5", "S"),
		]);
		const names = groups.map((g) => g.name);
		expect(new Set(names).size).toBe(names.length);
		// Solo groups named after the story id
		expect(names).toContain("A1");
		// Batched groups named after the track + index
		expect(names.filter((n) => n.startsWith("B:"))).toHaveLength(2);
	});

	it("returns an empty array for empty input", () => {
		expect(buildGroups([])).toEqual([]);
	});
});
