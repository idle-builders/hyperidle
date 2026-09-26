/**
 * `ScopePicker` new DS Tier-1 primitive.
 *
 * Consolidates the 3 hand-rolled scope pill rows + 1 Select into one component.
 * radiogroup of pills; required `testIdPrefix` → per-pill `${prefix}-${id}`;
 * emits `data-active` + `aria-checked`; `mode="select" | "filter"` (filter
 * supports a null "All" selection); focus-visible ring (fixes latent a11y gap);
 * disabled pill support with tooltip; uses `--accent-primary-dim` for active
 * tint (kills the hardcoded rgba literal).
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScopePicker, type ScopePickerOption } from "../ds";

const SELECT_OPTIONS: ScopePickerOption[] = [
	{ id: "shared", label: "Shared" },
	{ id: "team", label: "Team" },
	{ id: "private", label: "Private" },
];

const FILTER_OPTIONS: ScopePickerOption[] = [
	{ id: "all", label: "All" },
	{ id: "shared", label: "Shared" },
	{ id: "team", label: "Team" },
	{ id: "private", label: "Private" },
];

describe("ScopePicker — structure & a11y", () => {
	it("renders a radiogroup with the provided ariaLabel", () => {
		render(
			<ScopePicker
				options={SELECT_OPTIONS}
				value="shared"
				onChange={() => undefined}
				ariaLabel="Scope"
				testIdPrefix="scope-pill-create"
			/>,
		);
		const group = screen.getByRole("radiogroup", { name: "Scope" });
		expect(group).toBeInTheDocument();
	});

	it("renders one role=radio pill per option", () => {
		render(
			<ScopePicker
				options={SELECT_OPTIONS}
				value="shared"
				onChange={() => undefined}
				ariaLabel="Scope"
				testIdPrefix="scope-pill-create"
			/>,
		);
		expect(screen.getAllByRole("radio")).toHaveLength(3);
	});

	it("emits a container dataTestId passthrough", () => {
		render(
			<ScopePicker
				options={FILTER_OPTIONS}
				value={null}
				onChange={() => undefined}
				mode="filter"
				ariaLabel="Filter by scope"
				testIdPrefix="scope-pill"
				dataTestId="document-scope-pills"
			/>,
		);
		expect(screen.getByTestId("document-scope-pills")).toBeInTheDocument();
	});
});

describe("ScopePicker — testIdPrefix wiring", () => {
	it("derives each pill testid as prefix-plus-id", () => {
		render(
			<ScopePicker
				options={SELECT_OPTIONS}
				value="shared"
				onChange={() => undefined}
				ariaLabel="Scope"
				testIdPrefix="scope-pill-dialog"
			/>,
		);
		expect(screen.getByTestId("scope-pill-dialog-shared")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-dialog-team")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-dialog-private")).toBeInTheDocument();
	});

	it("honors a different prefix for the filter site", () => {
		render(
			<ScopePicker
				options={FILTER_OPTIONS}
				value={null}
				onChange={() => undefined}
				mode="filter"
				ariaLabel="Filter by scope"
				testIdPrefix="scope-pill"
			/>,
		);
		expect(screen.getByTestId("scope-pill-all")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-shared")).toBeInTheDocument();
	});
});

describe("ScopePicker — active state (data-active + aria-checked)", () => {
	it("marks the active pill with data-active='true' and aria-checked", () => {
		render(
			<ScopePicker
				options={SELECT_OPTIONS}
				value="team"
				onChange={() => undefined}
				ariaLabel="Scope"
				testIdPrefix="scope-pill-create"
			/>,
		);
		const active = screen.getByTestId("scope-pill-create-team");
		expect(active).toHaveAttribute("aria-checked", "true");
		expect(active).toHaveAttribute("aria-checked", "true");
	});

	it("marks inactive pills with data-active='false' and aria-checked='false'", () => {
		render(
			<ScopePicker
				options={SELECT_OPTIONS}
				value="team"
				onChange={() => undefined}
				ariaLabel="Scope"
				testIdPrefix="scope-pill-create"
			/>,
		);
		const inactive = screen.getByTestId("scope-pill-create-shared");
		expect(inactive).toHaveAttribute("aria-checked", "false");
		expect(inactive).toHaveAttribute("aria-checked", "false");
	});
});

describe("ScopePicker — filter mode null/All selection", () => {
	it("treats the first option ('all') as active when value is null", () => {
		render(
			<ScopePicker
				options={FILTER_OPTIONS}
				value={null}
				onChange={() => undefined}
				mode="filter"
				ariaLabel="Filter by scope"
				testIdPrefix="scope-pill"
			/>,
		);
		expect(screen.getByTestId("scope-pill-all")).toHaveAttribute("aria-checked", "true");
		expect(screen.getByTestId("scope-pill-shared")).toHaveAttribute("aria-checked", "false");
	});

	it("emits null when the 'all' pill is clicked in filter mode", async () => {
		const onChange = vi.fn();
		render(
			<ScopePicker
				options={FILTER_OPTIONS}
				value="shared"
				onChange={onChange}
				mode="filter"
				ariaLabel="Filter by scope"
				testIdPrefix="scope-pill"
			/>,
		);
		await userEvent.click(screen.getByTestId("scope-pill-all"));
		expect(onChange).toHaveBeenCalledWith(null);
	});
});

describe("ScopePicker — selection behavior", () => {
	it("emits the clicked option id (select mode)", async () => {
		const onChange = vi.fn();
		render(
			<ScopePicker
				options={SELECT_OPTIONS}
				value="shared"
				onChange={onChange}
				ariaLabel="Scope"
				testIdPrefix="scope-pill-create"
			/>,
		);
		await userEvent.click(screen.getByTestId("scope-pill-create-private"));
		expect(onChange).toHaveBeenCalledWith("private");
	});
});

describe("ScopePicker — disabled options", () => {
	const WITH_DISABLED: ScopePickerOption[] = [
		{ id: "shared", label: "Shared" },
		{ id: "team", label: "Team", disabled: true },
		{ id: "private", label: "Private" },
	];

	it("renders the disabled pill as disabled with aria-disabled", () => {
		render(
			<ScopePicker
				options={WITH_DISABLED}
				value="shared"
				onChange={() => undefined}
				ariaLabel="Scope"
				testIdPrefix="scope-pill-create"
				disabledTitle="Join a team to use team-scoped documents"
			/>,
		);
		const teamPill = screen.getByTestId("scope-pill-create-team");
		expect(teamPill).toBeDisabled();
		expect(teamPill).toHaveAttribute("title", "Join a team to use team-scoped documents");
	});

	it("does not emit onChange when a disabled pill is clicked", async () => {
		const onChange = vi.fn();
		render(
			<ScopePicker
				options={WITH_DISABLED}
				value="shared"
				onChange={onChange}
				ariaLabel="Scope"
				testIdPrefix="scope-pill-create"
				disabledTitle="Join a team"
			/>,
		);
		await userEvent.click(screen.getByTestId("scope-pill-create-team"));
		expect(onChange).not.toHaveBeenCalled();
	});
});
