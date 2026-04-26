import { agentSkills, agents, type HyperIdleDb, messages, sessions, threads } from "@hyperidle/db";
import { API_ERROR_CODES, type EventBus } from "@hyperidle/shared";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
import { applyAutonomyChange } from "../services/autonomy.js";

// L1: numeric ladder validator. Routes never see a non-conforming value
// because the schema rejects everything outside `1 | 2 | 3 | 4` first.
const autonomyLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

// @lore L1 review B3: skill_id has no `skills` table FK in this story
// (no `skills` table exists yet — that's a future story). The route layer
// is the only validation guard. Constrain the alphabet here so audit rows
// never carry path traversal markers or whitespace-laden junk; the
// regression tests in `agents-autonomy-routes.test.ts` pin this guard.
const skillIdSchema = z
	.string()
	.min(1)
	.max(128)
	.regex(/^[a-zA-Z0-9_-]+$/);

const updateSkillSchema = z.object({
	autonomyLevel: autonomyLevelSchema,
});

// @lore L1 review N1: rationale must reject control chars (0x00-0x08,
// 0x0E-0x1F, 0x7F). Tab (0x09), LF (0x0A), CR (0x0D) are kept legal so
// users can paste multi-line context. Empty string is normalized to
// `undefined` so the audit row stores `null` instead of `""`.
//
// We iterate code points instead of using a control-char regex literal —
// Biome's `noControlCharactersInRegex` rule would flag the regex form, and
// the explicit loop is clearer about intent anyway.
function containsForbiddenControlChar(s: string): boolean {
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if ((c >= 0x00 && c <= 0x08) || (c >= 0x0e && c <= 0x1f) || c === 0x7f) {
			return true;
		}
	}
	return false;
}

const rationaleSchema = z
	.string()
	.max(2000)
	.refine((v) => !containsForbiddenControlChar(v), "rationale contains control chars")
	.transform((v) => (v === "" ? undefined : v))
	.optional();

const patchAutonomySchema = z.object({
	skillId: skillIdSchema,
	level: autonomyLevelSchema,
	rationale: rationaleSchema,
});

// @lore L1: `changedBy` is hard-coded to "system" until the actor concept
// lands (planned for L2 with auth middleware). The shared helper accepts
// whatever string the caller passes; routes inject the constant here.
// L1 review N2: the `updatedBy` returned by GET/PATCH /:id/autonomy will
// therefore always be "system" until L2 adds the actor model.
const SYSTEM_ACTOR = "system";

const sendMessageSchema = z.object({
	senderId: z.string(),
	subject: z.string().optional(),
	body: z.string().min(1),
});

/**
 * Create Hono routes for agent endpoints (E6).
 */
