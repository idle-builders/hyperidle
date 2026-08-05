import { useEffect } from "react";
import { GlobalSearchPanel } from "../../../../../../layers/web/src/components/GlobalSearchPanel.js";

export default { title: "AU20 Real/Global Search Empty" };
const payload = { conversations: [], work: [], knowledge: [] };
export function Open(): React.JSX.Element {
	useEffect(() => {
		const original = globalThis.fetch;
		globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
		return () => { globalThis.fetch = original; };
	}, []);
	return <GlobalSearchPanel open={true} onClose={() => undefined} onNavigate={() => undefined} />;
}
