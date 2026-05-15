#!/usr/bin/env bun
// @lore: CI-side attestation checker. Validates that `bun run verify` passed
// locally for the code in this PR. Uses HMAC-SHA256 with a shared secret
// (VERIFY_SECRET) to prevent forgery — the secret lives outside the repo
// (~/.config/hyperidle/verify-secret locally, GitHub Actions secret in CI).
// An AI agent CAN find the secret, but computing the HMAC is more work than
// just running `bun run verify`, which is the design intent.

import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ATTESTATION_FILE = ".verify-attestation.json";

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

	let raw: string;
	try {
		raw = readFileSync(resolve(process.cwd(), ATTESTATION_FILE), "utf-8");
	} catch {
		fail(
			`${ATTESTATION_FILE} not found — run \`bun run verify\` locally, then commit the attestation`,
		);
	}

	let attestation: Attestation;
	try {
		attestation = JSON.parse(raw) as Attestation;
	} catch {
		fail(`${ATTESTATION_FILE} is not valid JSON`);
	}

	const { hmac, ...payload } = attestation;
	const expected = createHmac("sha256", secret)
		.update(JSON.stringify(payload))
		.digest("hex");

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
		.filter((f) => f && f !== ATTESTATION_FILE);

	if (sneakedFiles.length > 0) {
		fail(
			`source files changed after verify ran:\n  ${sneakedFiles.join("\n  ")}\nRe-run \`bun run verify\` and commit the new attestation`,
		);
	}

	process.stdout.write(
		`check-attestation: verified (${attestation.tools.join(", ")}) at ${attestation.timestamp}\n`,
	);
}

main();
