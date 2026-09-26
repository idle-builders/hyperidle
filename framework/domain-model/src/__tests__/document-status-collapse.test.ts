/**
 * Document status collapse (architecture.md §2, plan.md
 * "One lifecycle, no gatekeeping").
 *
 * The two status vocabularies — `KNOWLEDGE_STATUSES` (captured, provisional,
 * validated, active, stale, archived, needs_human) and
 * `KERNEL_DOCUMENT_STATUSES` (draft, active, archived, needs_human) —
 * collapse into exactly one four-value ladder: proposed | active | stale |
 * archived.
 *
 * `DOCUMENT_STATUSES` (`actions/document.ts`) is the canonical four-value ladder.
 */
import { describe, expect, it } from "vitest";
import { DOCUMENT_STATUSES } from "../actions/document.js";
import { KERNEL_DOCUMENT_STATUSES } from "../types.js";

const COLLAPSED_STATUSES = ["proposed", "active", "stale", "archived"];

describe("document status vocabulary collapses to proposed | active | stale | archived", () => {
	it("DOCUMENT_STATUSES is exactly the four-value ladder", () => {
		expect([...DOCUMENT_STATUSES].sort()).toEqual([...COLLAPSED_STATUSES].sort());
	});

	it("KERNEL_DOCUMENT_STATUSES is exactly the same four-value ladder — both enums collapse into one", () => {
		expect([...KERNEL_DOCUMENT_STATUSES].sort()).toEqual([...COLLAPSED_STATUSES].sort());
	});
});
