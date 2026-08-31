import { createHash } from "node:crypto";
import { posix } from "node:path";
import type { ReviewClaim, ReviewVerifier } from "./review-trust.js";

export type LaneId =
	| "mocked-browser"
	| "real-backend"
	| "live-agent"
	| "service-integration"
	| "harness-claude"
	| "harness-codex"
	| "harness-opencode"
	| "harness-gh"
	| "desktop-unit"
	| "desktop-dev"
	| "desktop-packaged-local"
	| "desktop-shared";

export interface ValidationIdentity {
	id: string;
	source: string;
	titlePath: string[];
	lane: LaneId;
}

export interface AttemptStarted {
	id: string;
	runId: string;
	attemptId: string;
	shardId: string;
	workerId: string;
	startedAt: string;
}

export interface Observation {
	id: string;
	runId: string;
	attemptId?: string;
	outcome: "passed" | "failed" | "timed_out" | "blocked";
	startedAt?: string;
	endedAt: string;
	durationMs?: number;
	artifacts: string[];
	errorFingerprint?: string;
	prerequisite?: string;
}

export interface ReviewedLineage {
	oldId: string;
	replacementIds: string[];
	action: "retain" | "reroute" | "rewrite" | "delete";
	capability: string;
	contractRef: string;
	reviewArtifact: string;
	reviewArtifactHash: string;
	reviewedPayloadHash: string;
	canonicalLineage: string;
	lineagePayload: unknown;
	reviewerIdentity: string;
	builderIdentity: string;
	verdict: "accept" | "revise";
}

export interface InventoryInput {
	discovered: ValidationIdentity[];
	ledgerIds: string[];
	laneMembers: Record<string, string[]>;
	allowedLaneIds: LaneId[];
	previousIds?: string[];
	deletedLineage?: ReviewedLineage[];
}

export interface Reconciliation {
	terminal: Record<string, Observation["outcome"] | "unrun">;
	attempts: Record<string, { firstFailure?: Observation; final?: Observation }>;
	complete: boolean;
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function canonicalizeClosedJson(value: unknown): string {
	const ancestors = new Set<object>();
	const encode = (current: unknown): string => {
		if (current === null || typeof current === "boolean" || typeof current === "string") {
			return JSON.stringify(current);
		}
		if (typeof current === "number") {
			if (!Number.isFinite(current)) throw new Error("closed JSON rejects non-finite numbers");
			return JSON.stringify(current);
		}
		if (typeof current !== "object") {
			throw new Error(`closed JSON rejects unsupported ${typeof current}`);
		}
		if (ancestors.has(current)) throw new Error("closed JSON rejects cyclic objects");
		ancestors.add(current);
		try {
			if (Array.isArray(current)) return `[${current.map(encode).join(",")}]`;
			const prototype = Object.getPrototypeOf(current);
			if (prototype !== Object.prototype && prototype !== null) {
				throw new Error("closed JSON rejects unsupported object types");
			}
			const record = current as Record<string, unknown>;
			return `{${Object.keys(record)
				.sort()
				.map((key) => `${JSON.stringify(key)}:${encode(record[key])}`)
				.join(",")}}`;
		} finally {
			ancestors.delete(current);
		}
	};
	return encode(value);
}

function unique(values: string[], label: string): Set<string> {
	const result = new Set<string>();
	for (const value of values) {
		if (result.has(value)) throw new Error(`duplicate ${label}: ${value}`);
		result.add(value);
	}
	return result;
}

function parseTimestamp(value: string, label: string): number {
	if (!rfc3339.test(value)) throw new Error(`invalid ${label} RFC3339 timestamp: ${value}`);
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) throw new Error(`invalid ${label} timestamp: ${value}`);
	return parsed;
}

