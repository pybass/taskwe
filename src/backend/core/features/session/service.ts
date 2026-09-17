import { z } from "zod";
import type { PushDevice } from "#shared/push.ts";
import type { User } from "#shared/user.ts";
import type { Core } from "../../core.ts";

export const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // a session lasts this long from its last use; the cookie's Max-Age
const DAY_MS = 24 * 60 * 60 * 1000;

/** Only the hash is stored, so a copy of the database gives away no live token. */
function hashToken(token: string): string {
	return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

/** Owner of the `sessions` table. A token is the cookie value; the table holds its hash. A session is never exposed. */
export class SessionService {
	constructor(private readonly core: Core) {}

	/** Start a session; null for a wrong username or password. Expired sessions of every user are deleted on the way. */
	login(username: string, password: string): { user: User; token: string } | null {
		const user = this.core.services.user.authenticate(username, password);
		if (user === null) return null;
		const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
		const now = Date.now();
		this.core.db.transaction(() => {
			this.core.db.query("DELETE FROM sessions WHERE expires_at <= $now").run({ now: new Date(now).toISOString() });
			this.core.db
				.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($hash, $userId, $expires)")
				.run({ hash: hashToken(token), userId: user.id, expires: new Date(now + SESSION_MS).toISOString() });
		})();
		return { user, token };
	}

	/** The user behind a live token, or null. Moves the expiry forward from now, at most once a day. */
	getUserByToken(token: string): User | null {
		const hash = hashToken(token);
		const row = this.core.db
			.query("SELECT user_id AS userId, expires_at AS expiresAt FROM sessions WHERE token_hash = $hash")
			.get({ hash });
		if (row === null) return null;
		const session = z.object({ userId: z.int(), expiresAt: z.iso.datetime() }).parse(row);
		const now = Date.now();
		const expiresAt = Date.parse(session.expiresAt);
		if (expiresAt <= now) return null;
		// The expiry is the last use plus SESSION_MS, so it also says how long ago the session was used.
		if (expiresAt - now < SESSION_MS - DAY_MS) {
			this.core.db
				.query("UPDATE sessions SET expires_at = $expires WHERE token_hash = $hash")
				.run({ expires: new Date(now + SESSION_MS).toISOString(), hash });
		}
		return this.core.services.user.getUser(session.userId);
	}

	/** End the session behind the token; an unknown token is a no-op. */
	logout(token: string): void {
		this.core.db.query("DELETE FROM sessions WHERE token_hash = $hash").run({ hash: hashToken(token) });
	}

	/**
	 * Bind the browser's push subscription to the session behind the token, over any earlier one, and take it off any
	 * other session: an endpoint is one browser, and a login there leaves the old session row behind with it. The
	 * caller checked the token is live.
	 */
	setPushSubscription(token: string, device: PushDevice): void {
		const hash = hashToken(token);
		this.core.db.transaction(() => {
			this.core.db
				.query(
					"UPDATE sessions SET push_endpoint = NULL, push_p256dh = NULL, push_auth = NULL WHERE push_endpoint = $endpoint AND token_hash <> $hash",
				)
				.run({ endpoint: device.endpoint, hash });
			this.core.db
				.query("UPDATE sessions SET push_endpoint = $endpoint, push_p256dh = $p256dh, push_auth = $auth WHERE token_hash = $hash")
				.run({ endpoint: device.endpoint, ...device.keys, hash });
		})();
	}

	/** Take the push subscription off the session behind the token; a session without one is a no-op. */
	removePushSubscription(token: string): void {
		this.core.db
			.query("UPDATE sessions SET push_endpoint = NULL, push_p256dh = NULL, push_auth = NULL WHERE token_hash = $hash")
			.run({ hash: hashToken(token) });
	}

	/** The subscriptions of the user's live sessions, one per device that enabled push. An expired row waits for a login to be deleted, so it is skipped here. */
	listPushSubscriptions(userId: number): PushDevice[] {
		return z
			.array(z.object({ endpoint: z.string(), p256dh: z.string(), auth: z.string() }))
			.parse(
				this.core.db
					.query(
						`SELECT push_endpoint AS endpoint, push_p256dh AS p256dh, push_auth AS auth FROM sessions
						WHERE user_id = $userId AND push_endpoint IS NOT NULL AND expires_at > $now`,
					)
					.all({ userId, now: new Date().toISOString() }),
			)
			.map(({ endpoint, p256dh, auth }) => ({ endpoint, keys: { p256dh, auth } }));
	}

	/** Forget the subscription behind `endpoint`: its push service said it is gone. The session stays. */
	clearPushSubscription(endpoint: string): void {
		this.core.db
			.query("UPDATE sessions SET push_endpoint = NULL, push_p256dh = NULL, push_auth = NULL WHERE push_endpoint = $endpoint")
			.run({ endpoint });
	}

	/** End the user's sessions except the one behind `keepToken`; call inside the caller's transaction. */
	deleteOtherSessions(userId: number, keepToken: string): void {
		this.core.db
			.query("DELETE FROM sessions WHERE user_id = $userId AND token_hash <> $keep")
			.run({ userId, keep: hashToken(keepToken) });
	}
}
