import { describe, expect, test } from "vitest";
import {
	BORDER_WIDTH_STYLE,
	MOTION_STYLE,
	TYPE_STYLE,
	TYPOGRAPHY_ROLES,
} from "../token-profiles.js";

describe("AZ16 semantic token profiles", () => {
	test("publishes the approved complete typography role set", () => {
		expect(TYPOGRAPHY_ROLES).toEqual([
			"label",
			"metadata",
			"small",
			"copy",
			"control",
			"input",
			"avatar-initial",
			"subheading",
			"lead",
			"title",
			"display",
			"metric",
			"data",
			"inline-code",
		]);
		for (const role of TYPOGRAPHY_ROLES) {
			expect(TYPE_STYLE[role]).toMatchObject({
				fontFamily: expect.any(String),
				fontSize: expect.any(String),
				fontWeight: expect.any(Number),
				letterSpacing: expect.any(String),
				lineHeight: expect.any(Number),
			});
		}
		expect(TYPE_STYLE.metric.fontVariantNumeric).toBe("tabular-nums");
	});

	test("publishes only the seven approved purpose motion profiles", () => {
		expect(Object.keys(MOTION_STYLE)).toEqual([
			"feedback",
			"move",
			"spring",
			"enter",
			"activity",
			"loading",
			"busy",
		]);
		expect(MOTION_STYLE.feedback.transitionProperty).toBe("opacity, filter");
		expect(MOTION_STYLE.move.transitionProperty).toBe("transform");
		expect(MOTION_STYLE.busy.animation).toContain("750ms linear infinite");
	});

	test("publishes the approved border width ladder", () => {
		expect(BORDER_WIDTH_STYLE).toEqual({
			thin: "var(--bw-thin)",
			default: "var(--bw-default)",
			strong: "var(--bw-strong)",
		});
	});
});
