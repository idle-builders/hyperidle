// @lore: strips markdown syntax from raw agent/user body — prevents "## Summary" and bullets appearing verbatim in list-row subtitles

export function stripMarkdown(input: string): string {
	let s = input;

	s = s.replace(/^```[\s\S]*?```/gm, "");
	s = s.replace(/^~~~[\s\S]*?~~~/gm, "");

	s = s.replace(/^#{1,6}\s+/gm, "");

	s = s.replace(/^[=-]{3,}\s*$/gm, "");

	s = s.replace(/^>\s?/gm, "");

	s = s.replace(/^(\*{3,}|-{3,}|_{3,})\s*$/gm, "");

	s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");

	s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

	s = s.replace(/`([^`]*)`/g, "$1");

	s = s.replace(/\*{3}([^*]+)\*{3}/g, "$1");
	s = s.replace(/_{3}([^_]+)_{3}/g, "$1");

	s = s.replace(/\*{2}([^*]+)\*{2}/g, "$1");
	s = s.replace(/_{2}([^_]+)_{2}/g, "$1");

	s = s.replace(/\*([^*]+)\*/g, "$1");
	s = s.replace(/_([^_]+)_/g, "$1");

	s = s.replace(/(?<!\*)\*(?!\*)/g, "");
	s = s.replace(/(?<!_)_(?!_)/g, "");

	s = s.replace(/^[\s]*[-*+]\s+/gm, "");

	s = s.replace(/^[\s]*\d+\.\s+/gm, "");

	s = s
		.replace(/\n{2,}/g, " ")
		.replace(/\n/g, " ")
		.trim();

	s = s.replace(/\s{2,}/g, " ");

	return s;
}
