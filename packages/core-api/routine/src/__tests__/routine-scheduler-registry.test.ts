/**
 * AU21 §9 Increment 5 (AC #7) — practice-meeting is deleted from the builtin-
 * routine registry, no replacement built. `isBuiltinRoutineId`/
 * `extractBuiltinKind` are the pure classification surface the scheduler
 * (`fireBuiltinRoutine`, the cron tick's `dueRoutines` filter,
 * `routines-routes.ts`'s manual-trigger `builtinKind` helper) all key off —
 * proving the kind is gone here proves every caller downstream sees it as an
 * ordinary (non-builtin) or unknown routine id. The other four kinds
 * (post-bet-retro, portfolio-retro, knowledge-decay, knowledge-promotion)
 * must stay recognized, bare AND with the `:teamId` per-team suffix (AF17).
 */
import { describe, expect, it } from "vitest";
import { extractBuiltinKind, isBuiltinRoutineId } from "../routine-scheduler.js";

describe("builtin-routine registry no longer offers practice-meeting", () => {
	it("isBuiltinRoutineId('builtin:practice-meeting') is false", () => {
		expect(isBuiltinRoutineId("builtin:practice-meeting")).toBe(false);
	});

	it("isBuiltinRoutineId is false for a per-team practice-meeting id (colon-suffixed)", () => {
		expect(isBuiltinRoutineId("builtin:practice-meeting:prod-1")).toBe(false);
	});

	it("extractBuiltinKind('builtin:practice-meeting') returns null", () => {
		expect(extractBuiltinKind("builtin:practice-meeting")).toBeNull();
	});

	it("extractBuiltinKind returns null for a per-team practice-meeting id", () => {
		expect(extractBuiltinKind("builtin:practice-meeting:prod-1")).toBeNull();
	});

	it.each([
		"builtin:post-bet-retro",
		"builtin:portfolio-retro",
		"builtin:knowledge-decay",
		"builtin:knowledge-promotion",
	] as const)("the other builtin kind %s is still recognized, bare and per-team", (id) => {
		expect(isBuiltinRoutineId(id)).toBe(true);
		expect(extractBuiltinKind(id)).toBe(id);
		expect(isBuiltinRoutineId(`${id}:prod-1`)).toBe(true);
		expect(extractBuiltinKind(`${id}:prod-1`)).toBe(id);
	});
});
