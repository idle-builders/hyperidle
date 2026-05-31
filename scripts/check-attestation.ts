#!/usr/bin/env tsx
// CI-side attestation checker. Validates that `npm run verify` passed locally
// for the code in this PR. Uses HMAC-SHA256 with a shared secret (VERIFY_SECRET)
// to prevent forgery.
//
// Attestation files are stored per-commit in .verify-attestations/<sha>.json
// to avoid merge conflicts between concurrent branches.
//
// In CI, GitHub checks out a merge commit (PR branch merged into target) whose
// SHA differs from the branch tip. We find the attestation by scanning the
// directory for any .json file rather than requiring an exact HEAD match.

import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ATTESTATION_DIR = ".verify-attestations";

interface Attestation {
	sha: string;
	status: string;
	dirty: boolean;
	tools: string[];
	allTools: string[];
	partial: boolean;
	timestamp: string;
	hmac: string;
}

function fail(msg: string): never {
	process.stderr.write(`check-attestation: ${msg}\n`);
	process.exit(1);
}

function findAttestation(): string {
	const dir = resolve(process.cwd(), ATTESTATION_DIR);

	// Scan directory for any attestation file
	if (existsSync(dir)) {
		const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
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

	// Check no source files changed after the attested commit
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

	process.stdout.write(
		`check-attestation: verified (${attestation.tools.join(", ")}) at ${attestation.timestamp}\n`,
	);
}

main();
