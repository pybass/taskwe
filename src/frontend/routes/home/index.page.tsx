import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { api } from "@/api/index.ts";
import { TabCount, TabLink } from "@/components/TabLink.tsx";
import { Activity } from "./-local/Activity.tsx";
import { MyTasks } from "./-local/MyTasks.tsx";
import { Notifications } from "./-local/Notifications.tsx";
// The tab bar is written here as a `tab-bar` class.
import "@/components/tab-link.css";

export const Route = createFileRoute("/_auth/")({
	validateSearch: z.object({ tab: z.enum(["notifications", "tasks", "activity"]).default("tasks") }),
	// The default stays out of the URL: / is the My tasks tab.
	search: { middlewares: [stripSearchParams({ tab: "tasks" })] },
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		await context.load(api.queries.countUnreadTasks());
		if (deps.tab === "notifications") {
			await Promise.all([context.load(api.queries.listUnreadNotifications()), context.load(api.queries.getPushConfig())]);
		}
		if (deps.tab === "tasks") await context.load(api.queries.listMyTasks());
		if (deps.tab === "activity") await context.load(api.queries.listActivity());
	},
	component: HomePage,
});

/**
 * Three tabs: My tasks, the user's open tasks across their spaces; Notifications, the user's unread; Activity, what
 * changed lately in the user's spaces.
 */
function HomePage() {
	const { tab } = Route.useSearch();
	const mine = useSuspenseQuery(api.queries.listTaskCounts()).data.reduce((sum, entry) => sum + entry.mine, 0);
	const unread = useSuspenseQuery(api.queries.countUnreadTasks()).data.tasks;
	return (
		<>
			<div className="list-toolbar">
				<nav className="tab-bar">
					<TabLink to="/" search={{ tab: "tasks" }} current={tab === "tasks"}>
						My tasks
						<TabCount>{mine}</TabCount>
					</TabLink>
					<TabLink to="/" search={{ tab: "notifications" }} current={tab === "notifications"}>
						Notifications
						<TabCount>{unread}</TabCount>
					</TabLink>
					<TabLink to="/" search={{ tab: "activity" }} current={tab === "activity"}>
						Activity
					</TabLink>
				</nav>
			</div>
			{tab === "tasks" && <MyTasks />}
			{tab === "notifications" && <Notifications />}
			{tab === "activity" && <Activity />}
		</>
	);
}
