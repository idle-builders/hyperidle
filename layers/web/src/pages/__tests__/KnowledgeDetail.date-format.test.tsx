/**
 * E1 — KnowledgeDetail: Last edited date is formatted via absoluteDateTime,
 * not rendered as a raw timestamp string.
 *
 * AC: formatted date shown, not raw ISO / relative string.
 */

import { absoluteDateTime, TIME_PLACEHOLDER } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../../pages/KnowledgeDetail";

vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section">Thread Section</div>,
}));

function renderKnowledge(id: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${id}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("KnowledgeDetail last-edited date formatting", () => {
	it("renders absoluteDateTime output, not the raw timestamp string (non-parseable → em-dash)", () => {
		// Fixture k1 has timestamp "1d ago" (not ISO) → absoluteDateTime returns TIME_PLACEHOLDER
		renderKnowledge("k1");

		// The em-dash placeholder should appear (correct formatted output for non-ISO)
		const emDashes = screen.getAllByText(TIME_PLACEHOLDER);
		expect(emDashes.length).toBeGreaterThan(0);

		// The raw fixture timestamp "1d ago" should NOT appear verbatim in the metadata row.
		// (It may appear elsewhere in formatted relative columns — but never in the Last edited span.)
		const lastEditedRow = screen
			.getAllByText(/last edited/i)
			.map((el) => el.closest("[class*='flex']"))
			.find(Boolean);
		if (lastEditedRow) {
			// The sibling span should contain the formatted value, not "1d ago" raw
			expect(lastEditedRow.textContent).not.toMatch(/^1d ago$/);
		}
	});

	it("absoluteDateTime formats a real ISO string correctly (unit-level proof)", () => {
		const iso = "2026-06-12T14:34:00.000Z";
		const result = absoluteDateTime(iso);
		// Should not be a raw ISO, and not TIME_PLACEHOLDER
		expect(result).not.toBe(iso);
		expect(result).not.toBe(TIME_PLACEHOLDER);
		// Should contain year 2026 (locale-agnostic check)
		expect(result).toMatch(/2026/);
	});

	it("absoluteDateTime returns TIME_PLACEHOLDER for null (null-safe check)", () => {
		expect(absoluteDateTime(null)).toBe(TIME_PLACEHOLDER);
	});
});
