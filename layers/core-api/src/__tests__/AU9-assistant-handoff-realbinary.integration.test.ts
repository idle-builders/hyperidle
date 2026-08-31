import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { SESSION_NOT_RETURNED_NOTICE_TEXT } from "@hyperidle/conversation";
import {
	agentRunConfig,
	agentSessionRequests,
	type HyperIdleDb,
	messages,
	sessions,
	threads,
	users,
} from "@hyperidle/db";
import {
	HARNESS_TEST_MODELS,
	requireHarness,
	type SupportedHarnessName,
} from "@hyperidle/harness-registry/test-utils";
import { createServer } from "@hyperidle/remote-server/create-server";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test } from "../__testing__/test-fixtures.js";

/**
 * The durable handoff: a real message posted over HTTP becomes one request, one
 * session, and one real reply — proven on every supported harness.
 *
 * LOCAL-ONLY LANE — real binaries, real model calls.
 *
 * @lore This was a `builtin`-only lane, which made it both the single proof of
 * the production HTTP -> durable poller -> session -> reply chain AND the one
 * that vanished with the built-in harness — taking the property with it. A
 * harness test covers every harness, so it now covers the four that remain.
 *
 * @lore Widening it surfaced what the built-in harness had been hiding.
 * `createServer` composes the MCP base URL from the port it is HANDED, before
 * binding — so `createServer(0, ...)` tells every spawned harness to dial
 * `http://localhost:0`, an address no bridge answers. The agent then has no
 * tools and cannot call `reply()`. The built-in harness never noticed, because
 * it calls tools in-process, so this lane passed for a year with the bridge
 * broken. Bind a real port first.
 *
 * @lore The model comes from the locked matrix and reaches the harness as
 * `SessionConfig.selectedModel`, with no credential resolved to produce it.
 */

/** A port the OS has just confirmed free, released before the server binds it. */
async function freePort(): Promise<number> {
	const probe = net.createServer();
	await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
	const address = probe.address();
	const port = address && typeof address !== "string" ? address.port : 0;
	await new Promise<void>((resolve) => probe.close(() => resolve()));
	if (port === 0) throw new Error("could not obtain a free port");
	return port;
}

const HARNESS_TYPE: Record<SupportedHarnessName, string> = {
	claude: "claude-code",
	codex: "codex",
	opencode: "opencode",
	"cursor-agent": "cursor-agent",
};

const sandboxRoots: string[] = [];
afterEach(() => {
	for (const dir of sandboxRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * A workspace root the harnesses will accept.
 *
 * @lore codex refuses to run outside a git repository unless told otherwise, and
 * the production args do not pass `--skip-git-repo-check` — a real session's
 * workspace IS a repo. An empty one satisfies it, and costs the others nothing.
 */
function makeSandboxRoot(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "au9-handoff-"));
	sandboxRoots.push(dir);
	execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
	execFileSync("git", ["commit", "--allow-empty", "-m", "init"], {
		cwd: dir,
		stdio: "ignore",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "au9",
			GIT_AUTHOR_EMAIL: "au9@test",
			GIT_COMMITTER_NAME: "au9",
			GIT_COMMITTER_EMAIL: "au9@test",
		},
	});
	return dir;
}

/**
 * The shared proof body. Every caller below keeps its own `describe` with a
 * LITERAL `requireHarness("<name>")`, so the breadth stays greppable: nothing
 * counts executions per harness any more, so reading the file is the only way to
 * see it. Do not collapse these into a loop.
 */
