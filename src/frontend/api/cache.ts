import { useSuspenseQuery } from "@tanstack/react-query";
import { notFound, rootRouteId } from "@tanstack/react-router";
import { type Label, resolveSpaceLabels } from "#shared/label.ts";
import type { Space } from "#shared/space.ts";
import type { User } from "#shared/user.ts";
import { currentUser, listLabels, listSpaces, listUsers } from "./queries.ts";

// Only what the auth route's loader put in the cache, so any page under it reads these without a request.
// A page reads its own route's data with useSuspenseQuery(api.queries.x()), the call its loader prefetched.

/** Null after a logout or an ended session, until AuthLayout navigates to /login; it renders nothing then. */
export function useOptionalCurrentUser(): User | null {
	return useSuspenseQuery(currentUser()).data;
}

/** For pages under the auth route. The layout guard above makes the throw unreachable. */
export function useCurrentUser(): User {
	const user = useOptionalCurrentUser();
	if (user === null) throw new Error("No current user");
	return user;
}

export function useUsers(): User[] {
	return useSuspenseQuery(listUsers()).data;
}

export function useSpaces(): Space[] {
	return useSuspenseQuery(listSpaces()).data;
}

/** The space from the cached list; a slug outside it shows the not-found page. */
export function useSpace(slug: string): Space {
	const space = useSpaces().find((space) => space.slug === slug);
	// A not-found thrown while rendering reaches only the route it names, and only the root has a not-found page.
	if (space === undefined) throw notFound({ routeId: rootRouteId });
	return space;
}

/** The space of a task the API let the user read, so the id is in the cached list; anything else is a bug and shows not found. */
export function useSpaceById(spaceId: number): Space {
	const space = useSpaces().find((space) => space.id === spaceId);
	if (space === undefined) throw notFound({ routeId: rootRouteId });
	return space;
}

/** Every label the user may see, the rows before shadowing; pages read a list through the two hooks below. */
function useLabels(): Label[] {
	return useSuspenseQuery(listLabels()).data;
}

/** The global list in its order. */
export function useGlobalLabels(): Label[] {
	return resolveSpaceLabels(useLabels(), null);
}

/** The list of the space, what a task there may carry, in display order: its own and the globals it does not shadow. */
export function useSpaceLabels(space: Space): Label[] {
	return resolveSpaceLabels(useLabels(), space.id);
}