function assertLineageReview(lineage: ReviewedLineage, reviewVerifier: ReviewVerifier): void {
	if (!lineage.action) throw new Error("lineage action is required");
	if (lineage.action === "retain")
		throw new Error("retain action cannot describe a deleted identity");
	if (!lineage.capability) throw new Error("lineage capability is required");
	if (!lineage.contractRef) throw new Error("lineage contract is required");
	if (!lineage.replacementIds.length) throw new Error("lineage replacement is required");
	if (!lineage.reviewArtifact) throw new Error("lineage review artifact is required");
	if (!lineage.reviewArtifactHash) throw new Error("lineage artifact hash is required");
	if (!lineage.reviewedPayloadHash) throw new Error("lineage payload hash is required");
	if (!lineage.reviewerIdentity || lineage.reviewerIdentity === lineage.builderIdentity) {
		throw new Error("lineage requires an independent reviewer");
	}
	if (
		posix.isAbsolute(lineage.reviewArtifact) ||
		lineage.reviewArtifact.split("/").includes("..")
	) {
		throw new Error("lineage review artifact path traversal is outside accepted root");
	}
	const expectedPayload = {
		action: lineage.action,
		capability: lineage.capability,
		contractRef: lineage.contractRef,
		oldId: lineage.oldId,
		replacementIds: lineage.replacementIds,
	};
	const canonical = canonicalizeClosedJson(lineage.lineagePayload);
	if (
		canonical !== canonicalizeClosedJson(expectedPayload) ||
		canonical !== lineage.canonicalLineage ||
		digest(canonical) !== lineage.reviewedPayloadHash
	) {
		throw new Error("lineage canonical payload hash mismatch or tampering");
	}
	const claim: ReviewClaim = {
		artifactPath: lineage.reviewArtifact,
		artifactHash: lineage.reviewArtifactHash,
		payloadHash: lineage.reviewedPayloadHash,
		verdict: lineage.verdict,
		reviewerIdentity: lineage.reviewerIdentity,
		builderIdentity: lineage.builderIdentity,
	};
	reviewVerifier.verify(claim, canonical);
}

function assertExactSets(input: InventoryInput): Set<string> {
	const discoveredIds = unique(
		input.discovered.map(({ id }) => id),
		"discovered identity",
	);
	const ledgerIds = unique(input.ledgerIds, "ledger identity");
	for (const id of discoveredIds) {
		if (!ledgerIds.has(id)) throw new Error(`ledger missing discovered identity: ${id}`);
	}
	for (const id of ledgerIds) {
		if (!discoveredIds.has(id)) throw new Error(`ledger contains unknown identity: ${id}`);
	}
	return discoveredIds;
}

function assertLaneOwnership(input: InventoryInput, discoveredIds: Set<string>): void {
	const allowedLanes = new Set(input.allowedLaneIds);
	const owners = new Map<string, string>();
	for (const [lane, members] of Object.entries(input.laneMembers)) {
		if (!allowedLanes.has(lane as LaneId)) throw new Error(`unknown lane: ${lane}`);
		for (const id of unique(members, `lane ${lane} member`)) {
			if (!discoveredIds.has(id)) throw new Error(`lane contains unknown identity: ${id}`);
			if (owners.has(id)) throw new Error(`lane ownership overlaps for identity: ${id}`);
			owners.set(id, lane);
		}
	}
	for (const identity of input.discovered) {
		const owner = owners.get(identity.id);
		if (!owner) throw new Error(`lane missing identity: ${identity.id}`);
		if (owner !== identity.lane) {
			throw new Error(`lane mismatch for ${identity.id}: ${identity.lane} != ${owner}`);
		}
	}
}

