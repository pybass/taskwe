import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { load } from "../api/index.ts";
import { NotFoundPage } from "../components/NotFoundPage.tsx";

/** `load` is a loader's read of a query: the cache first, see `load` in api/queryClient.ts. */
export const Route = createRootRouteWithContext<{ queryClient: QueryClient; load: typeof load }>()({
	component: Outlet,
	notFoundComponent: NotFoundPage,
});
