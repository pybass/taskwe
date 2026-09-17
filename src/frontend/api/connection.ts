import { useSyncExternalStore } from "react";

// Whether the last request failed to reach the server. The HTTP client sets it, so any request that gets through,
// the refetch on reconnect included, clears it. The browser's offline event sets it too, since that one is never
// wrong; its online event only says a network is there, not that the server answers, so it is left to the requests.
let offline = false;
const listeners = new Set<() => void>();

export function setOffline(value: boolean): void {
	if (value === offline) return;
	offline = value;
	for (const listener of listeners) listener();
}

export function useOffline(): boolean {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => offline,
	);
}

window.addEventListener("offline", () => setOffline(true));
