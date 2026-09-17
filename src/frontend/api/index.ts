import * as cache from "./cache.ts";
import * as mutations from "./mutations.ts";
import * as queries from "./queries.ts";

/** The one import for pages, layouts, and the router: `api.queries.*` in loaders, `api.cache.*` and `api.mutations.*` in components. */
export const api = { queries, mutations, cache };

export { useOffline } from "./connection.ts";
export { ApiError } from "./httpClient.ts";
export { cacheRestored, forgetSession, load, queryClient } from "./queryClient.ts";
