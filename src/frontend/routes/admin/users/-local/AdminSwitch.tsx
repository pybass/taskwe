import { Switch } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { User } from "#shared/user.ts";
import { api } from "@/api/index.ts";

/** Sets the flag on change. The server's answer, not the switch, is the state: a refused change leaves it as it was. */
export function AdminSwitch({ user }: { user: User }) {
	const currentUser = api.cache.useCurrentUser();
	const setMutation = api.mutations.useSetAdmin(user.id);
	return (
		<Switch
			checked={user.admin}
			// Own row: an admin cannot clear their own flag, and setting it would be a no-op.
			disabled={user.id === currentUser.id || setMutation.isPending}
			onChange={(event) =>
				setMutation.mutate(event.currentTarget.checked, {
					onError: (error) => notifications.show({ message: error.message, color: "red" }),
				})
			}
		/>
	);
}
