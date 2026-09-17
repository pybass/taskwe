// The service worker: the browser keeps it registered after the page is gone and starts it for an event. Plain JS
// served as is at /sw.js, so that its scope is the whole site. It keeps the shell, the page with its bundle files
// and the fonts, in the browser's cache, so the app opens without a network; the data is TanStack Query's, kept in
// localStorage by queryClient.ts, so /api/* is never cached here.

// Bump a name to drop its cache on the next activation.
const SHELL = "shell-v1";
const FONTS = "fonts-v1";

// The shell is fetched here on install, since the page that registered the worker loaded its files before the
// worker could see them. A new version takes over at once, instead of waiting for every tab of the old one to close.
self.addEventListener("install", (event) => event.waitUntil(precache().then(() => self.skipWaiting())));
// Take control of the pages already open, not only of the ones loaded after this activation.
self.addEventListener("activate", (event) => event.waitUntil(cleanCaches().then(() => self.clients.claim())));

async function precache() {
	const cache = await caches.open(SHELL);
	const page = await fetch("/");
	// An error page kept as the shell would be what the app shows offline; a failed install is retried later.
	if (!page.ok) throw new Error(`Shell fetch failed: ${page.status}`);
	await cache.addAll(bundleFiles(await page.clone().text()));
	await cache.put("/", page);
}

async function cleanCaches() {
	for (const name of await caches.keys()) if (name !== SHELL && name !== FONTS) await caches.delete(name);
}

/** The bundle files the page names, `/chunk-e6417d79.js` and the like; a URL to another host does not start with `/`. */
function bundleFiles(html) {
	return [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((match) => match[1]);
}

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin === location.origin) {
		if (url.pathname.startsWith("/api/")) return;
		// Every path is the same page, kept under one key. The bundle files carry a content hash in their name, so a
		// cached one is right for good; the icons and the like do not, so they are asked for first.
		if (request.mode === "navigate") event.respondWith(networkFirst(SHELL, request, "/"));
		else if (/-[a-z0-9]{8}\.\w+$/.test(url.pathname)) event.respondWith(cacheFirst(SHELL, request));
		else event.respondWith(networkFirst(SHELL, request, request));
	} else if (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com")) {
		event.respondWith(cacheFirst(FONTS, request));
	}
});

/**
 * The answer from the server, cached under `key` and dropping the bundle files a fresh page no longer names; the
 * cached one when the server cannot be reached or fails.
 */
async function networkFirst(name, request, key) {
	const cache = await caches.open(name);
	try {
		const response = await fetch(request);
		if (response.ok) {
			await cache.put(key, response.clone());
			if (key === "/") await prune(cache, await response.clone().text());
			return response;
		}
		return (await cache.match(key)) ?? response;
	} catch (error) {
		const hit = await cache.match(key);
		if (hit === undefined) throw error;
		return hit;
	}
}

async function prune(cache, html) {
	const named = new Set(bundleFiles(html));
	for (const request of await cache.keys()) {
		const path = new URL(request.url).pathname;
		if (/-[a-z0-9]{8}\.\w+$/.test(path) && !named.has(path)) await cache.delete(request);
	}
}

/**
 * The cached answer, else the server's, kept when it is one. A font stylesheet is fetched without CORS, so its answer
 * is opaque and kept as such.
 */
async function cacheFirst(name, request) {
	const cache = await caches.open(name);
	const hit = await cache.match(request);
	if (hit !== undefined) return hit;
	const response = await fetch(request);
	if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
	return response;
}

// The payload is `PushPayload` in src/shared/push.ts. The worker is stopped after the handler's promise settles, so
// everything goes through waitUntil.
self.addEventListener("push", (event) => {
	const { taskId, title, body, unread } = event.data.json();
	event.waitUntil(showPush(taskId, title, body, unread));
});

async function showPush(taskId, title, body, unread) {
	// iOS drops the subscription when a push shows no notification. One notification per task: the tag makes a newer
	// push replace the shown one.
	await self.registration.showNotification(title, { body, icon: "/icon-192.png", tag: `task-${taskId}`, data: { taskId } });
	// Android Chrome accepts the call and ignores it: there the launcher counts the notifications in the tray instead.
	if (self.navigator.setAppBadge) await self.navigator.setAppBadge(unread);
	// An open page refetches what the write changed.
	for (const client of await self.clients.matchAll({ type: "window" })) client.postMessage({ taskId });
}

// A tap opens the task: in an open window of the app when there is one, else in a new one.
self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	event.waitUntil(openTask(event.notification.data.taskId));
});

async function openTask(taskId) {
	const [client] = await self.clients.matchAll({ type: "window" });
	if (client === undefined) {
		await self.clients.openWindow(`/t/${taskId}`);
	} else {
		await client.focus();
		client.postMessage({ taskId, open: true });
	}
}
