import { Button, Group } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useSuspenseQuery } from "@tanstack/react-query";
import { api } from "@/api/index.ts";
import { ActivityList } from "./ActivityList.tsx";
import { PushSwitch } from "./PushSwitch.tsx";

/** The Notifications tab: what others chose to tell the user, unread, in the activity list's shape, under a toolbar of the push switch and "Mark all read". */
export function Notifications() {
	const entries = useSuspenseQuery(api.queries.listUnreadNotifications()).data;
	const markAllMutation = api.mutations.useMarkAllNotificationsRead();
	return (
		<>
			<Group mb="md">
				<PushSwitch />
				{entries.length > 0 && (
					<Button
						variant="default"
						size="xs"
						ml="auto"
						loading={markAllMutation.isPending}
						onClick={() =>
							modals.openConfirmModal({
								title: "Mark all read",
								children: "Clear all unread notifications? They do not come back.",
								labels: { confirm: "Mark all read", cancel: "Cancel" },
								onConfirm: () => markAllMutation.mutate(),
							})
						}
					>
						Mark all read
					</Button>
				)}
			</Group>
			<ActivityList entries={entries} empty="Nothing unread." />
		</>
	);
}
