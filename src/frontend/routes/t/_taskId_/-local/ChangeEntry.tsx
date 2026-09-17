import { Text } from "@mantine/core";
import type { TaskEvent } from "#shared/event.ts";
import type { Space } from "#shared/space.ts";
import type { Task } from "#shared/task.ts";
import { ChangeSentence } from "@/components/ChangeSentence.tsx";
import { Username } from "@/components/Username.tsx";
import { formatShortDate } from "@/utils/format.ts";
import { RemoveDoneButton } from "./RemoveDoneButton.tsx";
import { bodyVersions, commentVersions, TextHistoryLink } from "./TextHistory.tsx";

type Props = {
	/** An event without a comment, a change; the activity picks these. */
	event: TaskEvent;
	task: Task;
	space: Space;
	/** The whole activity: an edit's words open the versions of the text it changed. */
	events: TaskEvent[];
	/** With it, a done that the task still holds gets a trash icon; without, the dones are read-only. */
	onRemoveRepeatDone?: (eventId: number) => void;
};

/** A change as a log line: dim, the actor, what changed, and the date, at the size of the line around it. */
export function ChangeEntry({ event, task, space, events, onRemoveRepeatDone }: Props) {
	const { changes } = event;
	// A done the task still holds can be removed; one already removed is history. A done is keyed by its event.
	const removableDone =
		changes.action === "updated" &&
		changes.repeatDoneRecorded !== undefined &&
		task.repeatDones.some((done) => done.eventId === event.id);
	return (
		<Text inherit c="dimmed">
			<Username userId={event.actorId} />{" "}
			<ChangeSentence
				changes={changes}
				space={space}
				link={(key, text) =>
					key === "body" ? (
						<TextHistoryLink
							versions={bodyVersions(events)}
							title="Description history"
							text={text}
							emptyText="No description."
						/>
					) : (
						<TextHistoryLink
							versions={changes.action === "commentUpdated" ? commentVersions(events, changes.commentId) : []}
							title="Comment history"
							text={text}
							emptyText=""
						/>
					)
				}
			/>{" "}
			· {formatShortDate(event.createdAt)}
			{removableDone && onRemoveRepeatDone !== undefined && <RemoveDoneButton event={event} onRemove={onRemoveRepeatDone} />}
		</Text>
	);
}
