/**
 * Uninstalling a plugin archives its skills; installing it again has to bring
 * them back.
 *
 * `upsertPluginDocument`'s conflict-update deliberately leaves `body` alone so a
 * person's edit survives a reinstall (D5: your edit wins). It also left
 * `status` alone, which is a different thing entirely: an archived row stayed
 * archived, and `fetchCapabilityItems` only returns `active` ones. So after an
 * uninstall/reinstall the plugin reported `state: "enabled"`, its agent and
 * routines came back, and its skills silently reached no session at all.
 *
 * Found on the packaged app: a normal team agent ran with a sandbox holding one
 * knowledge file and no `.claude/skills` — with three factory-scoped skills
 * sitting in the database, all `archived`.
 *
 * @lore BA9g: "its agent and routines came back" was NOT true when this was
 * written — `insertUserIfAbsent` and `insertRoutine(onConflictDoNothing)` are
 * both no-ops on an existing row, so they stayed dead while the plugin reported
 * `enabled`. Skills were the only thing a reinstall revived. It is true now:
 * one lifecycle brings everything the plugin contributed back.
 */
import { type HyperIdleDb, knowledgeItems } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { upsertPluginDocument } from "../knowledge-repository.js";
import { assembleSessionKnowledge } from "../session-knowledge-assembler.js";

const TS = "2026-01-01T00:00:00.000Z";
const SKILL_ID = "ki_reinstall_probe";

function installInput(body: string) {
	return {
		id: SKILL_ID,
		pluginId: "knowledge-management",
		title: "knowledge-decay",
		scopeKind: "factory" as const,
		scopeId: null,
		topic: "plugin:knowledge-management",
		body,
		ts: TS,
	};
}

describe("reinstalling a plugin revives its skills", () => {
	test("an archived skill returns to active on reinstall, keeping the edited body", async ({
		db,
	}: {
		db: HyperIdleDb;
	}) => {
		await upsertPluginDocument(db, installInput("# Original body"));

		// A person edits it, then the plugin is uninstalled (which archives).
		await db
			.update(knowledgeItems)
			.set({ body: "# Edited by a person", status: "archived" })
			.where(eq(knowledgeItems.id, SKILL_ID));

		await upsertPluginDocument(db, installInput("# Original body"));

		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, SKILL_ID));
		expect(row?.status).toBe("active");
		// D5 still holds: the reinstall must not clobber the edit.
		expect(row?.body).toBe("# Edited by a person");
	});

	test("a revived skill actually reaches a session again", async ({ db }: { db: HyperIdleDb }) => {
		await upsertPluginDocument(db, installInput("# Sweep stale knowledge"));
		await db
			.update(knowledgeItems)
			.set({ status: "archived" })
			.where(eq(knowledgeItems.id, SKILL_ID));

		const whileArchived = await assembleSessionKnowledge(db, {
			teamId: "team-alpha",
			agentRole: "builder",
			taskDescription: "anything",
			agentId: "agent-in-team",
		});
		expect(whileArchived.map((i) => i.id)).not.toContain(SKILL_ID);

		await upsertPluginDocument(db, installInput("# Sweep stale knowledge"));

		const afterReinstall = await assembleSessionKnowledge(db, {
			teamId: "team-alpha",
			agentRole: "builder",
			taskDescription: "anything",
			agentId: "agent-in-team",
		});
		expect(afterReinstall.map((i) => i.id)).toContain(SKILL_ID);
	});
});
