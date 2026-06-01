/**
 * Toast stories.
 */

import type { JSX } from "react";
import { Toast } from "./Toast.js";

export default { title: "Toast" };

export function AllVariants(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<Toast
				variant="success"
				icon="✓"
				title="Saved"
				message="Your changes were saved successfully."
			/>
			<Toast
				variant="error"
				icon="!"
				title="Error"
				message="Something went wrong. Please try again."
			/>
			<Toast variant="warning" icon="⚠" title="Warning" message="This action cannot be undone." />
			<Toast
				variant="info"
				icon="i"
				title="Info"
				message="Your session will expire in 5 minutes."
			/>
		</div>
	);
}

export function WithClose(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<Toast
				variant="success"
				icon="✓"
				title="Saved"
				message="Your changes were saved."
				onClose={() => {}}
			/>
		</div>
	);
}
