/** Channel id mirrors the configured adapter `name`. */
export type NotificationChannel = "console" | "ntfy" | "smtp";

// ---------------------------------------------------------------------------
// Private types — not exported from this file or the barrel.
// Defined here so NotificationAdapter (exported) can reference Recipient /
// SendResult in its interface without re-declaring them.
// ---------------------------------------------------------------------------

/** Severity drives push priority + digest/queue routing. */
type NotificationSeverity = "blocking" | "digest";

/** Adapter-specific send target. */
interface Recipient {
	readonly channelId: string;
	readonly label?: string;
}

type SendResult =
	| { readonly ok: true; readonly channel: NotificationChannel; readonly sentAt: string }
	| {
			readonly ok: false;
			readonly channel: NotificationChannel;
			readonly error: string;
			readonly retriable: boolean;
	  };

// ---------------------------------------------------------------------------
// Public exports (3 types)
// ---------------------------------------------------------------------------

export interface Notification {
	/** Short subject line (<= 140 chars after truncation). */
	readonly title: string;
	/** Plain text body (<= 10_000 chars after truncation). */
	readonly body: string;
	readonly severity: NotificationSeverity;
	/** Opaque link back into the app for clients that render it. */
	readonly deepLink?: string;
	/** Tags for channels that support categorization (ntfy `Tags` header). */
	readonly tags?: readonly string[];
	/** Epoch ms at which the notification was produced. */
	readonly timestamp: number;
}

export interface NotificationAdapter {
	readonly name: NotificationChannel;
	send(recipient: Recipient, notification: Notification): Promise<SendResult>;
	/**
	 * Optional teardown hook. The dispatcher calls `close()` when the
	 * memoized adapter is about to be replaced (config change) or when
	 * the dispatcher itself is disposed. Implementations that hold
	 * pooled connections (SMTP transporter) MUST implement this.
	 */
	close?(): void;
}
