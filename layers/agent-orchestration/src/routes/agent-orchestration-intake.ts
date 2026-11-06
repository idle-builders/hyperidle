import type {
	AgentOrchestrationConnectionCreateInput,
	AgentOrchestrationRunConfigPatch,
} from "@hyperidle/api-contract";
import type { InheritedReach } from "@hyperidle/connections";
import { type HyperIdleEnv, validateBody } from "@hyperidle/domain-model/http";
import {
	addSpaceFolder,
	type DEFAULT_AGENT_RUN_CONFIG,
	ensureAgentSpace,
	listSpaceFolders,
	readAgentRunConfig,
	readAgentRunConfigs,
	removeSpaceFolder,
	writeAgentRunConfig,
} from "@hyperidle/run-orchestration";
import type { RunnerDb } from "@hyperidle/runner-db";
import { Hono } from "hono";
import { z } from "zod";
import { isPrivateHostLiteral } from "../ssrf.js";
import {
	createConnectionForUser,
	listConnectionsForUser,
	removeConnectionForUser,
	withholdConnectionForUser,
} from "./connections.js";

export function createAgentOrchestrationIntakeRoutes(
	runnerDb: RunnerDb,
	/**
	 * The `folders`/`connections` families' own extras: the reach
	 * cache `connections.list` unions in, and the cipher `connections.add`
	 * encrypts a held token with. Both already exist at this Layer's
	 * composition root (`app.ts`) for the public `/connections` route; the
	 * seam reuses them rather than building a second copy.
	 */
	extras?: {
		readonly inheritedReach?: InheritedReach;
		readonly cipher?: {
			readonly encrypt: (plaintext: string) => string;
			readonly decrypt: (ciphertext: string) => string | null;
		};
	},
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();
	const inheritedReach = extras?.inheritedReach;
	const encrypt =
		extras?.cipher?.encrypt ??
		(() => {
			throw new Error("Encryption secret not configured");
		});

	// ── runConfig.read — GET /agent-orchestration/run-config/:agentId ────────
	router.get("/run-config/:agentId", async (c) => {
		const config = await readAgentRunConfig(runnerDb, c.req.param("agentId"));
		return c.json({ config });
	});

	// ── runConfig.readBatch — POST /agent-orchestration/run-config/batch ─────
	// (POST, not GET+query-list: an agent roster can exceed a safe query-string length.)
	router.post(
		"/run-config/batch",
		validateBody(z.object({ agentIds: z.array(z.string().min(1)) })),
		async (c) => {
			const { agentIds } = c.req.valid("json");
			const configs =
				agentIds.length > 0
					? await readAgentRunConfigs(runnerDb, agentIds)
					: new Map<string, typeof DEFAULT_AGENT_RUN_CONFIG>();
			return c.json({ configs: Object.fromEntries(configs) });
		},
	);

	// ── runConfig.write — PATCH /agent-orchestration/run-config/:agentId ─────
	router.patch(
		"/run-config/:agentId",
		validateBody(
			z.object({
				harnessType: z.string().nullable().optional(),
				modelId: z.string().nullable().optional(),
				modelProvider: z.string().nullable().optional(),
				maxConcurrentSessions: z.number().optional(),
				// @lore: run-config patch schema — satisfies cannot catch a forgotten field; omitted fields strip silently at seam; add here when view gains one
				modelOptions: z
					.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
					.optional(),
				login: z.enum(["own", "owner"]).optional(),
				spacePath: z.string().nullable().optional(),
			}) satisfies z.ZodType<AgentOrchestrationRunConfigPatch>,
		),
		async (c) => {
			const patch = c.req.valid("json");
			await writeAgentRunConfig(runnerDb, c.req.param("agentId"), patch);
			return c.json({ ok: true });
		},
	);

	// ── runConfig.ensureSpace — POST /agent-orchestration/run-config/:agentId/ensure-space ─────────
	router.post(
		"/run-config/:agentId/ensure-space",
		validateBody(z.object({ agentName: z.string().min(1) })),
		async (c) => {
			const agentId = c.req.param("agentId");
			const { agentName } = c.req.valid("json");
			const spacePath = await ensureAgentSpace(runnerDb, agentId, agentName);
			return c.json({ spacePath });
		},
	);

	// ── spaceFolders.list — GET /agent-orchestration/space-folders/:agentId ───
	router.get("/space-folders/:agentId", async (c) => {
		const agentId = c.req.param("agentId");
		const config = await readAgentRunConfig(runnerDb, agentId);
		if (!config.spacePath) return c.json({ folders: [] });
		const folders = listSpaceFolders(config.spacePath);
		return c.json({ folders });
	});

	// ── spaceFolders.add — POST /agent-orchestration/space-folders/:agentId ──
	router.post(
		"/space-folders/:agentId",
		validateBody(
			z
				.object({
					path: z.string().min(1),
					name: z.string().min(1).optional(),
					agentName: z.string().min(1),
				})
				.strict(),
		),
		async (c) => {
			const agentId = c.req.param("agentId");
			const { path, name, agentName } = c.req.valid("json");
			const config = await readAgentRunConfig(runnerDb, agentId);
			let spacePath = config.spacePath;
			if (!spacePath) {
				spacePath = await ensureAgentSpace(runnerDb, agentId, agentName ?? "");
			}
			const result = addSpaceFolder(spacePath, path, name);
			return c.json(result);
		},
	);

	// ── spaceFolders.remove — POST /agent-orchestration/space-folders/:agentId/remove ──
	router.post(
		"/space-folders/:agentId/remove",
		validateBody(z.object({ name: z.string().min(1) }).strict()),
		async (c) => {
			const agentId = c.req.param("agentId");
			const { name } = c.req.valid("json");
			const config = await readAgentRunConfig(runnerDb, agentId);
			if (!config.spacePath) return c.json({ ok: false, code: "NOT_FOUND" });
			const result = removeSpaceFolder(config.spacePath, name);
			return c.json(result);
		},
	);

	// ── connections.list — GET /agent-orchestration/connections/:userId ──────
	router.get("/connections/:userId", async (c) => {
		const result = await listConnectionsForUser(runnerDb, c.req.param("userId"), inheritedReach);
		return c.json(result);
	});

	// Mirrors `createConnectionSchema` (`agent-orchestration/src/routes/connections.ts`) — a fresh
	// schema rather than a re-exported import, so this seam's own SSRF check stays a value this
	// file constructs, not one carried in from a sibling route file.
	const connectionCreateInputSchema = z.discriminatedUnion("authSource", [
		z.object({
			service: z.string().min(1).max(200),
			authSource: z.literal("token"),
			token: z.string().min(1).max(10_000),
		}),
		z.object({
			service: z.string().min(1).max(200).optional(),
			authSource: z.literal("mcp"),
			serverUrl: z
				.string()
				.min(1)
				.max(2000)
				.refine((u) => u.startsWith("https://"), { message: "serverUrl must be https://" })
				.refine(
					(u) => {
						try {
							return !isPrivateHostLiteral(new URL(u).hostname);
						} catch {
							return false;
						}
					},
					{ message: "serverUrl must not resolve to a private, loopback, or link-local address" },
				),
		}),
	]) satisfies z.ZodType<AgentOrchestrationConnectionCreateInput>;

	// ── connections.add — POST /agent-orchestration/connections/:userId ──────
	router.post("/connections/:userId", validateBody(connectionCreateInputSchema), async (c) => {
		const result = await createConnectionForUser(
			runnerDb,
			c.req.param("userId"),
			c.req.valid("json"),
			encrypt,
		);
		return c.json(result);
	});

	// ── connections.withhold — POST /agent-orchestration/connections/:userId/:id/withhold ──
	router.post(
		"/connections/:userId/:id/withhold",
		validateBody(z.object({ agentUserId: z.string().min(1), keep: z.boolean() })),
		async (c) => {
			const { agentUserId, keep } = c.req.valid("json");
			const result = await withholdConnectionForUser(
				runnerDb,
				c.req.param("userId"),
				c.req.param("id"),
				agentUserId,
				keep,
			);
			return c.json(result);
		},
	);

	// ── connections.remove — POST /agent-orchestration/connections/:userId/:id/remove ──
	router.post("/connections/:userId/:id/remove", async (c) => {
		const result = await removeConnectionForUser(runnerDb, c.req.param("userId"), c.req.param("id"));
		return c.json(result);
	});

	return router;
}
