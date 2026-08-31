/**
 * The harness an eval run drives.
 *
 * An eval measures HyperIdle — its tools, its prompts, its knowledge, its
 * harness wiring — so the thing under measurement has to be a harness a real
 * user can actually run. There is no in-process option any more: every eval
 * session spawns one of the installed CLIs, exactly as production does.
 *
 * The selection is run-scoped rather than per-scenario. A run answers one
 * question — "how well does HyperIdle work on THIS harness?" — and mixing
 * harnesses inside a single report would make the score unreadable. Compare
 * harnesses by running the suite once per harness.
 */

import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

/** The CLI harnesses an eval can run against. */
export const EVAL_HARNESSES = ["claude", "codex", "opencode", "cursor-agent"] as const;
export type EvalHarnessName = (typeof EVAL_HARNESSES)[number];

/**
 * The `agent_run_config.harness_type` each name registers under in the adapter
 * pool. Only `claude` differs from its own binary name.
 */
const HARNESS_TYPE: Record<EvalHarnessName, string> = {
	claude: "claude-code",
	codex: "codex",
	opencode: "opencode",
	"cursor-agent": "cursor-agent",
};

/** The binary each harness is spawned as — what has to be on PATH. */
const HARNESS_BINARY: Record<EvalHarnessName, string> = {
	claude: "claude",
	codex: "codex",
	opencode: "opencode",
	"cursor-agent": "cursor-agent",
};

export function isEvalHarnessName(value: string): value is EvalHarnessName {
	return (EVAL_HARNESSES as readonly string[]).includes(value);
}

interface EvalHarnessSelection {
	readonly harness: EvalHarnessName;
	/** The harness-native model id, or null to let the harness keep its own default. */
	readonly model: string | null;
}

let selection: EvalHarnessSelection | null = null;

/**
 * Fix the harness for this run. Hard-fails when the binary is absent — an eval
 * that cannot spawn its harness cannot produce a score, and a skipped run that
 * reports green is worse than no run at all.
 */
/**
 * True when `binary` is executable somewhere on PATH.
 *
 * @lore Scans PATH rather than shelling out to `which`. A subprocess for this
 * is a whole extra binary the eval would depend on — and `which` is not
 * guaranteed to be present, which would turn "harness missing" into "which
 * missing" and report the wrong problem.
 */
function isOnPath(binary: string): boolean {
	for (const dir of (process.env.PATH ?? "").split(delimiter)) {
		if (!dir) continue;
		try {
			accessSync(join(dir, binary), constants.X_OK);
			return true;
		} catch {
			// not here — keep looking
		}
	}
	return false;
}

export function selectEvalHarness(harness: EvalHarnessName, model: string | null): void {
	const binary = HARNESS_BINARY[harness];
	if (!isOnPath(binary)) {
		throw new Error(
			`[eval] harness "${harness}" is not installed — \`${binary}\` is not on PATH. ` +
				"Install it (or pick another with --harness); the eval cannot complete without it.",
		);
	}
	selection = { harness, model };
}

function requireSelection(): EvalHarnessSelection {
	if (!selection) {
		throw new Error(
			"[eval] no harness selected — call selectEvalHarness() before running any scenario.",
		);
	}
	return selection;
}

/** The `harness_type` seeded agents run under for this run. */
export function evalHarnessType(): string {
	return HARNESS_TYPE[requireSelection().harness];
}

/** The harness-native model id seeded agents run under, or null for the harness default. */
export function evalHarnessModel(): string | null {
	return requireSelection().model;
}

/** The selected harness's own name, for report labelling. */
export function evalHarnessName(): EvalHarnessName {
	return requireSelection().harness;
}
