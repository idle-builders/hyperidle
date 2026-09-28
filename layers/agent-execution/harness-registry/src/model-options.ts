/**
 * Per-model harness options: declared keys and how they reach the binary.
 * OPTION_KEYS and OPTION_CARRIERS are typed together — a key with no carrier or a carrier
 * for an undeclared key fails `npm run check`.
 *
 * @lore: model-options coupling — `as const satisfies`; plain `Record<string, readonly string[]>` widens key types so both checks silently pass; do not change
 * @lore: model option values — stored on the agent (sparse); absent key = harness default; modelOptionArgv([]) must not change an unconfigured agent's invocation
 */

export type ModelOptionValue = string | number | boolean;

/**
 * The option keys each harness understands.
 *
 * `cursor-agent` declares none, and that is a finding rather than a gap: its
 * effort levels are part of model identity (it lists ~200 flat model ids like
 * `-low` / `-high` / `-fast`), and the bracket-override form its own help text
 * advertises is rejected by the binary.
 */
export const OPTION_KEYS = {
	"claude-code": ["effort"],
	codex: ["model_reasoning_effort"],
	opencode: ["variant"],
	"cursor-agent": [],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export type OptionCarryingHarness = keyof typeof OPTION_KEYS;

type OptionKeyOf<H extends OptionCarryingHarness> = (typeof OPTION_KEYS)[H][number];

/**
 * How one option value reaches its harness: appended to its command line.
 *
 * @lore OptionCarrier is "argv" only — every harness is a spawned process; there is no request-body carrier because there is no built-in harness.
 */
export type OptionCarrier = {
	readonly kind: "argv";
	readonly toArgv: (value: ModelOptionValue) => readonly string[];
};

/**
 * Every declared key's carrier. Typed from {@link OPTION_KEYS}, so this map
 * cannot drift from the declarations — that is the point of it.
 */
export const OPTION_CARRIERS: {
	readonly [H in OptionCarryingHarness]: {
		readonly [K in OptionKeyOf<H>]: OptionCarrier;
	};
} = {
	"claude-code": {
		effort: { kind: "argv", toArgv: (value) => ["--effort", String(value)] },
	},
	codex: {
		// codex takes a config override rather than a flag.
		model_reasoning_effort: {
			kind: "argv",
			toArgv: (value) => ["-c", `model_reasoning_effort=${String(value)}`],
		},
	},
	opencode: {
		variant: { kind: "argv", toArgv: (value) => ["--variant", String(value)] },
	},
	"cursor-agent": {},
};

/**
 * The values `--effort` accepts, from `claude --help` (2.1.220).
 *
 * This is the one choice list known at compile time. Every other harness
 * publishes its choices through a probe, and a probe that fails returns an empty
 * list — indistinguishable from "this model has no options". So the values a
 * probe supplies are never enforced here: **an absent list must never drop a
 * stored value**, or a network hiccup silently strips someone's configuration.
 */
const CLAUDE_EFFORT_VALUES = ["low", "medium", "high", "xhigh", "max"] as const;

function isCarryingHarness(harnessType: string): harnessType is OptionCarryingHarness {
	return harnessType in OPTION_KEYS;
}

/** True when this harness declares this key at all. */
function declaresKey(harnessType: OptionCarryingHarness, key: string): boolean {
	return (OPTION_KEYS[harnessType] as readonly string[]).includes(key);
}

/**
 * True when the value is one this harness will accept for this key.
 *
 * Only checked where a compile-time list exists — see {@link CLAUDE_EFFORT_VALUES}.
 * Everything else passes, deliberately.
 */
function valueIsAcceptable(
	harnessType: OptionCarryingHarness,
	key: string,
	value: ModelOptionValue,
): boolean {
	if (harnessType === "claude-code" && key === "effort") {
		return (CLAUDE_EFFORT_VALUES as readonly string[]).includes(String(value));
	}
	return true;
}

/**
 * Drop stored options this harness cannot use.
 *
 * An agent keeps its options when it switches model or harness, so a stored set
 * may legitimately hold keys the current harness never declared. Those are
 * dropped here, at the point the invocation is built, rather than pruned when
 * the agent is saved — pruning on save would delete a user's settings whenever a
 * model probe happened to be failing.
 */
export function reconcileModelOptions(
	harnessType: string,
	options: Readonly<Record<string, ModelOptionValue>> | undefined,
): Readonly<Record<string, ModelOptionValue>> {
	if (!(options && isCarryingHarness(harnessType))) return {};
	const out: Record<string, ModelOptionValue> = {};
	for (const [key, value] of Object.entries(options)) {
		if (!declaresKey(harnessType, key)) continue;
		if (!valueIsAcceptable(harnessType, key, value)) continue;
		out[key] = value;
	}
	return out;
}

/**
 * The extra command-line arguments this agent's options add.
 *
 * Empty when the agent has no usable options — which is what makes an
 * unconfigured agent's invocation identical to today's.
 */
export function modelOptionArgv(
	harnessType: string,
	options: Readonly<Record<string, ModelOptionValue>> | undefined,
): readonly string[] {
	if (!isCarryingHarness(harnessType)) return [];
	const usable = reconcileModelOptions(harnessType, options);
	const carriers: Readonly<Record<string, OptionCarrier>> = OPTION_CARRIERS[harnessType];
	const argv: string[] = [];
	for (const [key, value] of Object.entries(usable)) {
		const carrier = carriers[key];
		if (carrier?.kind === "argv") argv.push(...carrier.toArgv(value));
	}
	return argv;
}
