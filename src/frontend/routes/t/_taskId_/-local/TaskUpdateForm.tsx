import { Box, Button, CloseButton, Group, Menu, Paper, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
	IconAlignLeft,
	IconArrowRight,
	IconCalendar,
	IconCheck,
	IconChevronDown,
	IconCircleCheck,
	IconCircleDot,
	IconMarkdown,
	IconPencil,
	IconRepeat,
	IconTag,
	IconUser,
} from "@tabler/icons-react";
import { useBlocker } from "@tanstack/react-router";
import { type ReactNode, useEffect, useReducer, useRef, useState } from "react";
import { z } from "zod";
import { hasSpaceRole, type Space } from "#shared/space.ts";
import { NewTask, RepeatDays, type Task, type TaskPatch } from "#shared/task.ts";
import { api } from "@/api/index.ts";
import { DayInput } from "@/components/DayInput.tsx";
import { DueDateFields, type DueDateValue } from "@/components/DueDateEditor.tsx";
import { ErrorMessage } from "@/components/ErrorMessage.tsx";
import { LabelMultiSelect } from "@/components/LabelMultiSelect.tsx";
import { MarkdownEditor } from "@/components/MarkdownEditor.tsx";
import { NotifyUsersPicker } from "@/components/NotifyUsersPicker.tsx";
import { UserSelect } from "@/components/UserSelect.tsx";
import { zodResolver } from "@/utils/form.ts";
import { addDays, formatDay, today } from "@/utils/format.ts";
import { COMMENT_PLACEHOLDER } from "./ComposerFold.tsx";
import { MoveTaskModal } from "./MoveTaskModal.tsx";

// The menu and the rows keep this order whatever the order of the picks: the frequent changes first, the text last.
// The icon is for the menu; the status one depends on the task.
type TaskField = "status" | "done" | "assignee" | "labels" | "dueDate" | "title" | "body";
const FIELDS: { name: TaskField; label: string; icon: typeof IconPencil }[] = [
	{ name: "status", label: "Status", icon: IconCircleCheck },
	{ name: "done", label: "Done", icon: IconRepeat },
	{ name: "assignee", label: "Assignee", icon: IconUser },
	{ name: "labels", label: "Labels", icon: IconTag },
	{ name: "dueDate", label: "Due date", icon: IconCalendar },
	{ name: "title", label: "Title", icon: IconPencil },
	{ name: "body", label: "Description", icon: IconAlignLeft },
];
const MENU_ICON_PROPS = { size: 16, color: "var(--mantine-color-dimmed)" };

// The comment may be empty: that means none. The title and the body follow the create rules.
const Values = NewTask.pick({ title: true, body: true }).extend({ comment: z.string().trim().max(10_000) });

/**
 * The one write of the task page. By default a plain comment box and two buttons. "Change" is the constructor: each
 * item adds one row, the close or reopen, the assignee, the due date, the labels, the title, the description, and the
 * Done of a repeating task. "Update" sends the rows and the comment as one patch, so one press is one change; it is
 * disabled while the form is empty. "Update" is the only submit button, always: a close, a reopen, or a done is a
 * row, never a second button that sends. "Change" also holds two items outside the patch: "Formatting" swaps the
 * comment box for the markdown editor, and for a manager "Move to another space…" opens the move modal. The notify
 * picker sits next to "Change". `onTouched` reports whether anything is typed, picked, or opened, so a fold knows
 * what a fold would lose; `onSent` fires after a successful write, so the fold can close.
 */
