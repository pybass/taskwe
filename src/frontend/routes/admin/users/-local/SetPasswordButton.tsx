import { ActionIcon, Button, Group, Modal, PasswordInput, Stack, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconKey } from "@tabler/icons-react";
import { useState } from "react";
import { PasswordSet, type User } from "#shared/user.ts";
import { api } from "@/api/index.ts";
import { ErrorMessage } from "@/components/ErrorMessage.tsx";
import { zodResolver } from "@/utils/form.ts";

type FormProps = { pending: boolean; error: Error | null; onSubmit: (input: PasswordSet) => void };

/** Mounted only while the modal is open, so every opening starts fresh. */
function SetPasswordForm({ pending, error, onSubmit }: FormProps) {
	const form = useForm({ mode: "uncontrolled", initialValues: { password: "" }, validate: zodResolver(PasswordSet) });
	return (
		<form onSubmit={form.onSubmit(onSubmit)}>
			<Stack>
				<PasswordInput label="New password" autoComplete="new-password" data-autofocus {...form.getInputProps("password")} />
				<Text size="sm" c="dimmed">
					The user is logged out everywhere.
				</Text>
				<ErrorMessage error={error} />
				<Group justify="flex-end">
					<Button type="submit" loading={pending}>
						Set password
					</Button>
				</Group>
			</Stack>
		</form>
	);
}

/** A key icon that opens a modal to set the user's password without the current one. */
export function SetPasswordButton({ user }: { user: User }) {
	const setMutation = api.mutations.useSetPassword(user.id);
	const [opened, setOpened] = useState(false);
	const close = () => {
		setOpened(false);
		setMutation.reset();
	};
	return (
		<>
			<ActionIcon variant="subtle" color="gray" onClick={() => setOpened(true)}>
				<IconKey size={18} />
			</ActionIcon>
			<Modal opened={opened} onClose={close} title={`Set password for ${user.username}`}>
				<SetPasswordForm
					pending={setMutation.isPending}
					error={setMutation.error}
					onSubmit={(input) =>
						setMutation.mutate(input, {
							onSuccess: () => {
								notifications.show({ message: `Password of ${user.username} set`, color: "green" });
								close();
							},
						})
					}
				/>
			</Modal>
		</>
	);
}
