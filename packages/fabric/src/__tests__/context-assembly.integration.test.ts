import * as fs from "node:fs";
import * as path from "node:path";
import {
	bets,
	type HyperIdleDb,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, test } from "@hyperidle/db/test-fixtures";
import { decode } from "@hyperidle/shared";
import type { ContextAssemblyConfig } from "../context-assembly.js";
import { assembleContext } from "../context-assembly.js";
import { create } from "../knowledge-repository.js";

function tmpDir(): string {
	return fs.mkdtempSync(path.join("/tmp", "mat-test-"));
}

async function seedTestData(db: HyperIdleDb): Promise<{
	productId: string;
	agentId: string;
	sessionId: string;
	taskId: string;
}> {
	const now = new Date().toISOString();
	const productId = "prod-1";
	const agentId = "agent-1";
	const teamId = "team-1";
	const betId = "bet-1";
	const taskId = "task-1";
	const threadId = "thread-1";
	const sessionId = "sess-1";

	// @lore U1: teams is the domain entity; teamMembers is the membership group.
	await db
		.insert(teams)
		.values({ id: productId, name: "TestProduct", phase: "build", createdAt: now });

	await db.insert(teamMembers).values({
		id: teamId,
		teamId: productId,
		capacity: 3,
		activeBets: 1,
		formedAt: now,
	});

	await db.insert(users).values({
		id: agentId,
		name: "BuilderBot",
		role: "builder",
		status: "active",
		teamId,
		createdAt: now,
	});

	// @lore U1: bets.teamId references teams (domain entity); description replaces pitch.
	await db.insert(bets).values({
		id: betId,
		teamId: productId,
		description: "Build the thing",
		appetite: "small",
		doneCondition: "Tests pass",
		status: "active",
		createdAt: now,
	});

	await db.insert(threads).values({
		id: threadId,
		hostKind: "task",
		hostId: "task-1",
		initiatorId: "agent-1",
		participants: JSON.stringify(["agent-1"]),
		lastActiveAt: now,
		createdAt: now,
	});

	await db.insert(tasks).values({
		id: taskId,
		betId,
		// @lore U1: tasks.teamId references teams (domain entity); productId removed.
		teamId: productId,
		ownerAgentId: agentId,
		title: "Implement feature X",
		description: "Build the context assembly engine",
		doneCondition: "All tests pass",
		state: "in_progress",
		threadId,
		createdAt: now,
		updatedAt: now,
	});

	await db.insert(sessions).values({
		id: sessionId,
		taskId,
		agentId,
		modelTier: "workhorse",
		startedAt: now,
		state: "active",
	});

	return { productId, agentId, sessionId, taskId };
}

