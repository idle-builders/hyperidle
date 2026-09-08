/**
 * nested-knowledge-items — status collapse (architecture.md §2, plan.md
 * "One lifecycle, no gatekeeping").
 *
 * The two status vocabularies — `KNOWLEDGE_STATUSES` (captured, provisional,
 * validated, active, stale, archived, needs_human) and
 * `KERNEL_KNOWLEDGE_STATUSES` (draft, active, archived, needs_human) —
 * collapse into exactly one four-value ladder: proposed | active | stale |
 * archived.
 */
import { describe, expect, it } from "vitest";
import { KNOWLEDGE_STATUSES } from "../knowledge.js";
import { KERNEL_KNOWLEDGE_STATUSES } from "../types.js";

const COLLAPSED_STATUSES = ["proposed", "active", "stale", "archived"];

describe("nested-knowledge-items: status vocabulary collapses to proposed | active | stale | archived", () => {
	it("KNOWLEDGE_STATUSES is exactly the four-value ladder", () => {
		expect([...KNOWLEDGE_STATUSES].sort()).toEqual([...COLLAPSED_STATUSES].sort());
	});

	it("KERNEL_KNOWLEDGE_STATUSES is exactly the same four-value ladder — both enums collapse into one", () => {
		expect([...KERNEL_KNOWLEDGE_STATUSES].sort()).toEqual([...COLLAPSED_STATUSES].sort());
	});
});
