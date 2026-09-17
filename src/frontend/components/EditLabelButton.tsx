import { ActionIcon } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPencil } from "@tabler/icons-react";
import { useState } from "react";
import type { Label } from "#shared/label.ts";
import { api } from "@/api/index.ts";
import { LabelModal } from "./LabelModal.tsx";

/** `labels` is the list the label is in, for the modal's color suggestion. */
export function EditLabelButton({ label, labels }: { label: Label; labels: Label[] }) {
	const updateMutation = api.mutations.useUpdateLabel(label.id);
	const [opened, setOpened] = useState(false);
	const close = () => {
		setOpened(false);
		updateMutation.reset();
	};
	return (
		<>
			<ActionIcon variant="subtle" color="gray" onClick={() => setOpened(true)}>
				<IconPencil size={18} />
			</ActionIcon>
			<LabelModal
				labels={labels}
				label={label}
				opened={opened}
				onClose={close}
				pending={updateMutation.isPending}
				error={updateMutation.error}
				onSubmit={(input) =>
					updateMutation.mutate(input, {
						onSuccess: () => {
							notifications.show({ message: "Label saved", color: "green" });
							close();
						},
					})
				}
			/>
		</>
	);
}
