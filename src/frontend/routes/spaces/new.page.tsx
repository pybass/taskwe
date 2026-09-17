import { Button, Group, Paper, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { NewSpace } from "#shared/space.ts";
import { api } from "@/api/index.ts";
import { ErrorMessage } from "@/components/ErrorMessage.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
import { UserMultiSelect } from "@/components/UserSelect.tsx";
import { zodResolver } from "@/utils/form.ts";

export const Route = createFileRoute("/_auth/spaces/new")({ component: NewSpacePage });

/** A suggestion in the slug format; the cut to 32 comes before the trim so the result never ends with a dash. */
function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.slice(0, 32)
		.replace(/^-+|-+$/g, "");
}

function NewSpacePage() {
	const navigate = useNavigate();
	const users = api.cache.useUsers();
	const currentUser = api.cache.useCurrentUser();
	const createMutation = api.mutations.useCreateSpace();
	// A select holds strings, so member ids are strings here and numbers on submit; the schema check skips them.
	const form = useForm({
		mode: "uncontrolled",
		initialValues: { name: "", slug: "", members: [] as string[] },
		validate: zodResolver(NewSpace.omit({ members: true })),
	});
	// The slug follows the name until it is edited by hand.
	form.watch("name", ({ previousValue, value }) => {
		if (form.getValues().slug === slugify(previousValue)) form.setFieldValue("slug", slugify(value));
	});
	return (
		<>
			<PageHeader breadcrumbs={[{ label: "New space" }]} />
			<Paper withBorder p="md">
				<form
					onSubmit={form.onSubmit((values) =>
						createMutation.mutate(
							// Invited users start as editors; roles are changed on the members page.
							{ ...values, members: values.members.map((id) => ({ userId: Number(id), role: "editor" as const })) },
							{
								onSuccess: () => {
									notifications.show({ message: "Space created", color: "green" });
									navigate({ to: "/" });
								},
							},
						),
					)}
				>
					<Stack>
						<TextInput label="Name" autoComplete="off" autoFocus {...form.getInputProps("name")} />
						{/* The key remounts the input when the watch above sets the slug; an uncontrolled input ignores a new defaultValue. */}
						<TextInput label="Slug" autoComplete="off" key={form.key("slug")} {...form.getInputProps("slug")} />
						<UserMultiSelect
							label="Members"
							description="You are the manager either way; the others start as editors."
							users={users.filter((user) => user.id !== currentUser.id)}
							{...form.getInputProps("members")}
						/>
						<ErrorMessage error={createMutation.error} />
						<Group justify="flex-end">
							<Button type="submit" loading={createMutation.isPending}>
								Create space
							</Button>
						</Group>
					</Stack>
				</form>
			</Paper>
		</>
	);
}
