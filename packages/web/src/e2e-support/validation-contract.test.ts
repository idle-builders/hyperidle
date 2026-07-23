import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import type {
	ReviewClaim,
	ReviewVerifier,
	VerifiedReviewArtifact,
} from "../../e2e/support/review-trust.js";
import {
	type AttemptStarted,
	canonicalizeClosedJson,
	createValidationContracts,
	type InventoryInput,
	type Observation,
	type ReviewedLineage,
	reconcileValidationRun,
	type ValidationIdentity,
} from "../../e2e/support/validation-contract.js";

const mocked: ValidationIdentity = {
	id: "browser:work:opens",
	source: "e2e/work.spec.ts",
	titlePath: ["work", "opens"],
	lane: "mocked-browser",
};
const backend: ValidationIdentity = {
	id: "browser:work:persists",
	source: "e2e/work-real.spec.ts",
	titlePath: ["work", "persists"],
	lane: "real-backend",
};
const start: AttemptStarted = {
	id: mocked.id,
	runId: "run-1",
	attemptId: "a-1",
	shardId: "s-1",
	workerId: "w-1",
	startedAt: "2026-07-23T08:00:00.000Z",
};
const passed: Observation = {
	id: mocked.id,
	runId: "run-1",
	attemptId: "a-1",
	outcome: "passed",
	startedAt: start.startedAt,
	endedAt: "2026-07-23T08:00:01.000Z",
	durationMs: 1000,
	artifacts: ["runs/run-1/a-1.json"],
};
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const canonicalLineage =
	'{"action":"rewrite","capability":"open work","contractRef":"docs/information-architecture/work-view.md","oldId":"browser:legacy-work:opens","replacementIds":["browser:work:opens"]}';
const lineagePayload = {
	action: "rewrite",
	capability: "open work",
	contractRef: "docs/information-architecture/work-view.md",
	oldId: "browser:legacy-work:opens",
	replacementIds: [mocked.id],
};
const lineagePayloadHash = digest(canonicalLineage);
const lineageReviewContent = JSON.stringify({
	verdict: "accept",
	reviewedPayloadHash: lineagePayloadHash,
	reviewerIdentity: "reviewer-1",
	builderIdentity: "builder-1",
});
const acceptedLineage: ReviewedLineage = {
	oldId: "browser:legacy-work:opens",
	replacementIds: [mocked.id],
	action: "rewrite",
	capability: "open work",
	contractRef: "docs/information-architecture/work-view.md",
	reviewArtifact: "plans/AU20/register-reviews/work.md",
	reviewArtifactHash: digest(lineageReviewContent),
	reviewedPayloadHash: lineagePayloadHash,
	canonicalLineage,
	lineagePayload,
	reviewerIdentity: "reviewer-1",
	builderIdentity: "builder-1",
	verdict: "accept",
};
const validInventory: InventoryInput = {
	discovered: [backend, mocked],
	ledgerIds: [mocked.id, backend.id],
	laneMembers: {
		"mocked-browser": [mocked.id],
		"real-backend": [backend.id],
	},
	allowedLaneIds: ["mocked-browser", "real-backend"],
};

const acceptedReviews = new Map([[acceptedLineage.reviewArtifact, lineageReviewContent]]);
const capturedReviewVerifier: ReviewVerifier = {
	verify(claim, canonicalPayload): VerifiedReviewArtifact {
		const content = acceptedReviews.get(claim.artifactPath);
		if (!content) throw new Error("trusted review artifact did not resolve");
		if (claim.verdict !== "accept") throw new Error("review verdict must accept");
		if (claim.reviewerIdentity !== "reviewer-1" || claim.builderIdentity !== "builder-1") {
			throw new Error("trusted reviewer/builder identity mismatch");
		}
		if (claim.artifactHash !== digest(content)) throw new Error("artifact hash mismatch");
		if (claim.payloadHash !== digest(canonicalPayload)) throw new Error("payload hash mismatch");
		return {
			bytes: Buffer.from(content),
			canonicalPath: claim.artifactPath,
			sha256: claim.artifactHash,
			reviewerIdentity: claim.reviewerIdentity,
			provenance: "repository-review-manifest",
		};
	},
};
const validationContracts = createValidationContracts({
	reviewVerifier: capturedReviewVerifier,
}) as ReturnType<typeof createValidationContracts> & {
	buildValidationInventory(input: InventoryInput): ValidationIdentity[];
};