async function runDurableHandoffProof(
	harness: SupportedHarnessName,
	db: HyperIdleDb,
): Promise<void> {
	const harnessType = HARNESS_TYPE[harness];
	const locked = HARNESS_TEST_MODELS[harness];
	const humanId = `au9-${harness}-human`;
	const assistantId = `ast-${humanId}`;
	const threadId = `au9-${harness}-thread`;

	process.env.HYPERIDLE_API_KEY = "au9-real-key";
	const now = new Date().toISOString();
	await db.insert(users).values([
		{
			id: humanId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: assistantId,
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			status: "active",
			createdAt: now,
		},
	]);
	// @lore AU26 G1: the run config lives in `agent_run_config` — an
	// agent-orchestration-owned table the drain reads LIVE, not a `users` column
	// core baked at emit.
	await db.insert(agentRunConfig).values({
		agentUserId: assistantId,
		harnessType,
		modelId: locked.model,
	});
	await db.insert(threads).values({
		id: threadId,
		hostKind: "user",
		hostId: humanId,
		initiatorId: humanId,
		participants: JSON.stringify([humanId, assistantId]),
		lastActiveAt: now,
		createdAt: now,
	});
	// @lore A credential row was seeded here for a harness that "bills through a
	// key", so the key would resolve the production way. No harness is handed a
	// key any more — each authenticates through its own login — so there is
	// nothing to seed, and the OPENROUTER_API_KEY this lane used to demand is not
	// needed to run it.

	const port = await freePort();
	// `createServer` boots execution itself, against the
	// `http://localhost:<port>` it is about to serve — which is the only way a
	// spawned harness gets a bridge address it can actually dial.
	const server = await createServer(port, {
		db,
		topology: "local",
		sandboxBasePath: makeSandboxRoot(),
	});
	try {
		const response = await fetch(`http://127.0.0.1:${port}/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: { "X-API-Key": "au9-real-key", "Content-Type": "application/json" },
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Reply with exactly: durable handoff works" },
				clientKey: `au9-${harness}-message`,
			}),
		});
		expect(response.status).toBe(201);
		await expect
			.poll(
				async () =>
					(await db.select().from(messages).where(eq(messages.senderId, assistantId))).length,
				{ timeout: 240_000 },
			)
			.toBe(1);
		// AU27 Increment 6: the assistant flows through the SAME durable poller as
		// every other kind — no second execution entry (AC-5).
		expect(await db.select().from(agentSessionRequests)).toHaveLength(1);
		expect(await db.select().from(sessions)).toHaveLength(1);

		// A message merely EXISTING from the assistant is not proof of a reply: the
		// never-silent notice is ALSO authored as the assistant, so a turn that
		// never called `reply` would satisfy the row count. Assert the text the
		// prompt asked for, and rule the notice out explicitly.
		const [assistantReply] = await db
			.select()
			.from(messages)
			.where(eq(messages.senderId, assistantId));
		const payload = JSON.parse(assistantReply?.payload ?? "{}") as { text?: string };
		expect(
			payload.text,
			`assistant reply had no text payload on ${harness}: ${JSON.stringify(assistantReply)}`,
		).toBeDefined();
		expect(
			payload.text,
			`assistant reply on ${harness} was the never-silent notice — the agent never called reply()`,
		).not.toBe(SESSION_NOT_RETURNED_NOTICE_TEXT);
		expect(
			payload.text,
			`assistant reply on ${harness} did not contain the required text: ${payload.text}`,
		).toContain("durable handoff works");
	} finally {
		await server.dispose();
		delete process.env.HYPERIDLE_API_KEY;
	}
}

describe("[harness:claude] assistant durable handoff", () => {
	requireHarness("claude");
	test(
		"a real message reaches one request, one session, and a real reply",
		async ({ db }) => runDurableHandoffProof("claude", db),
		280_000,
	);
});

describe("[harness:codex] assistant durable handoff", () => {
	requireHarness("codex");
	test(
		"a real message reaches one request, one session, and a real reply",
		async ({ db }) => runDurableHandoffProof("codex", db),
		280_000,
	);
});

describe("[harness:opencode] assistant durable handoff", () => {
	requireHarness("opencode");
	test(
		"a real message reaches one request, one session, and a real reply",
		async ({ db }) => runDurableHandoffProof("opencode", db),
		280_000,
	);
});

describe("[harness:cursor-agent] assistant durable handoff", () => {
	requireHarness("cursor-agent");
	test(
		"a real message reaches one request, one session, and a real reply",
		async ({ db }) => runDurableHandoffProof("cursor-agent", db),
		280_000,
	);
});
