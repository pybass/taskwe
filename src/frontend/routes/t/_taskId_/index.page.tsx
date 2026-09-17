import { Grid, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCircleCheck } from "@tabler/icons-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { hasSpaceRole } from "#shared/space.ts";
import { api } from "@/api/index.ts";
import { Markdown } from "@/components/Markdown.tsx";
import { useActivityOrder } from "./-local/ActivityMenu.tsx";
import { ComposerFold } from "./-local/ComposerFold.tsx";
import { TaskActivity } from "./-local/TaskActivity.tsx";
import { TaskProperties } from "./-local/TaskProperties.tsx";
import { TaskUpdateForm } from "./-local/TaskUpdateForm.tsx";
import "./task-page.css";

export const Route = createFileRoute("/_auth/t/$taskId")({
	// `changes` shows the activity's events without a comment; the default keeps them hidden and stays out of the URL.
	validateSearch: z.object({ changes: z.boolean().default(false) }),
	search: { middlewares: [stripSearchParams({ changes: false })] },
	// `$taskId` is a positive integer in the params and links; anything else in the URL is not found.
	params: {
		parse: ({ taskId }) => {
			const result = z.coerce.number().int().positive().safeParse(taskId);
			if (!result.success) throw notFound();
			return { taskId: result.data };
		},
		stringify: ({ taskId }) => ({ taskId: String(taskId) }),
	},
	loader: ({ context, params }) =>
		Promise.all([context.load(api.queries.getTask(params.taskId)), context.load(api.queries.listTaskEvents(params.taskId))]),
	// A link from one task to another stays in this route, so the page with its form must get a new instance.
	remountDeps: ({ params }) => params,
	component: TaskPage,
});

function TaskPage() {
	const { taskId } = Route.useParams();
	const { changes } = Route.useSearch();
	const navigate = useNavigate();
	const task = useSuspenseQuery(api.queries.getTask(taskId)).data;
	const space = api.cache.useSpaceById(task.spaceId);
	const currentUser = api.cache.useCurrentUser();
	const events = useSuspenseQuery(api.queries.listTaskEvents(task.id)).data;
	const removeDoneMutation = api.mutations.useRemoveRepeatDone(task);
	const [order, setOrder] = useActivityOrder();
	// Showing the events reads them: the user's notifications on the task go, up to the newest event shown. Keyed on
	// that id, so an event arriving while the page is open is marked too.
	const markReadMutation = api.mutations.useMarkTaskRead(task.id);
	const newestEventId = events.at(-1)?.id;
	useEffect(() => {
		if (newestEventId !== undefined) markReadMutation.mutate({ upToEventId: newestEventId });
	}, [newestEventId, markReadMutation.mutate]);
	// The page hides what the role cannot do; the API enforces it.
	const edits = hasSpaceRole(currentUser, space, "editor");
	const removeRepeatDone =
		edits && task.closedAt === null
			? (eventId: number) =>
					removeDoneMutation.mutate(eventId, {
						onError: (error) => notifications.show({ message: error.message, color: "red" }),
					})
			: undefined;
	return (
		<>
			{/* A closed task's heading recedes like its row in a list: dimmed, with the check before the title. */}
			<Title order={3} mb="lg" c={task.closedAt === null ? undefined : "dimmed"}>
				<Text span inherit c="dimmed" fw={400}>
					#{task.id}
				</Text>{" "}
				{task.closedAt !== null && <IconCircleCheck size="0.8em" className="task-page-closed-icon" />}
				{task.title}
			</Title>
			<Grid gap="xl">
				{/* On a phone the properties come first, so they stay in reach; wider, they sit right of the body. */}
				<Grid.Col span={{ base: 12, sm: "auto" }} order={{ base: 2, sm: 1 }}>
					<Stack gap="xl" maw="70ch">
						{/* The description is the task's own text, not a message: no author, and nothing when empty. The title and
						    the description are edited through the form's "Edit" menu; its versions open from the change line. */}
						{task.body !== "" && <Markdown>{task.body}</Markdown>}
						<TaskActivity
							task={task}
							space={space}
							// Keyed by space: a move changes the labels and the assignee the form starts from.
							composer={
								edits
									? (menu) => (
											<ComposerFold aside={menu}>
												{({ onTouched, onSent }) => (
													<TaskUpdateForm key={task.spaceId} task={task} space={space} onTouched={onTouched} onSent={onSent} />
												)}
											</ComposerFold>
										)
									: undefined
							}
							edits={edits}
							onRemoveRepeatDone={removeRepeatDone}
							order={order}
							onOrder={setOrder}
							showChanges={changes}
							onShowChanges={(value) => navigate({ to: "/t/$taskId", params: { taskId }, search: { changes: value } })}
						/>
					</Stack>
				</Grid.Col>
				<Grid.Col span={{ base: 12, sm: "content" }} order={{ base: 1, sm: 2 }}>
					<TaskProperties task={task} space={space} />
				</Grid.Col>
			</Grid>
		</>
	);
}
