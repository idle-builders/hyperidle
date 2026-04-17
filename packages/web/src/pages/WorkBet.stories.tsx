import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WorkBet } from "./WorkBet";

export default { title: "Page: Work/Bet" };

export const KnownBet = (): React.JSX.Element => (
	<MemoryRouter initialEntries={["/work/bet/b1"]}>
		<Routes>
			<Route path="/work/bet/:betId" element={<WorkBet />} />
		</Routes>
	</MemoryRouter>
);

export const UnknownBet = (): React.JSX.Element => (
	<MemoryRouter initialEntries={["/work/bet/unknown"]}>
		<Routes>
			<Route path="/work/bet/:betId" element={<WorkBet />} />
		</Routes>
	</MemoryRouter>
);
