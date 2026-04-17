import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { KnowledgeList } from "../pages/KnowledgeList";

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<KnowledgeList />
		</MemoryRouter>,
	);
}

describe("KnowledgeList", () => {
	it("renders with test id", () => {
		renderPage();
		expect(screen.getByTestId("knowledge-list-page")).toBeInTheDocument();
	});

	it("renders Knowledge Base heading", () => {
		renderPage();
		expect(screen.getByText("Knowledge Base")).toBeInTheDocument();
	});

	it("renders knowledge items", () => {
		renderPage();
		expect(screen.getByText("Architecture Decision: Auth Strategy")).toBeInTheDocument();
		expect(screen.getByText("API Rate Limiting Best Practices")).toBeInTheDocument();
		expect(screen.getByText("User Interview Notes Q1")).toBeInTheDocument();
		expect(screen.getByText("Component Library Guidelines")).toBeInTheDocument();
		expect(screen.getByText("Sprint Retro Outcomes")).toBeInTheDocument();
	});

	it("renders timestamps for items", () => {
		renderPage();
		expect(screen.getByText("1d ago")).toBeInTheDocument();
		expect(screen.getByText("2d ago")).toBeInTheDocument();
	});
});
