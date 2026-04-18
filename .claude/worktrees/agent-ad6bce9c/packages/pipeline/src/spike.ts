import { query } from "@anthropic-ai/claude-agent-sdk";

async function main(): Promise<void> {
	const cwd = process.cwd();

	// biome-ignore lint/suspicious/noConsole: spike test
	console.log(`Testing SDK from cwd: ${cwd}`);

	for await (const msg of query({
		prompt: "Say exactly: hello pipeline test",
		options: {
			cwd,
			maxTurns: 1,
			permissionMode: "auto",
			includePartialMessages: true,
		},
	})) {
		if (msg.type === "assistant") {
			// biome-ignore lint/suspicious/noConsole: spike test
			console.log("ASSISTANT:", JSON.stringify(msg.message?.content?.slice(0, 1)));
		}
		if (msg.type === "result") {
			// biome-ignore lint/suspicious/noConsole: spike test
			console.log("RESULT:", msg.subtype, "cost:", msg.total_cost_usd);
		}
	}
}

main().catch((e) => {
	// biome-ignore lint/suspicious/noConsole: spike test
	console.error("FAILED:", e.message ?? e);
	process.exit(1);
});
