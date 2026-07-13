/**
 * @hyperidle/agent-execution — Layer composition barrel.
 *
 * The execution Layer composes harness/LLM/MCP/tool Service packages. It holds
 * ZERO domain-Service or DB reference (Mechanism B): it receives an assembled
 * context bundle and returns raw output. Its dependencies are `@hyperidle/shared`
 * plus its own execution Services — never `@hyperidle/db`.
 */
export { harnessCapabilities } from "@hyperidle/harness-registry";
export type { HarnessDescriptor } from "@hyperidle/harness-registry";
