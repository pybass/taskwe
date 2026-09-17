// Reference file: Web Push on one device: the server's key the browser subscribes with, and the subscription it sends back.

import { z } from "zod";
import { Id } from "#shared/base.ts";

// A push is a second way to deliver an unread notification, notification.ts: the phone shows it while the app is
// closed. The browser subscribes at its vendor's push service with the server's public key and gets an endpoint
// URL plus two keys; the server posts an encrypted payload to that URL. A browser holds at most one subscription
// per site, and a session is one browser, so the subscription lives on the session: it ends with the session, on
// logout, a password change, or expiry, or earlier when the user turns push off on the device. Nothing else is
// stored. A subscription is bound to the server's public key it was made with, and a restored or seeded database
// brings other keys: the app compares the two on every load and subscribes again when they differ, so a phone
// recovers on its next open.
//
// After a write that records notifications, the server sends one push per subscribed device of each user named,
// after the transaction and without waiting for the push services: a failed push is logged, and a push service
// that answers 403, 404, or 410 will never deliver to that subscription, which is then forgotten. A push may be delivered a day late
// or never; the unread rows stay the truth, and the app sets the badge from them on every open.

/** The server's VAPID public key, base64url, for `pushManager.subscribe`. One key for the life of the database. */
export const PushConfig = z.object({ vapidPublicKey: z.base64url() });
export type PushConfig = z.infer<typeof PushConfig>;

/**
 * The hosts of the browsers' push services: Chrome and the other Chromium browsers, Safari, Firefox, Edge, and
 * Samsung Internet. The server posts only to these, so a subscription cannot point it at another server; a browser
 * with another push service cannot subscribe until its host is added here.
 */
export const PUSH_SERVICE_HOSTS =
	/^(fcm\.googleapis\.com|android\.googleapis\.com|[a-z0-9-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.samsungosp\.com)$/;

/**
 * A device's push address, as the browser's `PushSubscription.toJSON()` gives it: the endpoint is the push service's
 * URL, secret, since anyone who has it can send to the device, and `https:` on a host of `PUSH_SERVICE_HOSTS`, since
 * the server posts to it; the keys are what the server encrypts with.
 */
export const PushDevice = z.object({
	endpoint: z.url({ protocol: /^https$/, hostname: PUSH_SERVICE_HOSTS }),
	keys: z.object({ p256dh: z.base64url(), auth: z.base64url() }),
});
export type PushDevice = z.infer<typeof PushDevice>;

/**
 * What a push carries, built by the server and read by the service worker, sw.js: the notification to show, its
 * title "#42 Clean the pool" and its body "alice commented: ...", with the first 100 characters of a comment, since a
 * push service takes 4 KB at most, and the badge to set, the recipient's unread task count at the time of the write.
 * The worker keeps one notification per task, so a newer push replaces the shown one.
 */
export const PushPayload = z.object({ taskId: Id, title: z.string(), body: z.string(), unread: z.int() });
export type PushPayload = z.infer<typeof PushPayload>;
