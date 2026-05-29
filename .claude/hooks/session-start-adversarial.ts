#!/usr/bin/env tsx
/**
 * SessionStart hook — adversarial-persona variant. Injects memory + raw
 * artifact paths only and drops the producer's free-form summaries so
 * critics, reviewers, and Cold DoD can't inherit the producer's framing.
 */
import {
	formatAdversarialContext,
	getActiveStory,
	readBrief,
	readMemory,
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
			// fall through
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
	if (!(memory || brief)) {
		emit("");
		return;
	}

	emit(formatAdversarialContext({ memory, brief }));
}

main().catch((err: unknown) => {
	const message = err instanceof Error ? err.message : String(err);
	process.stderr.write(`session-start-adversarial hook error: ${message}\n`);
	process.exit(0);
});
