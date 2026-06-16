/**
 * AJ5 — annotation-store.ts
 *
 * Reads/writes the canonical `.annotations/annotations.json` file and derives
 * the human-readable `.annotations/annotations.md` from it.
 *
 * Design-it-twice §A: JSON is canonical (viewer-read), Markdown is derived (agent-read).
 * Design-it-twice §B: Middleware owns round state — client is stateless over rounds.
 *
 * @lore AJ5: The `.json` file is the single source of truth. `.md` is DERIVED and
 * OVERWRITTEN from the canonical `.json` on every write (append or startRound).
 * Do NOT hand-edit annotations.md — any edit is silently clobbered on the next
 * write. The founder reads the human-facing `.md`; edits must go into the viewer.
 *
 * @lore AJ5: Path is injected (not global) so tests can use tmp files without
 * touching the real .annotations/ directory.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Annotation, AnnotationInput, AnnotationState } from "./types.js";

// ---------------------------------------------------------------------------
// Seed: the initial empty state for a missing file
// ---------------------------------------------------------------------------

function seedState(now: string): AnnotationState {
	return {
		currentRound: 1,
		rounds: [{ round: 1, startedAt: now, annotations: [] }],
	};
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Read the canonical JSON file.
 * Missing file → seed { currentRound: 1, rounds: [{ round:1, startedAt: now, annotations:[] }] }.
 */
export function readState(file: string): AnnotationState {
	if (!existsSync(file)) {
		return seedState(new Date().toISOString());
	}
	const raw = readFileSync(file, "utf8");
	return JSON.parse(raw) as AnnotationState;
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

function writeState(file: string, state: AnnotationState): void {
	writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
	// Also write the derived markdown sibling
	writeFileSync(mdPath(file), renderMarkdown(state), "utf8");
}

// ---------------------------------------------------------------------------
// Append annotation
// ---------------------------------------------------------------------------

/**
 * Append an annotation to the current open round. Seeds round 1 if file is missing.
 * Writes both the canonical `.json` and the derived `.md`.
 */
export function appendAnnotation(
	file: string,
	input: AnnotationInput,
	now: string,
	id: string,
): AnnotationState {
	const state = readState(file);
	const openRoundIdx = state.rounds.findIndex((r) => r.round === state.currentRound);

	const annotation: Annotation = {
		id,
		createdAt: now,
		story: input.story,
		variant: input.variant,
		note: input.note,
		target: input.target,
	};

	if (openRoundIdx === -1) {
		// Safety: current round not found — create it
		state.rounds.push({
			round: state.currentRound,
			startedAt: now,
			annotations: [annotation],
		});
	} else {
		// biome-ignore lint/style/noNonNullAssertion: index verified above
		state.rounds[openRoundIdx]!.annotations.push(annotation);
	}

	writeState(file, state);
	return state;
}

// ---------------------------------------------------------------------------
// Start round
// ---------------------------------------------------------------------------

/**
 * Close the current round and open currentRound+1.
 * Prior annotations are preserved immutable.
 * Writes both the canonical `.json` and the derived `.md`.
 */
export function startRound(file: string, now: string): AnnotationState {
	const state = readState(file);
	const nextRound = state.currentRound + 1;
	state.rounds.push({ round: nextRound, startedAt: now, annotations: [] });
	state.currentRound = nextRound;
	writeState(file, state);
	return state;
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

/**
 * Render the derived Markdown from the canonical state.
 *
 * Format:
 *   ## Round N — <startedAt>
 *   - **<component>** (<element>) — story <Story>/<Variant>: <note>
 *
 * @lore AJ5: This function is pure (no IO) so it can be unit-tested and
 * also called server-side after every write to keep `.md` in sync with `.json`.
 */
export function renderMarkdown(state: AnnotationState): string {
	const sections = state.rounds.map((round) => {
		const header = `## Round ${round.round} — ${round.startedAt}`;
		if (round.annotations.length === 0) {
			return header;
		}
		const bullets = round.annotations
			.map(
				(a) =>
					`- **${a.target.component}** (${a.target.element}) — story ${a.story}/${a.variant}: ${a.note}`,
			)
			.join("\n");
		return `${header}\n${bullets}`;
	});
	return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Returns the derived `.md` sibling path for a given `.json` canonical path.
 * e.g. `/repo/.annotations/annotations.json` → `/repo/.annotations/annotations.md`
 */
export function mdPath(jsonFile: string): string {
	const dir = dirname(jsonFile);
	return join(dir, "annotations.md");
}
