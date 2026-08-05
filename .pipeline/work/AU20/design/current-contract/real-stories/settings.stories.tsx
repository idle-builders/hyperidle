import { MemoryRouter } from "react-router-dom";
import { ToastRegion } from "../../../../../../layers/core-ui/src/shell/ToastRegion.js";
import { SettingsPage } from "../../../../../../layers/core-ui/src/pages/SettingsPage.js";
export default { title: "AU20 Real/Settings" };
export function Stacked(){return <MemoryRouter><ToastRegion><SettingsPage/></ToastRegion></MemoryRouter>}