describe("validation inventory contract", () => {
	test("generates a stable inventory from exact ledger and disjoint lane sets", () => {
		expect(validationContracts.buildValidationInventory(validInventory)).toEqual([mocked, backend]);
	});

	const invalidSets: Array<[string, InventoryInput, RegExp]> = [
		[
			"duplicate discovered identity",
			{ ...validInventory, discovered: [mocked, mocked] },
			/duplicate.*browser:work:opens/i,
		],
		[
			"missing ledger identity",
			{ ...validInventory, ledgerIds: [mocked.id] },
			/ledger.*browser:work:persists/i,
		],
		[
			"extra ledger identity",
			{ ...validInventory, ledgerIds: [mocked.id, backend.id, "browser:extra"] },
			/ledger.*browser:extra/i,
		],
		[
			"duplicate ledger identity",
			{ ...validInventory, ledgerIds: [mocked.id, mocked.id, backend.id] },
			/duplicate.*ledger.*browser:work:opens/i,
		],
		[
			"identity missing from lane manifest",
			{
				...validInventory,
				laneMembers: { "real-backend": [backend.id] },
			},
			/lane.*browser:work:opens/i,
		],
		[
			"unknown lane member",
			{
				...validInventory,
				laneMembers: {
					...validInventory.laneMembers,
					"mocked-browser": [mocked.id, "browser:unknown"],
				},
			},
			/lane.*browser:unknown/i,
		],
		[
			"duplicate lane member",
			{
				...validInventory,
				laneMembers: {
					...validInventory.laneMembers,
					"mocked-browser": [mocked.id, mocked.id],
				},
			},
			/duplicate.*lane.*browser:work:opens/i,
		],
		[
			"overlapping lane ownership",
			{
				...validInventory,
				laneMembers: {
					"mocked-browser": [mocked.id],
					"real-backend": [mocked.id, backend.id],
				},
			},
			/lane.*browser:work:opens/i,
		],
		[
			"identity lane disagrees with manifest key",
			{
				discovered: [mocked],
				allowedLaneIds: ["mocked-browser", "real-backend"],
				ledgerIds: [mocked.id],
				laneMembers: { "real-backend": [mocked.id] },
			},
			/mock.*real-backend|lane.*mismatch/i,
		],
		[
			"unknown empty lane key",
			{
				...validInventory,
				laneMembers: { ...validInventory.laneMembers, "unknown-lane": [] },
			},
			/unknown.*lane/i,
		],
	];

	test.each(invalidSets)("rejects %s", (_name, input, message) => {
		expect(() => validationContracts.buildValidationInventory(input)).toThrow(message);
	});

	test("rejects a deleted identity without reviewed lineage", () => {
		expect(() =>
			validationContracts.buildValidationInventory({
				discovered: [mocked],
				allowedLaneIds: ["mocked-browser"],
				ledgerIds: [mocked.id],
				laneMembers: { "mocked-browser": [mocked.id] },
				previousIds: [acceptedLineage.oldId],
			}),
		).toThrow(/lineage.*browser:legacy-work:opens/i);
	});

	test("preserves the exact current set when a prior identity has accepted replacement lineage", () => {
		expect(
			validationContracts.buildValidationInventory({
				discovered: [mocked],
				allowedLaneIds: ["mocked-browser"],
				ledgerIds: [mocked.id],
				laneMembers: { "mocked-browser": [mocked.id] },
				previousIds: [acceptedLineage.oldId],
				deletedLineage: [acceptedLineage],
			}),
		).toEqual([mocked]);
	});

	const invalidLineage: Array<[string, Partial<ReviewedLineage>, RegExp]> = [
		["action", { action: undefined }, /action/i],
		["capability", { capability: "" }, /capability/i],
		["contract", { contractRef: "" }, /contract/i],
		["review artifact", { reviewArtifact: "" }, /review.*artifact/i],
		["artifact hash", { reviewArtifactHash: "" }, /artifact.*hash/i],
		["payload hash", { reviewedPayloadHash: "" }, /payload.*hash/i],
		["independent review", { reviewerIdentity: "builder-1" }, /independent|reviewer/i],
		["accepted verdict", { verdict: "revise" }, /accept|locked/i],
	];

	test.each(invalidLineage)("rejects lineage missing %s proof", (_name, patch, message) => {
		const lineage = { ...acceptedLineage, ...patch } as ReviewedLineage;
		expect(() =>
			validationContracts.buildValidationInventory({
				discovered: [mocked],
				allowedLaneIds: ["mocked-browser"],
				ledgerIds: [mocked.id],
				laneMembers: { "mocked-browser": [mocked.id] },
				previousIds: [acceptedLineage.oldId],
				deletedLineage: [lineage],
			}),
		).toThrow(message);
	});

	test("rejects a replacement identity claimed by two deleted identities", () => {
		expect(() =>
			validationContracts.buildValidationInventory({
				discovered: [mocked],
				allowedLaneIds: ["mocked-browser"],
				ledgerIds: [mocked.id],
				laneMembers: { "mocked-browser": [mocked.id] },
				previousIds: ["browser:legacy-a", "browser:legacy-b"],
				deletedLineage: [
					{ ...acceptedLineage, oldId: "browser:legacy-a" },
					{ ...acceptedLineage, oldId: "browser:legacy-b" },
				],
			}),
		).toThrow(/replacement.*browser:work:opens/i);
	});

	test.each([
		[
			"unknown old identity",
			[{ ...acceptedLineage, oldId: "browser:not-previous" }],
			[acceptedLineage.oldId],
			/old.*previous|unknown.*old/i,
		],
		[
			"duplicate lineage",
			[acceptedLineage, acceptedLineage],
			[acceptedLineage.oldId],
			/duplicate.*lineage/i,
		],
		[
			"missing replacement",
			[{ ...acceptedLineage, replacementIds: [] }],
			[acceptedLineage.oldId],
			/replacement/i,
		],
		[
			"unknown replacement",
			[{ ...acceptedLineage, replacementIds: ["browser:unknown"] }],
			[acceptedLineage.oldId],
			/replacement.*unknown/i,
		],
		[
			"retain action for deleted identity",
			[{ ...acceptedLineage, action: "retain" as const }],
			[acceptedLineage.oldId],
			/retain.*deleted|action/i,
		],
		[
			"tampered canonical lineage",
			[{ ...acceptedLineage, capability: "different capability" }],
			[acceptedLineage.oldId],
			/canonical|payload.*hash|tamper/i,
		],
	] as const)("rejects %s", (_name, deletedLineage, previousIds, message) => {
		expect(() =>
			validationContracts.buildValidationInventory({
				discovered: [mocked],
				allowedLaneIds: ["mocked-browser"],
				ledgerIds: [mocked.id],
				laneMembers: { "mocked-browser": [mocked.id] },
				previousIds: [...previousIds],
				deletedLineage: [...deletedLineage] as ReviewedLineage[],
			}),
		).toThrow(message);
	});

	test.each([
		["missing review artifact", { reviewArtifact: "" }, /artifact/i],
		["review artifact hash mismatch", { reviewArtifactHash: "wrong" }, /artifact.*hash/i],
	] as const)("rejects %s", (_name, patch, message) => {
		expect(() =>
			validationContracts.buildValidationInventory({
				discovered: [mocked],
				allowedLaneIds: ["mocked-browser"],
				ledgerIds: [mocked.id],
				laneMembers: { "mocked-browser": [mocked.id] },
				previousIds: [acceptedLineage.oldId],
				deletedLineage: [{ ...acceptedLineage, ...patch }],
			}),
		).toThrow(message);
	});

	test.each([
		["review verdict", "revise", lineagePayloadHash, "reviewer-1", "builder-1", /verdict|accept/i],
		["review payload", "accept", "wrong", "reviewer-1", "builder-1", /payload.*hash/i],
		["artifact reviewer", "accept", lineagePayloadHash, "reviewer-2", "builder-1", /reviewer/i],
		[
			"artifact self-review",
			"accept",
			lineagePayloadHash,
			"builder-1",
			"builder-1",
			/independent|self|reviewer/i,
		],
	] as const)("rejects mismatched %s", (_name, verdict, reviewedPayloadHash, reviewerIdentity, builderIdentity, message) => {
		expect(() =>
			validationContracts.buildValidationInventory({
				discovered: [mocked],
				allowedLaneIds: ["mocked-browser"],
				ledgerIds: [mocked.id],
				laneMembers: { "mocked-browser": [mocked.id] },
				previousIds: [acceptedLineage.oldId],
				deletedLineage: [
					{
						...acceptedLineage,
						verdict,
						reviewedPayloadHash,
						reviewerIdentity,
						builderIdentity,
					},
				],
			}),
		).toThrow(message);
	});

	test.each([
		[
			"traversal path",
			{ ...acceptedLineage, reviewArtifact: "../register-reviews/work.md" },
			/path|traversal|accepted.*root/i,
		],
		[
			"unresolved trusted artifact",
			{ ...acceptedLineage, reviewArtifact: "plans/AU20/register-reviews/missing.md" },
			/trusted.*artifact|resolve/i,
		],
	] as const)("rejects lineage %s", (_name, lineage, message) => {
		expect(() =>
			validationContracts.buildValidationInventory({
				discovered: [mocked],
				allowedLaneIds: ["mocked-browser"],
				ledgerIds: [mocked.id],
				laneMembers: { "mocked-browser": [mocked.id] },
				previousIds: [acceptedLineage.oldId],
				deletedLineage: [lineage],
			}),
		).toThrow(message);
	});

	test.each([
		["reviewer", { reviewerIdentity: "reviewer-2" }],
		["builder", { builderIdentity: "builder-2" }],
	] as const)("binds trusted lineage %s identity to asserted identity", (_name, patch) => {
		expect(() =>
			validationContracts.buildValidationInventory({
				discovered: [mocked],
				allowedLaneIds: ["mocked-browser"],
				ledgerIds: [mocked.id],
				laneMembers: { "mocked-browser": [mocked.id] },
				previousIds: [acceptedLineage.oldId],
				deletedLineage: [{ ...acceptedLineage, ...patch }],
			}),
		).toThrow(/trusted.*identity|reviewer|builder/i);
	});

	test("hashes lineage through closed canonical JSON independent of key insertion order", () => {
		const canonical =
			'{"action":"rewrite","capability":"open work","contractRef":"docs/information-architecture/work-view.md","oldId":"browser:legacy-work:opens","replacementIds":["browser:work:opens"]}';
		const hash = digest(canonical);
		const content = JSON.stringify({
			verdict: "accept",
			reviewedPayloadHash: hash,
			reviewerIdentity: "reviewer-1",
			builderIdentity: "builder-1",
		});
		const lineage: ReviewedLineage = {
			...acceptedLineage,
			lineagePayload: {
				replacementIds: [mocked.id],
				oldId: acceptedLineage.oldId,
				contractRef: acceptedLineage.contractRef,
				capability: acceptedLineage.capability,
				action: acceptedLineage.action,
			},
			canonicalLineage: canonical,
			reviewedPayloadHash: hash,
			reviewArtifactHash: digest(content),
		};
		expect(
			validationContracts.buildValidationInventory({
				discovered: [mocked],
				allowedLaneIds: ["mocked-browser"],
				ledgerIds: [mocked.id],
				laneMembers: { "mocked-browser": [mocked.id] },
				previousIds: [lineage.oldId],
				deletedLineage: [lineage],
			}),
		).toEqual([mocked]);
	});
});

