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
import { createHash, createHmac, randomBytes } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { extractAgenticCounts } from "./lib/attestation-floor.js";
import {
	isHarnessFacingIntegration,
} from "./honest-harness-guard.js";

/**
 * Path for the integration test JSON reporter output.
 * Written OUTSIDE the repo tree (os.tmpdir()) so git status --porcelain cannot
 * see it and the dirty flag cannot flip during verify-attest.
 * @lore AR1: Must be outside the repo tree — .gitignore files inside the tree
 * can still be detected by `git status --porcelain` and flip `dirty`. os.tmpdir()
 * is categorically invisible to git.
 */
const INTEGRATION_RESULTS_PATH = join(tmpdir(), "hyperidle-integration-results.json");

const ATTESTATION_DIR = ".verify-attestations";

/**
 * Deterministic fingerprint of tracked source, EXCLUDING attestation artifacts.
 * MUST stay byte-identical to `sourceHash()` in scripts/check-attestation.ts —
 * the two are compared. Survives squash-merge and committing the attestation.
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

const SECRET_DIR = join(homedir(), ".config", "hyperidle");
const SECRET_PATH = join(SECRET_DIR, "verify-secret");

/**
 * The slow tools CI does NOT re-run live, trusted via this attestation.
 * `ATTESTED_COMMAND`'s exit code is the single source of truth for `status`.
 * Every other (fast) tool runs live in CI and is intentionally absent here.
 */
const ATTESTED_TOOLS = ["test", "test:integration"];

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
	// Source fingerprint (excl. attestation artifacts) — check-attestation
	// matches on this; survives squash-merge and committing the attestation.
	const srcHash = sourceHash();
	const dirty =
		execSync("git status --porcelain", { encoding: "utf-8" }).trim().length > 0;

	// Run the attested tools and derive status from the REAL exit code.
	// Two legs: unit tests (exit code only) + integration tests (with json reporter for floor).
	// The integration leg runs via explicit vitest command — NOT npm run test:integration —
	// so verify-attest controls the reporter+outputFile without mutating the shared script.
	// @lore AR1: single run, no double cost — same suite, json is a side effect.
	process.stderr.write(`verify-attest: running attested tools (${ATTESTED_TOOLS.join(", ")})...\n`);
	let status: "passed" | "failed" = "passed";
	try {
		// Unit + component leg — exit code only (unchanged behavior).
		process.stderr.write("verify-attest: [1/2] npm run test (unit + component)...\n");
		execSync("npm run test", { stdio: "inherit" });
		// Integration leg — same suite as npm run test:integration, PLUS json to os.tmpdir().
		process.stderr.write("verify-attest: [2/2] vitest integration (with json reporter)...\n");
		execSync(
			`npx vitest run --config vitest.integration.config.ts` +
			` --reporter=dot --reporter=json --outputFile=${INTEGRATION_RESULTS_PATH}`,
			{ stdio: "inherit" },
		);
	} catch {
		status = "failed";
	}

	// Fail-closed: if the json results file is absent after the run (e.g. integration
	// leg crashed before the reporter flushed), refuse to mint a green attestation.
	// C1.d: a green cannot be minted without the agentic counts.
	if (!existsSync(INTEGRATION_RESULTS_PATH)) {
		process.stderr.write(
			"verify-attest: integration results json missing — cannot attest the agentic floor. " +
			"The integration leg may have crashed before the reporter flushed. " +
			"Fix the integration tests and re-run verify.\n",
		);
		process.exit(1);
	}

	// Extract agentic counts from the vitest json results.
	// isHarnessFacingIntegration is single-sourced with the guard (W3/W5).
	let agenticExecuted = 0;
	let agenticSkipped = 0;
	try {
		const raw = readFileSync(INTEGRATION_RESULTS_PATH, "utf-8");
		const results = JSON.parse(raw) as { testResults: Array<{ name: string; assertionResults: Array<{ status: string }> }> };
		// Build predicate: file must match *.integration.test.ts AND import a harness seam.
		// We pre-read sources for the predicate (which needs the source for import detection).
		const counts = extractAgenticCounts(
			results as Parameters<typeof extractAgenticCounts>[0],
			(filePath: string) => {
				if (!filePath.endsWith(".integration.test.ts") && !filePath.endsWith(".integration.test.tsx")) {
					return false;
				}
				try {
					const source = readFileSync(filePath, "utf-8");
					return isHarnessFacingIntegration(filePath, source);
				} catch {
					return false;
				}
			},
		);
		agenticExecuted = counts.agenticExecuted;
		agenticSkipped = counts.agenticSkipped;
	} catch (err) {
		process.stderr.write(
			`verify-attest: failed to parse integration results json: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exit(1);
	}

	const payload = {
		sha,
		srcHash,
		status,
		dirty,
		tools: ATTESTED_TOOLS,
		allTools: ATTESTED_TOOLS,
		partial: false,
		smartSkipped: [] as string[],
		timestamp: new Date().toISOString(),
		agenticExecuted,
		agenticSkipped,
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
