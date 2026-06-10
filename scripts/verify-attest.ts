#!/usr/bin/env tsx
/**
 * Runs the ATTESTED tools (the slow ones CI does not re-run) and writes a
 * SIGNED attestation recording their REAL pass/fail result.
 *
 * @lore Z8-166: The previous version hardcoded `status: "passed"` and signed it
 * blindly — its only tie to reality was sitting last in the `npm run verify`
 * `&&` chain, so it ran only if the earlier tools exited 0. That coupling was
 * trivially severable: running `tsx scripts/verify-attest.ts` directly (or
 * re-stamping an attestation after editing the tree) minted a green attestation
 * for a red tree, and CI — which validates only the HMAC signature, not the
 * gate — trusted it. AF2 shipped design-system/desktop/eval type-red exactly
 * this way. The fix has two halves:
 *   1. CI now re-runs EVERY fast check live (check, lint, knip, mock-inventory,
 *      build, desktop build) — see .github/workflows/ci.yml — so those can
 *      never be bypassed and are not attested at all.
 *   2. This script RUNS the attested tools itself and DERIVES `status` from
 *      their exit code, so a "passed" attestation cannot exist unless the tools
 *      actually passed. No code path in this repo signs an unearned pass.
 */
import { execSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const ATTESTATION_DIR = ".verify-attestations";
const SECRET_DIR = join(homedir(), ".config", "hyperidle");
const SECRET_PATH = join(SECRET_DIR, "verify-secret");

/**
 * The slow tools CI does NOT re-run live, trusted via this attestation.
 * `ATTESTED_COMMAND`'s exit code is the single source of truth for `status`.
 * Every other (fast) tool runs live in CI and is intentionally absent here.
 */
const ATTESTED_TOOLS = ["test", "test:integration"];
const ATTESTED_COMMAND = "npm run test:all";

function getOrCreateSecret(): string {
	if (existsSync(SECRET_PATH)) {
		return readFileSync(SECRET_PATH, "utf-8").trim();
	}
	mkdirSync(SECRET_DIR, { recursive: true });
	const secret = randomBytes(32).toString("hex");
	writeFileSync(SECRET_PATH, secret + "\n", { mode: 0o600 });
	process.stderr.write(`verify-attest: created signing key at ${SECRET_PATH}\n`);
	process.stderr.write(
		"verify-attest: add it to GitHub → gh secret set VERIFY_SECRET < " + SECRET_PATH + "\n",
	);
	return secret;
}

function main(): void {
	const secret = getOrCreateSecret();

	// Capture identity + cleanliness BEFORE running tests so that gitignored
	// test artifacts (coverage, tmp DBs) cannot flip the `dirty` flag.
	const sha = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
	const dirty =
		execSync("git status --porcelain", { encoding: "utf-8" }).trim().length > 0;

	// Run the attested tools and derive status from the REAL exit code.
	process.stderr.write(`verify-attest: running attested tools (${ATTESTED_COMMAND})...\n`);
	let status: "passed" | "failed" = "passed";
	try {
		execSync(ATTESTED_COMMAND, { stdio: "inherit" });
	} catch {
		status = "failed";
	}

	const payload = {
		sha,
		status,
		dirty,
		tools: ATTESTED_TOOLS,
		allTools: ATTESTED_TOOLS,
		partial: false,
		smartSkipped: [] as string[],
		timestamp: new Date().toISOString(),
	};

	const hmac = createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");

	const dir = resolve(process.cwd(), ATTESTATION_DIR);
	mkdirSync(dir, { recursive: true });

	for (const file of readdirSync(dir)) {
		if (file.endsWith(".json") && file !== `${sha}.json`) {
			try {
				unlinkSync(join(dir, file));
			} catch {}
		}
	}

	const filePath = join(dir, `${sha}.json`);
	writeFileSync(filePath, JSON.stringify({ ...payload, hmac }, null, "\t") + "\n");
	process.stderr.write(
		`verify-attest: attestation (status=${status}) → ${ATTESTATION_DIR}/${sha}.json\n`,
	);

	if (dirty) {
		process.stderr.write(
			"verify-attest: WARNING — working tree is dirty; commit all changes, then re-run for CI\n",
		);
	}

	// A failed test run must fail `npm run verify` AND leave a status=failed
	// attestation that CI will reject — never a silent pass.
	if (status === "failed") {
		process.stderr.write(
			"verify-attest: attested tools FAILED — attestation records status=failed\n",
		);
		process.exit(1);
	}
}

main();
