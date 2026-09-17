import { Button, Checkbox, Group, Modal, PasswordInput, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { NewUser } from "#shared/user.ts";
import { api } from "@/api/index.ts";
import { ErrorMessage } from "@/components/ErrorMessage.tsx";
import { zodResolver } from "@/utils/form.ts";

type FormProps = { pending: boolean; error: Error | null; onSubmit: (input: NewUser) => void };

/** Mounted only while the modal is open, so every opening starts fresh. */
function NewUserForm({ pending, error, onSubmit }: FormProps) {
	const form = useForm({
		mode: "uncontrolled",
		initialValues: { username: "", password: "", admin: false },
		validate: zodResolver(NewUser),
	});
	return (
		<form onSubmit={form.onSubmit(onSubmit)}>
			<Stack>
				<TextInput label="Username" autoComplete="off" data-autofocus {...form.getInputProps("username")} />
				<PasswordInput label="Password" autoComplete="new-password" {...form.getInputProps("password")} />
				<Checkbox label="Admin" {...form.getInputProps("admin", { type: "checkbox" })} />
				<ErrorMessage error={error} />
				<Group justify="flex-end">
					<Button type="submit" loading={pending}>
						Create user
					</Button>
				</Group>
			</Stack>
		</form>
	);
}

export function NewUserButton() {
	const createMutation = api.mutations.useCreateUser();
	const [opened, setOpened] = useState(false);
	const close = () => {
		setOpened(false);
		createMutation.reset();
	};
	return (
		<>
			<Button onClick={() => setOpened(true)}>Add user</Button>
			<Modal opened={opened} onClose={close} title="New user">
				<NewUserForm
					pending={createMutation.isPending}
					error={createMutation.error}
					onSubmit={(input) =>
						createMutation.mutate(input, {
							onSuccess: (user) => {
								notifications.show({ message: `User ${user.username} created`, color: "green" });
								close();
							},
						})
					}
				/>
			</Modal>
		</>
	);
}
