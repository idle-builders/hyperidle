#!/usr/bin/env tsx
// CI-side attestation checker. Validates that the ATTESTED tools (the slow
// test suite — see scripts/verify-attest.ts) passed locally for the exact
// source in this PR. Uses HMAC-SHA256 with a shared secret (VERIFY_SECRET) to
// prevent forgery. All FAST checks (typecheck gate, lint, knip, mock-inventory,
// build) are re-run live in .github/workflows/ci.yml and are NOT attested.
//
// The `sneaked source files` guard below is load-bearing: it rejects any
// attestation whose tree differs from the commit CI is testing, so the attested
// test result always corresponds to the source the live fast checks run
// against. verify-attest derives `status` from the real test exit code, so
// status==passed here means the tests actually passed.
//
// Attestation files are stored per-commit in .verify-attestations/<sha>.json
// to avoid merge conflicts between concurrent branches.
//
// In CI, GitHub checks out a merge commit (PR branch merged into target) whose
// SHA differs from the branch tip. We find the attestation by scanning the
// directory for any .json file rather than requiring an exact HEAD match.

import { execSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assertAgenticFloor, assertPerHarnessFloor } from "./lib/attestation-floor.js";
import { SUPPORTED_HARNESSES } from "./lib/honest-harness-predicate.js";

const ATTESTATION_DIR = ".verify-attestations";

/**
 * Deterministic fingerprint of all tracked source — every file's blob hash and
 * path from `git ls-tree -r HEAD`, EXCLUDING the attestation artifacts
 * themselves. Two trees with identical source produce the same fingerprint
 * regardless of commit identity (survives squash-merge) and regardless of which
 * attestation file is committed (the artifacts are filtered out, so committing
 * the attestation cannot change its own expected value).
 *
 * @lore Z8-166: a raw `HEAD^{tree}` hash does NOT work here — committing the
 * attestation file into the tree changes the tree hash, so the value recorded
 * before that commit never matches the final tree. Filtering the attestation
 * paths out of the listing is what makes the fingerprint self-consistent.
 */
function sourceHash(): string {
	const listing = execSync("git ls-tree -r HEAD", { encoding: "utf-8" })
		.split("\n")
		.filter(
			(l) =>
				l &&
				!l.includes(`\t${ATTESTATION_DIR}/`) &&
				!l.includes("\t.verify-attestation.json"),
		)
		.sort()
		.join("\n");
	return createHash("sha256").update(listing).digest("hex");
}

interface Attestation {
	sha: string;
	/** Fingerprint of tracked source (excl. attestation artifacts) the attested
	 * run executed against. Robust to squash-merge AND to committing the
	 * attestation file itself. See sourceHash(). */
	srcHash?: string;
	status: string;
	dirty: boolean;
	tools: string[];
	allTools: string[];
	partial: boolean;
	smartSkipped: string[];
	/** AR1 agentic floor: assertions executed (passed|failed) across harness-facing
	 * integration files. Optional for legacy attestations minted before AR1 ⇒ the
	 * floor is skipped (back-compat, matches the srcHash? precedent). */
	agenticExecuted?: number;
	/** AR1 agentic floor: assertions skipped (skipped|pending|todo) across harness-facing
	 * integration files. Optional for legacy back-compat. */
	agenticSkipped?: number;
	/** AR2: per-harness executed/skipped counts keyed by [harness:X] describe tag.
	 * Optional for legacy attestations minted before AR2 ⇒ the per-harness floor is
	 * skipped (back-compat, mirrors the srcHash?/agenticExecuted? optional pattern).
	 * A fresh verify-attest run ALWAYS populates this with all four supported-harness keys. */
	agenticExecutedByHarness?: Record<string, { executed: number; skipped: number }>;
	timestamp: string;
	hmac: string;
}

function fail(msg: string): never {
	process.stderr.write(`check-attestation: ${msg}\n`);
	process.exit(1);
}

