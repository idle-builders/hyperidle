/**
 * AI4 — One status language: KNOWLEDGE_STATUS_LABEL registry tests (red phase)
 *
 * Note A2 / Decision 2: KNOWLEDGE_STATUS_LABEL lives in @hyperidle/fabric/types
 * (not shared) because KnowledgeStatus is fabric-owned post-O1 type split.
 * The registry maps all 7 KnowledgeStatus values with archived→"Stale" relabel.
 *
 * AC2 (exhaustiveness): Record<KnowledgeStatus, string> ensures a new
 * KnowledgeStatus → tsc error until labelled.
 *
 * AC4 (behavior preservation): KnowledgeList shows a badge only for
 * active/archived today. The label registry covers all 7 but the page
 * gates on the two-status condition. "Stale" (for archived) must be
 * the exact label — single-sourced here, not hardcoded in the page.
 *
 * These tests FAIL until KNOWLEDGE_STATUS_LABEL is added to
 * `packages/fabric/src/types.ts` and exported from fabric's barrel.
 */

import { describe, expect, it } from "vitest";
import { KNOWLEDGE_STATUS_LABEL, KNOWLEDGE_STATUSES } from "../types.js";

describe("KNOWLEDGE_STATUS_LABEL (AI4 Note A2, Decision 2)", () => {
	it("is exported from fabric types", () => {
		expect(KNOWLEDGE_STATUS_LABEL).toBeDefined();
		expect(typeof KNOWLEDGE_STATUS_LABEL).toBe("object");
	});

	it("covers all 7 KnowledgeStatus values with non-empty strings", () => {
		for (const status of KNOWLEDGE_STATUSES) {
			const label = KNOWLEDGE_STATUS_LABEL[status];
			expect(label, `KNOWLEDGE_STATUS_LABEL["${status}"] must be a non-empty string`).toBeTruthy();
			expect(typeof label).toBe("string");
		}
	});

	it("maps archived to 'Stale' (the deliberate relabel — single source)", () => {
		// @lore AI4 Note A2: KnowledgeList previously hardcoded "Stale" as the
		// archived label. Moving it here single-sources it and satisfies AC4.
		// archived→"Stale" is a deliberate copy choice; stale is a separate
		// KnowledgeStatus value that maps to error.
		expect(KNOWLEDGE_STATUS_LABEL["archived"]).toBe("Stale");
	});

	it("maps active to 'Active'", () => {
		expect(KNOWLEDGE_STATUS_LABEL["active"]).toBe("Active");
	});

	it("maps captured to a non-empty label", () => {
		expect(KNOWLEDGE_STATUS_LABEL["captured"]).toBeTruthy();
	});

	it("maps provisional to a non-empty label", () => {
		expect(KNOWLEDGE_STATUS_LABEL["provisional"]).toBeTruthy();
	});

	it("maps validated to a non-empty label", () => {
		expect(KNOWLEDGE_STATUS_LABEL["validated"]).toBeTruthy();
	});

	it("maps stale to a non-empty label (distinct from 'archived'→'Stale')", () => {
		// stale is a KnowledgeStatus distinct from archived;
		// archived has the deliberate "Stale" relabel.
		expect(KNOWLEDGE_STATUS_LABEL["stale"]).toBeTruthy();
	});

	it("maps needs_human to a non-empty label", () => {
		expect(KNOWLEDGE_STATUS_LABEL["needs_human"]).toBeTruthy();
	});

	it("has exactly 7 entries — one per KnowledgeStatus", () => {
		expect(Object.keys(KNOWLEDGE_STATUS_LABEL)).toHaveLength(KNOWLEDGE_STATUSES.length);
		expect(Object.keys(KNOWLEDGE_STATUS_LABEL)).toHaveLength(7);
	});

	it("exhaustively covers all KNOWLEDGE_STATUSES runtime values", () => {
		for (const status of KNOWLEDGE_STATUSES) {
			expect(Object.keys(KNOWLEDGE_STATUS_LABEL)).toContain(status);
		}
	});

	it("archived label is 'Stale' not 'Archived' (behavior preservation for KnowledgeList)", () => {
		// KnowledgeList today renders "Stale" for archived rows.
		// After AI4 the page reads this registry — the word must be preserved.
		expect(KNOWLEDGE_STATUS_LABEL["archived"]).toBe("Stale");
		expect(KNOWLEDGE_STATUS_LABEL["archived"]).not.toBe("Archived");
	});
});
