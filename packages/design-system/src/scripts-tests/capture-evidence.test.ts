/**
 * AJ4 — RED phase: capture-evidence non-blocking invariant tests.
 *
 * Verifies AC4: a capture/upload failure MUST NOT fail the ship.
 * The orchestrator exits 0 and emits a degraded note for each failure source:
 *   1. renderStory throws
 *   2. uploadShots throws
 *
 * The orchestration entry point must accept injectable seams for:
 *   - renderStory (Playwright / viewer drive)
 *   - uploadShots (gh api orphan-branch push)
 *
 * Import path the green builder must implement:
 *   packages/design-system/scripts/design-evidence/capture-evidence.ts
 *
 * The exported function under test:
 *   runCaptureEvidence(options: CaptureEvidenceOptions): Promise<CaptureEvidenceResult>
 *
 * where CaptureEvidenceOptions has injectable seams:
 *   renderStoryFn?: (viewerOrigin: string, target: RenderTarget, outDir: string) => Promise<RenderedShot>
 *   uploadShotsFn?: (prNumber: number, shots: ...) => Promise<HostedShot[]>
 *
 * and CaptureEvidenceResult:
 *   exitCode: 0
 *   degradedNote?: string      // present when a failure was degraded
 *   prMarkdown: string
 */

import { describe, expect, test } from "vitest";
import {
	type CaptureEvidenceOptions,
	type CaptureEvidenceResult,
	runCaptureEvidence,
} from "../../scripts/design-evidence/capture-evidence.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A minimal snap pair where one story changed */
const BASE_SNAP = `// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

exports[\`AG6/RowDot > Success 1\`] = \`
<div class="row-dot" />
\`;
`;

const BRANCH_SNAP = `// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

exports[\`AG6/RowDot > Success 1\`] = \`
<div class="row-dot changed" />
\`;
`;

/** Base options that short-circuit the I/O-heavy paths */
const BASE_OPTIONS: CaptureEvidenceOptions = {
	prNumber: 42,
	branchSnap: BRANCH_SNAP,
	baseSnap: BASE_SNAP,
	// Provide no-op implementations of the injectable seams so the test
	// doesn't try to spawn real viewers or run gh api
	renderStoryFn: async (_origin, _target, _outDir) => ({
		target: _target,
		pngPath: `/tmp/fake-${_target.title}-${_target.variant}.png`,
	}),
	uploadShotsFn: async (_prNumber, _shots) => [],
	// Skip the real worktree manipulation and viewer boot
	skipWorktree: true,
};

// ---------------------------------------------------------------------------
// Baseline: exits 0 normally
// ---------------------------------------------------------------------------

describe("runCaptureEvidence — baseline", () => {
	test("exits 0 when both seams succeed (no-op)", async () => {
		const result: CaptureEvidenceResult = await runCaptureEvidence(BASE_OPTIONS);
		expect(result.exitCode).toBe(0);
	});

	test("returns prMarkdown string", async () => {
		const result = await runCaptureEvidence(BASE_OPTIONS);
		expect(typeof result.prMarkdown).toBe("string");
	});
});

// ---------------------------------------------------------------------------
// AC4 / Failure source 1: renderStory throws
// ---------------------------------------------------------------------------

describe("runCaptureEvidence — renderStory throws (AC4 non-blocking)", () => {
	test("resolves (does not reject) when renderStory throws", async () => {
		const options: CaptureEvidenceOptions = {
			...BASE_OPTIONS,
			renderStoryFn: async () => {
				throw new Error("Playwright launch failed: no chromium");
			},
		};

		// Must not reject — non-blocking discipline
		await expect(runCaptureEvidence(options)).resolves.toBeDefined();
	});

	test("exits 0 when renderStory throws", async () => {
		const options: CaptureEvidenceOptions = {
			...BASE_OPTIONS,
			renderStoryFn: async () => {
				throw new Error("viewer not answering on port 9001");
			},
		};

		const result = await runCaptureEvidence(options);
		expect(result.exitCode).toBe(0);
	});

	test("emits a degraded note when renderStory throws", async () => {
		const options: CaptureEvidenceOptions = {
			...BASE_OPTIONS,
			renderStoryFn: async () => {
				throw new Error("screenshot CLI error");
			},
		};

		const result = await runCaptureEvidence(options);
		expect(result.degradedNote).toBeTruthy();
		// Degraded note should mention screenshot capture failure or similar
		expect(result.degradedNote).toMatch(/unavailable|capture|screenshot|failed/i);
	});

	test("still produces prMarkdown with story links when renderStory throws", async () => {
		const options: CaptureEvidenceOptions = {
			...BASE_OPTIONS,
			renderStoryFn: async () => {
				throw new Error("viewer boot failed");
			},
		};

		const result = await runCaptureEvidence(options);
		// Even on render failure, the changed story must appear (link-only fallback)
		expect(result.prMarkdown).toContain("AG6/RowDot");
	});
});

