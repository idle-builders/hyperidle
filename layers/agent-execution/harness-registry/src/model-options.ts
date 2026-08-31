/**
 * Per-model harness options: what each harness declares, and how a configured
 * value actually reaches its binary.
 *
 * Both halves live in this one module on purpose. `OPTION_KEYS` is the single
 * list of keys a harness may declare, and `OPTION_CARRIERS` is typed *from* it —
 * so a key declared with no carrier, or a carrier for a key nothing declares,
 * fails `npm run check`. That coupling is the guard against the defect this
 * feature exists to fix: an option written somewhere and read nowhere.
 *
 * @lore The coupling was break-tested rather than assumed, and fires both ways:
 * deleting a declared key's carrier gives `TS2741: Property 'effort' is missing`,
 * and adding a carrier for a key nothing declares gives `TS2353: 'bogus_key' does
 * not exist`. It rests on `as const satisfies` — annotating `OPTION_KEYS` as a
 * plain `Record<string, readonly string[]>` instead widens the key types and both
 * checks silently pass, which is exactly how this guard would rot without anyone
 * noticing. Do not change that spelling.
 *
 * @lore An option's value is stored on the agent, not chosen per message. The
 * stored set is sparse — an absent key means "whatever the harness does" — so an
 * agent with no options must produce character-for-character the invocation it
 * produced before this existed. {@link modelOptionArgv} returning an empty array
 * is what makes that true.
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
 * @lore There used to be a second shape, `request-field`, naming a field on an
 * outgoing request body — the built-in harness had no command line to append to,
 * because it called the model API itself. Every harness is a spawned process
 * now, so every option is an argument.
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
