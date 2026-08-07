export class ToonParseError extends Error {
	readonly line: number;
	readonly detail: string;

	constructor(message: string, line: number, detail: string) {
		super(`TOON parse error at line ${line}: ${message} (${detail})`);
		this.name = "ToonParseError";
		this.line = line;
		this.detail = detail;
	}
}
