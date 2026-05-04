import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	ADVERSARIAL_PERSONAS,
	type BriefData,
	briefPath,
	formatAdversarialContext,
	formatSessionContext,
	getActiveStory,
	isAdversarialPersona,
	type MemoryData,
	memoryPath,
	type PrefetchData,
	prefetchPath,
	readBrief,
	readMemory,
	readPrefetch,
	setActiveStory,
	truncatePrefetch,
	writeBrief,
	writeMemory,
	writePrefetch,
} from "../brief.js";

const STORY_ID = "L99";

const baseMemory: MemoryData = {
	story: { id: STORY_ID, spec: { headline: "Strip drag/drop from Kanban", acs: ["AC1", "AC2"] } },
	plan: {
		locked: true,
		summary: "Remove dnd-kit. Use long-press menu instead.",
		routes: ["GET /api/board"],
		targetFiles: ["packages/web/src/Kanban.tsx:1-200"],
	},
	openIssues: [],
	priorPersona: { headline: "Architect locked plan, ready for Builder" },
};

const baseBrief: BriefData = {
	fromPersona: "architect",
	toPersona: "developer",
	priorScore: "9/10",
	targetFiles: ["packages/web/src/Kanban.tsx:1-200"],
	openIssues: ["touch keyboard a11y"],
	ledgerEntry: "Architect handed off plan; tests stubbed.",
	artifactPaths: [".pipeline/artifacts/L99/architect.md"],
};

const basePrefetch: PrefetchData = {
	persona: "developer",
	items: [
		{ kind: "plan", content: "Locked plan summary." },
		{ kind: "test-scaffold", content: "test('renders board', ...)" },
	],
	totalBytes: 0,
	capBytes: 5 * 1024,
};

