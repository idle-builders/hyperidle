/**
 * Constant-time comparator for API keys.
 *
 * `crypto.timingSafeEqual` requires equal-length inputs and throws otherwise,
 * which is itself a length-leak via the throw vs return path. To handle the
 * different-length case safely we hash both inputs with SHA-256 first; the
 * digest is always 32 bytes so `timingSafeEqual` becomes total without
 * branching on input length.
 *
 * @lore I2 A1/A2: the previous comparison used `actual !== expected`, which
 * runs in time proportional to the matching prefix. The hash-and-compare is
 * the standard mitigation; we accept the cost of two SHA-256 calls per
 * authenticated request because key compares happen at the request boundary,
 * not inside hot loops.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export function constantTimeStringEqual(actual: string, expected: string): boolean {
	const a = createHash("sha256").update(actual).digest();
	const b = createHash("sha256").update(expected).digest();
	return timingSafeEqual(a, b);
}
