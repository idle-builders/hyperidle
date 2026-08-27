/**
 * A real capture of `claude -p "/model" --output-format json`, taken 2026-08-27
 * from claude 2.1.x, with the session/uuid identifiers redacted.
 *
 * Captured, never hand-written. The fixture this replaces was hand-written — a
 * Markdown table nobody had seen the binary produce — and it kept a test green
 * while production discovered zero claude models for months. `claude` has no
 * `models` subcommand at all (its `Commands:` list is agents, auth, auto-mode,
 * doctor, gateway, import, install, mcp, plugin, project, setup-token,
 * ultrareview, update), so `claude models` was being sent to the model as a
 * prompt: money spent per probe, prose back, and the answer varying with
 * whatever CLAUDE.md sat in the working directory.
 *
 * `/model` is a slash command the CLI answers locally. The capture's own
 * `total_cost_usd: 0`, `duration_api_ms: 0` and empty `modelUsage` are the proof
 * that no inference happened, and the discovery path asserts on them.
 */
export const CLAUDE_MODEL_COMMAND_CAPTURE = String.raw`{
	"is_error": false,
	"duration_api_ms": 0,
	"num_turns": 1,
	"stop_reason": "stop_sequence",
	"session_id": "<redacted>",
	"total_cost_usd": 0,
	"usage": {
		"input_tokens": 0,
		"output_tokens": 0,
		"cache_creation_input_tokens": 0,
		"cache_read_input_tokens": 0
	},
	"modelUsage": {},
	"permission_denials": [],
	"subtype": "success",
	"result": "Current model: Opus 5 (1M context) (effort: high)\nUsage: /model <name>. Available: sonnet, opus, haiku, fable, best, sonnet[1m], opus[1m], fable[1m], opusplan, default, or a full model ID.",
	"type": "result",
	"duration_ms": 812,
	"uuid": "<redacted>"
}`;

/**
 * The same command on a build whose `/model` answer names no models — the shape
 * discovery must treat as "this harness told us nothing", not as a parse bug.
 */
export const CLAUDE_MODEL_COMMAND_NO_LIST_CAPTURE = String.raw`{
	"is_error": false,
	"duration_api_ms": 0,
	"total_cost_usd": 0,
	"modelUsage": {},
	"subtype": "success",
	"result": "Current model: Opus 5 (1M context)",
	"type": "result"
}`;
