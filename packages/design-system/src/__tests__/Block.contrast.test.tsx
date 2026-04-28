// @vitest-environment jsdom

/**
 * L2 AC-40: contrast — inline marks (<strong>/<em>/<a>/inline <code>) ≥ 4.5:1
 * on --surface-0 / --surface-1 / --surface-ghost.
 *
 * The runtime WCAG checker is K8's job. Here we enforce a narrower contract:
 * the Block primitive and per-kind payload renderers MUST NOT contain
 * hardcoded hex colours, `rgb(…)` literals, or raw Tailwind colour palette
 * classes. Token-only consumption is what makes the contrast contract
 * mechanically auditable downstream.
 */

import { describe, expect, it } from "vitest";

const FILES = [
	"../Block.tsx",
	"../BlockHandle.tsx",
	"../BlockActionsPopover.tsx",
	"../block/inline.tsx",
	"../block/HeadingPayload.tsx",
	"../block/ParagraphPayload.tsx",
	"../block/ListPayload.tsx",
	"../block/QuotePayload.tsx",
	"../block/CodePayload.tsx",
	"../block/TablePayload.tsx",
	"../block/DividerPayload.tsx",
	"../block/ImagePayload.tsx",
	"../block/HtmlPayload.tsx",
	"../block/UnknownPayload.tsx",
];

describe("AC-40 — Block components consume colour tokens only (no hex, no rgb, no raw Tailwind)", () => {
	it.each(FILES)("%s contains no hardcoded colour literals", async (rel) => {
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const src = readFileSync(resolve(__dirname, rel), "utf-8");
		// No 6-digit hex (e.g. #ff0000).
		expect(src.match(/#[0-9a-fA-F]{6}\b/g) ?? []).toEqual([]);
		// No 3-digit hex (e.g. #f00) — but allow `--rN` token names which look similar.
		const threes = (src.match(/#[0-9a-fA-F]{3}\b/g) ?? []).filter((m) => !/^#[0-9]{3}$/.test(m));
		expect(threes).toEqual([]);
		// No bare rgb()/rgba() literals (color-mix and var() are fine).
		const rgbLits = src.match(/\brgba?\([^)]*\)/g) ?? [];
		expect(rgbLits).toEqual([]);
		// No raw Tailwind palette classes (e.g. text-indigo-500, bg-slate-800).
		const palette =
			src.match(
				/\b(?:text|bg|border|ring|fill|stroke|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
			) ?? [];
		expect(palette).toEqual([]);
	});
});
