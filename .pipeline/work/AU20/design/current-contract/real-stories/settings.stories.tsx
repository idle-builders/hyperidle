import { MemoryRouter } from "react-router-dom";
import { ToastRegion } from "../../../../../../packages/web/src/shell/ToastRegion.js";
import { SettingsPage } from "../../../../../../packages/web/src/pages/SettingsPage.js";
export default { title: "AU20 Real/Settings" };
export function Stacked(){return <MemoryRouter><ToastRegion><SettingsPage/></ToastRegion></MemoryRouter>}
