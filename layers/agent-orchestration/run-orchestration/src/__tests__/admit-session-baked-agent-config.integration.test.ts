/**
 * `admitSession` admits purely from the baked snapshot on `params.agentConfig`
 * — `SessionLifecyclePorts` carries no live users/settings/routine/
 * agentRunnability field to consult, so nothing about runnability, MCP
 * plugin config, or cost is ever read live. The Phase 1 kind/status check is
 * defense-in-depth only, not a live authority gate: a bad bake still throws
 * `TargetAgentNotRunnableError` even when the live row is runnable, and a
 * good bake still admits even when the live row was deactivated after emit.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { afterEach, describe } from "vitest";
import {
	buildNeverCalledPorts,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	rejectingHarnessAdapter,
} from "../__testing__/test-fixtures.js";
import { TargetAgentNotRunnableError } from "../errors.js";
import { createProvisioner } from "../provisioner.js";

function buildDeps(db: HyperIdleDb, sandboxPath: string): ProvisionSessionDeps {
	return {
		db,
		eventBus: new EventBus(),
		adapterPool: {
			select: () => ({
				id: "fake-adapter",
				adapter: rejectingHarnessAdapter(),
				meta: {
					name: "Fake",
					kind: "local",
					type: undefined,
					modelProviders: [],
					maxConcurrent: 5,
				},
			}),
			release: () => undefined,
			describeSelectFailure: () => "test pool selected nothing",
		},
		workspace: {
			// A real workspace adapter always materializes the directory it hands
			// back (LocalSandboxAdapter.spawn) — admitSession's post-mount
			// `ensureSandboxGitRepo` step depends on that, so this fake must honor it too.
			spawn: async () => {
				fs.mkdirSync(sandboxPath, { recursive: true });
				return { sandboxId: "sbx-1", path: sandboxPath };
			},
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			adopt: (path: string) => Promise.resolve({ sandboxId: "sb-adopted", path }),
			destroy: async () => undefined,
		},
	};
}

describe("admitSession — baked agent-runnability config", () => {
	const sandboxDirs: string[] = [];
	afterEach(() => {
		for (const dir of sandboxDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	function freshSandbox(): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "admit-session-baked-config-"));
		sandboxDirs.push(dir);
		return dir;
	}

	test("a bad bake still throws TargetAgentNotRunnableError, even when the live row is runnable", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		// The LIVE row is runnable — proving Phase 1 does not (and structurally
		// cannot: `SessionLifecyclePorts` carries no `users` field at all)
		// consult it. Only the BAKED snapshot on `params.agentConfig` governs.
		await db.insert(users).values({
			id: "runnable-agent",
			kind: "ai",
			name: "Agent One",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		const [liveRunnableAgent] = await db.select().from(users).where(eq(users.id, "runnable-agent"));
		if (!liveRunnableAgent) throw new Error("fixture insert failed");

		const sandboxPath = freshSandbox();
		const ports = buildNeverCalledPorts();
		const provisioner = createProvisioner(ports);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "runnable-agent",
			productId: "task-free",
			sandboxBasePath: sandboxPath,
			// The BAKED snapshot (what the emit-time resolver produced) says this
			// agent is NOT runnable — deliberately mismatched from the live row
			// above to isolate which source of truth Phase 1 consults.
			agentConfig: {
				kind: "human",
				status: "archived",
				role: "builder",
				teamId: null,
			},
		};

		await expect(
			provisioner.admit(buildDeps(db as HyperIdleDb, sandboxPath), params),
		).rejects.toBeInstanceOf(TargetAgentNotRunnableError);
	});

	test("a missing bake (agentConfig absent entirely) is a hard provisioning failure, never a silent allow", async ({
		db,
	}) => {
		const sandboxPath = freshSandbox();
		const ports = buildNeverCalledPorts();
		const provisioner = createProvisioner(ports);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "no-such-agent",
			productId: "task-free",
			sandboxBasePath: sandboxPath,
			// No `agentConfig` at all — every real durable path bakes one.
		};

		await expect(
			provisioner.admit(buildDeps(db as HyperIdleDb, sandboxPath), params),
		).rejects.toBeInstanceOf(TargetAgentNotRunnableError);
	});

	test("a well-formed baked snapshot admits successfully with zero live read — an agent deactivated in the live row after emit still admits, by design", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "deactivated-live-agent",
			kind: "ai",
			name: "Agent Two",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		// The agent is deactivated in the LIVE row after the snapshot below was
		// baked. There is no mechanism left to consult this live row at all —
		// admission must succeed purely from the bake.
		await db
			.update(users)
			.set({ status: "archived" })
			.where(eq(users.id, "deactivated-live-agent"));

		const sandboxPath = freshSandbox();
		const ports = buildNeverCalledPorts();
		const provisioner = createProvisioner(ports);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "deactivated-live-agent",
			productId: "task-free",
			sandboxBasePath: sandboxPath,
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
			},
		};

		const admitted = await provisioner.admit(buildDeps(db as HyperIdleDb, sandboxPath), params);
		expect(admitted).toBeDefined();
		expect(admitted.sessionId).toEqual(expect.any(String));
		// `ensureSandboxGitRepo`'s only production call site (provisioner.ts's
		// admit, post-mount) — a fresh `mkdtempSync` directory makes this a real,
		// fixable-red check rather than one a reused fixed path would pass anyway.
		expect(fs.existsSync(path.join(sandboxPath, ".git"))).toBe(true);
	});

	test("the baked persona becomes the session's systemPromptText", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "ba9f-agent",
			kind: "ai",
			name: "Atlas",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		const sandboxPath = freshSandbox();
		const ports = buildNeverCalledPorts();
		const provisioner = createProvisioner(ports);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "ba9f-agent",
			productId: "team-1",
			sandboxBasePath: sandboxPath,
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: "team-1",
				persona: "You are Atlas. You never ship broken builds.",
			},
			harnessDisabled: [],
			contextBundle: {
				kind: "subscription",
				subscription: { id: "subscription-1", event: "task.changed", schedule: null },
				prompt: null,
				change: null,
				agent: { id: "ba9f-agent", name: "Atlas", role: "builder" },
				team: { id: "team-1", name: "Team" },
				documents: [],
			},
		};

		const admitted = await provisioner.admit(buildDeps(db as HyperIdleDb, sandboxPath), params);

		// Every session's context also carries the standing instruction to ask
		// for a review when work deserves a person's agreement, so the persona is
		// the start of this rather than the whole of it.
		expect(admitted.systemPromptText).toContain("You are Atlas. You never ship broken builds.");
		expect(admitted.systemPromptText.startsWith("You are Atlas.")).toBe(true);
	});

	test("an agent with no identity document runs with no persona, not a broken one", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "ba9f-agent-none",
			kind: "ai",
			name: "Nameless",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		const sandboxPath = freshSandbox();
		const ports = buildNeverCalledPorts();
		const provisioner = createProvisioner(ports);

		const admitted = await provisioner.admit(buildDeps(db as HyperIdleDb, sandboxPath), {
			taskId: null,
			agentId: "ba9f-agent-none",
			productId: "team-1",
			sandboxBasePath: sandboxPath,
			agentConfig: { kind: "ai", status: "active", role: "builder", teamId: "team-1" },
			harnessDisabled: [],
			contextBundle: {
				kind: "subscription",
				subscription: { id: "subscription-1", event: "task.changed", schedule: null },
				prompt: null,
				change: null,
				agent: { id: "ba9f-agent-none", name: "Nameless", role: "builder" },
				team: { id: "team-1", name: "Team" },
				documents: [],
			},
		});

		// Empty, so `assemblePrompt` emits no "## Identity" section at all —
		// proven by `context-assembly-prompt.test.ts`.
		// No identity document means no persona — but the review instruction is
		// unconditional, so what remains is that and nothing else.
		expect(admitted.systemPromptText).not.toContain("You are");
		expect(admitted.systemPromptText).toContain("send_message");
	});
});
