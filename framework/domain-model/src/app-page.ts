/**
 * The formats text comes in. `html` is an app: one whole page, run sealed off from everything
 * around it. A document's body, a message's text and a task's description can each be one.
 */
export const FORMATS = ["markdown", "html"] as const;
export type Format = (typeof FORMATS)[number];

const ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#39;": "'",
};
const decode = (text: string): string =>
	text.replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e).trim();

/** An app's `<title>`, read as text, never run. */
export function appTitle(html: string): string | null {
	const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
	return title ? decode(title) || null : null;
}

/** What an app says about itself — its meta description, else its title — read as text, never run. */
export function appSummary(html: string): string | null {
	for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
		if (!/\bname\s*=\s*["']description["']/i.test(tag)) continue;
		const content = /\bcontent\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2];
		if (content) return decode(content);
	}
	return appTitle(html);
}
