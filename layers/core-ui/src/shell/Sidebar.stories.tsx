/**
 * Sidebar stories — rendered for design review in the story viewer.
 * Shows key states: populated, empty sections, active view variants.
 */

import type { JSX } from "react";
import { Sidebar } from "./Sidebar";

export default { title: "Shell/Sidebar" };

const noop = (): void => undefined;

const commonProps = {
	onViewChange: noop,
	selectedThreadId: null,
	onSelectThread: noop,
	activeTeamId: null,
	onSelectTeam: noop,
	onAssistantClick: noop,
	assistantOverlayOpen: false,
	onSettingsClick: noop,
	settingsOpen: false,
	onSearchClick: noop,
};

const sampleThreads = [
	{ id: "t1", title: "Review: PR #128 — refactor auth flow", hasUnresolvedReview: true },
	{ id: "t2", title: "Check in on Sprint 12 blocker", hasUnresolvedReview: false },
	{ id: "t3", title: "API design feedback needed", hasUnresolvedReview: false },
	{ id: "t4", title: "Q3 planning retrospective", hasUnresolvedReview: false },
	{ id: "t5", title: "Onboarding new engineer", hasUnresolvedReview: false },
];

const sampleTeams = [
	{ id: "team-1", name: "Platform Team" },
	{ id: "team-2", name: "Product Alpha" },
	{ id: "team-3", name: "Factory Operations" },
];

export function ConversationsActive(): JSX.Element {
	return (
		<div style={{ height: "720px", display: "flex", width: "276px" }}>
			<Sidebar
				{...commonProps}
				activeView="conversations"
				threads={sampleThreads}
				teams={sampleTeams}
				userInitials="TG"
			/>
		</div>
	);
}

export function WorkActive(): JSX.Element {
	return (
		<div style={{ height: "720px", display: "flex", width: "276px" }}>
			<Sidebar
				{...commonProps}
				activeView="work"
				threads={sampleThreads}
				teams={sampleTeams}
				activeTeamId="team-1"
				userInitials="TG"
			/>
		</div>
	);
}

export function KnowledgeActive(): JSX.Element {
	return (
		<div style={{ height: "720px", display: "flex", width: "276px" }}>
			<Sidebar
				{...commonProps}
				activeView="knowledge"
				threads={sampleThreads}
				teams={sampleTeams}
				userInitials="TG"
			/>
		</div>
	);
}

export function EmptySections(): JSX.Element {
	return (
		<div style={{ height: "720px", display: "flex", width: "276px" }}>
			<Sidebar
				{...commonProps}
				activeView="conversations"
				threads={[]}
				teams={[]}
				userInitials="TG"
			/>
		</div>
	);
}

export function WithSelectedThread(): JSX.Element {
	return (
		<div style={{ height: "720px", display: "flex", width: "276px" }}>
			<Sidebar
				{...commonProps}
				activeView="conversations"
				threads={sampleThreads}
				selectedThreadId="t2"
				teams={sampleTeams}
				userInitials="TG"
			/>
		</div>
	);
}

export function AssistantOverlayOpen(): JSX.Element {
	return (
		<div style={{ height: "720px", display: "flex", width: "276px" }}>
			<Sidebar
				{...commonProps}
				activeView="conversations"
				threads={sampleThreads}
				teams={sampleTeams}
				assistantOverlayOpen={true}
				userInitials="TG"
			/>
		</div>
	);
}

export function SettingsOverlayOpen(): JSX.Element {
	return (
		<div style={{ height: "720px", display: "flex", width: "276px" }}>
			<Sidebar
				{...commonProps}
				activeView="conversations"
				threads={sampleThreads}
				teams={sampleTeams}
				settingsOpen={true}
				userInitials="TG"
			/>
		</div>
	);
}

export function WithUserAvatar(): JSX.Element {
	return (
		<div style={{ height: "720px", display: "flex", width: "276px" }}>
			<Sidebar
				{...commonProps}
				activeView="conversations"
				threads={sampleThreads.slice(0, 3)}
				teams={sampleTeams}
				avatarUrl="https://api.dicebear.com/7.x/initials/svg?seed=TG&backgroundColor=4ade80"
				userInitials="TG"
			/>
		</div>
	);
}
