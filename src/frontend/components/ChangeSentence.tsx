import { Fragment, type ReactNode } from "react";
import type { TaskChanges } from "#shared/event.ts";
import type { Space } from "#shared/space.ts";
import { formatRepeat, formatShortDate } from "@/utils/format.ts";
import { DueDate } from "./DueDate.tsx";
import { LabelNames } from "./LabelBadge.tsx";
import { Username } from "./Username.tsx";

/** The two edits whose versions a page may be able to show. */
type TextEditKey = "body" | "commentUpdated";

type Part = { key: string; node: ReactNode };

function assigned(assigneeId: number): ReactNode {
	return (
		<>
			assigned it to <Username userId={assigneeId} assignee />
		</>
	);
}

function assigneeChange({ from, to }: { from: number | null; to: number | null }): ReactNode {
	if (to === null) return <>unassigned {from !== null && <Username userId={from} />}</>;
	if (from === null) return assigned(to);
	return (
		<>
			reassigned it from <Username userId={from} /> to <Username userId={to} assignee />
		</>
	);
}

/**
 * The pieces of the sentence, one per change, in the order of the action's keys in `TaskChanges`. A comment is
 * "commented" unless `comment` is false, where the page shows the text itself. With `brief` a creation is only
 * "created the task", without what was set with it.
 */
function describe(
	changes: TaskChanges,
	space: Space,
	link: (key: TextEditKey, text: string) => ReactNode,
	comment: boolean,
	brief: boolean,
): Part[] {
	const parts: Part[] = [];
	switch (changes.action) {
		case "created": {
			parts.push({ key: "created", node: "created the task" });
			if (brief) break;
			if (changes.assigneeId !== null) parts.push({ key: "assigneeId", node: assigned(changes.assigneeId) });
			if (changes.labels.length > 0) {
				parts.push({
					key: "labels",
					node: (
						<>
							labeled it <LabelNames space={space} names={changes.labels} />
						</>
					),
				});
			}
			if (changes.dueDate !== null) {
				parts.push({
					key: "dueDate",
					node: (
						<>
							set the due date to <DueDate day={changes.dueDate} />
						</>
					),
				});
			}
			if (changes.repeatDays !== null) {
				parts.push({ key: "repeatDays", node: `set it to repeat ${formatRepeat(changes.repeatDays)}` });
			}
			break;
		}
		case "updated": {
			const { closedAt, title, body, assigneeId, dueDate, labels, repeatDays, repeatDoneRecorded, commentAdded } = changes;
			if (closedAt !== undefined)
				parts.push({ key: "closedAt", node: closedAt.to !== null ? "closed the task" : "reopened the task" });
			if (title !== undefined) {
				parts.push({
					key: "title",
					node: (
						<>
							changed the title from <q>{title.from}</q> to <q>{title.to}</q>
						</>
					),
				});
			}
			if (body !== undefined) parts.push({ key: "body", node: link("body", "edited the description") });
			if (assigneeId !== undefined) parts.push({ key: "assigneeId", node: assigneeChange(assigneeId) });
			if (dueDate !== undefined) {
				if (dueDate.to === null) parts.push({ key: "dueDate", node: "removed the due date" });
				else if (dueDate.from === null) {
					parts.push({
						key: "dueDate",
						node: (
							<>
								set the due date to <DueDate day={dueDate.to} />
							</>
						),
					});
				} else {
					parts.push({
						key: "dueDate",
						node: (
							<>
								changed the due date from <DueDate day={dueDate.from} /> to <DueDate day={dueDate.to} />
							</>
						),
					});
				}
			}
			if (labels !== undefined) {
				if (labels.added.length > 0) {
					parts.push({
						key: "labelsAdded",
						node: (
							<>
								added <LabelNames space={space} names={labels.added} />
							</>
						),
					});
				}
				if (labels.removed.length > 0) {
					parts.push({
						key: "labelsRemoved",
						node: (
							<>
								removed <LabelNames space={space} names={labels.removed} />
							</>
						),
					});
				}
			}
			if (repeatDays !== undefined) {
				if (repeatDays.to === null) parts.push({ key: "repeatDays", node: "removed the repeat" });
				else if (repeatDays.from === null) {
					parts.push({ key: "repeatDays", node: `set it to repeat ${formatRepeat(repeatDays.to)}` });
				} else {
					parts.push({
						key: "repeatDays",
						node: `changed the repeat from ${formatRepeat(repeatDays.from)} to ${formatRepeat(repeatDays.to)}`,
					});
				}
			}
			if (repeatDoneRecorded !== undefined) parts.push({ key: "repeatDoneRecorded", node: "marked it done" });
			if (commentAdded !== undefined && comment) parts.push({ key: "commentAdded", node: "commented" });
			break;
		}
		case "moved": {
			parts.push({ key: "moved", node: `moved it from ${changes.space.from.name} to ${changes.space.to.name}` });
			if (changes.assigneeId !== undefined) parts.push({ key: "assigneeId", node: assigneeChange(changes.assigneeId) });
			break;
		}
		case "repeatDoneRemoved":
			parts.push({
				key: "repeatDoneRemoved",
				node: (
					<>
						removed the done of {formatShortDate(changes.done.doneAt)} by <Username userId={changes.done.actorId} />
					</>
				),
			});
			break;
		case "commentUpdated":
			parts.push({ key: "commentUpdated", node: link("commentUpdated", "edited a comment") });
			break;
	}
	return parts;
}

type Props = {
	changes: TaskChanges;
	/** The task's space, for the colors of the labels named. */
	space: Space;
	/** Wraps the words of an edit whose versions the page can show; plain text without it. */
	link?: (key: TextEditKey, text: string) => ReactNode;
	/** Whether a comment the write added is named as "commented"; false where the comment itself follows. */
	comment?: boolean;
	/** A creation as "created the task" alone, for a feed whose title line shows the task as it is. */
	brief?: boolean;
};

/**
 * What an event changed, as the words after the actor's name: one piece per change, joined with commas and "and".
 * Nothing for a write whose only change is a comment left out.
 */
export function ChangeSentence({ changes, space, link = (_key, text) => text, comment = true, brief = false }: Props) {
	const parts = describe(changes, space, link, comment, brief);
	return parts.map((part, index) => (
		<Fragment key={part.key}>
			{index > 0 && (index === parts.length - 1 ? " and " : ", ")}
			{part.node}
		</Fragment>
	));
}
