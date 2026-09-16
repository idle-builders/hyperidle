/**
 * The one phrasing for every way a Google Drive filesystem can be unusable —
 * shared by `checkFilesystem` (`filesystem-check.ts`) and `DriveFolderAdapter`
 * (`mounter.ts`), so a person never sees two different sentences about the
 * same failure. Lives in its own file rather than either of those two,
 * because they would otherwise import from each other.
 */
export type DriveFailureCode =
	| "not_installed"
	| "remote_missing"
	| "directory_not_found"
	| "not_a_folder"
	| "failed";

export function driveReason(
	code: DriveFailureCode,
	ref: { readonly remote: string; readonly path: string },
	detail?: string,
): string {
	switch (code) {
		case "not_installed":
			return "Install rclone, then run `rclone config` to add your Google Drive remote — HyperIdle copies Drive folders through it";
		case "remote_missing":
			return `No rclone remote named \`${ref.remote}\`. Run \`rclone config\` to add one. Google makes you create your own OAuth client the first time; rclone's Google Drive setup walks you through it`;
		case "directory_not_found":
			return `Folder \`${ref.path}\` is not in the \`${ref.remote}\` Drive remote`;
		case "not_a_folder":
			return `\`${ref.remote}:${ref.path}\` is a file, not a folder`;
		case "failed":
			return `rclone could not reach \`${ref.remote}:${ref.path}\`: ${detail}. If your Drive login expired, run \`rclone config reconnect ${ref.remote}:\``;
	}
}
