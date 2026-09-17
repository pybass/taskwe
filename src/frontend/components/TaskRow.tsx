import { IconMessage } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { Space } from "#shared/space.ts";
import type { Task } from "#shared/task.ts";
import { dueUrgency, formatShortDate } from "@/utils/format.ts";
import { DueDate } from "./DueDate.tsx";
import { TaskLabels } from "./LabelBadge.tsx";
import { SpaceName } from "./SpaceName.tsx";
import { TaskTitle } from "./TaskTitle.tsx";
import { Username } from "./Username.tsx";
import "./task-row.css";

/**
 * One row of any task list, a link to the task. The left side is where the task came from: the number, the title
 * with its labels, and under them one sentence: the author first in a shared space, so the eye finds it before
 * reading, in which space when `showSpace`, then when it was opened, closed and last done. The right side is where it
 * is going: the due day and the comments, and under them the assignee with its filled mark. A personal space's task
 * is always the owner's, so neither its author nor its assignee nor its name is said. `children` is a line a list
 * adds under all that, such as a search snippet, and `hash` points the link at a place on the task page.
 */
export function TaskRow({
	task,
	space,
	showSpace = false,
	hash,
	children,
}: {
	task: Task;
	space: Space;
	showSpace?: boolean;
	hash?: string;
	children?: ReactNode;
}) {
	const shared = space.ownerId === null;
	const lastDone = task.repeatDones[0];
	return (
		<Link to="/t/$taskId" params={{ taskId: task.id }} hash={hash} className="task-row">
			<span className="task-row-number">#{task.id}</span>
			<span className="task-row-head">
				<TaskTitle task={task} />
				<TaskLabels space={space} labels={task.labels} inline />
			</span>
			<span className="task-row-facts">
				{task.dueDate !== null && (
					<DueDate
						day={task.dueDate}
						repeats={task.repeatDays !== null}
						urgency={task.closedAt === null ? dueUrgency(task.dueDate) : undefined}
					/>
				)}
				{task.commentCount > 0 && (
					<span>
						<IconMessage size="1em" className="task-row-icon" />
						{task.commentCount}
					</span>
				)}
			</span>
			<span className="task-row-meta">
				{shared && (
					<>
						by <Username userId={task.authorId} />
						{showSpace && (
							<>
								{" in "}
								<SpaceName space={space} />
							</>
						)}
						{", "}
					</>
				)}
				{formatShortDate(task.createdAt)}
				{task.closedAt !== null && <>, closed {formatShortDate(task.closedAt)}</>}
				{lastDone !== undefined && <>, done {formatShortDate(lastDone.doneAt)}</>}
			</span>
			{shared && task.assigneeId !== null && (
				<span className="task-row-aside">
					<Username userId={task.assigneeId} assignee />
				</span>
			)}
			{children !== undefined && <span className="task-row-extra">{children}</span>}
		</Link>
	);
}
