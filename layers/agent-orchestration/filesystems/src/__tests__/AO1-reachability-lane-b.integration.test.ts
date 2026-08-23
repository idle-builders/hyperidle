/**
 * AO1 — Lane B: LOCAL-ONLY live-proof with a real GitHub PAT.
 *
 * NETWORK-TAGGED — skipped in CI, must be run manually with a real token.
 *
 * How to run locally:
 *   HYPERIDLE_CREDENTIAL_KEY=<any-32-char-secret> \
 *   HYPERIDLE_API_KEY=test-key \
 *   AO1_GITHUB_PAT=<your-github-pat> \
 *   AO1_GITHUB_REPO=https://github.com/<owner>/<public-or-private-repo> \
 *   npm run test:integration -- AO1-reachability-lane-b
 *
 * What this proves (vs what Lane A proves):
 *   Lane A (unit) — hermetic git ls-remote against file://, no network, always runnable.
 *   Lane B (this) — real decrypt from DB → real authed ls-remote against a real GitHub repo.
 *     Proves: encrypt→store→decrypt→inject into git env → forge accepts token.
 *     Cannot be mocked — a mock here reproduces the rejected NoopAuthResolver stub.
 *
 * Skip condition: LOUDLY skip (not silently) when env vars are absent.
 * The skip message names every missing var so the runner knows exactly what to provide.
 *
 * Source of truth: plans/AO1/architecture.md §v2·5 + §v2·6 Lane B
 */

