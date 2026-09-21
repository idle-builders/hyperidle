/**
 * BC4 architecture.md §8.6: the Knowledge section's route moved to
 * `/documents`, but its view id stays `"knowledge"` — founder ruling 3. This
 * pins the one line in AppShell.tsx that bridges the two, by exact equality.
 */
import { describe, expect, it } from "vitest";
import { pathToView } from "../layouts/AppShell.js";

describe("pathToView — the §8.6 Knowledge view-id exception", () => {
	it('returns "knowledge" for a /documents/:id path', () => {
		expect(pathToView("/documents/abc")).toBe("knowledge");
	});

	it('returns "knowledge" for the bare /documents path', () => {
		expect(pathToView("/documents")).toBe("knowledge");
	});

	it('returns "work" for a /work path', () => {
		expect(pathToView("/work")).toBe("work");
	});

	it('returns "conversations" for everything else, including the old /knowledge path', () => {
		expect(pathToView("/knowledge/abc")).toBe("conversations");
		expect(pathToView("/conversations")).toBe("conversations");
	});
});
