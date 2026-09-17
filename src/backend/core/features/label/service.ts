import { z } from "zod";
import { Label, type LabelPatch, type NewLabel, resolveSpaceLabels } from "#shared/label.ts";
import type { Core } from "../../core.ts";
import { InvalidOperationError, NotFoundError } from "../../errors.ts";

const COLUMNS = "id, space_id AS spaceId, name, color, position, created_at AS createdAt";

/**
 * Owner of the `labels` table and of the names in `task_labels`: a rename rewrites them. Reads come from `labels`, a
 * copy of the table; see `updateLabelsCache`.
 */
export class LabelService {
	/** Every label: the global ones first, then a space's after another's, each list by position, then name. */
	private labels: Label[] = [];

	constructor(private readonly core: Core) {}

	/** Fill the copy from the table. Core calls it after migrations, and a write calls it again once its transaction commits. */
	updateLabelsCache(): void {
		this.labels = z
			.array(Label)
			.parse(this.core.db.query(`SELECT ${COLUMNS} FROM labels ORDER BY space_id IS NOT NULL, space_id, position, name`).all());
	}

	/** The global labels and those of the given spaces, in the order of the copy: the rows, before any shadowing. */
	listLabels(spaceIds: Iterable<number>): Label[] {
		const spaces = new Set(spaceIds);
		return this.labels.filter((label) => label.spaceId === null || spaces.has(label.spaceId));
	}

	/** The list of a space, what a task there may carry, or the global list for null; see `resolveSpaceLabels`. */
	listSpaceLabels(spaceId: number | null): Label[] {
		return resolveSpaceLabels(this.labels, spaceId);
	}

	/** The label by id, global or from any space. */
	getLabel(labelId: number): Label {
		const label = this.labels.find((label) => label.id === labelId);
		if (label === undefined) throw new NotFoundError(`No label ${labelId}`);
		return label;
	}

	/** Add a label to the space's list or, for null, the global one. A name the list has is an InvalidOperationError. */
	createLabel(spaceId: number | null, input: NewLabel): Label {
		this.assertNameFree(spaceId, input.name);
		const { lastInsertRowid } = this.core.db
			.query("INSERT INTO labels (space_id, name, color, position, created_at) VALUES ($spaceId, $name, $color, $position, $now)")
			.run({
				spaceId,
				name: input.name,
				color: input.color,
				position: input.position ?? Math.max(0, ...this.listSpaceLabels(spaceId).map((label) => label.position)) + 1,
				now: new Date().toISOString(),
			});
		this.updateLabelsCache();
		return this.getLabel(Number(lastInsertRowid));
	}

	/**
	 * Change the given fields; the rest stay. A new name is renamed on the tasks that carry it, of the space, or, for a
	 * global label, of every space that has no label of the old name, in the same transaction; their `updatedAt`
	 * stays, no event. A name another label of the list has is an InvalidOperationError.
	 */
	updateLabel(labelId: number, patch: LabelPatch): Label {
		const label = this.getLabel(labelId);
		const next = { ...label, ...patch };
		if (next.name !== label.name) this.assertNameFree(label.spaceId, next.name);
		this.core.db.transaction(() => {
			this.core.db
				.query("UPDATE labels SET name = $name, color = $color, position = $position WHERE id = $labelId")
				.run({ name: next.name, color: next.color, position: next.position, labelId });
			// OR REPLACE: a task that carries the new name too, in grey or as a global one shadowed from now on, keeps one row.
			if (next.name !== label.name) {
				// A space with its own label of the name shadows the global one, so its tasks mean that label, not this.
				const tasks =
					label.spaceId === null
						? "SELECT id FROM tasks WHERE space_id NOT IN (SELECT space_id FROM labels WHERE space_id IS NOT NULL AND name = $name)"
						: "SELECT id FROM tasks WHERE space_id = $spaceId";
				this.core.db
					.query(`UPDATE OR REPLACE task_labels SET name = $to WHERE name = $name AND task_id IN (${tasks})`)
					.run(
						label.spaceId === null
							? { name: label.name, to: next.name }
							: { name: label.name, to: next.name, spaceId: label.spaceId },
					);
			}
		})();
		this.updateLabelsCache();
		return this.getLabel(labelId);
	}

	/** Delete the label from its list; the tasks keep its name, shown in grey from now on. */
	deleteLabel(labelId: number): void {
		this.getLabel(labelId);
		this.core.db.query("DELETE FROM labels WHERE id = $labelId").run({ labelId });
		this.updateLabelsCache();
	}

	/** A name is unique within its list, the space's or the global one, exact match. */
	private assertNameFree(spaceId: number | null, name: string): void {
		if (this.labels.some((label) => label.spaceId === spaceId && label.name === name)) {
			throw new InvalidOperationError(`A label "${name}" already exists`);
		}
	}
}