export function createAgentRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

	// GET / — List all agents with active session counts
	router.get("/", (c) => {
		const allAgents = db.select().from(agents).all();
		const activeSessions = db.select().from(sessions).where(eq(sessions.state, "active")).all();

		const result = allAgents.map((agent) => ({
			...agent,
			activeSessions: activeSessions.filter((s) => s.agentId === agent.id).length,
		}));

		return c.json(result);
	});

	// GET /:id — Agent detail with skills
	router.get("/:id", (c) => {
		const agentId = c.req.param("id");
		const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();

		if (!agent) {
			return c.json({ error: "Agent not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const skills = db.select().from(agentSkills).where(eq(agentSkills.agentId, agentId)).all();

		return c.json({ ...agent, skills });
	});

	// PATCH /:id/skills/:skillId — Update autonomy level (legacy).
	//
	// @lore L1: superseded by `PATCH /:id/autonomy`; kept for the editor
	// migration window. Internally delegates to `applyAutonomyChange` so
	// the audit row + review-thread emission live in one place. Remove
	// once the UI fully migrates off this route.
	router.patch("/:id/skills/:skillId", validateBody(updateSkillSchema), (c) => {
		const agentId = c.req.param("id");
		const skillId = c.req.param("skillId");
		// TODO(L1 review M4): typed-router cleanup — the `"json" as never`
		// double-cast is project-wide tech debt. Threading the validated
		// schema type through every route handler requires a generic
		// `Hono<{ in: { json: T } }>` rewrite that's out of scope for L1.
		const body = c.req.valid("json" as never) as z.infer<typeof updateSkillSchema>;

		const existing = db
			.select()
			.from(agentSkills)
			.where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillId, skillId)))
			.get();

		if (!existing) {
			return c.json({ error: "Agent skill not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		applyAutonomyChange(db, eventBus, {
			agentId,
			skillId,
			level: body.autonomyLevel,
			rationale: null,
			changedBy: SYSTEM_ACTOR,
		});

		const updated = db
			.select()
			.from(agentSkills)
			.where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillId, skillId)))
			.get();

		return c.json(updated);
	});

	// GET /:id/autonomy — list per-skill ladder rows (L1).
	router.get("/:id/autonomy", (c) => {
		const agentId = c.req.param("id");

		const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
		if (!agent) {
			return c.json({ error: "Agent not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const rows = db.select().from(agentSkills).where(eq(agentSkills.agentId, agentId)).all();

		const projected = rows.map((r) => ({
			skillId: r.skillId,
			level: r.autonomyLevel,
			updatedAt: r.updatedAt,
			updatedBy: r.updatedBy,
		}));

		return c.json(projected);
	});

	// PATCH /:id/autonomy — upsert per-skill ladder + audit (L1).
	router.patch("/:id/autonomy", validateBody(patchAutonomySchema), (c) => {
		const agentId = c.req.param("id");
		// TODO(L1 review M4): typed-router cleanup, see PATCH /:id/skills/:skillId.
		const body = c.req.valid("json" as never) as z.infer<typeof patchAutonomySchema>;

		const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
		if (!agent) {
			return c.json({ error: "Agent not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const result = applyAutonomyChange(db, eventBus, {
			agentId,
			skillId: body.skillId,
			level: body.level,
			rationale: body.rationale ?? null,
			changedBy: SYSTEM_ACTOR,
		});

		return c.json({
			skillId: result.skillId,
			level: result.level,
			updatedAt: result.updatedAt,
			updatedBy: result.updatedBy,
		});
	});

	// GET /:id/inbox — Agent's inbox with pagination
	router.get("/:id/inbox", (c) => {
		const agentId = c.req.param("id");

		const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
		if (!agent) {
			return c.json({ error: "Agent not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
		const offset = Number.parseInt(c.req.query("offset") ?? "0", 10) || 0;

		// @lore I6: sort at DB level BEFORE limit/offset so pagination is
		// consistent. Previously the sort happened in JS after slicing.
		const inbox = db
			.select()
			.from(messages)
			.where(eq(messages.recipientId, agentId))
			.orderBy(desc(messages.createdAt))
			.limit(limit)
			.offset(offset)
			.all();

		return c.json(inbox);
	});

	// POST /:id/inbox — Send message to agent
	router.post("/:id/inbox", validateBody(sendMessageSchema), (c) => {
		const recipientId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof sendMessageSchema>;

		const agent = db.select().from(agents).where(eq(agents.id, recipientId)).get();
		if (!agent) {
			return c.json({ error: "Agent not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const now = new Date().toISOString();

		// @lore I6: queries WHERE kind = 'direct' instead of loading all threads.
		const directThreads = db.select().from(threads).where(eq(threads.kind, "direct")).all();
		let threadId: string | undefined;

		for (const thread of directThreads) {
			if (thread.participants) {
				const participants = JSON.parse(thread.participants) as string[];
				if (
					participants.includes(body.senderId) &&
					participants.includes(recipientId) &&
					participants.length === 2
				) {
					threadId = thread.id;
					break;
				}
			}
		}

		// Create thread if none exists
		if (!threadId) {
			threadId = crypto.randomUUID();
			db.insert(threads)
				.values({
					id: threadId,
					kind: "direct",
					participants: JSON.stringify([body.senderId, recipientId]),
					createdAt: now,
				})
				.run();
		}

		const messageId = crypto.randomUUID();
		db.insert(messages)
			.values({
				id: messageId,
				senderId: body.senderId,
				recipientId,
				threadId,
				subject: body.subject ?? null,
				body: body.body,
				createdAt: now,
			})
			.run();

		const created = db.select().from(messages).where(eq(messages.id, messageId)).get();
		return c.json(created, 201);
	});

	return router;
}
