import { ActionIcon, Group, Popover, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle } from "@tabler/icons-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/api/index.ts";
import { canPush, getPushSubscription } from "@/utils/push.ts";

/**
 * Whether this browser gets the notifications as pushes, as a switch, with the device's push facts behind an info
 * icon. Nothing where the browser cannot push at all: on iOS that is every browser but the app opened from the Home
 * Screen. A blocked permission shows as a toast when the switch is flipped, since only the browser's settings undo it.
 */
export function PushSwitch() {
	const supported = canPush();
	// Null while the browser is still asked.
	const [subscribed, setSubscribed] = useState<boolean | null>(null);
	useEffect(() => {
		if (supported) getPushSubscription().then((subscription) => setSubscribed(subscription !== null));
	}, [supported]);
	const { vapidPublicKey } = useSuspenseQuery(api.queries.getPushConfig()).data;
	const toggleMutation = api.mutations.useSetPushEnabled(vapidPublicKey);
	if (!supported) return null;
	const yesNo = (value: boolean) => (value ? "yes" : "no");
	return (
		<Group gap={4} wrap="nowrap">
			<Switch
				size="sm"
				label="Push to this device"
				labelPosition="left"
				checked={subscribed === true}
				disabled={subscribed === null || toggleMutation.isPending}
				onChange={(event) => {
					const on = event.currentTarget.checked;
					toggleMutation.mutate(on, {
						onSuccess: () => setSubscribed(on),
						onError: (error) => notifications.show({ message: error.message, color: "red" }),
					});
				}}
			/>
			<Popover position="bottom-end" shadow="md">
				<Popover.Target>
					<ActionIcon variant="subtle" color="gray" size="sm">
						<IconInfoCircle size={14} />
					</ActionIcon>
				</Popover.Target>
				<Popover.Dropdown p="xs">
					<Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
						installed: {yesNo(matchMedia("(display-mode: standalone)").matches)}
						<br />
						permission: {Notification.permission}
						<br />
						push: {subscribed === null ? "?" : yesNo(subscribed)}
						<br />
						badge: {yesNo("setAppBadge" in navigator)}
					</Text>
				</Popover.Dropdown>
			</Popover>
		</Group>
	);
}
