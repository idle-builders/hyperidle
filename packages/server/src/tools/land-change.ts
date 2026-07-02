/**
 * AO3 — `land_change` tool
 *
 * Registered irreversible tool that pushes an agent's captured filesystem change
 * (the AO2 `filesystem_captures` git bundle) to the connected git target.
 *
 * Loop (AL7-faithful):
 *   Session 1: agent invokes land_change → AL7 router captures it as a Proposed Call
 *              (status:captured); session 1 ends.
 *   Human approves → composeTailoredGrant composes the grant (UNCHANGED spine).
 *   Session 2: agent re-invokes land_change → router CAS-consumes the grant → runs this
 *              handler → real push → recordOutcome writes pushed SHA.
 *
 * @lore AO3 handler-resolution (CRITICAL): the handler resolves the capture via the
 * just-consumed grant's proposedCall.originSessionId — NOT via a task-recency heuristic.
 * Query path: exact claimed approvedProposedCallId → proposedCalls.originSessionId →
 * filesystemCaptures.sessionId. This makes "review diff A / push diff B" structurally
 * impossible: router, loader, and handler all bind to the reviewed Proposed Call id.
 *
 * @lore AO3 clone-adapter branch: The git-clone-adapter bundles refs/heads/<resourceRef.branch>
 * (e.g. "refs/heads/main"), so for a clone of "main" the land target IS "main" directly —
 * NOT an "agent/*" branch (that only holds for the worktree adapter). `bundleListHeads`
 * reads the actual ref from the bundle instead of deriving it by convention.
 *
 * @lore AO3 push auth: v1 uses inherited host env through buildGitEnv's allowlist
 * (HOME/SSH_AUTH_SOCK/GH_TOKEN — same as git-export.ts). Held-connection token injection
 * (GIT_CONFIG_*, AN2) is out of scope for AO3 — the bare-remote integration test provides
 * a credential-free local remote.
 *
 * @lore AO3 session-2 worktree: session 2 may have its own AO2-mounted worktree, but
 * the land_change handler pushes the SESSION-1 BUNDLE's commit, never session 2's worktree.
 * The bundle IS the captured change; deriving from session 2's worktree would be wrong.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { filesystemCaptures, filesystems, proposedCalls } from "@hyperidle/db";
import { createGitRunner } from "@hyperidle/fabric";
import type { ResourceRef } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import z from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

const landChangeInputSchema = z.object({
	// v1 carries NO capture reference — resolved from session/task context (see handler).
	// Optional cosmetic, unused in v1 push-existing-commit path.
	message: z.string().optional(),
});

type LandChangeInput = z.infer<typeof landChangeInputSchema>;

async function handler(args: LandChangeInput, ctx: ToolContext): Promise<ToolResult> {
	void args; // message is cosmetic in v1

	// ── Step 1: resolve the capture via the exact just-consumed grant ───────────
	const proposedCallId = ctx.approvedProposedCallId;
	if (!proposedCallId) {
		return err(
			"NO_APPROVED_CALL",
			"land_change: missing approvedProposedCallId — refusing to infer a grant by task recency",
		);
	}

	// Resolve proposedCalls.originSessionId.
	const [pcRow] = await ctx.db
		.select({ originSessionId: proposedCalls.originSessionId })
		.from(proposedCalls)
		.where(eq(proposedCalls.id, proposedCallId))
		.limit(1);

	if (!pcRow) {
		return err("NO_PROPOSED_CALL", "land_change: proposed call not found for grant");
	}

	const { originSessionId } = pcRow;

	// ── Step 2: resolve the filesystem capture by originSessionId ──────────────
	const [captureRow] = await ctx.db
		.select()
		.from(filesystemCaptures)
		.where(
			and(
				eq(filesystemCaptures.sessionId, originSessionId),
				eq(filesystemCaptures.writeback, "git"),
			),
		)
		.limit(1);

	if (!captureRow) {
		return err(
			"NO_CAPTURE",
			`land_change: no git filesystem_captures row for originSessionId=${originSessionId}`,
		);
	}

	if (!captureRow.commitSha) {
		return err("NO_COMMIT_SHA", "land_change: capture row has no commitSha — bundle may be empty");
	}

	// ── Step 3: resolve the remote URL from the filesystem's resourceRef ────────
	const [fsRow] = await ctx.db
		.select({ resourceRef: filesystems.resourceRef })
		.from(filesystems)
		.where(eq(filesystems.id, captureRow.filesystemId))
		.limit(1);

	if (!fsRow) {
		return err("NO_FILESYSTEM", "land_change: filesystem row not found for capture");
	}

	let resourceRef: ResourceRef;
	try {
		resourceRef = JSON.parse(fsRow.resourceRef) as ResourceRef;
	} catch {
		return err("BAD_RESOURCE_REF", "land_change: could not parse filesystem.resourceRef as JSON");
	}

	if (resourceRef.kind !== "code") {
		return err(
			"NON_CODE_FILESYSTEM",
			`land_change: filesystem kind '${resourceRef.kind}' is not 'code' — only code filesystems support git push`,
		);
	}

	const remoteUrl = resourceRef.repo;

	// ── Step 4: clone bundle into temp dir, resolve the ref, push ───────────────
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao3-land-"));
	try {
		const runner = createGitRunner(tmpDir);
		await runner.cloneBundle(captureRow.capturePath);

		// Resolve the bundled ref deterministically — NEVER derive by convention.
		// @lore AO3: the two adapters bundle different refs (see module-level @lore).
		// bundleListHeads is the only safe resolution.
		const heads = await runner.bundleListHeads(captureRow.capturePath);
		if (heads.length !== 1) {
			return err(
				"MALFORMED_BUNDLE",
				`land_change: expected exactly 1 ref in bundle, got ${heads.length}. Each captureBack bundles one ref; >1 = malformed or foreign bundle.`,
			);
		}

		const onlyHead = heads[0];
		if (!onlyHead) {
			return err("MALFORMED_BUNDLE", "land_change: bundle had no refs.");
		}
		const bundledRef = onlyHead.ref;
		// Derive the branch name (strip "refs/heads/" prefix).
		const landBranch = bundledRef.startsWith("refs/heads/")
			? bundledRef.slice("refs/heads/".length)
			: bundledRef;

		// Add the connected target as a remote and push.
		await runner.remoteAdd("land", remoteUrl);

		// @lore AO3 AC5: This is one of the two legitimate pushers.
		// See eslint-plugin-authz/no-unbrokered-git-push for the allowlist.
		await runner.push("land", landBranch);

		return ok({
			pushedSha: captureRow.commitSha,
			ref: bundledRef,
			remote: remoteUrl,
		});
	} catch (e) {
		return err("PUSH_FAILED", `land_change: push failed: ${String(e)}`);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
}

export const landChangeTool: ToolDefinition<LandChangeInput> & {
	readonly reversibility: "irreversible";
} = {
	name: "land_change",
	description:
		"Push the change the agent captured in this task's session to the connected git target. Irreversible — routed to human review before it lands.",
	inputSchema: landChangeInputSchema,
	handler,
	reversibility: "irreversible",
};
