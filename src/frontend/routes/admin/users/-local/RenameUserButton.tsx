import { ActionIcon, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconPencil } from "@tabler/icons-react";
import { useState } from "react";
import { type User, UserRename } from "#shared/user.ts";
import { api } from "@/api/index.ts";
import { ErrorMessage } from "@/components/ErrorMessage.tsx";
import { zodResolver } from "@/utils/form.ts";

type FormProps = { user: User; pending: boolean; error: Error | null; onSubmit: (input: UserRename) => void };

/** Mounted only while the modal is open, so every opening starts fresh. */
function RenameUserForm({ user, pending, error, onSubmit }: FormProps) {
	const form = useForm({ mode: "uncontrolled", initialValues: { username: user.username }, validate: zodResolver(UserRename) });
	return (
		<form onSubmit={form.onSubmit(onSubmit)}>
			<Stack>
				<TextInput label="New username" autoComplete="off" data-autofocus {...form.getInputProps("username")} />
				<Text size="sm" c="dimmed">
					The personal space is renamed with the user, so its URL changes.
				</Text>
				<ErrorMessage error={error} />
				<Group justify="flex-end">
					<Button type="submit" loading={pending}>
						Rename
					</Button>
				</Group>
			</Stack>
		</form>
	);
}

/** A pencil icon that opens a modal to rename the user. */
export function RenameUserButton({ user }: { user: User }) {
	const renameMutation = api.mutations.useRenameUser(user.id);
	const [opened, setOpened] = useState(false);
	const close = () => {
		setOpened(false);
		renameMutation.reset();
	};
	return (
		<>
			<ActionIcon variant="subtle" color="gray" onClick={() => setOpened(true)}>
				<IconPencil size={18} />
			</ActionIcon>
			<Modal opened={opened} onClose={close} title={`Rename ${user.username}`}>
				<RenameUserForm
					user={user}
					pending={renameMutation.isPending}
					error={renameMutation.error}
					onSubmit={(input) =>
						renameMutation.mutate(input, {
							onSuccess: (renamed) => {
								notifications.show({ message: `${user.username} renamed to ${renamed.username}`, color: "green" });
								close();
							},
						})
					}
				/>
			</Modal>
		</>
	);
}
