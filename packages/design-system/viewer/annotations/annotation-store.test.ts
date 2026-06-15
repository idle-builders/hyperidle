/**
 * AJ5 — annotation-store.test.ts
 *
 * TDD RED phase — these tests import modules that do not yet exist.
 * Expected failure: Cannot find module './annotation-store.js'
 *
 * AC4: appendAnnotation writes JSON to the open round with assigned id+createdAt;
 *      first write seeds round 1.
 * AC5: startRound closes current round and opens currentRound+1; prior annotations immutable.
 * AC6: renderMarkdown emits one ## Round N — <ts> header per round + a bullet per annotation
 *      with component, element, note.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	appendAnnotation,
	mdPath,
	readState,
	renderMarkdown,
	startRound,
} from "./annotation-store.js";
import type { AnnotationInput, AnnotationState } from "./types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTmpFile(): string {
	const dir = mkdtempSync(join(tmpdir(), "aj5-store-test-"));
	return join(dir, "annotations.json");
}

const FIXED_NOW_1 = "2026-06-15T10:00:00.000Z";
const FIXED_NOW_2 = "2026-06-15T10:01:02.000Z";
const FIXED_NOW_3 = "2026-06-15T10:05:00.000Z";
const FIXED_ID_1 = "id-0001";
const FIXED_ID_2 = "id-0002";

const INPUT_1: AnnotationInput = {
	story: "Button",
	variant: "AllVariants",
	note: "radius too tight on the disabled state",
	target: {
		component: "Button",
		dsComponent: "Button",
		element: 'button.btn--disabled "Save"',
	},
};

const INPUT_2: AnnotationInput = {
	story: "Button",
	variant: "SmallVariants",
	note: "padding feels off",
	target: {
		component: "Button",
		dsComponent: "Button",
		element: "button.btn-sm",
	},
};

let tmpFile: string;

beforeEach(() => {
	tmpFile = makeTmpFile();
});

afterEach(() => {
	// Clean up the temp dir (parent of tmpFile)
	try {
		rmSync(join(tmpFile, ".."), { recursive: true, force: true });
	} catch {
		// best-effort cleanup
	}
});

// ---------------------------------------------------------------------------
// AC4 — appendAnnotation seeds round 1 on first write and assigns id+createdAt
// ---------------------------------------------------------------------------

describe("AC4 — appendAnnotation", () => {
	test("missing file → readState returns empty state with round 1", () => {
		const state = readState(`${tmpFile}.nonexistent`);
		expect(state.currentRound).toBe(1);
		expect(state.rounds).toHaveLength(1);
		expect(state.rounds[0]).toMatchObject({ round: 1, annotations: [] });
	});

	test("first append seeds round 1 and writes the annotation", () => {
		const state = appendAnnotation(tmpFile, INPUT_1, FIXED_NOW_2, FIXED_ID_1);
		expect(state.currentRound).toBe(1);
		expect(state.rounds).toHaveLength(1);

		const round = state.rounds[0];
		expect(round?.round).toBe(1);
		expect(round?.annotations).toHaveLength(1);

		const ann = round?.annotations[0];
		expect(ann?.id).toBe(FIXED_ID_1);
		expect(ann?.createdAt).toBe(FIXED_NOW_2);
		expect(ann?.story).toBe("Button");
		expect(ann?.variant).toBe("AllVariants");
		expect(ann?.note).toBe("radius too tight on the disabled state");
		expect(ann?.target.component).toBe("Button");
		expect(ann?.target.dsComponent).toBe("Button");
		expect(ann?.target.element).toBe('button.btn--disabled "Save"');
	});

	test("readState after append round-trips the annotation", () => {
		appendAnnotation(tmpFile, INPUT_1, FIXED_NOW_2, FIXED_ID_1);
		const state = readState(tmpFile);
		expect(state.currentRound).toBe(1);
		expect(state.rounds[0]?.annotations).toHaveLength(1);
		expect(state.rounds[0]?.annotations[0]?.id).toBe(FIXED_ID_1);
	});

	test("second append appends to the same open round", () => {
		appendAnnotation(tmpFile, INPUT_1, FIXED_NOW_2, FIXED_ID_1);
		const state = appendAnnotation(tmpFile, INPUT_2, FIXED_NOW_3, FIXED_ID_2);
		expect(state.currentRound).toBe(1);
		expect(state.rounds[0]?.annotations).toHaveLength(2);
	});

	test("annotation is in the open round (currentRound)", () => {
		const state = appendAnnotation(tmpFile, INPUT_1, FIXED_NOW_2, FIXED_ID_1);
		const openRound = state.rounds.find((r) => r.round === state.currentRound);
		expect(openRound).toBeDefined();
		expect(openRound?.annotations.some((a) => a.id === FIXED_ID_1)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AC5 — startRound closes current round and opens currentRound+1
// ---------------------------------------------------------------------------

describe("AC5 — startRound", () => {
	test("startRound on empty file bumps to round 2 with empty annotations", () => {
		const state = startRound(tmpFile, FIXED_NOW_3);
		expect(state.currentRound).toBe(2);
		expect(state.rounds).toHaveLength(2);
		expect(state.rounds[1]).toMatchObject({ round: 2, annotations: [] });
	});

	test("prior annotations preserved immutable after startRound", () => {
		appendAnnotation(tmpFile, INPUT_1, FIXED_NOW_2, FIXED_ID_1);
		startRound(tmpFile, FIXED_NOW_3);
		const state = readState(tmpFile);
		// round 1 still has the annotation
		const round1 = state.rounds.find((r) => r.round === 1);
		expect(round1?.annotations).toHaveLength(1);
		expect(round1?.annotations[0]?.id).toBe(FIXED_ID_1);
	});

	test("annotation after startRound lands in the new round", () => {
		appendAnnotation(tmpFile, INPUT_1, FIXED_NOW_2, FIXED_ID_1);
		startRound(tmpFile, FIXED_NOW_3);
		const state = appendAnnotation(tmpFile, INPUT_2, FIXED_NOW_3, FIXED_ID_2);
		expect(state.currentRound).toBe(2);
		const round2 = state.rounds.find((r) => r.round === 2);
		expect(round2?.annotations).toHaveLength(1);
		expect(round2?.annotations[0]?.id).toBe(FIXED_ID_2);
	});

	test("round 1 annotations NOT modified after round 2 append", () => {
		appendAnnotation(tmpFile, INPUT_1, FIXED_NOW_2, FIXED_ID_1);
		startRound(tmpFile, FIXED_NOW_3);
		appendAnnotation(tmpFile, INPUT_2, FIXED_NOW_3, FIXED_ID_2);
		const state = readState(tmpFile);
		const round1 = state.rounds.find((r) => r.round === 1);
		expect(round1?.annotations).toHaveLength(1);
		expect(round1?.annotations[0]?.note).toBe("radius too tight on the disabled state");
	});

	test("multiple startRound calls keep incrementing currentRound", () => {
		startRound(tmpFile, FIXED_NOW_1);
		const state = startRound(tmpFile, FIXED_NOW_2);
		expect(state.currentRound).toBe(3);
		expect(state.rounds).toHaveLength(3);
	});
});

// ---------------------------------------------------------------------------
// AC6 — renderMarkdown
// ---------------------------------------------------------------------------

describe("AC6 — renderMarkdown", () => {
	test("empty state emits a Round 1 header", () => {
		// readState on a missing file is not used directly here; we seed explicitly
		// seed it with a startedAt timestamp
		const seeded: AnnotationState = {
			currentRound: 1,
			rounds: [{ round: 1, startedAt: FIXED_NOW_1, annotations: [] }],
		};
		const md = renderMarkdown(seeded);
		expect(md).toContain(`## Round 1 — ${FIXED_NOW_1}`);
	});

	test("one annotation emits a bullet with component, element, note", () => {
		const state: AnnotationState = {
			currentRound: 1,
			rounds: [
				{
					round: 1,
					startedAt: FIXED_NOW_1,
					annotations: [
						{
							id: FIXED_ID_1,
							createdAt: FIXED_NOW_2,
							story: "Button",
							variant: "AllVariants",
							note: "radius too tight on the disabled state",
							target: {
								component: "Button",
								dsComponent: "Button",
								element: 'button.btn--disabled "Save"',
							},
						},
					],
				},
			],
		};
		const md = renderMarkdown(state);
		expect(md).toContain("## Round 1 —");
		// bullet must contain component name
		expect(md).toContain("Button");
		// bullet must contain element descriptor
		expect(md).toContain('button.btn--disabled "Save"');
		// bullet must contain the note
		expect(md).toContain("radius too tight on the disabled state");
	});

	test("two rounds emit two headers in order", () => {
		const state: AnnotationState = {
			currentRound: 2,
			rounds: [
				{ round: 1, startedAt: FIXED_NOW_1, annotations: [] },
				{ round: 2, startedAt: FIXED_NOW_3, annotations: [] },
			],
		};
		const md = renderMarkdown(state);
		const idx1 = md.indexOf(`## Round 1 — ${FIXED_NOW_1}`);
		const idx2 = md.indexOf(`## Round 2 — ${FIXED_NOW_3}`);
		expect(idx1).toBeGreaterThanOrEqual(0);
		expect(idx2).toBeGreaterThanOrEqual(0);
		expect(idx1).toBeLessThan(idx2);
	});

	test("annotation bullet is a markdown list item (starts with - or *)", () => {
		const state: AnnotationState = {
			currentRound: 1,
			rounds: [
				{
					round: 1,
					startedAt: FIXED_NOW_1,
					annotations: [
						{
							id: FIXED_ID_1,
							createdAt: FIXED_NOW_2,
							story: "Button",
							variant: "AllVariants",
							note: "some note",
							target: { component: "Foo", dsComponent: null, element: "span" },
						},
					],
				},
			],
		};
		const md = renderMarkdown(state);
		// Should have at least one list bullet line
		const lines = md.split("\n");
		const bulletLines = lines.filter((l) => /^\s*[-*]\s/.test(l));
		expect(bulletLines.length).toBeGreaterThan(0);
	});

	test("mdPath returns sibling .md file", () => {
		const jsonPath = "/some/dir/annotations.json";
		const result = mdPath(jsonPath);
		expect(result).toBe("/some/dir/annotations.md");
	});
});
