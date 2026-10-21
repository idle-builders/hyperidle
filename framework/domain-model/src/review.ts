import { z } from "zod";
import type { Problem } from "./actions/action.js";

/**
 * What a review holds. The agent composes it for the question it asks: parts of six kinds, each
 * looked at its own way, and flags — the agent's own pointers to where a person should look.
 * A pin says where a flag or a comment points: a part, a few words naming the spot, and, when it
 * is narrower than the whole part, the spot itself, pointed at the way that kind of part is.
 */

const id = z.string().min(1).max(64);

const spotSchema = z.discriminatedUnion("kind", [
	/** On a preview: an element of the page. */
	z.object({ kind: z.literal("element"), selector: z.string().min(1).max(512) }),
	/** On code: a line by the number the part shows; a removed line by its old number. */
	z.object({
		kind: z.literal("line"),
		file: z.string().min(1).max(512),
		line: z.number().int().positive(),
		removed: z.boolean().optional(),
	}),
	/** On an image: a region, as fractions of its width and height. */
	z.object({
		kind: z.literal("region"),
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
		w: z.number().min(0).max(1),
		h: z.number().min(0).max(1),
	}),
	/** On numbers: one figure, by its label. */
	z.object({ kind: z.literal("figure"), label: z.string().min(1).max(128) }),
	/** On text: characters `start` up to `end` of the body. */
	z.object({
		kind: z.literal("range"),
		start: z.number().int().nonnegative(),
		end: z.number().int().positive(),
	}),
	/** On items: one of them, by its id. */
	z.object({ kind: z.literal("item"), item: id }),
]);
export type Spot = z.infer<typeof spotSchema>;

const pinSchema = z.object({
	/** A comment's replies repeat its pin, id and all; a flag's replies take the flag's pin. */
	id,
	part: id,
	label: z.string().min(1).max(128),
	spot: spotSchema.optional(),
});
export type Pin = z.infer<typeof pinSchema>;

/** One of the agent's pointers: "I decided this without asking", "I am not sure about this". */
export const flagSchema = pinSchema.extend({ says: z.string().min(1).max(2048) });
export type Flag = z.infer<typeof flagSchema>;

/**
 * Where a message in a thread points: a pin on a part of the review `review` names, or, with no
 * review, on a block of the document the thread is about.
 */
export const anchorSchema = pinSchema.extend({ review: z.string().min(1).optional() });
export type Anchor = z.infer<typeof anchorSchema>;

const partBase = {
	id,
	/** The kind of thing, in the agent's words: "Live preview", "Email". */
	label: z.string().min(1).max(64),
	title: z.string().min(1).max(256),
};

const codeLineSchema = z.object({
	op: z.enum(["add", "del", "same"]),
	/** The new file's number; a removed line's old number. */
	n: z.number().int().positive(),
	text: z.string().max(2000),
});

export const reviewPartSchema = z.discriminatedUnion("kind", [
	/** A live page, shown at desktop, tablet and phone widths. */
	z.object({ ...partBase, kind: z.literal("preview"), url: z.string().min(1).max(200_000) }),
	/** A diff: files with hunks of added, removed and unchanged lines. */
	z.object({
		...partBase,
		kind: z.literal("code"),
		files: z
			.array(
				z.object({
					path: z.string().min(1).max(512),
					hunks: z
						.array(z.object({ lines: z.array(codeLineSchema).min(1).max(400) }))
						.min(1)
						.max(50),
				}),
			)
			.min(1)
			.max(50),
	}),
	/** A design or a screenshot. */
	z.object({
		...partBase,
		kind: z.literal("image"),
		url: z.string().min(1).max(2_000_000),
		alt: z.string().max(512).optional(),
	}),
	/** Figures, each with how it changed and whether that is good. */
	z.object({
		...partBase,
		kind: z.literal("numbers"),
		figures: z
			.array(
				z.object({
					label: z.string().min(1).max(128),
					value: z.string().min(1).max(64),
					change: z.string().max(64).optional(),
					good: z.boolean().optional(),
				}),
			)
			.min(1)
			.max(24),
	}),
	/** Prose: an email, a piece of copy. */
	z.object({
		...partBase,
		kind: z.literal("text"),
		subject: z.string().max(512).optional(),
		to: z.string().max(512).optional(),
		body: z.string().min(1).max(20_000),
	}),
	/** A batch of the same kind of thing, such as three replies to customers. */
	z.object({
		...partBase,
		kind: z.literal("items"),
		items: z
			.array(z.object({ id, title: z.string().min(1).max(128), body: z.string().max(4000) }))
			.min(1)
			.max(50),
	}),
]);
export type ReviewPart = z.infer<typeof reviewPartSchema>;

const SPOT_FOR: Record<ReviewPart["kind"], Spot["kind"]> = {
	preview: "element",
	code: "line",
	image: "region",
	numbers: "figure",
	text: "range",
	items: "item",
};

