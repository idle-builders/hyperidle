import type { HuddlePayload } from "@hyperidle/domain-model";

/** Join a person to a live huddle. No-op if they are already in (no leftAt). */
export function applyHuddleJoin(
	payload: HuddlePayload,
	personId: string,
	now: string,
): HuddlePayload {
	const alreadyIn = payload.people.some((p) => p.id === personId && p.leftAt === null);
	if (alreadyIn) return payload;
	return {
		...payload,
		people: [...payload.people, { id: personId, joinedAt: now, leftAt: null }],
	};
}

/** Leave a huddle. Sets leftAt on the most recent open entry. Ends the huddle when everyone has left. */
export function applyHuddleLeave(
	payload: HuddlePayload,
	personId: string,
	now: string,
): HuddlePayload {
	let found = false;
	const people = payload.people.map((p) => {
		if (!found && p.id === personId && p.leftAt === null) {
			found = true;
			return { ...p, leftAt: now };
		}
		return p;
	});
	const anyStillIn = people.some((p) => p.leftAt === null);
	return {
		...payload,
		people,
		endedAt: anyStillIn ? payload.endedAt : now,
	};
}

/** Whether a signal from `from` to `to` may be relayed: both are currently joined and the huddle is live. */
export function isRelayAllowed(payload: HuddlePayload, from: string, to: string): boolean {
	if (payload.endedAt !== null) return false;
	const joined = (id: string) => payload.people.some((p) => p.id === id && p.leftAt === null);
	return joined(from) && joined(to);
}
