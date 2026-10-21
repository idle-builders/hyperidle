/** How a person or agent is drawn in an avatar. */
import { expect, test } from "vitest";
import { initials } from "./sidebar-lists";

test.each([
	["Maya Chen", "MC"],
	["Builder", "BU"],
	["Finn van Olsen", "FV"],
])("%s is %s", (name, letters) => {
	expect(initials(name)).toBe(letters);
});
