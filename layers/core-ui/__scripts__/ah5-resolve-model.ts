/**
 * AH5: Model-resolution launcher for the smoke lane.
 *
 * Reads OPENROUTER_API_KEY, calls fetchSmokeCatalog + fetchModelEndpoints +
 * selectSmokeModel, and writes the chosen routedId + ranked fallback list
 * to a JSON file (default: /tmp/ah5-model-selection.json).
 *
 * Called once per local lane run (from `scripts/ah5-smoke-local.ts`, before the lane boots).
 * The ah5-test-server.ts reads RESOLVE_MODEL_FILE to pick up the result.
 *
 * @lore AH5: Model selection is run ONCE per local lane run, not per test. The result
 * is written to a file so the test-server and the probe both read the same
 * selection. This avoids N×API calls and ensures consistency.
 *
 * @lore AH5: If no qualifying model is found (empty ranked[]), this script
 * exits non-zero. The local lane fails early with a clear error — not silently.
 * An empty ranked[] is a real signal (policy too strict, or OpenRouter has
 * no qualifying models), not a flake.
 *
 * @lore AH5: The DEFAULT_SMOKE_POLICY uses a 2026-01-01 creation cutoff.
 * If OpenRouter's catalog has no 2026+ models meeting all gates, this script
 * will fail. Adjust policy.ts if the cutoff needs updating.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	DEFAULT_SMOKE_POLICY,
	fetchModelEndpoints,
	fetchSmokeCatalog,
	preFilterModels,
	selectSmokeModel,
} from "@hyperidle/eval/smoke";

// @lore AH5 N4: RESOLVE_MODEL_FILE must be set for consistent local lane runs.
// The default falls back to <repo>/tmp/ah5-model-selection.json (relative to
// this script). The `npm run smoke:ah5` orchestrator sets this automatically to
// /tmp/ah5-model-selection.json (an absolute path). If running this script directly:
//   RESOLVE_MODEL_FILE=/tmp/ah5-model-selection.json npx tsx layers/core-ui/scripts/ah5-resolve-model.ts
// The probe and test-server read RESOLVE_MODEL_FILE from env — if unset, the caller
// and this script may write/read different paths.
const OUT_FILE =
	process.env.RESOLVE_MODEL_FILE ??
	path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../tmp/ah5-model-selection.json");

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
	process.stderr.write("[ah5-resolve-model] FATAL: OPENROUTER_API_KEY is not set.\n");
	process.exit(1);
}

process.stdout.write("[ah5-resolve-model] Fetching OpenRouter model catalog...\n");
const allModels = await fetchSmokeCatalog(apiKey);

// Pre-filter: drop :free, pre-2026-gen, above price ceiling before fetching endpoints.
// @lore AH5 N3: Uses preFilterModels (single source of truth from select-smoke-model.ts)
// rather than duplicating the gates here. Avoids drift between the two call sites.
const preFiltered = preFilterModels(allModels, DEFAULT_SMOKE_POLICY);

process.stdout.write(
	`[ah5-resolve-model] Pre-filter survivors: ${preFiltered.length}/${allModels.length}\n`,
);

if (preFiltered.length === 0) {
	process.stderr.write(
		"[ah5-resolve-model] FATAL: No models passed pre-filter. " +
			"The DEFAULT_SMOKE_POLICY may be too strict for the current OpenRouter catalog.\n",
	);
	process.exit(1);
}

// Fetch endpoint data for each survivor.
const endpointsByModel = new Map<string, Awaited<ReturnType<typeof fetchModelEndpoints>>>();

for (const model of preFiltered) {
	process.stdout.write(`[ah5-resolve-model] Fetching endpoints for ${model.id}...\n`);
	try {
		const endpoints = await fetchModelEndpoints(apiKey, model.id);
		endpointsByModel.set(model.id, endpoints);
	} catch (err) {
		process.stderr.write(
			`[ah5-resolve-model] WARNING: Failed to fetch endpoints for ${model.id}: ${String(err)}\n`,
		);
		// Skip this model — no endpoint data available.
	}
}

// Run selection.
const result = selectSmokeModel({
	models: preFiltered,
	endpointsByModel,
	policy: DEFAULT_SMOKE_POLICY,
});

if (result.ranked.length === 0) {
	process.stderr.write(
		"[ah5-resolve-model] FATAL: No qualifying model found after all gates. " +
			"Check OpenRouter endpoint uptime/tools support or relax the policy.\n",
	);
	process.exit(1);
}

const winner = result.ranked[0];
if (!winner) {
	process.stderr.write("[ah5-resolve-model] FATAL: Unexpected: ranked[0] is undefined.\n");
	process.exit(1);
}

process.stdout.write(`[ah5-resolve-model] Selected: ${winner.routedId}\n`);
process.stdout.write(
	`[ah5-resolve-model] Ranked candidates: ${result.ranked.map((r) => r.id).join(", ")}\n`,
);

// Write selection result.
const outDir = path.dirname(OUT_FILE);
if (!fs.existsSync(outDir)) {
	fs.mkdirSync(outDir, { recursive: true });
}

const output = {
	routedId: winner.routedId,
	id: winner.id,
	completionPricePerMillion: winner.completionPricePerMillion,
	toolProviderCount: winner.toolProviderCount,
	ranked: result.ranked.map((r) => r.routedId),
	timestamp: new Date().toISOString(),
};

fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), "utf-8");
process.stdout.write(`[ah5-resolve-model] Written to ${OUT_FILE}\n`);
