import type { Graph, GraphDoor, GraphSub, Touches } from "./trace-build.js";
import { rel } from "./trace-lib.js";

export type DoorKind = GraphDoor["kind"];

export interface DoorMatch {
	door: GraphDoor;
	via: string[];
}
export interface SubMatch {
	sub: GraphSub;
	via: string[];
}

export interface UsesResult {
	query: string;
	head: string;
	doors: DoorMatch[];
	subscribers: SubMatch[];
}

const doorKey = (d: GraphDoor): string => `${d.file}:${d.line}`;
const subKey = (s: GraphSub): string => `${s.file}:${s.line}`;

export function queryUses(graph: Graph, query: string, kindFilter: DoorKind | null): UsesResult {
	const q = query.toLowerCase();

	const touchesMatch = (t: Touches): string[] => {
		const via: string[] = [];
		for (const e of t.events) if (e.toLowerCase().includes(q)) via.push(`emits event ${e}`);
		for (const tb of t.tables) if (tb.toLowerCase().includes(q)) via.push(`touches table ${tb}`);
		for (const p of t.ports) if (p.toLowerCase().includes(q)) via.push(`port ${p}`);
		for (const c of t.calls) if (c.toLowerCase().includes(q)) via.push(`calls ${c}`);
		return [...new Set(via)];
	};

	const doorMatches = new Map<string, DoorMatch>();
	for (const door of graph.doors) {
		if (!door.touches) continue;
		const via = touchesMatch(door.touches);
		if (via.length > 0) doorMatches.set(doorKey(door), { door, via });
	}

	const subMatches = new Map<string, SubMatch>();
	for (const sub of graph.events.subs) {
		const via: string[] = [];
		if (sub.event.toLowerCase().includes(q)) via.push(`subscribes to ${sub.event}`);
		if (sub.touches) via.push(...touchesMatch(sub.touches));
		if (via.length > 0) subMatches.set(subKey(sub), { sub, via: [...new Set(via)] });
	}

	const seamByLeaf = new Map<string, { httpMethod: string; path: string; portMethod: string }>();
	for (const s of graph.seams) seamByLeaf.set(s.portMethod, s);
	const routeDoor = new Map<string, GraphDoor>();
	for (const d of graph.doors) {
		if (d.kind !== "ui") continue;
		routeDoor.set(d.label.replace(/\s+/g, " ").trim(), d);
	}
	const subsByEvent = new Map<string, GraphSub[]>();
	for (const s of graph.events.subs) {
		const list = subsByEvent.get(s.event) ?? [];
		list.push(s);
		subsByEvent.set(s.event, list);
	}

	for (let round = 0; round < 4; round++) {
		let grew = false;

		for (const sub of graph.events.subs) {
			const key = subKey(sub);
			if (subMatches.has(key) || !sub.touches) continue;
			const via: string[] = [];
			for (const e of sub.touches.events) {
				for (const downstream of subsByEvent.get(e) ?? []) {
					if (subMatches.has(subKey(downstream)))
						via.push(
							`emits ${e} → subscriber ${downstream.handler ?? downstream.enclosing} (${rel(downstream.file)}:${downstream.line})`,
						);
				}
			}
			if (via.length > 0) {
				subMatches.set(key, { sub, via });
				grew = true;
			}
		}

		for (const door of graph.doors) {
			const key = doorKey(door);
			if (doorMatches.has(key) || !door.touches) continue;
			const via: string[] = [];
			for (const p of door.touches.ports) {
				const leaf = p.split(".").pop() ?? p;
				const seam = seamByLeaf.get(leaf);
				if (!seam) continue;
				const backing = routeDoor.get(`${seam.httpMethod} ${seam.path}`);
				if (backing && doorMatches.has(doorKey(backing)))
					via.push(`seam ${p} → ${backing.label.replace(/\s+/g, " ").trim()}`);
			}
			for (const e of door.touches.events) {
				for (const s of subsByEvent.get(e) ?? []) {
					if (subMatches.has(subKey(s)))
						via.push(
							`emits ${e} → subscriber ${s.handler ?? s.enclosing} (${rel(s.file)}:${s.line})`,
						);
				}
			}
			if (via.length > 0) {
				doorMatches.set(key, { door, via });
				grew = true;
			}
		}

		if (!grew) break;
	}

	return {
		query,
		head: graph.head,
		doors: [...doorMatches.values()].filter((m) => !kindFilter || m.door.kind === kindFilter),
		subscribers: [...subMatches.values()],
	};
}

export function queryDoors(
	graph: Graph,
	kind: DoorKind | null,
	keyword: string | null,
): { head: string; doors: GraphDoor[] } {
	const kw = keyword?.toLowerCase() ?? null;
	const doors = graph.doors.filter((d) => {
		if (kind && d.kind !== kind) return false;
		if (kw && !d.label.toLowerCase().includes(kw) && !d.detail.toLowerCase().includes(kw))
			return false;
		return true;
	});
	return { head: graph.head, doors };
}

export interface EventResult {
	event: string;
	head: string;
	emits: Graph["events"]["emits"];
	subs: GraphSub[];
	wildcards: Graph["events"]["wildcards"];
}

export function queryEvent(graph: Graph, event: string): EventResult | null {
	const emits = graph.events.emits.filter((e) => e.event === event);
	const subs = graph.events.subs.filter((s) => s.event === event);
	if (emits.length === 0 && subs.length === 0) return null;
	return { event, head: graph.head, emits, subs, wildcards: graph.events.wildcards };
}

export function listEvents(graph: Graph): {
	head: string;
	types: { event: string; emit: number; sub: number }[];
	wildcards: number;
	dynamic: Graph["events"]["dynamic"];
} {
	const byType = new Map<string, { emit: number; sub: number }>();
	for (const e of graph.events.emits) {
		const r = byType.get(e.event) ?? { emit: 0, sub: 0 };
		r.emit++;
		byType.set(e.event, r);
	}
	for (const s of graph.events.subs) {
		const r = byType.get(s.event) ?? { emit: 0, sub: 0 };
		r.sub++;
		byType.set(s.event, r);
	}
	const types = [...byType.entries()]
		.map(([event, r]) => ({ event, ...r }))
		.sort((a, b) => b.emit + b.sub - (a.emit + a.sub));
	return {
		head: graph.head,
		types,
		wildcards: graph.events.wildcards.length,
		dynamic: graph.events.dynamic,
	};
}