describe("terminal reconciliation contract", () => {
	test("preserves never-started and started-without-end identities as unrun and incomplete", () => {
		expect(reconcileValidationRun([mocked, backend], [start], [])).toEqual({
			terminal: { [mocked.id]: "unrun", [backend.id]: "unrun" },
			attempts: { [mocked.id]: {}, [backend.id]: {} },
			complete: false,
		});
	});

	test("is complete exactly when every inventoried identity has evidenced terminal state", () => {
		expect(reconcileValidationRun([mocked], [start], [passed])).toEqual({
			terminal: { [mocked.id]: "passed" },
			attempts: { [mocked.id]: { final: passed } },
			complete: true,
		});
	});

	test("accepts a named prerequisite block before an attempt starts", () => {
		const blocked: Observation = {
			id: mocked.id,
			runId: "run-1",
			outcome: "blocked",
			endedAt: "2026-07-23T07:59:00.000Z",
			artifacts: ["preflight/claude.json"],
			prerequisite: "claude binary on PATH",
		};
		expect(reconcileValidationRun([mocked], [], [blocked])).toEqual({
			terminal: { [mocked.id]: "blocked" },
			attempts: { [mocked.id]: { final: blocked } },
			complete: true,
		});
	});

	test("retains first failure and deterministically reports a fresh retry terminal", () => {
		const failed: Observation = {
			...passed,
			outcome: "failed",
			errorFingerprint: "first-boundary",
		};
		const retryStart: AttemptStarted = {
			...start,
			attemptId: "a-2",
			workerId: "w-2",
			startedAt: "2026-07-23T08:01:00.000Z",
		};
		const retriedPass: Observation = {
			...passed,
			attemptId: "a-2",
			startedAt: retryStart.startedAt,
			endedAt: "2026-07-23T08:01:01.000Z",
		};
		expect(reconcileValidationRun([mocked], [start, retryStart], [failed, retriedPass])).toEqual({
			terminal: { [mocked.id]: "passed" },
			attempts: { [mocked.id]: { firstFailure: failed, final: retriedPass } },
			complete: true,
		});
	});

	test("marks a failed identity unrun while its declared fresh retry has no terminal", () => {
		const failed = { ...passed, outcome: "failed" as const, errorFingerprint: "first" };
		const retryStart = {
			...start,
			attemptId: "a-2",
			startedAt: "2026-07-23T08:01:00.000Z",
		};
		expect(reconcileValidationRun([mocked], [start, retryStart], [failed])).toEqual({
			terminal: { [mocked.id]: "unrun" },
			attempts: { [mocked.id]: { firstFailure: failed } },
			complete: false,
		});
	});

	test("retains first failure and final timeout across a fresh retry", () => {
		const failed = { ...passed, outcome: "failed" as const, errorFingerprint: "first" };
		const retryStart = {
			...start,
			attemptId: "a-2",
			startedAt: "2026-07-23T08:01:00.000Z",
		};
		const timedOut = {
			...passed,
			attemptId: "a-2",
			startedAt: retryStart.startedAt,
			endedAt: "2026-07-23T08:04:00.000Z",
			durationMs: 180_000,
			outcome: "timed_out" as const,
			errorFingerprint: "deadline",
		};
		expect(
			reconcileValidationRun([mocked], [start, retryStart], [failed, timedOut], {
				deadlineAt: "2026-07-23T08:03:00.000Z",
			}),
		).toEqual({
			terminal: { [mocked.id]: "timed_out" },
			attempts: { [mocked.id]: { firstFailure: failed, final: timedOut } },
			complete: true,
		});
	});

	test.each([
		["passed", [start, { ...start, attemptId: "a-2" }], passed],
		[
			"blocked",
			[{ ...start, attemptId: "a-2" }],
			{
				...passed,
				attemptId: undefined,
				outcome: "blocked" as const,
				prerequisite: "claude binary on PATH",
			},
		],
	] as const)("rejects retry after terminal %s", (_name, starts, terminal) => {
		expect(() => reconcileValidationRun([mocked], [...starts], [terminal])).toThrow(
			/retry.*passed|retry.*blocked|terminal/i,
		);
	});

	const invalidObservations: Array<[string, AttemptStarted[], Observation[], RegExp]> = [
		["unknown identity", [start], [{ ...passed, id: "browser:unknown" }], /unknown/i],
		["run mismatch", [start], [{ ...passed, runId: "run-2" }], /run/i],
		["attempt mismatch", [start], [{ ...passed, attemptId: "a-2" }], /attempt/i],
		["duplicate terminal", [start], [passed, passed], /duplicate.*terminal/i],
		[
			"conflicting terminal",
			[start],
			[passed, { ...passed, outcome: "failed", errorFingerprint: "boom" }],
			/conflict.*terminal/i,
		],
		["pass without start", [], [passed], /passed.*start/i],
		[
			"failure without start",
			[],
			[{ ...passed, outcome: "failed", errorFingerprint: "boom" }],
			/failed.*start/i,
		],
		["missing artifact references", [start], [{ ...passed, artifacts: [] }], /artifact/i],
		["missing duration evidence", [start], [{ ...passed, durationMs: undefined }], /duration/i],
		[
			"failure missing error evidence",
			[start],
			[{ ...passed, outcome: "failed" }],
			/error.*fingerprint/i,
		],
		[
			"blocked missing prerequisite evidence",
			[],
			[{ ...passed, attemptId: undefined, outcome: "blocked" }],
			/prerequisite/i,
		],
		["unknown start identity", [{ ...start, id: "browser:unknown" }], [], /unknown.*start/i],
		["duplicate start tuple", [start, start], [], /duplicate.*start/i],
		[
			"duplicate attempt tuple with altered worker and timestamp",
			[
				start,
				{
					...start,
					workerId: "w-2",
					startedAt: "2026-07-23T08:00:00.001Z",
				},
			],
			[],
			/duplicate.*start|attempt.*tuple/i,
		],
		[
			"startedAt mismatch",
			[start],
			[{ ...passed, startedAt: "2026-07-23T08:00:00.001Z" }],
			/startedAt|start.*time/i,
		],
		[
			"malformed observation timestamp",
			[start],
			[{ ...passed, endedAt: "not-a-time" }],
			/timestamp|endedAt/i,
		],
		["negative duration", [start], [{ ...passed, durationMs: -1 }], /duration/i],
		[
			"undeclared retry terminal",
			[start],
			[{ ...passed, attemptId: "a-2" }],
			/attempt|undeclared/i,
		],
	];

	test.each(invalidObservations)("rejects %s", (_name, starts, observations, message) => {
		expect(() => reconcileValidationRun([mocked], starts, observations)).toThrow(message);
	});

	test("rejects timeout before deadline or without matching start", () => {
		const timedOut = {
			...passed,
			outcome: "timed_out" as const,
			errorFingerprint: "deadline",
		};
		expect(() =>
			reconcileValidationRun([mocked], [start], [timedOut], {
				deadlineAt: "2026-07-23T08:02:00.000Z",
			}),
		).toThrow(/deadline|timed_out/i);
		expect(() => reconcileValidationRun([mocked], [], [timedOut])).toThrow(/timed_out.*start/i);
	});

	test("rejects timeout when no bounded deadline is configured", () => {
		expect(() =>
			reconcileValidationRun(
				[mocked],
				[start],
				[{ ...passed, outcome: "timed_out", errorFingerprint: "deadline" }],
			),
		).toThrow(/deadline/i);
	});

	test("accepts timeout after configured deadline when no terminal preceded it", () => {
		const timedOut: Observation = {
			...passed,
			outcome: "timed_out",
			endedAt: "2026-07-23T08:03:00.000Z",
			durationMs: 180_000,
			errorFingerprint: "deadline",
		};
		expect(
			reconcileValidationRun([mocked], [start], [timedOut], {
				deadlineAt: "2026-07-23T08:02:00.000Z",
			}),
		).toEqual({
			terminal: { [mocked.id]: "timed_out" },
			attempts: { [mocked.id]: { final: timedOut } },
			complete: true,
		});
	});

	test("rejects timeout after a prior terminal observation", () => {
		expect(() =>
			reconcileValidationRun(
				[mocked],
				[start],
				[
					passed,
					{
						...passed,
						outcome: "timed_out",
						endedAt: "2026-07-23T08:03:00.000Z",
						errorFingerprint: "deadline",
					},
				],
				{ deadlineAt: "2026-07-23T08:02:00.000Z" },
			),
		).toThrow(/prior.*terminal|conflict/i);
	});
});

