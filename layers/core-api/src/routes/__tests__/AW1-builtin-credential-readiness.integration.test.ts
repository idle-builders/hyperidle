/**
 * AW1 — GET /api/harnesses reports the built-in gateway's real readiness.
 *
 * The discovery probe reads process.env only. A key entered through setup or the
 * Credentials tab lands in server_credentials, so without this correction the
 * built-in row keeps telling the user to add a key they already added.
 *
 * AC1: a stored credential for the configured provider flips unauthenticated → ready.
 * AC2: a credential for some OTHER provider does not — that tier would still fail.
 * AC3: a gateway split across providers needs every one of them covered.
 * AC4: only "unauthenticated" is corrected; a probe that found a key stays right,
 *      and no stored key can conjure a harness that is not installed.
 */

import { writeCredential } from "@hyperidle/credentials";
import { AdapterPool, createHarnessAdapter } from "@hyperidle/harness-registry";
import { updateServerConfig } from "@hyperidle/settings";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";

type SnapshotValue<T> = T extends Readonly<Record<string, infer V>> ? V : never;
type HarnessDiscoveryInput = SnapshotValue<
	NonNullable<ConstructorParameters<typeof AdapterPool>[0]>
>;

const TEST_API_KEY = "test-key-aw1-builtin-credential";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

/** A pool whose builtin probe found nothing in the environment. */
function makePool(builtinState: HarnessDiscoveryInput["state"] = "unauthenticated"): AdapterPool {
	const pool = new AdapterPool({
		builtin: {
			state: builtinState,
			reason: "Built-in gateway has no usable credential.",
		},
		"claude-code": { state: "missing", reason: "claude CLI is not installed or not on PATH." },
	});
	pool.register("local-builtin", createHarnessAdapter({ kind: "builtin" }), {
		name: "Built-in Harness",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 4,
	});
	return pool;
}

async function builtinState(app: Awaited<ReturnType<typeof createTestApp>>): Promise<string> {
	const res = await app.request("/api/harnesses", { headers: authHeaders() });
	expect(res.status).toBe(200);
	const body = (await res.json()) as Array<Record<string, unknown>>;
	const builtin = body.find((e) => e.type === "builtin");
	if (!builtin) throw new Error("no builtin descriptor in GET /api/harnesses response");
	return (builtin.discovery as { state: string }).state;
}

describe("AW1 — built-in readiness reflects stored credentials", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("stays unauthenticated when no credential is stored", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		expect(await builtinState(app)).toBe("unauthenticated");
	});

	// AC1
	test("becomes ready once the configured provider's credential exists", async ({
		db,
		eventBus,
	}) => {
		// Default tiers are anthropic (BUILT_IN_GATEWAY_CONFIG).
		await writeCredential(db, "anthropic_api_key", {
			encryptedValue: "enc-value",
			validationState: "present_untested",
			lastValidatedAt: null,
			updatedAt: new Date().toISOString(),
		});

		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		expect(await builtinState(app)).toBe("ready");
	});

	// AC2
	test("stays unauthenticated when only another provider's credential exists", async ({
		db,
		eventBus,
	}) => {
		// Tiers still point at anthropic; an OpenRouter key alone cannot serve them.
		await writeCredential(db, "openrouter_api_key", {
			encryptedValue: "enc-value",
			validationState: "present_untested",
			lastValidatedAt: null,
			updatedAt: new Date().toISOString(),
		});

		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		expect(await builtinState(app)).toBe("unauthenticated");
	});

	// AC2 (inverse): repointing the tiers makes that same key sufficient
	test("becomes ready when the tiers are repointed at the stored provider", async ({
		db,
		eventBus,
	}) => {
		await writeCredential(db, "openrouter_api_key", {
			encryptedValue: "enc-value",
			validationState: "present_untested",
			lastValidatedAt: null,
			updatedAt: new Date().toISOString(),
		});
		const tier = { provider: "openrouter" as const, model: "anthropic/claude-opus-5" };
		await updateServerConfig(db, {
			modelGateway: { reasoning: tier, workhorse: tier, fast: tier },
		});

		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		expect(await builtinState(app)).toBe("ready");
	});

	// AC3
	test("needs every provider covered when tiers span more than one", async ({ db, eventBus }) => {
		await writeCredential(db, "openrouter_api_key", {
			encryptedValue: "enc-value",
			validationState: "present_untested",
			lastValidatedAt: null,
			updatedAt: new Date().toISOString(),
		});
		// reasoning stays anthropic; the other two move to openrouter.
		const openrouter = { provider: "openrouter" as const, model: "anthropic/claude-opus-5" };
		await updateServerConfig(db, {
			modelGateway: { workhorse: openrouter, fast: openrouter },
		});

		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		// The reasoning tier would still fail — the gateway is not ready.
		expect(await builtinState(app)).toBe("unauthenticated");

		await writeCredential(db, "anthropic_api_key", {
			encryptedValue: "enc-value",
			validationState: "present_untested",
			lastValidatedAt: null,
			updatedAt: new Date().toISOString(),
		});
		const app2 = await createTestApp({ db, eventBus, adapterPool: makePool() });
		expect(await builtinState(app2)).toBe("ready");
	});

	// AC4
	test("does not overwrite a state the probe already resolved", async ({ db, eventBus }) => {
		await writeCredential(db, "anthropic_api_key", {
			encryptedValue: "enc-value",
			validationState: "present_untested",
			lastValidatedAt: null,
			updatedAt: new Date().toISOString(),
		});

		const app = await createTestApp({ db, eventBus, adapterPool: makePool("missing") });
		expect(await builtinState(app)).toBe("missing");
	});
});
