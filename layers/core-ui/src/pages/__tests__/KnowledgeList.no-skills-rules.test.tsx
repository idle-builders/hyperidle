/**
 * The knowledge list shows general
 * knowledge only. Skill and rule items are reached from their own list
 * (Settings → Skills & rules), not by browsing knowledge.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeList } from "../../pages/KnowledgeList";

vi.mock("../../hooks/useFetch", () => ({
	useFetch: (url: string | null) => {
		if (url && url.includes("/api/knowledge")) {
			return {
				data: {
					items: [
						{
							id: "k-ordinary",
							title: "Auth Strategy Decision",
							body: "We decided to use JWT.",
							topic: "Auth",
							status: "active",
							scopeKind: "practice",
							role: "ordinary",
							updatedAt: "2026-01-01T10:00:00.000Z",
							updatedBy: "u-founder",
							version: 1,
							format: "markdown",
						},
						{
							id: "k-skill",
							title: "write-tests-skill",
							body: "Write tests first.",
							topic: null,
							status: "active",
							scopeKind: "factory",
							role: "skill",
							parentKind: "agent",
							updatedAt: "2026-01-01T10:00:00.000Z",
							updatedBy: "u-founder",
							version: 1,
							format: "markdown",
						},
						{
							id: "k-rule",
							title: "no-console-rule",
							body: "Never use console.log.",
							topic: null,
							status: "active",
							scopeKind: "factory",
							role: "rule",
							parentKind: "agent",
							updatedAt: "2026-01-01T10:00:00.000Z",
							updatedBy: "u-founder",
							version: 1,
							format: "markdown",
						},
					],
				},
				loading: false,
				error: null,
				refresh: vi.fn(),
			};
		}
		return { data: null, loading: false, error: null, refresh: vi.fn() };
	},
}));

vi.mock("../../hooks/useCurrentUser", () => ({
	useCurrentUser: () => ({ data: { id: "u-founder", name: "Test Founder", avatarUrl: null } }),
}));

function renderKnowledgeList(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/knowledge"]}>
			<Routes>
				<Route path="/knowledge" element={<KnowledgeList />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("KnowledgeList renders no skill or rule item", () => {
	it("shows ordinary items but not the skill or rule", async () => {
		renderKnowledgeList();
		expect(await screen.findByText("Auth Strategy Decision")).toBeInTheDocument();
		expect(screen.queryByText("write-tests-skill")).not.toBeInTheDocument();
		expect(screen.queryByText("no-console-rule")).not.toBeInTheDocument();
	});
});
