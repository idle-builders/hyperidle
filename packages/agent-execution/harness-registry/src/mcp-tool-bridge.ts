// Compatibility path for frozen direct-import tests. Production consumers use
// the package's explicit `./mcp` entry.
export { createMcpToolBridge, type McpToolBridge } from "./mcp/index.js";
