// BA2 T4e-a — shared helper for the no-fabrication property (architecture.md
// §2.8.2 D, §6.2 NB-5, founder ruling 14).
//
// The property under test is NOT a list of banned strings: "no string or number
// may reach the DOM that the payload did not supply, except fixed interface
// chrome, which names a region rather than asserting a value." A banned-string
// list only catches fabrications someone already found. A token diff against the
// payload catches the next one too, because anything the view invents shows up
// as a token nobody can explain.
//
// `assertNoFabrication` tokenizes the rendered DOM text and requires every token
// to be explained by one of three sources:
//   - `supplied`  — literal values the sentinel payload/artifact carries.
//   - `chrome`    — fixed interface vocabulary for this canvas (button labels,
//                   section headers, pluralization words) that labels a region
//                   rather than asserting a fact about this review.
//   - `derived`   — a value the view legitimately computes FROM the payload
//                   (an array length used as a count, a monogram's first
//                   letter) rather than inventing.
//
// Anything left over is a token the view produced with no basis — a fabrication.

const TOKEN_PATTERN = /[0-9]+(?:[.,][0-9]+)*|[A-Za-z]+(?:['’][A-Za-z]+)?/g;

export function tokenize(text: string): string[] {
	return text.match(TOKEN_PATTERN) ?? [];
}

/**
 * `container.textContent` concatenates every text node with NO separator, so
 * two adjacent elements' words merge into one ("...TitleOpen in..."), which a
 * naive tokenizer would misread as a single unexplained token. Walk the text
 * nodes and join them with a space so element boundaries can't hide — or
 * fake-explain — a fabricated word.
 */
export function domText(root: Node): string {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const parts: string[] = [];
	let node = walker.nextNode();
	while (node) {
		if (node.textContent) parts.push(node.textContent);
		node = walker.nextNode();
	}
	return parts.join(" ");
}

/**
 * Strip thousands separators and a trailing ".00" so a currency-formatted
 * figure ("52,381.00") still matches the raw payload value ("52381") — the
 * point of the diff is fabricated CONTENT, not incidental formatting.
 * Word tokens are lower-cased for the same reason: CSS `uppercase` and a
 * view calling `.toLowerCase()` on a supplied label change letter case, not
 * content, and case alone must not read as a fabrication.
 */
function normalizeToken(token: string): string {
	if (/^[0-9]/.test(token)) return token.replace(/,/g, "").replace(/\.00$/, "");
	return token.toLowerCase();
}

function tokenSet(values: readonly (string | number)[]): Set<string> {
	const set = new Set<string>();
	for (const v of values) {
		for (const t of tokenize(String(v))) set.add(normalizeToken(t));
	}
	return set;
}

export function assertNoFabrication(
	domText: string,
	options: {
		readonly supplied: readonly (string | number)[];
		readonly chrome: readonly (string | number)[];
		readonly derived?: readonly (string | number)[];
	},
): void {
	const allowed = new Set([
		...tokenSet(options.supplied),
		...tokenSet(options.chrome),
		...tokenSet(options.derived ?? []),
	]);
	const rendered = tokenize(domText).map(normalizeToken);
	const unexplained = [...new Set(rendered.filter((t) => !allowed.has(t)))];
	if (unexplained.length > 0) {
		throw new Error(
			`Unexplained token(s) in the DOM — not supplied by the payload, not named as chrome: ${JSON.stringify(unexplained)}`,
		);
	}
}
