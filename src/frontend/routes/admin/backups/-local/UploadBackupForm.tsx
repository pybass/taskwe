import { Button, FileInput, Group, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { BackupUpload } from "#shared/backup.ts";
import { api } from "@/api/index.ts";
import { ErrorMessage } from "@/components/ErrorMessage.tsx";
import { zodResolver } from "@/utils/form.ts";

/** A file and the name to save it under, prefilled from the file's name so a `(1)` or a space can be fixed before sending. */
export function UploadBackupForm() {
	const uploadMutation = api.mutations.useUploadBackup();
	const [file, setFile] = useState<File | null>(null);
	const [fileError, setFileError] = useState<Error | null>(null);
	const form = useForm({ mode: "uncontrolled", initialValues: { name: "" }, validate: zodResolver(BackupUpload) });
	return (
		<form
			onSubmit={form.onSubmit((input) => {
				if (file === null) {
					setFileError(new Error("Choose a file"));
					return;
				}
				setFileError(null);
				uploadMutation.mutate(
					{ ...input, file },
					{
						onSuccess: (backup) => {
							notifications.show({ message: `Backup ${backup.name} uploaded`, color: "green" });
							setFile(null);
							form.reset();
						},
					},
				);
			})}
		>
			<Stack>
				<FileInput
					label="Backup file"
					accept=".db"
					value={file}
					onChange={(chosen) => {
						setFile(chosen);
						if (chosen !== null) form.setFieldValue("name", chosen.name);
					}}
					clearable
				/>
				<TextInput label="Save as" autoComplete="off" {...form.getInputProps("name")} />
				<Text size="sm" c="dimmed">
					Letters, digits, dots, hyphens, and underscores, ending in .db. The file is checked and listed; nothing is restored.
				</Text>
				<ErrorMessage error={fileError ?? uploadMutation.error} />
				<Group justify="flex-end">
					<Button type="submit" loading={uploadMutation.isPending}>
						Upload
					</Button>
				</Group>
			</Stack>
		</form>
	);
}
