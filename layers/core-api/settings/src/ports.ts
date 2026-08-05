import type { HyperIdleDb, Routine, User } from "@hyperidle/db";

/** Settings' narrow read dependency on the routine service. */
export interface RoutineReader {
	listRoutines(db: HyperIdleDb, opts?: { includeDeleted?: boolean }): Promise<Routine[]>;
}

/** Settings' narrow read dependency on the users service. */
export interface SettingsUserDirectory {
	listUsersByKind(db: HyperIdleDb, kind: string): Promise<User[]>;
}

/** Secret transformation dependency used by the one-shot credential migration. */
export interface SettingsCredentialCipher {
	encryptCredentialValue(plaintext: string): string;
	decryptCredentialValue(encrypted: string): string | null;
}