describe("reviewed payload lock", () => {
	const payload = { identities: [mocked.id], dispositions: ["feature_regression"] };
	const canonicalPayload =
		'{"dispositions":["feature_regression"],"identities":["browser:work:opens"]}';
	const payloadHash = digest(canonicalPayload);
	const reviewArtifact = "plans/AU20/register-reviews/work.md";
	const reviewContent = JSON.stringify({
		verdict: "accept",
		reviewedPayloadHash: payloadHash,
		reviewerIdentity: "reviewer-1",
		builderIdentity: "builder-1",
	});
	const acceptedClaim: ReviewClaim = {
		artifactPath: reviewArtifact,
		artifactHash: digest(reviewContent),
		payloadHash,
		verdict: "accept",
		reviewerIdentity: "reviewer-1",
		builderIdentity: "builder-1",
	};
	const contracts = createValidationContracts({
		reviewVerifier: {
			verify(claim, canonical) {
				if (claim.artifactPath !== acceptedClaim.artifactPath) {
					throw new Error("trusted review artifact did not resolve");
				}
				if (claim.artifactHash !== acceptedClaim.artifactHash) {
					throw new Error("artifact hash mismatch");
				}
				if (claim.payloadHash !== acceptedClaim.payloadHash || digest(canonical) !== payloadHash) {
					throw new Error("reviewed payload hash mismatch");
				}
				if (claim.verdict !== "accept") throw new Error("review verdict must accept");
				if (
					claim.reviewerIdentity !== acceptedClaim.reviewerIdentity ||
					claim.builderIdentity !== acceptedClaim.builderIdentity ||
					claim.reviewerIdentity === claim.builderIdentity
				) {
					throw new Error("reviewer/builder identity mismatch");
				}
				return {
					bytes: Buffer.from(reviewContent),
					canonicalPath: reviewArtifact,
					sha256: acceptedClaim.artifactHash,
					reviewerIdentity: acceptedClaim.reviewerIdentity,
					provenance: "repository-review-manifest",
				};
			},
		},
	});

	test("unlocks exact payload only with resolved independent accepted review", () => {
		expect(() => contracts.unlockPayload({ payload, claim: acceptedClaim })).not.toThrow();
	});

	test.each([
		["verdict revise", { verdict: "revise" as const }],
		["reviewer identity equals builder", { reviewerIdentity: "builder-1" }],
		["missing resolved artifact", { artifactPath: "" }],
		["missing artifact hash", { artifactHash: "" }],
		["artifact content hash mismatch", { artifactHash: digest(`${reviewContent} `) }],
		["reviewed payload hash drift", { payloadHash: "wrong" }],
		["reviewer mismatch", { reviewerIdentity: "reviewer-2" }],
		["builder mismatch", { builderIdentity: "builder-2" }],
	] as const)("keeps tests/code locked for %s", (_name, patch) => {
		expect(() =>
			contracts.unlockPayload({ payload, claim: { ...acceptedClaim, ...patch } }),
		).toThrow(/locked|review|artifact|hash|payload/i);
	});

	test("rejects payload content drift against manifest-reviewed hash", () => {
		expect(() =>
			contracts.unlockPayload({
				payload: { identities: [backend.id] },
				claim: acceptedClaim,
			}),
		).toThrow(/payload.*hash|reviewed.*payload/i);
	});

	test.each([
		["unresolved artifact", /trusted.*artifact|resolve/i],
		["manifest verdict mismatch", /verdict|accept/i],
		["manifest reviewed payload mismatch", /payload.*hash/i],
		["manifest reviewer mismatch", /reviewer/i],
	] as const)("propagates captured verifier rejection for %s", (reason, message) => {
		const rejecting = createValidationContracts({
			reviewVerifier: {
				verify() {
					throw new Error(reason);
				},
			},
		});
		expect(() => rejecting.unlockPayload({ payload, claim: acceptedClaim })).toThrow(message);
	});

	test("caller artifact bytes cannot replace captured verifier provenance", () => {
		const rejecting = createValidationContracts({
			reviewVerifier: {
				verify() {
					throw new Error("trusted artifact did not resolve");
				},
			},
		});
		expect(() =>
			rejecting.unlockPayload({
				payload,
				claim: acceptedClaim,
				artifactContents: { [reviewArtifact]: reviewContent },
			} as never),
		).toThrow(/trusted.*artifact|resolve/i);
	});

	test("caller canonical text cannot override factory canonicalization", () => {
		const verifier: ReviewVerifier = {
			verify(_claim, receivedCanonical) {
				expect(receivedCanonical).toBe(canonicalPayload);
				return {
					bytes: Buffer.from(reviewContent),
					canonicalPath: reviewArtifact,
					sha256: acceptedClaim.artifactHash,
					reviewerIdentity: acceptedClaim.reviewerIdentity,
					provenance: "repository-review-manifest",
				};
			},
		};
		expect(() =>
			createValidationContracts({ reviewVerifier: verifier }).unlockPayload({
				payload,
				claim: acceptedClaim,
				canonicalPayload: "caller-minted",
			} as never),
		).not.toThrow();
	});

	test("hashes payload through closed canonical JSON independent of key insertion order", () => {
		const reordered = { z: 2, a: 1 };
		const canonical = '{"a":1,"z":2}';
		const hash = digest(canonical);
		const verifier: ReviewVerifier = {
			verify(claim, receivedCanonical) {
				expect(receivedCanonical).toBe(canonical);
				expect(claim.payloadHash).toBe(hash);
				return {
					bytes: Buffer.from(reviewContent),
					canonicalPath: reviewArtifact,
					sha256: claim.artifactHash,
					reviewerIdentity: claim.reviewerIdentity,
					provenance: "repository-review-manifest",
				};
			},
		};
		expect(() =>
			createValidationContracts({ reviewVerifier: verifier }).unlockPayload({
				payload: reordered,
				claim: { ...acceptedClaim, payloadHash: hash },
			}),
		).not.toThrow();
	});

	test.each([
		["undefined", { nested: { value: undefined } }],
		["non-finite", { nested: { value: Number.NaN } }],
		["unsupported", { nested: { value: 1n } }],
	])("rejects %s nested payload through unlock", (_name, payloadWithUnsupportedValue) => {
		expect(() =>
			contracts.unlockPayload({
				payload: payloadWithUnsupportedValue,
				claim: acceptedClaim,
			}),
		).toThrow(/unsupported|closed.*json|non-finite|undefined/i);
	});
});

