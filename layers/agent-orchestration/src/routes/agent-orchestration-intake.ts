import type {
	AgentOrchestrationConnectionCreateInput,
	AgentOrchestrationFolderCreateInput,
	AgentOrchestrationFolderListQuery,
	AgentOrchestrationReviewVerdictInput,
	AgentOrchestrationRunConfigPatch,
	AgentOrchestrationWorkIntentInput,
} from "@hyperidle/api-contract";
import type { InheritedReach } from "@hyperidle/connections";
import type { HyperIdleDb } from "@hyperidle/db";
import type { BakedAgentRunnableConfig } from "@hyperidle/domain-model";
import { type HyperIdleEnv, validateBody } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import { getFilesystem, saveInjection as saveFilesystemInjection } from "@hyperidle/filesystems";
import {
	type DEFAULT_AGENT_RUN_CONFIG,
	endRunForHandoff,
	readAgentRunConfig,
	readAgentRunConfigs,
	recordReviewSession,
	recordReviewVerdict,
	requestRunStopForTasks,
	writeAgentRunConfig,
} from "@hyperidle/run-orchestration";
import {
	enqueueWorkIntent,
	sessionRunRegistry,
	type WorkIntentInput,
} from "@hyperidle/session-requests";
import { Hono } from "hono";
import { z } from "zod";
import { isPrivateHostLiteral } from "../ssrf.js";
import {
	createConnectionForUser,
	listConnectionsForUser,
	removeConnectionForUser,
} from "./connections.js";
import { listFolders, registerFolder, removeFolder, takeFolder } from "./filesystems.js";

const WORK_INTENT_KINDS = [
	"thread_turn",
	"task_run",
	"session_resume",
	"subscription_run",
] as const;

/** Audited cast: sourceKind and bakedRequest are wire-loose (string/unknown) at the port boundary; forwarded as-is, not narrowed. */
function toWorkIntentInput(body: AgentOrchestrationWorkIntentInput): WorkIntentInput {
	// session_resume carries a resume, not a start request; split keeps the cast audited per field on both branches
	if (body.kind === "session_resume") {
		return {
			kind: "session_resume",
			sourceKind: "review_verdict",
			sourceId: body.sourceId,
			requestedBy: body.requestedBy,
			idempotencyKey: body.idempotencyKey,
			resume: body.resume as Extract<WorkIntentInput, { kind: "session_resume" }>["resume"],
		};
	}
	return {
		kind: body.kind,
		sourceKind: body.sourceKind as Exclude<
			WorkIntentInput,
			{ kind: "session_resume" }
		>["sourceKind"],
		sourceId: body.sourceId,
		requestedBy: body.requestedBy,
		idempotencyKey: body.idempotencyKey,
		bakedRequest: body.bakedRequest as Exclude<
			WorkIntentInput,
			{ kind: "session_resume" }
		>["bakedRequest"],
	};
}

const workIntentInputSchema = z.object({
	kind: z.enum(WORK_INTENT_KINDS),
	sourceKind: z.string().min(1),
	sourceId: z.string().min(1),
	requestedBy: z.string().optional(),
	idempotencyKey: z.string().min(1),
	bakedRequest: z.unknown().optional(),
	resume: z.unknown().optional(),
}) satisfies z.ZodType<AgentOrchestrationWorkIntentInput>;

const gateLinkInputSchema = z.object({
	sessionId: z.string().min(1),
	reviewMessageId: z.string().min(1),
});

const gateVerdictInputSchema = z.object({
	reviewMessageId: z.string().min(1),
	decision: z.enum(["approve", "decline"]),
	decidedBy: z.string().min(1),
	threadId: z.string().min(1),
	// Carried opaque, like `bakedRequest` on the intent schema above. Declared
	// because zod strips what it does not name, and a silently dropped agent
	// config surfaces much later as "agent is not runnable".
	agentConfig: z.unknown().optional(),
}) satisfies z.ZodType<AgentOrchestrationReviewVerdictInput>;

export function createAgentOrchestrationIntakeRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
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

	// ── intents.submit — POST /agent-orchestration/intents ──────────────────
	router.post("/intents", validateBody(workIntentInputSchema), async (c) => {
		const body = c.req.valid("json");
		const intent = await enqueueWorkIntent(db, toWorkIntentInput(body));
		return c.json({ id: intent.id, idempotencyKey: intent.idempotencyKey });
	});

	// ── gate.linkReview — POST /agent-orchestration/review-links ────────────
	//
	router.post("/review-links", validateBody(gateLinkInputSchema), async (c) => {
		const body = c.req.valid("json");
		await recordReviewSession(
			db,
			{ reviewMessageId: body.reviewMessageId, sessionId: body.sessionId },
			new Date().toISOString(),
		);
		return c.json({ ok: true });
	});

	// ── intents.recordReviewVerdict — POST /agent-orchestration/review-verdicts ──
	//
	router.post("/review-verdicts", validateBody(gateVerdictInputSchema), async (c) => {
		const body = c.req.valid("json");
		// One audited cast, same idiom as `toWorkIntentInput`'s: the wire carries the
		// agent config opaque and nothing here inspects it, only forwards it.
		const outcome = await recordReviewVerdict(
			db,
			{
				reviewMessageId: body.reviewMessageId,
				decision: body.decision,
				decidedBy: body.decidedBy,
				threadId: body.threadId,
				...(body.agentConfig ? { agentConfig: body.agentConfig as BakedAgentRunnableConfig } : {}),
			},
			(input) => enqueueWorkIntent(db, input),
		);
		return c.json(outcome);
	});

	// ── runs.stopForTasks — POST /agent-orchestration/runs/stop-for-tasks ────
	//
	router.post(
		"/runs/stop-for-tasks",
		validateBody(
			z.object({
				taskIds: z.array(z.string().min(1)),
			}),
		),
		async (c) => {
			const body = c.req.valid("json");
			const stopped = await requestRunStopForTasks(db, eventBus, body.taskIds, (sessionId) =>
				sessionRunRegistry.abort(sessionId, "stop"),
			);
			return c.json({ stopped });
		},
	);

	// ── runs.endForHandoff — POST /agent-orchestration/runs/end-for-handoff ──
	router.post(
		"/runs/end-for-handoff",
		validateBody(z.object({ sessionId: z.string().min(1), endedAt: z.string().min(1) })),
		async (c) => {
			const body = c.req.valid("json");
			await endRunForHandoff(db, body.sessionId, body.endedAt);
			return c.json({ ok: true });
		},
	);

	// ── runConfig.read — GET /agent-orchestration/run-config/:agentId ────────
	router.get("/run-config/:agentId", async (c) => {
		const config = await readAgentRunConfig(db, c.req.param("agentId"));
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
					? await readAgentRunConfigs(db, agentIds)
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
			}) satisfies z.ZodType<AgentOrchestrationRunConfigPatch>,
		),
		async (c) => {
			const patch = c.req.valid("json");
			await writeAgentRunConfig(db, c.req.param("agentId"), patch);
			return c.json({ ok: true });
		},
	);

	// ── filesystems.getTeamId — GET /agent-orchestration/filesystems/:id/team ──
	// The team-consistency gate's pre-write read — see the port's own doc.
	router.get("/filesystems/:id/team", async (c) => {
		const filesystemId = c.req.param("id");
		const fs = await getFilesystem(db, filesystemId);
		return c.json({ teamId: fs?.teamId ?? null });
	});

	// ── filesystems.persistInjection — POST /agent-orchestration/filesystems/:id/injections/persist ──
	// Existence check + insert — the team-consistency gate (users + team_members) stays core-side;
	// only the persist crosses the seam.
	router.post(
		"/filesystems/:id/injections/persist",
		validateBody(z.object({ agentUserId: z.string().min(1) })),
		async (c) => {
			const filesystemId = c.req.param("id");
			const { agentUserId } = c.req.valid("json");
			const fs = await getFilesystem(db, filesystemId);
			if (fs == null) return c.json({ ok: false, code: "NOT_FOUND" }, 200);
			const now = new Date().toISOString();
			try {
				await saveFilesystemInjection(db, { agentUserId, filesystemId, createdAt: now });
			} catch (err) {
				const constraintMsg = (e: unknown): string => {
					if (!(e instanceof Error)) return String(e);
					const own = e.message.toLowerCase();
					if (
						e.message.includes("filesystem_injections_agent_user_id_filesystem_id_pk") ||
						own.includes("duplicate key") ||
						own.includes("unique constraint")
					)
						return e.message;
					return e.cause !== undefined ? constraintMsg(e.cause) : e.message;
				};
				const msg = constraintMsg(err);
				if (
					msg.includes("filesystem_injections_agent_user_id_filesystem_id_pk") ||
					msg.toLowerCase().includes("duplicate key") ||
					msg.toLowerCase().includes("unique constraint")
				) {
					return c.json({ ok: false, code: "CONFLICT" }, 200);
				}
				throw err;
			}
			return c.json({
				ok: true,
				injection: { agentUserId, filesystemId, createdAt: now },
			});
		},
	);

	// ── folders.list — POST /agent-orchestration/folders/list ────────────────
	// (POST, not GET+query: the query is a discriminated union — a team's own
	// folders or the folders given to one agent — same "structured input, not
	// a query string" reasoning `run-config.batch` already uses.)
	router.post(
		"/folders/list",
		validateBody(
			z.union([
				z.object({ teamId: z.string().min(1) }),
				z.object({ agentUserId: z.string().min(1) }),
			]) satisfies z.ZodType<AgentOrchestrationFolderListQuery>,
		),
		async (c) => {
			const query = c.req.valid("json");
			const folders = await listFolders(db, query);
			return c.json({ folders });
		},
	);

	const folderResourceRefSchema = z.discriminatedUnion("kind", [
		z.object({ kind: z.literal("code"), repo: z.string().min(1), branch: z.string().min(1) }),
		z.object({ kind: z.literal("doc_set"), folder: z.string().min(1) }),
	]);

	// ── folders.add — POST /agent-orchestration/folders ──────────────────────
	router.post(
		"/folders",
		validateBody(
			z.object({
				teamId: z.string().min(1),
				kind: z.enum(["code", "doc_set"]),
				connectionId: z.string().nullable().optional(),
				resourceRef: folderResourceRefSchema,
				writeback: z.enum(["git", "file", "none"]),
			}) satisfies z.ZodType<{ readonly teamId: string } & AgentOrchestrationFolderCreateInput>,
		),
		async (c) => {
			const { teamId, ...body } = c.req.valid("json");
			const result = await registerFolder(db, teamId, body);
			return c.json(result);
		},
	);

	// ── folders.remove — POST /agent-orchestration/folders/:id/remove ────────
	router.post("/folders/:id/remove", async (c) => {
		const result = await removeFolder(db, c.req.param("id"));
		return c.json(result);
	});

	// ── folders.take — POST /agent-orchestration/folders/:id/take ────────────
	// `give` is the SAME write as `filesystems.persistInjection` above, exposed
	// under the `folders` family too — no second route.
	router.post(
		"/folders/:id/take",
		validateBody(z.object({ agentUserId: z.string().min(1) })),
		async (c) => {
			const { agentUserId } = c.req.valid("json");
			const result = await takeFolder(db, c.req.param("id"), agentUserId);
			return c.json(result);
		},
	);

	// ── connections.list — GET /agent-orchestration/connections/:userId ──────
	router.get("/connections/:userId", async (c) => {
		const result = await listConnectionsForUser(db, c.req.param("userId"), inheritedReach);
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
			db,
			c.req.param("userId"),
			c.req.valid("json"),
			encrypt,
		);
		return c.json(result);
	});

	// ── connections.remove — POST /agent-orchestration/connections/:userId/:id/remove ──
	router.post("/connections/:userId/:id/remove", async (c) => {
		const result = await removeConnectionForUser(db, c.req.param("userId"), c.req.param("id"));
		return c.json(result);
	});

	return router;
}
