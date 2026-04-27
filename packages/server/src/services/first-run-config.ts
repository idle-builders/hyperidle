/**
 * L10 — First-run configuration helper.
 *
 * Reads/writes flag values into the existing `factory_settings` KV table
 * (no schema change required). Uses the same redacted-config pattern as
 * H1/H3's observability config so secrets (`provider.<id>.api_key`) are
 * never returned to the wire — callers ask for the boolean "is set"
 * shape via `readFirstRunStatus`.
 *
 * @lore L10 S5 (DEFERRED encryption-at-rest): The provider API key is
 * stored as PLAINTEXT in the `factory_settings` table alongside other
 * H1 KV values (e.g. `observability.langfuse_secret_key`). The current
 * trust boundary is the at-rest encryption of the SQLite file itself —
 * H1 has the same boundary today. The original L10 spec referenced an
 * "H1 secret-handling pattern" but H1 (Git Export Routine) does not
 * define one, so we explicitly defer encryption-at-rest to a future
 * follow-up. Operators MUST chmod 600 the SQLite file. See
 * `/SECURITY.md` § L10 for the full policy and tracking.
 *
 * Callers MUST use `readApiKey` only on server-side trusted paths and
 * never return its value to user-facing surfaces; expose the
 * boolean+last4 derivable from `readFirstRunStatus` instead.
 *
 * @lore L10: Storing under namespaced keys (`firstRun.*`, `factory.*`,
 * `provider.<id>.*`) means a single migration to an encrypted secrets
 * vault later only has to scan the `provider.*` prefix.
 */
import { factorySettings, type HyperIdleDb } from "@hyperidle/db";
import { eq } from "drizzle-orm";

const KEYS = {
	firstRunComplete: "firstRun.complete",
	factoryName: "factory.name",
	factoryDataDir: "factory.data_dir",
	providerAnthropicKey: "provider.anthropic.api_key",
	providerAnthropicLast4: "provider.anthropic.api_key_last4",
	northStarPrinciplesId: "firstRun.northStar.principlesId",
	northStarFocusId: "firstRun.northStar.focusId",
	northStarPortfolioId: "firstRun.northStar.portfolioId",
	teamScaffoldProductId: "firstRun.teamScaffold.productId",
	teamScaffoldSkippedAt: "firstRun.teamScaffold.skippedAt",
	// C3: server-side flag. Local storage is per-device; server-side
	// guarantees the coach mark fires AT MOST ONCE per founder regardless
	// of how many tabs/devices they use.
	verdictCoachSeen: "firstRun.verdictCoachSeen",
} as const;

function readKv(db: HyperIdleDb, key: string): string | null {
	const row = db.select().from(factorySettings).where(eq(factorySettings.key, key)).get();
	return row?.value ?? null;
}

function writeKv(db: HyperIdleDb, key: string, value: string): void {
	const now = new Date().toISOString();
	db.insert(factorySettings)
		.values({ key, value, updatedAt: now })
		.onConflictDoUpdate({ target: factorySettings.key, set: { value, updatedAt: now } })
		.run();
}

export interface FirstRunStatus {
	readonly factoryReady: boolean;
	readonly apiKeyReady: boolean;
	readonly apiKeyLast4: string | null;
	readonly northStarReady: boolean;
	readonly teamScaffoldHandled: boolean;
	readonly complete: boolean;
	readonly verdictCoachSeen: boolean;
}

export function readFirstRunStatus(db: HyperIdleDb): FirstRunStatus {
	const factoryReady = readKv(db, KEYS.factoryName) !== null;
	const apiKeyLast4 = readKv(db, KEYS.providerAnthropicLast4);
	const apiKeyReady = readKv(db, KEYS.providerAnthropicKey) !== null;
	const principles = readKv(db, KEYS.northStarPrinciplesId);
	const focus = readKv(db, KEYS.northStarFocusId);
	const portfolio = readKv(db, KEYS.northStarPortfolioId);
	const northStarReady = principles !== null && focus !== null && portfolio !== null;
	const teamScaffoldHandled =
		readKv(db, KEYS.teamScaffoldProductId) !== null ||
		readKv(db, KEYS.teamScaffoldSkippedAt) !== null;
	const complete = readKv(db, KEYS.firstRunComplete) === "true";
	const verdictCoachSeen = readKv(db, KEYS.verdictCoachSeen) === "true";
	return {
		factoryReady,
		apiKeyReady,
		apiKeyLast4,
		northStarReady,
		teamScaffoldHandled,
		complete,
		verdictCoachSeen,
	};
}

export function writeVerdictCoachSeen(db: HyperIdleDb): void {
	writeKv(db, KEYS.verdictCoachSeen, "true");
}

export function writeFactorySettings(
	db: HyperIdleDb,
	values: { name: string; dataDir: string },
): void {
	writeKv(db, KEYS.factoryName, values.name);
	writeKv(db, KEYS.factoryDataDir, values.dataDir);
}

export function writeApiKey(db: HyperIdleDb, key: string): void {
	writeKv(db, KEYS.providerAnthropicKey, key);
	writeKv(db, KEYS.providerAnthropicLast4, key.slice(-4));
}

export function readApiKey(db: HyperIdleDb): string | null {
	return readKv(db, KEYS.providerAnthropicKey);
}

export function writeNorthStarIds(
	db: HyperIdleDb,
	ids: { principlesId: string; focusId: string; portfolioId: string },
): void {
	writeKv(db, KEYS.northStarPrinciplesId, ids.principlesId);
	writeKv(db, KEYS.northStarFocusId, ids.focusId);
	writeKv(db, KEYS.northStarPortfolioId, ids.portfolioId);
}

export function writeTeamScaffoldProductId(db: HyperIdleDb, productId: string): void {
	writeKv(db, KEYS.teamScaffoldProductId, productId);
}

export function writeTeamScaffoldSkipped(db: HyperIdleDb): void {
	writeKv(db, KEYS.teamScaffoldSkippedAt, new Date().toISOString());
}

export function writeFirstRunComplete(db: HyperIdleDb): void {
	writeKv(db, KEYS.firstRunComplete, "true");
}
