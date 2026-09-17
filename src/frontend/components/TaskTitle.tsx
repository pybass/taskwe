import { IconCircleCheck } from "@tabler/icons-react";
import type { Task } from "#shared/task.ts";
import "./task-title.css";

/**
 * A task title in medium weight, dimmed with a check when the task is closed; the counterpart of `Username` and
 * `SpaceName`. It is only the text: the caller wraps it in the link, and the title takes the primary color while that
 * link is hovered or focused.
 */
export function TaskTitle({ task }: { task: Pick<Task, "title" | "closedAt"> }) {
	return (
		<span className="task-title" data-closed={task.closedAt !== null || undefined}>
			{task.closedAt !== null && <IconCircleCheck size="1em" className="task-title-check" />}
			{task.title}
		</span>
	);
}
