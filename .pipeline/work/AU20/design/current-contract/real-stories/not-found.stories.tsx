import { MemoryRouter } from "react-router-dom";
import { Default } from "../../../../../../layers/core-ui/src/pages/NotFound.stories.js";

export default { title: "AU20 Real/NotFound" };

export function Routed(): React.JSX.Element {
	return (
		<MemoryRouter>
			<Default />
		</MemoryRouter>
	);
}
