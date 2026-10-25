import type { SessionRow, UserRow } from "@hyperidle/domain-model";
import { initials } from "./sidebar-lists";

/** Someone you can @mention: agents and people are the same kind of thing, in one list. */
export interface Mentionable {
	readonly id: string;
	readonly name: string;
	readonly initials: string;
	readonly human: boolean;
	/** What they do: whose agent, or a person, and their craft. */
	readonly what: string;
	/** How busy they are: an agent's running sessions; a person only says when away. */
	readonly load: string;
}

export function mentionables(
	users: readonly UserRow[],
	running: readonly SessionRow[],
	you: string,
): Mentionable[] {
	const byId = new Map(users.map((u) => [u.id, u]));
	return users
		.filter((u) => u.id !== you && u.role !== "system" && u.status !== "retired")
		.map((u) => {
			const human = u.kind === "human";
			const owner = u.ownerUserId ? byId.get(u.ownerUserId) : undefined;
			const whose = human
				? "Person"
				: u.ownerUserId === you
					? "Your agent"
					: owner
						? `${owner.name.split(" ")[0]}'s agent`
						: "Agent";
			const n = running.filter((s) => s.agentId === u.id).length;
			return {
				id: u.id,
				name: u.name,
				initials: initials(u.name),
				human,
				what: u.discipline ? `${whose} · ${u.discipline}` : whose,
				load: human ? (u.status === "active" ? "" : "away") : n > 0 ? `${n} running` : "idle",
			};
		});
}

/** Names that start with what was typed come first, then names that contain it. */
export function matching(all: readonly Mentionable[], query: string): Mentionable[] {
	const q = query.toLowerCase();
	const starts = all.filter((m) => m.name.toLowerCase().startsWith(q));
	const contains = all.filter(
		(m) => !m.name.toLowerCase().startsWith(q) && m.name.toLowerCase().includes(q),
	);
	return [...starts, ...contains];
}

/** The `@query` being typed right before the caret, if any. */
export function typedMention(text: string, caret: number): { at: number; query: string } | null {
	const before = text.slice(0, caret);
	const m = /(?:^|\s)@([^@\n]{0,40})$/.exec(before);
	if (!m || m[1] === undefined) return null;
	if (/\s\s/.test(m[1]) || m[1].startsWith(" ")) return null;
	return { at: caret - m[1].length - 1, query: m[1] };
}
