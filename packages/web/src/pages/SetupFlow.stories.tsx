/**
 * AE2: SetupFlow stories.
 * Shows the default state (Software preset selected) and the Custom preset state.
 */

import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SetupFlow } from "./SetupFlow";

export default { title: "Page: Setup/SetupFlow" };

/** Default state — Software preset pre-selected. */
export const Default = (): React.JSX.Element => (
	<MemoryRouter initialEntries={["/setup"]}>
		<Routes>
			<Route path="/setup" element={<SetupFlow />} />
			<Route path="/work/portfolio" element={<div>Portfolio</div>} />
		</Routes>
	</MemoryRouter>
);
