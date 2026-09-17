import { Group, Input } from "@mantine/core";
import { useClickOutside } from "@mantine/hooks";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

/** The folded line and the form's comment box say the same words, so the click opens what it promised. */
export const COMMENT_PLACEHOLDER = "Add a comment or update the task...";

type Props = {
	/** Shown at the right end of the folded line only: the open form is for writing, and it takes the full width. */
	aside?: ReactNode;
	children: (props: { onTouched: (touched: boolean) => void; onSent: () => void }) => ReactNode;
};

/**
 * Keeps the update form folded to one input-like line until the user clicks it: the activity is read far more often
 * than written to. A click outside folds it back only while the form reports itself untouched, so a draft is never
 * folded away; a successful send folds it too, so the next open starts fresh.
 */
export function ComposerFold({ aside, children }: Props) {
	const [opened, setOpened] = useState(false);
	const touched = useRef(false);
	const onTouched = useCallback((value: boolean) => {
		touched.current = value;
	}, []);
	// A picker's dropdown, the "More" menu, and the move modal render in a portal: outside the form's node, part of it.
	// Only mousedown, not the default touchstart: a tap on a phone fires it, a scroll does not, so reading the activity
	// on a phone keeps the form open.
	const ref = useClickOutside<HTMLDivElement>(
		(event) => {
			if (touched.current || (event.target instanceof Element && event.target.closest("[data-portal]") !== null)) return;
			setOpened(false);
		},
		["mousedown"],
		undefined,
		opened,
	);
	useEffect(() => {
		if (opened) ref.current?.querySelector("textarea")?.focus();
	}, [opened, ref]);
	if (!opened) {
		return (
			<Group gap="xs" wrap="nowrap" align="flex-start">
				<Input component="button" type="button" pointer flex={1} onClick={() => setOpened(true)}>
					<Input.Placeholder>{COMMENT_PLACEHOLDER}</Input.Placeholder>
				</Input>
				{aside}
			</Group>
		);
	}
	return <div ref={ref}>{children({ onTouched, onSent: () => setOpened(false) })}</div>;
}
