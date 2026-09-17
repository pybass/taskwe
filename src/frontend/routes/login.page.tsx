import { Button, Center, Paper, PasswordInput, Stack, TextInput, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { api } from "../api/index.ts";
import { ErrorMessage } from "../components/ErrorMessage.tsx";

export const Route = createFileRoute("/login")({
	// Where to go after login. A path within the site only, so a crafted URL cannot name another host.
	validateSearch: z.object({
		redirect: z
			.string()
			.regex(/^\/(?!\/)/)
			.optional(),
	}),
	component: LoginPage,
});

function LoginPage() {
	const { redirect } = Route.useSearch();
	const navigate = useNavigate();
	const loginMutation = api.mutations.useLogin();
	const form = useForm({ mode: "uncontrolled", initialValues: { username: "", password: "" } });

	return (
		<Center mih="100vh">
			<Paper
				component="form"
				onSubmit={form.onSubmit((values) => loginMutation.mutate(values, { onSuccess: () => navigate({ to: redirect ?? "/" }) }))}
				withBorder
				p="xl"
				w={360}
			>
				<Stack>
					<Title order={2}>taskwe</Title>
					<TextInput label="Username" autoComplete="username" autoFocus required {...form.getInputProps("username")} />
					<PasswordInput label="Password" autoComplete="current-password" required {...form.getInputProps("password")} />
					<ErrorMessage error={loginMutation.error} />
					<Button type="submit" loading={loginMutation.isPending}>
						Log in
					</Button>
				</Stack>
			</Paper>
		</Center>
	);
}