function assertDeletedLineage(
	input: InventoryInput,
	discoveredIds: Set<string>,
	reviewVerifier: ReviewVerifier,
): void {
	const previousIds = unique(input.previousIds ?? [], "previous identity");
	const lineageByOld = new Map<string, ReviewedLineage>();
	const claimedReplacements = new Set<string>();
	for (const lineage of input.deletedLineage ?? []) {
		if (lineageByOld.has(lineage.oldId)) throw new Error(`duplicate lineage: ${lineage.oldId}`);
		if (!previousIds.has(lineage.oldId)) {
			throw new Error(`unknown old previous identity: ${lineage.oldId}`);
		}
		if (discoveredIds.has(lineage.oldId)) {
			throw new Error(`lineage old identity is still discovered/current: ${lineage.oldId}`);
		}
		lineageByOld.set(lineage.oldId, lineage);
		for (const replacement of lineage.replacementIds) {
			if (!discoveredIds.has(replacement)) throw new Error(`replacement unknown: ${replacement}`);
			if (claimedReplacements.has(replacement)) {
				throw new Error(`replacement claimed more than once: ${replacement}`);
			}
			claimedReplacements.add(replacement);
		}
	}
	for (const lineage of lineageByOld.values()) {
		assertLineageReview(lineage, reviewVerifier);
	}
	for (const oldId of previousIds) {
		if (!(discoveredIds.has(oldId) || lineageByOld.has(oldId))) {
			throw new Error(`lineage missing for deleted identity: ${oldId}`);
		}
	}
}

function buildValidationInventory(
	input: InventoryInput,
	reviewVerifier: ReviewVerifier,
): ValidationIdentity[] {
	const discoveredIds = assertExactSets(input);
	assertLaneOwnership(input, discoveredIds);
	assertDeletedLineage(input, discoveredIds, reviewVerifier);
	return [...input.discovered].sort((left, right) => left.id.localeCompare(right.id));
}

function selectRun(
	starts: AttemptStarted[],
	observations: Observation[],
	targetRunId?: string,
): string | undefined {
	const runIds = new Set([
		...starts.map(({ runId }) => runId),
		...observations.map(({ runId }) => runId),
	]);
	if (targetRunId) {
		for (const runId of runIds) {
			if (runId !== targetRunId) throw new Error(`run mismatch outside target run ${targetRunId}`);
		}
		return targetRunId;
	}
	if (runIds.size > 1) throw new Error("mixed run IDs require an explicit target run");
	return runIds.values().next().value;
}

function assertAttemptSequence(starts: AttemptStarted[], observations: Observation[]): void {
	const terminalByAttempt = new Map(
		observations
			.filter(({ attemptId }) => Boolean(attemptId))
			.map((observation) => [`${observation.id}\0${observation.attemptId}`, observation]),
	);
	const priorByIdentity = new Map<string, AttemptStarted>();
	for (const start of starts) {
		const prior = priorByIdentity.get(start.id);
		if (prior) {
			const priorStarted = parseTimestamp(prior.startedAt, "start");
			const nextStarted = parseTimestamp(start.startedAt, "start");
			if (nextStarted <= priorStarted) {
				throw new Error(`attempt order/sequence invalid: ${start.id}`);
			}
			const priorTerminal = terminalByAttempt.get(`${prior.id}\0${prior.attemptId}`);
			if (priorTerminal && parseTimestamp(priorTerminal.endedAt, "endedAt") > nextStarted) {
				throw new Error(`terminal overlaps next start sequence: ${start.id}`);
			}
		}
		priorByIdentity.set(start.id, start);
	}
}

function indexStarts(
	ids: Set<string>,
	starts: AttemptStarted[],
): {
	byId: Map<string, AttemptStarted[]>;
	byAttempt: Map<string, AttemptStarted>;
} {
	const byId = new Map<string, AttemptStarted[]>();
	const byAttempt = new Map<string, AttemptStarted>();
	for (const start of starts) {
		if (!ids.has(start.id)) throw new Error(`unknown start identity: ${start.id}`);
		parseTimestamp(start.startedAt, "start");
		const attemptIdentity = `${start.id}\0${start.attemptId}`;
		if (byAttempt.has(attemptIdentity)) {
			throw new Error(`duplicate start attempt tuple: ${start.id}/${start.attemptId}`);
		}
		byAttempt.set(attemptIdentity, start);
		const list = byId.get(start.id) ?? [];
		list.push(start);
		byId.set(start.id, list);
	}
	return { byId, byAttempt };
}