import * as crypto from "node:crypto";
import { resolveHeldToken } from "@hyperidle/connections";
import { decryptCredentialValue, encryptCredentialValue } from "@hyperidle/credentials";
import { serviceConnections, teams, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { resolveFilesystemState } from "@hyperidle/filesystems";
import { describe, expect, it } from "vitest";
import { createGitRunner } from "../../../src/git-runner.js";

// ─── Skip guard ───────────────────────────────────────────────────────────────

const CREDENTIAL_KEY = process.env.HYPERIDLE_CREDENTIAL_KEY;
const PAT = process.env.AO1_GITHUB_PAT;
const GITHUB_REPO = process.env.AO1_GITHUB_REPO ?? "https://github.com/github/gitignore";

const missing: string[] = [];
if (!CREDENTIAL_KEY) missing.push("HYPERIDLE_CREDENTIAL_KEY");
if (!PAT) missing.push("AO1_GITHUB_PAT");

const SKIP = missing.length > 0;
const SKIP_REASON = SKIP
	? `Lane B: missing env vars: ${missing.join(", ")}. Set them to run the live network proof.`
	: null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = "2026-06-27T00:00:00.000Z";

// ─── Lane B tests ─────────────────────────────────────────────────────────────

describe("AO1 Lane B: real GitHub PAT → real git ls-remote (local-only, network)", () => {
	it.skipIf(SKIP)(
		SKIP_REASON ?? "real PAT → resolveFilesystemState reachable",
		async () => {
			// LIVE PROOF: real GitHub token → real git ls-remote → exit 0 → reachable.
			// This exercises the FULL auth path: token → base64 → GIT_CONFIG_* env → git.
			// @lore AU20 Ag2: probeGitRemote removed from barrel; replaced with
			// resolveFilesystemState + inline auth resolver returning the real PAT.
			const state = await resolveFilesystemState(
				{
					id: "lb-direct-1",
					teamId: "team-1",
					source: "github",
					kind: "code",
					connectionId: "conn-direct",
					resourceRef: JSON.stringify({ kind: "code", repo: GITHUB_REPO, branch: "main" }),
					writeback: "git",
					state: "attached",
					createdAt: NOW,
				},
				{
					authResolver: {
						resolveToken: async () => PAT ?? null,
					},
					gitRunnerFactory: createGitRunner,
				},
			);
			expect(state).toBe("reachable");
		},
		35_000,
	);

	it.skipIf(SKIP)(
		"garbage token → resolveFilesystemState needs_attention",
		async () => {
			// LIVE PROOF: invalid token → git ls-remote exits non-zero → needs_attention.
			// The auth injection mechanism is exercised; the token is wrong so forge rejects.
			const state = await resolveFilesystemState(
				{
					id: "lb-direct-2",
					teamId: "team-1",
					source: "github",
					kind: "code",
					connectionId: "conn-garbage",
					resourceRef: JSON.stringify({ kind: "code", repo: GITHUB_REPO, branch: "main" }),
					writeback: "git",
					state: "attached",
					createdAt: NOW,
				},
				{
					authResolver: {
						resolveToken: async () => "ghp_garbage_token_not_real_at_all_0000",
					},
					gitRunnerFactory: createGitRunner,
				},
			);
			expect(state).toBe("needs_attention");
		},
		35_000,
	);

	test.skipIf(SKIP)(
		"real service_connections row → decrypt → ServiceConnectionResolverAdapter → reachable",
		async ({ db }) => {
			if (!(CREDENTIAL_KEY && PAT)) {
				// TypeScript narrowing — SKIP guard already ensures this branch unreachable in practice.
				throw new Error("Lane B: missing env vars");
			}

			// Seed a minimal user + team so service_connections FK is satisfied.
			const teamId = `lb-team-${crypto.randomUUID().slice(0, 8)}`;
			const userId = `lb-user-${crypto.randomUUID().slice(0, 8)}`;
			await db
				.insert(teams)
				.values({ id: teamId, name: "LaneB Team", phase: "build", createdAt: NOW });
			await db.insert(users).values({
				id: userId,
				kind: "human",
				name: "Lane B User",
				role: "builder",
				status: "active",
				teamId: teamId,
				createdAt: NOW,
			});

			// Encrypt the real PAT and store it as a service_connection.
			// @lore AU20 Am4: encryptCredentialValue is now no-arg; reads HYPERIDLE_CREDENTIAL_KEY
			// from env directly (same key the skip guard checks above).
			const encryptedToken = encryptCredentialValue(PAT);
			const connectionId = `lb-conn-${crypto.randomUUID().slice(0, 8)}`;
			await db.insert(serviceConnections).values({
				id: connectionId,
				userId,
				service: "github",
				authSource: "token",
				encryptedToken,
				health: "working",
				createdAt: NOW,
				updatedAt: NOW,
			});

			// Wire the real resolver + inline adapter object.
			// @lore AU20 Am4: ServiceConnectionResolver no longer takes serverSecret;
			// decryptCredentialValue reads HYPERIDLE_CREDENTIAL_KEY from env internally.
			// @lore AU20 R-filesystems: ServiceConnectionResolverAdapter class deleted from barrel.
			// Inline structural object satisfies FilesystemTokenResolver from @hyperidle/filesystems.
			function makeAdapter(boundUserId: string) {
				return {
					resolveToken: (cid: string) =>
						resolveHeldToken(db, boundUserId, cid, decryptCredentialValue),
				};
			}

			const adapter = makeAdapter(userId);

			const rawToken = await adapter.resolveToken(connectionId);
			expect(rawToken).toBe(PAT); // LIVE: round-trip through DB

			// Now run resolveFilesystemState — exercises the full path.
			const state = await resolveFilesystemState(
				{
					id: "lb-fs-1",
					teamId,
					source: "github",
					kind: "code",
					connectionId,
					resourceRef: JSON.stringify({ kind: "code", repo: GITHUB_REPO, branch: "main" }),
					writeback: "git",
					state: "attached",
					createdAt: NOW,
				},
				{ authResolver: adapter, gitRunnerFactory: createGitRunner },
			);
			expect(state).toBe("reachable"); // LIVE: git ls-remote with real token → exit 0

			// Cross-user: adapter bound to a different userId → null from resolver → needs_attention.
			const otherUserId = `lb-other-${crypto.randomUUID().slice(0, 8)}`;
			const crossUserAdapter = makeAdapter(otherUserId);
			const crossState = await resolveFilesystemState(
				{
					id: "lb-fs-cross",
					teamId,
					source: "github",
					kind: "code",
					connectionId,
					resourceRef: JSON.stringify({ kind: "code", repo: GITHUB_REPO, branch: "main" }),
					writeback: "git",
					state: "attached",
					createdAt: NOW,
				},
				{ authResolver: crossUserAdapter, gitRunnerFactory: createGitRunner },
			);
			expect(crossState).toBe("needs_attention"); // AN1 AC5: cross-user → null → no auth → non-zero exit
		},
		60_000,
	);
});
