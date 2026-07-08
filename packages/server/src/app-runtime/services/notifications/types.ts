/** Severity drives push priority + digest/queue routing. */
export type NotificationSeverity = "blocking" | "cost_breach" | "digest";

/** Channel id mirrors the configured adapter `name`. */
export type NotificationChannel = "console" | "ntfy" | "smtp";

export interface Recipient {
	/**
	 * Adapter-specific identifier.
	 *  - SMTP: email address
	 *  - ntfy: topic slug
	 *  - console: any stable string (defaults to "console")
	 */
	readonly channelId: string;
	/** Display name for logging/audit. Avoid using for routing. */
	readonly label?: string;
}

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

export type SendResult =
	| { readonly ok: true; readonly channel: NotificationChannel; readonly sentAt: string }
	| {
			readonly ok: false;
			readonly channel: NotificationChannel;
			readonly error: string;
			readonly retriable: boolean;
	  };

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

/** Classification output for an inbound domain event. */
export type Classification =
	| { readonly kind: "push"; readonly severity: NotificationSeverity }
	| { readonly kind: "digest"; readonly severity: "digest" }
	| { readonly kind: "drop"; readonly reason: string };

/** Queue row reason — why the row was persisted instead of delivered. */
export type QueueReason =
	| "silence"
	| "digest"
	| "flood_coalesce"
	| "retry"
	| "agent_health_transition";

/** Queue row status lifecycle. */
export type QueueStatus = "pending" | "sent" | "failed" | "dropped";
