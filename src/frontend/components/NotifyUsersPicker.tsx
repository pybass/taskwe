import { ActionIcon, Button, Checkbox, Popover, Stack } from "@mantine/core";
import { IconBell } from "@tabler/icons-react";
import type { Space } from "#shared/space.ts";
import { api } from "@/api/index.ts";
import "./notify-users-picker.css";

type Props = {
	space: Space;
	value: number[];
	onChange: (userIds: number[]) => void;
};

/**
 * Who gets a notification of the write, as one subtle control for the form's button row: a bell while nobody is
 * ticked, else the bell with the ticked names, cut with an ellipsis when the row is short, so the sender sees them next
 * to the submit button. It opens a popover with a checkbox per member of the space but the current user, in the order
 * of the user list. Renders nothing when there is nobody to tell, so in a personal space. The form ticks a new
 * assignee; the user unticks or adds, rarely. `value` holds members other than the current user: the form keeps it so.
 */
export function NotifyUsersPicker({ space, value, onChange }: Props) {
	const currentUser = api.cache.useCurrentUser();
	const users = api.cache
		.useUsers()
		.filter((user) => user.id !== currentUser.id && space.members.some((member) => member.userId === user.id));
	if (users.length === 0) return null;
	const picked = users.filter((user) => value.includes(user.id));
	return (
		<Popover position="top-start" shadow="md">
			<Popover.Target>
				{picked.length === 0 ? (
					<ActionIcon variant="subtle" color="gray" size="input-sm">
						<IconBell size={16} />
					</ActionIcon>
				) : (
					<Button variant="subtle" color="gray" leftSection={<IconBell size={16} />} className="notify-users-picker">
						<span className="notify-users-picker-names">{picked.map((user) => user.username).join(", ")}</span>
					</Button>
				)}
			</Popover.Target>
			<Popover.Dropdown>
				<Checkbox.Group value={value.map(String)} onChange={(userIds) => onChange(userIds.map(Number))}>
					<Stack gap="xs">
						{users.map((user) => (
							<Checkbox key={user.id} size="sm" value={String(user.id)} label={user.username} />
						))}
					</Stack>
				</Checkbox.Group>
			</Popover.Dropdown>
		</Popover>
	);
}
