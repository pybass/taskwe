import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { type ReactNode, useState } from "react";
import type { Label, NewLabel } from "#shared/label.ts";
import { api } from "@/api/index.ts";
import { LabelModal } from "./LabelModal.tsx";

type Props = {
	/** The list to add to: a space's, or the global one for null. */
	spaceId: number | null;
	labels: Label[];
	/** With `initial`, a small button reading `children` whose modal starts with those values: overriding a global label. */
	initial?: Partial<NewLabel>;
	children?: ReactNode;
};

export function NewLabelButton({ spaceId, labels, initial, children }: Props) {
	const createMutation = api.mutations.useCreateLabel(spaceId);
	const [opened, setOpened] = useState(false);
	const close = () => {
		setOpened(false);
		createMutation.reset();
	};
	return (
		<>
			{initial === undefined ? (
				<Button onClick={() => setOpened(true)}>New label</Button>
			) : (
				<Button size="compact-xs" variant="light" onClick={() => setOpened(true)}>
					{children}
				</Button>
			)}
			<LabelModal
				labels={labels}
				initial={initial}
				opened={opened}
				onClose={close}
				pending={createMutation.isPending}
				error={createMutation.error}
				onSubmit={(input) =>
					createMutation.mutate(input, {
						onSuccess: (label) => {
							notifications.show({ message: `Label "${label.name}" created`, color: "green" });
							close();
						},
					})
				}
			/>
		</>
	);
}
