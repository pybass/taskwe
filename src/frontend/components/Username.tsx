import { Text } from "@mantine/core";
import { IconUser, IconUserFilled } from "@tabler/icons-react";
import { api } from "@/api/index.ts";
import "./username.css";

/**
 * A small user icon, then the username from the cached users in medium weight. The mark is plain inline text that
 * never wraps inside, so a comma after it stays on its line and a parent can ellipsize it; the icon sits on the
 * text's center and scales with it. The icon is a dimmed outline, or with `assignee` a filled one in the primary
 * color: the person who holds the task. In a sentence the filled mark is whoever holds it after the change:
 * "reassigned it from alice to bob" marks bob only. A `null` id is the dimmed outline with "Unassigned": the state
 * of a task nobody holds, shown where a name would be.
 */
export function Username({ userId, assignee = false }: { userId: number | null; assignee?: boolean }) {
	const username = api.cache.useUsers().find((user) => user.id === userId)?.username ?? "";
	return (
		<Text
			span
			inherit
			fw={userId === null ? undefined : 500}
			c={userId === null ? "dimmed" : undefined}
			style={{ whiteSpace: "nowrap" }}
		>
			{assignee && userId !== null ? (
				<IconUserFilled size="1.1em" className="username-icon" data-assignee="" />
			) : (
				<IconUser size="1.1em" stroke={2} className="username-icon" />
			)}
			{userId === null ? "Unassigned" : username}
		</Text>
	);
}
