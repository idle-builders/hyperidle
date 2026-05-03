#!/usr/bin/env bun
/**
 * SessionStart hook — injects runner-owned durable state into the system
 * prompt. Reads `.pipeline/active-story` to discover the current story id,
 * loads memory + brief (+ optional persona prefetch), and emits them as
 * additionalContext. Personas consume state via this injection, never by
 * calling Read on `.pipeline/`.
 *
 * Hook spec: https://docs.claude.com/en/docs/claude-code/hooks
 */
import {
	formatSessionContext,
	getActiveStory,
	readBrief,
	readMemory,
	readPrefetch,
} from "../../packages/pipeline/src/brief.ts";

interface SessionStartInput {
	cwd?: string;
}

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks).toString("utf-8");
}

function emit(additionalContext: string): void {
	process.stdout.write(
		`${JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "SessionStart",
				additionalContext,
			},
		})}\n`,
	);
}

async function main(): Promise<void> {
	const raw = await readStdin();
	let input: SessionStartInput = {};
	if (raw.trim()) {
		try {
			input = JSON.parse(raw) as SessionStartInput;
		} catch {
			// Hook stdin malformed; fall back to env-derived cwd.
		}
	}

	const cwd = input.cwd ?? process.env.HYPERIDLE_CWD ?? process.cwd();
	const storyId = process.env.HYPERIDLE_STORY_ID ?? getActiveStory(cwd);
	if (!storyId) {
		emit("");
		return;
	}

	const memory = readMemory(cwd, storyId);
	const brief = readBrief(cwd, storyId);
	const persona = process.env.HYPERIDLE_PERSONA ?? "";
	const prefetch = persona ? readPrefetch(cwd, storyId, persona) : null;

	if (!(memory || brief || prefetch)) {
		emit("");
		return;
	}

	emit(formatSessionContext({ memory, brief, prefetch }));
}

main().catch((err: unknown) => {
	const message = err instanceof Error ? err.message : String(err);
	process.stderr.write(`session-start hook error: ${message}\n`);
	process.exit(0); // never block session on hook failure
});
