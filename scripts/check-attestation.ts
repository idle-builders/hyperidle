#!/usr/bin/env tsx
// CI-side attestation checker. Validates that `npm run verify` passed locally
// for the code in this PR. Uses HMAC-SHA256 with a shared secret (VERIFY_SECRET)
// to prevent forgery.
//
// Attestation files are stored per-commit in .verify-attestations/<sha>.json
// to avoid merge conflicts between concurrent branches.

import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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

function main(): void {
	const secret = process.env.VERIFY_SECRET;
	if (!secret) {
		fail("VERIFY_SECRET env var not set — add it as a GitHub Actions secret");
	}

	const sha = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();

	// Look for per-SHA attestation file
	const perShaPath = resolve(process.cwd(), join(ATTESTATION_DIR, `${sha}.json`));

	// Fall back to legacy single-file format for backward compat
	const legacyPath = resolve(process.cwd(), ".verify-attestation.json");

	let raw: string;
	if (existsSync(perShaPath)) {
		raw = readFileSync(perShaPath, "utf-8");
	} else if (existsSync(legacyPath)) {
		raw = readFileSync(legacyPath, "utf-8");
	} else {
		fail(
			`no attestation found for ${sha.slice(0, 12)} — run \`npm run verify\`, then commit the attestation`,
		);
	}

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
