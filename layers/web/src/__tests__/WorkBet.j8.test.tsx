/**
 * J8 — loading state path on the Work/Bet detail page.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkBet } from "../pages/WorkBet";

describe("WorkBet — J8 loading state", () => {
	it("renders skeleton card + list when `loading` is true", () => {
		render(
			<MemoryRouter>
				<WorkBet loading />
			</MemoryRouter>,
		);
		expect(screen.getByRole("status", { name: /loading bet/i })).toBeInTheDocument();
		expect(screen.getByRole("status", { name: /loading tasks/i })).toBeInTheDocument();
		// When loading, breadcrumb / tables should not render.
		expect(screen.queryByRole("navigation", { name: /breadcrumb/i })).not.toBeInTheDocument();
	});
});
