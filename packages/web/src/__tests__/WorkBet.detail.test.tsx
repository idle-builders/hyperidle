/**
 * J5 — Bet detail page: breadcrumb, markdown body, sortable task table,
 * comment thread.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkBet } from "../pages/WorkBet";

function renderBet(betId = "b1"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${betId}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkBet — detail page (J5)", () => {
	it("renders breadcrumb Product → Team → Bet", () => {
		renderBet("b1");
		const breadcrumb = screen.getByLabelText("Breadcrumb");
		expect(breadcrumb).toBeInTheDocument();
		const text = breadcrumb.textContent ?? "";
		// The three levels must appear in DOM order (product / team / bet).
		const productIdx = text.indexOf("Alpha");
		const teamIdx = text.indexOf("Alpha Core");
		// The leaf uses the bet id (so BetCard remains the unique source of
		// the title text) with an sr-only full-title expansion.
		const betIdx = text.indexOf("b1");
		expect(productIdx).toBeGreaterThanOrEqual(0);
		expect(teamIdx).toBeGreaterThanOrEqual(productIdx);
		expect(betIdx).toBeGreaterThan(teamIdx);
		// The current-page marker includes both the bet id and the full title
		// in the accessible name.
		const current = breadcrumb.querySelector('[aria-current="page"]');
		expect(current?.textContent).toContain("b1");
		expect(current?.textContent).toContain("User auth flow");
	});

	it("renders pitch body as markdown-like content", () => {
		renderBet("b1");
		// The body section is present.
		const body = screen.getByTestId("bet-pitch-body");
		expect(body).toBeInTheDocument();
		// Contains at least the heading from the fixture's markdown.
		expect(body.textContent).toMatch(/problem/i);
	});

	it("renders a task table (not card list)", () => {
		renderBet("b1");
		const table = screen.getByRole("table");
		expect(table).toBeInTheDocument();
		// Column headers
		expect(within(table).getByRole("columnheader", { name: /title/i })).toBeInTheDocument();
		expect(within(table).getByRole("columnheader", { name: /status/i })).toBeInTheDocument();
		expect(within(table).getByRole("columnheader", { name: /owner/i })).toBeInTheDocument();
		expect(within(table).getByRole("columnheader", { name: /cost/i })).toBeInTheDocument();
	});

	it("task table sorts by column when clicked and sets aria-sort", async () => {
		const user = userEvent.setup();
		renderBet("b1");
		const table = screen.getByRole("table");
		const titleHeader = within(table).getByRole("columnheader", { name: /title/i });
		expect(titleHeader).toHaveAttribute("aria-sort", "none");

		await user.click(within(titleHeader).getByRole("button"));

		expect(titleHeader).toHaveAttribute("aria-sort", "ascending");

		// Titles in b1: "Design signup form", "Implement login endpoint", "JWT refresh logic"
		const rows = within(table).getAllByRole("row").slice(1); // skip thead
		const firstCellTexts = rows.map((r) => within(r).getAllByRole("cell")[0].textContent);
		expect(firstCellTexts[0]).toBe("Design signup form");
		expect(firstCellTexts[1]).toBe("Implement login endpoint");
		expect(firstCellTexts[2]).toBe("JWT refresh logic");

		await user.click(within(titleHeader).getByRole("button"));
		expect(titleHeader).toHaveAttribute("aria-sort", "descending");
	});

	it("renders the comment thread region", () => {
		renderBet("b1");
		expect(screen.getByTestId("bet-comment-thread")).toBeInTheDocument();
	});
});
