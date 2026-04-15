import { query } from "@anthropic-ai/claude-agent-sdk";

const q = query({
	prompt:
		"Fetch https://www.cerebras.ai/pricing using WebFetch and write the content to /tmp/cerebras-pricing.txt using the Write tool.",
	options: {
		permissionMode: "bypassPermissions",
		allowDangerouslySkipPermissions: true,
	},
});

for await (const message of q) {
	if (message.type === "assistant") {
		const text = message.message?.content
			?.filter((c: { type: string }) => c.type === "text")
			.map((c: { type: string; text?: string }) => c.text ?? "")
			.join("");
		if (text) console.log(text);
	} else if (message.type === "result") {
		const r = message as { subtype: string; total_cost_usd: number; permission_denials?: unknown[] };
		console.log(`\nResult: ${r.subtype} | Cost: $${r.total_cost_usd.toFixed(4)}`);
		if (r.permission_denials?.length) {
			console.log("Permission denials:", JSON.stringify(r.permission_denials, null, 2));
		}
	}
}
