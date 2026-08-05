import { MemoryRouter } from "react-router-dom";
import { ToastRegion } from "../../../../../../layers/web/src/shell/ToastRegion.js";
import { WithRichDescription } from "../../../../../../layers/web/src/pages/WorkBet.stories.js";

export default { title: "AU20 Real/WorkBet" };
export function RichDescription() {
  return <MemoryRouter><ToastRegion><WithRichDescription /></ToastRegion></MemoryRouter>;
}
