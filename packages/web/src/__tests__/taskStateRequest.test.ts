/**
 * L15: locks the canonical state-request text template + clientKey regex.
 * These are the wire-shape contracts L18's renderer will read.
 */
import { describe, expect, it } from "vitest";
import {
	formatStateRequestText,
	makeStateRequestClientKey,
	STATE_REQUEST_PREFIX,
} from "../shell/taskStateRequest";

const CLIENT_KEY_RE = /^[A-Za-z0-9_\-:.]{8,128}$/;

describe("L15 taskStateRequest helpers", () => {
	it("STATE_REQUEST_PREFIX is the locked prefix", () => {
		expect(STATE_REQUEST_PREFIX).toBe("Requested state change: ");
	});

	it("formatStateRequestText produces the canonical text from in_progress to blocked", () => {
		expect(formatStateRequestText("in_progress", "blocked")).toBe(
			"Requested state change: In Progress → Blocked",
		);
	});

	it("formatStateRequestText uses Planned for accepted/proposed sources", () => {
		expect(formatStateRequestText("accepted", "in_progress")).toBe(
			"Requested state change: Planned → In Progress",
		);
		expect(formatStateRequestText("proposed", "blocked")).toBe(
			"Requested state change: Planned → Blocked",
		);
	});

	it("formatStateRequestText maps review to In Progress (column collapsing)", () => {
		expect(formatStateRequestText("review", "done")).toBe(
			"Requested state change: In Progress → Done",
		);
	});

	it("formatStateRequestText uses literal U+2192 arrow", () => {
		const text = formatStateRequestText("in_progress", "done");
		expect(text).toContain("→");
		expect(text).not.toContain("->");
	});

	it("formatStateRequestText output starts with STATE_REQUEST_PREFIX", () => {
		const text = formatStateRequestText("blocked", "in_progress");
		expect(text.startsWith(STATE_REQUEST_PREFIX)).toBe(true);
	});

	it("makeStateRequestClientKey conforms to CLIENT_KEY_RE", () => {
		const key = makeStateRequestClientKey("t1", "blocked", "2026-05-04T12:00:00.000Z");
		expect(key).toMatch(CLIENT_KEY_RE);
	});

	it("makeStateRequestClientKey encodes task id and target column", () => {
		const key = makeStateRequestClientKey("t1", "blocked", "2026-05-04T12:00:00.000Z");
		expect(key).toContain("t1");
		expect(key).toContain("blocked");
	});

	it("makeStateRequestClientKey is deterministic for same inputs", () => {
		const a = makeStateRequestClientKey("t1", "done", "2026-05-04T12:00:00.000Z");
		const b = makeStateRequestClientKey("t1", "done", "2026-05-04T12:00:00.000Z");
		expect(a).toBe(b);
	});

	it("makeStateRequestClientKey differs for different timestamps (allows legitimate retries)", () => {
		const a = makeStateRequestClientKey("t1", "done", "2026-05-04T12:00:00.000Z");
		const b = makeStateRequestClientKey("t1", "done", "2026-05-04T12:00:01.000Z");
		expect(a).not.toBe(b);
	});
});