// ---------------------------------------------------------------------------
// AC4 / Failure source 2: uploadShots throws
// ---------------------------------------------------------------------------

describe("runCaptureEvidence — uploadShots throws (AC4 non-blocking)", () => {
	test("resolves (does not reject) when uploadShots throws", async () => {
		const options: CaptureEvidenceOptions = {
			...BASE_OPTIONS,
			uploadShotsFn: async () => {
				throw new Error("gh api: 401 Unauthorized");
			},
		};

		await expect(runCaptureEvidence(options)).resolves.toBeDefined();
	});

	test("exits 0 when uploadShots throws", async () => {
		const options: CaptureEvidenceOptions = {
			...BASE_OPTIONS,
			uploadShotsFn: async () => {
				throw new Error("orphan branch push failed");
			},
		};

		const result = await runCaptureEvidence(options);
		expect(result.exitCode).toBe(0);
	});

	test("emits a degraded note when uploadShots throws", async () => {
		const options: CaptureEvidenceOptions = {
			...BASE_OPTIONS,
			uploadShotsFn: async () => {
				throw new Error("could not publish to the evidence branch");
			},
		};

		const result = await runCaptureEvidence(options);
		expect(result.degradedNote).toBeTruthy();
		expect(result.degradedNote).toMatch(/publish|upload|branch|evidence|failed/i);
	});

	test("still produces prMarkdown with story links when uploadShots throws", async () => {
		const options: CaptureEvidenceOptions = {
			...BASE_OPTIONS,
			uploadShotsFn: async () => {
				throw new Error("network error");
			},
		};

		const result = await runCaptureEvidence(options);
		expect(result.prMarkdown).toContain("AG6/RowDot");
	});
});

// ---------------------------------------------------------------------------
// AC3: empty changed-set → no output (exits 0 silently)
// ---------------------------------------------------------------------------

describe("runCaptureEvidence — empty changed set (AC3)", () => {
	test("exits 0 and returns empty prMarkdown when snaps are identical", async () => {
		const options: CaptureEvidenceOptions = {
			...BASE_OPTIONS,
			branchSnap: BASE_SNAP,
			baseSnap: BASE_SNAP,
		};

		const result = await runCaptureEvidence(options);
		expect(result.exitCode).toBe(0);
		expect(result.prMarkdown).toBe("");
	});

	test("does not call renderStory when changed set is empty", async () => {
		let renderCalled = false;
		const options: CaptureEvidenceOptions = {
			...BASE_OPTIONS,
			branchSnap: BASE_SNAP,
			baseSnap: BASE_SNAP,
			renderStoryFn: async () => {
				renderCalled = true;
				return { target: { title: "x", variant: "y" }, pngPath: "/tmp/x.png" };
			},
		};

		await runCaptureEvidence(options);
		expect(renderCalled).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// MAJOR-2: hostedShots threaded into result (AC2 fix)
// ---------------------------------------------------------------------------

describe("runCaptureEvidence — hostedShots in result (MAJOR-2 regression guard)", () => {
	test("result.hostedShots carries URLs returned by uploadShotsFn", async () => {
		const fakeHosted = [
			{
				target: { title: "AG6/RowDot", variant: "Success" },
				side: "after" as const,
				url: "https://github.com/example/blob/pr-evidence/42/AG6__RowDot__Success__after.png",
				render: "link" as const,
			},
			{
				target: { title: "AG6/RowDot", variant: "Success" },
				side: "before" as const,
				url: "https://github.com/example/blob/pr-evidence/42/AG6__RowDot__Success__before.png",
				render: "link" as const,
			},
		];

		const options: CaptureEvidenceOptions = {
			...BASE_OPTIONS,
			uploadShotsFn: async () => fakeHosted,
		};

		const result = await runCaptureEvidence(options);

		// The result must carry the real hosted URLs, not an empty array
		expect(result.hostedShots).toHaveLength(2);
		expect(result.hostedShots[0]?.url).toContain("after.png");
		expect(result.hostedShots[1]?.url).toContain("before.png");
	});

	test("result.hostedShots is empty when uploadShotsFn throws (degraded)", async () => {
		const options: CaptureEvidenceOptions = {
			...BASE_OPTIONS,
			uploadShotsFn: async () => {
				throw new Error("network error");
			},
		};

		const result = await runCaptureEvidence(options);
		expect(result.exitCode).toBe(0);
		expect(result.hostedShots).toEqual([]);
	});

	test("result.hostedShots is empty when changed set is empty", async () => {
		const options: CaptureEvidenceOptions = {
			...BASE_OPTIONS,
			branchSnap: BASE_SNAP,
			baseSnap: BASE_SNAP,
		};

		const result = await runCaptureEvidence(options);
		expect(result.hostedShots).toEqual([]);
	});
});
