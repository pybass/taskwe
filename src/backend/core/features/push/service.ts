import { generateKeyPairSync } from "node:crypto";
import webpush from "web-push";
import { z } from "zod";
import type { TaskChanges } from "#shared/event.ts";
import type { PushPayload } from "#shared/push.ts";
import type { Core } from "../../core.ts";

/** The body of a push, after the actor's name; the writes that notify nobody get the last line and never reach here. */
function describe(changes: TaskChanges): string {
	switch (changes.action) {
		case "created":
			return "created the task";
		case "moved":
			return `moved the task to ${changes.space.to.name}`;
		case "updated":
			if (changes.commentAdded !== undefined) {
				// An excerpt: a push service refuses a payload over 4 KB, and a comment may hold 10,000 characters.
				const body = changes.commentAdded.body;
				return `commented: ${body.length > 100 ? `${body.slice(0, 100)}…` : body}`;
			}
			if (changes.closedAt !== undefined) return changes.closedAt.to === null ? "reopened the task" : "closed the task";
			if (changes.repeatDoneRecorded === true) return "marked the task done";
			return "updated the task";
		default:
			return "changed the task";
	}
}

/** Owner of the `settings` keys `vapid_public_key` and `vapid_private_key`, and the one caller of the push services. The rules are in push.ts. */
export class PushService {
	constructor(private readonly core: Core) {}

	/**
	 * The server's VAPID key pair, base64url as Web Push wants them: the raw 65-byte public point and the 32-byte
	 * private scalar. Generated on the first call and kept in `settings`: a subscription is bound to the public key it
	 * was made with, so the pair lives as long as the database, backups included.
	 */
	getVapidKeys(): { publicKey: string; privateKey: string } {
		const stored = z
			.array(z.object({ key: z.string(), value: z.string() }))
			.parse(this.core.db.query("SELECT key, value FROM settings WHERE key IN ('vapid_public_key', 'vapid_private_key')").all());
		const publicKey = stored.find((row) => row.key === "vapid_public_key")?.value;
		const privateKey = stored.find((row) => row.key === "vapid_private_key")?.value;
		if (publicKey !== undefined && privateKey !== undefined) return { publicKey, privateKey };
		// P-256 is the one curve Web Push allows. The JWK export gives the point as x and y and the scalar as d.
		const jwk = z
			.object({ x: z.base64url(), y: z.base64url(), d: z.base64url() })
			.parse(generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ format: "jwk" }));
		const keys = {
			publicKey: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString(
				"base64url",
			),
			privateKey: jwk.d,
		};
		this.core.db.transaction(() => {
			const insert = this.core.db.query("INSERT INTO settings (key, value) VALUES ($key, $value)");
			insert.run({ key: "vapid_public_key", value: keys.publicKey });
			insert.run({ key: "vapid_private_key", value: keys.privateKey });
		})();
		return keys;
	}

	/**
	 * Send the write of `changes` on task `taskId` by `actorId` to every subscribed device of each of `userIds`, the
	 * users the write notified. Call after the transaction committed, without awaiting: the task row and the unread
	 * rows are read at once, and the sends run on their own. Never rejects: a failed push is logged, since the write
	 * is done and nobody waits for the push, and a 404 or 410 forgets the subscription.
	 */
	async sendTaskPush(actorId: number, taskId: number, changes: TaskChanges, userIds: number[]): Promise<void> {
		if (userIds.length === 0) return;
		const title = `#${taskId} ${this.core.services.task.getTask(taskId).title}`;
		const body = `${this.core.services.user.getUser(actorId).username} ${describe(changes)}`;
		const vapidDetails = { subject: this.core.siteUrl, ...this.getVapidKeys() };
		const sends = userIds.flatMap((userId) => {
			const subscriptions = this.core.services.session.listPushSubscriptions(userId);
			if (subscriptions.length === 0) return [];
			const user = this.core.services.user.getUser(userId);
			const spaces = this.core.services.space.listReadableSpaces(user);
			const unread = this.core.services.notification.countUnreadTasks(userId, spaces);
			const payload: PushPayload = { taskId, title, body, unread };
			return subscriptions.map((subscription) => ({ subscription, payload: JSON.stringify(payload) }));
		});
		for (const { subscription, payload } of sends) {
			try {
				// TTL in seconds: a phone off the network for a day still gets it; the badge it sets is corrected on open.
				// The timeout is the socket's, in ms: a push service that stops answering does not hold the send for good.
				await webpush.sendNotification(subscription, payload, {
					vapidDetails,
					TTL: 24 * 60 * 60,
					urgency: "high",
					timeout: 10_000,
				});
				console.log(`Push sent to ${new URL(subscription.endpoint).host} for task ${taskId}`);
			} catch (error) {
				// The endpoint is a secret, and a WebPushError carries it, so the error is never logged whole.
				const host = new URL(subscription.endpoint).host;
				if (error instanceof webpush.WebPushError) {
					console.error(`Push to ${host} failed: ${error.statusCode} ${error.body}`);
					// 404 and 410: the browser dropped the subscription. 403: it was made with another server key, so no
					// push will ever reach it; the app subscribes again on its next open and sends the new one.
					if ([403, 404, 410].includes(error.statusCode)) {
						this.core.services.session.clearPushSubscription(subscription.endpoint);
					}
				} else {
					console.error(`Push to ${host} failed`, error);
				}
			}
		}
	}
}
