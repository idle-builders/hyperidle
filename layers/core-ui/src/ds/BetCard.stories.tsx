import { BetCard } from "./BetCard";

export default {
	title: "BetCard",
	tier: "2" as const,
	uses: ["Tag", "KeyValue"],
	order: [
		"Active",
		"AtRisk",
		"Draft",
		"Completed",
		"Killed",
		"WithAvatars",
		"WithProgress",
		"AllStatuses",
		"PortfolioMode",
		"WithVerdictBadge",
	],
};

export const Active = (): React.JSX.Element => (
	<div className="max-w-[380px]">
		<BetCard
			title="Auth migration"
			team="Product"
			status="active"
			description="Replace password-based auth with WebAuthn passkeys. Target: 60% reduction in auth support tickets."
			budgetLabel="$2,400"
			progress={35}
			avatarGroup={[{ initials: "TG" }, { initials: "KL" }, { initials: "AT", agent: true }]}
		/>
	</div>
);

export const AtRisk = (): React.JSX.Element => (
	<div className="max-w-[380px]">
		<BetCard
			title="Search rewrite"
			team="Infrastructure"
			status="active"
			description="Replace Elasticsearch with a hybrid vector + keyword search. Sub-200ms p95 latency target."
			budgetLabel="$5,000"
			progress={68}
			avatarGroup={[{ initials: "JS" }, { initials: "AT", agent: true }, { initials: "MR" }]}
		/>
	</div>
);

export const Draft = (): React.JSX.Element => (
	<div className="max-w-[380px]">
		<BetCard
			title="Billing overhaul"
			team="Growth"
			status="draft"
			description="Usage-based billing with agent compute metering. Replace flat-rate plans with per-token pricing."
			budgetLabel="$3,800"
			progress={0}
			avatarGroup={[{ initials: "JS" }]}
		/>
	</div>
);

export const Completed = (): React.JSX.Element => (
	<div className="max-w-[380px]">
		<BetCard
			title="Onboarding v3"
			team="Product"
			status="completed"
			description="New guided onboarding flow with agent introduction. Reduced time-to-value from 8 min to 2 min."
			budgetLabel="$1,200"
			progress={100}
			avatarGroup={[{ initials: "TG" }, { initials: "KL" }]}
		/>
	</div>
);

export const Killed = (): React.JSX.Element => (
	<div className="max-w-[380px]">
		<BetCard title="Deprecated Feature" team="Legacy" status="killed" appetite="1 week" />
	</div>
);

export const WithAvatars = (): React.JSX.Element => (
	<div className="max-w-[380px]">
		<BetCard
			title="Knowledge Graph Rebuild"
			team="Fabric"
			status="active"
			appetite="4 weeks"
			progress={{ done: 3, total: 8 }}
			avatarGroup={[
				{ initials: "TG" },
				{ initials: "KL" },
				{ initials: "AT", agent: true },
				{ initials: "MR" },
			]}
		/>
	</div>
);

export const WithProgress = (): React.JSX.Element => (
	<div className="max-w-[380px]">
		<BetCard
			title="Knowledge Graph Rebuild"
			team="Fabric"
			status="active"
			appetite="4 weeks"
			progress={{ done: 3, total: 8 }}
		/>
	</div>
);

export const AllStatuses = (): React.JSX.Element => (
	<div className="flex flex-col gap-[12px] max-w-[380px]">
		<BetCard title="Draft Bet" team="App" status="draft" appetite="6 weeks" />
		<BetCard title="Active Bet" team="App" status="active" appetite="4 weeks" />
		<BetCard
			title="Active Bet with Progress"
			team="App"
			status="active"
			appetite="3 weeks"
			progress={{ done: 2, total: 5 }}
		/>
		<BetCard title="Completed Bet" team="App" status="completed" appetite="2 weeks" />
		<BetCard title="Killed Bet" team="App" status="killed" appetite="1 week" />
	</div>
);

export const PortfolioMode = (): React.JSX.Element => (
	<div className="max-w-[380px]">
		<BetCard
			title="HyperIdle Core"
			team="HyperIdle"
			status="active"
			appetite="Cycle 12"
			leadAvatar={{ name: "CEO Agent", initials: "CE" }}
			activeBets={4}
			shipped={12}
			progress={{ done: 3, total: 5 }}
		/>
	</div>
);

/** AC1: BetCard with outcome verdict badge — all four verdict values shown */
export const WithVerdictBadge = (): React.JSX.Element => (
	<div className="flex flex-col gap-[12px] max-w-[380px]">
		<BetCard
			id="v1"
			title="Validated hypothesis"
			team="Alpha Core"
			status="completed"
			description="Chunked upload hypothesis held — failure rate dropped from 12% to 2.1%."
			outcomeVerdict="validated"
			progress={100}
		/>
		<BetCard
			id="v2"
			title="Refuted hypothesis"
			team="Alpha Core"
			status="killed"
			description="The performance optimization did not reduce latency as expected."
			outcomeVerdict="refuted"
			progress={60}
		/>
		<BetCard
			id="v3"
			title="Partial results"
			team="Beta Surface"
			status="completed"
			description="Some user segments responded well; others showed no improvement."
			outcomeVerdict="partial"
			progress={100}
		/>
		<BetCard
			id="v4"
			title="Inconclusive data"
			team="Beta Surface"
			status="completed"
			description="The experiment ran too short for statistical significance."
			outcomeVerdict="inconclusive"
			progress={100}
		/>
		<BetCard
			id="v5"
			title="Not evaluated yet"
			team="Alpha Core"
			status="completed"
			description="Shipped but outcome not yet recorded."
			progress={100}
		/>
	</div>
);
