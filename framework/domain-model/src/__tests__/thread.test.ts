import { describe, expect, it } from "vitest";
import { HOST_KINDS, MESSAGE_TYPES } from "../thread.js";

describe("closed enums", () => {
	it("MESSAGE_TYPES is exactly {plain, review, questionnaire, verdict, answer}", () => {
		expect(new Set(MESSAGE_TYPES)).toEqual(
			new Set(["plain", "review", "questionnaire", "verdict", "answer"]),
		);
	});

	it("HOST_KINDS is exactly {document, agent, user, team, factory} — a task's thread is team-hosted", () => {
		expect(new Set(HOST_KINDS)).toEqual(new Set(["document", "agent", "user", "team", "factory"]));
	});
});
