import { AvatarMenu } from "./AvatarMenu";

export default {
	title: "AvatarMenu",
	tier: "3" as const,
};

const noop = (): void => undefined;

export const Default = (): React.JSX.Element => (
	<AvatarMenu
		actor={{ id: "actor:ceo", name: "Jane", role: "CEO" }}
		onPauseFactory={noop}
		onOpenSettings={noop}
		onSignOut={noop}
	/>
);