function validateObservationEvidence(
	observation: Observation,
	start: AttemptStarted,
	deadlineMs: number | undefined,
): void {
	const startMs = parseTimestamp(start.startedAt, "start");
	const endMs = parseTimestamp(observation.endedAt, "endedAt");
	if (observation.startedAt !== start.startedAt) {
		throw new Error(`startedAt does not match start time: ${observation.attemptId}`);
	}
	if (
		observation.durationMs === undefined ||
		!Number.isFinite(observation.durationMs) ||
		observation.durationMs < 0
	) {
		throw new Error(`duration evidence invalid: ${observation.id}`);
	}
	if (endMs < startMs) throw new Error(`end timestamp before start: ${observation.id}`);
	if (observation.durationMs !== endMs - startMs) {
		throw new Error(`duration timestamp mismatch: ${observation.id}`);
	}
	if (
		(observation.outcome === "failed" || observation.outcome === "timed_out") &&
		!observation.errorFingerprint
	) {
		throw new Error(`error fingerprint missing for ${observation.outcome}: ${observation.id}`);
	}
	if (observation.outcome === "timed_out") {
		if (deadlineMs === undefined) throw new Error("timed_out requires configured deadline");
		if (endMs < deadlineMs) throw new Error("timed_out occurred before deadline");
	}
}

function indexBlockedObservation(
	observation: Observation,
	blockedById: Map<string, Observation>,
): void {
	if (observation.attemptId) {
		throw new Error(`blocked observation cannot name attempt: ${observation.id}`);
	}
	if (!observation.prerequisite) {
		throw new Error(`blocked prerequisite missing: ${observation.id}`);
	}
	if (blockedById.has(observation.id)) {
		throw new Error(`duplicate terminal blocked: ${observation.id}`);
	}
	blockedById.set(observation.id, observation);
}

function indexAttemptObservation(
	observation: Observation,
	starts: AttemptStarted[],
	startsByAttempt: Map<string, AttemptStarted>,
	byAttempt: Map<string, Observation>,
	deadlineMs: number | undefined,
): void {
	if (!observation.attemptId) {
		throw new Error(`${observation.outcome} requires a matching start attempt`);
	}
	const key = `${observation.id}\0${observation.attemptId}`;
	const matchingStart = startsByAttempt.get(key);
	if (!matchingStart) {
		const sameAttempt = starts.find(
			(candidate) =>
				candidate.id === observation.id && candidate.attemptId === observation.attemptId,
		);
		if (sameAttempt) throw new Error(`run mismatch for attempt: ${observation.attemptId}`);
		throw new Error(
			`${observation.outcome} attempt undeclared or without start: ${observation.attemptId}`,
		);
	}
	if (matchingStart.runId !== observation.runId) {
		throw new Error(`run mismatch for attempt: ${observation.attemptId}`);
	}
	if (byAttempt.has(key)) {
		const prior = byAttempt.get(key);
		throw new Error(
			prior?.outcome === observation.outcome
				? `duplicate terminal: ${observation.id}`
				: `conflicting terminal: ${observation.id}`,
		);
	}
	validateObservationEvidence(observation, matchingStart, deadlineMs);
	byAttempt.set(key, observation);
}

function indexObservations(
	ids: Set<string>,
	starts: AttemptStarted[],
	startsByAttempt: Map<string, AttemptStarted>,
	observations: Observation[],
	deadlineMs: number | undefined,
): {
	byAttempt: Map<string, Observation>;
	blockedById: Map<string, Observation>;
} {
	const byAttempt = new Map<string, Observation>();
	const blockedById = new Map<string, Observation>();
	for (const observation of observations) {
		if (!ids.has(observation.id))
			throw new Error(`unknown observation identity: ${observation.id}`);
		parseTimestamp(observation.endedAt, "endedAt");
		if (!observation.artifacts.length)
			throw new Error(`artifact evidence missing: ${observation.id}`);
		if (observation.outcome === "blocked") {
			indexBlockedObservation(observation, blockedById);
			continue;
		}
		indexAttemptObservation(observation, starts, startsByAttempt, byAttempt, deadlineMs);
	}
	return { byAttempt, blockedById };
}

