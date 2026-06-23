/**
 * AL7 — CRITICAL-1: github:merge-pr capability contract test.
 *
 * LIVE PROOF STATUS: Not run in this env — no GITHUB_TOKEN available.
 * The handler is contract-proven here (fetch stub), not live-run.
 * A live run requires GITHUB_TOKEN with pull_requests:write scope on a
 * throwaway repo. If/when that token is available, run:
 *   GITHUB_TOKEN=ghp_... npx vitest run AL7-github-capability
 * and verify the outcome in the progress file.
 *
 * The fixture tool (fixture:staged-op) proves the at-most-once loop end-to-end.
 * The github handler is the real archetype-A tool path required by the concept.
 *
 * These tests verify:
 * 1. buildExecuteCapability routes "github"/"merge_pr" to the github handler
 * 2. The handler calls the correct GitHub API endpoint with auth
 * 3. On HTTP 200 the handler returns { sha, merged, message }
 * 4. On HTTP error the handler throws with the GitHub error message verbatim
 * 5. Without GITHUB_TOKEN the handler throws a clear "no token" error
 */

import type { StagedOperationSpec } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildExecuteCapability,
	KERNEL_DISPATCHABLE_CAPABILITIES,
} from "../services/staged-operation-dispatcher.js";

function makeSpec(override?: Partial<StagedOperationSpec>): StagedOperationSpec {
	return {
		id: "op-github-test",
		capabilityTool: "github",
		operation: "merge_pr",
		params: {
			owner: "test-org",
			repo: "test-repo",
			prNumber: 42,
			mergeMethod: "squash",
		},
		idempotencyKey: "idem-github-test",
		reversibility: "irreversible",
		...override,
	};
}

describe("AL7 — github:merge-pr capability (contract test)", () => {
	describe("KERNEL_DISPATCHABLE_CAPABILITIES (kernel-held-verb allowlist)", () => {
		it("includes github/merge_pr", () => {
			expect(KERNEL_DISPATCHABLE_CAPABILITIES.has("github/merge_pr")).toBe(true);
		});

		it("includes fixture:staged-op/echo", () => {
			expect(KERNEL_DISPATCHABLE_CAPABILITIES.has("fixture:staged-op/echo")).toBe(true);
		});
	});

	describe("buildExecuteCapability — github/merge_pr routing", () => {
		beforeEach(() => {
			// Set a fake token so the handler doesn't fail at the token check
			process.env.GITHUB_TOKEN = "ghp_fake_token_for_contract_test";
		});

		afterEach(() => {
			delete process.env.GITHUB_TOKEN;
			vi.restoreAllMocks();
		});

		it("calls the correct GitHub REST API endpoint on merge_pr", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					sha: "abc1234567890abcdef",
					merged: true,
					message: "Pull Request successfully merged",
				}),
			});
			vi.stubGlobal("fetch", mockFetch);

			const executor = buildExecuteCapability();
			const result = await executor(makeSpec());

			expect(mockFetch).toHaveBeenCalledOnce();
			const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://api.github.com/repos/test-org/test-repo/pulls/42/merge");
			expect(opts.method).toBe("PUT");
			const headers = opts.headers as Record<string, string>;
			expect(headers.Authorization).toBe("Bearer ghp_fake_token_for_contract_test");
			expect(headers.Accept).toBe("application/vnd.github+json");

			expect(result.payload).toMatchObject({
				sha: "abc1234567890abcdef",
				merged: true,
				message: "Pull Request successfully merged",
			});
		});

		it("throws with verbatim GitHub error on non-OK response", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 405,
				json: async () => ({
					message: "Pull Request is not mergeable",
					documentation_url: "https://docs.github.com/...",
				}),
			});
			vi.stubGlobal("fetch", mockFetch);

			const executor = buildExecuteCapability();
			await expect(executor(makeSpec())).rejects.toThrow(
				"GitHub merge-pr failed (HTTP 405): Pull Request is not mergeable",
			);
		});

		it("forwards idempotencyKey as sha in request body (W1 external dedup)", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ sha: "abc123", merged: true, message: "merged" }),
			});
			vi.stubGlobal("fetch", mockFetch);

			const executor = buildExecuteCapability();
			await executor(makeSpec({ idempotencyKey: "my-idempotency-key" }));

			const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(opts.body as string) as Record<string, unknown>;
			expect(body.sha).toBe("my-idempotency-key");
		});
	});

	describe("no GITHUB_TOKEN", () => {
		beforeEach(() => {
			delete process.env.GITHUB_TOKEN;
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("throws a clear 'no token' error when GITHUB_TOKEN is absent", async () => {
			const executor = buildExecuteCapability();
			await expect(executor(makeSpec())).rejects.toThrow("GITHUB_TOKEN");
		});
	});

	describe("fixture:staged-op still works (regression guard)", () => {
		it("echoes params for fixture:staged-op/echo", async () => {
			const executor = buildExecuteCapability();
			const result = await executor({
				id: "op-fixture",
				capabilityTool: "fixture:staged-op",
				operation: "echo",
				params: { x: 1 },
				idempotencyKey: "idem-fixture",
				reversibility: "irreversible",
			});
			expect(result.payload).toEqual({ echoed: { x: 1 } });
		});

		it("throws on simulateFailure for fixture:staged-op", async () => {
			const executor = buildExecuteCapability();
			await expect(
				executor({
					id: "op-fail",
					capabilityTool: "fixture:staged-op",
					operation: "echo",
					params: { simulateFailure: true },
					idempotencyKey: "idem-fail",
					reversibility: "irreversible",
				}),
			).rejects.toThrow("simulateFailure");
		});
	});

	describe("unknown tool still fails loudly", () => {
		it("throws for unknown capabilityTool/operation", async () => {
			const executor = buildExecuteCapability();
			await expect(
				executor({
					id: "op-unknown",
					capabilityTool: "stripe",
					operation: "refund",
					params: {},
					idempotencyKey: "idem-unknown",
					reversibility: "irreversible",
				}),
			).rejects.toThrow("Unknown capability tool");
		});
	});
});
