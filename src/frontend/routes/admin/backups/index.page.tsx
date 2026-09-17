import { ActionIcon, Alert, Anchor, Button, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconCheck, IconDownload, IconRestore, IconTrash } from "@tabler/icons-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment } from "react";
import type { Backup, BackupInfo } from "#shared/backup.ts";
import { api } from "@/api/index.ts";
import { PageHeader } from "@/components/PageHeader.tsx";
import { formatDateTime } from "@/utils/format.ts";
import { RenameBackupButton } from "./-local/RenameBackupButton.tsx";
import { UploadBackupForm } from "./-local/UploadBackupForm.tsx";
import "./backups-page.css";

export const Route = createFileRoute("/_auth/_admin/admin/backups")({
	loader: ({ context }) => Promise.all([context.load(api.queries.listBackups()), context.load(api.queries.checkSchema())]),
	component: BackupsPage,
});

function Differences({ differences }: { differences: string[] }) {
	return (
		<Text ff="monospace" size="xs" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
			{differences.join("\n")}
		</Text>
	);
}

/** Whether the live database matches the build's schema; the differences, when any. */
function SchemaCheck() {
	const differences = useSuspenseQuery(api.queries.checkSchema()).data;
	if (differences.length === 0) {
		return (
			<Alert color="green" icon={<IconCheck size={18} />} py="xs">
				The database matches the schema of this build.
			</Alert>
		);
	}
	return (
		<Alert color="red" icon={<IconAlertTriangle size={18} />} title="The database differs from the schema of this build">
			<Differences differences={differences} />
		</Alert>
	);
}

/** "schema 1, matches the build", or "differs" as a link that opens the list of differences. */
function BackupSchema({ name, info }: { name: string; info: BackupInfo }) {
	if (info.schemaDifferences.length === 0) return <>schema {info.schemaVersion}, matches the build</>;
	return (
		<>
			schema {info.schemaVersion},{" "}
			<Anchor
				component="button"
				type="button"
				size="xs"
				c="red"
				onClick={() =>
					modals.open({
						title: `${name} differs from the schema of this build`,
						size: "lg",
						children: <Differences differences={info.schemaDifferences} />,
					})
				}
			>
				differs
			</Anchor>
		</>
	);
}

/** "1.2 MB": bytes at a size fit for a list. */
function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The spaces and last event cells of one row; one dimmed cell across both for a file with no info. */
function InfoCells({ info }: { info: Backup["info"] }) {
	if (info === null) {
		return (
			<Table.Td colSpan={2}>
				<Text size="sm" c="dimmed">
					Not a taskwe database
				</Text>
			</Table.Td>
		);
	}
	return (
		<>
			<Table.Td>
				<div className="backups-page-spaces">
					{info.spaces.map((space) => (
						<Fragment key={space.slug}>
							<Text size="sm">{space.name}</Text>
							<Text size="sm" c="dimmed" ta="right">
								{space.tasks}
							</Text>
						</Fragment>
					))}
				</div>
			</Table.Td>
			<Table.Td style={{ whiteSpace: "nowrap" }}>
				{info.lastEventAt === null ? <Text c="dimmed">no events</Text> : formatDateTime(info.lastEventAt)}
			</Table.Td>
		</>
	);
}

/** The backup files: each to rename, download, restore, or delete, a button to make one, and a form to upload one. */
function BackupsPage() {
	const navigate = useNavigate();
	const backups = useSuspenseQuery(api.queries.listBackups()).data;
	const createMutation = api.mutations.useCreateBackup();
	const restoreMutation = api.mutations.useRestoreBackup();
	const deleteMutation = api.mutations.useDeleteBackup();

	const confirmRestore = (name: string) =>
		modals.openConfirmModal({
			title: "Restore database",
			children: `Restore ${name}? A backup of the current database is made first. Every session ends: log in again with the passwords of that time.`,
			labels: { confirm: "Restore", cancel: "Cancel" },
			confirmProps: { color: "red" },
			// The restore ends this session, so the page leaves for login before the next request could 401.
			onConfirm: () =>
				restoreMutation.mutate(name, {
					onSuccess: (backup) => {
						notifications.show({ message: `Database restored. The previous one is ${backup.name}`, color: "green" });
						navigate({ to: "/login" });
					},
					onError: (error) => notifications.show({ message: error.message, color: "red" }),
				}),
		});
	const confirmDelete = (name: string) =>
		modals.openConfirmModal({
			title: "Delete backup",
			children: `Delete ${name}? The file is removed from the server.`,
			labels: { confirm: "Delete", cancel: "Cancel" },
			confirmProps: { color: "red" },
			onConfirm: () =>
				deleteMutation.mutate(name, {
					onSuccess: () => notifications.show({ message: `Backup ${name} deleted`, color: "green" }),
					onError: (error) => notifications.show({ message: error.message, color: "red" }),
				}),
		});

	return (
		<>
			<PageHeader
				title="Backups"
				bottomActions={
					<Button
						loading={createMutation.isPending}
						onClick={() =>
							createMutation.mutate(undefined, {
								onSuccess: (backup) => notifications.show({ message: `Backup ${backup.name} created`, color: "green" }),
								onError: (error) => notifications.show({ message: error.message, color: "red" }),
							})
						}
					>
						Create backup
					</Button>
				}
			/>
			<Stack gap="lg">
				<SchemaCheck />
				<Paper withBorder>
					{backups.length === 0 ? (
						<Text c="dimmed" p="md">
							No backups yet.
						</Text>
					) : (
						<Table highlightOnHover verticalSpacing="sm">
							<Table.Thead>
								<Table.Tr>
									<Table.Th>File</Table.Th>
									<Table.Th>Spaces</Table.Th>
									<Table.Th>Last event</Table.Th>
									<Table.Th />
								</Table.Tr>
							</Table.Thead>
							<Table.Tbody>
								{backups.map((backup) => (
									<Table.Tr key={backup.name}>
										<Table.Td style={{ whiteSpace: "nowrap" }}>
											<Text fw={500} ff="monospace" size="sm">
												{backup.name}
											</Text>
											<Text size="xs" c="dimmed">
												{formatSize(backup.size)}
												{backup.info === null ? null : (
													<>
														, <BackupSchema name={backup.name} info={backup.info} />
													</>
												)}
											</Text>
										</Table.Td>
										<InfoCells info={backup.info} />
										<Table.Td>
											<Group gap={4} justify="flex-end" wrap="nowrap">
												<RenameBackupButton backup={backup} />
												<ActionIcon component="a" href={`/api/admin/backups/${backup.name}`} variant="subtle" color="gray">
													<IconDownload size={18} />
												</ActionIcon>
												<ActionIcon
													variant="subtle"
													color="red"
													loading={restoreMutation.isPending && restoreMutation.variables === backup.name}
													onClick={() => confirmRestore(backup.name)}
												>
													<IconRestore size={18} />
												</ActionIcon>
												<ActionIcon
													variant="subtle"
													color="red"
													loading={deleteMutation.isPending && deleteMutation.variables === backup.name}
													onClick={() => confirmDelete(backup.name)}
												>
													<IconTrash size={18} />
												</ActionIcon>
											</Group>
										</Table.Td>
									</Table.Tr>
								))}
							</Table.Tbody>
						</Table>
					)}
				</Paper>
				<Stack gap="xs">
					<Title order={5}>Upload a backup</Title>
					<Paper withBorder p="md">
						<UploadBackupForm />
					</Paper>
				</Stack>
			</Stack>
		</>
	);
}
