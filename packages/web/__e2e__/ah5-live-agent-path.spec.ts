/**
 * AH5: Live agent-path E2E proof.
 *
 * Asserts a real, no-mock streamed model response via the production path:
 *   onboarding → assistant agent configured → send prescriptive message
 *   → real OpenRouter LLM call → write_session_notes tool call → UI shows result.
 *
 * This spec runs ONLY in the local lane (`npm run -w @hyperidle/web test:e2e:ah5`),
 * not as part of the default test:e2e run. It requires OPENROUTER_API_KEY in your shell.
 *
 * AH5-own gating proof (AC1): the credential-seed test verifies the
 * test-server pre-seeds the OpenRouter credential at boot. The AH6 lane
 * (AH6-assistant-interaction.spec.ts) delivers the full message→turn E2E proof.
 *
 * @lore AH5: The UI-trigger assertion (send-message → streamed-response →
 * tool-call-summaries row) is test.fixme()-gated until AH3 (message→turn
 * trigger) is merged. AH3 owns the trigger that routes a posted message into
 * a provisionSession call. Without AH3, posting a message does NOT start a
 * session turn — the overlay won't show a streamed response.
 * @lore AH5: un-fixme the UI-trigger block when AH3 trigger lands. Coordinate
 * with AH3 to confirm the streaming indicator testid and tool-call-summaries
 * testid that AH3 exposes on the AssistantOverlay.
 *
 * @lore AH5: No page.route() on assistant/session/credential/LLM/openrouter
 * paths. The no-mock guard (scripts/ah5-no-mock-guard.ts) asserts this
 * statically. Shell-scaffolding mocks (auth/me, teams, settings) are tolerated
 * only to render the app shell — they are NOT on the proof path.
 *
 * @lore AH5: The test-server (scripts/ah5-test-server.ts) pre-seeds the
 * OpenRouter credential encrypted into server_credentials. DbCredentialResolver
 * (production wiring) reads it — no EnvCredentialResolver on the proof path.
 */

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Test: onboarding flow verifies the credential is pre-seeded
// ---------------------------------------------------------------------------

test.describe("AH5 AC1 — credential pre-seeded by test-server", () => {
	test("server_credentials row exists after test-server boot", async ({ request }) => {
		// The test-server seeds openrouter_api_key at boot.
		// Verify via the credentials list API — GET /api/credentials returns all catalog entries.
		// @lore AH5: The API has no single-item GET /api/credentials/:name endpoint;
		// only a list endpoint. The test was wrong to call /api/credentials/openrouter_api_key.
		const res = await request.get("/api/credentials");
		// Returns 200 with the credential metadata list (not plaintext values).
		expect(res.status()).toBe(200);
		// Response shape: { name, state, lastValidatedAt }[] (see credentials.ts buildStatusResponse)
		const body = (await res.json()) as Array<{ name?: string; state?: string }>;
		const openrouterEntry = body.find((entry) => entry.name === "openrouter_api_key");
		expect(openrouterEntry).toBeDefined();
		expect(openrouterEntry?.state).toBe("present_untested");
	});
});

// ---------------------------------------------------------------------------
// @lore AH6 C1: The AH5 AC3 and AC5 test.fixme blocks (write_session_notes
// probe, cost artifact) were removed here. They are superseded by the AH6
// replay lane (AH6-assistant-interaction.spec.ts) which proves S1/S2/S3 through
// the real AssistantOverlay interface using committed cassettes. The AC1
// credential-seed test above is the sole remaining AH5 assertion in this file.
// ---------------------------------------------------------------------------
