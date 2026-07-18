import type { HyperIdleDb } from "@hyperidle/db";
import {
	createGitRunner,
	type GitRunner,
	getLastExportMeta,
	readGitExportConfig,
	runGitExport,
	updateGitExportConfig,
} from "@hyperidle/git-export";
import {
	findKnowledgeItemProjectionById,
	listExportableKnowledgeItems,
} from "@hyperidle/knowledge";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import { validateBody } from "../middleware/validate.js";

const gitExportServerConfigPort = { read: readServerConfig, update: updateServerConfig };
const gitExportKnowledgeReader = {
	listExportableItems: listExportableKnowledgeItems,
	getProjectionByItemId: findKnowledgeItemProjectionById,
};

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
 * Minimal fs surface — matches git-export's internal FsAdapter. Defined
 * locally so production code doesn't import internal types from the package.
 *
 * @lore AU20 Am8: FsAdapter moved to @hyperidle/git-export/testing subpath
 * (internal mechanics of the export pipeline, not product surface). Routes
 * define the injection interface locally; structural typing handles compat.
 */
interface FsAdapter {
	existsSync(p: string): boolean;
	readFileSync(p: string): string;
	writeFileSync(p: string, data: string): void;
	mkdirSync(p: string): void;
	unlinkSync(p: string): void;
}

export interface CreateGitExportRoutesOptions {
	/** Factory for the GitRunner; defaults to `createGitRunner(repoPath)`. */
	createRunner?: (repoPath: string) => GitRunner;
	/** Filesystem adapter; defaults to the Node fs adapter inside runGitExport. */
	fs?: FsAdapter;
}

export function createGitExportRoutes(
	db: HyperIdleDb,
	opts: CreateGitExportRoutesOptions = {},
): Hono {
	const router = new Hono();
	const createRunner =
		opts.createRunner ?? ((repoPath: string): GitRunner => createGitRunner(repoPath));

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

	// readGitExportConfig returns already-redacted remoteUrl — safe to send directly.
	router.get("/config", requireBoundary({ kind: "public-data" }), async (c) =>
		c.json(await readGitExportConfig(db, { serverConfig: gitExportServerConfigPort })),
	);

	router.patch(
		"/config",
		requireBoundary({ kind: "public-data" }),
		validateBody(patchConfigSchema),
		async (c) => {
			const body = c.req.valid("json");
			// Validation is now inside updateGitExportConfig — routes no longer
			// import per-field sanitizers.
			// @lore AU20 Am8: validatePatchBody removed; folded into updateGitExportConfig.
			const result = await updateGitExportConfig(db, body, {
				serverConfig: gitExportServerConfigPort,
			});
			if (!result.ok) {
				const response: ApiErrorResponse = {
					error: result.reason,
					code: API_ERROR_CODES.VALIDATION_ERROR,
				};
				return c.json(response, 400);
			}
			return c.json(result.config);
		},
	);

	router.post(
		"/run",
		requireBoundary({ kind: "public-data" }),
		validateBody(runBodySchema),
		async (c) => {
			const body = c.req.valid("json");
			const cfg = await readGitExportConfig(db, { serverConfig: gitExportServerConfigPort });
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
				fs: opts.fs, // undefined → defaults to createNodeFsAdapter() inside runGitExport
				trigger: body.trigger ?? "manual",
				force: body.force,
				serverConfig: gitExportServerConfigPort,
				knowledge: gitExportKnowledgeReader,
			});
			return c.json(result);
		},
	);

	router.get("/status", requireBoundary({ kind: "public-data" }), async (c) => {
		const cfg = await readGitExportConfig(db, { serverConfig: gitExportServerConfigPort });
		const meta = await getLastExportMeta(db, { serverConfig: gitExportServerConfigPort });
		return c.json({
			enabled: cfg.enabled,
			repoPath: cfg.repoPath,
			branch: cfg.branch,
			remoteUrl: cfg.remoteUrl, // already redacted by readGitExportConfig
			lastCommitAt: meta.lastCommitAt,
			lastCommitSha: meta.lastCommitSha,
			lastPushAt: meta.lastPushAt,
		});
	});

	return router;
}
