import { notifications } from "@mantine/notifications";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { hasSpaceRole } from "#shared/space.ts";
import { api } from "@/api/index.ts";
import { PageHeader } from "@/components/PageHeader.tsx";
import { TaskForm } from "./-local/TaskForm.tsx";

export const Route = createFileRoute("/_auth/t/new")({
	// `space` presets the form's space by slug; a space page's "New task" sends it. Any other value is ignored.
	validateSearch: z.object({ space: z.string().optional() }),
	component: NewTaskPage,
});

/** A new task in a space the user edits, picked in the form: the one in the URL, else the personal space. */
function NewTaskPage() {
	const { space: presetSlug } = Route.useSearch();
	const navigate = useNavigate();
	const user = api.cache.useCurrentUser();
	// The personal space first, then the shared ones by name; its slug is the username, and it is always the user's to edit.
	const personal = api.cache.useSpace(user.username);
	const spaces = api.cache
		.useSpaces()
		.filter((space) => hasSpaceRole(user, space, "editor"))
		.sort((a, b) => Number(b.id === personal.id) - Number(a.id === personal.id));
	const [spaceId, setSpaceId] = useState(() => (spaces.find((space) => space.slug === presetSlug) ?? personal).id);
	const space = spaces.find((space) => space.id === spaceId) ?? personal;
	const createMutation = api.mutations.useCreateTask(space.id);
	return (
		<>
			<PageHeader title="New task" />
			<TaskForm
				spaces={spaces}
				space={space}
				onSpaceChange={(next) => setSpaceId(next.id)}
				submitLabel="Create task"
				pending={createMutation.isPending}
				error={createMutation.error}
				onSubmit={(input) =>
					createMutation.mutate(input, {
						onSuccess: (task) => {
							notifications.show({ message: `Task #${task.id} created`, color: "green" });
							navigate({ to: "/t/$taskId", params: { taskId: task.id } });
						},
					})
				}
			/>
		</>
	);
}
