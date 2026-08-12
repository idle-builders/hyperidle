#!/usr/bin/env tsx
/**
 * Design-migration-backlog drift gate.
 *
 * `.pipeline/work/AZ7/migration-backlog.md` is not hand-written — it is a
 * straight render of `predicates.mjs`'s element scan (see the file's own
 * "Regenerate:" line).
 *
 * @lore A prior review round found the committed backlog had drifted from
 * its own generator: a scanner change (identifier following, template-literal
 * span resolution) was never re-run against the tracked file, so it quietly
 * stopped matching the code it claims to enumerate. See
 * `.pipeline/work/AZ7/plan.md` §7 (review history) for the finding.
 *
 * This gate re-runs the real generator pair (`predicates.mjs` +
 * `render-backlog.mjs`, unmodified, in a throwaway output location so the
 * real repo tree is never touched) and fails when the result differs from
 * the committed file — the same "regenerate and diff" shape as
 * `mock-inventory.ts --check`, applied to a different generator.
 *
 * Not a vitest test: this asserts a static property of a checked-in
 * artifact against a build script's output, not runtime behavior of
 * application code (`.claude/rules/testing.md`) — so it lives here, next to
 * `mock-inventory.ts`, and runs as a `npm run verify` step.
 *
 * Usage:
 *   npm run design:backlog        # write mode — regenerate the real file
 *   npm run design:backlog:check  # CI/verify mode — compare, exit 1 on drift
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// tools/repo-gates/src/design-backlog-drift.ts → repo root is three levels up.
const REPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..", "..");

const MEASUREMENT_DIR = join(REPO_ROOT, ".pipeline/work/AZ7/measurement");
const PREDICATES_SCRIPT = join(MEASUREMENT_DIR, "predicates.mjs");
const RENDER_SCRIPT = join(MEASUREMENT_DIR, "render-backlog.mjs");
const BACKLOG_REL_PATH = ".pipeline/work/AZ7/migration-backlog.md";
const BACKLOG_PATH = join(REPO_ROOT, BACKLOG_REL_PATH);

interface BacklogItem {
	axis: "control" | "chip";
	file: string;
	lines: string;
}

/**
 * Parses the generated bug-list into (axis, file, line-list) triples,
 * deliberately ignoring the `UI-###` id — ids renumber on every insertion or
 * deletion (the file's own header says so), so diffing by id would report
 * a wall of noise for a single genuinely new site. The (axis, file, lines)
 * triple is the actual claim the document makes about the code.
 */
