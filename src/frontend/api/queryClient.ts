import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { persistQueryClient, removeOldestQuery } from "@tanstack/query-persist-client-core";
import { type DefaultError, QueryClient, type QueryExecuteOptions, type QueryKey } from "@tanstack/react-query";

const WEEK = 7 * 24 * 60 * 60 * 1000;

// No retries: a 4xx is final, and the API is on the same host, so a failed request is not a passing network glitch.
// `networkMode: "always"`: without a network a request fails at once with a NetworkError instead of waiting for the
// browser to report one, so a page with nothing cached shows the error and a write does not hang on its button.
// `gcTime`: an unobserved query lives a week, so what one open of the app loaded is still in the persisted copy at
// the next.
export const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false, networkMode: "always", gcTime: WEEK }, mutations: { networkMode: "always" } },
});

/**
 * Keeps a copy of the cache in localStorage, so the app opens with what it showed last, with no network too.
 * Resolves once the last copy is back in the cache; the app renders after it, so the loaders find it. The copy is
 * dropped after a week, and on a new build: `import.meta.url` is this bundle's hashed URL, and restored data skips
 * the schemas, so a copy from another build could carry shapes the code no longer reads. Past localStorage's quota,
 * the oldest queries are left out of the copy until it fits.
 */
export const cacheRestored = persistQueryClient({
	queryClient,
	persister: createAsyncStoragePersister({ storage: localStorage, key: "taskwe-cache", retry: removeOldestQuery }),
	maxAge: WEEK,
	buster: import.meta.url,
})[1];

/**
 * A route loader's read: the cached data when there is any, however old, else a fetch. The page's own
 * `useSuspenseQuery` of the same options refetches it on mount, so a page opens at once with what its last visit
 * showed and refreshes behind, and opens on the cache alone without a network.
 */
export function load<TQueryFnData, TError = DefaultError, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(
	options: QueryExecuteOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>,
): Promise<TData> {
	return queryClient.query({ ...options, staleTime: "static" });
}

/** Forgets every record but the current user, and so the persisted copy: nothing of a session stays on the device after it. */
export function forgetSession(): void {
	queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "currentUser" });
}
