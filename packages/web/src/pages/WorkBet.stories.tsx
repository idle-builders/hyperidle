import { WorkBet } from "./WorkBet";

export default { title: "Page: Work/Bet" };

export const KnownBet = (): React.JSX.Element => <WorkBet overrideBetId="b1" />;

export const ShapedBet = (): React.JSX.Element => <WorkBet overrideBetId="b2" />;

export const UnknownBet = (): React.JSX.Element => <WorkBet overrideBetId="unknown" />;

export const Loading = (): React.JSX.Element => <WorkBet loading />;