const problem = (code: string, message: string, path: string): Problem => ({
	code,
	message,
	path,
});

/** Whether `pin` points at something its part shows, the way that kind of part is pointed at. */
export function pinProblems(pin: Pin, parts: readonly ReviewPart[], path = "anchor"): Problem[] {
	const part = parts.find((p) => p.id === pin.part);
	if (!part)
		return [problem("pin_part_unknown", `The review has no part "${pin.part}".`, `${path}.part`)];
	const spot = pin.spot;
	if (!spot) return [];
	const at = `${path}.spot`;
	if (SPOT_FOR[part.kind] !== spot.kind)
		return [
			problem(
				"pin_wrong_kind",
				`Point at a ${part.kind} part with a ${SPOT_FOR[part.kind]}, not a ${spot.kind}.`,
				at,
			),
		];
	const found = ((): boolean => {
		switch (spot.kind) {
			case "element":
				return true;
			case "line":
				return (
					part.kind === "code" &&
					part.files.some(
						(f) =>
							f.path === spot.file &&
							f.hunks.some((h) =>
								h.lines.some(
									(l) => l.n === spot.line && (l.op === "del") === (spot.removed === true),
								),
							),
					)
				);
			case "region":
				return spot.w > 0 && spot.h > 0 && spot.x + spot.w <= 1 && spot.y + spot.h <= 1;
			case "figure":
				return part.kind === "numbers" && part.figures.some((f) => f.label === spot.label);
			case "range":
				return part.kind === "text" && spot.start < spot.end && spot.end <= part.body.length;
			case "item":
				return part.kind === "items" && part.items.some((i) => i.id === spot.item);
		}
	})();
	if (found) return [];
	const missing: Record<Exclude<Spot["kind"], "element">, [string, string]> = {
		line: ["pin_line_missing", "That line is not in the code this part shows."],
		region: ["pin_region_outside", "The region must have a size and lie inside the image."],
		figure: ["pin_figure_missing", "That figure is not in this part."],
		range: ["pin_range_outside", "The range must start before it ends, inside the text."],
		item: ["pin_item_missing", "That item is not in this part."],
	};
	const [code, message] = missing[spot.kind as Exclude<Spot["kind"], "element">];
	return [problem(code, message, at)];
}

const dupes = <T>(xs: readonly T[], key: (x: T) => string): string[] =>
	xs.map(key).filter((k, i, all) => all.indexOf(k) !== i);

/** A preview is a web page; an image is a picture by address. */
function urlFits(kind: "preview" | "image", url: string): boolean {
	if (/^https?:\/\//i.test(url)) return true;
	return kind === "preview" ? /^data:text\/html[;,]/i.test(url) : /^data:image\//i.test(url);
}

/** What a review's parts, flags and "changed since" lines must satisfy together. */
export function reviewInvariants(review: {
	readonly parts?: readonly ReviewPart[];
	readonly flags?: readonly Flag[];
	readonly changed?: readonly string[];
	readonly previousReviewId?: string;
}): Problem[] {
	const parts = review.parts ?? [];
	const flags = review.flags ?? [];
	const problems: Problem[] = [];
	for (const d of dupes(parts, (p) => p.id))
		problems.push(problem("part_id_duplicate", `Two parts share the id "${d}".`, "parts"));
	parts.forEach((part, i) => {
		const at = `parts.${i}`;
		if ((part.kind === "preview" || part.kind === "image") && !urlFits(part.kind, part.url))
			problems.push(
				problem(
					"part_url_unsupported",
					part.kind === "preview"
						? "A preview is a web page: an http(s) address or a data:text/html one."
						: "An image is an http(s) address or a data:image one.",
					`${at}.url`,
				),
			);
		if (part.kind === "numbers")
			for (const d of dupes(part.figures, (f) => f.label))
				problems.push(
					problem("figure_label_duplicate", `Two figures are called "${d}".`, `${at}.figures`),
				);
		if (part.kind === "items")
			for (const d of dupes(part.items, (x) => x.id))
				problems.push(
					problem("item_id_duplicate", `Two items share the id "${d}".`, `${at}.items`),
				);
		if (part.kind === "code")
			for (const d of dupes(part.files, (f) => f.path))
				problems.push(problem("code_file_duplicate", `"${d}" is shown twice.`, `${at}.files`));
	});
	for (const d of dupes(flags, (f) => f.id))
		problems.push(problem("flag_id_duplicate", `Two flags share the id "${d}".`, "flags"));
	flags.forEach((flag, i) => {
		problems.push(...pinProblems(flag, parts, `flags.${i}`));
	});
	if ((review.changed?.length ?? 0) > 0 && review.previousReviewId === undefined)
		problems.push(
			problem(
				"changed_without_previous",
				"Say what changed only on a round that follows an earlier one.",
				"changed",
			),
		);
	return problems;
}
