/**
 * Context assembly has to work in a directory it has already written once.
 *
 * BA2: a resumed session runs in the directory of the session it is resuming —
 * the agent is coming back to its own work, and cursor-agent finds its chat by
 * an md5 of the cwd string, so anywhere else is contextless. Context files are
 * chmod-ed to 0444 after assembly so an agent cannot edit its own context, and a
 * plain rewrite over a read-only file fails with EACCES. That failure landed
 * before the agent ever started: the human approved, the session crashed, and
 * the answer reached nobody.
 *
 * The bundle path already survived this — it chmods and deletes the whole tree
 * first. The bundle-less path (which is the one a resume takes: a verdict
 * carries no task bundle) wrote straight over the file.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createContextAssembler } from "../context.js";

type ContextAssemblerPorts = Parameters<typeof createContextAssembler>[0];
type AssembleAgentContextFn = ReturnType<typeof createContextAssembler>["assembleAgentContext"];
type AssembleAgentContextInput = Parameters<AssembleAgentContextFn>[0];

/** Nothing here should be read — a bundle-less assembly is pure format-and-write. */
function poisonedPorts(): ContextAssemblerPorts {
	const poison = (name: string) => (): never => {
		throw new Error(`ports.${name} must not be called by a bundle-less assembly`);
	};
	return {
		knowledge: {
			list: poison("knowledge.list"),
			rankAndBudget: poison("knowledge.rankAndBudget"),
			countTokens: poison("knowledge.countTokens"),
		},
		work: { getTaskById: poison("work.getTaskById"), getBetById: poison("work.getBetById") },
		users: { getUserById: poison("users.getUserById") },
		routine: { getRoutineById: poison("routine.getRoutineById") },
		filesystems: { startWatcher: poison("filesystems.startWatcher") },
		org: { getTeamById: poison("org.getTeamById") },
	} as unknown as ContextAssemblerPorts;
}

function inputFor(sandboxPath: string, sessionId: string): AssembleAgentContextInput {
	return {
		sandboxPath,
		sessionId,
		taskId: null,
		agentId: "agent-reuse",
		agentRole: "builder",
		teamId: "team-reuse",
		isRoutine: false,
	} as unknown as AssembleAgentContextInput;
}

describe("assembleAgentContext in a directory it has already written", () => {
	let sandboxPath: string | undefined;
	afterEach(() => {
		if (sandboxPath) fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	test("rewrites the read-only session.toon instead of failing with EACCES", () => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba2-context-reuse-"));
		const assembler = createContextAssembler(poisonedPorts());

		assembler.assembleAgentContext(inputFor(sandboxPath, "session-first"));

		// What teardown leaves behind for a session awaiting a verdict: the file is
		// there and it is read-only.
		const toon = path.join(sandboxPath, "context/session.toon");
		fs.chmodSync(toon, 0o444);
		expect(fs.statSync(toon).mode & 0o200).toBe(0);

		// The resume assembles into the same directory.
		expect(() =>
			assembler.assembleAgentContext(inputFor(sandboxPath as string, "session-resumed")),
		).not.toThrow();

		expect(
			fs.readFileSync(toon, "utf8"),
			"the resumed session must see its own id, not the one that asked",
		).toContain("session-resumed");
	});
});
