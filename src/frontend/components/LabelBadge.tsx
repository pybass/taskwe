import { Badge, Box, Group } from "@mantine/core";
import { Fragment } from "react";
import type { Label } from "#shared/label.ts";
import type { Space } from "#shared/space.ts";
import { api } from "@/api/index.ts";

/**
 * A dot in the label's color before its name in a thin gray pill, so any color stays readable and quiet. A span: it
 * sits in running text. A bare name, one the space's list does not have, is the same pill in grey.
 */
export function LabelBadge({ label }: { label: Pick<Label, "name" | "color"> | string }) {
	const unknown = typeof label === "string";
	return (
		<Badge
			component="span"
			variant="default"
			size="sm"
			radius="xl"
			tt="none"
			fw={500}
			c={unknown ? "dimmed" : undefined}
			leftSection={<LabelDot color={unknown ? null : label.color} />}
		>
			{unknown ? label : label.name}
		</Badge>
	);
}

/** The dot of a label's color; grey for a bare name (`null`). */
export function LabelDot({ color }: { color: string | null }) {
	return (
		<Box
			component="span"
			display="inline-block"
			w={8}
			h={8}
			bdrs="50%"
			flex="0 0 auto"
			bg={color ?? "var(--mantine-color-gray-4)"}
		/>
	);
}

/**
 * The badges of a task: the ones the space's list has in its order, then the other names sorted in grey; nothing
 * when none. With `inline` they come without a wrapper, so they flow in the parent's line like words, a space before
 * each, and wrap one by one.
 */
export function TaskLabels({ space, labels, inline = false }: { space: Space; labels: string[]; inline?: boolean }) {
	const known = api.cache.useSpaceLabels(space).filter((label) => labels.includes(label.name));
	if (labels.length === 0) return null;
	const others = labels.filter((name) => !known.some((label) => label.name === name)).sort();
	// The space is what separates the badges in running text; a flex container drops whitespace-only text, so the
	// Group below is unaffected by it.
	const badges = (
		<>
			{known.map((label) => (
				<Fragment key={label.name}>
					{" "}
					<LabelBadge label={label} />
				</Fragment>
			))}
			{others.map((name) => (
				<Fragment key={name}>
					{" "}
					<LabelBadge label={name} />
				</Fragment>
			))}
		</>
	);
	return inline ? badges : <Group gap={4}>{badges}</Group>;
}

/**
 * Label names from an event, in running text: a name the space's list has gets its badge, any other the grey one,
 * since an event keeps the name of the moment.
 */
export function LabelNames({ space, names }: { space: Space; names: string[] }) {
	const known = api.cache.useSpaceLabels(space);
	return (
		<>
			{names.map((name, index) => (
				<span key={name}>
					{index > 0 && ", "}
					<LabelBadge label={known.find((label) => label.name === name) ?? name} />
				</span>
			))}
		</>
	);
}