describe("brief module", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "hyperidle-brief-"));
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	describe("paths", () => {
		it("memoryPath puts the file under .pipeline/memory/", () => {
			expect(memoryPath(cwd, STORY_ID)).toBe(join(cwd, ".pipeline", "memory", "L99.toon"));
		});
		it("briefPath puts the file under .pipeline/briefs/", () => {
			expect(briefPath(cwd, STORY_ID)).toBe(join(cwd, ".pipeline", "briefs", "L99.toon"));
		});
		it("prefetchPath partitions by persona", () => {
			expect(prefetchPath(cwd, STORY_ID, "developer")).toBe(
				join(cwd, ".pipeline", "prefetch", "L99-developer.toon"),
			);
		});
	});

	describe("memory I/O", () => {
		it("writes memory and returns absolute path", () => {
			const p = writeMemory(cwd, STORY_ID, baseMemory);
			expect(p).toBe(memoryPath(cwd, STORY_ID));
			expect(existsSync(p)).toBe(true);
		});

		it("round-trips memory through TOON", () => {
			writeMemory(cwd, STORY_ID, baseMemory);
			const recovered = readMemory(cwd, STORY_ID);
			expect(recovered).toEqual(baseMemory);
		});

		it("readMemory returns null when file missing", () => {
			expect(readMemory(cwd, STORY_ID)).toBeNull();
		});
	});

	describe("brief I/O", () => {
		it("round-trips brief through TOON", () => {
			writeBrief(cwd, STORY_ID, baseBrief);
			expect(readBrief(cwd, STORY_ID)).toEqual(baseBrief);
		});

		it("readBrief returns null when file missing", () => {
			expect(readBrief(cwd, STORY_ID)).toBeNull();
		});

		it("preserves null priorScore through round-trip", () => {
			const brief = { ...baseBrief, priorScore: null };
			writeBrief(cwd, STORY_ID, brief);
			expect(readBrief(cwd, STORY_ID)?.priorScore).toBeNull();
		});
	});

	describe("prefetch", () => {
		it("round-trips prefetch through TOON", () => {
			writePrefetch(cwd, STORY_ID, "developer", basePrefetch);
			const recovered = readPrefetch(cwd, STORY_ID, "developer");
			expect(recovered?.persona).toBe("developer");
			expect(recovered?.items.length).toBe(2);
		});

		it("truncatePrefetch drops items past the byte cap", () => {
			const big = "x".repeat(2000);
			const data: PrefetchData = {
				persona: "developer",
				items: [
					{ kind: "a", content: big },
					{ kind: "b", content: big },
					{ kind: "c", content: big },
				],
				totalBytes: 0,
				capBytes: 4500,
			};
			const truncated = truncatePrefetch(data, 4500);
			expect(truncated.items.length).toBe(2);
			expect(truncated.totalBytes).toBeLessThanOrEqual(4500);
			expect(truncated.capBytes).toBe(4500);
		});

		it("writePrefetch caps at PREFETCH_CAP_BYTES by default", () => {
			const big = "x".repeat(3000);
			const data: PrefetchData = {
				persona: "developer",
				items: [
					{ kind: "a", content: big },
					{ kind: "b", content: big },
				],
				totalBytes: 0,
				capBytes: 5 * 1024,
			};
			writePrefetch(cwd, STORY_ID, "developer", data);
			const recovered = readPrefetch(cwd, STORY_ID, "developer");
			expect(recovered?.totalBytes).toBeLessThanOrEqual(5 * 1024);
		});
	});

	describe("active story pointer", () => {
		it("getActiveStory returns null before set", () => {
			expect(getActiveStory(cwd)).toBeNull();
		});
		it("set then get round-trips", () => {
			setActiveStory(cwd, STORY_ID);
			expect(getActiveStory(cwd)).toBe(STORY_ID);
		});
	});

	describe("adversarial persona classification", () => {
		it("flags critics + reviewers + scans", () => {
			expect(isAdversarialPersona("adversary")).toBe(true);
			expect(isAdversarialPersona("design-critique")).toBe(true);
			expect(isAdversarialPersona("check-definition-of-done")).toBe(true);
			expect(isAdversarialPersona("slop-scan")).toBe(true);
		});
		it("does not flag producers", () => {
			expect(isAdversarialPersona("architect")).toBe(false);
			expect(isAdversarialPersona("developer")).toBe(false);
			expect(isAdversarialPersona("designer")).toBe(false);
		});
		it("ADVERSARIAL_PERSONAS is non-empty", () => {
			expect(ADVERSARIAL_PERSONAS.size).toBeGreaterThan(0);
		});
	});

	describe("formatSessionContext", () => {
		it("includes both stable and just-handed-off section labels", () => {
			const out = formatSessionContext({
				memory: baseMemory,
				brief: baseBrief,
				prefetch: null,
			});
			expect(out).toContain("## Story context (stable):");
			expect(out).toContain("## Just-handed-off:");
		});

		it("includes prefetch section with cap reported", () => {
			const out = formatSessionContext({
				memory: null,
				brief: null,
				prefetch: basePrefetch,
			});
			expect(out).toContain("## Pre-fetched");
			expect(out).toContain(`cap ${5 * 1024}B`);
		});

		it("returns empty string when all inputs null", () => {
			expect(formatSessionContext({ memory: null, brief: null, prefetch: null })).toBe("");
		});

		it("renders memory keys in TOON dot-notation", () => {
			const out = formatSessionContext({ memory: baseMemory, brief: null, prefetch: null });
			expect(out).toContain("story.id: L99");
			expect(out).toContain("story.spec.headline");
		});
	});

	describe("formatAdversarialContext", () => {
		it("emits artifact paths, not free-form brief summaries", () => {
			const out = formatAdversarialContext({ memory: baseMemory, brief: baseBrief });
			expect(out).toContain(".pipeline/artifacts/L99/architect.md");
			expect(out).not.toContain(baseBrief.ledgerEntry);
			expect(out).not.toContain("priorScore");
		});

		it("renders '(none)' when brief has no artifact paths", () => {
			const brief = { ...baseBrief, artifactPaths: [] };
			const out = formatAdversarialContext({ memory: null, brief });
			expect(out).toContain("(none)");
		});
	});
});