describe("closed canonical JSON contract", () => {
	test("sorts object keys recursively while preserving array order", () => {
		expect(canonicalizeClosedJson({ z: [{ b: 2, a: 1 }], a: "first" })).toBe(
			'{"a":"first","z":[{"a":1,"b":2}]}',
		);
	});

	test.each([
		["undefined", { value: undefined }],
		["non-finite number", { value: Number.POSITIVE_INFINITY }],
		["bigint", { value: 1n }],
		["function", { value: () => undefined }],
		["symbol", { value: Symbol("unsupported") }],
	])("rejects unsupported %s values instead of silently dropping or coercing", (_name, value) => {
		expect(() => canonicalizeClosedJson(value)).toThrow(/unsupported|closed.*json/i);
	});
});

describe("single-run reconciliation boundaries", () => {
	test("rejects mixed run IDs when no explicit target run is selected", () => {
		const second = {
			...start,
			runId: "run-2",
			attemptId: "a-2",
			startedAt: "2026-07-23T08:01:00.000Z",
		};
		expect(() => reconcileValidationRun([mocked], [start, second], [passed])).toThrow(
			/mixed.*run|target.*run/i,
		);
	});

	test("rejects observations outside the explicit target run", () => {
		expect(() =>
			reconcileValidationRun([mocked], [start], [passed], {
				targetRunId: "run-2",
			}),
		).toThrow(/target.*run|run.*mismatch/i);
	});

	test("rejects malformed deadlines", () => {
		expect(() =>
			reconcileValidationRun(
				[mocked],
				[start],
				[{ ...passed, outcome: "timed_out", errorFingerprint: "deadline" }],
				{ deadlineAt: "not-a-time", targetRunId: "run-1" },
			),
		).toThrow(/deadline.*timestamp|invalid.*deadline/i);
	});

	test.each([
		[
			"end before start",
			{ ...passed, endedAt: "2026-07-23T07:59:59.000Z" },
			/end.*before.*start|timestamp/i,
		],
		[
			"duration disagrees with timestamps",
			{ ...passed, durationMs: 7 },
			/duration.*timestamp|duration.*mismatch/i,
		],
	] as const)("rejects %s", (_name, observation, message) => {
		expect(() =>
			reconcileValidationRun([mocked], [start], [observation], {
				targetRunId: "run-1",
			}),
		).toThrow(message);
	});

	test("rejects ambiguous equal-start attempt ordering", () => {
		const retry = { ...start, attemptId: "a-2", workerId: "w-2" };
		expect(() => reconcileValidationRun([mocked], [start, retry], [])).toThrow(
			/equal.*start|attempt.*order/i,
		);
	});
});

