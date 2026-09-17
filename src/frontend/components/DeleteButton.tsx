import { ActionIcon, Button, type MantineSize } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconTrash } from "@tabler/icons-react";

type Props = {
	title: string;
	message: string;
	onConfirm: () => void;
	/** With a label the button is red text after the icon instead of the icon alone. */
	label?: string;
	/** The button's size; the default fits a table row, "xs" a line of text or a row of small controls. */
	size?: MantineSize;
};

/** A trash icon that asks in a confirm modal before calling `onConfirm`. */
export function DeleteButton({ title, message, onConfirm, label, size }: Props) {
	const confirm = () =>
		modals.openConfirmModal({
			title,
			children: message,
			labels: { confirm: "Delete", cancel: "Cancel" },
			confirmProps: { color: "red" },
			onConfirm,
		});
	if (label !== undefined) {
		return (
			<Button
				variant="subtle"
				color="red"
				size={size}
				leftSection={<IconTrash size={size === "xs" ? 14 : 16} />}
				onClick={confirm}
			>
				{label}
			</Button>
		);
	}
	return (
		<ActionIcon variant="subtle" color="red" size={size} onClick={confirm}>
			<IconTrash size={size === "xs" ? 14 : 18} />
		</ActionIcon>
	);
}
