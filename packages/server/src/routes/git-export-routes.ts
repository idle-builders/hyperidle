import type { HyperIdleDb } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import { Hono } from "hono";
import z from "zod";
import {
	createNodeFsAdapter,
	type FsAdapter,
	runGitExport,
} from "../app-runtime/services/git-export.js";
import {
	type GitExportConfig,
	getLastExportMeta,
	readGitExportConfig,
	redactRemoteUrl,
	sanitizeAuthorEmail,
	sanitizeAuthorName,
	sanitizeBranch,
	sanitizeRemoteUrl,
	sanitizeRepoPath,
	updateGitExportConfig,
} from "../app-runtime/services/git-export-config.js";
import { createGitRunner, type GitRunner } from "../app-runtime/services/git-export-runner.js";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import { validateBody } from "../middleware/validate.js";

const patchConfigSchema = z
	.object({
		enabled: z.boolean().optional(),
		repoPath: z.string().min(1).max(4096).optional(),
		remoteUrl: z.union([z.string().max(2048), z.null()]).optional(),
		branch: z.string().min(1).max(200).optional(),
		authorName: z.string().min(1).max(100).optional(),
		authorEmail: z.string().min(1).max(254).optional(),
		debounceMs: z.number().int().min(0).max(3_600_000).optional(),
	})
	.strict();

const runBodySchema = z
	.object({
		trigger: z.enum(["manual", "scheduled"]).optional(),
		force: z.boolean().optional(),
	})
	.strict();

/**
 * Returned GitExportConfig shape — NEVER includes credential-bearing URLs.
 * The raw `remoteUrl` in `factory_settings` is redacted before leaving
 * the process.
 */
interface SafeGitExportConfig {
	enabled: boolean;
	repoPath: string;
	remoteUrl: string | null;
	branch: string;
	authorName: string;
	authorEmail: string;
	debounceMs: number;
}

function toSafeConfig(raw: GitExportConfig): SafeGitExportConfig {
	return { ...raw, remoteUrl: redactRemoteUrl(raw.remoteUrl) };
}

type PatchBody = z.infer<typeof patchConfigSchema>;

/**
 * Apply every field-level sanitizer to a PATCH body. Returns `null` on
 * success or a reason string to reject with (400).
 */
function validatePatchBody(body: PatchBody): string | null {
	if (body.repoPath !== undefined) {
		const r = sanitizeRepoPath(body.repoPath);
		if (!r.ok) return r.reason;
	}
	if (body.branch !== undefined) {
		const r = sanitizeBranch(body.branch);
		if (!r.ok) return r.reason;
	}
	if (body.authorName !== undefined) {
		const r = sanitizeAuthorName(body.authorName);
		if (!r.ok) return r.reason;
	}
	if (body.authorEmail !== undefined) {
		const r = sanitizeAuthorEmail(body.authorEmail);
		if (!r.ok) return r.reason;
	}
	if (body.remoteUrl !== undefined && body.remoteUrl !== null && body.remoteUrl.length > 0) {
		const allowFileRemote = process.env.HYPERIDLE_GIT_ALLOW_FILE_REMOTE === "true";
		const r = sanitizeRemoteUrl(body.remoteUrl, { allowFileRemote });
		if (!r.ok) return r.reason;
	}
	return null;
}

export interface CreateGitExportRoutesOptions {
	/** Factory for the GitRunner; defaults to `createGitRunner(repoPath)`. */
	createRunner?: (repoPath: string) => GitRunner;
	/** Filesystem adapter; defaults to `createNodeFsAdapter()`. */
	fs?: FsAdapter;
}

export function createGitExportRoutes(
	db: HyperIdleDb,
	opts: CreateGitExportRoutesOptions = {},
): Hono {
	const router = new Hono();
	const createRunner =
		opts.createRunner ?? ((repoPath: string): GitRunner => createGitRunner(repoPath));
	const fs = opts.fs ?? createNodeFsAdapter();

	// GET / — Bounded resource descriptor. Proves the route is mounted
	// (I1 S2) without a DB read on every hit. Callers that want the
	// config hit `/config`.
	// @lore I1 simplification-#2: previous handler read + redacted the
	// git-export config on every request.
	router.get("/", requireBoundary({ kind: "public-data" }), (c) =>
		c.json({
			ok: true,
			resource: "git-export",
			endpoints: ["GET /config", "PATCH /config", "POST /run", "GET /status"],
		}),
	);

	router.get("/config", requireBoundary({ kind: "public-data" }), async (c) =>
		c.json(toSafeConfig(await readGitExportConfig(db))),
	);

	router.patch(
		"/config",
		requireBoundary({ kind: "public-data" }),
		validateBody(patchConfigSchema),
		async (c) => {
			const body = c.req.valid("json");
			const reason = validatePatchBody(body);
			if (reason !== null) {
				const response: ApiErrorResponse = {
					error: reason,
					code: API_ERROR_CODES.VALIDATION_ERROR,
				};
				return c.json(response, 400);
			}
			const updated = await updateGitExportConfig(db, body);
			return c.json(toSafeConfig(updated));
		},
	);

	router.post(
		"/run",
		requireBoundary({ kind: "public-data" }),
		validateBody(runBodySchema),
		async (c) => {
			const body = c.req.valid("json");
			const cfg = await readGitExportConfig(db);
			if (!cfg.repoPath || cfg.repoPath.length === 0) {
				const response: ApiErrorResponse = {
					error: "repoPath is not configured",
					code: API_ERROR_CODES.VALIDATION_ERROR,
				};
				return c.json(response, 400);
			}
			const runner = createRunner(cfg.repoPath);
			const result = await runGitExport(db, {
				runner,
				fs,
				trigger: body.trigger ?? "manual",
				force: body.force,
			});
			return c.json(result);
		},
	);

	router.get("/status", requireBoundary({ kind: "public-data" }), async (c) => {
		const cfg = await readGitExportConfig(db);
		const meta = await getLastExportMeta(db);
		return c.json({
			enabled: cfg.enabled,
			repoPath: cfg.repoPath,
			branch: cfg.branch,
			remoteUrl: redactRemoteUrl(cfg.remoteUrl),
			lastCommitAt: meta.lastCommitAt,
			lastCommitSha: meta.lastCommitSha,
			lastPushAt: meta.lastPushAt,
		});
	});

	return router;
}
