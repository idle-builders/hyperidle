#!/usr/bin/env node
/**
 * AN2 — Stdio MCP server fixture for AC4 (second service by configuration).
 *
 * This script is spawned as a child process by AN2-second-service-config.integration.test.ts
 * using StdioClientTransport. It exposes:
 *   - list_items (idempotentHint:true → reversible for vetted source)
 *   - create_item (destructiveHint:true → irreversible)
 *
 * The credential is attached via env var BETA_API_TOKEN (ConnectorSpec.auth="env",
 * envVar="BETA_API_TOKEN"). The tool `get_token` echoes the env var so the test
 * can assert credential attach without needing HTTP request header capture.
 *
 * @lore AN2: For stdio the credential attaches at child-process spawn via
 * StdioClientTransport's env parameter (StdioServerParameters.env).
 * The spawned process sees the env var in process.env.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import z from "zod";

const server = new McpServer({
	name: "AN2-stdio-fixture",
	version: "1.0.0",
});

// list_items — idempotentHint:true → reversible for vetted source
server.tool(
	"list_items",
	"List items (idempotent)",
	{ filter: z.string().optional() },
	async (args) => ({
		content: [
			{ type: "text", text: JSON.stringify({ items: ["a", "b", "c"], filter: args.filter }) },
		],
	}),
	{ idempotentHint: true },
);

// create_item — destructiveHint:true → irreversible
server.tool(
	"create_item",
	"Create an item (destructive)",
	{ name: z.string(), value: z.string() },
	async (args) => ({
		content: [{ type: "text", text: `created:${args.name}=${args.value}` }],
	}),
	{ destructiveHint: true },
);

// get_token — echoes the BETA_API_TOKEN env var to prove credential attach (AC3a for stdio)
server.tool(
	"get_token",
	"Return the injected token (idempotent, proves env-var credential attach)",
	{},
	async () => ({
		content: [{ type: "text", text: `token:${process.env.BETA_API_TOKEN ?? ""}` }],
	}),
	{ idempotentHint: true },
);

const transport = new StdioServerTransport();
await server.connect(transport);
