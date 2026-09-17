import { Group, MultiSelect, type MultiSelectProps, Pill } from "@mantine/core";
import type { Space } from "#shared/space.ts";
import { api } from "@/api/index.ts";
import { LabelDot } from "@/components/LabelBadge.tsx";

type Props = Omit<MultiSelectProps, "data" | "renderOption" | "renderPill"> & {
	space: Space;
	/** The names to offer, in the order shown. A name the list does not have gets the grey dot. */
	names: string[];
};

/** A label picker: each option and each chosen pill carries the label's dot, as the badge does. */
export function LabelMultiSelect({ space, names, ...props }: Props) {
	const labels = api.cache.useSpaceLabels(space);
	const colorOf = (name: string) => labels.find((label) => label.name === name)?.color ?? null;
	return (
		<MultiSelect
			data={names}
			renderOption={({ option }) => (
				<Group gap={8} wrap="nowrap">
					<LabelDot color={colorOf(option.value)} />
					{option.label}
				</Group>
			)}
			renderPill={({ option, onRemove, disabled }) => (
				<Pill withRemoveButton={!props.readOnly} onRemove={onRemove} disabled={disabled}>
					<Group gap={6} wrap="nowrap" component="span" display="inline-flex">
						<LabelDot color={colorOf(String(option.value))} />
						{option.label}
					</Group>
				</Pill>
			)}
			{...props}
		/>
	);
}