function parseBacklogItems(content: string): BacklogItem[] {
	const items: BacklogItem[] = [];
	let axis: BacklogItem["axis"] | null = null;
	for (const line of content.split("\n")) {
		if (line.startsWith("## Hand-rolled buttons/inputs")) {
			axis = "control";
			continue;
		}
		if (line.startsWith("## Hand-rolled chips")) {
			axis = "chip";
			continue;
		}
		if (!(axis && line.startsWith("- [ ] **UI-"))) continue;
		const m = /^- \[ \] \*\*UI-\d+\*\* `([^`]+)` — .*? at line\(s\) ([0-9, ]+) ·/.exec(line);
		if (!m) continue;
		const file = m[1];
		const lines = m[2];
		if (!(file && lines)) continue;
		items.push({ axis, file, lines });
	}
	return items;
}

function itemKey(item: BacklogItem): string {
	return `${item.axis}::${item.file}::${item.lines}`;
}

function diffItems(
	committed: BacklogItem[],
	fresh: BacklogItem[],
): { added: BacklogItem[]; removed: BacklogItem[] } {
	const committedKeys = new Set(committed.map(itemKey));
	const freshKeys = new Set(fresh.map(itemKey));
	return {
		added: fresh.filter((i) => !committedKeys.has(itemKey(i))),
		removed: committed.filter((i) => !freshKeys.has(itemKey(i))),
	};
}

/**
 * Runs the real generator pair into a throwaway location and returns the
 * markdown it would write. `render-backlog.mjs` writes to a hardcoded
 * `${ROOT}/.pipeline/work/AZ7/migration-backlog.md`, so we point its `ROOT`
 * argument at a scratch directory (not the real repo) — the real committed
 * file is only ever read, never overwritten, in check mode.
 */
function generateBacklog(scratchRoot: string): string {
	const outDir = join(scratchRoot, "predicates-out");
	mkdirSync(outDir, { recursive: true });
	// predicates.mjs hard-fails ("HARD FAIL: zero tsx") if its own scan of
	// layers/framework/applications finds no .tsx files at all — that failure
	// propagates here as a non-zero exit, which execFileSync throws on. We
	// deliberately do not catch it: a scan that matches nothing must fail loud.
	execFileSync(process.execPath, [PREDICATES_SCRIPT, REPO_ROOT, outDir], { stdio: "pipe" });

	const fakeRoot = join(scratchRoot, "fake-root");
	mkdirSync(join(fakeRoot, ".pipeline/work/AZ7"), { recursive: true });
	execFileSync(process.execPath, [RENDER_SCRIPT, outDir, fakeRoot], { stdio: "pipe" });

	return readFileSync(join(fakeRoot, BACKLOG_REL_PATH), "utf8");
}

function fail(message: string): never {
	process.stderr.write(`design:backlog:check FAILED — ${message}\n`);
	process.exit(1);
}

const isCheck = process.argv.includes("--check");

if (!(existsSync(PREDICATES_SCRIPT) && existsSync(RENDER_SCRIPT))) {
	fail(
		`generator script missing: expected both ${PREDICATES_SCRIPT} and ${RENDER_SCRIPT} to exist. ` +
			"The backlog cannot be verified without its own generator.",
	);
}

if (isCheck) {
	const scratch = mkdtempSync(join(tmpdir(), "az7-backlog-check-"));
	let fresh: string;
	try {
		fresh = generateBacklog(scratch);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}

	if (!existsSync(BACKLOG_PATH)) {
		fail(`${BACKLOG_REL_PATH} does not exist — run \`npm run design:backlog\` to create it.`);
	}
	const committedRaw = readFileSync(BACKLOG_PATH, "utf8");

	if (committedRaw === fresh) {
		const items = parseBacklogItems(fresh);
		if (items.length === 0) {
			fail(
				"the generator produced ZERO backlog items — that means predicates.mjs's element scan " +
					"matched nothing under layers/core-ui/, which is a scan failure, not a migration " +
					"success (it would need every hand-rolled control AND every hand-rolled chip in " +
					"core-ui to be gone, an outcome migration-backlog.md's own scope line does not claim). " +
					"Check the scanner before trusting this state.",
			);
		}
		process.stdout.write(
			`design:backlog:check: ${BACKLOG_REL_PATH} is up to date (${items.length} items).\n`,
		);
		process.exit(0);
	}

	const committedItems = parseBacklogItems(committedRaw);
	const freshItems = parseBacklogItems(fresh);
	const { added, removed } = diffItems(committedItems, freshItems);

	process.stderr.write(
		`design:backlog:check FAILED — ${BACKLOG_REL_PATH} is stale against its own generator ` +
			"(predicates.mjs + render-backlog.mjs). The committed file no longer matches a fresh scan " +
			"of the current tree — code moved (or the scanner changed) since the file was last regenerated.\n",
	);
	process.stderr.write(
		`  committed: ${committedItems.length} items · fresh: ${freshItems.length} items\n`,
	);
	if (added.length > 0) {
		process.stderr.write(`  newly-visible sites (${added.length}), missing from the backlog:\n`);
		for (const i of added) {
			process.stderr.write(`    + [${i.axis}] ${i.file} at line(s) ${i.lines}\n`);
		}
	}
	if (removed.length > 0) {
		process.stderr.write(
			`  sites the backlog still lists that the generator no longer finds (${removed.length}):\n`,
		);
		for (const i of removed) {
			process.stderr.write(`    - [${i.axis}] ${i.file} at line(s) ${i.lines}\n`);
		}
	}
	process.stderr.write(
		"  Run `npm run design:backlog` to regenerate, then commit the updated migration-backlog.md " +
			"(item numbering will shift — that is expected).\n",
	);
	process.exit(1);
}

// Write mode — regenerate the real, committed file in place.
const writeOutDir = mkdtempSync(join(tmpdir(), "az7-backlog-write-"));
try {
	execFileSync(process.execPath, [PREDICATES_SCRIPT, REPO_ROOT, writeOutDir], { stdio: "inherit" });
	execFileSync(process.execPath, [RENDER_SCRIPT, writeOutDir, REPO_ROOT], { stdio: "inherit" });
} finally {
	rmSync(writeOutDir, { recursive: true, force: true });
}