describe("trusted review provenance", () => {
	const payload = { identities: [mocked.id] };
	const reviewArtifact = "plans/AU20/register-reviews/work.md";
	const claim: ReviewClaim = {
		artifactPath: reviewArtifact,
		artifactHash: "trusted-artifact",
		payloadHash: digest(JSON.stringify(payload)),
		verdict: "accept",
		reviewerIdentity: "reviewer-1",
		builderIdentity: "builder-1",
	};

	test("rejects lineage whose old identity is still discovered", () => {
		const legacy: ValidationIdentity = {
			id: acceptedLineage.oldId,
			source: "e2e/legacy.spec.ts",
			titlePath: ["legacy"],
			lane: "mocked-browser",
		};
		expect(() =>
			validationContracts.buildValidationInventory({
				discovered: [legacy, mocked],
				ledgerIds: [legacy.id, mocked.id],
				laneMembers: { "mocked-browser": [legacy.id, mocked.id] },
				allowedLaneIds: ["mocked-browser"],
				previousIds: [legacy.id],
				deletedLineage: [acceptedLineage],
			}),
		).toThrow(/old.*still.*discovered|lineage.*current/i);
	});

	test("rejects traversal-shaped accepted review paths", () => {
		const contracts = createValidationContracts({
			reviewVerifier: {
				verify() {
					throw new Error("artifact path escapes accepted root");
				},
			},
		});
		expect(() =>
			contracts.unlockPayload({
				payload,
				claim: { ...claim, artifactPath: "../register-reviews/work.md" },
			}),
		).toThrow(/path|traversal|accepted.*root/i);
	});

	test("uses trusted artifact resolution rather than caller-supplied content", () => {
		const contracts = createValidationContracts({
			reviewVerifier: {
				verify() {
					throw new Error("trusted artifact did not resolve");
				},
			},
		});
		expect(() => contracts.unlockPayload({ payload, claim })).toThrow(/trusted.*artifact|resolve/i);
	});

	test("cannot unlock with caller-minted reviewer identity when trusted identity is builder", () => {
		const contracts = createValidationContracts({
			reviewVerifier: {
				verify() {
					throw new Error("trusted identities are not independent");
				},
			},
		});
		expect(() =>
			contracts.unlockPayload({
				payload,
				claim: { ...claim, reviewerIdentity: "builder-1" },
			}),
		).toThrow(/trusted.*identity|self.*review|independent/i);
	});
});

