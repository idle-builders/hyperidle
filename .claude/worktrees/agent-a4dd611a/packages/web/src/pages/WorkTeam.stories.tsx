import { MemoryRouter } from "react-router-dom";
import { WorkTeam } from "./WorkTeam";

export default { title: "Page: Work/Team" };

export const Default = (): React.JSX.Element => (
	<MemoryRouter>
		<WorkTeam />
	</MemoryRouter>
);
