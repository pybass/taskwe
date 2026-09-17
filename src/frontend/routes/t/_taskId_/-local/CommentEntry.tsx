import { ActionIcon, Box, Button, Group, Stack, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconPencil } from "@tabler/icons-react";
import { useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { CommentPatch } from "#shared/comment.ts";
import type { TaskEvent } from "#shared/event.ts";
import type { Space } from "#shared/space.ts";
import type { Task } from "#shared/task.ts";
import { api } from "@/api/index.ts";
import { ChangeSentence } from "@/components/ChangeSentence.tsx";
import { ErrorMessage } from "@/components/ErrorMessage.tsx";
import { Markdown } from "@/components/Markdown.tsx";
import { MarkdownEditor } from "@/components/MarkdownEditor.tsx";
import { Username } from "@/components/Username.tsx";
import { zodResolver } from "@/utils/form.ts";
import { formatShortDate } from "@/utils/format.ts";
import { RemoveDoneButton } from "./RemoveDoneButton.tsx";
import { bodyVersions, commentVersions, TextHistoryLink } from "./TextHistory.tsx";
import "./comment-entry.css";

function CommentForm({ task, commentId, body, onDone }: { task: Task; commentId: number; body: string; onDone: () => void }) {
	const updateMutation = api.mutations.useUpdateComment(task, commentId);
	const form = useForm({ mode: "uncontrolled", initialValues: { body }, validate: zodResolver(CommentPatch) });
	return (
		<form onSubmit={form.onSubmit((values) => updateMutation.mutate(values, { onSuccess: onDone }))}>
			<Stack gap="sm">
				<MarkdownEditor key={form.key("body")} minRows={3} autoFocus {...form.getInputProps("body")} />
				<ErrorMessage error={updateMutation.error} />
				<Group justify="flex-end" gap="xs">
					<Button variant="default" onClick={onDone}>
						Cancel
					</Button>
					<Button type="submit" loading={updateMutation.isPending}>
						Save
					</Button>
				</Group>
			</Stack>
		</form>
	);
}

type Props = {
	/** An `updated` event with a comment; the activity picks these. */
	event: TaskEvent;
	task: Task;
	space: Space;
	/** The whole activity: the comment's current text and its history are the chain of its edits. */
	events: TaskEvent[];
	/** Whether the current user edits the space; with it, their own comment gets a pencil. */
	edits: boolean;
	/** With it, a done that the task still holds gets a trash icon; without, the dones are read-only. */
	onRemoveRepeatDone?: (eventId: number) => void;
};

/**
 * A comment as a message: the author, then small and dim the date, what else the same write changed, and "edited"
 * with a link to the versions; under the line the text as it is now. The pencil, faint until hovered, swaps the
 * text for an editor in place. The entry is `#c{commentId}` on the page, tinted while the URL points at it.
 */
export function CommentEntry({ event, task, space, events, edits, onRemoveRepeatDone }: Props) {
	const currentUser = api.cache.useCurrentUser();
	const hash = useLocation({ select: (location) => location.hash });
	const [editing, setEditing] = useState(false);
	const { changes } = event;
	if (changes.action !== "updated" || changes.commentAdded === undefined) return null;
	const { action: _action, commentAdded, ...rest } = changes;
	const hasNote = Object.values(rest).some((value) => value !== undefined);
	const versions = commentVersions(events, commentAdded.commentId);
	const current = versions[0];
	// A done the task still holds can be removed; one already removed is history. A done is keyed by its event.
	const removableDone = rest.repeatDoneRecorded !== undefined && task.repeatDones.some((done) => done.eventId === event.id);
	return (
		<Box
			id={`c${commentAdded.commentId}`}
			className="comment-entry"
			data-editable
			data-target={hash === `c${commentAdded.commentId}` || undefined}
		>
			<Text size="sm">
				<Username userId={event.actorId} />
				<Text span size="xs" c="dimmed">
					{" "}
					· {formatShortDate(event.createdAt)}
					{hasNote && (
						<>
							{" · "}
							<ChangeSentence
								changes={changes}
								space={space}
								comment={false}
								link={(_key, text) => (
									<TextHistoryLink
										versions={bodyVersions(events)}
										title="Description history"
										text={text}
										emptyText="No description."
									/>
								)}
							/>
						</>
					)}
					{versions.length > 1 && (
						<>
							{" · "}
							<TextHistoryLink
								versions={versions}
								title="Comment history"
								text={`edited ${versions.length === 2 ? "once" : `${versions.length - 1} times`}`}
								emptyText=""
							/>
						</>
					)}
				</Text>
				{edits && event.actorId === currentUser.id && !editing && (
					<ActionIcon
						variant="subtle"
						color="gray"
						size="xs"
						ml={4}
						className="comment-entry-pencil"
						onClick={() => setEditing(true)}
					>
						<IconPencil size={14} />
					</ActionIcon>
				)}
				{removableDone && onRemoveRepeatDone !== undefined && <RemoveDoneButton event={event} onRemove={onRemoveRepeatDone} />}
			</Text>
			{current !== undefined && (
				<Box mt={4}>
					{editing ? (
						<CommentForm task={task} commentId={commentAdded.commentId} body={current.body} onDone={() => setEditing(false)} />
					) : (
						<Markdown>{current.body}</Markdown>
					)}
				</Box>
			)}
		</Box>
	);
}
