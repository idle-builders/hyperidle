import { createHash, randomUUID } from "node:crypto";

export interface ScopedIds {
	/** Deterministic per-test UUID for a label. Same label → same id within this test. */
	(label: string): string;
	/** Fresh unique UUID — for tests that need two distinct ids for one role (duplicate-key tests). */
	next(): string;
}

/**
 * AU38 D1: per-test scoped identity. One random token per maker; each label
 * derives a stable RFC-9562 v4-shaped UUID from sha256(token + NUL + label),
 * so the same label always resolves identically within one test while no two
 * tests (two makers) can ever derive the same id.
 */
export function makeScopedIds(): ScopedIds {
	const token = randomUUID();
	const cache = new Map<string, string>();
	let nextCounter = 0;

	const ids = ((label: string): string => {
		const cached = cache.get(label);
		if (cached !== undefined) return cached;
		const bytes = Buffer.from(
			createHash("sha256").update(`${token}\u0000${label}`).digest().subarray(0, 16),
		);
		bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
		bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
		const hex = bytes.toString("hex");
		const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
		cache.set(label, id);
		return id;
	}) as ScopedIds;

	// @lore AU38: the NUL prefix keeps internal counter labels outside the
	// label space tests ever pass (literals like "t1"), so next() can never
	// collide with a label-derived id.
	ids.next = (): string => ids(`\u0000next:${nextCounter++}`);

	return ids;
}
