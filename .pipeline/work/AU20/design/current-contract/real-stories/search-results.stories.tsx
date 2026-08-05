import { useEffect } from "react";
import { GlobalSearchPanel } from "../../../../../../layers/web/src/components/GlobalSearchPanel.js";

export default { title: "AU20 Real/Global Search Results" };
const payload = {
	conversations: [{ id: "c1", title: "Deploy review", snippet: "Reviewing the deploy pipeline...", timestamp: "2 min ago", kind: "review" }],
	work: [{ id: "w1", title: "Mobile App V2", team: "HyperIdle", status: "active", appetite: "6 weeks" }],
	knowledge: [{ id: "k1", title: "Rate Limiting Pattern", layer: "L2", kind: "pattern", status: "validated", timestamp: "1 hour ago" }],
};
export function Open(): React.JSX.Element {
	useEffect(() => {
		const original = globalThis.fetch;
		globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
		return () => { globalThis.fetch = original; };
	}, []);
	return <GlobalSearchPanel open={true} onClose={() => undefined} onNavigate={() => undefined} />;
}
