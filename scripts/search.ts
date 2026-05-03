#!/usr/bin/env bun
// search dispatcher (TE-11)
//
// One command. Picks the right tool based on the pattern shape:
//   - structural pattern (contains $METAVAR like `useEffect($A, $B)`) → ast-grep
//   - regex / literal pattern → ripgrep with sane defaults
//
// Usage:
//   bun run search '<pattern>' [path] [-- extra-tool-args...]
//
// Examples:
//   bun run search 'createTestDb'                   # ripgrep, repo-wide
//   bun run search 'useEffect($A, $B)' packages/web # ast-grep, structural
//   bun run search 'TODO' packages -- -t ts         # ripgrep, ts files only
//
// Why dispatch at all: skills should stop reasoning about which search tool
// fits a query. The pattern syntax is enough to decide.
//
// Failure modes:
//   - ast-grep not installed → print install hint, exit 127
//   - ripgrep not installed → exit 127 (vanishingly unlikely; rg is a baseline dep)

const STRUCTURAL_METAVAR = /\$[A-Z_][A-Z0-9_]*/;

type Tool = "ast-grep" | "ripgrep";

function pickTool(pattern: string): Tool {
	return STRUCTURAL_METAVAR.test(pattern) ? "ast-grep" : "ripgrep";
}

function splitExtraArgs(argv: string[]): { positional: string[]; extra: string[] } {
	const sep = argv.indexOf("--");
	if (sep === -1) return { positional: argv, extra: [] };
	return { positional: argv.slice(0, sep), extra: argv.slice(sep + 1) };
}

async function runRipgrep(pattern: string, path: string, extra: string[]): Promise<number> {
	const args = [
		"--line-number",
		"--with-filename",
		"--color=never",
		"--max-columns=200",
		"--max-columns-preview",
		...extra,
		pattern,
		path,
	];
	try {
		const proc = Bun.spawn(["rg", ...args], { stdout: "inherit", stderr: "inherit" });
		return await proc.exited;
	} catch (err) {
		if (err instanceof Error && /Executable not found/.test(err.message)) {
			process.stderr.write("ripgrep not found. Install with: brew install ripgrep\n");
			return 127;
		}
		throw err;
	}
}

async function runAstGrep(pattern: string, path: string, extra: string[]): Promise<number> {
	const lang = extra.includes("--lang") || extra.includes("-l") ? [] : ["--lang", "ts"];
	const args = ["run", "--pattern", pattern, ...lang, ...extra, path];
	try {
		const proc = Bun.spawn(["ast-grep", ...args], { stdout: "inherit", stderr: "inherit" });
		return await proc.exited;
	} catch (err) {
		if (err instanceof Error && /Executable not found/.test(err.message)) {
			process.stderr.write(
				"ast-grep not found. Install with: brew install ast-grep  (or: cargo install ast-grep --locked)\n",
			);
			return 127;
		}
		throw err;
	}
}

async function main(): Promise<number> {
	const { positional, extra } = splitExtraArgs(process.argv.slice(2));
	const [pattern, pathArg] = positional;
	if (!pattern) {
		process.stderr.write(
			"usage: bun run search '<pattern>' [path] [-- extra-tool-args...]\n" +
				"  structural pattern (contains $METAVAR) → ast-grep\n" +
				"  regex / literal pattern → ripgrep\n",
		);
		return 2;
	}
	const path = pathArg ?? ".";
	const tool = pickTool(pattern);
	process.stderr.write(`[search] tool=${tool} pattern=${JSON.stringify(pattern)} path=${path}\n`);
	return tool === "ast-grep"
		? await runAstGrep(pattern, path, extra)
		: await runRipgrep(pattern, path, extra);
}

const exitCode = await main();
process.exit(exitCode);
