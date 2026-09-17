import { Button, ColorInput, Group, Modal, NumberInput, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { type Label, NewLabel } from "#shared/label.ts";
import { ErrorMessage } from "@/components/ErrorMessage.tsx";
import { zodResolver } from "@/utils/form.ts";

// GitHub's default label colors, as the swatches of the color field.
const PALETTE: readonly [string, ...string[]] = [
	"#d73a4a",
	"#0075ca",
	"#0e8a16",
	"#fbca04",
	"#7057ff",
	"#e4e669",
	"#008672",
	"#1d76db",
	"#b60205",
	"#d876e3",
	"#a2eeef",
	"#e99695",
	"#f9d0c4",
	"#5319e7",
	"#bfd4f2",
	"#cfd3d7",
];

type Props = {
	/** The list the label is or will be in, for the color and position suggestions. */
	labels: Label[];
	/** The label to edit; none for a new one. */
	label?: Label;
	/** What a new label starts with: the global label being overridden. */
	initial?: Partial<NewLabel>;
	opened: boolean;
	onClose: () => void;
	pending: boolean;
	error: Error | null;
	onSubmit: (input: NewLabel) => void;
};

/** The fields of a label, mounted only while the modal is open, so every opening starts fresh. */
function LabelForm({ labels, label, initial, pending, error, onSubmit }: Omit<Props, "opened" | "onClose">) {
	// A new label starts on the first palette color the list does not use yet, so the labels differ at a glance, and
	// after the last position of the list.
	const suggestedColor = PALETTE.find((color) => !labels.some((other) => other.color === color)) ?? PALETTE[0];
	const suggestedPosition = Math.max(0, ...labels.map((other) => other.position)) + 1;
	const form = useForm({
		mode: "uncontrolled",
		initialValues: {
			name: label?.name ?? initial?.name ?? "",
			color: label?.color ?? initial?.color ?? suggestedColor,
			position: label?.position ?? initial?.position ?? suggestedPosition,
		},
		validate: zodResolver(NewLabel),
	});
	const colorProps = form.getInputProps("color");
	return (
		<form onSubmit={form.onSubmit(onSubmit)}>
			<Stack>
				<TextInput label="Name" autoComplete="off" data-autofocus {...form.getInputProps("name")} />
				{/* Lowercased as typed: the schema takes lowercase hex, which is what the picker and the swatches give. */}
				<ColorInput
					label="Color"
					format="hex"
					swatches={[...PALETTE]}
					{...colorProps}
					onChange={(value: string) => colorProps.onChange(value.toLowerCase())}
				/>
				<NumberInput
					label="Position"
					description="Smaller comes first; ties sort by name. A space's labels and the global ones share one line."
					allowDecimal={false}
					{...form.getInputProps("position")}
				/>
				<ErrorMessage error={error} />
				<Group justify="flex-end">
					<Button type="submit" loading={pending}>
						{label === undefined ? "Create label" : "Save"}
					</Button>
				</Group>
			</Stack>
		</form>
	);
}

/** The modal to create or edit a label. The button owns the write: it gets the values and does the toast and the close. */
export function LabelModal({ opened, onClose, ...formProps }: Props) {
	return (
		<Modal opened={opened} onClose={onClose} title={formProps.label === undefined ? "New label" : "Edit label"}>
			<LabelForm {...formProps} />
		</Modal>
	);
}