function isReachable(sha: string): boolean {
	try {
		execSync(`git cat-file -t ${sha}`, { encoding: "utf-8", stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

function findAttestation(): string {
	const dir = resolve(process.cwd(), ATTESTATION_DIR);

	if (existsSync(dir)) {
		const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
		// When multiple attestation files exist (e.g. from merging main),
		// pick the one whose SHA is reachable in the current git history.
		for (const f of files) {
			const sha = f.replace(".json", "");
			if (isReachable(sha)) {
				return readFileSync(join(dir, f), "utf-8");
			}
		}
		if (files.length > 0) {
			return readFileSync(join(dir, files[0]), "utf-8");
		}
	}

	// Fall back to legacy single-file format
	const legacyPath = resolve(process.cwd(), ".verify-attestation.json");
	if (existsSync(legacyPath)) {
		return readFileSync(legacyPath, "utf-8");
	}

	fail(
		`no attestation found in ${ATTESTATION_DIR}/ — run \`npm run verify\`, then commit the attestation`,
	);
}

function main(): void {
	const secret = process.env.VERIFY_SECRET;
	if (!secret) {
		fail("VERIFY_SECRET env var not set — add it as a GitHub Actions secret");
	}

	const raw = findAttestation();

	let attestation: Attestation;
	try {
		attestation = JSON.parse(raw) as Attestation;
	} catch {
		fail("attestation file is not valid JSON");
	}

	const { hmac, ...payload } = attestation;
	const expected = createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");

	if (hmac !== expected) {
		fail("HMAC signature invalid — attestation may be forged or secret mismatch");
	}

	if (attestation.status !== "passed") {
		fail(`verify status was "${attestation.status}", not "passed"`);
	}

	if (attestation.partial) {
		fail(
			`partial verify (${attestation.tools.join(", ")}) — full verify required (${attestation.allTools.join(", ")})`,
		);
	}

	if (attestation.dirty) {
		fail("verify ran with uncommitted changes — commit all changes, then re-run verify");
	}

	// AR1 agentic floor: a green cannot be minted while EVERY harness-facing
	// integration test skipped. Optional fields ⇒ legacy attestations validate (the
	// floor returns null on undefined/undefined). New attestations always carry both.
	const floorViolation = assertAgenticFloor({
		agenticExecuted: attestation.agenticExecuted,
		agenticSkipped: attestation.agenticSkipped,
	});
	if (floorViolation) {
		fail(floorViolation);
	}

	// AR2 per-harness floor: every supported harness must have at least one executed
	// agentic assertion. Optional field ⇒ legacy attestations validate (back-compat).
	// A fresh verify-attest run always populates all four keys; the floor returns null
	// on undefined (the only way the floor can be skipped is a pre-AR2 attestation).
	const perHarnessViolation = assertPerHarnessFloor(
		attestation.agenticExecutedByHarness,
		SUPPORTED_HARNESSES,
	);
	if (perHarnessViolation) {
		fail(perHarnessViolation);
	}

	// Source-integrity: the attested tests must correspond to the source CI is
	// checking. Match on a fingerprint of the source (excluding attestation
	// artifacts) — robust to squash-merge (commit identity changes, source does
	// not) and to committing the attestation file itself.
	//
	// @lore Z8-166: this replaced `git diff <sha>..HEAD`, which crashed every
	// squash-merged push-to-main run ("Invalid revision range") because the
	// branch commit is unreachable after squash. A legacy attestation without
	// `srcHash` falls back to the reachable-commit diff for backward compat.
	const headSrc = sourceHash();

	if (attestation.srcHash) {
		if (attestation.srcHash !== headSrc) {
			fail(
				"tracked source differs from the attested run — re-run `npm run verify` " +
					"and commit the new attestation",
			);
		}
		// srcHash matches — source identical, attested tests are valid.
	} else if (isReachable(attestation.sha)) {
		// Legacy attestation (no srcHash): fall back to the commit diff.
		const changedFiles = execSync(`git diff --name-only ${attestation.sha}..HEAD`, {
			encoding: "utf-8",
		}).trim();
		const sneakedFiles = changedFiles
			.split("\n")
			.filter((f) => f && !f.startsWith(ATTESTATION_DIR) && f !== ".verify-attestation.json");

		if (sneakedFiles.length > 0) {
			fail(
				`source files changed after verify ran:\n  ${sneakedFiles.join("\n  ")}\nRe-run \`npm run verify\` and commit the new attestation`,
			);
		}
	} else {
		fail(
			`attested commit ${attestation.sha.slice(0, 8)} is unreachable and the attestation ` +
				"has no srcHash. Re-run `npm run verify` on this commit and commit the attestation.",
		);
	}

	const smartNote =
		attestation.smartSkipped?.length > 0
			? `, smart-skipped: ${attestation.smartSkipped.join(", ")}`
			: "";
	process.stdout.write(
		`check-attestation: verified (${attestation.tools.join(", ")}${smartNote}) at ${attestation.timestamp}\n`,
	);
}

main();
