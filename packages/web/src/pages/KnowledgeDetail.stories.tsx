import { MemoryRouter, Route, Routes } from "react-router-dom";
import { KnowledgeDetail } from "./KnowledgeDetail";

export default { title: "Page: Knowledge/Detail" };

export const KnownItem = (): React.JSX.Element => (
	<MemoryRouter initialEntries={["/knowledge/k1"]}>
		<Routes>
			<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
		</Routes>
	</MemoryRouter>
);

export const FactoryScopeNoEdit = (): React.JSX.Element => (
	<MemoryRouter initialEntries={["/knowledge/k11"]}>
		<Routes>
			<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
		</Routes>
	</MemoryRouter>
);

export const FactoryNeedsHumanBanner = (): React.JSX.Element => (
	<MemoryRouter initialEntries={["/knowledge/k12"]}>
		<Routes>
			<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
		</Routes>
	</MemoryRouter>
);

export const UnknownItem = (): React.JSX.Element => (
	<MemoryRouter initialEntries={["/knowledge/unknown"]}>
		<Routes>
			<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
		</Routes>
	</MemoryRouter>
);
