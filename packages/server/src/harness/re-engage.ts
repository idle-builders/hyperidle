/**
 * AL6 v3: Re-engagement helper for the provisioning re-prompt loop (Layer B).
 *
 * `rewriteSandboxForcing` appends `AL6_FORCE_RETURN_MESSAGE` to the assembled
 * prompt and re-writes both AGENTS.md and CLAUDE.md in the sandbox directory via
 * `writeSandboxAgentsMd`. Called by the provisioner BEFORE a second `startSession`
 * so the re-spawned adapter reads the updated instructions.
 *
 * Carrier design (why sandbox file, not config.messages):
 * Every adapter's `startSession` reads its model instructions from `cwd:sandboxPath`
 * (cli:209, sdk:217+231-234, isolated:49-51, remote re-dispatch). `config.messages`
 * is consumed ONLY by the builtin adapter (chat path). Using the sandbox file is the
 * ONE channel that verifiably reaches all five adapters.
 *
 * @lore AL6 v3: This is the carrier for Layer-B (provisioning re-prompt loop).
 * It is a plain file write — idempotent, no new interface method, no per-adapter
 * special-casing. The same `writeSandboxAgentsMd` the provisioner already calls in
 * Phase 8.5 is called again with the forcing message appended.
 *
 * @lore AL6 v3: File-watcher interaction is BENIGN. The fabric watcher monitors
 * `sandboxPath/knowledge` and `sandboxPath/work` (file-watcher.ts:33-34). AGENTS.md
 * and CLAUDE.md live at the sandbox ROOT — outside both watched directories.
 * Rewriting them mid-session triggers no ingestion/writeback event.
 */

import { writeSandboxAgentsMd } from "@hyperidle/fabric";
import { AL6_FORCE_RETURN_MESSAGE } from "@hyperidle/shared";

/**
 * Re-write the sandbox instruction files (AGENTS.md + CLAUDE.md) with the
 * assembled prompt + forcing message appended.
 *
 * Called by the provisioning re-prompt loop before each re-engage `startSession`
 * so the re-spawned adapter reads the forcing message alongside the original prompt.
 *
 * @param sandboxPath - Absolute path to the provisioned sandbox directory.
 * @param baseAssembledPrompt - The original assembled prompt from Phase 8.5.
 *   This is the FULL prompt as first written (without any prior forcing message).
 *   The function appends `\n\n` + `AL6_FORCE_RETURN_MESSAGE` to produce the
 *   forcing variant. The base prompt is kept intact — only a suffix is added.
 */
export function rewriteSandboxForcing(sandboxPath: string, baseAssembledPrompt: string): void {
	const forcingPrompt = `${baseAssembledPrompt}\n\n${AL6_FORCE_RETURN_MESSAGE}`;
	writeSandboxAgentsMd(sandboxPath, forcingPrompt);
}
