import * as path from "node:path";
import type { FactoryRosterSpec } from "@hyperidle/shared";
import { defaultFactoryRoster } from "@hyperidle/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { HyperIdleDb } from "./connection.js";
import { agentRunConfig, knowledgeAppProjection, knowledgeItems, users } from "./schema.js";
import { COMMUNITY_DISPLAY_NAMES } from "./seed-fixtures.js";
import {
	readSystemPromptTemplate,
	SYSTEM_PROMPT_TEMPLATE_FILES,
} from "./system-prompt-templates.js";

/**
 * AU26 G1 — write an agent's run config from a seeder.
 *
 * @lore AU26 G1 (architecture §D-L): `agent_run_config` is owned by
 * `packages/agent-orchestration/agent-run-config`, and every non-test caller is
 * supposed to go through that Service. This seeder cannot: it lives in
 * `packages/db`, and every owning Service's dependency closure is
 * `{@hyperidle/db, @hyperidle/shared}` — so `db -> agent-run-config` would be a
 * cycle. AU26 increment **D2a** closes this properly by relocating
 * `factory-bootstrap.ts` and `demo-fixture.ts` above the Services (into
 * `packages/core-api/src/bootstrap/`), where they can call the real writers.
 * Until then this direct write is the SAME pre-existing exception the
 * neighbouring `users` / `knowledge_items` writes in this file already are —
 * it does not create a new class of violation, and `npm run census:tables`
 * counts it so the debt stays visible.
 *
 * Upsert, not insert: `applyFactoryBootstrap` runs on every desktop launch and
 * must stay idempotent, and an upgrading install needs its existing rows
 * patched with the runnable defaults (the behaviour the pre-move
 * `UPDATE users SET harness_type = 'builtin' …` had).
 */
async function upsertRunConfig(
	db: HyperIdleDb,
	agentUserId: string,
	patch: {
		readonly systemPrompt?: string | null;
		readonly harnessType?: string | null;
		readonly modelId?: string | null;
		readonly modelProvider?: string | null;
		readonly maxConcurrentSessions?: number;
	},
): Promise<void> {
	await db
		.insert(agentRunConfig)
		.values({
			agentUserId,
			systemPrompt: patch.systemPrompt ?? null,
			harnessType: patch.harnessType ?? null,
			modelId: patch.modelId ?? null,
			modelProvider: patch.modelProvider ?? null,
			maxConcurrentSessions: patch.maxConcurrentSessions ?? 1,
		})
		.onConflictDoUpdate({ target: agentRunConfig.agentUserId, set: { ...patch } });
}

/**
 * Apply the factory bootstrap layer — team-agnostic, idempotent baseline rows
 * that every HyperIdle environment needs to function.
 *
 * Inserts:
 *   - `system:propagation` system user (DB infra — always written unconditionally)
 *   - `seed-agent-cos` system-assistant singleton (iff roster.systemAssistant non-null)
 *   - one facilitator agent per roster.facilitators entry (roster-driven)
 *   - `knowledge_items` + `knowledge_app_projection`: the factory principle seed-ki-1 (DB infra)
 *
 * @lore AU18: system prompt templates are no longer cached as
 * `factory_settings.system_template:<role>` rows — that table is retired.
 * Templates are read directly from `docs/system-prompts/*.md` via the
 * shared `SYSTEM_PROMPT_TEMPLATE_FILES` map + `readSystemPromptTemplate`
 * (system-prompt-templates.ts) for the roster-driven backfill below. The
 * `cost_cap`/`cost_cycle` KV seeds were gone by AU18 (moved to
 * `server_config.cost.capMinor`; `cost_cycle` had zero readers and was
 * dropped). @lore AU21 Increment 14a: `server_config.cost` itself is now
 * HARD-DELETED along with the rest of the cost-cap/accounting feature — no
 * replacement, no successor config field.
 *
 * Does NOT insert teams, team_members, routines, bets, tasks, or any human users.
 * These are created at onboarding or by the demo fixture.
 *
 * Safe to call on every desktop launch and every deploy — all writes use
 * onConflictDoNothing / onConflictDoUpdate for idempotency.
 *
 * @lore AF17: split from the monolithic seed() which welded factory rows, demo
 * data (demo team), and team-provisioning. The split enforces hard-rule 1:
 * "No team_id on factory rows." and hard-rule 5: "No demo data in production."
 *
 * @lore AK6: `roster` is the AK6 registry-free injection seam. The DEFAULT is the
 * Fabric's factory roster so all four registry-less boot paths (desktop + 3 leaf CLIs)
 * call `applyFactoryBootstrap(db)` with NO second arg and get the Fabric roster
 * unchanged (AF17 green). A server that wants Minimal active passes minimalFactoryRoster.
 *
 * @lore AK6: The bootstrap-swap exception is BOUNDED and legitimate. The leaf/desktop
 * boot paths (packages/desktop/src/main.ts, setup-cli.ts, bootstrap-pg.ts,
 * seed-pg-cli.ts) call `applyFactoryBootstrap(db)` with NO roster arg and seed the
 * *default* Fabric roster because they run before any Strategy is registered.
 * Third-party rosters are honored only on the server boot path (which passes the
 * active Strategy's spec). This does not violate AC2 because the leaf path carries
 * a *value* (the default), not a Kernel roster decision.
 */
