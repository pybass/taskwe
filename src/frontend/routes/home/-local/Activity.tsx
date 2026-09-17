import { useSuspenseQuery } from "@tanstack/react-query";
import { api } from "@/api/index.ts";
import { ActivityList } from "./ActivityList.tsx";

/** The Activity tab: what changed lately in the user's spaces. */
export function Activity() {
	return <ActivityList entries={useSuspenseQuery(api.queries.listActivity()).data} empty="Nothing yet." />;
}
