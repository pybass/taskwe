import { PushDevice } from "#shared/push.ts";

/**
 * Whether this browser can receive push. False in an in-app browser, in Safari private mode, and in a Safari tab on
 * iOS, where push exists only in the app opened from the Home Screen.
 */
export function canPush(): boolean {
	return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * The subscription as the server takes it, or null after dropping one the server cannot post to: a subscription on
 * a push service outside `PUSH_SERVICE_HOSTS`, made before the list existed or by a browser the list lacks.
 */
async function acceptedDevice(subscription: PushSubscription): Promise<PushDevice | null> {
	const device = PushDevice.safeParse(subscription.toJSON());
	if (device.success) return device.data;
	await subscription.unsubscribe();
	return null;
}

/** The browser's current subscription for this site, or null. Call only when `canPush()`. */
export async function getPushSubscription(): Promise<PushDevice | null> {
	const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
	return subscription === null ? null : acceptedDevice(subscription);
}

/** The server's key as bytes: Safari's support for the base64url string on `subscribe` is unconfirmed. */
function decodeKey(vapidPublicKey: string): Uint8Array<ArrayBuffer> {
	const raw = atob(vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/"));
	// Not `Uint8Array.from`: its buffer type is not the plain ArrayBuffer that `subscribe` wants.
	return new Uint8Array(raw.length).map((_, i) => raw.charCodeAt(i));
}

/**
 * Subscribe at the browser's push service with the server's key; permission must be granted already. Rejects, with
 * the message to show, when that service is not one the server posts to; the subscription is dropped then.
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushDevice> {
	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: decodeKey(vapidPublicKey),
	});
	const device = await acceptedDevice(subscription);
	if (device === null) throw new Error("This browser's push service is not supported.");
	return device;
}

/** Drop the browser's subscription for this site; no subscription is a no-op. Permission stays granted. Call only when `canPush()`. */
export async function unsubscribeFromPush(): Promise<void> {
	const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
	if (subscription !== null) await subscription.unsubscribe();
}

/**
 * The browser's subscription, remade when it was not created with the server's current key: a push service rejects
 * a push signed with any other key, and the server's keys change with a restored or seeded database. Null when the
 * browser has no subscription. Call only when `canPush()`.
 */
export async function syncPushSubscription(vapidPublicKey: string): Promise<PushDevice | null> {
	const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
	if (subscription === null) return null;
	const madeWith = subscription.options.applicationServerKey;
	const expected = decodeKey(vapidPublicKey);
	const current =
		madeWith !== null &&
		madeWith.byteLength === expected.length &&
		new Uint8Array(madeWith).every((byte, i) => byte === expected[i]);
	if (current) return acceptedDevice(subscription);
	// Permission is granted, since a subscription existed, so no user gesture is needed.
	await subscription.unsubscribe();
	return subscribeToPush(vapidPublicKey);
}
