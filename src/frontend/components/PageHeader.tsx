import { Breadcrumbs, Group, Stack, Title } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { CustomLink } from "./CustomLink.tsx";

type Props = {
	title?: ReactNode;
	/** The path inside the current context; home is the logo and a space is in the header, so neither is a crumb. A crumb without `to` is plain text, normally the current page. */
	breadcrumbs?: { label: string; to?: string }[];
	/** Right of the title. */
	bottomActions?: ReactNode;
};

export function PageHeader({ title, breadcrumbs, bottomActions }: Props) {
	const hasBottomRow = title !== undefined || bottomActions !== undefined;
	return (
		<Stack gap="xs" mb="md">
			{breadcrumbs && (
				<Breadcrumbs separator={<IconChevronRight size={14} />}>
					{breadcrumbs.map((item) =>
						item.to === undefined ? (
							<span key={item.label}>{item.label}</span>
						) : (
							<CustomLink key={item.label} to={item.to} underline="hover" c="pine">
								{item.label}
							</CustomLink>
						),
					)}
				</Breadcrumbs>
			)}
			{hasBottomRow && (
				<Group justify={title === undefined ? "flex-end" : "space-between"}>
					{title !== undefined && <Title order={3}>{title}</Title>}
					{bottomActions}
				</Group>
			)}
		</Stack>
	);
}
