import { Text } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/api/index.ts";
import { LabelTable } from "@/components/LabelTable.tsx";
import { NewLabelButton } from "@/components/NewLabelButton.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";

export const Route = createFileRoute("/_auth/_admin/admin/labels")({ component: GlobalLabelsPage });

/** The global labels, the ones every space's tasks may carry, in their order. */
function GlobalLabelsPage() {
	const labels = api.cache.useGlobalLabels();
	return (
		<>
			<PageHeader title="Global labels" bottomActions={<NewLabelButton spaceId={null} labels={labels} />} />
			<Text size="sm" c="dimmed" mb="md">
				For every space, on one line with the space's own labels: smaller position first, ties by name. A space overrides one by
				creating a label of the same name.
			</Text>
			<LabelTable spaceId={null} labels={labels} />
		</>
	);
}
