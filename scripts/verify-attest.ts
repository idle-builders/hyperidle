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
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	SUPPORTED_HARNESSES,
	isHarnessIntegrationPath,
} from "./lib/honest-harness-predicate.js";
import {
	type VitestJsonResult,
	assertPerHarnessFloor,
	extractAgenticCounts,
} from "./lib/attestation-floor.js";

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
// @lore AR1: verify-attest runs `test:all`'s two constituent legs directly (rather
// than the chained `npm run test:all`) so it can attach a JSON reporter to the
// integration leg and read per-file executed/skipped counts for the agentic floor.
// Combined semantics are identical to `test:all`'s `&&`-chain: BOTH legs must pass.
const ATTESTED_COMMAND_UNIT = "npm run test";

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

	// Run the attested tools (unit leg + integration leg) and derive status from the
	// REAL exit codes. The integration leg carries a JSON reporter so the agentic floor
	// can read per-file executed/skipped counts. Combined status = both legs pass.
	let status: "passed" | "failed" = "passed";

	process.stderr.write("verify-attest: running attested unit leg (npm run test)...\n");
	try {
		execSync(ATTESTED_COMMAND_UNIT, { stdio: "inherit" });
	} catch {
		status = "failed";
	}

	// Integration leg with a multi-reporter: --reporter=dot preserves the human terminal
	// output; --reporter=json --outputFile writes the machine JSON in the SAME run (no
	// double-run of the real-LLM harness tests).
	const tmpDir = mkdtempSync(join(tmpdir(), "ar1-attest-"));
	const tmpJson = join(tmpDir, "integration.json");
	const integrationCmd =
		"npx vitest run --config vitest.integration.config.ts " +
		`--reporter=dot --reporter=json --outputFile=${tmpJson}`;
	process.stderr.write("verify-attest: running attested integration leg...\n");
	try {
		execSync(integrationCmd, { stdio: "inherit" });
	} catch {
		status = "failed";
	}

	// Read the integration JSON and derive the agentic executed/skipped counts. A
	// missing/unparseable JSON (integration leg crashed before writing) is itself a
	// failure AND forces the floor to trip — never a silent `undefined`.
	let agenticExecuted = 0;
	let agenticSkipped = 0;
	let agenticExecutedByHarness: Record<string, { executed: number; skipped: number }> = {};
	try {
		const json = JSON.parse(readFileSync(tmpJson, "utf-8")) as VitestJsonResult;
		const counts = extractAgenticCounts(json, isHarnessIntegrationPath);
		agenticExecuted = counts.agenticExecuted;
		agenticSkipped = counts.agenticSkipped;
		agenticExecutedByHarness = counts.byHarness;
	} catch {
		status = "failed";
		agenticExecuted = 0;
		agenticSkipped = 0;
		agenticExecutedByHarness = {};
		process.stderr.write(
			"verify-attest: could not read integration JSON — status=failed, agentic counts 0/0\n",
		);
	} finally {
		try {
			rmSync(tmpDir, { recursive: true, force: true });
		} catch {}
	}

	// AR2 W5: a fresh verify-attest run ALWAYS populates agenticExecutedByHarness
	// with all four supported-harness keys, defaulting absent buckets to 0.
	// This ensures the per-harness floor in check-attestation can never be
	// permanently inert because the field was missing. Back-compat path (legacy
	// attestations without this field) is in check-attestation.ts only.
	const byHarnessWithDefaults: Record<string, { executed: number; skipped: number }> = {};
	for (const h of SUPPORTED_HARNESSES) {
		byHarnessWithDefaults[h] = agenticExecutedByHarness[h] ?? { executed: 0, skipped: 0 };
	}
	// Also include any extra harnesses found in the report (future-proofing).
	for (const [h, v] of Object.entries(agenticExecutedByHarness)) {
		if (!(h in byHarnessWithDefaults)) byHarnessWithDefaults[h] = v;
	}

	// Fail immediately if any supported harness has zero executed — the gate
	// runs at attest time so no status=passed attestation can be minted for a
	// partially-covered matrix.
	const perHarnessViolation = assertPerHarnessFloor(byHarnessWithDefaults, SUPPORTED_HARNESSES);
	if (perHarnessViolation) {
		status = "failed";
		process.stderr.write(`verify-attest: ${perHarnessViolation}\n`);
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
		agenticExecuted,
		agenticSkipped,
		/** AR2: per-harness executed/skipped counts. Always populated on a fresh verify-attest run. */
		agenticExecutedByHarness: byHarnessWithDefaults,
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
