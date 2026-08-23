import { KnowledgeRow } from "../ds";
import { KnowledgeTopicGroup } from "./KnowledgeTopicGroup";

export default { title: "KnowledgeTopicGroup", tier: "utility" as const };

export const Fresh = (): React.JSX.Element => (
	<KnowledgeTopicGroup topic="Architecture" itemCount={3} staleCount={0} health="fresh">
		<KnowledgeRow title="Auth Strategy" layer="L0" kind="decision" status="active" timestamp="1d" />
		<KnowledgeRow title="Rate Limiting" layer="L1" kind="pattern" status="active" timestamp="2d" />
	</KnowledgeTopicGroup>
);

export const SomeStale = (): React.JSX.Element => (
	<KnowledgeTopicGroup topic="Onboarding" itemCount={4} staleCount={1} health="some_stale">
		<KnowledgeRow title="Welcome Copy" layer="L1" kind="principle" status="active" timestamp="2d" />
		<KnowledgeRow title="Interview Notes" layer="L0" kind="brief" status="stale" timestamp="2w" />
	</KnowledgeTopicGroup>
);

export const MostlyStale = (): React.JSX.Element => (
	<KnowledgeTopicGroup topic="Legacy Patterns" itemCount={4} staleCount={3} health="mostly_stale">
		<KnowledgeRow title="Old Mesh" layer="L1" kind="pattern" status="stale" timestamp="2w" />
		<KnowledgeRow title="Old Auth" layer="L0" kind="decision" status="stale" timestamp="3w" />
		<KnowledgeRow title="Old Copy" layer="L1" kind="principle" status="stale" timestamp="4w" />
	</KnowledgeTopicGroup>
);

export const Collapsed = (): React.JSX.Element => (
	<KnowledgeTopicGroup
		topic="Governance"
		itemCount={5}
		staleCount={0}
		health="fresh"
		initiallyCollapsed
	>
		<KnowledgeRow title="Policy" layer="L0" kind="decision" status="active" timestamp="1w" />
	</KnowledgeTopicGroup>
);
