import { Text } from "@mantine/core";
import { createFileRoute, notFound, rootRouteId } from "@tanstack/react-router";
import { hasSpaceRole } from "#shared/space.ts";
import { api } from "@/api/index.ts";
import { CustomLink } from "@/components/CustomLink.tsx";
import { LabelTable } from "@/components/LabelTable.tsx";
import { NewLabelButton } from "@/components/NewLabelButton.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";

export const Route = createFileRoute("/_auth/s/$slug/labels")({
	// A manager's page: anyone else gets not found, as for a slug outside their spaces, so the URL tells them nothing.
	loader: async ({ context, params }) => {
		const space = (await context.load(api.queries.listSpaces())).find((space) => space.slug === params.slug);
		if (space === undefined || !hasSpaceRole(context.currentUser, space, "manager")) throw notFound({ routeId: rootRouteId });
	},
	component: LabelsPage,
});

/** The space's list to manage: its own labels and the global ones in one order. */
function LabelsPage() {
	const { slug } = Route.useParams();
	const space = api.cache.useSpace(slug);
	const labels = api.cache.useSpaceLabels(space);
	const isAdmin = api.cache.useCurrentUser().admin;
	return (
		<>
			<PageHeader title="Labels" bottomActions={<NewLabelButton spaceId={space.id} labels={labels} />} />
			<Text size="sm" c="dimmed" mb="md">
				The labels a task here may carry, in their order: smaller position first, ties by name. A global label is the admin's
				{isAdmin ? (
					<>
						, on the <CustomLink to="/admin/labels">global labels page</CustomLink>
					</>
				) : null}
				; override its color or place with a label of the same name here.
			</Text>
			<LabelTable spaceId={space.id} labels={labels} />
		</>
	);
}
