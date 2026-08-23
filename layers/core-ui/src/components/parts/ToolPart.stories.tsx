/**
 * AM3 — ToolPart stories: the tool call Part renderer.
 *
 * Each story covers a different tool family / status combination.
 * Populates real states only (no loading/error variants — see approved.md).
 */

import type { JSX } from "react";
import type { Part, PartAuthor } from ".";
import { ToolPart } from "./ToolPart.js";

export default { title: "ToolPart", group: "Conversations" as const };

const AGENT: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

function makeToolPart(
	overrides: Partial<Extract<Part, { kind: "tool" }>>,
): Extract<Part, { kind: "tool" }> {
	return {
		id: "tp1",
		kind: "tool",
		author: AGENT,
		createdAt: "2026-06-22T14:00:00.000Z",
		embeds: [],
		verb: "Run command",
		target: "npm test",
		toolKind: "command",
		status: "ok",
		...overrides,
	} as Extract<Part, { kind: "tool" }>;
}

const noop = () => {};

export function ToolPartOk(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ToolPart
				part={makeToolPart({
					status: "ok",
					verb: "Run command",
					target: "npm test",
					toolKind: "command",
				})}
				onOpen={noop}
			/>
		</div>
	);
}

export function ToolPartFailed(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ToolPart
				part={makeToolPart({
					status: "failed",
					verb: "Run command",
					target: "npm test -- chat/stream",
					toolKind: "command",
					output:
						"FAIL  src/chat/__tests__/stream.test.ts\n  Expected: [{ type: 'text', text: 'hi' }]\n  Received: undefined\n\n  exit code 1",
				})}
				onOpen={noop}
			/>
		</div>
	);
}

export function ToolPartRunning(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ToolPart
				part={makeToolPart({
					status: "running",
					verb: "Spawn sub-agent",
					target: "verify streaming on Safari",
					toolKind: "sub-agent",
					opensSession: { sessionId: "sess-safari", label: "Safari verifier" },
				})}
				onOpen={noop}
			/>
		</div>
	);
}

export function ToolPartEdit(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ToolPart
				part={makeToolPart({
					status: "ok",
					verb: "Edit",
					target: "server/chat/stream.ts",
					toolKind: "edit",
					embeds: [
						{
							kind: "diff",
							label: "server/chat/stream.ts",
							meta: "+9/−2",
							target: { route: "artifact", artifactId: "server/chat/stream.ts" },
						},
					],
				})}
				onOpen={noop}
			/>
		</div>
	);
}

export function ToolPartMcp(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ToolPart
				part={makeToolPart({
					status: "ok",
					verb: "linear · search_issues",
					target: 'query: "AI SDK chat regression"',
					toolKind: "mcp",
					output:
						'linear.search_issues({ query: "AI SDK chat regression" })\n→ ENG-411  chat blank after send  (in progress)',
				})}
				onOpen={noop}
			/>
		</div>
	);
}

export function ToolPartGenericFallback(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ToolPart
				part={makeToolPart({
					status: "neutral",
					verb: "Custom exotic tool",
					target: "some-args",
					toolKind: "generic",
				})}
				onOpen={noop}
			/>
		</div>
	);
}
