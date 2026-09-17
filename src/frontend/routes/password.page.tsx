import { Button, Group, Paper, PasswordInput, Stack } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PasswordChange } from "#shared/user.ts";
import { api } from "@/api/index.ts";
import { ErrorMessage } from "@/components/ErrorMessage.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
import { zodResolver } from "@/utils/form.ts";

export const Route = createFileRoute("/_auth/password")({ component: ChangePasswordPage });

function ChangePasswordPage() {
	const navigate = useNavigate();
	const changeMutation = api.mutations.useChangePassword();
	const form = useForm({
		mode: "uncontrolled",
		initialValues: { currentPassword: "", password: "" },
		validate: zodResolver(PasswordChange),
	});
	return (
		<>
			<PageHeader breadcrumbs={[{ label: "Change password" }]} />
			<Paper withBorder p="md">
				<form
					onSubmit={form.onSubmit((values) =>
						changeMutation.mutate(values, {
							onSuccess: () => {
								notifications.show({ message: "Password changed. Your other sessions were logged out.", color: "green" });
								navigate({ to: "/" });
							},
						}),
					)}
				>
					<Stack>
						<PasswordInput
							label="Current password"
							autoComplete="current-password"
							autoFocus
							{...form.getInputProps("currentPassword")}
						/>
						<PasswordInput label="New password" autoComplete="new-password" {...form.getInputProps("password")} />
						<ErrorMessage error={changeMutation.error} />
						<Group justify="flex-end">
							<Button type="submit" loading={changeMutation.isPending}>
								Change password
							</Button>
						</Group>
					</Stack>
				</form>
			</Paper>
		</>
	);
}
