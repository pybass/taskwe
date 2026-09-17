import { ActionIcon, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconPencil } from "@tabler/icons-react";
import { useState } from "react";
import { type Backup, BackupRename } from "#shared/backup.ts";
import { api } from "@/api/index.ts";
import { ErrorMessage } from "@/components/ErrorMessage.tsx";
import { zodResolver } from "@/utils/form.ts";

type FormProps = { backup: Backup; pending: boolean; error: Error | null; onSubmit: (input: BackupRename) => void };

/** Mounted only while the modal is open, so every opening starts fresh. */
function RenameBackupForm({ backup, pending, error, onSubmit }: FormProps) {
	const form = useForm({ mode: "uncontrolled", initialValues: { name: backup.name }, validate: zodResolver(BackupRename) });
	return (
		<form onSubmit={form.onSubmit(onSubmit)}>
			<Stack>
				<TextInput label="New name" autoComplete="off" data-autofocus {...form.getInputProps("name")} />
				<Text size="sm" c="dimmed">
					Letters, digits, dots, hyphens, and underscores, ending in .db.
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

/** A pencil icon that opens a modal to rename the backup. */
export function RenameBackupButton({ backup }: { backup: Backup }) {
	const renameMutation = api.mutations.useRenameBackup(backup.name);
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
			<Modal opened={opened} onClose={close} title={`Rename ${backup.name}`}>
				<RenameBackupForm
					backup={backup}
					pending={renameMutation.isPending}
					error={renameMutation.error}
					onSubmit={(input) =>
						renameMutation.mutate(input, {
							onSuccess: (renamed) => {
								notifications.show({ message: `Renamed to ${renamed.name}`, color: "green" });
								close();
							},
						})
					}
				/>
			</Modal>
		</>
	);
}