export function TaskUpdateForm({
	task,
	space,
	onTouched,
	onSent,
}: {
	task: Task;
	space: Space;
	onTouched?: (touched: boolean) => void;
	onSent?: () => void;
}) {
	const users = api.cache.useUsers();
	const labels = api.cache.useSpaceLabels(space);
	const owner = space.ownerId;
	const currentUser = api.cache.useCurrentUser();
	// The whole history goes with a move, so it is the manager's call; the owner is the manager of a personal space.
	const moves = hasSpaceRole(currentUser, space, "manager");
	const updateMutation = api.mutations.useUpdateTask(task);
	const [moveOpened, setMoveOpened] = useState(false);
	// A comment is a short message, so the box starts plain; the editor is a pick, for this form's life.
	const [formatting, setFormatting] = useState(false);
	// The form is uncontrolled, so a change does not render; the buttons need the values, hence the tick.
	const [, tick] = useReducer((n: number) => n + 1, 0);
	// A select holds strings, so the assignee id is a string here and a number in the patch.
	const form = useForm({
		mode: "uncontrolled",
		initialValues: {
			title: task.title,
			body: task.body,
			assigneeId: task.assigneeId === null ? null : (String(task.assigneeId) as string | null),
			labels: task.labels,
			comment: "",
		},
		validate: zodResolver(Values),
		onValuesChange: tick,
	});
	// The due date and the done live outside the form: their editors are controlled. `saved` is the value of the last save.
	const [saved, setSaved] = useState<DueDateValue>({ dueDate: task.dueDate, invalidDay: false, repeatDays: task.repeatDays });
	const [dueDate, setDueDate] = useState(saved);
	const [dueDateError, setDueDateError] = useState<string | undefined>(undefined);
	const [nextDue, setNextDue] = useState<string | null>(null);
	// Text in the next due field that is not a day: the null must not pass as "not picked yet" only.
	const [nextDueInvalid, setNextDueInvalid] = useState(false);
	const [nextDueError, setNextDueError] = useState<string | undefined>(undefined);
	const [shown, setShown] = useState<TaskField[]>([]);
	// Picking a new assignee ticks them; the user may untick. Never the user: the picker does not show them. Not part
	// of `changes`: a pick alone does not make the form dirty.
	const [notifyUserIds, setNotifyUserIds] = useState<number[]>([]);
	form.watch("assigneeId", ({ value }) => {
		if (value === null || value === form.getInitialValues().assigneeId || Number(value) === currentUser.id) return;
		setNotifyUserIds((userIds) => (userIds.includes(Number(value)) ? userIds : [...userIds, Number(value)]));
	});
	const rowRefs = useRef<Partial<Record<TaskField, HTMLDivElement | null>>>({});
	/** Add the row and put the cursor in it. */
	const show = (field: TaskField) => {
		// The next due day the days suggest, computed here in the user's own day; the server never computes a date.
		if (field === "done" && task.repeatDays !== null) setNextDue(addDays(today(), task.repeatDays));
		setShown((fields) => [...fields, field]);
		setTimeout(() => rowRefs.current[field]?.querySelector<HTMLElement>("input, textarea")?.focus());
	};
	/** Take the row away and put its value back. */
	const hide = (field: TaskField) => {
		setShown((fields) => fields.filter((name) => name !== field));
		if (field === "title") form.setFieldValue("title", form.getInitialValues().title);
		if (field === "body") form.setFieldValue("body", form.getInitialValues().body);
		if (field === "assignee") form.setFieldValue("assigneeId", form.getInitialValues().assigneeId);
		if (field === "labels") form.setFieldValue("labels", form.getInitialValues().labels);
		if (field === "dueDate") {
			setDueDate(saved);
			setDueDateError(undefined);
		}
		if (field === "done") {
			setNextDue(null);
			setNextDueInvalid(false);
			setNextDueError(undefined);
		}
	};

	const values = form.getValues();
	const initial = form.getInitialValues();
	const repeatDays = dueDate.repeatDays === null ? null : RepeatDays.safeParse(dueDate.repeatDays);
	const savedDays = saved.repeatDays === null ? null : RepeatDays.safeParse(saved.repeatDays);
	// What the user changed since the last save; an untouched field is not sent, so it cannot undo another's edit.
	const changes: Omit<TaskPatch, "notifyUserIds"> = {};
	if (values.title !== initial.title) changes.title = values.title;
	if (values.body !== initial.body) changes.body = values.body;
	if (values.assigneeId !== initial.assigneeId)
		changes.assigneeId = values.assigneeId === null ? null : Number(values.assigneeId);
	const labelsAdded = values.labels.filter((name) => !initial.labels.includes(name));
	const labelsRemoved = initial.labels.filter((name) => !values.labels.includes(name));
	if (labelsAdded.length > 0 || labelsRemoved.length > 0) changes.labels = { added: labelsAdded, removed: labelsRemoved };
	if (dueDate.dueDate !== saved.dueDate) changes.dueDate = dueDate.dueDate;
	if ((repeatDays?.success ? repeatDays.data : null) !== (savedDays?.success ? savedDays.data : null)) {
		changes.repeatDays = repeatDays?.success ? repeatDays.data : null;
	}
	const open = task.closedAt === null;
	const done = shown.includes("done");
	if (shown.includes("status")) changes.closed = open;
	const comment = values.comment.trim();
	const dirty = Object.keys(changes).length > 0 || done || comment !== "";
	useBlocker({
		shouldBlockFn: () => dirty && !window.confirm("Leave the page? Your changes are not saved."),
		enableBeforeUnload: () => dirty,
	});
	// An open row or a notify pick is not dirty, but it is work the user would lose with the form.
	const touched = dirty || shown.length > 0 || notifyUserIds.length > 0;
	useEffect(() => onTouched?.(touched), [onTouched, touched]);

	/** Validate, then send the rows and the comment as one patch. */
	const send = () => {
		if (form.validate().hasErrors) return;
		if (dueDate.invalidDay) {
			setDueDateError("Use dd.mm.yyyy for the due date");
			return;
		}
		if (repeatDays !== null && !repeatDays.success) {
			setDueDateError("Repeat every a whole number of days, 1 or more");
			return;
		}
		if (done && nextDue === null) {
			setNextDueError(nextDueInvalid ? "Use dd.mm.yyyy for the next due day" : "Pick the next due day");
			return;
		}
		const patch: TaskPatch = { ...changes, notifyUserIds };
		let message = "Task updated";
		if (patch.closed !== undefined) message = patch.closed ? "Task closed" : "Task reopened";
		if (done && nextDue !== null) {
			patch.recordRepeatDone = true;
			patch.dueDate = nextDue;
			message = `Done. Next due ${formatDay(nextDue)}`;
		}
		if (comment !== "") patch.comment = comment;
		updateMutation.mutate(patch, {
			onSuccess: () => {
				notifications.show({ message, color: "green" });
				// The saved values become the base of the next diff; the comment box empties and the rows go.
				form.setInitialValues({ ...form.getValues(), comment: "" });
				form.reset();
				const nextDueDate = { dueDate: patch.dueDate ?? dueDate.dueDate, invalidDay: false, repeatDays: dueDate.repeatDays };
				setSaved(nextDueDate);
				setDueDate(nextDueDate);
				setNextDue(null);
				setNextDueInvalid(false);
				setShown([]);
				setNotifyUserIds([]);
				onSent?.();
			},
		});
	};
	// A personal space's task is always the owner's, so there is no assignee row; a space without labels has no labels
	// row; Done is for an open repeating task. A done keeps the task open, and the done row carries the next due day,
	// so the done row excludes the status row and the due date row.
	const pickable = (name: TaskField): boolean =>
		!shown.includes(name) &&
		(name !== "assignee" || owner === null) &&
		(name !== "labels" || labels.length > 0 || task.labels.length > 0) &&
		(name !== "done" || (open && task.repeatDays !== null && !shown.includes("status") && !shown.includes("dueDate"))) &&
		((name !== "status" && name !== "dueDate") || !done);
	const inputs: Record<TaskField, ReactNode> = {
		status: (
			<Text size="sm" pt={6}>
				{open ? "Closed" : "Open"}
			</Text>
		),
		title: <TextInput key={form.key("title")} size="sm" autoComplete="off" {...form.getInputProps("title")} />,
		body: <MarkdownEditor key={form.key("body")} {...form.getInputProps("body")} />,
		assignee: (
			// The members plus the current assignee, who may have left the space: else the select would show "Nobody".
			<UserSelect
				key={form.key("assigneeId")}
				size="sm"
				placeholder="Nobody"
				users={users.filter((user) => user.id === task.assigneeId || space.members.some((member) => member.userId === user.id))}
				clearable
				{...form.getInputProps("assigneeId")}
			/>
		),
		labels: (
			// The space's list plus the names the task carries in grey, so those can be kept or removed, not added.
			<LabelMultiSelect
				key={form.key("labels")}
				size="sm"
				space={space}
				names={[...new Set([...labels.map((label) => label.name), ...task.labels])]}
				{...form.getInputProps("labels")}
			/>
		),
		dueDate: (
			<Stack gap={4}>
				<DueDateFields
					size="sm"
					value={dueDate}
					onChange={(value) => {
						setDueDate(value);
						setDueDateError(undefined);
					}}
				/>
				{dueDateError !== undefined && (
					<Text size="xs" c="red">
						{dueDateError}
					</Text>
				)}
			</Stack>
		),
		done: (
			<Stack gap={4}>
				<Group gap="xs" wrap="nowrap">
					<Text size="sm">Next due</Text>
					<DayInput
						size="sm"
						w={140}
						value={nextDue}
						onChange={(day, invalid) => {
							setNextDue(day);
							setNextDueInvalid(invalid);
							setNextDueError(undefined);
						}}
					/>
				</Group>
				{nextDueError !== undefined && (
					<Text size="xs" c="red">
						{nextDueError}
					</Text>
				)}
			</Stack>
		),
	};
	return (
		<Paper withBorder p="md">
			<form
				onSubmit={(event) => {
					event.preventDefault();
					send();
				}}
			>
				<Stack>
					{/* The same key on both: the form holds the text, so a swap remounts the box with the current text. */}
					{formatting ? (
						<MarkdownEditor
							key={form.key("comment")}
							placeholder={COMMENT_PLACEHOLDER}
							minRows={3}
							{...form.getInputProps("comment")}
						/>
					) : (
						<Textarea
							key={form.key("comment")}
							placeholder={COMMENT_PLACEHOLDER}
							autosize
							minRows={3}
							{...form.getInputProps("comment")}
						/>
					)}
					{FIELDS.filter(({ name }) => shown.includes(name)).map(({ name, label }) => (
						<Group
							key={name}
							ref={(element) => {
								rowRefs.current[name] = element;
							}}
							gap="sm"
							wrap="nowrap"
							align="flex-start"
						>
							<Text size="xs" c="dimmed" w="5em" pt={8} style={{ flexShrink: 0 }}>
								{label}
							</Text>
							<Box flex={1} style={{ minWidth: 0 }}>
								{inputs[name]}
							</Box>
							<CloseButton mt={4} onClick={() => hide(name)} />
						</Group>
					))}
					<ErrorMessage error={updateMutation.error} />
					{/* One line whatever the width: "Update" keeps its size, and the notify names give way first. */}
					<Group justify="space-between" gap="xs" wrap="nowrap">
						{/* The menu and the notify picker look like actions, not buttons: only "Update" is solid, so the eye lands
						    on the one control that sends. */}
						<Group gap={4} miw={0} wrap="nowrap">
							<Menu position="top-start">
								<Menu.Target>
									<Button variant="subtle" color="gray" rightSection={<IconChevronDown size={14} />}>
										Change
									</Button>
								</Menu.Target>
								<Menu.Dropdown>
									{FIELDS.filter(({ name }) => pickable(name)).map(({ name, label, icon: Icon }) => (
										<Menu.Item
											key={name}
											leftSection={
												name === "status" && !open ? <IconCircleDot {...MENU_ICON_PROPS} /> : <Icon {...MENU_ICON_PROPS} />
											}
											onClick={() => show(name)}
										>
											{name === "status" ? (open ? "Close" : "Reopen") : label}
										</Menu.Item>
									))}
									{FIELDS.some(({ name }) => pickable(name)) && <Menu.Divider />}
									<Menu.Item
										leftSection={<IconMarkdown {...MENU_ICON_PROPS} />}
										rightSection={formatting ? <IconCheck size={14} /> : undefined}
										onClick={() => setFormatting((value) => !value)}
									>
										Formatting
									</Menu.Item>
									{moves && (
										<Menu.Item leftSection={<IconArrowRight {...MENU_ICON_PROPS} />} onClick={() => setMoveOpened(true)}>
											Move to another space…
										</Menu.Item>
									)}
								</Menu.Dropdown>
							</Menu>
							<NotifyUsersPicker space={space} value={notifyUserIds} onChange={setNotifyUserIds} />
						</Group>
						<Button type="submit" disabled={!dirty} loading={updateMutation.isPending} style={{ flexShrink: 0 }}>
							Update
						</Button>
					</Group>
				</Stack>
			</form>
			<MoveTaskModal task={task} space={space} opened={moveOpened} onClose={() => setMoveOpened(false)} />
		</Paper>
	);
}
