import { Button, Group, Paper, Select, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import type { Space } from "#shared/space.ts";
import { NewTask, RepeatDays } from "#shared/task.ts";
import { api } from "@/api/index.ts";
import { DueDateField, type DueDateValue } from "@/components/DueDateEditor.tsx";
import { ErrorMessage } from "@/components/ErrorMessage.tsx";
import { LabelMultiSelect } from "@/components/LabelMultiSelect.tsx";
import { MarkdownEditor } from "@/components/MarkdownEditor.tsx";
import { NotifyUsersPicker } from "@/components/NotifyUsersPicker.tsx";
import { SpaceName } from "@/components/SpaceName.tsx";
import { UserSelect } from "@/components/UserSelect.tsx";
import { zodResolver } from "@/utils/form.ts";

type Props = {
	/** The spaces to offer, in the order shown. */
	spaces: Space[];
	space: Space;
	onSpaceChange: (space: Space) => void;
	submitLabel: string;
	pending: boolean;
	error: Error | null;
	onSubmit: (input: NewTask) => void;
};

/** The default assignee: the owner in a personal space, nobody in a shared one. A select holds strings. */
function defaultAssigneeId(space: Space): string | null {
	return space.ownerId === null ? null : String(space.ownerId);
}

/**
 * The fields of a new task, the space first. Changing the space resets what belongs to it, the labels, the assignee,
 * and the notify list, and keeps the rest. The page owns the write: it gets the values and does the navigation and
 * the toast.
 */
export function TaskForm({ spaces, space, onSpaceChange, submitLabel, pending, error, onSubmit }: Props) {
	const users = api.cache.useUsers();
	const currentUser = api.cache.useCurrentUser();
	const labels = api.cache.useSpaceLabels(space);
	// A personal space's task is always the owner's, so the field is not shown.
	const owner = space.ownerId;
	// The assignee id is a string here and a number on submit. The schema check skips it and the due date, which lives
	// outside the form: its editor is controlled.
	const form = useForm({
		mode: "uncontrolled",
		initialValues: { title: "", body: "", assigneeId: defaultAssigneeId(space), labels: [] as string[] },
		validate: zodResolver(NewTask.omit({ dueDate: true, assigneeId: true, repeatDays: true })),
	});
	const [dueDate, setDueDate] = useState<DueDateValue>({ dueDate: null, invalidDay: false, repeatDays: null });
	const [dueDateError, setDueDateError] = useState<string | undefined>(undefined);
	// Picking an assignee ticks them; the user may untick. Never the user: the picker does not show them.
	const [notifyUserIds, setNotifyUserIds] = useState<number[]>([]);
	form.watch("assigneeId", ({ value }) => {
		if (value === null || Number(value) === currentUser.id) return;
		setNotifyUserIds((userIds) => (userIds.includes(Number(value)) ? userIds : [...userIds, Number(value)]));
	});
	return (
		<Paper withBorder p="md">
			<form
				onSubmit={form.onSubmit((values) => {
					if (dueDate.invalidDay) {
						setDueDateError("Use dd.mm.yyyy for the due date");
						return;
					}
					const repeatDays = dueDate.repeatDays === null ? null : RepeatDays.safeParse(dueDate.repeatDays);
					if (repeatDays !== null && !repeatDays.success) {
						setDueDateError("Repeat every a whole number of days, 1 or more");
						return;
					}
					onSubmit({
						...values,
						dueDate: dueDate.dueDate,
						assigneeId: values.assigneeId === null ? null : Number(values.assigneeId),
						repeatDays: repeatDays === null ? null : repeatDays.data,
						notifyUserIds,
					});
				})}
			>
				<Stack>
					<Select
						label="Space"
						data={spaces.map((candidate) => ({ value: String(candidate.id), label: candidate.name }))}
						renderOption={({ option }) => {
							const candidate = spaces.find((candidate) => String(candidate.id) === option.value);
							return candidate === undefined ? option.label : <SpaceName space={candidate} />;
						}}
						value={String(space.id)}
						onChange={(value) => {
							const next = spaces.find((candidate) => String(candidate.id) === value);
							if (next === undefined || next.id === space.id) return;
							onSpaceChange(next);
							form.setFieldValue("labels", []);
							form.setFieldValue("assigneeId", defaultAssigneeId(next));
							setNotifyUserIds([]);
						}}
						allowDeselect={false}
						searchable
					/>
					<TextInput label="Title" autoComplete="off" autoFocus {...form.getInputProps("title")} />
					<MarkdownEditor label="Description" {...form.getInputProps("body")} />
					{labels.length > 0 && (
						<LabelMultiSelect
							key={form.key("labels")}
							label="Labels"
							space={space}
							names={labels.map((label) => label.name)}
							{...form.getInputProps("labels")}
						/>
					)}
					{owner === null && (
						<UserSelect
							key={form.key("assigneeId")}
							label="Assignee"
							placeholder="Nobody"
							users={users.filter((user) => space.members.some((member) => member.userId === user.id))}
							clearable
							{...form.getInputProps("assigneeId")}
						/>
					)}
					<DueDateField
						value={dueDate}
						onChange={(value) => {
							setDueDate(value);
							setDueDateError(undefined);
						}}
						error={dueDateError}
					/>
					<ErrorMessage error={error} />
					<Group gap="xs" wrap="nowrap">
						<NotifyUsersPicker space={space} value={notifyUserIds} onChange={setNotifyUserIds} />
						<Button type="submit" loading={pending} ml="auto" style={{ flexShrink: 0 }}>
							{submitLabel}
						</Button>
					</Group>
				</Stack>
			</form>
		</Paper>
	);
}
