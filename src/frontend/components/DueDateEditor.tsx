import { Anchor, CloseButton, Group, Input, type MantineSize, NumberInput, Popover, Stack, Text } from "@mantine/core";
import { IconCalendar, IconRepeat } from "@tabler/icons-react";
import { useState } from "react";
import { RepeatDays } from "#shared/task.ts";
import { addDays, formatDay, formatRepeat, today } from "@/utils/format.ts";
import { DayInput } from "./DayInput.tsx";

/**
 * A due date being edited: the day, `invalidDay` when the field holds text that is not a day, so the null must not be
 * sent, and the repeat days as the input holds them, or null when the task does not repeat.
 */
export type DueDateValue = { dueDate: string | null; invalidDay: boolean; repeatDays: number | string | null };

type FieldsProps = {
	value: DueDateValue;
	onChange: (value: DueDateValue) => void;
	size?: MantineSize;
	autoFocus?: boolean;
};

/** The day with its repeat, folded away behind "Repeat…" since most tasks never repeat. */
export function DueDateFields({ value, onChange, size, autoFocus }: FieldsProps) {
	// The day the repeat days filled in, so a change of the days moves it; a day the user typed stays.
	const [suggestedDay, setSuggestedDay] = useState<string | null>(null);
	const changeDays = (repeatDays: number | string) => {
		const days = RepeatDays.safeParse(repeatDays);
		if (days.success && (value.dueDate === null || value.dueDate === suggestedDay)) {
			const day = addDays(today(), days.data);
			setSuggestedDay(day);
			onChange({ dueDate: day, invalidDay: false, repeatDays });
		} else onChange({ ...value, repeatDays });
	};
	return (
		<Stack gap="xs">
			<DayInput
				size={size}
				value={value.dueDate}
				onChange={(dueDate, invalidDay) => onChange({ ...value, dueDate, invalidDay })}
				autoFocus={autoFocus}
			/>
			{value.repeatDays === null ? (
				<Anchor
					component="button"
					type="button"
					size={size}
					c="dimmed"
					style={{ alignSelf: "flex-start" }}
					onClick={() => changeDays(30)}
				>
					Repeat…
				</Anchor>
			) : (
				<Group gap="xs" wrap="nowrap">
					<Text size={size}>Every</Text>
					<NumberInput size={size} min={1} w={80} value={value.repeatDays} onChange={changeDays} autoFocus />
					<Text size={size}>days</Text>
					<CloseButton size={size} onClick={() => onChange({ ...value, repeatDays: null })} />
				</Group>
			)}
		</Stack>
	);
}

/** The value as one line: "04.09.2026 · every 30 days", "None" without a day. */
function DueDateSummary({ dueDate, repeatDays }: { dueDate: string | null; repeatDays: number | null }) {
	return (
		<>
			{dueDate === null ? (
				<Text span inherit c="dimmed">
					None
				</Text>
			) : (
				formatDay(dueDate)
			)}
			{repeatDays !== null && (
				<Text span inherit c="dimmed">
					{" · "}
					<IconRepeat size="1em" style={{ verticalAlign: "-0.15em" }} /> {formatRepeat(repeatDays)}
				</Text>
			)}
		</>
	);
}

type FieldProps = {
	value: DueDateValue;
	onChange: (value: DueDateValue) => void;
	error?: string;
};

/** A form field that opens the due date editor in a popover. Every change applies at once: there is no Save. */
export function DueDateField({ value, onChange, error }: FieldProps) {
	const [opened, setOpened] = useState(false);
	const days = value.repeatDays === null ? null : RepeatDays.safeParse(value.repeatDays);
	return (
		// hideDetached off: on Android the keyboard shrinks the viewport, the target reads as clipped, and the dropdown
		// with the focused input would get display: none, which closes the keyboard at once.
		<Popover opened={opened} onChange={setOpened} position="bottom-start" width={260} shadow="md" trapFocus hideDetached={false}>
			<Popover.Target>
				<Input.Wrapper label="Due date" error={error}>
					<Input
						component="button"
						type="button"
						pointer
						leftSection={<IconCalendar size={16} />}
						error={error !== undefined}
						onClick={() => setOpened((open) => !open)}
					>
						<DueDateSummary dueDate={value.dueDate} repeatDays={days?.success ? days.data : null} />
					</Input>
				</Input.Wrapper>
			</Popover.Target>
			<Popover.Dropdown>
				<DueDateFields value={value} onChange={onChange} autoFocus />
			</Popover.Dropdown>
		</Popover>
	);
}
