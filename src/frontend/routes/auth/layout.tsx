import { Alert, Box, Center, Container, Flex, Loader } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconWifiOff } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { api, useOffline } from "../../api/index.ts";
import { canPush, syncPushSubscription } from "../../utils/push.ts";
import { Footer } from "./-local/Footer.tsx";
import { Header } from "./-local/Header.tsx";

/** Parent of every page that needs a user. A visitor without a session goes to /login and comes back after. */
export const Route = createFileRoute("/_auth")({
	beforeLoad: async ({ context, location }) => {
		const currentUser = await context.queryClient.query(api.queries.currentUser());
		if (currentUser === null) throw redirect({ to: "/login", search: { redirect: location.href } });
		return { currentUser };
	},
	// Every page lists spaces, shows a login for a user id, or shows label badges, and the header's switcher shows the
	// task counts, so all four load here, once for every page.
	loader: async ({ context }) => {
		await Promise.all([
			context.load(api.queries.listSpaces()),
			context.load(api.queries.listUsers()),
			context.load(api.queries.listLabels()),
			context.load(api.queries.listTaskCounts()),
		]);
	},
	pendingComponent: () => (
		<Center h="100vh">
			<Loader />
		</Center>
	),
	component: AuthLayout,
});

function AuthLayout() {
	const currentUser = api.cache.useOptionalCurrentUser();
	const offline = useOffline();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const href = useLocation({ select: (location) => location.href });
	// The user query never goes stale, so this is the one call of /api/me per open of the app: it renews the cookie and
	// shows a rename or an admin flag change. Offline it fails and the cached user stays. A user restored from the
	// persisted copy is older than this page load; one beforeLoad just fetched is not, and is not fetched again.
	useEffect(() => {
		const state = queryClient.getQueryState(["currentUser"]);
		if (state !== undefined && state.dataUpdatedAt < performance.timeOrigin) {
			queryClient.refetchQueries({ queryKey: ["currentUser"] });
		}
	}, [queryClient]);
	// Null after a logout, or when the refetch found the session ended; the login page brings the user back here.
	useEffect(() => {
		if (currentUser === null) navigate({ to: "/login", search: { redirect: href } });
	}, [currentUser, navigate, href]);
	// The installed app's icon shows the Notifications tab's number. The query is stale at once and refetches when the
	// app comes to the foreground, and every task write and read invalidates it, so the badge follows the tab.
	// `setAppBadge` is typed as always present, but Firefox lacks it, and Android Chrome accepts the call and ignores it:
	// there the launcher counts the notifications in the tray instead.
	const unread = useQuery({ ...api.queries.countUnreadTasks(), enabled: currentUser !== null }).data?.tasks;
	useEffect(() => {
		if (unread !== undefined) navigator.setAppBadge?.(unread);
	}, [unread]);
	// The layout goes on logout and on an ended session; a badge left behind would name the last user's count.
	useEffect(
		() => () => {
			navigator.clearAppBadge?.();
		},
		[],
	);
	// A login makes a new session with no subscription, so the browser's, when it has one, is sent again on every load,
	// remade first when the server's key changed.
	const pushConfig = useQuery({ ...api.queries.getPushConfig(), enabled: currentUser !== null && canPush() }).data;
	const { mutate: sendPushSubscription } = api.mutations.useSetPushSubscription();
	useEffect(() => {
		if (pushConfig === undefined) return;
		syncPushSubscription(pushConfig.vapidPublicKey).then(
			(device) => {
				if (device !== null) sendPushSubscription(device);
			},
			// The remake failed after the old subscription was dropped: the device gets no push until the user turns it
			// on again, so say so instead of leaving the switch off in silence.
			(error: unknown) => {
				console.error("Push subscription lost", error);
				notifications.show({
					message: "Push to this device stopped working. Turn it on again on the Notifications tab.",
					color: "red",
				});
			},
		);
	}, [pushConfig, sendPushSubscription]);
	// Null only for the moment before the navigation above; pages never see it.
	if (currentUser === null) return null;
	return (
		<Container size="md">
			{/* Below `sm` room under the footer for the floating New task button, 56px: at the end of the page it covers
			    none of the content, and only the empty right end of the footer's short line. */}
			<Flex direction="column" mih="100vh" pb={{ base: "3.5rem", sm: 0 }}>
				<Header user={currentUser} />
				{offline && (
					<Alert color="yellow" icon={<IconWifiOff size={18} />} py="xs" mt="md">
						No connection. The pages show what they loaded last; a change cannot be saved.
					</Alert>
				)}
				<Box component="main" flex={1} py="md">
					<Outlet />
				</Box>
				<Footer />
			</Flex>
		</Container>
	);
}
