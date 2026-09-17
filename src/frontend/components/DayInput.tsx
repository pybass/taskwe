import { TextInput, type TextInputProps } from "@mantine/core";
import { useState } from "react";
import { formatDay, parseTypedDay } from "@/utils/format.ts";

type Props = Omit<TextInputProps, "value" | "onChange" | "error"> & {
	value: string | null;
	/**
	 * A "YYYY-MM-DD" day, or null for an empty or unreadable field; `invalid` tells the two apart, so a form does not
	 * send the null.
	 */
	onChange: (day: string | null, invalid: boolean) => void;
};

/** A typed "dd.mm.yyyy" day. The value is null while the text is not a day; the field says so after leaving it. */
export function DayInput({ value, onChange, onBlur, ...props }: Props) {
	const [text, setText] = useState(value === null ? "" : formatDay(value));
	const [synced, setSynced] = useState(value);
	const [touched, setTouched] = useState(false);
	// A value set from outside, such as the day the repeat days suggest, replaces the text.
	if (value !== synced) {
		setSynced(value);
		if (parseTypedDay(text) !== value) setText(value === null ? "" : formatDay(value));
	}
	const invalid = text.trim() !== "" && parseTypedDay(text) === null;
	return (
		<TextInput
			placeholder="dd.mm.yyyy"
			autoComplete="off"
			{...props}
			value={text}
			onChange={(event) => {
				const next = event.currentTarget.value;
				setText(next);
				const day = parseTypedDay(next);
				setSynced(day);
				onChange(day, day === null && next.trim() !== "");
			}}
			onBlur={(event) => {
				setTouched(true);
				const day = parseTypedDay(text);
				if (day !== null) setText(formatDay(day));
				onBlur?.(event);
			}}
			error={touched && invalid ? "Use dd.mm.yyyy" : undefined}
		/>
	);
}