export async function applyFactoryBootstrap(
	db: HyperIdleDb,
	roster: FactoryRosterSpec = defaultFactoryRoster,
): Promise<void> {
	const now = new Date().toISOString();

	// ── system:propagation — DB infra, ALWAYS written unconditionally ──
	// @lore L20: messages.senderId references users.id. This user must exist
	// before any propagation-triggered review thread can be created.
	// AB0: system users have null agentCategory (they are not real agents).
	await db
		.insert(users)
		.values({
			id: "system:propagation",
			kind: "ai",
			name: "Propagation System",
			role: "system",
			agentCategory: null,
			status: "active",
			createdAt: now,
		})
		.onConflictDoNothing();

	// ── System Agent singleton — ROSTER-DRIVEN (iff roster.systemAssistant non-null) ──
	// @lore AD8a: seed-agent-cos renamed from "Chief of Staff" to "System Agent".
	// @lore AD8b: chief_of_staff role renamed to assistant; agentCategory: individual.
	if (roster.systemAssistant !== null) {
		const cosId = roster.systemAssistant.idHint;
		await db
			.insert(users)
			.values({
				id: cosId,
				kind: "ai",
				name: "System Agent",
				role: "assistant",
				agentCategory: "individual",
				status: "active",
				createdAt: now,
			})
			.onConflictDoNothing();

		// AH2: runnable defaults so the agent can start without configuration.
		// Written on every call (upsert), so an existing row gets them on upgrade.
		await upsertRunConfig(db, cosId, {
			harnessType: "builtin",
			modelId: "claude-sonnet-4-6",
			modelProvider: "anthropic",
			maxConcurrentSessions: 1,
		});
	}

	// ── Facilitator agents — ROSTER-DRIVEN (one per roster.facilitators entry) ──
	// @lore AD8c: renamed from "Practice Facilitator" (role: practice_facilitator) to
	// "Facilitator" (role: facilitator). System prompt file: facilitator.md.
	// Factory agents: agentCategory="strategy", team_id=null.
	// @lore AK6 NIT-1 (architecture-critique): facilitator name is DERIVED from
	// `community` by the db-bootstrap (COMMUNITY_DISPLAY_NAMES stays db-owned
	// infra). The spec carries only the roster COMPOSITION.
	// @lore AU26 G1: the `skills` half of that derivation is gone — the column was
	// dropped (zero production readers) rather than relocated.
	for (const f of roster.facilitators) {
		const displayName =
			COMMUNITY_DISPLAY_NAMES[f.community as keyof typeof COMMUNITY_DISPLAY_NAMES] ?? f.community;
		await db
			.insert(users)
			.values({
				id: f.idHint,
				kind: "ai",
				name: `${displayName} Facilitator`,
				role: f.role,
				agentCategory: "strategy",
				teamId: null,
				status: "active",
				createdAt: now,
			})
			.onConflictDoNothing();
		// AH2: runnable defaults so factory agents can start without configuration.
		await upsertRunConfig(db, f.idHint, {
			harnessType: "builtin",
			modelId: "claude-sonnet-4-6",
			modelProvider: "anthropic",
			maxConcurrentSessions: 1,
		});
	}

	// ── System prompt templates from docs/system-prompts/ — read directly, no cache table ──
	// @lore X3 / AU18: We read files at bootstrap time. If a file is missing, the template
	// is silently skipped (graceful degradation). Process CWD during seeding is the
	// monorepo root where docs/ lives.
	// @lore AK1: Directory renamed from old variant to docs/system-prompts/ in AK1 harness-vocab rename.
	// @lore AU18: previously cached each role's content into a `factorySettings.system_template:<role>`
	// row before this backfill; that table is retired. The map + reader are now the single
	// shared source (system-prompt-templates.ts), consumed here AND by roster.ts/agents.ts at
	// request time — one role→filename source, not a bootstrap-only cache.
	const docsRoot = path.resolve(process.cwd(), "docs");
	const templateValues: Record<string, string> = {};
	for (const [role, filename] of Object.entries(SYSTEM_PROMPT_TEMPLATE_FILES)) {
		const content = readSystemPromptTemplate(docsRoot, filename);
		if (content !== null) {
			templateValues[role] = content;
		}
	}

	// ── Backfill systemPrompt on roster-driven factory agents from role-based templates ──
	// Scoped to the roster's own agent ids (system:propagation is infra — not roster-driven).
	const rosterAgentIds: string[] = [];
	if (roster.systemAssistant !== null) {
		rosterAgentIds.push(roster.systemAssistant.idHint);
	}
	for (const f of roster.facilitators) {
		rosterAgentIds.push(f.idHint);
	}

	if (rosterAgentIds.length > 0) {
		for (const [role, template] of Object.entries(templateValues)) {
			// AU26 G1: `systemPrompt` moved to `agent_run_config`, so the role-scoped
			// backfill resolves the matching ids off `users` first, then writes the
			// prompt to the run-config rows. Same set of agents, same values.
			const matching = await db
				.select({ id: users.id })
				.from(users)
				.where(and(eq(users.role, role), eq(users.kind, "ai"), inArray(users.id, rosterAgentIds)));
			for (const { id } of matching) {
				await upsertRunConfig(db, id, { systemPrompt: template });
			}
		}
	}

	// ── AB0: Backfill agentCategory on all ai users by role (idempotent) ──
	// This covers any existing rows that may not have agentCategory set.
	const categoryByRole: Record<string, string> = {
		builder: "team",
		growth: "team",
		product_manager: "team",
		brand_voice: "team",
		designer: "team",
		qa_engineer: "team",
		ops: "team",
		support: "team",
		sales: "team",
		content: "team",
		data_analyst: "team",
		// @lore AD8c: renamed from practice_facilitator
		facilitator: "strategy",
		scout: "strategy",
		infra: "strategy",
		platform: "strategy",
		assistant: "individual",
	};
	for (const [role, category] of Object.entries(categoryByRole)) {
		await db
			.update(users)
			.set({ agentCategory: category })
			.where(and(eq(users.role, role), eq(users.kind, "ai")));
	}

	// ── Factory principle knowledge item — DB infra ──
	// @lore Q2: scopeKind defaults to "factory" (factory-level principle applies to all).
	// @lore F2: explicit scopeKind="factory" required; do not rely on DB default.
	await db
		.insert(knowledgeItems)
		.values({
			id: "seed-ki-1",
			scopeKind: "factory",
			scopeId: null,
			title: "Boil the Lake",
			body: "Solve the full problem, not a subset.",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "seed-agent-cos",
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();

	await db
		.insert(knowledgeAppProjection)
		.values({
			id: "seed-ksf-1",
			knowledgeItemId: "seed-ki-1",
			layer: "L4",
			kind: "principle",
		})
		.onConflictDoNothing();
}
