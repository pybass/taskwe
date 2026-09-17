import { Text } from "@mantine/core";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Task } from "#shared/task.ts";
import { api } from "@/api/index.ts";
import { TaskRow } from "@/components/TaskRow.tsx";
import { dueUrgency, today } from "@/utils/format.ts";

/**
 * The My tasks tab of the home page: the user's open tasks across their spaces as one list. The overdue come first,
 * then the ones due soon, both soonest first; the rest by last update, newest first, whatever their due date, so a
 * routine due in months does not sit above the undated for good. The cut is `dueUrgency` on the browser's day,
 * hence the sort is here and not in the API.
 */
export function MyTasks() {
	const tasks = useSuspenseQuery(api.queries.listMyTasks()).data;
	const spaces = api.cache.useSpaces();
	// A task of a space the cached list lacks is skipped.
	const rows = tasks.flatMap((task) => {
		const space = spaces.find((space) => space.id === task.spaceId);
		return space === undefined ? [] : [{ task, space }];
	});
	if (rows.length === 0) {
		return (
			<Text c="dimmed" py="md">
				Nothing assigned to you.
			</Text>
		);
	}
	const day = today();
	const dueSoon = ({ dueDate }: Task) => dueDate !== null && dueUrgency(dueDate, day) !== "later";
	rows.sort((a, b) => {
		if (dueSoon(a.task) !== dueSoon(b.task)) return dueSoon(a.task) ? -1 : 1;
		// Both due soon: the API's order, by due date. Neither: newest activity first.
		return dueSoon(a.task) ? 0 : b.task.updatedAt.localeCompare(a.task.updatedAt);
	});
	return (
		<div className="task-list">
			{rows.map(({ task, space }) => (
				<TaskRow key={task.id} task={task} space={space} showSpace />
			))}
		</div>
	);
}