function reconcileIdentity(
	identity: ValidationIdentity,
	starts: AttemptStarted[],
	observations: Map<string, Observation>,
	blocked: Observation | undefined,
): { outcome: Observation["outcome"] | "unrun"; attempts: Reconciliation["attempts"][string] } {
	if (blocked) {
		if (starts.length) throw new Error(`retry/start after blocked terminal: ${identity.id}`);
		return { outcome: "blocked", attempts: { final: blocked } };
	}
	let firstFailure: Observation | undefined;
	let final: Observation | undefined;
	for (const start of starts) {
		const observation = observations.get(`${start.id}\0${start.attemptId}`);
		if (!observation) {
			return {
				outcome: "unrun",
				attempts: firstFailure ? { firstFailure } : {},
			};
		}
		if (final?.outcome === "passed") throw new Error(`retry after passed terminal: ${identity.id}`);
		if (observation?.outcome === "failed" && !firstFailure) firstFailure = observation;
		final = observation;
	}
	const result: Reconciliation["attempts"][string] = {};
	if (firstFailure) result.firstFailure = firstFailure;
	if (final) result.final = final;
	return { outcome: final?.outcome ?? "unrun", attempts: result };
}

export function reconcileValidationRun(
	inventory: ValidationIdentity[],
	starts: AttemptStarted[],
	observations: Observation[],
	options?: { deadlineAt?: string; targetRunId?: string },
): Reconciliation {
	selectRun(starts, observations, options?.targetRunId);
	for (const observation of observations) {
		if (observation.outcome !== "passed") continue;
		const passedStart = starts.find(
			({ id, attemptId }) => id === observation.id && attemptId === observation.attemptId,
		);
		const hasRetry =
			passedStart &&
			starts.some(
				(candidate) =>
					candidate.id === observation.id &&
					candidate.attemptId !== passedStart.attemptId &&
					Date.parse(candidate.startedAt) >= Date.parse(passedStart.startedAt),
			);
		if (hasRetry) {
			throw new Error(`retry after passed terminal: ${observation.id}`);
		}
	}
	const deadlineMs = options?.deadlineAt
		? parseTimestamp(options.deadlineAt, "deadline")
		: undefined;
	const ids = unique(
		inventory.map(({ id }) => id),
		"inventory identity",
	);
	const indexedStarts = indexStarts(ids, starts);
	assertAttemptSequence(starts, observations);
	const indexedObservations = indexObservations(
		ids,
		starts,
		indexedStarts.byAttempt,
		observations,
		deadlineMs,
	);
	const terminal: Reconciliation["terminal"] = {};
	const attempts: Reconciliation["attempts"] = {};
	for (const identity of inventory) {
		const result = reconcileIdentity(
			identity,
			indexedStarts.byId.get(identity.id) ?? [],
			indexedObservations.byAttempt,
			indexedObservations.blockedById.get(identity.id),
		);
		terminal[identity.id] = result.outcome;
		attempts[identity.id] = result.attempts;
	}
	return {
		terminal,
		attempts,
		complete: Object.values(terminal).every((outcome) => outcome !== "unrun"),
	};
}

export interface PayloadUnlockRequest {
	payload: unknown;
	claim: ReviewClaim;
}

export interface ReviewedLineageRequest {
	lineagePayload: unknown;
	claim: ReviewClaim;
}

export interface ValidationContracts {
	unlockPayload(request: PayloadUnlockRequest): void;
	verifyLineage(request: ReviewedLineageRequest): void;
	buildValidationInventory(input: InventoryInput): ValidationIdentity[];
	reconcileRun: typeof reconcileValidationRun;
}

export function createValidationContracts(input: {
	reviewVerifier: ReviewVerifier;
}): ValidationContracts {
	const verify = (payload: unknown, claim: ReviewClaim): void => {
		try {
			input.reviewVerifier.verify(claim, canonicalizeClosedJson(payload));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`payload hash/review verification failed: ${message}`);
		}
	};
	return {
		unlockPayload: ({ payload, claim }) => verify(payload, claim),
		verifyLineage: ({ lineagePayload, claim }) => verify(lineagePayload, claim),
		buildValidationInventory: (inventory) =>
			buildValidationInventory(inventory, input.reviewVerifier),
		reconcileRun: reconcileValidationRun,
	};
}
