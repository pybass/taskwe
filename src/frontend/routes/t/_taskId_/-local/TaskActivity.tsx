import { Group, Stack, Text } from "@mantine/core";
import { IconHistory } from "@tabler/icons-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { TaskEvent } from "#shared/event.ts";
import type { Space } from "#shared/space.ts";
import type { Task } from "#shared/task.ts";
import { api } from "@/api/index.ts";
import { ActivityMenu, isComment, type Order } from "./ActivityMenu.tsx";
import { ChangeEntry } from "./ChangeEntry.tsx";
import { CommentEntry } from "./CommentEntry.tsx";
import "./task-activity.css";

/** A comment on its own, or the changes between two comments as one run, so they sit close together. */
type Run = { kind: "comment"; event: TaskEvent } | { kind: "changes"; events: TaskEvent[] };

function toRuns(events: TaskEvent[]): Run[] {
	const runs: Run[] = [];
	for (const event of events) {
		const last = runs.at(-1);
		if (isComment(event)) runs.push({ kind: "comment", event });
		else if (last?.kind === "changes") last.events.push(event);
		else runs.push({ kind: "changes", events: [event] });
	}
	return runs;
}

type Props = {
	task: Task;
	space: Space;
	/** The update form, folded; it takes the line above the activity whatever the order, and gets the menu to place. */
	composer?: (menu: ReactNode) => ReactNode;
	/** Whether the current user edits the space. */
	edits: boolean;
	/** With it, a done that the task still holds gets a trash icon; without, the dones are read-only. */
	onRemoveRepeatDone?: (eventId: number) => void;
	/** The order is a reading habit the page keeps in the browser; the filter is a view of this task, kept in the URL. */
	order: Order;
	onOrder: (value: Order) => void;
	showChanges: boolean;
	onShowChanges: (value: boolean) => void;
};

/**
 * The task's activity, its events as comments and changes: a comment is a message at the left edge, a change a small
 * dim line indented under it with the history icon, and consecutive changes sit close together as one run. One line
 * above the activity holds the folded form and, at its end, the menu that sorts and filters: the line stays at the
 * top with either order, so with the oldest first a new entry appears at the end while it is written at the top. By
 * default only the comments show, whole with what else their write changed, and the menu says how many changes that
 * hides.
 */
export function TaskActivity({
	task,
	space,
	composer,
	edits,
	onRemoveRepeatDone,
	order,
	onOrder,
	showChanges,
	onShowChanges,
}: Props) {
	const events = useSuspenseQuery(api.queries.listTaskEvents(task.id)).data;
	const shown = showChanges ? [...events] : events.filter(isComment);
	if (order === "newest") shown.reverse();
	const entryProps = { task, space, events, onRemoveRepeatDone };
	const menu = (
		<ActivityMenu events={events} order={order} onOrder={onOrder} showChanges={showChanges} onShowChanges={onShowChanges} />
	);
	return (
		<Stack gap="lg">
			{composer !== undefined ? composer(menu) : <Group justify="flex-end">{menu}</Group>}
			{toRuns(shown).map((run) =>
				run.kind === "comment" ? (
					<CommentEntry key={run.event.id} event={run.event} edits={edits} {...entryProps} />
				) : (
					<Stack key={run.events[0]?.id} gap={4}>
						{run.events.map((event) => (
							<div key={event.id} className="task-activity-change">
								<span className="task-activity-change-icon">
									<IconHistory size="1.1em" />
								</span>
								<ChangeEntry event={event} {...entryProps} />
							</div>
						))}
					</Stack>
				),
			)}
			{shown.length === 0 && (
				<Text size="sm" c="dimmed">
					No comments yet.
				</Text>
			)}
		</Stack>
	);
}
