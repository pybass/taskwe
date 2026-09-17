import { Badge, Button, Group, NumberInput, Paper, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { hasSpaceRole, type Space } from "#shared/space.ts";
import type { Task } from "#shared/task.ts";
import { api } from "@/api/index.ts";
import { CustomLink } from "@/components/CustomLink.tsx";
import { DeleteButton } from "@/components/DeleteButton.tsx";
import { ErrorMessage } from "@/components/ErrorMessage.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
import { SpaceName } from "@/components/SpaceName.tsx";
import { Username } from "@/components/Username.tsx";
import { formatFullDate } from "@/utils/format.ts";

export const Route = createFileRoute("/_auth/_admin/admin/tasks/delete")({ component: DeleteTaskPage });

/** The task is fetched once, not watched: after the delete the panel clears and nothing refetches a task that is gone. */
function DeleteTaskPage() {
	const spaces = useSuspenseQuery(api.queries.listAllSpaces()).data;
	const [taskId, setTaskId] = useState<string | number>("");
	const lookup = api.mutations.useFindTaskAsAdmin();
	const found = lookup.data;
	const space = found === undefined ? undefined : spaces.find((space) => space.id === found.spaceId);
	return (
		<>
			<PageHeader title="Delete task" />
			<Stack>
				<Paper withBorder p="md">
					<form
						onSubmit={(event) => {
							event.preventDefault();
							if (typeof taskId === "number") lookup.mutate(taskId);
						}}
					>
						<Stack>
							<NumberInput label="Task number" min={1} allowDecimal={false} value={taskId} onChange={setTaskId} />
							<ErrorMessage error={lookup.error} />
							<Group justify="flex-end">
								<Button type="submit" variant="default" disabled={typeof taskId !== "number"} loading={lookup.isPending}>
									Find task
								</Button>
							</Group>
						</Stack>
					</form>
				</Paper>
				{found !== undefined &&
					(space === undefined ? (
						<Text c="red">The task's space is gone. Find the task again.</Text>
					) : (
						<FoundTask task={found} space={space} onDeleted={lookup.reset} />
					))}
			</Stack>
		</>
	);
}

/** Its own component so the delete hook binds to the found task. The task page is linked only where the admin may open it. */
function FoundTask({ task, space, onDeleted }: { task: Task; space: Space; onDeleted: () => void }) {
	const deleteMutation = api.mutations.useDeleteTask(task);
	const member = hasSpaceRole(api.cache.useCurrentUser(), space, "viewer");
	return (
		<Paper withBorder p="md">
			<Stack gap="sm">
				<Text fw={600} fz="lg">
					{task.title}
				</Text>
				<Group gap="sm">
					<Badge variant="light" color={task.closedAt === null ? "green" : "gray"} size="md" radius="sm" tt="none" fw={500}>
						{task.closedAt === null ? "Open" : "Closed"}
					</Badge>
					<Text size="sm">
						{member ? (
							<CustomLink to="/t/$taskId" params={{ taskId: task.id }} underline="hover" c="pine">
								#{task.id} in <SpaceName space={space} />
							</CustomLink>
						) : (
							<>
								#{task.id} in <SpaceName space={space} />
							</>
						)}
					</Text>
				</Group>
				<Text size="sm" c="dimmed">
					Opened by <Username userId={task.authorId} /> on {formatFullDate(task.createdAt)}. Comments: {task.commentCount}.
				</Text>
				<Group justify="flex-end">
					<DeleteButton
						label="Delete task"
						title="Delete task"
						message={`Delete task #${task.id} "${task.title}" from ${space.name} with its comments?`}
						onConfirm={() =>
							deleteMutation.mutate(undefined, {
								onSuccess: () => {
									notifications.show({ message: "Task deleted", color: "green" });
									onDeleted();
								},
								onError: (error) => notifications.show({ message: error.message, color: "red" }),
							})
						}
					/>
				</Group>
			</Stack>
		</Paper>
	);
}
