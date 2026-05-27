/**
 * Stories for CredentialsTab — fixed catalog display with per-credential state.
 *
 * Since the component requires window.__HYPERIDLE__, stories set up the mock bridge
 * via a decorator that injects it before render.
 */

import type { JSX } from "react";
import { useEffect } from "react";
import { CredentialsTab } from "./CredentialsTab.js";

export default { title: "CredentialsTab", tier: "settings" as const };

type Status = Record<string, string>;

function withBridge(status: Status, Component: () => JSX.Element): () => JSX.Element {
	return function WithBridge(): JSX.Element {
		useEffect(() => {
			Object.defineProperty(window, "__HYPERIDLE__", {
				value: {
					apiKey: "test-api-key",
					platform: "electron" as const,
					credentials: {
						list: async (): Promise<string[]> => [],
						get: async (): Promise<null> => null,
						set: async (): Promise<{ stored: boolean }> => ({ stored: true }),
						delete: async (): Promise<void> => undefined,
						isEncryptionAvailable: async (): Promise<boolean> => true,
						status: async (): Promise<Status> => status,
						validate: async (): Promise<{ valid: boolean }> => ({ valid: true }),
					},
					shell: {
						openLogs: async (): Promise<void> => undefined,
						openData: async (): Promise<void> => undefined,
						selectFolder: async (): Promise<null> => null,
					},
					onOpenSettings: (): (() => void) => () => undefined,
				},
				writable: true,
				configurable: true,
			});
			return () => {
				Object.defineProperty(window, "__HYPERIDLE__", {
					value: undefined,
					writable: true,
					configurable: true,
				});
			};
		}, []);
		return <Component />;
	};
}

const allAbsent: Status = {
	anthropic_api_key: "absent",
	openrouter_api_key: "absent",
	shared_backend_key: "absent",
};

const mixed: Status = {
	anthropic_api_key: "valid",
	openrouter_api_key: "present_untested",
	shared_backend_key: "absent",
};

const allInvalid: Status = {
	anthropic_api_key: "invalid",
	openrouter_api_key: "invalid",
	shared_backend_key: "invalid",
};

export const AllAbsent = withBridge(allAbsent, CredentialsTab);
export const MixedStates = withBridge(mixed, CredentialsTab);
export const AllInvalid = withBridge(allInvalid, CredentialsTab);

export const NoBridge: () => JSX.Element = (): JSX.Element => {
	useEffect(() => {
		Object.defineProperty(window, "__HYPERIDLE__", {
			value: undefined,
			writable: true,
			configurable: true,
		});
	}, []);
	return <CredentialsTab />;
};
