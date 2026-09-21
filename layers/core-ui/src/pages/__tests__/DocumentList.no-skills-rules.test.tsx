/**
 * The document list shows general documents only. Skill and rule documents
 * are reached from their own list (Settings → Skills & rules), not by
 * browsing documents.
 */
import type { DocumentRow } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentList } from "../../pages/DocumentList";

function makeDoc(overrides: Partial<DocumentRow> = {}): DocumentRow {
	return {
		id: "k1",
		title: "Untitled",
		body: "",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		scopeKind: "factory",
		scopeId: null,
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "u-founder",
		createdAt: "2026-01-01T10:00:00.000Z",
		updatedAt: "2026-01-01T10:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
		...overrides,
	};
}

const mockUseDocuments = vi.fn();
vi.mock("../../hooks/useDocuments.js", () => ({
	useDocuments: (...args: unknown[]) => mockUseDocuments(...args),
}));

function renderDocumentList(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/documents"]}>
			<Routes>
				<Route path="/documents" element={<DocumentList />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("DocumentList renders no skill or rule item", () => {
	beforeEach(() => {
		mockUseDocuments.mockReturnValue({
			documents: [
				makeDoc({
					id: "k-ordinary",
					title: "Auth Strategy Decision",
					body: "We decided to use JWT.",
				}),
				makeDoc({
					id: "k-skill",
					title: "write-tests-skill",
					body: "Write tests first.",
					scopeKind: "factory",
					slot: "skill",
					parentKind: "agent",
					parentId: "agent-1",
				}),
				makeDoc({
					id: "k-rule",
					title: "no-console-rule",
					body: "Never use console.log.",
					scopeKind: "factory",
					slot: "rule",
					parentKind: "agent",
					parentId: "agent-1",
				}),
			],
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
	});

	it("shows ordinary items but not the skill or rule", async () => {
		renderDocumentList();
		expect(await screen.findByText("Auth Strategy Decision")).toBeInTheDocument();
		expect(screen.queryByText("write-tests-skill")).not.toBeInTheDocument();
		expect(screen.queryByText("no-console-rule")).not.toBeInTheDocument();
	});
});
