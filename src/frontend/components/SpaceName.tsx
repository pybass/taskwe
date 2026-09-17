import { Text } from "@mantine/core";
import { IconFolder } from "@tabler/icons-react";
import type { Space } from "#shared/space.ts";
import "./space-name.css";

/**
 * A small folder icon, then the space name in medium weight; the counterpart of `Username`, built the same way so the
 * two marks match in a sentence. The folder is the app's glyph for a space, as in the admin menu. The icon stays
 * dimmed: the weight makes the name easy to spot, and the filled primary mark is kept for the assignee. The mark is
 * plain inline text that never wraps inside, so a comma after it stays on its line and a parent can ellipsize it.
 */
export function SpaceName({ space }: { space: Space }) {
	return (
		<Text span inherit fw={500} style={{ whiteSpace: "nowrap" }}>
			<IconFolder size="1.1em" stroke={2} className="space-name-icon" />
			{space.name}
		</Text>
	);
}