describe("assembleContext", () => {
	let sandboxPath: string;

	beforeEach(() => {
		sandboxPath = tmpDir();
	});

	afterEach(() => {
		fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	// AC1: Assembled sandbox contains context/, work/, knowledge/ zones with correct permissions
	test("creates context/, knowledge/, work/ directory structure with context/ read-only files", async ({
		db,
	}) => {
		const { productId, agentId, sessionId, taskId } = await seedTestData(db);

		// Add an L4 factory item
		await create(db, {
			layer: "L4",
			kind: "principle",
			title: "PRINCIPLES.md",
			body: "# Factory Principles\nBe excellent.",
			format: "markdown",
			status: "active",
			updatedBy: "system",
		});

		const config: ContextAssemblyConfig = {
			sandboxPath,
			sessionId,
			taskId,
			agentId,
			agentRole: "builder",
			productId,
		};

		const result = await assembleContext(db, config);

		// Directories exist
		expect(fs.existsSync(path.join(sandboxPath, "context"))).toBe(true);
		expect(fs.existsSync(path.join(sandboxPath, "context/product"))).toBe(true);
		expect(fs.existsSync(path.join(sandboxPath, "context/practices"))).toBe(true);
		expect(fs.existsSync(path.join(sandboxPath, "context/factory"))).toBe(true);
		expect(fs.existsSync(path.join(sandboxPath, "knowledge"))).toBe(true);
		expect(fs.existsSync(path.join(sandboxPath, "knowledge/practices"))).toBe(true);
		expect(fs.existsSync(path.join(sandboxPath, "knowledge/decisions"))).toBe(true);
		expect(fs.existsSync(path.join(sandboxPath, "knowledge/failures"))).toBe(true);
		expect(fs.existsSync(path.join(sandboxPath, "work"))).toBe(true);
		expect(fs.existsSync(path.join(sandboxPath, "work/artifacts"))).toBe(true);

		// context/ files are read-only (0o444)
		// @lore I6: filenames now include truncated item ID suffix (e.g. PRINCIPLES_abcd1234.md)
		const factoryDir = path.join(sandboxPath, "context/factory");
		const factoryFiles = fs.readdirSync(factoryDir);
		const principlesFile = factoryFiles.find((f) => f.startsWith("PRINCIPLES"));
		expect(principlesFile).toBeDefined();
		if (!principlesFile) throw new Error("principlesFile not found");
		const factoryFile = path.join(factoryDir, principlesFile);
		const stat = fs.statSync(factoryFile);
		// Check read-only: owner write bit should be off
		expect(stat.mode & 0o222).toBe(0);

		expect(result.itemCount).toBeGreaterThan(0);
	});

	// AC2: .fabric/manifest.json exists with version tracking per item
	test("generates .fabric/manifest.json with version tracking", async ({ db }) => {
		const { productId, agentId, sessionId, taskId } = await seedTestData(db);

		const item = await create(db, {
			layer: "L4",
			kind: "principle",
			title: "PRINCIPLES.md",
			body: "# Principles",
			format: "markdown",
			status: "active",
			updatedBy: "system",
		});

		const config: ContextAssemblyConfig = {
			sandboxPath,
			sessionId,
			taskId,
			agentId,
			agentRole: "builder",
			productId,
		};

		await assembleContext(db, config);

		const manifestPath = path.join(sandboxPath, ".fabric/manifest.json");
		expect(fs.existsSync(manifestPath)).toBe(true);

		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
		expect(manifest.session_id).toBe(sessionId);
		expect(manifest.assembled_at).toBeDefined();
		expect(manifest.items[item.id]).toBeDefined();
		expect(manifest.items[item.id].version).toBe(1);
		expect(manifest.items[item.id].source_path).toContain("context/factory/");
		expect(manifest.items[item.id].format).toBe("markdown");
	});

	// AC3: Role-filtered practices: growth practices NOT assembled for a Builder
	test("filters L3 practices by agent role — builder does not get growth practices", async ({
		db,
	}) => {
		const { productId, agentId, sessionId, taskId } = await seedTestData(db);

		// Add building practice (should be assembled for builder)
		await create(db, {
			layer: "L3",
			scopeId: "building",
			kind: "pattern",
			title: "code-review.toon",
			body: "Always review code before merging",
			format: "toon",
			status: "active",
			updatedBy: "system",
		});

		// Add growth practice (should NOT be assembled for builder)
		await create(db, {
			layer: "L3",
			scopeId: "growth",
			kind: "pattern",
			title: "seo-practices.toon",
			body: "Optimize for search engines",
			format: "toon",
			status: "active",
			updatedBy: "system",
		});

		const config: ContextAssemblyConfig = {
			sandboxPath,
			sessionId,
			taskId,
			agentId,
			agentRole: "builder",
			productId,
		};

		await assembleContext(db, config);

		// Builder's practice should exist (filename now includes ID suffix)
		const practicesDir = path.join(sandboxPath, "context/practices");
		const practiceFiles = fs.existsSync(practicesDir) ? fs.readdirSync(practicesDir) : [];
		const buildingPractice = practiceFiles.find((f) => f.startsWith("code-review"));
		expect(buildingPractice).toBeDefined();

		// Growth practice should NOT exist
		const growthPractice = practiceFiles.find((f) => f.startsWith("seo-practices"));
		expect(growthPractice).toBeUndefined();
	});

	// AC4: Context assembly of 200 items completes in <10 seconds
	test("assembles context for 200 items in under 10 seconds", async ({ db }) => {
		const { productId, agentId, sessionId, taskId } = await seedTestData(db);

		// Create 200 knowledge items
		for (let i = 0; i < 200; i++) {
			await create(db, {
				layer: "L4",
				kind: "principle",
				title: `item-${i}.md`,
				body: `Content for item ${i}. This is test body content.`,
				format: "markdown",
				status: "active",
				updatedBy: "system",
			});
		}

		const config: ContextAssemblyConfig = {
			sandboxPath,
			sessionId,
			taskId,
			agentId,
			agentRole: "builder",
			productId,
		};

		const start = performance.now();
		const result = await assembleContext(db, config);
		const elapsed = performance.now() - start;

		expect(elapsed).toBeLessThan(10_000);
		expect(result.itemCount).toBe(200);
	});

	// AC5: Re-assembly overwrites workspace cleanly
	test("re-assembly overwrites workspace cleanly", async ({ db }) => {
		const { productId, agentId, sessionId, taskId } = await seedTestData(db);

		await create(db, {
			layer: "L4",
			kind: "principle",
			title: "PRINCIPLES.md",
			body: "Version 1",
			format: "markdown",
			status: "active",
			updatedBy: "system",
		});

		const config: ContextAssemblyConfig = {
			sandboxPath,
			sessionId,
			taskId,
			agentId,
			agentRole: "builder",
			productId,
		};

		// First context assembly
		await assembleContext(db, config);

		// Add a stale file that should be cleaned up
		fs.writeFileSync(path.join(sandboxPath, "context/factory/STALE.md"), "stale content");
		// Need to make it writable first since context is read-only
		fs.chmodSync(path.join(sandboxPath, "context/factory/STALE.md"), 0o644);

		// Re-assemble context
		await assembleContext(db, config);

		// Stale file should be gone
		expect(fs.existsSync(path.join(sandboxPath, "context/factory/STALE.md"))).toBe(false);

		// Original file should still exist (with ID suffix)
		const factoryDir2 = path.join(sandboxPath, "context/factory");
		const factoryFiles2 = fs.readdirSync(factoryDir2);
		expect(factoryFiles2.some((f) => f.startsWith("PRINCIPLES"))).toBe(true);
	});

	// AC6: session.toon context pack in context/ contains task state and bet context
	test("generates session.toon with task state and bet context", async ({ db }) => {
		const { productId, agentId, sessionId, taskId } = await seedTestData(db);

		const config: ContextAssemblyConfig = {
			sandboxPath,
			sessionId,
			taskId,
			agentId,
			agentRole: "builder",
			productId,
		};

		await assembleContext(db, config);

		const sessionToonPath = path.join(sandboxPath, "context/session.toon");
		expect(fs.existsSync(sessionToonPath)).toBe(true);

		const content = fs.readFileSync(sessionToonPath, "utf-8");
		const parsed = decode(content);

		// Verify task context
		expect(parsed.task).toBeDefined();
		const task = parsed.task as Record<string, unknown>;
		expect(task.id).toBe(taskId);
		expect(task.title).toBe("Implement feature X");
		expect(task.state).toBe("in_progress");

		// Verify bet context
		expect(parsed.bet).toBeDefined();
		const bet = parsed.bet as Record<string, unknown>;
		expect(bet.id).toBe("bet-1");
		// @lore U1: `description` replaces `pitch` in SessionContextData.bet.
		expect(bet.description).toBe("Build the thing");

		// Verify agent context
		expect(parsed.agent).toBeDefined();
		const agent = parsed.agent as Record<string, unknown>;
		expect(agent.id).toBe(agentId);
		expect(agent.role).toBe("builder");

		// Verify team context (@lore U1: formerly `product`, now `team` in session context)
		expect(parsed.team).toBeDefined();
		const product = parsed.team as Record<string, unknown>;
		expect(product.id).toBe(productId);
		expect(product.name).toBe("TestProduct");
	});
});
