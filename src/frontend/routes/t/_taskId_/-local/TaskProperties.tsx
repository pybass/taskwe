import { ActionIcon, Box, Button, Group, Stack, Text } from "@mantine/core";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import type { Space } from "#shared/space.ts";
import type { Task } from "#shared/task.ts";
import { DueDate } from "@/components/DueDate.tsx";
import { TaskLabels } from "@/components/LabelBadge.tsx";
import { Username } from "@/components/Username.tsx";
import { dueUrgency, formatRepeat, formatShortDate } from "@/utils/format.ts";

function Property({ label, children }: { label: string; children: ReactNode }) {
	return (
		<Group gap="sm" wrap="nowrap" align="flex-start">
			<Text size="xs" c="dimmed" w="5em" style={{ flexShrink: 0 }}>
				{label}
			</Text>
			<Box fz="xs">{children}</Box>
		</Group>
	);
}

/**
 * The sidebar of a task, read-only: every change goes through the update form. Wider than a phone it is a column of
 * labelled rows. On a phone it comes above the body, so it starts as one line of the values that matter to act, each
 * telling what it is by its own mark; a chevron swaps the line for the full rows, which also name what each mark is.
 */
export function TaskProperties({ task, space }: { task: Task; space: Space }) {
	const [expanded, setExpanded] = useState(false);
	// A personal space's task is always the owner's, so the field is not shown.
	const isPersonal = space.ownerId !== null;
	// "Unassigned" is a state worth a glance, so it stays on the short line like a name.
	const assignee = isPersonal ? undefined : <Username userId={task.assigneeId} assignee />;
	const dueDate =
		task.dueDate === null && task.repeatDays === null ? undefined : (
			<>
				{task.dueDate === null ? (
					<Text span inherit c="dimmed">
						None
					</Text>
				) : (
					<DueDate
						day={task.dueDate}
						repeats={task.repeatDays !== null}
						urgency={task.closedAt === null ? dueUrgency(task.dueDate) : undefined}
					/>
				)}
				{task.repeatDays !== null && (
					<Text span inherit c="dimmed">
						{" · "}
						{formatRepeat(task.repeatDays)}
					</Text>
				)}
			</>
		);
	const rows = (
		<>
			{assignee !== undefined && <Property label="Assignee">{assignee}</Property>}
			{task.labels.length > 0 && (
				<Property label="Labels">
					<TaskLabels space={space} labels={task.labels} />
				</Property>
			)}
			{dueDate !== undefined && <Property label="Due date">{dueDate}</Property>}
			{task.repeatDones[0] !== undefined && (
				<Property label="Last done">
					{formatShortDate(task.repeatDones[0].doneAt)} by <Username userId={task.repeatDones[0].actorId} />
				</Property>
			)}
			<Property label="Author">
				<Username userId={task.authorId} />
			</Property>
			{/* No status row: the title shows it. The times go in the order they happen; closing is an update, so Closed
			    never comes after Updated. */}
			<Property label="Created">{formatShortDate(task.createdAt)}</Property>
			{task.closedAt !== null && <Property label="Closed">{formatShortDate(task.closedAt)}</Property>}
			<Property label="Updated">{formatShortDate(task.updatedAt)}</Property>
		</>
	);
	return (
		<>
			<Stack visibleFrom="sm" w={220} gap="xs">
				{rows}
			</Stack>
			{/* The chevron keeps the right end of the first line in both states, so the toggle never moves. A short line
			    with nothing on it, which a personal space allows, says "Details" instead, so the chevron has a subject. */}
			{!expanded && assignee === undefined && dueDate === undefined && task.labels.length === 0 ? (
				<Button
					hiddenFrom="sm"
					variant="subtle"
					color="gray"
					size="compact-xs"
					fw={400}
					c="dimmed"
					rightSection={<IconChevronDown size={12} />}
					onClick={() => setExpanded(true)}
				>
					Details
				</Button>
			) : (
				<Group hiddenFrom="sm" gap="xs" wrap="nowrap" align="flex-start">
					<Box flex={1} style={{ minWidth: 0 }}>
						{expanded ? (
							<Stack gap="xs">{rows}</Stack>
						) : (
							// One gap for all: tight enough that the label pills read as a group, and each other value carries
							// its own mark, so they stay apart at that distance too.
							<Group gap={8} fz="xs" align="center">
								{assignee}
								{dueDate !== undefined && <span>{dueDate}</span>}
								<TaskLabels space={space} labels={task.labels} inline />
							</Group>
						)}
					</Box>
					<ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setExpanded((value) => !value)}>
						{expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
					</ActionIcon>
				</Group>
			)}
		</>
	);
}
