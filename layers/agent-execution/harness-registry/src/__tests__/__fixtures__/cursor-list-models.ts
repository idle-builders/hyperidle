/**
 * A real capture of `cursor-agent --list-models`, taken 2026-08-27 against a
 * signed-in Cursor account, truncated in the middle (the real answer lists ~30
 * models; every line has the same shape).
 *
 * Captured, never hand-written.
 *
 * Two details the parser has to survive, both visible here:
 *  - `--list-models` ignores `--output-format`. There is no JSON form; the text
 *    is the interface.
 *  - The model that is currently selected carries a ` (current)` suffix on its
 *    label, and `auto` carries ` (default)`. Both move between runs — this
 *    capture has it on `gpt-5.2` only because the previous run selected that
 *    model. A parser that keeps the suffix produces a label that changes under
 *    the reader's feet.
 */
export const CURSOR_LIST_MODELS_CAPTURE = `Available models

auto - Auto (default)
gpt-5.3-codex-low - Codex 5.3 Low
gpt-5.3-codex-low-fast - Codex 5.3 Low Fast
gpt-5.3-codex - Codex 5.3
gpt-5.3-codex-fast - Codex 5.3 Fast
gpt-5.3-codex-high - Codex 5.3 High
gpt-5.3-codex-high-fast - Codex 5.3 High Fast
gpt-5.3-codex-xhigh - Codex 5.3 Extra High
gpt-5.3-codex-xhigh-fast - Codex 5.3 Extra High Fast
gpt-5.2 - GPT-5.2 (current)
cursor-grok-4.6-high-fast - Cursor Grok 4.6 Fast
composer-2.5 - Composer 2.5
claude-opus-5-thinking-high - Claude Opus 5 1M Thinking
claude-opus-5-thinking-high-fast - Claude Opus 5 1M Thinking Fast
gpt-5.6-sol-high - GPT-5.6 Sol 1M High
gpt-5.6-sol-high-fast - GPT-5.6 Sol High Fast
gpt-5.6-sol-xhigh - GPT-5.6 Sol 1M Extra High
gpt-5.6-sol-xhigh-fast - GPT-5.6 Sol Extra High Fast
gemini-3-flash - Gemini 3 Flash

Tip: use --model <id> (or /model <id> in interactive mode) to switch. Parameterized models also accept quoted overrides, e.g. --model 'claude-opus-4-8[context=1m,effort=high,fast=false]'.`;
