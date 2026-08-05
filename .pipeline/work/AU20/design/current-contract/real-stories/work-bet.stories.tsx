import { MemoryRouter } from "react-router-dom";
import { ToastRegion } from "../../../../../../layers/core-ui/src/shell/ToastRegion.js";
import { WithRichDescription } from "../../../../../../layers/core-ui/src/pages/WorkBet.stories.js";

export default { title: "AU20 Real/WorkBet" };
export function RichDescription() {
  return <MemoryRouter><ToastRegion><WithRichDescription /></ToastRegion></MemoryRouter>;
}
