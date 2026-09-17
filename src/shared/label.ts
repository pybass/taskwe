// Reference file: a label, global or of a space, the bodies that create and change labels, and the order both sides show.

import { z } from "zod";
import { Id, Timestamp } from "#shared/base.ts";

/** `#rrggbb`, lowercase hex. */
const LabelColor = z.string().regex(/^#[0-9a-f]{6}$/);

export const LabelName = z.string().trim().min(1).max(32);

/**
 * A named, colored tag, like a GitHub issue label: global, for every space, or of one space. The list of a space is
 * its own labels plus the global ones it does not shadow, see `resolveSpaceLabels`: the names a task there may carry,
 * with a color and a place for each. A name is unique within a space and unique among the global labels, nothing
 * more: two spaces may hold the same name and neither learns of the other, and a space label may take a global name.
 * It then shadows the global one in that space: its color, its place, and its rename win there, and nothing else
 * changes. That is how a space overrides a global label. An admin manages the global labels; a manager the space's;
 * an editor puts both on tasks. A new database has three globals, `urgent`, `paused`, and `cancelled`; a new space
 * has none of its own.
 * - A task carries its labels as names and keeps them through a move and a delete: the list constrains what an
 *   editor adds, not what a task holds. A name the list does not have shows in grey after the known ones; a task keeps
 *   or drops it but never adds one, and a label of that name created later gives it a color and a place again.
 * - Renaming a label renames it on every task that carries it, of the space, or, for a global one, of every space
 *   that does not shadow it, in the same write; `updatedAt` does not move, no event.
 * - There is no way to make a space's label global: an admin creates the global one, and the space deletes its own.
 * There is no priority field: a space that wants one adds labels such as `urgent` or `low` and puts them first.
 */
export const Label = z.object({
	id: Id,
	spaceId: Id.nullable(), // null: global; never changes
	name: LabelName, // unique within the space, or among the global labels; exact match
	color: LabelColor,
	// The place in every list and on every task: smaller first, ties by name. One line for the global labels and the
	// space's, so a space label goes before a global one with a smaller number. Any integer; typed by the user.
	position: z.int(),
	createdAt: Timestamp,
});
export type Label = z.infer<typeof Label>;

/**
 * The create body. A name the space's own labels have, or for a global label another global one has, is rejected; a
 * global name is free for a space label, which then shadows it. Without `position` the label goes last: the highest
 * position its space sees, the global ones included, plus one.
 */
export const NewLabel = z.object({ name: LabelName, color: LabelColor, position: z.int().optional() });
export type NewLabel = z.infer<typeof NewLabel>;

/** Only the given fields change. A new name is applied to the tasks too, and is checked as in `NewLabel`. */
export const LabelPatch = z.object({
	name: LabelName.optional(),
	color: LabelColor.optional(),
	position: z.int().optional(),
});
export type LabelPatch = z.infer<typeof LabelPatch>;

/**
 * The list of a space out of `labels`, any set that holds its own and the global ones: the space's labels plus the
 * global ones whose name the space does not have, by position, then name. For null, the global list. This is the
 * order every list of labels and the badges on a task follow; the names in grey come after it, sorted.
 */
export function resolveSpaceLabels(labels: Label[], spaceId: number | null): Label[] {
	const own = labels.filter((label) => label.spaceId === spaceId);
	const shadowed = new Set(own.map((label) => label.name));
	const globals = spaceId === null ? [] : labels.filter((label) => label.spaceId === null && !shadowed.has(label.name));
	return [...own, ...globals].sort((a, b) => a.position - b.position || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