describe("strict attempt sequencing", () => {
	const failure = {
		...passed,
		outcome: "failed" as const,
		errorFingerprint: "first",
	};
	const retryStart = {
		...start,
		attemptId: "a-2",
		startedAt: "2026-07-23T08:01:00.000Z",
	};
	const retryPass = {
		...passed,
		attemptId: "a-2",
		startedAt: retryStart.startedAt,
		endedAt: "2026-07-23T08:01:01.000Z",
	};

	test("requires each terminal to end no later than the next attempt start", () => {
		expect(() =>
			reconcileValidationRun(
				[mocked],
				[start, retryStart],
				[{ ...failure, endedAt: "2026-07-23T08:01:00.001Z" }, retryPass],
				{ targetRunId: "run-1" },
			),
		).toThrow(/overlap|terminal.*next.*start|sequence/i);
	});

	test("earlier unmatched start keeps a later pass non-authoritative and incomplete", () => {
		expect(
			reconcileValidationRun([mocked], [start, retryStart], [retryPass], {
				targetRunId: "run-1",
			}),
		).toEqual({
			terminal: { [mocked.id]: "unrun" },
			attempts: { [mocked.id]: {} },
			complete: false,
		});
	});

	test("rejects out-of-order retry starts", () => {
		expect(() =>
			reconcileValidationRun(
				[mocked],
				[start, { ...retryStart, startedAt: "2026-07-23T07:59:00.000Z" }],
				[failure],
				{ targetRunId: "run-1" },
			),
		).toThrow(/order|overlap|sequence/i);
	});
});
